-- ============================================================
-- Tilføj original_price-kolonne til bikes-tabellen
-- ============================================================
-- Bruges af "↓ Reduceret fra X → Y kr."-badgen i bike-detail og
-- bike-card. Sættes ved oprettelse af en annonce og opdateres
-- ALDRIG igen. Hvis nuværende price er lavere end original_price,
-- viser frontend pris-reduktions-badge.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Tilføj kolonnen (idempotent)
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS original_price integer DEFAULT NULL;

-- Backfill eksisterende annoncer: sæt original_price = nuværende price
-- (vi ved ikke om de er blevet prisreguleret før, så vi antager dette er
-- startprisen — det betyder bare at gamle annoncer ikke får badgen før
-- en fremtidig prisreduktion)
UPDATE bikes
  SET original_price = price
  WHERE original_price IS NULL;

-- Komment: vi sætter ikke NOT NULL på kolonnen for at undgå breaking
-- changes på eventuelle INSERTS der ikke har feltet med (frontend sender
-- altid feltet efter denne migration, men API-clients eller andre paths
-- kan komme bagud).
