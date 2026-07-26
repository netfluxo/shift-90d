# Design — Redução de rows read no D1

**Status**: Design
**Spec**: [spec.md](./spec.md)

## Método de validação

Nada aqui é estimativa. Duas fontes, ambas sobre **dados de produção**:

1. **`rows_read` do próprio D1** — `wrangler d1 execute DB --remote --json` retorna
   `meta.rows_read` por statement. É exatamente a métrica faturada.
2. **Plano e custo local** — `wrangler d1 export DB --remote` (dump real, 388 kB) carregado
   em SQLite, medido com `.stats on` / `.eqp on`. Usado para o "depois", que exige DDL que
   ainda não está em produção.

Volume real (medido, muito menor que o que o backup de abril sugeria):

| Tabela | Rows |
|---|---|
| users | 60 |
| posts | 392 |
| likes | 176 |
| comments | 8 |
| point_events | 389 |
| sessions | 180 |
| accounts | 60 |

## Evidência das causas

### Custo real de um SSR de `/feed` — `rows_read` do D1

| Query | rows_read |
|---|---|
| `point_events` GROUP BY (ranking, sem WHERE) | **778** |
| join `posts × likes × comments` GROUP BY + ORDER BY + LIMIT 11 | **2372** |
| `likedPostIds` (todos os likes do usuário) | **176** |
| sessão Better Auth (token + user, ambos indexados) | **2** |
| **Total** | **~3.330** |

`posts` tem 392 rows e a página mostra 10 — a query lê **6× a tabela inteira**. Plano:

```
SCAN p USING INDEX sqlite_autoindex_posts_1
SEARCH l  USING AUTOMATIC COVERING INDEX (post_id=?) LEFT-JOIN
SEARCH cm USING AUTOMATIC COVERING INDEX (post_id=?) LEFT-JOIN
USE TEMP B-TREE FOR ORDER BY
```

`AUTOMATIC COVERING INDEX` é o SQLite construindo índice temporário em memória por falta de
`idx` em `likes.post_id`/`comments.post_id` — lê as tabelas inteiras e descarta o índice.

Outras páginas (`rows_read` real): `/ranking` = **939** · `/profile` = **~3.890**
(`getUserById` 390 + `getUserPosts` 778+613 + `getUserActivity` 389+389+393 + `getRanking` 937).

7.54M ÷ ~3.300 ≈ **2.300 page views** para estourar os 5M/dia. Com 60 usuários e scroll
infinito (cada página de scroll repaga os 3.330) mais `router.refresh()` a cada post, fecha.

### Só índices resolve? **Não** — e isso corrige a hipótese inicial

Com os índices aplicados sobre o dump real, a query atual do feed:

```
Autoindex Inserts:     182 → 0        (irrelevante: likes tem só 176 rows)
Fullscan Steps:        391 → 391      ❌ inalterado
Virtual Machine Steps: 26928 → 25129  ❌ -6%
```

Com apenas 176 likes e 8 comments, o autoindex custa quase nada — o gargalo é o
`GROUP BY posts.id` + `ORDER BY created_at` + `LIMIT`, que obriga a agregar `posts` inteira
antes do limit. **A migration de índices sozinha não tira o app do estouro.**

### E a reescrita sem índices? **Pior ainda**

`rows_read` real da query reescrita rodada contra produção **sem** os índices: **4.755**
(vs. 2.372 da atual). Sem `idx_likes_post`, cada subquery correlacionada varre `likes`
inteira por post: 11 × 176. As duas mudanças são **acopladas** — a reescrita nunca pode ir
ao ar antes dos índices.

### Índices + reescrita — validado sobre o dump real

| Variante | VM steps | Fullscan | Autoindex |
|---|---|---|---|
| atual, sem índice (= 2.372 rows_read reais) | 26.928 | 391 | 182 |
| atual, com índice | 25.129 | 391 | 0 |
| reescrita, sem índice (= 4.755 rows_read reais) | 22.624 | 4.318 | 0 |
| **reescrita, com índice** | **642** | **0** | **0** |

42× menos VM steps, zero fullscan, zero sort. A correlação entre `Fullscan Steps` e
`rows_read` real se confirma nos dois pontos medidos remotamente (4.318 ↔ 4.755).

### Demais queries, sobre o dump real

