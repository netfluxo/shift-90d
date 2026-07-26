-- ANALYZE depois de user_points existir e estar populada.
--
-- O ANALYZE da 0002 rodou antes de 0003 criar a tabela, então o planner ficou sem
-- estatísticas para ela e escolhia varrer `users` como tabela externa no ranking:
-- 160 rows_read. Com estatísticas ele entra por idx_user_points_points e não
-- ordena: 81 rows_read.
--
-- Idempotente: reexecutar apenas recalcula sqlite_stat1.
ANALYZE;
