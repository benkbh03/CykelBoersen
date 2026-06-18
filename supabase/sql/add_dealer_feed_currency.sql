-- ============================================================
-- Forhandler-feed: valuta-kolonne til pris-omregning
-- ============================================================
-- Shopify products.json serverer butikkens PRIMÆRE valuta (fx EUR) og
-- ignorerer locale-cookies. Importeres prisen råt, bliver fx 629 EUR til
-- "629 kr" i stedet for ~4.692 kr. Edge-functionen import-dealer-feed
-- registrerer valutaen automatisk (via /cart.js) og omregner til DKK.
-- Denne kolonne lader admin overstyre valutaen manuelt pr. feed.
--
--   'auto' (default) → registrér butikkens valuta automatisk (Shopify), ellers DKK
--   'DKK','EUR','SEK','NOK','USD','GBP','PLN','CHF' → omregn fra denne valuta
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at gentage.
-- ============================================================

ALTER TABLE dealer_feeds
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'auto';
