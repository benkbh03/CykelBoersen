-- ============================================================
-- Admin on-behalf-of: forhandler-opt-in til onboarding-service
-- ============================================================
-- Tillader admin at oprette annoncer på vegne af forhandlere der
-- eksplicit har givet samtykke. GDPR art. 28 (databehandleraftale)
-- kræver eksplicit samtykke før behandling — admin_can_create_listings
-- er den hårde gate.
--
-- - admin_can_create_listings: opt-in fra forhandler
-- - admin_authorized_at: tidspunkt for opt-in (audit-bevis)
-- - admin_authorized_by: hvilken admin har sat flag-historikken (audit)
-- - created_by_admin_id på bikes: hvilken admin oprettede denne annonce
--
-- Forhandleren forbliver retsansvarlig sælger — admin er kun databehandler
-- der har fået eksplicit tilladelse til en specifik handling (insert af
-- bikes + bike_images). Ikke fuld impersonation.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Forhandler-opt-in til admin onboarding-service
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_can_create_listings boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_authorized_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Audit-trail: hvilken admin oprettede denne annonce på forhandlers vegne?
-- NULL betyder forhandler selv har oprettet den (standardsituation)
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Partial index til hurtigere audit-queries — kun rækker hvor admin
-- har oprettet, hvilket forventes at være lille minoritet
CREATE INDEX IF NOT EXISTS bikes_created_by_admin_idx
  ON bikes(created_by_admin_id) WHERE created_by_admin_id IS NOT NULL;

-- Backfill: alle eksisterende profiles får admin_can_create_listings=false
-- (default). Ingen automatisk opt-in.
