-- Sikkerhedshærdning: forhindrer brugere i at selv-promovere via direkte profile-update
-- Baseret på audit 2026-05-08. Skal køres i Supabase Dashboard → SQL Editor.

-- ── 1. Trigger der beskytter privilegerede kolonner på profiles ──────────
--
-- Den eksisterende UPDATE-policy "Ejer eller admin kan opdatere profil" har
-- WITH CHECK = NULL, hvilket betyder en bruger kan ændre ALLE kolonner på sin
-- egen row — inkl. is_admin, verified, id_verified osv. Trigger'en blokerer
-- ændringer til privilegerede kolonner medmindre kalderen er admin eller
-- service-role (som bruges af edge functions).

CREATE OR REPLACE FUNCTION protect_privileged_profile_columns()
RETURNS trigger AS $$
DECLARE
  is_admin_caller boolean;
BEGIN
  -- service-role har auth.uid() = NULL og må alt
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO is_admin_caller
  FROM profiles p WHERE p.id = auth.uid();

  IF is_admin_caller THEN
    RETURN NEW;
  END IF;

  -- Almindelig bruger: privilegerede kolonner må ikke ændres
  IF NEW.is_admin       IS DISTINCT FROM OLD.is_admin       THEN RAISE EXCEPTION 'Kan ikke ændre is_admin'; END IF;
  IF NEW.id_verified    IS DISTINCT FROM OLD.id_verified    THEN RAISE EXCEPTION 'Kan ikke ændre id_verified'; END IF;
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN RAISE EXCEPTION 'Kan ikke ændre email_verified'; END IF;

  -- verified: må aldrig sættes til true af bruger (kun admin via admin-actions edge function)
  IF NEW.verified IS DISTINCT FROM OLD.verified AND NEW.verified = true THEN
    RAISE EXCEPTION 'Kan ikke selv-promovere til verificeret forhandler';
  END IF;

  -- seller_type: tillader self-service ansøgning (private → dealer); ikke andre overgange
  IF NEW.seller_type IS DISTINCT FROM OLD.seller_type THEN
    IF NOT (COALESCE(OLD.seller_type, 'private') = 'private' AND NEW.seller_type = 'dealer') THEN
      RAISE EXCEPTION 'Kan ikke ændre seller_type';
    END IF;
  END IF;

  -- Stripe-kolonner sættes af stripe-webhook (service-role) — bruger må aldrig ændre dem
  IF NEW.stripe_customer_id         IS DISTINCT FROM OLD.stripe_customer_id         THEN RAISE EXCEPTION 'Kan ikke ændre stripe_customer_id'; END IF;
  IF NEW.stripe_subscription_status IS DISTINCT FROM OLD.stripe_subscription_status THEN RAISE EXCEPTION 'Kan ikke ændre stripe_subscription_status'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_columns ON profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_privileged_profile_columns();

-- ── 2. RLS på dealer_applications og id_applications ────────────────────
-- Sikkerhedsnet hvis disse tabeller eksisterer uden policies

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='dealer_applications') THEN
    EXECUTE 'ALTER TABLE dealer_applications ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS dealer_applications_select_admin ON dealer_applications';
    EXECUTE 'CREATE POLICY dealer_applications_select_admin ON dealer_applications FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
             OR auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS dealer_applications_insert_self ON dealer_applications';
    EXECUTE 'CREATE POLICY dealer_applications_insert_self ON dealer_applications FOR INSERT
      WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='id_applications') THEN
    EXECUTE 'ALTER TABLE id_applications ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS id_applications_select_self_or_admin ON id_applications';
    EXECUTE 'CREATE POLICY id_applications_select_self_or_admin ON id_applications FOR SELECT
      USING (auth.uid() = user_id
             OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))';

    EXECUTE 'DROP POLICY IF EXISTS id_applications_insert_self ON id_applications';
    EXECUTE 'CREATE POLICY id_applications_insert_self ON id_applications FOR INSERT
      WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- ── 3. Auto-sync email_verified fra auth.users ─────────────────────────
-- Når en bruger bekræfter sin e-mail (via Supabase Auth's link), sættes
-- auth.users.email_confirmed_at automatisk. Vi propagerer det til
-- profiles.email_verified via en trigger på auth.users, så vi ikke længere
-- behøver klient-side .update({email_verified:true})-kald (som triggeren
-- nu blokerer).

CREATE OR REPLACE FUNCTION sync_email_verified_to_profile()
RETURNS trigger AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND
     (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at) THEN
    UPDATE profiles SET email_verified = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_email_verified ON auth.users;
CREATE TRIGGER sync_email_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_email_verified_to_profile();

-- Kør backfill én gang så eksisterende verificerede brugere får flaget korrekt:
UPDATE profiles SET email_verified = true
WHERE id IN (SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL)
  AND email_verified IS DISTINCT FROM true;

-- ── 4. Rate-limit tabel + notify-sent flag på bikes ─────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope        text        NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, scope)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Ingen policies = service-role-only (edge functions bruger service-role)

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS notify_sent_at timestamptz;
