-- ============================================================
-- bikes.geartype: gear-system (indvendig vs. udvendig)
-- ============================================================
-- Eksakt-match-filter (som suspension/motor_position/frame_material).
-- Kanoniske værdier (skal matche frontend + edge functions):
--   'Indvendig' (navgear, fx Shimano Nexus/Alfine, Enviolo)
--   'Udvendig'  (kædeskifter / derailleur)
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS geartype TEXT;

CREATE INDEX IF NOT EXISTS idx_bikes_geartype
  ON bikes(geartype) WHERE geartype IS NOT NULL;
