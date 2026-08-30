-- ============================================================
-- client_errors: fejl der sker i brugerens browser
-- ============================================================
-- I dag opdages en fejl kun hvis nogen skriver til dig om den, og det gør
-- folk ikke. De forlader siden. main.js fangede allerede uhåndterede
-- promise-fejl, men skrev dem kun til konsollen, som ingen andre end
-- udvikleren ser.
--
-- Med hundrede besøgende kan man leve uden. Med tusind er man blind: de fejl
-- der kun rammer bestemte browsere eller telefoner er præcis dem man aldrig
-- selv støder på.
--
-- ANONYMT, som search_logs og sell_funnel_events. Ingen user_id, ingen IP,
-- ingen e-mail. Kun hvad der gik galt, hvor på siden, og hvilken browser.
-- user_agent er nødvendig fordi det som regel ER browseren der er
-- forskellen; den er ikke i sig selv identificerende for én person.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_errors (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message    text        NOT NULL,
  source     text,                   -- fil + linje, fx main.js:2184
  path       text,                   -- ruten fejlen skete på, uden query
  stack      text,                   -- afkortet i klienten
  user_agent text,
  kind       text        NOT NULL DEFAULT 'error',   -- 'error' | 'promise'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at DESC);
-- Til gruppering: den samme fejl rammer typisk mange brugere, og det er
-- antallet pr. besked der afgør hvad man skal rette først.
CREATE INDEX IF NOT EXISTS idx_client_errors_message ON client_errors(message);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Alle må skrive: en fejl skal kunne rapporteres af en besøgende der ikke er
-- logget ind, og det er ofte netop dér de sker.
DROP POLICY IF EXISTS client_errors_insert ON client_errors;
CREATE POLICY client_errors_insert ON client_errors
  FOR INSERT WITH CHECK (true);

-- Kun admin må læse.
DROP POLICY IF EXISTS client_errors_select_admin ON client_errors;
CREATE POLICY client_errors_select_admin ON client_errors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

COMMENT ON TABLE client_errors IS
  'Anonyme JavaScript-fejl fra browseren. Intet user_id, ingen IP. '
  'Klienten afkorter og dublet-filtrerer inden afsendelse.';

-- ── Oprydning ────────────────────────────────────────────────
-- Fejl er kun interessante mens de er aktuelle. Kør denne linje en gang
-- imellem, eller læg den som et Supabase-cron-job, så tabellen ikke vokser
-- i det uendelige.
DELETE FROM client_errors WHERE created_at < now() - interval '90 days';