| Query | Antes (vm/fullscan) | Depois (vm/fullscan) |
|---|---|---|
| ranking `point_events` GROUP BY | 6.121 / 388 | eliminada |
| `getRanking` | 8.193 / 59 | **493 / 0** (via `user_points`) |
| `getUserById` | — / 390 rows_read reais | **24 / 0** |
| streak (todos os posts do usuário) | 1.270 / 391 | **62 / 0** (índice + janela 100d) |
| `createPost` (todos os posts do usuário) | 1.219 / 391 | **21 / 0** (`COUNT(*)`) |
| `likedPostIds` | 591 / 175 | eliminada (vira `EXISTS` por post) |

### Query reescrita — validada

```sql
WITH page AS (
  SELECT id, user_id, media_url, media_type, caption, created_at
  FROM posts
  WHERE created_at < :cursorTs OR (created_at = :cursorTs AND id < :cursorId)
  ORDER BY created_at DESC, id DESC
  LIMIT :limit + 1
)
SELECT pg.*, u.name, u.avatar_url,
  (SELECT COUNT(*) FROM likes l    WHERE l.post_id = pg.id) AS likes_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = pg.id) AS comments_count,
  EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = pg.id AND l2.user_id = :me) AS is_liked
FROM page pg JOIN users u ON u.id = pg.user_id;
```

```
SEARCH posts USING INDEX idx_posts_created_id (created_at<?)
SEARCH l  USING COVERING INDEX idx_likes_post (post_id=?)
SEARCH c  USING COVERING INDEX idx_comments_post (post_id=?)
SEARCH l2 USING COVERING INDEX idx_likes_user_post (user_id=? AND post_id=?)
---
Fullscan Steps:        1547 → 0
Sort Operations:          1 → 0
Autoindex Inserts:     6146 → 0
Virtual Machine Steps: 240145 → 908      (264× menor)
Page cache misses:      256 → 36
```

Zero fullscan, zero sort, custo constante por página independente da profundidade.

### Ranking via `user_points` — validado

| Versão | VM Steps |
|---|---|
| `users LEFT JOIN point_events GROUP BY` (com índice) | 24.416 |
| `user_points JOIN users WHERE points > 0` | 1.039 |

23× menor, e o resultado é 41 rows fixas independente do histórico de eventos.

## Arquitetura da solução

### Fase 1 — Índices (`migrations/0002_*.sql`)

```sql
CREATE INDEX idx_posts_created_id      ON posts(created_at DESC, id DESC);
CREATE INDEX idx_posts_user_created    ON posts(user_id, created_at DESC);
CREATE INDEX idx_likes_post            ON likes(post_id);
CREATE INDEX idx_likes_user_post       ON likes(user_id, post_id);   -- NÃO unique (ver risco #3)
CREATE INDEX idx_comments_post         ON comments(post_id);
CREATE INDEX idx_pe_user               ON point_events(user_id);
CREATE INDEX idx_pe_user_date_source   ON point_events(user_id, event_date, source);
CREATE INDEX idx_pe_source_date        ON point_events(source, event_date);
CREATE INDEX idx_sessions_user         ON sessions(user_id);
CREATE INDEX idx_accounts_user         ON accounts(user_id);
ANALYZE;
```

Declarados também em `schema.ts` via `sqliteTable(..., (t) => [index(...)])` para o
drizzle-kit não tentar recriá-los.

### Fase 2 — `user_points` materializada por trigger (`migrations/0003_*.sql`)

```sql
CREATE TABLE user_points (
  user_id     TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  points      INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_user_points_points ON user_points(points DESC);
```

Três triggers em `point_events` (AFTER INSERT / DELETE / UPDATE) + um em `users`
(AFTER INSERT, cria a row zerada). Cada trigger **recomputa** os dois agregados do usuário
afetado a partir de `point_events` e faz upsert:

```sql
CREATE TRIGGER point_events_ai AFTER INSERT ON point_events BEGIN
  INSERT INTO user_points (user_id, points, active_days) VALUES (
    NEW.user_id,
    (SELECT COALESCE(SUM(points_delta),0) FROM point_events WHERE user_id = NEW.user_id),
    (SELECT COUNT(DISTINCT event_date) FROM point_events
      WHERE user_id = NEW.user_id AND source = 'post')
  ) ON CONFLICT(user_id) DO UPDATE
    SET points = excluded.points, active_days = excluded.active_days;
END;
```

