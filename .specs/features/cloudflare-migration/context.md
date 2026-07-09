# Context — Migração Supabase → Cloudflare

Decisões do usuário capturadas na fase de discuss (2026-07-09).

## Premissa

Abandonar **Supabase e Vercel** completamente. Infra 100% **Cloudflare**, foco em **free tier**.

## Stack alvo (confirmada com docs atuais)

| Camada | Hoje (Supabase) | Alvo (Cloudflare) | Free tier |
|---|---|---|---|
| Compute/hosting | Vercel | Cloudflare Workers via `@opennextjs/cloudflare` | 100K req/dia, 10ms CPU/req, worker ≤3MB |
| Storage | Supabase Storage (buckets `posts`, `avatars`) | **R2** (S3 API / binding) | 10GB, egress zero |
| Database | Supabase Postgres | **D1** (SQLite, binding nativo) | 5GB, 5M reads/dia, 100K writes/dia |
| Auth | Supabase Auth | **Better Auth** app-level sobre D1 | — |
| Domínio | Vercel | Cloudflare DNS + Workers custom domain | Registrar at-cost |

## Decisões (gray areas resolvidas)

1. **Resize de imagem** → **client-side antes do upload** (browser canvas). `sharp` não roda no Workers e estoura o limite de 3MB. App guarda 1 versão já otimizada no R2. Elimina a dependência do image-transform (`lib/utils/avatar.ts`).
2. **Auth** → **Better Auth** (credentials/senha, sessão por cookie, adapter D1). Contas criadas pelo admin (sem signup público self-serve).
3. **Migração de dados** → **começar limpo**. Recriar schema em D1 e seed do zero. Sem migração de dados do Supabase.
4. **Next.js 16** → verificado: **suportado a partir de 16.2.6**. Repo em 16.1.3 → bump para 16.2.6+ (minor, não downgrade).

## Riscos sinalizados

- **R-1 CPU 10ms**: SSR com auth + render de feed pode exceder o teto de CPU do free tier sob uso real. Monitorar; pode exigir Workers Paid ($5/mês) se estourar.
- **R-2 Middleware/Proxy Next 16**: novo Proxy do Next 16 pode importar `async_hooks` (Node-only, indisponível no Workers). O middleware de auth precisa checar sessão sem importar módulo Node-only.
- **R-3 Worker ≤3MB**: bundle precisa caber. Remover `sharp` e `@supabase/*` ajuda.

## Fontes

- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [Next.js · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Peer range verificado via `npm view @opennextjs/cloudflare peerDependencies`: `next: ">=15.5.18 <16 || >=16.2.6"`
