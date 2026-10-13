-- ══════════════════════════════════════════════════════════════════════
--  Navnet "Cykelbørsen" er forbeholdt sitet selv
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  13. okt.: en konto oprettet samme morgen kaldte sig "Cykelbørsen" med
--  bio'en "Officiel Cykelbørsen-konto!" og sendte fem beskeder til sælgere
--  om at deres cykel var "solgt gennem Cykelbørsen" med et falsk
--  betalingslink. Navnet var det der gjorde beskeden troværdig.
--
--  Reglen ligger i databasen, ikke i formularen, fordi formularen kan
--  springes over med den offentlige nøgle.
--
--  Normaliseringen fanger "Cykelbørsen", "CykelBorsen", "Cykel-Børsen",
--  "cykelboersen", "Cykelbørsen Support" osv.: små bogstaver, ø/ö/ó → o,
--  "oe" → "o", alt andet end a-z fjernet.
--
--  INSERT: navnet ryddes stille i stedet for at fejle. Profilen oprettes
--  af handle_new_user() under selve tilmeldingen, og en fejl dér giver
--  brugeren "Database error saving new user" uden forklaring.
--  UPDATE: afvises med en læsbar fejl, som /me/rediger viser.
--  Admins og service-role (auth.uid() er NULL) er undtaget.

CREATE OR REPLACE FUNCTION is_reserved_profile_name(n text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT n IS NOT NULL AND
         replace(
           regexp_replace(translate(lower(n), 'øöóò', 'oooo'), '[^a-z]', '', 'g'),
           'oe', 'o'
         ) LIKE '%cykelborsen%';
$$;

CREATE OR REPLACE FUNCTION reject_reserved_profile_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_admin, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF is_reserved_profile_name(NEW.name)      THEN NEW.name      := ''; END IF;
    IF is_reserved_profile_name(NEW.shop_name) THEN NEW.shop_name := ''; END IF;
    RETURN NEW;
  END IF;

  IF (is_reserved_profile_name(NEW.name)
        AND NEW.name IS DISTINCT FROM OLD.name)
     OR (is_reserved_profile_name(NEW.shop_name)
        AND NEW.shop_name IS DISTINCT FROM OLD.shop_name) THEN
    RAISE EXCEPTION 'Navnet Cykelbørsen er forbeholdt sitet selv'
      USING ERRCODE = 'check_violation', HINT = 'reserved_name';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_reserved_profile_name ON profiles;
CREATE TRIGGER reject_reserved_profile_name
  BEFORE INSERT OR UPDATE OF name, shop_name ON profiles
  FOR EACH ROW EXECUTE FUNCTION reject_reserved_profile_name();

-- Tjek bagefter: hvilke profiler bærer navnet i dag? Forventet: ingen,
-- bortset fra konti en admin bevidst har navngivet sådan.
-- SELECT id, name, shop_name, is_admin FROM profiles
--  WHERE is_reserved_profile_name(name) OR is_reserved_profile_name(shop_name);
