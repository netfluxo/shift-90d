# Cloudflare Migration Tasks

**Design**: `.specs/features/cloudflare-migration/design.md`
**Status**: Draft

## Gate Check Commands

Sem TESTING.md/suíte de testes no projeto (decisão do usuário: lint+build, sem introduzir testes agora).

| Gate | Comando |
|---|---|
| `quick` | `npm run lint` |
| `full` | `npm run lint && npm run build && npx opennextjs-cloudflare build` |

`Tests: none` em todas as tasks — não há coverage matrix (greenfield de testes), verificação funcional é manual (UAT) ao final.

---

## Execution Plan

### Phase 1: Foundation (Sequential)
```
T1 → T2 → T3 → T4
```
Dependências, config de build, wrangler, schema Drizzle — tudo trava nisso.

### Phase 2: Auth Core (Sequential, depende de Fase 1)
```
T4 → T5 → T6 → T7
```
Better Auth precisa do client D1 (T3/T4) antes de existir; middleware depende do Better Auth existir.

### Phase 3: Data Layer (Parallel, depende de T4)
```
       ┌→ T8  [P]
T4 ────┼→ T9  [P]
       ├→ T10 [P]
       └→ T11 [P]
```
Query modules por domínio (users/ranking, posts/feed, likes, comments+sabados) não compartilham estado — só o schema (T4).

### Phase 4: Storage (Sequential, depende de T2)
```
T2 → T12 → T13
```
R2 binding → upload route → resize client-side.

### Phase 5: Route Integration (Parallel, depende de T6+T8..11 e T12+T13)
```
                  ┌→ T14 [P]  (feed)
                  ├→ T15 [P]  (ranking)
T6,T8-11,T13 ─────┼→ T16 [P]  (profile)
                  ├→ T17 [P]  (posts/likes/comments API)
                  └→ T18 [P]  (sabados)
```
Cada rota troca Supabase por Drizzle/D1/R2; arquivos não se sobrepõem.

### Phase 6: Cleanup & Deploy (Sequential, depende de tudo)
```
T14..18 → T19 → T20 → T21
```
Remover Supabase, seed, deploy real.

---

## Task Breakdown

### T1: Instalar dependências e remover Supabase do package.json

**What**: Adicionar `drizzle-orm`, `drizzle-kit`, `better-auth`, `@opennextjs/cloudflare`, `wrangler`; remover `@supabase/ssr`, `@supabase/supabase-js`, `sharp`. Bump `next` para `^16.2.6`.
**Where**: `package.json`
**Depends on**: None
**Reuses**: N/A
**Requirement**: FR-15, FR-16, NFR-1

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `package.json` sem `@supabase/*` e `sharp`
- [ ] `next` em `^16.2.6` ou superior
- [ ] `npm install` roda sem erro
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `chore(deps): swap supabase deps for cloudflare stack`

---

### T2: Criar wrangler.jsonc e open-next.config.ts

**What**: Config do Worker com bindings `DB` (D1), `PHOTOS_BUCKET` (R2), `nodejs_compat`, `compatibility_date`, `ASSETS`, `WORKER_SELF_REFERENCE` — mais os bindings internos que o OpenNext exige (`NEXT_INC_CACHE_R2_BUCKET`, `NEXT_TAG_CACHE_D1`, nomes hardcoded).
**Where**: `wrangler.jsonc`, `open-next.config.ts` (novos arquivos, raiz do projeto)
**Depends on**: T1
**Reuses**: N/A
**Requirement**: FR-15, FR-17, NFR-1

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `wrangler.jsonc` com todos os bindings acima
- [ ] `open-next.config.ts` configurado com `incrementalCache: r2IncrementalCache`
- [ ] `npx wrangler types` roda sem erro e gera `cloudflare-env.d.ts`
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `build(cloudflare): add wrangler and opennext config`

---

### T3: Criar schema Drizzle do domínio

