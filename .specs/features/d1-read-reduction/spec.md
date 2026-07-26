# Spec — Redução de rows read no D1

**Status**: Specify
**Criado**: 2026-07-26
**Escopo**: Large (schema/migration + reescrita de queries + camada de cache)

## Problema

O plano free do D1 permite 5M rows read/dia. O database `shift90d` está em **7.54M / 5M** com
**47.72k queries** e apenas **438 kB de dados totais**.

Média = **~158 rows read por query** em um banco com ~41 usuários e ~1.1k point_events
(fonte: `backups/points-2026-04-21.json`). Um banco desse tamanho não deveria passar de
~5 rows/query. O gargalo é estrutural, não volume de tráfego.

> Contagens exatas de `posts`/`likes`/`comments` não foram verificadas: o token local
> não tem escopo D1 (`wrangler d1 execute --remote` → 7403). As estimativas abaixo usam
> o backup de pontos e o tamanho do DB.

## Causas identificadas

### RC1 — Zero índices secundários (causa raiz multiplicadora)

`migrations/0000_*.sql` cria apenas `users_email_unique` e `sessions_token_unique`.
Nenhum índice em foreign key ou coluna de ordenação. Ausentes:

| Tabela | Coluna(s) | Usado por |
|---|---|---|
| `posts` | `user_id` | `getUserPosts`, `getUserActivity`, `createPost` |
| `posts` | `created_at` | `ORDER BY` do feed |
| `likes` | `post_id` | join do feed, `toggleLike` |
| `likes` | `user_id`, `(user_id, post_id)` | `likedPostIds`, `toggleLike` |
| `comments` | `post_id` | join do feed, `getCommentsByPostId` |
| `point_events` | `user_id` | ranking, `getUserById`, `getUserActivity` |
| `point_events` | `(user_id, event_date, source)` | `deletePost`, activity |
| `point_events` | `(source, event_date)` | `/sabados` |
| `sessions`, `accounts` | `user_id` | Better Auth |

Consequência: `posts LEFT JOIN likes ON likes.post_id = posts.id` sem índice vira nested
loop (ou índice transiente automático) — o SQLite lê a tabela `likes` inteira para
resolver o join. Rows read por query de feed ≈ `|posts| × |likes|` no pior caso.

### RC2 — `getFeed` lê o dataset inteiro em toda requisição

`src/lib/db/queries/posts.ts:46`:

1. **Ranking global por request** (linhas 58-80): `SELECT user_id, SUM(points_delta) FROM point_events GROUP BY user_id` — full scan de `point_events`, sem `WHERE`, em *toda* carga de feed. O dense ranking é montado com loop O(n²) em JS.
2. **Counts agregados sem `WHERE`** (linhas 83-109): `GROUP BY posts.id` + `ORDER BY created_at DESC` + `LIMIT/OFFSET`. O SQLite precisa materializar o join `posts × likes × comments` completo e agregar **antes** de aplicar o limit. Paginação não reduz custo: page 5 custa o mesmo que page 0.
3. **`likedPostIds` sem filtro de página** (linhas 116-119): busca *todos* os likes históricos do usuário, quando só interessam os ≤10 posts da página.

### RC3 — Infinite scroll multiplica o full scan

`FeedClient.tsx:37` chama `/api/posts/feed?page=N` a cada intersecção do sentinel. Cada
página repaga o custo integral de RC2. Rolar 5 páginas = 5 full scans. `router.refresh()`
após criar post re-executa o SSR da page 0.

### RC4 — `/profile` faz 4 chamadas pesadas, sequenciais, com ranking duplicado

`src/app/profile/page.tsx`:

- `getUserById` → `users LEFT JOIN point_events` (full scan de point_events)
- `getUserPosts` → **recomputa o ranking global inteiro** + join sem índice
- `getUserActivity` → 4 queries separadas; a do streak (`point-events.ts:227`) lê **todos** os posts do usuário para calcular datas distintas em JS
- `getRanking` → `users LEFT JOIN point_events` full scan **de novo**

São ~8 queries e 2 full scans de `point_events` por visualização de perfil. Nada em `Promise.all`.

### RC5 — Tudo `force-dynamic`, nenhuma camada de cache

Todas as páginas declaram `export const dynamic = 'force-dynamic'`. `open-next.config.ts`
usa `defineCloudflareConfig()` sem override → incremental cache no-op. O binding
`NEXT_TAG_CACHE_D1` aponta para `shift90d-cache`, que tem **0 tabelas** (binding morto).

O ranking é idêntico para todos os usuários e muda no máximo quando alguém posta, mas é
recalculado por request por usuário. Único cache existente: `Cache-Control: private,
max-age=60` em `/api/posts/feed`.

### RC6 — Writes leem mais do que precisam

- `createPost` (`posts.ts:250`): busca **todos** os posts do usuário para contar os de hoje em JS.
- `getUserActivity`: 4 round trips onde 1-2 resolveriam.

## Requisitos

| ID | Requisito | Verificação |
|---|---|---|
| R1 | Todas as FKs e colunas de ordenação usadas em `WHERE`/`JOIN`/`ORDER BY` têm índice | `EXPLAIN QUERY PLAN` sem `SCAN TABLE` nas queries de feed/ranking/profile |
| R2 | `getFeed` lê O(page_size) rows, não O(dataset) | rows read de uma carga de feed proporcional ao limit |
| R3 | Ranking não é recomputado por request de feed | `getFeed` não agrega `point_events` |
| R4 | `/profile` não computa o ranking global duas vezes | 1 única fonte de ranking por request |
| R5 | Paginação de feed com custo constante por página | page N custa o mesmo que page 0 |
| R6 | `createPost` conta posts do dia via `COUNT(*)` com `WHERE`, sem trazer rows | 1 row lida |
| R7 | Ranking servido de cache com invalidação nos writes de pontos | estratégia definida em design.md |
| R8 | Rows read diários projetados < 1M (margem 5x sobre o limite free) | medição no dashboard após deploy |
| R9 | Semântica preservada: dense ranking, `points = SUM(points_delta)`, `active_days = COUNT(DISTINCT event_date WHERE source='post')` | paridade de valores antes/depois |

## Fora de escopo

- Upgrade para o plano pago do D1 (mitiga sintoma, não causa)
- Migração de banco (Hyperdrive/Postgres)
- Redesign de UI/UX do feed

## Rastreabilidade

RC1 → R1 · RC2 → R2, R3, R5 · RC3 → R2, R5, R7 · RC4 → R4, R7 · RC5 → R7 · RC6 → R6
