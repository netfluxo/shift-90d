# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto do produto

**Cliente**: Yuri — educador físico que oferece serviços de educação física corporativa (aulas e programas de atividade física dentro de empresas).

**Produto**: Shift 90D — app social de acompanhamento de atividade física para os participantes dos programas do Yuri. A mecânica central é simples: os participantes postam fotos das suas atividades físicas e acumulam pontos. O ranking gera engajamento e competição saudável entre colegas de empresa.

**Usuários**: funcionários das empresas atendidas pelo Yuri. Acesso via mobile browser — sem instalação.

**Fluxo principal**:
1. Usuário faz login (conta criada pelo admin/Yuri)
2. Posta foto de atividade física com legenda
3. Recebe pontos pelo post
4. Curte e comenta posts de outros participantes
5. Acompanha o ranking de pontos

**Regras de negócio relevantes**:
- Posts de foto/vídeo geram pontos para o usuário (`users.points`)
- O ranking é ordenado por pontos decrescentes
- Cada usuário tem um perfil com histórico de posts e pontuação

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

Shift 90D is a fitness activity social app built with Next.js 16 (App Router) deployed on Cloudflare Workers. It's a mobile-focused web app accessed directly through the mobile browser (not a PWA).

### Tech Stack
- **Framework**: Next.js 16 with App Router, deployed via `@opennextjs/cloudflare`
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM
- **Auth**: Better Auth (credentials/email+password, no public signup — accounts created by admin)
- **Storage**: Cloudflare R2 (bucket `PHOTOS_BUCKET`), image resize done client-side before upload
- **Styling**: Tailwind CSS v4 with CSS variables
- **State**: Zustand
- **Language**: TypeScript

### Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login page (signup redirects to /login — no public signup)
│   ├── api/auth/[...all]/ # Better Auth catch-all route handler
│   ├── api/upload/       # R2 upload endpoint (post media + avatars)
│   ├── feed/             # Main feed with posts
│   ├── ranking/          # Leaderboard by points
│   └── profile/          # User profile (own + [id] for others)
├── components/
│   ├── layout/           # BottomNav
│   ├── post/             # PostCard, CreatePost, CommentSection
│   └── ranking/          # RankingItem
└── lib/
    ├── auth/             # server.ts (getAuth, per-request), client.ts (signIn/signOut/useSession)
    ├── db/
    │   ├── client.ts     # getDb/getDbAsync — per-request Drizzle client over D1 binding
    │   ├── schema.ts     # Drizzle schema (domain tables + Better Auth tables)
    │   └── queries/      # users, posts, likes, comments, point-events query modules
    ├── utils/image-resize.ts # client-side resize before upload (replaces old CDN transform)
    └── types.ts          # TypeScript interfaces
```

### Key Patterns

**D1/Drizzle client** (`lib/db/client.ts`): instantiated **per request** via `getCloudflareContext()` + React `cache()` — never a module-level singleton (Workers bindings aren't poolable across requests).

**Auth** (`lib/auth/server.ts`): `getAuth()` builds a per-request Better Auth instance (`drizzleAdapter`, `usePlural: true`, `camelCase: true`). Client-side: `lib/auth/client.ts` (`signIn.email`, `signOut`, `useSession`).

**Points/ranking**: `point_events` is the source of truth (`points` = `SUM(points_delta)` per user; `active_days` = `COUNT(DISTINCT event_date)` where `source='post'`). The aggregation is **materialized** in `user_points`, maintained by four D1 triggers (`migrations/0003_user_points.sql`) — recomputing the whole ranking per request was costing 778–937 rows read each time.

- Reads go through `user_points` (`getRanking`, `getUserById`, `getUserActivity`). Never re-aggregate `point_events` in a read path.
- Writes to `point_events` need no extra code: the triggers keep `user_points` in sync, including via seed and manual `wrangler d1 execute`.
- `drizzle-kit` does **not** version triggers. Recreating the DB from scratch requires applying `0003` — the snapshot alone is not enough.
- Trigger bodies must use uppercase `BEGIN`/`END`: lowercase `begin` fails on remote D1 with `incomplete input [code: 7500]` while passing `--local` ([workers-sdk#10998](https://github.com/cloudflare/workers-sdk/issues/10998)).
- Repair: `npm run db:verify-points:remote` (expects `divergences=0`), then `npm run db:rebuild-points:remote` if it drifts.

**Feed pagination**: keyset on `(created_at, id)`, not `OFFSET`. `created_at` is a second-granularity timestamp, so `id` is required as tiebreaker. `/api/posts/feed` still accepts `?page=` as a legacy fallback.

**Authentication middleware**: `src/middleware.ts` runs on **Edge runtime** and only checks *cookie presence* (`getSessionCookie` from `better-auth/cookies`) — never full session validation, to avoid Next.js 16's Proxy architecture pulling in `async_hooks` (unsupported on Cloudflare Workers, see `cloudflare/workers-sdk#13755`). Full session validation (`getAuth().api.getSession(...)`) happens in Server Components/Route Handlers.
- Protects `/feed`, `/ranking`, `/profile`, `/sabados`
- Redirects unauthenticated users to `/login`
- Redirects authenticated users away from `/login`

**Environment Variables**:
```
BETTER_AUTH_SECRET
BETTER_AUTH_URL
NEXT_PUBLIC_BETTER_AUTH_URL
NEXT_PUBLIC_R2_PUBLIC_URL
```

### Database Schema

Tables (Drizzle, `src/lib/db/schema.ts`): `users`, `posts`, `likes`, `comments`, `pointEvents` (domain) + `sessions`, `accounts`, `verifications` (Better Auth). Migrations in `migrations/`, generated via `drizzle-kit`.
Storage: R2 bucket `PHOTOS_BUCKET`, objects under `posts/` and `avatars/` prefixes.

### Design System

Colors defined in `globals.css`:
- Primary (blue): `#1E5A8A` (dark: `#0D3A5C`, light: `#50A5E6`)
- Secondary (red): `#C23A2A` (dark: `#8B2920`, light: `#D74B37`)

Use Tailwind classes: `text-primary`, `bg-secondary-dark`, etc.
