-- ============================================================
-- Tilføj sold_via-kolonne til bikes
-- ============================================================
-- Anti-gaming fase 2: differentiér mellem "Solgt på Cykelbørsen" og
-- "Solgt eksternt" (Facebook, ven, butik osv.).
--
-- - Platform-salg har en køber-bruger associated → kan reviewes
--   → tæller i trust-scoren
-- - Eksterne salg har ingen køber-bruger → kan ikke reviewes
--   → tæller IKKE i trust-scoren
--
-- Frontend "Sæt solgt"-flow viser allerede buyer-picker-modal hvor
-- sælger vælger køberen blandt dem der har skrevet til ham om annoncen,
-- eller vælger "Ingen af disse / ekstern handel". Det valg afgør nu
-- også sold_via-værdien.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Tilføj kolonnen (idempotent)
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS sold_via text DEFAULT NULL
  CHECK (sold_via IS NULL OR sold_via IN ('platform', 'external'));

-- Backfill: eksisterende inactive bikes uden sold_via sættes til 'external'
-- (konservativt — vi kan ikke retrospektivt verificere om de blev solgt via
-- platformen). Det betyder gamle "solgte" cykler ikke tæller i trust-scoren
-- før der ER nye platform-salg. Det er ærligt.
UPDATE bikes
  SET sold_via = 'external'
  WHERE is_active = false
    AND sold_via IS NULL;

-- Aktive cykler beholder NULL (de er ikke solgt endnu)
-- Når trust-score-beregningen flytter til at bruge sold_via='platform' som
-- supplerende filter er backfill = 'external' den sikre default
