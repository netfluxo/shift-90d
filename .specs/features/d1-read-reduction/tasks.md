# Tasks — Redução de rows read no D1

**Spec**: [spec.md](./spec.md) · **Design**: [design.md](./design.md)
**Status**: Execute concluído — migrations 0002–0005 aplicadas em produção, código na branch
`feat/d1-read-reduction`. Falta apenas D2v (medir o dashboard por 24h).

| Task | Status |
|---|---|
| A1 migration de índices | ✅ `migrations/0002_indexes.sql` |
| A2 índices no schema Drizzle | ✅ `drizzle-kit generate` sem diff |
| A3 script de planos | ✅ `scripts/explain-hot-queries.sql` |
| A4 aplicar em produção | ✅ 11 índices, verificado |
| A5 `toggleLike` idempotente | ✅ `onConflictDoNothing` |
| B1 tabela + triggers | ✅ 4 triggers em produção |
| B2 script de paridade | ✅ `scripts/verify-points-parity.sql`, 0 divergências |
| B3 rebuild | ✅ `npm run db:rebuild-points:remote` |
| B4 `user_points` no schema | ✅ + `SPEC_DEVIATION` atualizado |
| B5 documentar triggers | ✅ `CLAUDE.md` |
| B6 aplicar em produção | ✅ paridade 0 |
| C1 `getRanking`/`getUserById` | ✅ 937→81, 390→2 |
| C2 `getFeed` keyset | ✅ 2.372→22 |
| C3 `getUserPosts` | ✅ 613→22 |
| C4 rota com cursor + fallback | ✅ |
| C5 `FeedClient` com cursor | ✅ |
| C6 `getUserActivity` | ✅ 4 queries→3, 1.171→15 |
| C7 `createPost` | ✅ 392→2 |
| C8 perfis paralelizados | ✅ ranking 1× por request |
| C9 binding morto removido | ✅ `NEXT_TAG_CACHE_D1` |
| — migration 0004 (`ANALYZE`) | ✅ não prevista; ver design.md |
| — migration 0005 (índice parcial `/sabados`) | ✅ não prevista; 390→0 |
| D1v paridade funcional | ✅ ranking, counts, is_liked e keyset conferidos sobre dados reais |
| D2v medição 24h no dashboard | ⏳ pendente |

Gate global (antes de qualquer push): `npm run lint` + `npx tsc --noEmit` + `npm run build`.

---

## Bloco A — Índices (pré-requisito do Bloco C, não solução isolada)

> **Medido**: índices sem a reescrita das queries dão apenas −6% no feed. E a reescrita
> **sem** os índices é pior que o estado atual (4.755 vs 2.372 rows_read). A1→A4 precisam
> estar em produção **antes** de C2 ir ao ar, e o alívio real só aparece com os dois.

### A1. Migration de índices
- **O quê**: `migrations/0002_indexes.sql` com os 10 `CREATE INDEX` + `ANALYZE` do design.md (Fase 1). `likes(user_id, post_id)` como **UNIQUE** (D4 — 0 duplicatas verificadas em prod)
- **Onde**: `migrations/0002_indexes.sql`, `migrations/meta/_journal.json`
- **Reusa**: nomes de coluna de `migrations/0000_little_blue_marvel.sql`
- **Pronto quando**: `npm run db:migrate:local` aplica sem erro e `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'` retorna 10 rows
- **Depende de**: —

### A2. Declarar índices no schema Drizzle
- **O quê**: adicionar `index()` nas definições de `posts`, `likes`, `comments`, `pointEvents`, `sessions`, `accounts` com **exatamente** os mesmos nomes do A1
- **Onde**: `src/lib/db/schema.ts`
- **Pronto quando**: `npx drizzle-kit generate` não produz nova migration (schema e banco em sincronia)
- **Depende de**: A1

### A3. Verificar planos de query
- **O quê**: script `scripts/explain-hot-queries.sql` com `EXPLAIN QUERY PLAN` das queries de feed/ranking/profile
- **Onde**: `scripts/explain-hot-queries.sql`
- **Pronto quando**: nenhuma saída contém `AUTOMATIC COVERING INDEX` (R1)
- **Depende de**: A1

### A4. Aplicar em produção
- **O quê**: `npm run db:migrate:remote` (OAuth já ativo com `d1:write`)
- **Pronto quando**: `wrangler d1 execute DB --remote --command "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"` = 10
- **Depende de**: A1
- **Rollback**: `DROP INDEX` — não destrutivo

