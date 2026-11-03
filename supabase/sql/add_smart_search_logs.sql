-- ══════════════════════════════════════════════════════════════════════
--  smart_search_logs: hvad folk skriver i Smart søgning, og hvad den gjorde
--  Idempotent: sikker at køre igen.
-- ══════════════════════════════════════════════════════════════════════
--
--  Hvorfor: smart søgning "trænes" ved at rette instruktionen i
--  supabase/functions/_shared/smart-filter-core.ts, når den tager fejl. Det
--  kræver at vi kan se rigtige søgninger. Søgninger der gav 0 cykler, er dem
--  der skal læses:
--
--    SELECT created_at, query, filters, keywords, result_count
--      FROM smart_search_logs
--     WHERE result_count = 0 OR result_count IS NULL
--     ORDER BY created_at DESC LIMIT 100;
--
--  Persondata: ANONYM. Ingen bruger-id, ingen IP. Edge-funktionen fjerner
--  e-mails og telefonnumre fra teksten før den gemmes (redactForLog), og
--  rækkerne slettes efter 90 dage (cron-job nederst).
--
--  Adgang: kun edge-funktionen (service_role) skriver. Browseren kan
--  hverken læse eller skrive tabellen; den kan kun sætte antal fundne
--  cykler på sin egen, netop oprettede række via set_smart_search_result().
--  Læses i Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.smart_search_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query        text        NOT NULL CHECK (char_length(query) <= 300),
  filters      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  keywords     text[]      NOT NULL DEFAULT '{}',
  result_count integer     CHECK (result_count IS NULL OR result_count >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_search_logs_created
  ON public.smart_search_logs (created_at DESC);

ALTER TABLE public.smart_search_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smart_search_logs FROM anon, authenticated;
GRANT ALL ON public.smart_search_logs TO service_role;
-- Ingen politikker: anon og authenticated har ingen GRANT og ingen adgang.

-- ── Antal fundne cykler ────────────────────────────────────────────────
-- Siden kender antallet først når listen er hentet. Id'et er en tilfældig
-- uuid som kun den besøgende har fået, rækken kan kun sættes én gang, og kun
-- de første ti minutter. Funktionen returnerer intet, så den kan ikke bruges
-- til at gætte hvilke id'er der findes.
CREATE OR REPLACE FUNCTION public.set_smart_search_result(p_id uuid, p_count integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.smart_search_logs
     SET result_count = LEAST(GREATEST(p_count, 0), 100000)
   WHERE id = p_id
     AND result_count IS NULL
     AND created_at > now() - interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.set_smart_search_result(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_smart_search_result(uuid, integer) TO anon, authenticated;

-- ── Slet efter 90 dage (hver nat 03:30 UTC) ────────────────────────────
SELECT cron.unschedule('slet-gamle-smart-search-logs')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slet-gamle-smart-search-logs');

SELECT cron.schedule('slet-gamle-smart-search-logs', '30 3 * * *',
  $$DELETE FROM public.smart_search_logs WHERE created_at < now() - interval '90 days'$$);

-- ── Rollback ───────────────────────────────────────────────────────────
--  SELECT cron.unschedule('slet-gamle-smart-search-logs');
--  DROP FUNCTION IF EXISTS public.set_smart_search_result(uuid, integer);
--  DROP TABLE IF EXISTS public.smart_search_logs;
--  (Edge-funktionen svarer stadig normalt uden tabellen; den logger bare ikke.)
