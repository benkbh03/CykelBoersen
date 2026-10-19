-- ============================================================
-- fix_reconcile_dealer_feed_anon.sql
-- ============================================================
-- Lukker reconcile_dealer_feed() for anonyme kald.
--
-- BAGGRUND (fundet 19. okt. 2026)
-- Funktionen deaktiverer en forhandlers feed-cykler der ikke var i seneste
-- import og stempler sold_at. Vagten i add_dealer_feed_sync.sql var
--   IF v_uid IS NOT NULL AND v_uid <> p_user_id THEN ...
-- Den skulle lade service-role (cron, auth.uid() IS NULL) igennem, men en
-- anonym besøgende har OGSÅ auth.uid() IS NULL. Ét kald med den offentlige
-- nøgle og p_seen_ids = '{}' tog alle en forhandlers feed-cykler af siden
-- og registrerede dem som solgt. Bevist på staging som rollen anon.
--
-- RETTELSE
-- Uden bruger skal kalderen være service-role. Med bruger: ejeren selv
-- eller en admin, som før. Desuden fjernes anon's execute-ret.
-- Kaldere der stadig virker: import-dealer-feed (service-role) og
-- js/admin-bulk-import.js (indlogget admin).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- Kvittering: STATUS_TJEK.sql række 82 skal stå OK bagefter.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reconcile_dealer_feed(p_user_id uuid, p_seen_ids text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Kræver login' USING ERRCODE = '42501';
    END IF;
  ELSIF v_uid <> p_user_id
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND is_admin) THEN
    RAISE EXCEPTION 'Kun admin, ejeren selv eller service-role må synkronisere lager';
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

REVOKE EXECUTE ON FUNCTION public.reconcile_dealer_feed(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reconcile_dealer_feed(uuid, text[]) TO authenticated, service_role;

-- ── Fortryd ──────────────────────────────────────────────────
-- Kør den gamle udgave i add_dealer_feed_sync.sql igen (afsnit 4). Gør det
-- ikke: den gamle udgave er hullet.