### A5. `toggleLike` idempotente
- **O quê**: `onConflictDoNothing()` no insert de `likes`, para o `UNIQUE(user_id, post_id)` não gerar 500 na race do read-then-write
- **Onde**: `src/lib/db/queries/likes.ts`
- **Pronto quando**: dois POSTs simultâneos em `/api/likes` para o mesmo post não retornam erro
- **Depende de**: A1

---

## Bloco B — Materialização de pontos

### B1. Tabela `user_points` + triggers
- **O quê**: `migrations/0003_user_points.sql` — tabela, índice, 3 triggers em `point_events` (AI/AD/AU) + 1 em `users` (AI), e o `INSERT ... ON CONFLICT` de backfill. `BEGIN`/`END` **maiúsculos** (risco #2)
- **Onde**: `migrations/0003_user_points.sql`, `migrations/meta/_journal.json`
- **Pronto quando**: aplicado em `--local`; `SELECT name FROM sqlite_master WHERE type='trigger'` = 4 rows; `SELECT COUNT(*) FROM user_points` = `SELECT COUNT(*) FROM users`
- **Depende de**: A1

### B2. Script de paridade
- **O quê**: `scripts/verify-points-parity.sql` — compara `user_points` com a agregação sobre `point_events` e retorna a contagem de divergências (query já validada, retornou 0)
- **Onde**: `scripts/verify-points-parity.sql`
- **Pronto quando**: retorna `0` em local após B1 e após exercitar create/delete de post e sábado
- **Depende de**: B1

### B3. Rebuild/reparo
- **O quê**: `scripts/rebuild-user-points.sql` (mesmo `INSERT ... ON CONFLICT` do backfill, isolado) + entrada em `package.json` (`db:rebuild-points:local` / `:remote`)
- **Onde**: `scripts/rebuild-user-points.sql`, `package.json`
- **Pronto quando**: rodar após corromper `user_points` manualmente restaura B2 para 0
- **Depende de**: B1

### B4. `user_points` no schema Drizzle
- **O quê**: adicionar `userPoints` em `schema.ts`; atualizar o comentário `SPEC_DEVIATION` (linhas 3-8) explicando que `point_events` continua fonte de verdade e `user_points` é derivada por trigger
- **Onde**: `src/lib/db/schema.ts`
- **Pronto quando**: `drizzle-kit generate` não gera migration nova; triggers não aparecem no snapshot (esperado — risco #4)
- **Depende de**: B1

### B5. Documentar o contrato dos triggers
- **O quê**: seção em `CLAUDE.md` — `user_points` é mantida por trigger, drizzle-kit não versiona triggers, qualquer recriação de banco do zero precisa de `0003`
- **Onde**: `CLAUDE.md`
- **Depende de**: B1

### B6. Aplicar em produção — **ação do usuário**
- **O quê**: `npm run db:migrate:remote` e depois `wrangler d1 execute DB --remote --file=./scripts/verify-points-parity.sql`
- **Pronto quando**: 4 triggers presentes no remoto e paridade = 0
- **Depende de**: B1, B2, A4

---

## Bloco C — Reescrita das queries

### C1. `getRanking` e `getUserById` sobre `user_points`
- **O quê**: `getRanking` → `user_points JOIN users WHERE points > 0 ORDER BY points DESC LIMIT n`. `getUserById` → `users LEFT JOIN user_points` com `COALESCE(points,0)` / `COALESCE(active_days,0)` (risco #5)
- **Onde**: `src/lib/db/queries/users.ts`
- **Pronto quando**: valores idênticos aos da versão anterior para os 41 usuários; `EXPLAIN` sem `TEMP B-TREE FOR count(DISTINCT)`
- **Depende de**: B1

### C2. `getFeed` — keyset + subqueries correlacionadas
- **O quê**: substituir as 3 queries por: (1) CTE keyset paginada com subqueries de `likes_count`/`comments_count`/`is_liked` (SQL validado no design.md), (2) `getRanking` para o mapa de posição. Assinatura passa a aceitar cursor; manter parâmetro `page` para o fallback OFFSET (D3)
- **Onde**: `src/lib/db/queries/posts.ts`
- **Reusa**: `buildDenseRankingMap` (`src/lib/utils/ranking.ts`), `getRanking`
- **Pronto quando**: `EXPLAIN` com `Fullscan Steps: 0`, `Sort Operations: 0`, `Autoindex Inserts: 0`; feed devolve os mesmos posts/counts/ranking que a versão atual
- **Depende de**: A1, C1

### C3. `getUserPosts` — mesmo padrão
- **O quê**: `WHERE user_id = ?` usando `idx_posts_user_created`, subqueries correlacionadas, **sem** recomputar ranking global (recebe o mapa por parâmetro ou usa `getRanking`)
- **Onde**: `src/lib/db/queries/posts.ts`
- **Depende de**: C1, C2

### C4. Rota `/api/posts/feed` — cursor com fallback
- **O quê**: aceitar `?cursor=<ts>_<id>`; sem `cursor` e com `page`, cair no caminho OFFSET (risco #6). Retornar `nextCursor` no payload
- **Onde**: `src/app/api/posts/feed/route.ts`
- **Pronto quando**: `?page=1` e `?cursor=...` devolvem resultados coerentes; header `Cache-Control` preservado
- **Depende de**: C2

### C5. `FeedClient` usa cursor
- **O quê**: trocar o estado `page` por `cursor` vindo do `nextCursor`; SSR passa o cursor da última row da page 0
- **Onde**: `src/app/feed/FeedClient.tsx`, `src/app/feed/page.tsx`
- **Pronto quando**: scroll infinito carrega sem duplicar nem pular posts; dedupe por id mantido
- **Depende de**: C4

### C6. `getUserActivity` — 4 queries → 2
- **O quê**: `totalPoints`/`totalActiveDays` de `user_points`; `todayPosts` via `COUNT(*)` com range; streak continua em JS com `getDateInBrazil` (D5), agora com `created_at >= hoje - 100 dias`
- **Onde**: `src/lib/db/queries/point-events.ts`
- **Pronto quando**: mesmos 5 valores que a versão atual para usuários com e sem streak ativo
- **Depende de**: B1
- **Cuidado**: não alterar o algoritmo de streak (paridade R9), só a janela de leitura

### C7. `createPost` — contar sem trazer rows
- **O quê**: trocar o fetch de todos os posts do usuário por `SELECT COUNT(*) FROM posts WHERE user_id=? AND created_at >= ? AND created_at < ?` usando os limites BRT do dia (mesmo padrão de `getUserActivity`, operadores tipados do Drizzle — não `sql` cru, ver comentário em `point-events.ts:214`)
- **Onde**: `src/lib/db/queries/posts.ts`
- **Pronto quando**: primeiro post do dia dá ponto, segundo não; 1 row lida (R6)
- **Depende de**: A1

### C8. `/profile` e `/profile/[id]` — paralelizar e deduplicar ranking
- **O quê**: `Promise.all` nas 4 chamadas; `getRanking` executado 1× e o resultado usado tanto para `rankingPosition` quanto para o mapa de `getUserPosts`
- **Onde**: `src/app/profile/page.tsx`, `src/app/profile/[id]/page.tsx`
- **Pronto quando**: posição de ranking e pontos idênticos aos atuais (R4)
- **Depende de**: C1, C3, C6

### C9. Limpar binding morto
- **O quê**: remover `NEXT_TAG_CACHE_D1` → `shift90d-cache` do `wrangler.jsonc` (0 tabelas, incremental cache é no-op) e regenerar `cloudflare-env.d.ts` via `npm run cf:typegen`
- **Onde**: `wrangler.jsonc`, `cloudflare-env.d.ts`
- **Pronto quando**: `npm run build` e `npm run cf:build` passam
- **Depende de**: —

---

## Bloco D — Validação

### D1v. UAT interativo
- **O quê**: com o app rodando, comparar antes/depois: feed page 0, scroll até page 3, ranking completo, perfil próprio, perfil de outro, criar post (ponto), deletar post (compensação), adicionar/remover sábado
- **Pronto quando**: valores de pontos, active_days, posição de ranking, counts de like/comment e streak idênticos; `verify-points-parity.sql` = 0 após cada mutação
- **Depende de**: todo o Bloco C

### D2v. Medição em produção
- **O quê**: após deploy, acompanhar rows read no dashboard D1 por 24h (limite free reseta 00:00 UTC)
- **Pronto quando**: < 1M rows read/dia (R8)
- **Depende de**: D1v, A4, B6

---

## Diferido

| Item | Razão |
|---|---|
| Remover o fallback `page` de `/api/posts/feed` | Um deploy depois de C5, quando não houver mais cliente antigo em voo |
| Cache HTTP/edge para `/ranking` | `user_points` já reduz a 41 rows; reavaliar se o tráfego crescer 10× |
| Testes automatizados das queries de pontos | Repo sem infra de teste; `verify-points-parity.sql` cobre o essencial por enquanto |
