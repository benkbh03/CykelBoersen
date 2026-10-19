-- ══════════════════════════════════════════════════════════════════════
--  Annoncer med lånetilbud eller e-mailadresser afvises
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  19. okt.: "Pålidelig og sikker lånetilbud", 20.000 kr., med en
--  gmail-adresse i beskrivelsen. Tredje gang samme tekst: 2. og 4. okt.
--  fra en anden konto. Svindlen virker kun, hvis offeret skriver til
--  e-mailadressen uden om sitet.
--
--  Reglen afviser en annonce, hvis mærke, model eller beskrivelse
--  indeholder:
--    • en e-mailadresse (kontakt foregår via beskeder på sitet), eller
--    • et af de ord lånesvindel bruger: lånetilbud, privatlån, kviklån,
--      långiver, kredittilbud, bitcoin, krypto, forex m.fl.
--  "lån" alene er IKKE med: "kan lånes til en prøvetur" er en ægte
--  sætning. "Finansiering" er heller ikke med, fordi forhandlere tilbyder
--  det (offers_financing).
--
--  Ved kørslen 19. okt. ramte reglen 3 af alle annoncer, og alle tre var
--  lånesvindlen. Ingen rigtige annoncer.
--
--  Service-role (admin-create-bike, import-dealer-feed) og admins er
--  undtaget. UPDATE tjekkes kun når teksten faktisk ændres.

CREATE OR REPLACE FUNCTION listing_has_scam_content(txt text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT txt IS NOT NULL AND lower(txt) ~ (
    '(lånetilbud|lån tilbud|privatlån|kviklån|forbrugslån|långiver|lån ?penge'
    || '|\mloan\M|\mprêt\M|kredittilbud|bitcoin|krypto|forex|investeringsmulighed'
    || '|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})'
  );
$$;

CREATE OR REPLACE FUNCTION block_scam_listing_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ny_tekst text := concat_ws(' ', NEW.brand, NEW.model, NEW.description);
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND ny_tekst IS NOT DISTINCT FROM concat_ws(' ', OLD.brand, OLD.model, OLD.description) THEN
    RETURN NEW;
  END IF;

  IF NOT listing_has_scam_content(ny_tekst) THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RETURN NEW;
  END IF;

  -- Teksten vises til brugeren i js/sell-page.js og js/listing-edit.js.
  RAISE EXCEPTION 'Annoncen kan ikke indeholde e-mailadresser eller lånetilbud. Købere kontakter dig via beskeder på Cykelbørsen.'
    USING ERRCODE = 'check_violation', HINT = 'listing_blocked_content';
END;
$$;

CREATE OR REPLACE TRIGGER block_scam_listing_content
  BEFORE INSERT OR UPDATE OF brand, model, description ON bikes
  FOR EACH ROW EXECUTE FUNCTION block_scam_listing_content();