**Por que recomputar em vez de incrementar**: `active_days = COUNT(DISTINCT event_date)`
não é decrementável sem consultar os outros eventos da mesma data. Recompute custa ~30 rows
lidas por *write* (writes: 3.27k/100k, folga de 30×) e é imune a drift por construção.

**Por que trigger em vez de código de app**: `point_events` é escrito por 4 caminhos
(`createPost`, `deletePost`, `/api/sabados` POST e DELETE) mais `scripts/seed.sql` e SQL
manual via `wrangler d1 execute`. Trigger no banco não pode ser furado por nenhum deles.
`db.batch()` do D1 é transacional ("Batched statements are SQL transactions"), mas só cobre
os caminhos que alguém lembrar de atualizar.

`point_events` permanece a **fonte de verdade** — `user_points` é derivada e reconstruível
via `scripts/rebuild-user-points.sql`. Isso mantém a intenção do `SPEC_DEVIATION` em
`schema.ts:3` (que precisa ter o comentário atualizado).

**Paridade validada sobre o dump real de produção**: após insert de evento, insert de
compensação `-1` na mesma data, insert+delete de `saturday_attendance`, `UPDATE` trocando o
`user_id` do evento e criação de um usuário novo, a comparação materializado × agregação
retornou **0 divergências** nos 60 usuários, e o usuário novo recebeu row zerada via
trigger em `users`.

### Fase 3 — Reescrita das queries

| Função | Mudança | Rows read (antes → depois) |
|---|---|---|
| `getFeed` | CTE keyset + subqueries correlacionadas; ranking vem de `user_points` | 3.326 → ~95 |
| `getUserPosts` | mesmo padrão, `WHERE user_id=?` com `idx_posts_user_created`; sem recomputar ranking | 1.391 → ~80 |
| `getRanking` | `user_points JOIN users WHERE points>0` | 937 → 60 |
| `getUserById` | `users LEFT JOIN user_points` (LEFT: usuário sem row) | 390 → 2 |
| `getUserActivity` | 4 queries → 2; `totalPoints`/`activeDays` de `user_points`; janela de 100 dias no streak | 1.171 → ~35 |
| `createPost` | `SELECT COUNT(*) ... WHERE user_id=? AND created_at BETWEEN ?` | 392 → 1 |
| `/profile` (page) | `Promise.all` + ranking computado 1× e reusado | 2 full scans → 0 |

**Não mexer no cálculo de streak em JS.** Medi a alternativa
(`SELECT DISTINCT date(created_at,'unixepoch','-03:00')`): 184 → 532 VM steps, *pior*, e
mudaria a semântica de fuso (`date(...,'-03:00')` fixo vs `Intl` `America/Sao_Paulo`). Só
a janela temporal entra, preservando `getDateInBrazil`.

### Fase 4 — Cache

Com `user_points`, **nenhuma infra de cache nova é necessária**. Não habilitar
`r2IncrementalCache`/KV — mantém a decisão documentada em `open-next.config.ts` (evita o
401 no CI). O binding morto `NEXT_TAG_CACHE_D1` → `shift90d-cache` (0 tabelas) pode ser
removido do `wrangler.jsonc`.

## Projeção

Rows read por page view — "antes" medido no D1, "depois" medido no dump real:

| Página | Antes | Depois | Fator |
|---|---|---|---|
| `/feed` (SSR page 0) | 3.330 | ~95 | 35× |
| `/feed` (cada página do scroll) | 3.330 | ~95 | 35× |
| `/profile` | 3.890 | ~150 | 26× |
| `/ranking` | 939 | 62 | 15× |

No mesmo mix de tráfego: **7.54M → ~230k rows read/dia** (4,6% do limite free). Margem para
~50k page views/dia — ~800 por usuário na base atual de 60.