**What**: Definir `users`, `posts`, `likes`, `comments`, `pointEvents` em Drizzle (SQLite), conforme design.md.
**Where**: `src/lib/db/schema.ts`
**Depends on**: T1
**Reuses**: `src/lib/types.ts` (shape de referência)
**Requirement**: FR-6, FR-9, FR-10

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Todas as 5 tabelas definidas com colunas/tipos/FKs do design.md
- [ ] `npx drizzle-kit generate` produz migration sem erro
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add drizzle schema for domain tables`

---

### T4: Criar client D1 (`getDb`/`getDbAsync`)

**What**: Wrapper Drizzle sobre binding D1, instanciado por request via `getCloudflareContext()` + `react cache()`.
**Where**: `src/lib/db/client.ts`
**Depends on**: T2, T3
**Reuses**: substitui `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
**Requirement**: FR-7

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `getDb()` (síncrono) e `getDbAsync()` (para rotas estáticas) exportados
- [ ] Nenhum client global instanciado no módulo (design.md — client nunca global)
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add per-request drizzle client`

---

### T5: Gerar schema Better Auth e integrar com `users`

**What**: Rodar `npx @better-auth/cli generate`, revisar schema gerado (`session`, `account`, `verification`) e fundir `user` com a tabela `users` já existente (design.md — sem duplicar tabela de usuário).
**Where**: `src/lib/db/schema.ts` (extensão), nova migration
**Depends on**: T4
**Reuses**: T3 (`users`)
**Requirement**: FR-6

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `session`, `account`, `verification` definidas e com FK pra `users.id`
- [ ] `npx drizzle-kit generate` produz migration limpa
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(auth): add better-auth schema merged with users table`

---

### T6: Criar instância Better Auth por request (`getAuth`)

**What**: `betterAuth({ database: drizzleAdapter(...) })` instanciado por request, com provider credentials (email+senha), sem signup público.
**Where**: `src/lib/auth/server.ts`
**Depends on**: T5
**Reuses**: substitui todo `supabase.auth.*`
**Requirement**: FR-1, FR-4, FR-5

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `getAuth()` retorna instância válida usando `getDb()`
- [ ] Credentials provider habilitado, signup público desabilitado
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(auth): add better-auth server instance`

---

### T7: Reescrever `middleware.ts` (Edge, sem async_hooks)

**What**: Middleware roda `runtime = 'edge'`, checa só presença do cookie de sessão do Better Auth; mantém `protectedPaths`/`authPaths` atuais.
**Where**: `src/middleware.ts`
**Depends on**: T6
**Reuses**: lista de paths do middleware atual
**Requirement**: FR-2, FR-3, NFR-3

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `export const runtime = 'edge'` presente
- [ ] Nenhuma chamada a `auth.api.getSession()` ou lib Node-only dentro do middleware
- [ ] Redirects preservados (`/login` sem cookie, `/feed` com cookie em auth paths)
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(auth): rewrite middleware for edge runtime cookie check`

---

### T8: Query module — users/ranking [P]

**What**: Funções Drizzle para buscar usuário por ID, listar ranking ordenado por `points` desc.
**Where**: `src/lib/db/queries/users.ts`
**Depends on**: T4
**Reuses**: `getDb()`
**Requirement**: FR-9

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `getUserById(id)`, `getRanking()` implementadas
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add users/ranking query module`

---

### T9: Query module — posts/feed [P]

**What**: Funções Drizzle para criar post, listar feed paginado com contagem de likes/comments e `is_liked`.
**Where**: `src/lib/db/queries/posts.ts`
**Depends on**: T4
**Reuses**: `getDb()`
**Requirement**: FR-10

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `createPost()`, `getFeed(userId, cursor)` implementadas, shape igual ao `Post` de `types.ts`
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add posts/feed query module`

---

### T10: Query module — likes [P]

**What**: Funções Drizzle para curtir/descurtir post.
**Where**: `src/lib/db/queries/likes.ts`
**Depends on**: T4
**Reuses**: `getDb()`
**Requirement**: FR-6

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `likePost()`, `unlikePost()` implementadas
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add likes query module`

---

### T11: Query module — comments + sabados/activity [P]

**What**: Funções Drizzle para comentar e para os endpoints de `sabados` (point_events) e `activity` do usuário.
**Where**: `src/lib/db/queries/comments.ts`, `src/lib/db/queries/point-events.ts`
**Depends on**: T4
**Reuses**: `getDb()`
**Requirement**: FR-6

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `createComment()`, `getPointEvents(filters)`, `getUserActivity(userId)` implementadas
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(db): add comments and point-events query modules`

