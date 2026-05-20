-- ============================================================
-- SAMLET: alle migrationer der mangler at blive kørt
-- ============================================================
-- Kør HELE denne fil på én gang i:
--   Supabase Dashboard → SQL Editor → New query → indsæt → Run
--
-- Alt er idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP IF
-- EXISTS), så det er sikkert at køre igen hvis du er i tvivl om
-- hvad der allerede er kørt.
--
-- Rækkefølgen er vigtig: prishistorik oprettes FØR vi åbner dens
-- RLS for solgte annoncer.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1/4 — Prishistorik (driver prisudviklings-timeline på annoncer)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bike_price_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id     uuid        NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  old_price   integer     NOT NULL,
  new_price   integer     NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bike_price_history_bike_id
  ON bike_price_history(bike_id, changed_at DESC);

ALTER TABLE bike_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read history for active bikes" ON bike_price_history;
CREATE POLICY "Anyone can read history for active bikes"
  ON bike_price_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bikes
      WHERE bikes.id = bike_price_history.bike_id
        AND bikes.is_active = true
    )
  );

DROP POLICY IF EXISTS "Service role can read all price history" ON bike_price_history;
CREATE POLICY "Service role can read all price history"
  ON bike_price_history FOR SELECT
  TO service_role
  USING (true);

CREATE OR REPLACE FUNCTION track_bike_price_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price
     AND OLD.price IS NOT NULL
     AND NEW.price IS NOT NULL THEN
    INSERT INTO bike_price_history (bike_id, old_price, new_price)
    VALUES (NEW.id, OLD.price, NEW.price);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bike_price_change_trigger ON bikes;
CREATE TRIGGER bike_price_change_trigger
  AFTER UPDATE OF price ON bikes
  FOR EACH ROW
  EXECUTE FUNCTION track_bike_price_changes();


-- ════════════════════════════════════════════════════════════
-- 2/4 — Forhandler-profil opt-outs (så de kan nå 100% komplet)
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS hours_optout    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_optout   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS services_optout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_optout   boolean NOT NULL DEFAULT false;


-- ════════════════════════════════════════════════════════════
-- 3/4 — Solgte annoncer kan ses via link (køber ser hvad de købte)
-- ════════════════════════════════════════════════════════════
-- OBS: dette åbner også prishistorik-SELECT fra trin 1 til alle,
-- så historik forbliver synlig på solgte annoncer.

DROP POLICY IF EXISTS "bikes_public_select_all" ON bikes;
CREATE POLICY "bikes_public_select_all"
  ON bikes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can read history for active bikes" ON bike_price_history;
DROP POLICY IF EXISTS "Anyone can read price history" ON bike_price_history;
CREATE POLICY "Anyone can read price history"
  ON bike_price_history FOR SELECT
  USING (true);


-- ════════════════════════════════════════════════════════════
-- 4/4 — Edit-lock på solgte annoncer (køber-beskyttelse)
-- ════════════════════════════════════════════════════════════
-- Sælger kan ikke ændre aftalte vilkår efter en handel uden at
-- genaktivere først. Tillader views-tæller + genaktivering.

CREATE OR REPLACE FUNCTION prevent_sold_bike_edits()
RETURNS TRIGGER AS $$
BEGIN
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

-- ============================================================
-- FÆRDIG. Hvis du ikke fik fejl, er alle 4 features klar.
-- ============================================================
