-- ============================================================
-- Tilføj bike_price_history-tabel + auto-trigger
-- ============================================================
-- Logger ALLE prisændringer på bikes-tabellen, så frontend kan
-- vise en mini-timeline med prisudvikling på bike-detail-siden.
-- Driver "📉 Prisen er sat ned X gange"-komponenten under det
-- eksisterende price-reduced-badge.
--
-- En DB-trigger fanger alle UPDATE'er hvor price ændres — uanset
-- om de kommer fra edit-modal, admin-panel, edge function eller
-- direkte SQL. Frontend-koden behøver ikke at gøre noget for at
-- vedligeholde tabellen.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS bike_price_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id     uuid        NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  old_price   integer     NOT NULL,
  new_price   integer     NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bike_price_history_bike_id
  ON bike_price_history(bike_id, changed_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE bike_price_history ENABLE ROW LEVEL SECURITY;

-- Alle kan læse historik for aktive annoncer (samme synlighed som
-- bikes-tabellen selv). Vi joiner mod bikes for at sikre at historik
-- for slettede/skjulte annoncer ikke lækker.
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

-- Service role læser alt (til evt. fremtidige edge functions med stats)
DROP POLICY IF EXISTS "Service role can read all price history" ON bike_price_history;
CREATE POLICY "Service role can read all price history"
  ON bike_price_history FOR SELECT
  TO service_role
  USING (true);

-- Ingen INSERT/UPDATE/DELETE policies for anon/authenticated — kun
-- triggeren (SECURITY DEFINER) må skrive til tabellen.

-- ── Trigger der auto-logger ved price-ændring ───────────────
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
