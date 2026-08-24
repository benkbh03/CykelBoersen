-- ============================================================
-- Omdøb bremsetypen "Tromlebremser" til "Rullebremser"
-- ============================================================
-- Rullebremse er det navn danske cykelhandlere og producenter bruger (Shimano
-- Roller Brake). "Tromlebremse" er den tekniske oversættelse af drum brake og
-- bliver ikke genkendt af købere.
--
-- Flertalsformen bevares, så værdien flugter med de øvrige i samme filter:
--   Skivebremser hydrauliske | Skivebremser mekaniske | Fælgbremser | Rullebremser
--
-- VIGTIGT: dette er ikke kun en tekstændring i frontenden. Værdien står som
-- ren tekst i bikes.brake_type og inde i JSON'en på gemte cykelagenter. Køres
-- SQL'en ikke, sker der to ting: eksisterende annoncer forsvinder ud af
-- bremsefilteret, og cykelagenter der lyttede efter tromlebremser holder op
-- med at matche uden at brugeren får besked.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

-- ── 1. Annoncerne ────────────────────────────────────────────
UPDATE bikes
   SET brake_type = 'Rullebremser'
 WHERE brake_type = 'Tromlebremser';

-- ── 2. Gemte cykelagenter ────────────────────────────────────
-- filters er et JSON-objekt hvor brakeTypes er et array af de valgte værdier.
-- Kolonnen blev oprettet i Dashboardet og kan være enten json eller jsonb, så
-- typen slås op og castes derefter. Ellers ville sætningen fejle på den ene
-- af de to typer.
DO $$
DECLARE
  coltype text;
BEGIN
  SELECT data_type INTO coltype
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'saved_searches'
     AND column_name  = 'filters';

  IF coltype = 'jsonb' THEN
    EXECUTE $q$
      UPDATE saved_searches
         SET filters = REPLACE(filters::text, '"Tromlebremser"', '"Rullebremser"')::jsonb
       WHERE filters::text LIKE '%Tromlebremser%'
    $q$;
  ELSIF coltype = 'json' THEN
    EXECUTE $q$
      UPDATE saved_searches
         SET filters = REPLACE(filters::text, '"Tromlebremser"', '"Rullebremser"')::json
       WHERE filters::text LIKE '%Tromlebremser%'
    $q$;
  ELSIF coltype IS NULL THEN
    RAISE NOTICE 'saved_searches.filters findes ikke — springer cykelagenter over.';
  ELSE
    RAISE NOTICE 'saved_searches.filters har uventet type %, springer over.', coltype;
  END IF;
END $$;

-- ── 3. Kolonnekommentaren ────────────────────────────────────
COMMENT ON COLUMN bikes.brake_type IS
  'Bremsetype — Skivebremser hydrauliske | Skivebremser mekaniske | '
  'Fælgbremser | Rullebremser. Eksakt match i filtre; hold listen i sync med '
  'js/map-page.js, js/cykelagent-page.js, js/sell-page.js og index.html.';

-- ── 4. Kontrol ───────────────────────────────────────────────
-- Skal give 0 rækker efter kørslen.
SELECT count(*) AS tilbage_med_gammelt_navn
  FROM bikes
 WHERE brake_type = 'Tromlebremser';
