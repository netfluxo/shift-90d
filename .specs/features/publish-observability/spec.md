# Spec — Observabilidade do fluxo de publicação

**Status**: Execute
**Criado**: 2026-08-25
**Escopo**: Medium (3 fixes independentes, sem decisão arquitetural)

## Problema

Dois participantes relataram falha ao publicar (Lukim em 16/08, Rafael em 24/08). A
investigação nos Workers Logs — habilitados em 20/08 — mostrou que **a publicação do
Rafael nunca chegou ao servidor**: 87 requests entre 19:41:53 e 19:46:05, todas HTTP 200,
nenhum `POST /api/upload`, nenhum `POST /api/posts`. O erro aconteceu no cliente, onde não
existe nenhuma instrumentação.

Perdemos o diagnóstico e, com ele, o ponto do participante — que precisou ser corrigido à
mão (`scripts/fix-lukim-2026-08-16.sql`).

## Causas identificadas

### RC1 — Falhas de cliente são invisíveis

O `catch` de `handleSubmit` em `CreatePost.tsx:153` faz `console.error(err)` no browser e
mostra "Erro ao criar post" ao usuário. Nada sai do dispositivo. As três etapas do fluxo
(resize via canvas, `POST /api/upload`, `POST /api/posts`) são indistinguíveis no
diagnóstico: qualquer uma que falhe produz a mesma mensagem genérica.

A validação de `handleFileChange` (`CreatePost.tsx:50`) também rejeita silenciosamente:
`validTypes` não inclui `video/quicktime` nem `image/heic`, formatos que um iPhone entrega.
O servidor, por outro lado, **já aceita** `video/quicktime` (`upload/route.ts:13`) — a
whitelist do cliente é mais restritiva que a do servidor, e a divergência não é registrada
em lugar nenhum.

### RC2 — `/api/auth/get-session` pendura e não serve para nada

`BottomNav.tsx:16` chama `useSession()`, que dispara `GET /api/auth/get-session` em toda
navegação (o componente está em `/feed`, `/ranking`, `/profile` e `/sabados`). Em 24/08,
**6 das 46 chamadas** ficaram abertas entre 47s e 314s e terminaram com
`outcome=canceled`, contra um p50 de 316ms.

O único uso da sessão é `isAdmin` (`BottomNav.tsx:17`), aplicado em
`item.adminOnly && !isAdmin` — mas **todos** os itens de `navItems` têm `adminOnly: false`.
É código morto: a request de rede não altera nada renderizado.

### RC3 — Prefetch multiplica render dinâmico de perfil

Os `<Link href={/profile/[id]}>` em `PostCard`, `RankingItem`, `CommentSection` e
`PostModal` usam prefetch default do Next. Na visita do Rafael isso gerou **76 requests a
`/profile/[id]` em ~20 segundos**. A página é `force-dynamic` e roda `getUserById` +
`getRanking(100)` + `getUserActivity` + `getUserPosts` (`profile/[id]/page.tsx:35-45`) —
quatro queries D1 por prefetch que o usuário provavelmente nunca vai abrir, no plano free.

## Requisitos

| ID | Requisito | Verificação |
|---|---|---|
| R1 | Falha em qualquer etapa do fluxo de publicação gera log no servidor, com `userId` e etapa | provocar erro no cliente → evento aparece nos Workers Logs |
| R2 | Rejeição de formato/tamanho no cliente é registrada | anexar `.mov` → log com `stage=validate` e o mime recusado |
| R3 | `/api/upload` e `/api/posts` logam sucesso e falha com `userId` | publicar → 2 eventos correlacionáveis por usuário |
| R4 | Navegar entre abas não dispara `/api/auth/get-session` | Workers Logs sem a rota após navegação |
| R5 | Comportamento visual do `BottomNav` inalterado | 4 abas, aba ativa destacada por `pathname` |
| R6 | Link para perfil de outro usuário não faz prefetch | feed carregado → nenhum GET a `/profile/[id]` sem clique |

## Fora de escopo

- **Aceitar `video/quicktime` e `image/heic` no cliente.** É o próximo passo provável, mas
  tem trade-off: `.mov` não toca em Chrome/Android e HEIC só decodifica em Safari, então
  mexer na whitelist sem dado é trocar uma falha por outra. R2 gera esse dado em dias.
- Corrigir a latência de cauda do Better Auth (R4 remove a dependência; não investiga a causa).
- Retry automático de upload.
- Rate limiting do endpoint de log (app fechado, ~60 contas; payload limitado a 2 kB).

## Rastreabilidade

RC1 → R1, R2, R3 · RC2 → R4, R5 · RC3 → R6
