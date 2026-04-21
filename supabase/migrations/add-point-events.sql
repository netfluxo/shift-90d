-- Migration: Add point_events table
-- Ledger imutável de origem dos pontos: post, sábado presencial, ou compensação manual.
-- Rodar no Supabase dashboard (SQL Editor).
--
-- Rollback: DROP TABLE IF EXISTS public.point_events CASCADE;

CREATE TABLE public.point_events (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_date   DATE    NOT NULL,
  source       TEXT    NOT NULL CHECK (source IN ('post', 'saturday_attendance', 'compensation')),
  points_delta INTEGER NOT NULL,
  post_id      UUID    REFERENCES public.posts(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_point_events_user_id   ON public.point_events(user_id);
CREATE INDEX idx_point_events_user_date ON public.point_events(user_id, event_date);
CREATE INDEX idx_point_events_source    ON public.point_events(source);

ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own point events"
  ON public.point_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
