-- ============================================================
-- Cykelbørsen – Stripe Connect (udlejnings-platform)
-- ============================================================
-- Kør dette SQL i Supabase Dashboard → SQL Editor → Run.
-- Idempotent (IF NOT EXISTS) — sikker at køre igen.
--
-- Formål: gør forhandlere til Stripe Connect-modtagere, så CykelBørsen kan
-- være betalings-mellemmand for cykeludlejning (destination charges med
-- platform-kommission). Forhandleren er "merchant of record" — det holder
-- platformen ude af licenspligt (PSD2).
--
-- FORUDSÆTNINGER:
--   1. Stripe Connect er AKTIVERET i Stripe Dashboard (Connect → kom i gang).
--   2. Edge function 'connect-onboarding' er deployet.
--   3. 'stripe-webhook' lytter også på 'account.updated'-events.
-- ============================================================

-- Connect-konto-kolonner på profiles (kun relevant for forhandlere)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id     TEXT,
  -- none | pending | enabled | disabled
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT DEFAULT 'none';

-- Hurtigt opslag på Connect-konto (bruges af webhook account.updated)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_account_id
  ON public.profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ============================================================
-- Læse-adgang: stripe_account_status skal kunne læses af forhandleren selv
-- (til at gate udlejnings-features i UI). stripe_account_id er en intern
-- reference — den eksponeres ikke til klienten via de normale .select()-felter.
-- Profiles har allerede RLS; ingen ny policy nødvendig, da forhandleren
-- læser sin egen række. Feltet må IKKE indgå i offentlige profil-selects.
-- ============================================================
