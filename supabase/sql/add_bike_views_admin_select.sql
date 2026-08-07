-- ============================================================
-- Admin skal kunne læse bike_views for at vise daglig trafik.
--
-- bike_views har RLS slået til, men der findes INGEN select-policy.
-- Uden en sådan returnerer tabellen tomt for alle — også admin — så
-- admin-panelets trafikoversigt ville vise 0 visninger hver dag.
--
-- Kun admins får læseadgang. Almindelige brugere skal fortsat ikke kunne
-- se hvem der har kigget på hvad; viewer_key er pseudonym, men rækkerne
-- kobler alligevel en person til en adfærd.
--
-- Idempotent — sikker at køre igen.
-- ============================================================

DROP POLICY IF EXISTS bike_views_select_admin ON bike_views;
CREATE POLICY bike_views_select_admin ON bike_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Indeks på viewed_at alene: trafikoversigten filtrerer på dato på tværs af
-- ALLE cykler, hvor det eksisterende dedup-indeks starter med bike_id og
-- derfor ikke kan bruges til det opslag.
CREATE INDEX IF NOT EXISTS idx_bike_views_viewed_at
  ON bike_views (viewed_at DESC);
