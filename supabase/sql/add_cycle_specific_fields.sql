-- Cykel-specifikke strukturerede felter
-- Tilføjer felter der gør CykelBørsen mere fagligt detaljeret end DBA.
-- Bruges til avanceret filtrering, pris-intelligens og long-term moat-data.
--
-- Kør i Supabase Dashboard → SQL Editor → Run.
-- Kan køres gentagne gange (IF NOT EXISTS).

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS groupset            TEXT,
  ADD COLUMN IF NOT EXISTS frame_material      TEXT,
  ADD COLUMN IF NOT EXISTS brake_type          TEXT,
  ADD COLUMN IF NOT EXISTS electronic_shifting BOOLEAN,
  ADD COLUMN IF NOT EXISTS weight_kg           DECIMAL(4,2);

-- Indexer på de mest filtrerede felter (groupset + brake_type bruges i racer/MTB/gravel-søg)
CREATE INDEX IF NOT EXISTS idx_bikes_groupset       ON bikes(groupset)       WHERE groupset       IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bikes_frame_material ON bikes(frame_material) WHERE frame_material IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bikes_brake_type     ON bikes(brake_type)     WHERE brake_type     IS NOT NULL;

-- Kommentarer til dokumentation (vises i Supabase Dashboard)
COMMENT ON COLUMN bikes.groupset            IS 'Komponentgruppe — fx "Shimano 105", "SRAM Rival", "Shimano Deore XT"';
COMMENT ON COLUMN bikes.frame_material      IS 'Stelmaterial — Carbon | Aluminium | Stål | Titanium';
COMMENT ON COLUMN bikes.brake_type          IS 'Bremsetype — Skivebremser hydrauliske | Skivebremser mekaniske | Felgbremser | Tromlebremser';
COMMENT ON COLUMN bikes.electronic_shifting IS 'TRUE for elektronisk gear (Di2, eTap, AXS), FALSE for mekanisk';
COMMENT ON COLUMN bikes.weight_kg           IS 'Cyklens vægt i kg, fx 7.85';
