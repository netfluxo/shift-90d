# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

Shift 90D is a fitness activity social app built with Next.js 16 (App Router) and Supabase. It's a mobile-focused web app accessed directly through the mobile browser (not a PWA).

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **Database/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage)
- **Styling**: Tailwind CSS v4 with CSS variables
- **State**: Zustand
- **Language**: TypeScript

### Project Structure

```
src/
├── app/
│   ├── (auth)/           # Auth pages (login, signup) - grouped route
│   ├── feed/             # Main feed with posts
│   ├── ranking/          # Leaderboard by points
│   └── profile/          # User profile (own + [id] for others)
├── components/
│   ├── layout/           # BottomNav
│   ├── post/             # PostCard, CreatePost, CommentSection
│   ├── profile/          # ProfileHeader
│   └── ranking/          # RankingItem
└── lib/
    ├── supabase/         # Supabase clients (client.ts, server.ts)
    └── types.ts          # TypeScript interfaces
```

### Key Patterns

**Supabase Clients**:
- `lib/supabase/client.ts` - Browser client using `createBrowserClient`
- `lib/supabase/server.ts` - Server client using `createServerClient` with cookies

**Authentication**:
- Middleware (`src/middleware.ts`) protects routes `/feed`, `/ranking`, `/profile`
- Redirects unauthenticated users to `/login`
- Redirects authenticated users away from `/login`, `/signup`

**Environment Variables**:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### Database Schema

Tables: `users`, `posts`, `likes`, `comments` (see `supabase-reset.sql`)
Storage buckets: `posts`, `avatars`

### Design System

Colors defined in `globals.css`:
- Primary (blue): `#1E5A8A` (dark: `#0D3A5C`, light: `#50A5E6`)
- Secondary (red): `#C23A2A` (dark: `#8B2920`, light: `#D74B37`)

Use Tailwind classes: `text-primary`, `bg-secondary-dark`, etc.
