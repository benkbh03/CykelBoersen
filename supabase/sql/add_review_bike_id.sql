-- ============================================================
-- Tilføj bike_id til reviews — fixer 400 + aktiverer "verificeret salg"
-- ============================================================
-- trust-score.js (fetchTrustData) forespørger reviews.bike_id for at
-- skelne "verificerede salg" (anmeldelser knyttet til en konkret handel)
-- fra øvrige anmeldelser. Kolonnen fandtes ikke → PostgREST returnerede
-- 400 Bad Request hver gang en annonce-side hentede sælgerens trust-data.
--
-- Denne migration tilføjer kolonnen, så SELECT'en holder op med at fejle.
-- Kolonnen er nullable og uudfyldt indtil videre → trust-queryen returnerer
-- bare 0 "verificerede salg" (samme effekt som før, men uden 400-fejlen).
-- Selve udfyldningen af bike_id ved nye anmeldelser kan tilføjes senere som
-- en separat opgave, når kolonnen er bekræftet live.
--
-- ON DELETE SET NULL: hvis en annonce slettes hårdt, mister anmeldelsen
-- bare sin bike-reference, men selve anmeldelsen + rating består.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS bike_id uuid REFERENCES bikes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_bike_id ON reviews(bike_id);
