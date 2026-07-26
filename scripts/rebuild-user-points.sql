-- Reconstrói user_points a partir de point_events (fonte de verdade).
--
-- Uso:
--   npm run db:rebuild-points:local
--   npm run db:rebuild-points:remote
--
-- Idempotente. Rodar quando `verify-points-parity.sql` reportar divergência, ou
-- após qualquer carga de dados que tenha ocorrido com os triggers ausentes
-- (ex.: import de dump, restore de backup).

INSERT INTO user_points (user_id, points, active_days)
SELECT u.id,
       COALESCE(SUM(pe.points_delta), 0),
       COALESCE(COUNT(DISTINCT CASE WHEN pe.source = 'post' THEN pe.event_date END), 0)
FROM users u
LEFT JOIN point_events pe ON pe.user_id = u.id
GROUP BY u.id
ON CONFLICT(user_id) DO UPDATE SET points = excluded.points, active_days = excluded.active_days;
