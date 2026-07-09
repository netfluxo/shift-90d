# Design — Migração Supabase → Cloudflare

**Spec**: `.specs/features/cloudflare-migration/spec.md`
**Context**: `.specs/features/cloudflare-migration/context.md`
**Status**: Draft

## Pesquisa (resumo, ver context.md para fontes completas)

| Tópico | Conclusão |
|---|---|
| Drizzle + D1 | `drizzle-orm/d1`, driver `dialect: 'sqlite'`. Cliente **nunca global** — instanciar por request via `getCloudflareContext()` + `react cache()`. Migrations: `drizzle-kit generate` + `wrangler d1 migrations apply --remote`. |
| Better Auth + D1 | Sem driver D1 nativo — usa `drizzleAdapter(db, { provider: 'sqlite' })`. Schema (`user`, `session`, `account`, `verification`) gerado via `npx @better-auth/cli generate`. Instância também por request (binding só existe em request-time). |
| R2 | Binding próprio `PHOTOS_BUCKET` (separado do bucket interno `NEXT_INC_CACHE_R2_BUCKET` que o OpenNext usa pro cache — nomes hardcoded, não mexer). Serving público via **custom domain** apontado pro bucket (cache automático da CDN). |
| Next 16 + Workers | **Risco R-2 confirmado, sem fix oficial** (issue `cloudflare/workers-sdk#13755` aberta). Proxy do Next 16 roda em Node e pode puxar `async_hooks`, indisponível no Workers. Mitigação: `middleware.ts` roda em Edge, só checa **presença** do cookie de sessão; validação completa do Better Auth (`auth.api.getSession()`) acontece nas Server Components/Route Handlers (runtime Node do adapter). |

## Architecture Overview

```mermaid
graph TD
    Browser -->|cookie de sessão| Middleware["middleware.ts (Edge)\ncheck: cookie presente?"]
    Middleware -->|sem cookie| Login[/login]
    Middleware -->|com cookie| Pages["Server Components / Route Handlers (Node runtime)"]
    Pages -->|auth.api.getSession| BetterAuth[Better Auth]
    BetterAuth --> Drizzle[Drizzle client]
    Pages --> Drizzle
    Drizzle -->|binding DB| D1[(Cloudflare D1)]
    Pages -->|binding PHOTOS_BUCKET| R2[(Cloudflare R2)]
    R2 -->|custom domain| CDN[Cloudflare CDN pública]
    Browser -->|resize client-side + upload| Pages
```

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
|---|---|---|
| `types.ts` interfaces (`User`, `Post`, `Like`, `Comment`, `PointEvent`) | `src/lib/types.ts` | Mantidos como shape de domínio; viram os `$inferSelect` dos schemas Drizzle (mesma forma, troca a origem) |
| Rotas de API (`api/posts`, `api/likes`, `api/comments`, `api/sabados`, `api/users/[userId]/activity`) | `src/app/api/*` | Mantém contrato HTTP; só troca client Supabase → Drizzle/D1 |
| `BottomNav`, `PostCard`, `RankingItem`, `ProfileHeader` (UI) | `src/components/*` | Zero mudança — consomem os mesmos shapes de `types.ts` |
| `CreatePost.tsx`, `ProfileHeader.tsx` (upload) | `src/components/post/`, `src/components/profile/` | Mesma UI; troca chamada `.upload()`/`.getPublicUrl()` do Supabase por `fetch` para novo Route Handler que grava no R2 |

### Integration Points

| Sistema | Integração |
|---|---|
| D1 | Binding `DB` em `wrangler.jsonc` → `drizzle(env.DB, { schema })` via `getDb()` (padrão `react cache()`) |
| R2 | Binding `PHOTOS_BUCKET` → `env.PHOTOS_BUCKET.put/get()` num Route Handler dedicado de upload |
| Better Auth | `drizzleAdapter` sobre o mesmo client D1; instância criada por request em `lib/auth/server.ts` |

## Components

### `lib/db/schema.ts`
- **Purpose**: Schema Drizzle único (SQLite) para domínio + Better Auth.
- **Location**: `src/lib/db/schema.ts`
- **Interfaces**: exporta `users`, `posts`, `likes`, `comments`, `pointEvents` + tabelas do Better Auth (`user`, `session`, `account`, `verification` — geradas via CLI, revisadas manualmente para casar `user`/`users`).
- **Dependencies**: `drizzle-orm/sqlite-core`
- **Reuses**: shape de `src/lib/types.ts`

### `lib/db/client.ts`
- **Purpose**: Instanciar o client Drizzle por request, nunca global.
- **Location**: `src/lib/db/client.ts`
- **Interfaces**:
  - `getDb(): DrizzleD1Database` — para Route Handlers/Server Components dinâmicos (`getCloudflareContext()` síncrono)
  - `getDbAsync(): Promise<DrizzleD1Database>` — para rotas estáticas/ISR (`getCloudflareContext({ async: true })`)
- **Dependencies**: `@opennextjs/cloudflare`, `react.cache`
- **Reuses**: substitui `src/lib/supabase/client.ts` e `server.ts`

### `lib/auth/server.ts`
- **Purpose**: Instância Better Auth por request, sobre o mesmo D1.
- **Location**: `src/lib/auth/server.ts`
- **Interfaces**:
  - `getAuth(): Promise<ReturnType<typeof betterAuth>>`
- **Dependencies**: `better-auth`, `drizzleAdapter`, `getDb()`
- **Reuses**: substitui todo uso de `supabase.auth.*`

