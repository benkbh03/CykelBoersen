-- ============================================================
-- search_logs: log af fritekst-søgninger (til admin-statistik)
-- ============================================================
-- Gemmer hvad folk søger efter + hvor mange resultater de fik, så
-- nul-resultat-søgninger (umødt efterspørgsel) kan ses i admin → Statistik.
-- Logges ANONYMT (intet user_id) for at minimere persondata.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS search_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query        text        NOT NULL,
  type         text,
  city         text,
  result_count integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created ON search_logs(created_at DESC);

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

-- Alle (også ikke-loggede-ind) må logge en søgning
DROP POLICY IF EXISTS search_logs_insert ON search_logs;
CREATE POLICY search_logs_insert ON search_logs
  FOR INSERT WITH CHECK (true);

-- Kun admin må læse loggen
DROP POLICY IF EXISTS search_logs_select_admin ON search_logs;
CREATE POLICY search_logs_select_admin ON search_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
