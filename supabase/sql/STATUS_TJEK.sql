-- ══════════════════════════════════════════════════════════════════════
--  STATUS-TJEK: hvad er kørt, og hvad mangler?
--  Kør i Supabase Dashboard → SQL Editor → Run.
--  LÆSER KUN. Ændrer intet, og er sikker at køre når som helst.
-- ══════════════════════════════════════════════════════════════════════
--
--  Findes fordi "det er deployet" har været forkert før. En migration
--  skrevet og committet er ikke det samme som en migration kørt, og den
--  eneste måde at vide det på er at spørge databasen.
--
--  Læs kolonnen STATUS. Alt skal stå OK. Står der MANGLER, er den
--  migration ikke kørt endnu.

SELECT * FROM (

  -- ── add_moderation_log_and_suspension.sql (15. september) ──────────
  SELECT 1 AS sort, 'moderation'  AS migration, 'tabel moderation_log'        AS tjek,
         CASE WHEN to_regclass('public.moderation_log')   IS NOT NULL THEN 'OK' ELSE 'MANGLER' END AS status
  UNION ALL SELECT 2, 'moderation', 'tabel user_suspensions',
         CASE WHEN to_regclass('public.user_suspensions') IS NOT NULL THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 3, 'moderation', 'funktion is_suspended()',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_suspended')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 4, 'moderation', 'funktion limit_new_conversations()',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'limit_new_conversations')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 5, 'moderation', 'trigger paa messages',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'limit_new_conversations_trg' AND NOT tgisinternal)
              THEN 'OK' ELSE 'MANGLER' END
  -- Forventet 5: messages INSERT, bikes INSERT, bikes UPDATE,
  -- bike_images INSERT, reviews INSERT.
  UNION ALL SELECT 6, 'moderation', 'politikker der bruger is_suspended (skal vaere 5)',
         COALESCE((SELECT CASE WHEN count(*) = 5 THEN 'OK'
                               ELSE 'MANGLER (' || count(*) || ' af 5)' END
                     FROM pg_policies
                    WHERE schemaname = 'public'
                      AND with_check LIKE '%is_suspended%'), 'MANGLER')

  -- ── add_anon_rate_limits.sql (8. september) ────────────────────────
  UNION ALL SELECT 10, 'rate-limit', 'tabel rate_limits_anon',
         CASE WHEN to_regclass('public.rate_limits_anon') IS NOT NULL THEN 'OK' ELSE 'MANGLER' END

  -- ── fix_log_limits_and_admin_update.sql ────────────────────────────
  UNION ALL SELECT 20, 'admin-update', 'funktion admin_update_bike()',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_update_bike')
              THEN 'OK' ELSE 'MANGLER' END

  -- ── add_client_errors.sql (fejlloggen i admin-panelet) ─────────────
  UNION ALL SELECT 30, 'fejllog', 'tabel client_errors',
         CASE WHEN to_regclass('public.client_errors') IS NOT NULL THEN 'OK' ELSE 'MANGLER' END

  -- ── harden_bike_images_bucket.sql ──────────────────────────────────
  UNION ALL SELECT 40, 'storage', 'politik bike_images_insert_own',
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname = 'storage' AND policyname = 'bike_images_insert_own')
              THEN 'OK' ELSE 'MANGLER' END

  -- ── Sundhedstjek, ikke migrationer ─────────────────────────────────
  --
  -- Flere INSERT-politikker paa samme tabel OR'es sammen. Én ekstra ville
  -- goere hele suspenderingen virkningsloes, fordi den anden politik siger
  -- ja. Forventet: praecis 3, én pr. tabel.
  UNION ALL SELECT 50, 'sundhed', 'INSERT-politikker paa messages+bikes+reviews (skal vaere 3)',
         (SELECT CASE WHEN count(*) = 3 THEN 'OK'
                      ELSE 'SE EFTER (' || count(*) || ', forventet 3)' END
            FROM pg_policies
           WHERE schemaname = 'public' AND cmd = 'INSERT'
             AND tablename IN ('messages','bikes','reviews'))

  -- Afgoer om COALESCE-rettelsen i bikes-politikken betyder noget i praksis.
  UNION ALL SELECT 51, 'sundhed', 'profiler med seller_type = NULL',
         (SELECT count(*)::text FROM profiles WHERE seller_type IS NULL)

  -- Kan klienten selv saette created_at paa en besked? Hvis ja, er det
  -- netop det hul NEW.created_at := now() i triggeren lukker.
  UNION ALL SELECT 52, 'sundhed', 'klienten kan saette messages.created_at',
         CASE WHEN EXISTS (
                SELECT 1 FROM information_schema.column_privileges
                 WHERE table_name = 'messages' AND column_name = 'created_at'
                   AND grantee IN ('anon','authenticated') AND privilege_type = 'INSERT')
              THEN 'JA (triggeren lukker det)' ELSE 'nej' END

) AS t
ORDER BY sort;
