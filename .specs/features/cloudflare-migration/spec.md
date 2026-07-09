# Spec — Migração Supabase → Cloudflare (all-Cloudflare, free tier)

**Status**: draft
**Scope**: Complex — migração de infra tocando ~23 arquivos, 3 pilares (auth, DB, storage) + hosting.
**Contexto de decisões**: ver [context.md](./context.md)

## Objetivo

Substituir toda a infraestrutura Supabase + Vercel por Cloudflare (Workers + D1 + R2 + Better Auth), preservando o comportamento funcional do Shift 90D, começando com dados limpos.

## Requisitos funcionais

### Auth (Better Auth sobre D1)
- **FR-1** Usuário faz login com email/senha; sessão persistida por cookie.
- **FR-2** Rotas `/feed`, `/ranking`, `/profile`, `/sabados` exigem sessão válida; sem sessão → redirect `/login`.
- **FR-3** Usuário autenticado em `/login` ou `/signup` → redirect `/feed`.
- **FR-4** Contas são criadas pelo admin (Yuri); não há signup público self-serve.
- **FR-5** Logout encerra a sessão e redireciona para `/login`.

### Database (D1)
- **FR-6** Schema recriado em SQLite: `users`, `posts`, `likes`, `comments` + tabelas do Better Auth (session, account, verification).
- **FR-7** Todas as queries das rotas/API passam a usar D1 via binding do Worker (`getCloudflareContext().env`).
- **FR-8** Autorização antes feita por RLS passa a ser app-level (checks explícitos nas rotas/queries).
- **FR-9** Ranking ordenado por pontos desc, onde pontos = `SUM(point_events.points_delta)` por usuário (fonte de verdade real, descoberta durante execução — não é uma coluna `users.points` armazenada; ver correção em design.md).
- **FR-10** Pontos atribuídos ao criar post de foto/vídeo via inserção em `point_events` (source='post', 1 ponto, limitado a 1 post/dia) — regra atual preservada.

### Storage (R2)
- **FR-11** Upload de foto de post e avatar vai para R2 (buckets/prefixos `posts/`, `avatars/`).
- **FR-12** Imagem é redimensionada/comprimida **client-side** antes do upload; app guarda 1 versão otimizada.
- **FR-13** URLs públicas das imagens servidas via R2 (custom domain / binding), substituindo `getPublicUrl` do Supabase.
- **FR-14** Remover `lib/utils/avatar.ts` (transform do Supabase) e ajustar todos os call sites de avatar/imagem.

### Hosting / build
- **FR-15** App builda e roda em Cloudflare Workers via `@opennextjs/cloudflare` (runtime Node, `nodejs_compat`).
- **FR-16** Next.js bump para 16.2.6+ (faixa suportada pelo adapter).
- **FR-17** Domínio servido por Cloudflare (DNS + Workers custom domain).

## Requisitos não-funcionais

- **NFR-1** Bundle do Worker ≤ 3MB (free plan). Remover `sharp`, `@supabase/ssr`, `@supabase/supabase-js`.
- **NFR-2** Operar dentro do free tier (100K req/dia, 10ms CPU/req, D1 5M reads/dia, R2 10GB). Ver risco R-1.
- **NFR-3** Middleware de auth não pode importar módulos Node-only (`async_hooks`) — compat com Proxy do Next 16 (R-2).
- **NFR-4** Zero referências a Supabase no código e nas env vars ao final.

## Fora de escopo

- Migração de dados de produção (decisão: começar limpo).
- PWA/service worker changes além do necessário para build.
- Painel de admin para criação de contas (contas via seed/script nesta fase).

## Critérios de aceite

- Login/logout funcionam; rotas protegidas respeitam sessão (FR-1..FR-5).
- Feed, ranking, profile, comentários, likes e posts funcionam contra D1 (FR-6..FR-10).
- Upload de foto/avatar funciona contra R2 com resize client-side (FR-11..FR-14).
- `npm run build` + `opennextjs-cloudflare build` passam; deploy no Workers sobe (FR-15..FR-17).
- `grep -ri supabase src` retorna vazio (NFR-4).

## Rastreabilidade

| Req | Arquivos-alvo (atuais) |
|---|---|
| FR-1..FR-5 | `middleware.ts`, `(auth)/login`, `(auth)/signup`, `BottomNav.tsx` |
| FR-6..FR-10 | `api/posts/*`, `api/likes`, `api/comments`, `api/sabados`, `api/users/*`, `ranking/page.tsx`, `feed/page.tsx`, `profile/*` |
| FR-11..FR-14 | `CreatePost.tsx`, `ProfileHeader.tsx`, `ProfileClient.tsx`, `lib/utils/avatar.ts` |
| FR-15..FR-17 | `package.json`, `next.config.*`, `wrangler.jsonc`, `open-next.config.ts` |
| NFR-* | build config, `lib/supabase/*` (remover) |
