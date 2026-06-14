-- ============================================================
-- Fremhæv annonce (boost) — datamodel + sikker server-side kontrol
-- ============================================================
-- Lader en sælger (privat eller forhandler) fremhæve en annonce, så den
-- vises i "⭐ Fremhævede cykler"-sektionen på forsiden + får en gylden
-- badge/ramme. Spejler det eksisterende profiles.featured_until-mønster.
--
-- VIGTIGT om sikkerhed:
--   bikes har en owner-baseret UPDATE-adgang, så en bruger KAN i princippet
--   selv sætte featured_until via en almindelig UPDATE. Det blokerer vi med en
--   BEFORE UPDATE-trigger (samme princip som stripe-kolonnerne på profiles
--   beskyttes i harden_security.sql). featured_until kan herefter KUN sættes af:
--     1) service-role (auth.uid() IS NULL) — fx Stripe-webhook senere
--     2) en whitelisted RPC (claim_free_boost) der sætter en transaktions-lokal flag
--     3) en admin (manuelt)
--
-- Gratis intro-fremhævning: hver bruger får ÉN gratis 7-dages fremhævning
-- (ramp-up: fylder sektionen + varmer brugere op til betalt boost senere).
-- Sporet i en isoleret free_boosts-tabel (RLS uden policies) så brugeren ikke
-- kan nulstille sin egen kvote.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at køre igen.
-- ============================================================

-- 1. Kolonne + index på bikes
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS featured_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_bikes_featured_until
  ON bikes(featured_until) WHERE featured_until IS NOT NULL;

-- 2. Spor gratis intro-fremhævning (én pr. bruger). Isoleret tabel, RLS uden
--    policies = kun SECURITY DEFINER-funktionerne herunder kan læse/skrive den.
CREATE TABLE IF NOT EXISTS free_boosts (
  user_id uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  bike_id uuid,
  used_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE free_boosts ENABLE ROW LEVEL SECURITY;

-- 3. Beskyt featured_until mod direkte bruger-UPDATE
CREATE OR REPLACE FUNCTION protect_bike_featured_until()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Uændret featured_until? Lad alle andre opdateringer passere urørt.
  IF NEW.featured_until IS NOT DISTINCT FROM OLD.featured_until THEN
    RETURN NEW;
  END IF;

  -- service-role (auth.uid() IS NULL) må alt — fx Stripe-webhook
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Whitelisted RPC (claim_free_boost) sætter en transaktions-lokal flag
  IF current_setting('app.allow_featured_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Admin må sætte/justere manuelt via Dashboard
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'featured_until kan kun ændres via boost-funktionen eller betaling';
END;
$$;

DROP TRIGGER IF EXISTS protect_bike_featured ON bikes;
CREATE TRIGGER protect_bike_featured
  BEFORE UPDATE ON bikes
  FOR EACH ROW EXECUTE FUNCTION protect_bike_featured_until();

-- 4. Status-RPC: bruges af boost-modalen til at vise rette tilstand
CREATE OR REPLACE FUNCTION get_boost_status(p_bike_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_feat  timestamptz;
  v_used  boolean;
BEGIN
  SELECT user_id, featured_until INTO v_owner, v_feat
    FROM bikes WHERE id = p_bike_id;

  IF v_uid IS NULL THEN
    RETURN json_build_object('is_owner', false, 'free_available', false, 'featured_until', v_feat);
  END IF;

  SELECT EXISTS (SELECT 1 FROM free_boosts WHERE user_id = v_uid) INTO v_used;

  RETURN json_build_object(
    'is_owner',       (v_owner = v_uid),
    'free_available', (NOT v_used),
    'featured_until', v_feat
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_boost_status(uuid) TO authenticated;

-- 5. Indløs gratis intro-fremhævning (7 dage). Verificerer ejerskab + aktiv
--    annonce + at brugeren ikke allerede har brugt sin gratis boost.
CREATE OR REPLACE FUNCTION claim_free_boost(p_bike_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_active    boolean;
  v_current   timestamptz;
  v_new_until timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Log ind for at fremhæve din annonce';
  END IF;

  SELECT user_id, is_active, featured_until INTO v_owner, v_active, v_current
    FROM bikes WHERE id = p_bike_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Annoncen blev ikke fundet';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Du kan kun fremhæve dine egne annoncer';
  END IF;
  IF NOT COALESCE(v_active, false) THEN
    RAISE EXCEPTION 'Kun aktive annoncer kan fremhæves';
  END IF;

  -- Race-sikker kvote-tjek: lykkes kun hvis brugeren ikke allerede har brugt sin gratis boost
  INSERT INTO free_boosts (user_id, bike_id) VALUES (v_uid, p_bike_id)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Du har allerede brugt din gratis fremhævning';
  END IF;

  -- Forlæng hvis allerede fremhævet, ellers 7 dage fra nu
  v_new_until := GREATEST(now(), COALESCE(v_current, now())) + interval '7 days';

  -- Tillad featured_until-ændringen i netop denne transaktion (whitelistet)
  PERFORM set_config('app.allow_featured_update', 'on', true);
  UPDATE bikes SET featured_until = v_new_until WHERE id = p_bike_id;

  RETURN v_new_until;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_free_boost(uuid) TO authenticated;