---

### T12: Route Handler de upload pro R2

**What**: `POST /api/upload` recebe arquivo já otimizado do client, grava em `PHOTOS_BUCKET`, valida sessão antes de gravar.
**Where**: `src/app/api/upload/route.ts`
**Depends on**: T2, T6
**Reuses**: `getAuth()`, binding `PHOTOS_BUCKET`
**Requirement**: FR-11, FR-13

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [x] Endpoint rejeita sem sessão válida (401)
- [x] Grava no bucket com key `posts/...` ou `avatars/...` conforme tipo
- [x] Retorna `{ key, url }` com URL do custom domain
- [x] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(storage): add r2 upload route handler`

**Status**: Implementado em `src/app/api/upload/route.ts`. Ainda não commitado (arquivo untracked).
Pendência para task de deploy: configurar env var `NEXT_PUBLIC_R2_PUBLIC_URL` (custom
domain ou r2.dev público do bucket `shift90d-photos`) — sem ela `url` retorna
`undefined/${key}`. Key não preserva nome de arquivo original, usa apenas
`${uuid}${extensão inferida do content-type}` (map MIME→ext local ao arquivo).

---

### T13: Resize client-side + remover `lib/utils/avatar.ts`

**What**: Util `resizeImageFile()` via canvas; remove `lib/utils/avatar.ts` (transform Supabase).
**Where**: `src/lib/utils/image-resize.ts` (novo), `src/lib/utils/avatar.ts` (deletado)
**Depends on**: T2
**Reuses**: N/A
**Requirement**: FR-12, FR-14

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `resizeImageFile(file, maxDimension, quality): Promise<Blob>` implementada
- [ ] `lib/utils/avatar.ts` removido
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(storage): add client-side image resize, drop supabase transform`

---

### T14: Migrar feed (page + API) [P]