### `middleware.ts` (revisado)
- **Purpose**: Gate leve de rotas protegidas, sem tocar `async_hooks`.
- **Location**: `src/middleware.ts`
- **Interfaces**: `middleware(request): NextResponse` — checa só **presença** do cookie de sessão do Better Auth (`better-auth.session_token` ou nome configurado); não valida assinatura/expiração aqui.
- **Dependencies**: nenhuma lib Node-only; `runtime = 'edge'` explícito
- **Reuses**: mesma lista de `protectedPaths`/`authPaths` já existente

### `app/api/upload/route.ts`
- **Purpose**: Endpoint único de upload (post + avatar) para R2, recebendo arquivo já otimizado pelo client.
- **Location**: `src/app/api/upload/route.ts`
- **Interfaces**: `POST(request): { key: string, url: string }`
- **Dependencies**: binding `PHOTOS_BUCKET`, sessão validada (Better Auth) antes de gravar
- **Reuses**: substitui os `.upload()`/`.getPublicUrl()` hoje inline em `CreatePost.tsx` e `ProfileHeader.tsx`

### `lib/utils/image-resize.ts` (client-side)
- **Purpose**: Redimensionar/comprimir imagem no browser antes do upload (substitui `lib/utils/avatar.ts`, que é removido).
- **Location**: `src/lib/utils/image-resize.ts`
- **Interfaces**: `resizeImageFile(file: File, maxDimension: number, quality: number): Promise<Blob>` — via `<canvas>`/`OffscreenCanvas`
- **Dependencies**: nenhuma (Web API nativa)
- **Reuses**: chamado por `CreatePost.tsx` e `ProfileHeader.tsx` antes do `fetch` pro `/api/upload`

## Data Models

Schema SQLite (Drizzle), 1:1 com os interfaces atuais de `types.ts`, IDs viram `text` (cuid/uuid gerado em app, D1 não tem `gen_random_uuid()` nativo):

```typescript
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  points: integer('points').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  mediaUrl: text('media_url').notNull(),
  mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
  caption: text('caption').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  postId: text('post_id').notNull().references(() => posts.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  postId: text('post_id').notNull().references(() => posts.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const pointEvents = sqliteTable('point_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  eventDate: text('event_date').notNull(),
  source: text('source', { enum: ['post', 'saturday_attendance', 'compensation'] }).notNull(),
  pointsDelta: integer('points_delta').notNull(),
  postId: text('post_id').references(() => posts.id),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

Tabelas do Better Auth (`user`/`session`/`account`/`verification`) geradas pelo CLI e integradas por FK (`session.userId → users.id`). Decisão de design: manter `users` (domínio) como tabela `user` do Better Auth estendida com `points`/`avatarUrl`, evitando duas tabelas de usuário duplicadas.

**Relationships**: `posts.userId → users.id`, `likes.{userId,postId}`, `comments.{userId,postId}`, `pointEvents.userId → users.id`, `pointEvents.postId → posts.id` (nullable).

## Error Handling Strategy

| Cenário | Tratamento | Impacto pro usuário |
|---|---|---|
| Cookie de sessão ausente em rota protegida | Middleware redireciona `/login` | Tela de login |
| Cookie presente mas sessão inválida/expirada (checado na page) | `auth.api.getSession()` retorna null → redirect `/login` na própria page | Tela de login (1 hop a mais que hoje, aceitável) |
| Upload falha (R2 indisponível/quota) | Route Handler retorna 500 com mensagem; client mantém preview local | Toast de erro, post não perdido |
| D1 write limit do free tier estourado | Wrangler retorna erro explícito da API | 500 genérico; monitorar (NFR-2) |

## Tech Decisions

| Decisão | Escolha | Racional |
|---|---|---|
| Query layer | Drizzle ORM | Type-safety, migrations versionadas, adapter oficial do Better Auth |
| Auth lib | Better Auth + `drizzleAdapter` | Único caminho suportado pra D1; roda bem com sessão por cookie |
| Middleware | Edge runtime, só presença de cookie | Único jeito de evitar o bug conhecido de `async_hooks` no Next 16 (R-2, sem fix oficial) |
| Serving de imagem | R2 + custom domain | Cache automático da CDN, sem overhead de Worker-proxy |
| IDs | `text` (cuid) em vez de serial | D1/SQLite não tem UUID nativo; cuid gerado em app é mais simples que autoincrement pra entidades distribuídas |
| Client D1/Drizzle | Nunca singleton global | Instanciar por request é obrigatório no runtime Workers (conexões não são poolable entre requests) |

## Correção descoberta durante execução (T3/T5)

`users.points` **não é a fonte de verdade real**. A migration `supabase/migrations/add-user-points-view.sql` cria `user_points_view`, usada por `ranking/page.tsx` e `api/users/[userId]/activity/route.ts`, com esta lógica:

```sql
points = COALESCE(SUM(point_events.points_delta), 0)  -- todos os sources
active_days = COALESCE(COUNT(DISTINCT event_date) WHERE source='post', 0)
```

Schema corrigido: removida a coluna `points` de `users` (schema.ts). `getRanking()`/`getUserById()` (T8) devem agregar de `pointEvents` via Drizzle, replicando exatamente essa fórmula — inclusive o dense ranking de `buildDenseRankingMap` (`src/lib/utils/ranking.ts`, mantido como está, reusado sem mudança).

## Riscos remanescentes (herdados do context.md)

- **R-2 confirmado sem fix**: revisitar quando `cloudflare/workers-sdk#13755` fechar; a mitigação atual (cookie-check no middleware, validação completa na page) é o padrão recomendado hoje, não um workaround temporário frágil.
- **R-1 (CPU 10ms)**: sem dado real ainda — só medir pós-deploy.
