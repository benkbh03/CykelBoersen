-- ============================================================
-- Tilføj price_drop_watches-tabel
-- ============================================================
-- Bruges af "🔔 Få besked ved prisfald"-knappen på bike-detail.
-- En bruger kan "watche" en cykel ved en bestemt pris, og når
-- sælgeren senere reducerer prisen under det niveau, sender en
-- edge function en email-notifikation.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS price_drop_watches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bike_id          uuid        NOT NULL REFERENCES bikes(id)       ON DELETE CASCADE,
  watched_at_price integer     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  UNIQUE (user_id, bike_id)
);

-- Indekser til hurtige opslag når en pris reduceres (alle watches på en bike)
CREATE INDEX IF NOT EXISTS idx_price_drop_watches_bike ON price_drop_watches(bike_id);
CREATE INDEX IF NOT EXISTS idx_price_drop_watches_user ON price_drop_watches(user_id);

-- Row Level Security: brugere må kun se og ændre deres egne watches
ALTER TABLE price_drop_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own price-drop watches" ON price_drop_watches;
CREATE POLICY "Users can read own price-drop watches"
  ON price_drop_watches FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own price-drop watches" ON price_drop_watches;
CREATE POLICY "Users can insert own price-drop watches"
  ON price_drop_watches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own price-drop watches" ON price_drop_watches;
CREATE POLICY "Users can delete own price-drop watches"
  ON price_drop_watches FOR DELETE
  USING (auth.uid() = user_id);

-- Service role (edge functions) skal kunne læse på tværs af brugere for at
-- finde alle der watcher en bike når prisen reduceres
DROP POLICY IF EXISTS "Service role can read all watches" ON price_drop_watches;
CREATE POLICY "Service role can read all watches"
  ON price_drop_watches FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can update notification timestamp" ON price_drop_watches;
CREATE POLICY "Service role can update notification timestamp"
  ON price_drop_watches FOR UPDATE
  TO service_role
  USING (true);