**What**: `feed/page.tsx` e `api/posts/feed/route.ts` trocam Supabase por queries de T9, sessão via `getAuth()`.
**Where**: `src/app/feed/page.tsx`, `src/app/api/posts/feed/route.ts`
**Depends on**: T6, T9, T13
**Reuses**: `PostCard`, `FeedClient` (UI intacta)
**Requirement**: FR-2, FR-9, FR-10

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Zero import de `@supabase/*` nestes arquivos
- [ ] Shape de dados retornado idêntico ao consumido por `FeedClient`
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(feed): migrate feed page and api to d1`

---

### T15: Migrar ranking (page) [P]

**What**: `ranking/page.tsx` troca Supabase por `getRanking()` de T8.
**Where**: `src/app/ranking/page.tsx`
**Depends on**: T6, T8
**Reuses**: `RankingItem` (UI intacta)
**Requirement**: FR-2, FR-9

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Zero import de `@supabase/*`
- [ ] Ordenação por pontos preservada
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(ranking): migrate ranking page to d1`

---

### T16: Migrar profile (page + [id] + ProfileClient + upload avatar) [P]

**What**: `profile/page.tsx`, `profile/[id]/page.tsx`, `ProfileClient.tsx`, `ProfileHeader.tsx` trocam Supabase por queries T8/T9 e upload de avatar por T12+T13.
**Where**: `src/app/profile/page.tsx`, `src/app/profile/[id]/page.tsx`, `src/app/profile/ProfileClient.tsx`, `src/components/profile/ProfileHeader.tsx`
**Depends on**: T6, T8, T9, T12, T13
**Reuses**: UI existente
**Requirement**: FR-2, FR-11, FR-12, FR-13

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Zero import de `@supabase/*`
- [ ] Upload de avatar chama `resizeImageFile()` + `/api/upload`
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(profile): migrate profile pages and avatar upload to cloudflare`

---

### T17: Migrar posts/likes/comments API + CreatePost [P]

**What**: `api/posts/route.ts`, `api/posts/[id]/route.ts`, `api/likes/route.ts`, `api/comments/route.ts`, `CommentSection.tsx`, `CreatePost.tsx` trocam Supabase por T9/T10/T11 e upload por T12/T13.
**Where**: `src/app/api/posts/route.ts`, `src/app/api/posts/[id]/route.ts`, `src/app/api/likes/route.ts`, `src/app/api/comments/route.ts`, `src/components/post/CommentSection.tsx`, `src/components/post/CreatePost.tsx`
**Depends on**: T6, T9, T10, T11, T12, T13
**Reuses**: UI existente
**Requirement**: FR-6, FR-10, FR-11, FR-12

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Zero import de `@supabase/*`
- [ ] Criação de post atribui pontos (regra atual preservada)
- [ ] Upload de foto chama `resizeImageFile()` + `/api/upload`
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(posts): migrate posts/likes/comments api to cloudflare`

---

### T18: Migrar sabados (page + API) [P]

**What**: `sabados/page.tsx`, `api/sabados/route.ts`, `api/users/[userId]/activity/route.ts` trocam Supabase por T11.
**Where**: `src/app/sabados/page.tsx`, `src/app/api/sabados/route.ts`, `src/app/api/users/[userId]/activity/route.ts`
**Depends on**: T6, T11
**Reuses**: UI existente (TanStack Table, filtros)
**Requirement**: FR-2, FR-6

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] Zero import de `@supabase/*`
- [ ] Filtros de data e paginação preservados
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `feat(sabados): migrate sabados page and api to d1`

---

### T19: Remover pasta `lib/supabase/` e vars de ambiente

**What**: Deletar `src/lib/supabase/client.ts` e `server.ts`; remover `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de `.env*`/docs; atualizar `CLAUDE.md` do projeto.
**Where**: `src/lib/supabase/` (deletado), `.env.example` (se existir), `CLAUDE.md`
**Depends on**: T14, T15, T16, T17, T18
**Reuses**: N/A
**Requirement**: NFR-4

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `grep -ri supabase src` retorna vazio
- [ ] `CLAUDE.md` atualizado com nova arquitetura (Cloudflare em vez de Supabase)
- [ ] Gate check passa: `npm run lint && npm run build && npx opennextjs-cloudflare build`

**Tests**: none
**Gate**: full

**Commit**: `chore: remove supabase remnants`

---

### T20: Script de seed inicial (D1 limpo)

**What**: Script que cria schema via migrations e insere um usuário admin de teste, conforme decisão de "começar limpo" (context.md).
**Where**: `scripts/seed.ts` (ou similar), `migrations/` (geradas por drizzle-kit)
**Depends on**: T19
**Reuses**: schema de T3/T5
**Requirement**: FR-6

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `wrangler d1 migrations apply --local` aplica schema sem erro
- [ ] Seed cria ao menos 1 usuário válido pra login manual
- [ ] Gate check passa: `npm run lint`

**Tests**: none
**Gate**: quick

**Commit**: `chore(db): add seed script for clean d1 setup`

---

### T21: Deploy real e validação (D1/R2/domínio remoto)

**What**: Criar recursos reais na Cloudflare (D1 database, R2 bucket, custom domain), rodar `wrangler d1 migrations apply --remote`, deploy via `opennextjs-cloudflare deploy`, apontar domínio.
**Where**: infraestrutura Cloudflare (fora do repo, exceto IDs em `wrangler.jsonc`)
**Depends on**: T20
**Reuses**: N/A
**Requirement**: FR-15, FR-17

**Tools**: MCP: NONE / Skill: NONE

**Done when**:
- [ ] `database_id`/`bucket_name` reais preenchidos em `wrangler.jsonc`
- [ ] Deploy sobe sem erro
- [ ] Login manual + post + like + comment + ranking funcionam no ambiente deployado (UAT manual)
- [ ] Gate check passa: `npm run lint && npm run build && npx opennextjs-cloudflare build`

**Tests**: none
**Gate**: full

**Commit**: `chore(deploy): connect real cloudflare resources and deploy`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 → T2 → T3 → T4

Phase 2 (Sequential):
  T4 → T5 → T6 → T7

Phase 3 (Parallel, after T4):
    ├── T8  [P]
    ├── T9  [P]
    ├── T10 [P]
    └── T11 [P]

Phase 4 (Sequential, after T2):
  T2 → T12 → T13

Phase 5 (Parallel, after T6 + T8-11 + T13):
    ├── T14 [P]
    ├── T15 [P]
    ├── T16 [P]
    ├── T17 [P]
    └── T18 [P]

Phase 6 (Sequential, after T14-18):
  T19 → T20 → T21
```

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 arquivo (deps) | ✅ Granular |
| T2 | 2 arquivos config coesos | ✅ Granular (config única) |
| T3 | 1 schema | ✅ Granular |
| T4 | 1 arquivo (client) | ✅ Granular |
| T5 | 1 extensão de schema | ✅ Granular |
| T6 | 1 arquivo (auth server) | ✅ Granular |
| T7 | 1 arquivo (middleware) | ✅ Granular |
| T8-T11 | 1 módulo de query cada | ✅ Granular |
| T12 | 1 route handler | ✅ Granular |
| T13 | 1 util + 1 remoção | ✅ Granular |
| T14-T18 | 2-6 arquivos por feature, coesos (mesma migração, mesmo padrão) | ✅ OK — cohesive, todos aplicam o mesmo swap Supabase→D1/R2 dentro de 1 feature |
| T19 | 1 remoção + 1 doc | ✅ Granular |
| T20 | 1 script | ✅ Granular |
| T21 | 1 operação de infra | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | None | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T2→T3 (sequencial, T3 após T2) | ✅ Match |
| T4 | T2, T3 | T3→T4 | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |
| T8 | T4 | T4→T8 [P] | ✅ Match |
| T9 | T4 | T4→T9 [P] | ✅ Match |
| T10 | T4 | T4→T10 [P] | ✅ Match |
| T11 | T4 | T4→T11 [P] | ✅ Match |
| T12 | T2, T6 | T2→T12; T6 (fase 2) já completo antes da fase 5, mas T12 é fase 4 dependendo só de T2 — **nota**: T12 não depende de T6 no diagrama de fases | ⚠️ Ver nota |
| T13 | T2 | T2→T13 | ✅ Match |
| T14 | T6, T9, T13 | Fase 5 após T6+T8-11+T13 | ✅ Match |
| T15 | T6, T8 | Fase 5 após T6+T8-11+T13 | ✅ Match |
| T16 | T6, T8, T9, T12, T13 | Fase 5 após T6+T8-11+T13 (T12 incluído implicitamente via T13) | ✅ Match |
| T17 | T6, T9, T10, T11, T12, T13 | Fase 5 | ✅ Match |
| T18 | T6, T11 | Fase 5 | ✅ Match |
| T19 | T14-T18 | T14-18→T19 | ✅ Match |
| T20 | T19 | T19→T20 | ✅ Match |
| T21 | T20 | T20→T21 | ✅ Match |

**Correção necessária**: T12 lista `Depends on: T2, T6` no corpo da task, mas a Fase 4 (onde T12 vive) só espera T2. Como T12 valida sessão (`getAuth()`, que existe desde T6), a dependência real de T6 é verdadeira — **ajuste**: mover T12 para depender explicitamente de T6 na execução (executar T12 só após Fase 2 completa), mesmo que estruturalmente ele apareça na "Fase 4". Já refletido no `Depends on` da task; a fase é apenas agrupamento visual, não sequência estrita — T12 só pode iniciar após T2 **e** T6 estarem prontos.

---

## Test Co-location Validation

| Task | Code Layer Criado/Modificado | Matrix Exige | Task Diz | Status |
|---|---|---|---|---|
| T1-T21 | Todas as camadas (config, schema, queries, routes, UI) | Sem TESTING.md / sem coverage matrix — decisão do usuário: lint+build apenas | `Tests: none` em todas | ✅ OK (consistente com a decisão registrada) |

---

## Tools per Task

Nenhuma task usa MCP ou Skill externa — todo trabalho é edição de código local + comandos `npm`/`wrangler`/`drizzle-kit` via Bash.

**Exceção T21**: `lab cf worker` é somente-leitura (list/get) e não há subcomando de D1/R2/deploy no `lab` — criação de recursos, migrations e deploy seguem via `wrangler` direto. Usar `lab cf dns create <zone>` para o registro DNS do domínio custom apontando pro Worker (evita editar DNS manualmente no dashboard).
