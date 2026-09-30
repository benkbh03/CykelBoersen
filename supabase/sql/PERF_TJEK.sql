-- ============================================================
-- PERF_TJEK.sql — READ-ONLY. Ændrer ingenting i databasen.
--
-- Svarer på ét spørgsmål: er forsiden langsom fordi DATABASEN er
-- langsom, eller fordi noget udenom (projektets computer, kvote,
-- netværk) er det?
--
-- Kør HELE filen i Supabase Dashboard → SQL Editor → Run. Resultatet er
-- én tabel. Kopiér den (eller tag et skærmbillede) og send den.
--
-- Sådan læses den:
--   1. forespoergsel: forsidens forespørgsler kørt som en anonym
--      besøgende (rollen anon, samme RLS som i browseren). Tallet er ms
--      i selve databasen, målt to gange. Under 50 ms = databasen er
--      ikke problemet, uanset hvad browseren viser.
--   2. pg_stat_statements: de forespørgsler der har brugt mest tid i
--      alt siden sidste nulstilling, med gennemsnit og antal kald. Her
--      ses produktionens egne tal, ikke en enkelt måling.
--   3. data / indeks / server: rækkeantal, hvilke indeks der findes, og
--      hvad projektet kører på.
--
-- Hvorfor pg_temp: hjælpefunktionerne oprettes i sessionens midlertidige
-- skema og forsvinder, når SQL Editor lukker forbindelsen. Intet bliver
-- liggende. EXPLAIN ANALYZE kører forespørgslerne for real, men de er
-- alle SELECT, så intet skrives.
-- ============================================================

-- Kør en forespørgsel som anon, returnér databasens tid i ms.
CREATE OR REPLACE FUNCTION pg_temp.perf_ms(q text) RETURNS numeric
LANGUAGE plpgsql AS $perf$
DECLARE
  plan json;
BEGIN
  SET ROLE anon;
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || q INTO plan;
  RESET ROLE;
  RETURN round(((plan->0->>'Planning Time')::numeric
              + (plan->0->>'Execution Time')::numeric), 1);
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN -1;  -- -1 = forespørgslen fejlede (fx en kolonne findes ikke)
END $perf$;

-- Top 10 fra pg_stat_statements, hvis udvidelsen findes.
CREATE OR REPLACE FUNCTION pg_temp.top_statements()
RETURNS TABLE (punkt text, vaerdi text)
LANGUAGE plpgsql AS $top$
DECLARE
  tbl text := coalesce(to_regclass('extensions.pg_stat_statements')::text,
                       to_regclass('public.pg_stat_statements')::text);
BEGIN
  IF tbl IS NULL THEN
    RETURN QUERY SELECT 'pg_stat_statements'::text, 'ikke installeret'::text;
    RETURN;
  END IF;
  RETURN QUERY EXECUTE format($q$
    SELECT left(regexp_replace(query, '\s+', ' ', 'g'), 140),
           round(mean_exec_time::numeric, 1) || ' ms i snit · '
             || calls || ' kald · max ' || round(max_exec_time::numeric) || ' ms'
      FROM %s
     WHERE query ~* '^\s*(select|with)'
       AND query ~* '\m(bikes|bike_images|profiles|saved_bikes|messages)\M'
       AND query !~* 'pg_stat_statements|pg_temp|EXPLAIN'
     ORDER BY total_exec_time DESC
     LIMIT 10 $q$, tbl);
END $top$;

-- Forsidens forespørgsler, skrevet som PostgREST skriver dem (lateral
-- join for sælger og billeder). Tidspunktet er fast, så de to kørsler
-- er ens.
DROP TABLE IF EXISTS pg_temp.perf_q;
CREATE TEMP TABLE perf_q (nr int, navn text, q text);
INSERT INTO perf_q VALUES
(1, 'Forside: 24 nyeste annoncer med sælger og billeder', $q$
SELECT b.id, b.brand, b.model, b.price, b.city, b.created_at, p.j AS profile, i.j AS images
  FROM bikes b
  LEFT JOIN LATERAL (SELECT row_to_json(x) j FROM (SELECT name, seller_type, shop_name, verified, avatar_url, address, last_seen
                       FROM profiles WHERE profiles.id = b.user_id) x) p ON true
  LEFT JOIN LATERAL (SELECT coalesce(json_agg(x), '[]') j FROM (SELECT url, thumb_url, is_primary
                       FROM bike_images WHERE bike_images.bike_id = b.id) x) i ON true
 WHERE b.is_active AND b.category = 'cykel'
 ORDER BY b.created_at DESC
 LIMIT 24 $q$),
