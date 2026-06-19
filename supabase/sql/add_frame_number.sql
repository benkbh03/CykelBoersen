-- ============================================================
-- Stelnummer + tyveri-tjek (transparens-feature)
-- ============================================================
-- Brugere kan oplyse cyklens stelnummer (serienummer). Af hensyn til misbrug
-- (et offentligt fuldt stelnummer kan bruges til at "hvidvaske" en stjålet
-- cykel) GEMMER vi ALDRIG det fulde nummer — kun de sidste 4 cifre + resultatet
-- af et opslag mod tyveriregisteret BikeIndex. Selve opslaget sker i edge-
-- functionen check-frame-number (sender nummeret til BikeIndex, gemmer kun status).
--
--   frame_last4        : sidste 4 tegn (sikkert at vise — bruges til cross-check)
--   frame_check_status : 'clear' (ingen match) | 'match' (muligt match) | 'error'
--   frame_check_at     : hvornår tjekket blev kørt
--   frame_check_ref    : evt. link til match i BikeIndex
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at gentage.
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS frame_last4        text,
  ADD COLUMN IF NOT EXISTS frame_check_status text,
  ADD COLUMN IF NOT EXISTS frame_check_at     timestamptz,
  ADD COLUMN IF NOT EXISTS frame_check_ref    text;
