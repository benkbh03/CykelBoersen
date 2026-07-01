-- ============================================================
-- add_listing_category.sql
-- Introducerer en top-level "category" på bikes-tabellen, så platformen
-- kan rumme mere end komplette cykler (fase 1: "tilbehoer").
--
-- category = 'cykel' (default, alle eksisterende annoncer) | 'tilbehoer'
--
-- category er en HÅRD top-level akse: alle liste-queries scopes på den, så
-- cykler og tilbehør aldrig blandes. `type` genbruges som underkategori
-- (cykel-typer for 'cykel', tilbehørs-underkategorier for 'tilbehoer').
--
-- Idempotent — sikker at køre igen.
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'cykel';

-- Index til de kategori-scopede liste-queries (forside, filtre, tællere).
CREATE INDEX IF NOT EXISTS idx_bikes_category_active
  ON bikes (category, is_active);

-- Defensiv: sørg for at eventuelle NULL-rækker (hvis kolonnen fandtes uden
-- default) sættes til 'cykel'.
UPDATE bikes SET category = 'cykel' WHERE category IS NULL;
