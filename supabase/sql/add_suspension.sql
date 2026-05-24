-- ============================================================
-- bikes.suspension: affjedring (MTB/gravel/el-MTB)
-- ============================================================
-- Eksakt-match-filter (som motor_position/frame_material).
-- Kanoniske værdier (skal matche frontend + edge functions):
--   'Forgaffel (hardtail)' | 'Fuld affjedring (fully)' | 'Ingen (stiv)'
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS suspension TEXT;

CREATE INDEX IF NOT EXISTS idx_bikes_suspension
  ON bikes(suspension) WHERE suspension IS NOT NULL;