(2, 'Forside: fremhævede annoncer', $q$
SELECT b.id, p.j, i.j
  FROM bikes b
  LEFT JOIN LATERAL (SELECT row_to_json(x) j FROM (SELECT name, seller_type FROM profiles WHERE profiles.id = b.user_id) x) p ON true
  LEFT JOIN LATERAL (SELECT coalesce(json_agg(x), '[]') j FROM (SELECT url, thumb_url FROM bike_images WHERE bike_images.bike_id = b.id) x) i ON true
 WHERE b.is_active AND b.category = 'cykel' AND b.featured_until > now()
 ORDER BY b.featured_until DESC
 LIMIT 24 $q$),
(3, 'Forside: filtertællere (alle aktive annoncer)', $q$
SELECT b.category, b.type, b.condition, b.size, b.wheel_size, b.colors, b.user_id,
       (SELECT seller_type FROM profiles WHERE profiles.id = b.user_id)
  FROM bikes b
 WHERE b.is_active $q$),
(4, 'Forside: verificerede forhandlere', $q$
SELECT id, shop_name, city, address, name, count(*) OVER ()
  FROM profiles
 WHERE seller_type = 'dealer' AND verified
 ORDER BY created_at $q$),
(5, 'Én profil efter id', $q$
SELECT * FROM profiles WHERE id = (SELECT user_id FROM bikes WHERE is_active LIMIT 1) $q$),
(6, 'Én annonce med billeder', $q$
SELECT b.*, (SELECT json_agg(bi) FROM bike_images bi WHERE bi.bike_id = b.id)
  FROM bikes b WHERE b.id = (SELECT id FROM bikes WHERE is_active ORDER BY created_at DESC LIMIT 1) $q$);

SELECT afsnit, punkt, vaerdi FROM (
  -- 1. Forespørgsler som anon
  SELECT 1 AS o, nr AS n, '1 forespoergsel'::text AS afsnit, navn AS punkt,
         pg_temp.perf_ms(q) || ' ms · derefter ' || pg_temp.perf_ms(q) || ' ms' AS vaerdi
    FROM perf_q

  -- 2. Produktionens egne tal
  UNION ALL
  SELECT 2, row_number() OVER ()::int, '2 pg_stat_statements', punkt, vaerdi
    FROM pg_temp.top_statements()

  -- 3. Data
  UNION ALL SELECT 3, 1, '3 data', 'bikes (aktive / i alt)',
         (SELECT count(*) FILTER (WHERE is_active) || ' / ' || count(*) FROM bikes)
  UNION ALL SELECT 3, 2, '3 data', 'bike_images', (SELECT count(*)::text FROM bike_images)
  UNION ALL SELECT 3, 3, '3 data', 'profiles',    (SELECT count(*)::text FROM profiles)
  UNION ALL SELECT 3, 4, '3 data', 'messages',    (SELECT count(*)::text FROM messages)
  UNION ALL SELECT 3, 5, '3 data', 'databasens størrelse',
         pg_size_pretty(pg_database_size(current_database()))

  -- 4. Indeks på de tre tabeller forsiden læser
  UNION ALL
  SELECT 4, row_number() OVER (ORDER BY tablename, indexname)::int, '4 indeks',
         tablename || '.' || indexname, regexp_replace(indexdef, '^.* USING ', '')
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename IN ('bikes', 'bike_images', 'profiles', 'saved_bikes')

  -- 5. Server
  UNION ALL SELECT 5, 1, '5 server', 'postgres', split_part(version(), ' on ', 1)
  UNION ALL SELECT 5, 2, '5 server', 'shared_buffers (antyder computerens størrelse)', current_setting('shared_buffers')
  UNION ALL SELECT 5, 3, '5 server', 'max_connections', current_setting('max_connections')
  UNION ALL SELECT 5, 4, '5 server', 'forbindelser lige nu',
         (SELECT count(*)::text FROM pg_stat_activity)
  UNION ALL SELECT 5, 5, '5 server', 'cache-træf (bør være over 99 %)',
         (SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) || ' %'
            FROM pg_stat_database WHERE datname = current_database())
  UNION ALL SELECT 5, 6, '5 server', 'statistik nulstillet',
         (SELECT coalesce(to_char(stats_reset, 'YYYY-MM-DD HH24:MI'), 'aldrig')
            FROM pg_stat_database WHERE datname = current_database())
) t
ORDER BY o, n;
