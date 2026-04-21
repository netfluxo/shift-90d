# Flow de Pontuação — Shift 90D

## Regra central

**1 ponto por dia, por usuário.** Só o primeiro post do dia pontua. Posts subsequentes no mesmo dia são registrados mas não geram pontos.

## Entrypoint

`POST /api/posts` — `src/app/api/posts/route.ts`

## Passo a passo

```
1. Autenticação via Supabase Auth
2. Conta posts do usuário HOJE (timezone Brasil, UTC-3)
   → janela: T00:00:00-03:00 até T23:59:59-03:00
3. Se posts_hoje < 1  →  shouldAwardPoints = true
4. Insere o post na tabela `posts`
5. Se shouldAwardPoints:
   a. Incrementa users.points + 1  (fallback chain — ver abaixo)
   b. Upsert em user_activity (user_id + activity_date = chave única)
      → posts_count++, points_earned = 1
6. Se NOT shouldAwardPoints:
   a. Upsert em user_activity
      → posts_count++, points_earned = 1 (já no limite)
7. Retorna: { post, points_awarded, daily_posts_count, daily_limit_reached }
```

## Fallback chain de incremento

O código tenta três formas em sequência:

1. `rpc('increment_points', { increment: 1 })` — RPC específica
2. `rpc('increment', { row_id, table_name, column_name, increment_by })` — RPC genérica
3. Leitura manual de `users.points` + update com valor + 1 (não atômico)

## Tabelas envolvidas

| Tabela | Campo | Papel |
|---|---|---|
| `users` | `points` | Pontuação total acumulada — usada no ranking |
| `user_activity` | `posts_count`, `points_earned` | Log diário por usuário |

## O que NÃO gera pontos

- Likes (`POST /api/likes`) — apenas toggle like/unlike
- Comments (`POST /api/comments`) — sem pontuação

## Pontos manuais em `users.points`

**Os pontos em `users.points` podem não bater com os dias únicos de post na tabela `posts`.** Isso é intencional. Existem duas fontes de pontos manuais:

1. **Sábados presenciais**: o Yuri adiciona +1 ponto manualmente para quem comparece à aula presencial de sábado. São 10 sábados até 17/04/2026.
2. **Compensação por queda do sistema**: quando o app ficou fora do ar e o usuário não conseguiu postar, o ponto do dia foi adicionado manualmente. Identificável quando o total manual = 11 (10 sábados + 1 compensação).

**Como auditar**: pontos manuais = `users.points - COUNT(DISTINCT toBRTDate(posts.created_at))`. Valores esperados: entre 0 e 11 (10 sábados + eventual compensação). Qualquer valor acima de 11 seria anomalia real.

Ao analisar pontuação, **não usar a contagem de posts como fonte de verdade absoluta para `users.points`**. O campo `users.points` é a fonte canônica do ranking.

## Armadilhas de timezone ao analisar posts

O campo `created_at` em `posts` é armazenado em UTC no Supabase. O sistema define "dia" no fuso **BRT (UTC-3)**, conforme a lógica em `src/lib/utils/timezone.ts`.

**Conversão correta em scripts Node.js:**
```js
function toBRTDate(isoString) {
  const ms = new Date(isoString).getTime();
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}
```

**Erro comum**: usar `getHours()` em vez de cálculo por timestamp. No Mac com timezone BRT, `getHours()` já retorna hora local (BRT), então subtrair 3h novamente resulta em UTC-6 — move posts das primeiras horas da manhã para o dia anterior incorretamente.

## RLS em `user_activity`

A tabela `user_activity` tem RLS com `TO authenticated` — **não é acessível com a publishable key** (anon). Queries com a publishable key retornam array vazio silenciosamente, sem erro. Para ler `user_activity`, é necessário a service role key ou uma sessão autenticada.

## Problemas conhecidos

**Race condition no fallback manual**: o fallback 3 (leitura + update) não é atômico. Dois requests simultâneos podem ler o mesmo `points` e um incremento se perde. Baixo risco na prática (regra é 1 post/dia), mas a RPC deveria ser a única via.

**Bug sutil em `user_activity`**: quando `shouldAwardPoints = false`, o upsert hardcoda `points_earned: 1` mesmo que a row ainda não existisse. Inofensivo na prática mas semanticamente errado.

**Sem pontuação por engajamento**: confirmado intencional — só posts evidenciam atividade física.
