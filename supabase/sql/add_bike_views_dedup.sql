-- ============================================================
-- bike_views: troværdig visningstælling med server-side dedup
-- ============================================================
-- Tidligere tælle hver eneste åbning af en annonce +1 (også F5/refresh
-- og modal+side i samme besøg) → tallet kunne pustes kunstigt op.
--
-- Nu logges hver visning pr. "viewer_key" (bruger-id hvis logget ind,
-- ellers en anonym tilfældig id gemt i browserens localStorage). Samme
-- seer på samme annonce inden for 24 timer tæller KUN én gang, og ejerens
-- egne visninger tælles aldrig. Dedup håndhæves i databasen (ikke klienten)
-- så tallet er til at stole på.
--
-- Anonymt: viewer_key er enten brugerens eget id eller en tilfældig token
-- (ingen IP, ingen persondata ud over hvad vi allerede har).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at køre igen.
-- ============================================================

-- Sørg for at views-kolonnen findes (no-op hvis den allerede er der)
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

-- Log-tabel til dedup
CREATE TABLE IF NOT EXISTS bike_views (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bike_id    uuid        NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  viewer_key text        NOT NULL,
  viewed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bike_views_dedup
  ON bike_views (bike_id, viewer_key, viewed_at DESC);

-- Ingen policies = kun SECURITY DEFINER-funktionen herunder kan skrive/læse.
-- Klienten rører ALDRIG tabellen direkte (kun via RPC'en).
ALTER TABLE bike_views ENABLE ROW LEVEL SECURITY;

-- Fjern den gamle 1-arguments-version (uden dedup) hvis den findes
DROP FUNCTION IF EXISTS increment_bike_views(uuid);

-- Ny version: tæller én gang pr. seer pr. annonce pr. 24 timer, aldrig ejeren
CREATE OR REPLACE FUNCTION increment_bike_views(bike_id uuid, viewer_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF viewer_key IS NULL OR length(trim(viewer_key)) = 0 THEN
    RETURN;
  END IF;

  -- Findes annoncen? Og tæl aldrig ejerens egne visninger.
  SELECT user_id INTO v_owner FROM bikes WHERE id = increment_bike_views.bike_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  IF v_owner::text = increment_bike_views.viewer_key THEN
    RETURN;
  END IF;

  -- Dedup: samme seer + samme annonce inden for 24 timer = kun én visning.
  IF EXISTS (
    SELECT 1 FROM bike_views bv
    WHERE bv.bike_id = increment_bike_views.bike_id
      AND bv.viewer_key = increment_bike_views.viewer_key
      AND bv.viewed_at > now() - interval '24 hours'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO bike_views (bike_id, viewer_key)
    VALUES (increment_bike_views.bike_id, increment_bike_views.viewer_key);

  UPDATE bikes SET views = COALESCE(views, 0) + 1
    WHERE id = increment_bike_views.bike_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_bike_views(uuid, text) TO anon, authenticated;
