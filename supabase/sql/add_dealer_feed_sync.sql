-- ============================================================
-- Forhandler-feed-synkronisering (FASE 1) — external_id + reconciliation
-- ============================================================
-- Fundament for at holde en forhandlers cykler synkroniseret med deres eget
-- lager (CSV nu, automatisk webshop-feed i fase 2). Kernen er ÉT stabilt
-- varenummer pr. cykel (external_id) + en reconcile-funktion der deaktiverer
-- de cykler der ikke længere er i forhandlerens lager (= udsolgt).
--
-- Out-of-stock genbruger den eksisterende is_active-mekanisme: en udsolgt cykel
-- slettes ikke, den sættes blot is_active=false (og sold_at sættes til now()).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at køre igen.
-- ============================================================

-- 1. external_id = forhandlerens eget varenummer/SKU fra feed/CSV.
--    Nøgle til upsert (undgå dubletter ved gen-import) + out-of-stock-matchning.
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS external_id text;

-- 2. sold_at = hvornår en feed-cykel forsvandt fra lageret. Metadata til evt.
--    "Solgt"-badge + statistik. Sættes af reconcile, ryddes ved gen-aktivering.
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS sold_at timestamptz;

-- 3. Unik pr. forhandler (ikke globalt — to forhandlere må gerne dele SKU "123").
--    Partiel index: kun rækker med external_id indgår, så manuelt oprettede
--    cykler (external_id IS NULL) er upåvirkede.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bikes_user_external
  ON bikes(user_id, external_id) WHERE external_id IS NOT NULL;

-- 4. Reconcile: deaktivér en forhandlers feed-cykler der IKKE var i seneste
--    import (= udsolgt). Rører ALDRIG manuelt oprettede cykler (external_id IS
--    NULL) eller andre forhandlere. Returnerer antal deaktiverede.
--
--    Sikkerhed: SECURITY DEFINER, men guardet — kun en admin, ejeren selv, eller
--    service-role (fase 2-cron, auth.uid() IS NULL) må køre den.
CREATE OR REPLACE FUNCTION reconcile_dealer_feed(p_user_id uuid, p_seen_ids text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_count    int;
BEGIN
  IF v_uid IS NOT NULL AND v_uid <> p_user_id THEN
    SELECT COALESCE(p.is_admin, false) INTO v_is_admin FROM profiles p WHERE p.id = v_uid;
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Kun admin, ejeren selv eller service-role må synkronisere lager';
    END IF;
  END IF;

  UPDATE bikes
     SET is_active = false,
         sold_at   = COALESCE(sold_at, now())
   WHERE user_id = p_user_id
     AND external_id IS NOT NULL
     AND is_active = true
     AND NOT (external_id = ANY(p_seen_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_dealer_feed(uuid, text[]) TO authenticated;
