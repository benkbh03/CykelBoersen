-- ============================================================
-- Admin må læse ALLE cykler (også andre forhandleres skjulte/inaktive)
-- ============================================================
-- Problem: når en admin redigerer en forhandlers feed-cykel, henter
-- openEditModal cyklen med et almindeligt klient-SELECT. For en ANDEN
-- forhandlers ikke-aktive cykel blokerer RLS læsningen → PostgREST svarer 406
-- (0 rækker på .single()) → "Kunne ikke hente annonce".
--
-- Løsning: en permissiv SELECT-policy der lader admins (profiles.is_admin=true)
-- læse alle bikes + bike_images. RLS-policies for samme kommando OR'es sammen,
-- så denne udvider kun admins adgang — almindelige brugere er upåvirkede.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

DROP POLICY IF EXISTS "bikes_admin_select_all" ON bikes;
CREATE POLICY "bikes_admin_select_all"
  ON bikes FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "bike_images_admin_select_all" ON bike_images;
CREATE POLICY "bike_images_admin_select_all"
  ON bike_images FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
