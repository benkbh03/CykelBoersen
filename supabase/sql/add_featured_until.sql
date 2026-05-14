-- ============================================================
-- Tilføj featured_until-kolonne til profiles
-- ============================================================
-- Driver "⭐ Anbefalet"-badge og top-placering på forsiden + /forhandlere.
-- Når featured_until > NOW() vises forhandleren først.
-- Når datoen passeres, falder de automatisk tilbage til normal placering.
--
-- Samme felt bruges senere af Stripe-webhook'en til at sætte datoen
-- automatisk når forhandleren betaler for fremhævet plads.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Tilføj kolonnen (idempotent — kan re-køres)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS featured_until timestamptz DEFAULT NULL;

-- Index på featured_until så ORDER BY ved listevisning er hurtig
CREATE INDEX IF NOT EXISTS idx_profiles_featured_until
  ON profiles(featured_until)
  WHERE featured_until IS NOT NULL;

-- RLS: featured_until er offentlig info (vises på forsiden) — alle kan læse.
-- Den eksisterende SELECT-policy på profiles dækker dette uden ændringer.

-- INGEN UPDATE-policy ændring nødvendig:
-- - Forhandlere SKAL IKKE selv kunne sætte featured_until via almindelig UPDATE
-- - Kun admin (via Supabase Dashboard manuelt nu, via edge function senere)
--   kan sætte feltet — det sker via service_role-key som bypasser RLS

-- Backfill: ingen — alle eksisterende rækker får NULL automatisk
-- (= ingen er featured som default, hvilket er den korrekte tilstand)
