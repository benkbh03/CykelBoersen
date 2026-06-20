-- ============================================================
-- Forhandler-feed: pris-afrunding (for geo-routede Shopify-butikker)
-- ============================================================
-- Nogle Shopify-butikker viser kun deres danske DKK-priser via IP-geolocation
-- (intet dansk markeds-URL). Vores edge-function kan derfor kun få fremmed
-- valuta (fx EUR) og FX-omregne — hvilket aldrig rammer butikkens "pæne"
-- danske priser (fx 4.699). Denne indstilling afrunder FX-resultatet til
-- butikkens pris-mønster, så det rammer præcist.
--
--   'none' (default) → ingen afrunding
--   '99'  → nærmeste x99 (fx 4.692 → 4.699)
--   '95'  → nærmeste x95
--   '50'  → nærmeste 50
--   '100' → nærmeste 100
--
-- Afrunding anvendes KUN på FX-omregnede priser — eksakte DKK-priser røres ikke.
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at gentage.
-- ============================================================

ALTER TABLE dealer_feeds
  ADD COLUMN IF NOT EXISTS price_round text NOT NULL DEFAULT 'none';
