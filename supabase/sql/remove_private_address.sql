-- ============================================================
-- remove_private_address.sql
-- ============================================================
-- Fjerner gadeadresse, postnummer og præcise koordinater fra private
-- profiler. Forhandlere beholder deres. Samme mønster som
-- remove_private_phone.sql.
--
-- BAGGRUND
-- address, postcode, lat og lng skal være offentlige for forhandlere:
-- butikkens adresse står på forhandlersiden, i JSON-LD og på kortet. En
-- kolonne-GRANT kan ikke skelne en forhandlerrække fra en privat række, så
-- kolonnerne forbliver læsbare med den offentlige nøgle (se
-- hide_private_profile_columns.sql). Derfor må en privat profil ikke have
-- dem udfyldt.
--
-- Frontenden sætter allerede address = NULL og location_precision = 'city'
-- når en privat bruger gemmer sin profil (js/profile-edit-page.js). Men en
-- forhandler der afvises, bliver nedgraderet til privat med adressen
-- liggende. Optælling 12. okt. 2026: 3 private profiler havde gadeadresse og
-- præcise koordinater, alle tidligere forhandleransøgninger.
--
-- js/bike-detail.js geokoder sælgerens adresse uden at tjekke sælgertype, så
-- en privat sælger med en gammel adresse ville blive sat på kortet hjemme.
--
-- By-koordinater (location_precision = 'city') er ufarlige og bliver.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. Gem værdierne før de slettes ──────────────────────────
-- Fortrydelsesmulighed, som ved telefonnumrene. Uden policies kan tabellen
-- kun læses af service-role. Slettes igen efter vinduet (punkt 5).

CREATE TABLE IF NOT EXISTS profiles_address_removed_20261012 (
  id                 uuid        PRIMARY KEY,
  address            text,
  postcode           text,
  lat                double precision,
  lng                double precision,
  location_precision text,
  removed_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles_address_removed_20261012 ENABLE ROW LEVEL SECURITY;
-- Ingen policies = ingen adgang for anon eller authenticated.

INSERT INTO profiles_address_removed_20261012 (id, address, postcode, lat, lng, location_precision)
SELECT id, address, postcode, lat, lng, location_precision
FROM profiles
WHERE COALESCE(seller_type, 'private') <> 'dealer'
  AND (address IS NOT NULL OR postcode IS NOT NULL OR location_precision = 'exact')
ON CONFLICT (id) DO NOTHING;


-- ── 2. Hold det sådan ────────────────────────────────────────
-- Nulstiller stille i stedet for at kaste en fejl, af samme grund som
-- strip_private_phone: forhandler-flowet skriver adresse og seller_type =
-- 'dealer' i SAMME statement, så en rigtig forhandler rammes aldrig.
--
-- Navnet sorterer efter protect_profile_columns (triggere kører i alfabetisk
-- rækkefølge), så rettighedstjekket kører først.

CREATE OR REPLACE FUNCTION strip_location_from_private_profiles()
RETURNS trigger AS $$
BEGIN
  IF COALESCE(NEW.seller_type, 'private') <> 'dealer' THEN
    NEW.address  := NULL;
    NEW.postcode := NULL;
    IF NEW.location_precision = 'exact' THEN
      NEW.lat := NULL;
      NEW.lng := NULL;
      NEW.location_precision := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER strip_private_location
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION strip_location_from_private_profiles();


-- ── 3. Nulstil de eksisterende ───────────────────────────────
-- Efter triggeren, så selve UPDATE'en går igennem den. Rækkerne der rammes,
-- er gemt i punkt 1.

UPDATE profiles
SET address = NULL
WHERE COALESCE(seller_type, 'private') <> 'dealer'
  AND (address IS NOT NULL OR postcode IS NOT NULL OR location_precision = 'exact');


-- ── 4. Dokumentation ─────────────────────────────────────────

COMMENT ON COLUMN profiles.address IS
  'Kun forhandlere (offentlig butiksadresse). Private profiler nulstilles af '
  'triggeren strip_private_location.';


-- ── 5. Oprydning — kør denne linje efter 12. januar 2027 ─────
--
--   DROP TABLE IF EXISTS profiles_address_removed_20261012;


-- ── Kontrol ──────────────────────────────────────────────────
-- Forventet: 0 for private.
--
--   SELECT count(*) FROM profiles
--    WHERE COALESCE(seller_type,'private') <> 'dealer'
--      AND (address IS NOT NULL OR postcode IS NOT NULL OR location_precision = 'exact');
