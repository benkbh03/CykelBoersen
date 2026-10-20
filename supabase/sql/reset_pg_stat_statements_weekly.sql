-- ══════════════════════════════════════════════════════════════════════
--  Ugentlig nulstilling af pg_stat_statements
--  Kørt i produktion 19. okt. 2026. Idempotent: sikker at køre igen.
-- ══════════════════════════════════════════════════════════════════════
--
--  Hvorfor: Supabases overvågning (postgres_exporter) læser
--  pg_stat_statements hvert minut. Med 4.066 forespørgsler og 3,4 MB tekst
--  kunne den ikke længere sortere i hukommelsen (work_mem 4 MB) og skrev
--  7,8 MB midlertidige filer til disken hvert minut, ca. 1 TB i alt. På
--  Nano (gratisplanen) brugte det disk-kvoten op, og 19. okt. 14:31-14:34
--  fik selv simple kald timeout. Efter nulstilling: 0 bytes pr. minut.
--
--  Statistikken vokser igen af Dashboard, migrationer og SQL fra Claude,
--  derfor en ugentlig nulstilling (mandag 03:00 UTC). Den sletter ingen
--  data, kun historikken på Dashboard → Query Performance.

SELECT pg_stat_statements_reset();

SELECT cron.unschedule('nulstil-pg-stat-statements')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nulstil-pg-stat-statements');

SELECT cron.schedule('nulstil-pg-stat-statements', '0 3 * * 1',
                     'select pg_stat_statements_reset()');
