-- ══════════════════════════════════════════════════════════════
-- saved_bikes: UNIQUE constraint + RLS til "Interesserede" flow
-- ══════════════════════════════════════════════════════════════

-- 1. Undgå duplikater (idempotent — fejler ikke hvis den allerede eksisterer)
ALTER TABLE saved_bikes
  ADD CONSTRAINT saved_bikes_user_bike_unique UNIQUE (user_id, bike_id);

-- 2. RLS: enable (kør kun hvis ikke allerede enabled)
ALTER TABLE saved_bikes ENABLE ROW LEVEL SECURITY;

-- 3. Bruger kan se og redigere egne saves
CREATE POLICY "Bruger kan se egne saves"
  ON saved_bikes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Bruger kan indsætte eget save"
  ON saved_bikes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Bruger kan slette eget save"
  ON saved_bikes FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Cykelejeren må se hvem der har gemt DERES annoncer
--    (bruges til "Interesserede brugere"-sektionen)
CREATE POLICY "Ejer af bike kan se interesserede"
  ON saved_bikes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bikes
      WHERE bikes.id = saved_bikes.bike_id
        AND bikes.user_id = auth.uid()
    )
  );
