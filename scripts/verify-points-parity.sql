-- Verifica que user_points (agregado mantido por trigger) bate com a agregação
-- direta sobre point_events (a fonte de verdade).
--
-- Uso:
--   npx wrangler d1 execute DB --local  --file=./scripts/verify-points-parity.sql
--   npx wrangler d1 execute DB --remote --file=./scripts/verify-points-parity.sql
--
-- Esperado: divergences = 0 e missing_rows = 0.
-- Se divergir, rodar `npm run db:rebuild-points:remote` e investigar qual write
-- escapou dos triggers (checar `SELECT name FROM sqlite_master WHERE type='trigger'`).
--
-- Este é o substituto do teste automatizado: o repo não tem infra de teste e a
-- lógica de pontos não tem cobertura.

SELECT
  (SELECT COUNT(*) FROM (
     SELECT u.id,
            COALESCE(SUM(pe.points_delta), 0) AS p,
            COALESCE(COUNT(DISTINCT CASE WHEN pe.source = 'post' THEN pe.event_date END), 0) AS ad
     FROM users u
     LEFT JOIN point_events pe ON pe.user_id = u.id
     GROUP BY u.id
   ) calc
   LEFT JOIN user_points mp ON mp.user_id = calc.id
   WHERE COALESCE(mp.points, -999999) <> calc.p
      OR COALESCE(mp.active_days, -999999) <> calc.ad
  ) AS divergences,
  (SELECT COUNT(*) FROM users u
   WHERE NOT EXISTS (SELECT 1 FROM user_points mp WHERE mp.user_id = u.id)
  ) AS missing_rows,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger') AS triggers_present;
