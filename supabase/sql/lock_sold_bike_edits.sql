-- ============================================================
-- Edit-lock på solgte (inaktive) annoncer — køber-beskyttelse
-- ============================================================
-- Formål: når en handel er aftalt og annoncen sættes solgt
-- (is_active=false), må sælgeren IKKE længere ændre de aftalte
-- vilkår (pris, model, stand osv.). Køberen skal kunne stole på
-- at den annonce de handlede på, forbliver uændret.
--
-- Reglen: en BEFORE UPDATE-trigger afviser ændringer af
-- indholds-felter når annoncen BÅDE var solgt (OLD.is_active=false)
-- OG forbliver solgt (NEW.is_active=false).
--
-- Tilladt selv på solgte annoncer:
--   • views (visningstæller) — increment_bike_views RPC skal stadig virke
--   • is_active → true (genaktivering) — sælger låser op før redigering
--   • updated_at (timestamp-touch)
--
-- Arbejdsgang for sælger: "Genaktiver" annoncen → rediger → sæt
-- solgt igen. Det giver en bevidst handling i stedet for en
-- skjult ændring efter handlen.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_sold_bike_edits()
RETURNS TRIGGER AS $$
BEGIN
  -- Kun relevant når annoncen var solgt og forbliver solgt.
  IF OLD.is_active = false AND NEW.is_active = false THEN
    IF NEW.brand          IS DISTINCT FROM OLD.brand
    OR NEW.model          IS DISTINCT FROM OLD.model
    OR NEW.type           IS DISTINCT FROM OLD.type
    OR NEW.price          IS DISTINCT FROM OLD.price
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.condition      IS DISTINCT FROM OLD.condition
    OR NEW.year           IS DISTINCT FROM OLD.year
    OR NEW.size           IS DISTINCT FROM OLD.size
    OR NEW.color          IS DISTINCT FROM OLD.color
    OR NEW.city           IS DISTINCT FROM OLD.city
    OR NEW.warranty       IS DISTINCT FROM OLD.warranty
    THEN
      RAISE EXCEPTION 'Solgte annoncer kan ikke redigeres. Genaktiver annoncen først.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_sold_bike_edits ON bikes;
CREATE TRIGGER trg_prevent_sold_bike_edits
  BEFORE UPDATE ON bikes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sold_bike_edits();
