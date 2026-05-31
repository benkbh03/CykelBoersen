-- ============================================================
-- Tilføj followed_sellers-tabel ("Følg sælger")
-- ============================================================
-- En bruger kan følge en sælger (forhandler eller privat). Når den
-- fulgte sælger lægger en ny annonce op, sender en edge function en
-- e-mail-notifikation til alle følgere.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS followed_sellers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, seller_id),
  CHECK (follower_id <> seller_id)
);

-- Indekser: hurtigt opslag af "hvem følger denne sælger" (notifikation) og
-- "hvem følger jeg" (følger-state + min-profil-liste)
CREATE INDEX IF NOT EXISTS idx_followed_sellers_seller   ON followed_sellers(seller_id);
CREATE INDEX IF NOT EXISTS idx_followed_sellers_follower ON followed_sellers(follower_id);

-- Row Level Security
ALTER TABLE followed_sellers ENABLE ROW LEVEL SECURITY;

-- Følgeren må læse sine egne follows (til "Følger"-state + liste)
DROP POLICY IF EXISTS "Users can read own follows" ON followed_sellers;
CREATE POLICY "Users can read own follows"
  ON followed_sellers FOR SELECT
  USING (auth.uid() = follower_id);

-- En sælger må læse hvem der følger dem (til følger-tæller på egen profil)
DROP POLICY IF EXISTS "Sellers can read their followers" ON followed_sellers;
CREATE POLICY "Sellers can read their followers"
  ON followed_sellers FOR SELECT
  USING (auth.uid() = seller_id);

-- Brugeren må kun oprette/slette follows hvor de selv er følgeren
DROP POLICY IF EXISTS "Users can follow" ON followed_sellers;
CREATE POLICY "Users can follow"
  ON followed_sellers FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON followed_sellers;
CREATE POLICY "Users can unfollow"
  ON followed_sellers FOR DELETE
  USING (auth.uid() = follower_id);

-- Service role (edge function) skal kunne læse alle follows for at finde
-- følgere når en sælger lægger en ny annonce op
DROP POLICY IF EXISTS "Service role can read all follows" ON followed_sellers;
CREATE POLICY "Service role can read all follows"
  ON followed_sellers FOR SELECT
  TO service_role
  USING (true);
