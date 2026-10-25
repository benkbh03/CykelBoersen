-- ══════════════════════════════════════════════════════════════════════
--  Testkonti: skjult for alle undtagen kontoen selv
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  23. okt.: en testforhandler på produktion ("Testforhandler (slettes)")
--  skal blive stående til afprøvning af /opkoeb, men ikke kunne ses af
--  almindelige besøgende. Skjult i databasen, ikke i frontenden: forhandlere
--  hentes ti steder (forsiden, /forhandlere, kortet, sitemap, prerender
--  m.fl.), og et filter i hvert af dem ville glide fra hinanden.
--
--  · profiles.is_test: kan ikke læses fra browseren (ingen kolonne-GRANT)
--    og kan kun ændres af admin eller i SQL Editor (trigger nedenfor).
--  · En RESTRICTIVE SELECT-politik på profiles skjuler testkontoens række
--    for alle andre end kontoen selv og admin. Dermed falder den ud af alle
--    lister, sitemap og prerender (de læser med den offentlige nøgle).
--  · Opkøbsønsker fra en testkonto vises kun for ejeren og admin.
--
--  25. okt.: admin så stadig testforhandleren på /forhandlere, fordi
--  politikken også lukkede admin ind. Nu er det kun kontoen selv. Admin
--  finder den stadig i admin-panelet: admin_list_profiles() er SECURITY
--  DEFINER og går uden om politikken. Kører man filen igen, skrives den
--  gamle politik over (DROP + CREATE herunder).
--
--  Skjuler IKKE annoncer: en annonce oprettet af testkontoen vises på
--  forsiden uden sælger. Opret ikke offentlige annoncer fra en testkonto.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- Hjælpere. SECURITY DEFINER, så politikkerne ikke læser profiles gennem
-- sig selv (rekursion) og ikke afhænger af kolonne-GRANTs.
CREATE OR REPLACE FUNCTION viewer_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true);
$$;

CREATE OR REPLACE FUNCTION is_test_account(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT is_test FROM profiles WHERE id = uid), false);
$$;

-- Kun admin (eller SQL Editor / service-role, hvor auth.uid() er NULL) må
-- ændre is_test. Ellers kunne en bruger skjule sin egen profil.
CREATE OR REPLACE FUNCTION protect_is_test()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT viewer_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_test := false;
    ELSIF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
      NEW.is_test := OLD.is_test;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_is_test ON profiles;
CREATE TRIGGER protect_is_test
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_is_test();

-- RESTRICTIVE: lægges oven på "Alle kan se profiler" (USING true), så en
-- række kun ses hvis BEGGE politikker siger ja. Ikke admin: så stod
-- testkontoen på de offentlige sider, når admin var logget ind.
DROP POLICY IF EXISTS profiles_hide_test ON profiles;
CREATE POLICY profiles_hide_test ON profiles AS RESTRICTIVE FOR SELECT
  USING (NOT is_test OR id = auth.uid());

-- Opkøbsønsker: is_verified_dealer() er SECURITY DEFINER og ser forbi
-- politikken ovenfor, så testkontoens ønsker skjules her for sig.
-- ALTER frem for DROP + CREATE: politikken findes fra add_buy_requests.sql.
ALTER POLICY buy_requests_select ON buy_requests
  USING (
    (is_active AND is_verified_dealer(dealer_id) AND NOT is_test_account(dealer_id))
    OR dealer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Testforhandleren fra 23. okt. Gør ingenting hvis den ikke findes.
UPDATE profiles SET is_test = true WHERE id = '7e570000-0000-4000-8000-0000000000a1';

-- ── Tjek bagefter: skal give fire rækker med OK ────────────────────────
SELECT 'kolonne + trigger' AS tjek,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'profiles' AND column_name = 'is_test')
             AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'protect_is_test')
            THEN 'OK' ELSE 'MANGLER' END AS status
UNION ALL
SELECT 'skjult for besøgende (politik)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE tablename = 'profiles' AND policyname = 'profiles_hide_test'
                            AND permissive = 'RESTRICTIVE')
            THEN 'OK' ELSE 'MANGLER' END
UNION ALL
SELECT 'skjult for admin på offentlige sider',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE tablename = 'profiles' AND policyname = 'profiles_hide_test'
                            AND qual ILIKE '%viewer_is_admin%')
            THEN 'FEJL: gammel politik, admin ser testkonti' ELSE 'OK' END
UNION ALL
SELECT 'is_test kan ikke læses fra browseren',
       CASE WHEN has_column_privilege('anon', 'public.profiles', 'is_test', 'SELECT')
            THEN 'FEJL: anon kan læse is_test' ELSE 'OK' END;
