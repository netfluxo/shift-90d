-- Migration: user_points_view + afrouxa RLS de point_events
--
-- Usa point_events como fonte de verdade para pontos exibidos no ranking/perfil.
-- Ajusta a policy de SELECT em point_events para permitir leitura por qualquer
-- authenticated user — pontos já são públicos via ranking, então manter RLS restrito
-- ao próprio usuário faria a view agregar apenas os próprios eventos.
--
-- Rodar no Supabase dashboard (SQL Editor).
--
-- Rollback:
--   DROP VIEW IF EXISTS public.user_points_view;
--   DROP POLICY IF EXISTS "Authenticated users can view all point events" ON public.point_events;
--   CREATE POLICY "Users can view own point events"
--     ON public.point_events FOR SELECT TO authenticated
--     USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own point events" ON public.point_events;
DROP POLICY IF EXISTS "Authenticated users can view all point events" ON public.point_events;
DROP POLICY IF EXISTS "Users can insert own post events" ON public.point_events;
DROP POLICY IF EXISTS "Users can update own post events" ON public.point_events;
DROP POLICY IF EXISTS "Users can delete own post events" ON public.point_events;

CREATE POLICY "Authenticated users can view all point events"
  ON public.point_events FOR SELECT TO authenticated
  USING (true);

-- INSERT: usuário autenticado pode criar eventos de post para si mesmo.
-- Sábado presencial e compensação continuam restritos (inserção manual via dashboard).
CREATE POLICY "Users can insert own post events"
  ON public.point_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND source = 'post');

-- UPDATE: necessário para realocar post_id quando o post que gerou o ponto é
-- deletado mas ainda há outros posts no mesmo dia (relink do evento órfão).
CREATE POLICY "Users can update own post events"
  ON public.point_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND source = 'post')
  WITH CHECK (auth.uid() = user_id AND source = 'post');

CREATE OR REPLACE VIEW public.user_points_view AS
SELECT
  u.id,
  u.name,
  u.avatar_url,
  u.created_at,
  COALESCE((
    SELECT SUM(points_delta)::INTEGER
    FROM public.point_events
    WHERE user_id = u.id
  ), 0) AS points,
  COALESCE((
    SELECT COUNT(DISTINCT event_date)::INTEGER
    FROM public.point_events
    WHERE user_id = u.id AND source = 'post'
  ), 0) AS active_days
FROM public.users u;

GRANT SELECT ON public.user_points_view TO authenticated;
