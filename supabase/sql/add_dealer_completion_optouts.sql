-- ============================================================
-- Tilføj 4 opt-out-kolonner til profiles
-- ============================================================
-- Bruges af "Profil X% komplet"-tracking på Min konto-siden:
-- forhandleren kan markere "vi tilbyder ikke dette" på 4 sektioner
-- (åbningstider, finance/trade-in, services, sociale links) for at
-- nå 100% completion uden at lyve om data de ikke har.
--
-- Logik i frontend: item-er 'done' hvis EITHER data udfyldt OR
-- opt-out=true. Forhandleren tager aktivt stilling.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hours_optout    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_optout   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS services_optout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_optout   boolean NOT NULL DEFAULT false;

-- Ingen backfill — default false betyder "ikke taget stilling endnu" → tæller
-- ikke som done. Eksisterende dealers fortsætter med samme completion-procent
-- som før, men kan nu nå 100% ved at krydse opt-out af relevante grupper.
