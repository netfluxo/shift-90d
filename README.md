# Shift 90D

App social de acompanhamento de atividade física para participantes dos programas de educação física corporativa do Yuri. Os usuários postam fotos das suas atividades, acumulam pontos e competem no ranking com colegas de empresa.

Mobile-first web app — acesso direto pelo browser, sem instalação.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Database / Auth / Storage**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS v4
- **State**: Zustand
- **Service Worker**: Serwist
- **Language**: TypeScript

## Setup

Pré-requisitos: Node.js 20+ e um projeto Supabase configurado.

```bash
npm install
```

Crie um `.env.local` na raiz:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Aplique o schema do banco a partir de `supabase-migrations/` (ou `supabase-reset.sql` para um reset completo). Buckets de storage necessários: `posts` e `avatars`.

## Scripts

```bash
npm run dev      # dev server em localhost:3000
npm run build    # build de produção (webpack)
npm run start    # serve o build
npm run lint     # ESLint
```

## Estrutura

```
src/
├── app/
│   ├── (auth)/           # login, signup
│   ├── feed/             # feed principal
│   ├── ranking/          # leaderboard por pontos
│   └── profile/          # perfil próprio + [id]
├── components/
│   ├── layout/           # BottomNav
│   ├── post/             # PostCard, CreatePost, CommentSection
│   ├── profile/          # ProfileHeader
│   └── ranking/          # RankingItem
├── lib/
│   ├── supabase/         # client.ts (browser), server.ts (SSR)
│   └── types.ts
└── middleware.ts         # protege /feed, /ranking, /profile
```

## Modelo de dados

Tabelas principais: `users`, `posts`, `likes`, `comments`, `point_events` (ledger — fonte de verdade para pontos).

Pontos são acumulados via `point_events` e refletidos em `users.points`. O ranking ordena por `users.points` desc.

## Fluxo principal

1. Login (contas criadas pelo admin)
2. Post de foto/vídeo de atividade física com legenda → gera `point_event`
3. Curtidas e comentários nos posts dos colegas
4. Ranking atualizado por empresa

## Deploy

Vercel. Configurar as env vars `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no projeto.
