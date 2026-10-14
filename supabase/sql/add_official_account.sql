-- ══════════════════════════════════════════════════════════════════════
--  Officiel Cykelbørsen-konto: mærket "Officiel" ved navnet
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  13. okt.: en svindler kaldte sig "Cykelbørsen" i indbakken. Navnet er
--  nu forbeholdt (reserve_cykelboersen_name.sql), men et navn alene kan
--  ikke vise forskel på ægte og falsk. Mærket kan.
--
--  Mærket styres af is_official, ikke af is_admin: admin-kontoen er også
--  en privat sælger med egne annoncer, og dens handler skal ikke se
--  officielle ud. Den officielle konto er en separat konto, som også får
--  is_admin, så den kan sende links (block_links_from_new_accounts).
--
--  Kun admin og service-role kan sætte kolonnen. Profilen ejes af brugeren
--  selv, og RLS tillader ejeren at opdatere sin række, så reglen skal ligge i
--  en trigger.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

-- Indbakken og e-mailen skal kunne læse den. profiles har kolonne-GRANTs
-- (hide_private_profile_columns.sql), så en ny kolonne er skjult indtil den
-- gives fri her.
GRANT SELECT (is_official) ON public.profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION protect_is_official()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service-role og SQL Editor (auth.uid() er NULL) må alt.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_official := false;
  ELSIF NEW.is_official IS DISTINCT FROM OLD.is_official THEN
    RAISE EXCEPTION 'Kan ikke ændre is_official';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER protect_is_official
  BEFORE INSERT OR UPDATE OF is_official ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION protect_is_official();

-- ── Gør en konto officiel (kør separat, når kontoen er oprettet) ──────
-- Opret først kontoen på sitet med en anden e-mail end din egen (fx
-- support@cykelbørsen.dk). Tilmeldingen giver den navnet "Ukendt", fordi
-- navnet er forbeholdt. Ret det her:
--
-- UPDATE public.profiles
--    SET name = 'Cykelbørsen', is_official = true, is_admin = true
--  WHERE id = (SELECT id FROM auth.users WHERE email = '<kontoens e-mail>');
--
-- Tjek bagefter:
-- SELECT id, name, is_official, is_admin FROM profiles WHERE is_official;
