# Deploy — Shift 90D (Cloudflare)

> **Deploy inicial feito em 2026-07-09.**
> - App: https://shift90d-worker.joaofbomfimc.workers.dev
> - Conta: João Castro (`joaofbomfimc@gmail.com`)
> - D1 `shift90d`: `a7b9580e-b19c-4c03-837e-070ff9adb885` · D1 `shift90d-cache`: `2eefd7f4-8ba7-47c4-ac77-2a09b9b85aff`
> - R2 público (fotos): https://pub-1aed824bdf3a40d3a22f6042d9a75d2b.r2.dev
> - Admin: `admin@admin.com` (senha definida no seed)
> - Verificado ao vivo: login, redirect de rota protegida, feed autenticado, get-session.
> Re-deploys: `npm run cf:deploy`. Secrets já configurados (BETTER_AUTH_SECRET/URL).

Runbook do deploy inicial. Todo o código já está migrado e validado (`npm run lint` + `npm run build` + `opennextjs-cloudflare build` verdes). Falta só provisionar os recursos reais na Cloudflare e subir.

> **Auth**: os passos abaixo precisam do `wrangler` autenticado na sua conta.
> Rode `wrangler login` (abre o browser, OAuth) uma vez antes de começar, ou
> exporte um `CLOUDFLARE_API_TOKEN` com escopo de D1, R2 e Workers Scripts (edit).
> O `lab cf` **não** cobre deploy/D1/R2 (é read-only) — só serve pro DNS no passo 7.

## 1. Autenticar

```bash
wrangler login
wrangler whoami   # confirma conta
```

## 2. Criar os recursos D1

```bash
# Banco de domínio (binding DB)
wrangler d1 create shift90d
# Banco interno de tag cache do OpenNext (binding NEXT_TAG_CACHE_D1)
wrangler d1 create shift90d-cache
```

Cada comando imprime um `database_id`. Copie os dois.

## 3. Criar os buckets R2

```bash
# Mídia dos posts/avatars (binding PHOTOS_BUCKET)
wrangler r2 bucket create shift90d-photos
# Cache incremental do OpenNext (binding NEXT_INC_CACHE_R2_BUCKET)
wrangler r2 bucket create shift90d-cache
```

## 4. Preencher os `database_id` no `wrangler.jsonc`

Substitua os dois `"PLACEHOLDER_WILL_BE_SET_ON_DEPLOY"` pelos IDs reais do passo 2:
- binding `DB` → id do `shift90d`
- binding `NEXT_TAG_CACHE_D1` → id do `shift90d-cache`

Depois regenere os tipos:

```bash
npm run cf:typegen
```

## 5. Aplicar as migrations no banco remoto

```bash
npm run db:migrate:remote   # wrangler d1 migrations apply DB --remote
```

## 6. Seed do admin (banco limpo)

```bash
SEED_ADMIN_EMAIL='admin@admin.com' \
SEED_ADMIN_PASSWORD='<senha-forte-aqui>' \
SEED_ADMIN_NAME='Admin' \
npm run db:seed:gen        # gera scripts/seed.sql com o hash scrypt

npm run db:seed:remote     # aplica no D1 remoto
```

> A senha é hasheada pelo próprio Better Auth (scrypt). O admin usa
> `email === 'admin@admin.com'` para os privilégios de sábado — mantenha esse email
> se quiser o painel de sábados, ou ajuste o check em `api/sabados` e `BottomNav`.

## 7. Servir o R2 publicamente + domínio

O app monta URLs de imagem como `${NEXT_PUBLIC_R2_PUBLIC_URL}/<key>`. Duas opções:

**a) Domínio custom no bucket (recomendado — cache CDN automático):**
No dashboard R2 → bucket `shift90d-photos` → Settings → Custom Domains → conectar
um subdomínio (ex.: `media.seudominio.com`). Requer a zona na Cloudflare. O DNS pode
ser criado via `lab cf dns create <zona>` se a zona estiver na conta.

**b) r2.dev (rápido, sem domínio):** habilitar "Public access" no bucket e usar a URL
`https://pub-xxxx.r2.dev` (rate-limited, ok pra piloto).

Defina o valor escolhido como secret/var de produção:

```bash
wrangler secret put NEXT_PUBLIC_R2_PUBLIC_URL   # ou configure em vars do wrangler.jsonc
```

## 8. Secrets de produção (Better Auth)

```bash
# Gere um secret forte (32+ bytes)
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BETTER_AUTH_URL            # ex.: https://app.seudominio.com
wrangler secret put NEXT_PUBLIC_BETTER_AUTH_URL # mesma URL pública do app
```

## 9. Deploy

```bash
npm run cf:deploy   # opennextjs-cloudflare build && deploy
```

## 10. Custom domain do Worker + UAT

- Aponte o domínio do app pro Worker (dashboard Workers → Custom Domains, ou
  `lab cf dns create <zona>` pro registro).
- Smoke test manual: login (admin), criar post (ganha 1 ponto), curtir, comentar,
  ver ranking, ver perfil, registrar sábado (como admin).

## Riscos conhecidos (do design)

- **CPU 10ms / free tier**: SSR com auth + feed pode estourar sob carga. Se `cf:deploy`
  reportar CPU limit, subir pro Workers Paid ($5/mês).
- **Middleware `experimental-edge`**: o Next 16 depreca `middleware.ts` em favor de
  `proxy.ts` (Node-only), mas `proxy` reintroduz o bug do `async_hooks` no Workers.
  Mantido `middleware.ts` + `runtime: 'experimental-edge'` até o adapter estabilizar
  (ver `cloudflare/workers-sdk#13755`).
