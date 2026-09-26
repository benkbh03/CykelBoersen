-- ============================================================
-- guard_bike_brand_model.sql
--
-- Afvis annoncer hvor mærke eller model er teksten "null" eller
-- "undefined", eller hvor et påkrævet felt er tomt.
--
-- Hvorfor i databasen: billedanalysen udfyldte mærke og model med
-- ordet "null", og det gik igennem til udgivne annoncer. Browseren
-- renser nu svaret (js/ai-suggestion-clean.js), men en kontrol der
-- kun står i frontenden, er set svigte før (se "Kontrol kun i
-- frontenden" i CLAUDE.md). Triggeren gælder alle veje ind: sælg-
-- flowet, redigering, admin-oprettelse, bulk-import og feed-sync.
--
-- Reglerne:
--   · brand og model må aldrig være "null"/"undefined" (uanset store
--     bogstaver og mellemrum). Gælder cykler og tilbehør.
--   · Cykel: brand er påkrævet. Model må gerne være tom: sælg-flowet
--     lader bevidst sælgeren udgive uden model efter et spørgsmål.
--   · Tilbehør: model er titlen og påkrævet. Brand må være tom.
--
-- Ved UPDATE tjekkes kun felter der faktisk ændres. Så kan en ældre
-- annonce med en dårlig værdi stadig markeres som solgt eller få ny
-- pris, uden at hele gemningen fejler.
--
-- Idempotent: sikker at køre igen.
-- Rollback: DROP TRIGGER IF EXISTS trg_guard_bike_brand_model ON bikes;
--           DROP FUNCTION IF EXISTS guard_bike_brand_model();
-- ============================================================

CREATE OR REPLACE FUNCTION guard_bike_brand_model()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_acc      boolean := COALESCE(NEW.category, 'cykel') = 'tilbehoer';
  brand_clean text    := btrim(COALESCE(NEW.brand, ''));
  model_clean text    := btrim(COALESCE(NEW.model, ''));
  check_brand boolean := TG_OP = 'INSERT' OR NEW.brand IS DISTINCT FROM OLD.brand
                         OR NEW.category IS DISTINCT FROM OLD.category;
  check_model boolean := TG_OP = 'INSERT' OR NEW.model IS DISTINCT FROM OLD.model
                         OR NEW.category IS DISTINCT FROM OLD.category;
BEGIN
  IF check_brand AND lower(brand_clean) IN ('null', 'undefined') THEN
    RAISE EXCEPTION 'Mærket er ugyldigt: "%"', brand_clean USING ERRCODE = 'check_violation';
  END IF;
  IF check_model AND lower(model_clean) IN ('null', 'undefined') THEN
    RAISE EXCEPTION 'Modellen er ugyldig: "%"', model_clean USING ERRCODE = 'check_violation';
  END IF;
  IF check_brand AND NOT is_acc AND brand_clean = '' THEN
    RAISE EXCEPTION 'Mærke mangler' USING ERRCODE = 'check_violation';
  END IF;
  IF check_model AND is_acc AND model_clean = '' THEN
    RAISE EXCEPTION 'Titel mangler' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bike_brand_model ON bikes;
CREATE TRIGGER trg_guard_bike_brand_model
  BEFORE INSERT OR UPDATE OF brand, model, category ON bikes
  FOR EACH ROW EXECUTE FUNCTION guard_bike_brand_model();

-- ── Oprydning i eksisterende annoncer ──────────────────────────
-- En cykel med model "null" får tom model (det er tilladt), og titlen
-- bygges igen af mærket alene. Cykler med MÆRKE "null" kan vi ikke
-- rette automatisk, fordi vi ikke ved hvad mærket er. STATUS_TJEK
-- tæller dem, så de kan rettes i admin-panelet.
UPDATE bikes
   SET model = '',
       title = btrim(brand)
 WHERE COALESCE(category, 'cykel') <> 'tilbehoer'
   AND lower(btrim(COALESCE(model, ''))) IN ('null', 'undefined')
   AND lower(btrim(COALESCE(brand, ''))) NOT IN ('null', 'undefined', '');