## Riscos e novos gaps

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| 1 | ~~Token local sem escopo D1 (`7403`)~~ | **Resolvido** | `npx wrangler login` feito; escopo `d1:write` ativo e acesso remoto confirmado |
| 2 | `CREATE TRIGGER` no D1 remoto: bug conhecido — `begin` minúsculo falha com `incomplete input [code: 7500]` mas funciona em `--local` | **Alta** | `BEGIN`/`END` maiúsculos; aplicar em `--local` **e** `--remote`; verificar com `SELECT name FROM sqlite_master WHERE type='trigger'` |
| 3 | `CREATE UNIQUE INDEX likes(user_id,post_id)` abortaria a migration se houvesse duplicata | **Baixa** (era Alta) | **Verificado em produção: 0 duplicatas.** Pode ser `UNIQUE`, o que também fecha a race de `toggleLike` (read-then-write). Exige `onConflictDoNothing` no insert de `toggleLike` na mesma mudança |
| 3b | **A reescrita das queries é inútil ou nociva sem os índices** (medido: 4.755 vs 2.372 rows_read) | **Alta** | Ordem imposta nas tasks: índices (A1/A4) antes de C2. Nunca deployar C2 sem A4 aplicado |
| 4 | drizzle-kit não gera nem versiona triggers | Média | Migration de trigger escrita à mão; triggers ficam fora do snapshot e o `generate` futuro não os derruba. Documentar em `CLAUDE.md` |
| 5 | Usuário criado pelo Better Auth sem row em `user_points` | Média | Trigger `AFTER INSERT ON users` + `LEFT JOIN` com `COALESCE` em todas as leituras |
| 6 | Keyset quebra o contrato `/api/posts/feed?page=N`. Clientes com a página antiga aberta e respostas cacheadas pelo service worker (Serwist) chamam `page=` durante o deploy | Média | Rota aceita `cursor` **e** `page` (fallback OFFSET) por um deploy; remover depois |
| 7 | `posts.created_at` em segundos → empates possíveis (seed/bulk) causariam post pulado/duplicado no scroll | Média | Cursor composto `(created_at, id)` — validado, `Sort Operations: 0` |
| 8 | **Zero testes no repo** (codegraph confirma "no covering tests found" em `getFeed`/`getUserById`) e a mudança toca a lógica de pontos | **Alta** | `scripts/verify-points-parity.sql` comparando `user_points` × agregação, para rodar pós-migration em local e remoto |
| 9 | Write amplification: 10 índices + 1 upsert por trigger | Baixa | Writes hoje 3.27k/100k. Margem 30× |
| 10 | Sem `ANALYZE`, o planner pode ignorar índices novos | Baixa | `ANALYZE` no fim da migration |
| 11 | `COUNT(DISTINCT l.id)` → `COUNT(*)` em subquery: mudança de forma de contagem | Baixa | Equivalente (o `DISTINCT` só existia por causa do join cartesiano); parity check no UAT |
| 12 | Assinaturas mudam: `getFeed` (2 callers), `getUserPosts` (2 callers), `getUserActivity` (2 callers) | Baixa | Blast radius mapeado; `npm run lint` + `tsc` cobrem |

## Decisões

| ID | Decisão | Razão |
|---|---|---|
| D1 | `user_points` materializada mantida por **trigger SQLite**, não por código de app | Imune a drift; cobre seed e SQL manual |
| D2 | Trigger **recomputa** agregados em vez de incrementar | `COUNT(DISTINCT event_date)` não é decrementável; custo em write é irrelevante |
| D3 | Keyset `(created_at, id)` com fallback `page` temporário | Custo constante por página sem quebrar clientes em voo |
| D4 | Índice `likes(user_id, post_id)` **UNIQUE**, com `onConflictDoNothing` em `toggleLike` | 0 duplicatas verificadas em prod; o unique fecha a race do read-then-write |
| D5 | Streak continua calculado em JS via `getDateInBrazil` | Alternativa SQL medida como pior e muda semântica de fuso |
| D6 | Nenhum incremental cache do OpenNext | `user_points` resolve; preserva a decisão do `open-next.config.ts` |
| D7 | Migrations separadas 0002 (índices) / 0003 (materialização), mas **0002 sozinha não é solução** | Medido: índices sem reescrita dão −6% no feed. 0002 vai primeiro por ser pré-requisito da reescrita, não por resolver. O alívio real só chega com o Bloco C no ar |

## Fontes

- [D1 pricing — como rows read são contados](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 Workers Binding API — batch é transacional](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [workers-sdk#10998 — `begin` minúsculo em trigger falha no D1 remoto](https://github.com/cloudflare/workers-sdk/issues/10998)
- [workers-sdk#4998 — trigger funciona no D1 local mas não no cloud](https://github.com/cloudflare/workers-sdk/issues/4998)
