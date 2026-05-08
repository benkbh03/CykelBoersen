-- Forhandler-udvidelser: åbningstider, website + sociale links,
-- services-tags, samt dealer_followers-tabel til "Følg forhandler"-funktion.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS opening_hours jsonb,
  ADD COLUMN IF NOT EXISTS website       text,
  ADD COLUMN IF NOT EXISTS facebook      text,
  ADD COLUMN IF NOT EXISTS instagram     text,
  ADD COLUMN IF NOT EXISTS services      text[] NOT NULL DEFAULT '{}';

-- opening_hours-format: { mon: { open: "09:00", close: "17:30", closed: false }, tue: {...}, ... }
-- services-værdier: 'reparation' | 'custombyg' | 'leasing' | 'afhentning' | 'levering' | 'tradein'

CREATE TABLE IF NOT EXISTS dealer_followers (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dealer_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dealer_id)
);

CREATE INDEX IF NOT EXISTS idx_dealer_followers_dealer ON dealer_followers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_followers_user   ON dealer_followers(user_id);

ALTER TABLE dealer_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dealer_followers_select_self" ON dealer_followers;
CREATE POLICY "dealer_followers_select_self"
  ON dealer_followers FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = dealer_id);

DROP POLICY IF EXISTS "dealer_followers_insert_self" ON dealer_followers;
CREATE POLICY "dealer_followers_insert_self"
  ON dealer_followers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dealer_followers_delete_self" ON dealer_followers;
CREATE POLICY "dealer_followers_delete_self"
  ON dealer_followers FOR DELETE
  USING (auth.uid() = user_id);
