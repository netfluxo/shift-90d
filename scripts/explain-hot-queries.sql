-- Planos das queries de leitura mais quentes. Serve de regressão de performance:
-- nenhuma saída deve conter `SCAN <tabela>` sem índice, `AUTOMATIC COVERING INDEX`
-- ou `USE TEMP B-TREE FOR ORDER BY`.
--
-- Uso:
--   npx wrangler d1 execute DB --remote --file=./scripts/explain-hot-queries.sql
--
-- Os placeholders são literais de propósito: EXPLAIN QUERY PLAN não aceita bind
-- de parâmetro pelo wrangler. Os valores não afetam o plano.

-- getFeed, primeira página (sem cursor).
EXPLAIN QUERY PLAN
SELECT posts.id, posts.user_id, posts.created_at, users.name, users.avatar_url,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM likes WHERE likes.post_id = posts.id),
       (SELECT CAST(COUNT(*) AS INTEGER) FROM comments WHERE comments.post_id = posts.id),
       (SELECT EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = 'x'))
FROM posts INNER JOIN users ON users.id = posts.user_id
ORDER BY posts.created_at DESC, posts.id DESC
LIMIT 11;

-- getFeed, páginas seguintes (keyset).
EXPLAIN QUERY PLAN
SELECT posts.id, users.name,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM likes WHERE likes.post_id = posts.id)
FROM posts INNER JOIN users ON users.id = posts.user_id
WHERE posts.created_at < 1785087674
   OR (posts.created_at = 1785087674 AND posts.id < 'zzz')
ORDER BY posts.created_at DESC, posts.id DESC
LIMIT 11;

-- getRanking.
EXPLAIN QUERY PLAN
SELECT users.id, users.name, user_points.points, user_points.active_days
FROM user_points INNER JOIN users ON users.id = user_points.user_id
WHERE user_points.points > 0
ORDER BY user_points.points DESC
LIMIT 100;

-- getUserPosts (perfil).
EXPLAIN QUERY PLAN
SELECT posts.id, users.name,
       (SELECT CAST(COUNT(*) AS INTEGER) FROM likes WHERE likes.post_id = posts.id)
FROM posts INNER JOIN users ON users.id = posts.user_id
WHERE posts.user_id = 'x'
ORDER BY posts.created_at DESC, posts.id DESC;

-- getUserActivity: streak dentro da janela.
EXPLAIN QUERY PLAN
SELECT created_at FROM posts
WHERE user_id = 'x' AND created_at >= 1776500000
ORDER BY created_at DESC;

-- createPost: contagem do dia.
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM posts
WHERE user_id = 'x' AND created_at >= 1785000000 AND created_at < 1785086400;

-- Triggers de user_points: recompute por usuário.
EXPLAIN QUERY PLAN
SELECT COUNT(DISTINCT event_date) FROM point_events
WHERE user_id = 'x' AND source = 'post';
