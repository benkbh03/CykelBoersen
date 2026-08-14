-- ============================================================
-- sell_funnel_events: hvor langt folk når i sælg-flowet
-- ============================================================
-- Databasen ved hvor mange annoncer der BLEV oprettet. Den ved intet om dem
-- der åbnede sælg-flowet, kom til trin 2 og lukkede fanen. Uden det tal kan
-- man ikke se om arbejdet med at fjerne friktion (AI-udfyldning fra billeder,
-- DBA-import, tre trin i stedet for én lang formular) rent faktisk virkede.
--
-- Tragten er: Billeder -> Om cyklen -> Publicer -> oprettet.
-- Et frafald hvert sted betyder noget forskelligt: trin 1 = billederne er
-- barrieren, trin 2 = for mange felter, trin 3 = folk ved ikke hvad de skal
-- skrive eller forlange.
--
-- ANONYMT, som search_logs: intet user_id, ingen IP, intet der gemmes i
-- browseren. flow_id er en tilfældig værdi der laves i hukommelsen når flowet
-- åbnes og forsvinder ved genindlæsning — den findes kun for at kunne se at
-- fire hændelser hører til SAMME forsøg. Den kan ikke kobles til en person og
-- overlever ikke sessionen, så der sættes ingen cookie og kræves intet
-- samtykke.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS sell_funnel_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id    uuid        NOT NULL,
  step       text        NOT NULL,   -- 'start' | 'step_2' | 'step_3' | 'complete'
  category   text,                   -- 'cykel' | 'tilbehoer'
  -- Blev felterne udfyldt automatisk? Så kan frafald sammenlignes mellem dem
  -- der fik hjælp af AI/import og dem der tastede selv — altså om hjælpen
  -- faktisk holder folk i flowet.
  prefilled  text,                   -- 'ai' | 'import' | null
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sell_funnel_created ON sell_funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sell_funnel_flow    ON sell_funnel_events(flow_id);

ALTER TABLE sell_funnel_events ENABLE ROW LEVEL SECURITY;

-- Alle må logge et trin — også folk der ikke er logget ind, da flowet kan
-- åbnes før login.
DROP POLICY IF EXISTS sell_funnel_insert ON sell_funnel_events;
CREATE POLICY sell_funnel_insert ON sell_funnel_events
  FOR INSERT WITH CHECK (true);

-- Kun admin må læse.
DROP POLICY IF EXISTS sell_funnel_select_admin ON sell_funnel_events;
CREATE POLICY sell_funnel_select_admin ON sell_funnel_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

COMMENT ON TABLE sell_funnel_events IS
  'Anonym tragt for sælg-flowet. Ingen user_id, ingen IP, intet gemt i '
  'browseren. flow_id lever kun i hukommelsen under ét forsøg.';
