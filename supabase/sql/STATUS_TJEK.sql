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
--
--  HVAD DEN IKKE KAN SVARE PÅ: om en edge function er deployet. Det står
--  ikke i databasen, og der findes ingen forespørgsel der afslører det.
--  Edge functions skal tjekkes i Supabase Dashboard → Edge Functions, hvor
--  hver function viser sin seneste deploy-dato. Sammenlign den med datoen
--  på den seneste commit der rørte `supabase/functions/<navn>/index.ts`.

SELECT * FROM (

  -- Versionen af DENNE fil. Står der en ældre dato end den i rå-linket på
  -- GitHub, er det en gammel kopi der er kørt (det skete 30. sep.).
  SELECT 0 AS sort, 'version' AS migration, 'STATUS_TJEK.sql udgave' AS tjek, '2026-10-16' AS status

  -- ── add_moderation_log_and_suspension.sql (15. september) ──────────
  UNION ALL
  SELECT 1, 'moderation', 'tabel moderation_log',
         CASE WHEN to_regclass('public.moderation_log')   IS NOT NULL THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 2, 'moderation', 'tabel user_suspensions',
         CASE WHEN to_regclass('public.user_suspensions') IS NOT NULL THEN 'OK' ELSE 'MANGLER' END
  -- "Findes" er IKKE nok. Den 15. september stod der OK her, mens funktionen
  -- var den GAMLE udgave der laeste profiles.suspended_until. Tjekket loej
  -- ikke, det spurgte bare om det forkerte. Nu laeses selve kroppen.
  UNION ALL SELECT 3, 'moderation', 'funktion is_suspended() laeser user_suspensions',
         COALESCE((SELECT CASE WHEN prosrc LIKE '%user_suspensions%' THEN 'OK'
                               ELSE 'GAMMEL VERSION (laeser profiles)' END
                     FROM pg_proc WHERE proname = 'is_suspended' LIMIT 1), 'MANGLER')
  -- Uden NEW.created_at := now() kan graensen omgaas ved at sende et
  -- tidsstempel 61 minutter tilbage. Funktionen ville stadig "findes".
  UNION ALL SELECT 4, 'moderation', 'limit_new_conversations() laaser created_at',
         COALESCE((SELECT CASE WHEN prosrc LIKE '%created_at := now()%' THEN 'OK'
                               ELSE 'GAMMEL VERSION (kan omgaas)' END
                     FROM pg_proc WHERE proname = 'limit_new_conversations' LIMIT 1), 'MANGLER')
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

  -- Foerste udgave af moderations-migrationen lagde dem paa profiles, hvor
  -- SELECT er USING (true). Ligger de der endnu, er oprydningen ikke koert.
  UNION ALL SELECT 7, 'moderation', 'suspended_* fjernet fra profiles',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'profiles'
                              AND column_name LIKE 'suspended%')
              THEN 'MANGLER (ligger stadig offentligt paa profiles)' ELSE 'OK' END

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

  -- ── guard_bike_brand_model.sql (mærke/model "null") ────────────────
  UNION ALL SELECT 41, 'annoncer', 'trigger trg_guard_bike_brand_model',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_bike_brand_model')
              THEN 'OK' ELSE 'MANGLER' END

  -- Annoncer der allerede har "null" som mærke eller model. Migrationen
  -- retter model selv; mærke skal rettes i admin-panelet. Forventet: 0.
  UNION ALL SELECT 42, 'annoncer', 'annoncer med mærke/model "null" (skal vaere 0)',
         (SELECT CASE WHEN count(*) = 0 THEN 'OK'
                      ELSE 'SE EFTER (' || count(*) || ')' END
            FROM bikes
           WHERE lower(btrim(COALESCE(brand, ''))) IN ('null', 'undefined')
              OR lower(btrim(COALESCE(model, ''))) IN ('null', 'undefined'))

  -- ── remove_feed_template_description.sql ───────────────────────────
  -- Feed-annoncer der stadig har skabelonteksten. Forventet: 0.
  UNION ALL SELECT 43, 'feed', 'annoncer med skabelon-beskrivelse (skal vaere 0)',
         (SELECT CASE WHEN count(*) = 0 THEN 'OK'
                      ELSE 'SE EFTER (' || count(*) || ')' END
            FROM bikes
           WHERE external_id IS NOT NULL
             AND description LIKE '%ny cykel fra forhandleren. Kontakt forhandleren%')

  -- ── add_trades.sql (handler som rækker med status) ────────────────
  UNION ALL SELECT 44, 'handler', 'tabel trades',
         CASE WHEN to_regclass('public.trades') IS NOT NULL THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 45, 'handler', 'trigger: handel oprettes af saelgerens ✅-besked',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_create_trade_from_message')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 46, 'handler', 'trigger: genaktivering annullerer handlen',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cancel_trade_on_reactivate')
              THEN 'OK' ELSE 'MANGLER' END
  -- Én SELECT-politik paa reviews, og den skjuler annullerede handler.
  -- En ekstra politik ville OR'es ind og vise dem igen.
  UNION ALL SELECT 47, 'handler', 'reviews: kun én SELECT-politik, og den bruger review_trade_visible',
         (SELECT CASE WHEN count(*) = 1 AND bool_and(qual LIKE '%review_trade_visible%') THEN 'OK'
                      ELSE 'SE EFTER (' || count(*) || ' politikker)' END
            FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'reviews' AND cmd = 'SELECT')
  -- Gennemforte handler hvor annoncen er aktiv igen. Efter
  -- cancel_reactivated_trades.sql: 0. Nye opstaar ikke, triggeren tager dem.
  UNION ALL SELECT 48, 'handler', 'gennemfoerte handler paa aktive annoncer (skal vaere 0)',
         -- Dynamisk (query_to_xml), fordi en direkte FROM trades ville faa HELE
         -- tjekket til at fejle, foer add_trades.sql er koert.
         CASE WHEN to_regclass('public.trades') IS NULL THEN 'MANGLER'
              ELSE (SELECT CASE WHEN n = 0 THEN 'OK' ELSE 'SE EFTER (' || n || ')' END
                      FROM (SELECT (xpath('/row/n/text()', query_to_xml(
                              'SELECT count(*) AS n FROM trades t JOIN bikes b ON b.id = t.bike_id
                                WHERE t.status = ''gennemført'' AND b.is_active = true',
                              false, true, '')))[1]::text::int AS n) x) END

  -- ── add_frontpage_indexes.sql ──────────────────────────────────────
  UNION ALL SELECT 49, 'hastighed', 'indeks paa bike_images og bikes (3)',
         (SELECT CASE WHEN count(*) = 3 THEN 'OK' ELSE 'MANGLER (' || count(*) || ' af 3)' END
            FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname IN ('idx_bike_images_bike_id',
                               'idx_bikes_active_category_created',
                               'idx_bikes_user_id'))

  -- ── hide_demo_account.sql ──────────────────────────────────────────
  UNION ALL SELECT 53, 'forhandlere', 'Cykelbørsen Demo skjult (ikke verificeret, 0 aktive)',
         (SELECT CASE WHEN count(*) = 0 THEN 'OK' ELSE 'SE EFTER' END
            FROM profiles p
           WHERE p.id = 'afc48c21-f3fd-45e3-ab6f-afff22ba9cf9'
             AND (p.verified
                  OR EXISTS (SELECT 1 FROM bikes b WHERE b.user_id = p.id AND b.is_active)))

  -- ── add_low_price_review.sql ───────────────────────────────────────
  UNION ALL SELECT 54, 'moderation', 'trigger: cykler under 200 kr. venter paa godkendelse',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hold_low_price_bikes')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 55, 'moderation', 'funktion: admin_review_bike',
         CASE WHEN to_regprocedure('public.admin_review_bike(uuid,boolean,text)') IS NOT NULL
              THEN 'OK' ELSE 'MANGLER' END
  -- Den gamle udgave af laasen blokerede sælgeren i at rette prisen.
  UNION ALL SELECT 56, 'moderation', 'laasen paa solgte annoncer undtager tilbageholdte',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_sold_bike_edits'
                             AND prosrc LIKE '%held_for_review%')
              THEN 'OK' ELSE 'MANGLER' END
  -- Ikke en fejl, en koe: saa mange venter paa dig i admin-panelet.
  UNION ALL SELECT 57, 'moderation', 'annoncer der venter paa godkendelse',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_name = 'bikes' AND column_name = 'held_for_review')
              THEN 'MANGLER'
              ELSE (xpath('/row/n/text()', query_to_xml(
                     'SELECT count(*) AS n FROM bikes WHERE held_for_review AND deleted_at IS NULL',
                     false, true, '')))[1]::text END

  -- ── add_bike_upgrades.sql (6. oktober) ─────────────────────────────
  UNION ALL SELECT 58, 'opgraderinger', 'kolonne bikes.upgrades',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'bikes' AND column_name = 'upgrades')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 59, 'opgraderinger', 'constraint bikes_upgrades_valid',
         CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bikes_upgrades_valid')
              THEN 'OK' ELSE 'MANGLER' END

  -- ── Skjulte profilkolonner (12. oktober) ───────────────────────────
  -- remove_private_address.sql
  UNION ALL SELECT 60, 'skjult profil', 'trigger strip_private_location',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'strip_private_location' AND NOT tgisinternal)
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 61, 'skjult profil', 'private profiler med gadeadresse (skal vaere 0)',
         (SELECT CASE WHEN count(*) = 0 THEN 'OK' ELSE 'MANGLER (' || count(*) || ')' END
            FROM profiles
           WHERE COALESCE(seller_type, 'private') <> 'dealer'
             AND (address IS NOT NULL OR postcode IS NOT NULL OR location_precision = 'exact'))
  -- add_private_profile_rpcs.sql
  UNION ALL SELECT 62, 'skjult profil', 'funktion get_my_private_profile()',
         CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_private_profile')
              THEN 'OK' ELSE 'MANGLER' END
  UNION ALL SELECT 63, 'skjult profil', 'funktion admin_list_profiles(), lukket for anon',
         COALESCE((SELECT CASE WHEN has_function_privilege('anon', oid, 'EXECUTE')
                               THEN 'AABEN FOR ANON' ELSE 'OK' END
                     FROM pg_proc WHERE proname = 'admin_list_profiles' LIMIT 1), 'MANGLER')
  -- hide_private_profile_columns.sql. Taeller (rolle, kolonne)-par der
  -- stadig kan laeses med den offentlige noegle. 20 = intet er skjult endnu.
  UNION ALL SELECT 64, 'skjult profil', 'e-mail, CVR, ID-dokument, Stripe skjult for anon',
         (SELECT CASE WHEN count(*) FILTER (WHERE has_column_privilege(r, 'public.profiles', c, 'SELECT')) = 0
                      THEN 'OK'
                      ELSE 'MANGLER (' || count(*) FILTER (WHERE has_column_privilege(r, 'public.profiles', c, 'SELECT')) || ' af 20 aabne)' END
            FROM unnest(ARRAY['anon','authenticated']) r,
                 unnest(ARRAY['email','cvr','dealer_application','id_pending','id_doc_url',
                              'stripe_customer_id','stripe_subscription_id','stripe_subscription_status',
                              'stripe_account_id','admin_authorized_by']) c)
  -- Omvendt: RLS-politikkerne paa bikes m.fl. slaar op i disse fire med
  -- kalderens rettigheder. Mangler én, kan forsiden ikke hente annoncer.
  UNION ALL SELECT 65, 'skjult profil', 'id, is_admin, seller_type, verified laesbare (forsiden)',
         (SELECT CASE WHEN bool_and(has_column_privilege(r, 'public.profiles', c, 'SELECT'))
                      THEN 'OK' ELSE 'FEJL: annonce-forespoergsler fejler' END
            FROM unnest(ARRAY['anon','authenticated']) r,
                 unnest(ARRAY['id','is_admin','seller_type','verified']) c)

  -- revoke_client_payment_rpcs.sql (13. oktober). Kan kaldes med den
  -- offentlige noegle = gratis fremhaevning og ubetalte bookinger.
  UNION ALL SELECT 66, 'betaling', 'apply_paid_boost m.fl. lukket for browseren',
         (SELECT CASE WHEN count(*) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')
                                               OR has_function_privilege('authenticated', oid, 'EXECUTE')) = 0
                      THEN 'OK'
                      ELSE 'AABEN (' || count(*) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')
                                               OR has_function_privilege('authenticated', oid, 'EXECUTE')) || ' af 3)' END
            FROM pg_proc
           WHERE proname IN ('apply_paid_boost', 'confirm_rental_booking', 'create_rental_booking'))

  -- ── reserve_cykelboersen_name.sql (13. oktober) ────────────────────
  UNION ALL SELECT 70, 'svindel', 'trigger reject_reserved_profile_name paa profiles',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'reject_reserved_profile_name'
                              AND tgrelid = 'public.profiles'::regclass)
              THEN 'OK' ELSE 'MANGLER' END

  -- ── block_links_from_new_accounts.sql (13. oktober) ────────────────
  UNION ALL SELECT 71, 'svindel', 'trigger block_links_from_new_accounts paa messages',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'block_links_from_new_accounts'
                              AND tgrelid = 'public.messages'::regclass)
              THEN 'OK' ELSE 'MANGLER' END

  -- ── add_official_account.sql (13. oktober) ─────────────────────────
  UNION ALL SELECT 72, 'svindel', 'profiles.is_official + trigger protect_is_official',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_schema = 'public' AND table_name = 'profiles'
                                  AND column_name = 'is_official') THEN 'MANGLER'
              WHEN NOT has_column_privilege('anon', 'public.profiles', 'is_official', 'SELECT')
                THEN 'FEJL: indbakken kan ikke laese den'
              WHEN NOT EXISTS (SELECT 1 FROM pg_trigger
                                WHERE tgname = 'protect_is_official'
                                  AND tgrelid = 'public.profiles'::regclass) THEN 'AABEN: alle kan saette den'
              ELSE 'OK' END
  UNION ALL SELECT 73, 'svindel', 'officielle konti (forventet 1)',
         (SELECT count(*)::text FROM profiles WHERE is_official)

  -- ── harden_uploads_and_cleanup.sql (16. oktober) ───────────────────
  UNION ALL SELECT 74, 'uploads', 'avatars: hoejst 2 MB, kun billeder',
         COALESCE((SELECT CASE WHEN file_size_limit <= 2097152 AND allowed_mime_types IS NOT NULL
                               THEN 'OK' ELSE 'MANGLER (ingen graense)' END
                     FROM storage.buckets WHERE id = 'avatars'), 'MANGLER (bucket findes ikke)')
  UNION ALL SELECT 75, 'uploads', 'id-documents: hoejst 10 MB, billeder og PDF',
         COALESCE((SELECT CASE WHEN file_size_limit <= 10485760 AND allowed_mime_types IS NOT NULL
                               THEN 'OK' ELSE 'MANGLER (ingen graense)' END
                     FROM storage.buckets WHERE id = 'id-documents'), 'MANGLER (bucket findes ikke)')
  -- Tre regler stod der to gange under hvert sit navn. 7 = ikke koert.
  UNION ALL SELECT 76, 'politikker', 'saved_bikes uden dubletter (forventet 4)',
         (SELECT CASE WHEN count(*) = 4 THEN 'OK'
                      ELSE 'SE EFTER (' || count(*) || ', forventet 4)' END
            FROM pg_policies WHERE schemaname = 'public' AND tablename = 'saved_bikes')
  UNION ALL SELECT 77, 'funktioner', 'fast search_path paa 8 funktioner',
         (SELECT CASE WHEN count(*) FILTER (WHERE array_to_string(proconfig, ',') LIKE '%search_path=%') = 8
                      THEN 'OK'
                      ELSE 'MANGLER (' || count(*) FILTER (WHERE array_to_string(proconfig, ',') LIKE '%search_path=%') || ' af 8)' END
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('handle_new_user', 'notify_message_email',
                               'protect_privileged_profile_columns', 'strip_phone_from_private_profiles',
                               'strip_location_from_private_profiles', 'prevent_sold_bike_edits',
                               'guard_bike_brand_model', 'bike_upgrades_valid'))

  -- ── add_buy_requests.sql (17. oktober) ─────────────────────────────
  UNION ALL SELECT 67, 'opkoeb', 'tabel buy_requests med 4 politikker + graense paa 10',
         CASE WHEN to_regclass('public.buy_requests') IS NULL THEN 'MANGLER'
              WHEN (SELECT count(*) FROM pg_policies WHERE tablename = 'buy_requests') <> 4
                THEN 'FEJL: forventet 4 politikker'
              WHEN has_table_privilege('authenticated', 'public.buy_requests', 'INSERT')
                THEN 'FEJL: REVOKE ALL mangler (klienten kan saette dealer_id)'
              WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'buy_requests_guard')
                THEN 'FEJL: trigger buy_requests_guard mangler'
              ELSE 'OK' END

  -- ── normalize_groupset.sql (18. oktober) ───────────────────────────
  -- "105" skal staa som "Shimano 105", ellers finder filtret den ikke.
  UNION ALL SELECT 68, 'annoncer', 'komponentgruppe skrives ens (trigger + ingen rester)',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_groupset')
                THEN 'MANGLER'
              -- Ingen kald til normalize_groupset() her: findes funktionen
              -- ikke endnu, fejler hele tjekket allerede ved indlaesning.
              WHEN EXISTS (SELECT 1 FROM bikes
                            WHERE groupset ~* '^(105|ultegra|dura|grx|tiagra|sora|claris|deore|slx|xtr|xt|apex|rival|force|red|ekar)\y'
                               OR groupset ~* '^shimano deore xt')
                THEN 'FEJL: oprydningen er ikke koert'
              ELSE 'OK' END

  -- ── Gamle profil-kopier: slettedatoer ──────────────────────────────
  -- Hver kopi blev lavet som fortrydelses-mulighed af den migration der
  -- fjernede data, og hver har en slettedato i den fil. Datoen er
  -- opbevaringsperioden. Efter den er der ikke laengere et formaal med at
  -- gemme persondataene. Staar der SLET NU, saa koer DROP-linjen.
  UNION ALL SELECT 78, 'oprydning', 'profiles_snapshot_20261013 (hide_private_profile_columns.sql)',
         CASE WHEN to_regclass('public.profiles_snapshot_20261013') IS NULL THEN 'OK (slettet)'
              WHEN current_date > DATE '2026-11-13'
                THEN 'SLET NU: DROP TABLE profiles_snapshot_20261013'
              ELSE 'OK (slettes efter 13. nov. 2026)' END
  UNION ALL SELECT 79, 'oprydning', 'profiles_phone_removed_20260901 (remove_private_phone.sql)',
         CASE WHEN to_regclass('public.profiles_phone_removed_20260901') IS NULL THEN 'OK (slettet)'
              WHEN current_date > DATE '2026-12-01'
                THEN 'SLET NU: DROP TABLE profiles_phone_removed_20260901'
              ELSE 'OK (slettes efter 1. dec. 2026)' END
  UNION ALL SELECT 80, 'oprydning', 'profiles_address_removed_20261012 (remove_private_address.sql)',
         CASE WHEN to_regclass('public.profiles_address_removed_20261012') IS NULL THEN 'OK (slettet)'
              WHEN current_date > DATE '2027-01-12'
                THEN 'SLET NU: DROP TABLE profiles_address_removed_20261012'
              ELSE 'OK (slettes efter 12. jan. 2027)' END

  -- ── block_scam_listing_content.sql (19. oktober) ──────────────────
  UNION ALL SELECT 81, 'svindel', 'trigger block_scam_listing_content paa bikes',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'block_scam_listing_content'
                              AND tgrelid = 'public.bikes'::regclass)
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

  -- Uden den ugentlige nulstilling vokser pg_stat_statements, og Supabases
  -- overvågning skriver midlertidige filer hvert minut, til disk-kvoten paa
  -- Nano er brugt op (19. okt.). Over ca. 2.000 er tegn paa at jobbet ikke koerer.
  UNION ALL SELECT 81, 'drift', 'ugentlig nulstilling af pg_stat_statements (reset_pg_stat_statements_weekly.sql)',
         CASE WHEN NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nulstil-pg-stat-statements' AND active)
              THEN 'MANGLER'
              ELSE 'OK (' || (SELECT count(*) FROM pg_stat_statements) || ' forespoergsler i statistikken)' END

  -- ── Edge functions: kan IKKE tjekkes herfra ────────────────────────
  -- Rækkerne er en huskeliste. Hver skal være deployet SAMME DAG ELLER
  -- SENERE end datoen i status (seneste commit der rørte filen). Se
  -- Dashboard → Edge Functions → kolonnen med seneste deploy.
  -- Opdatér datoen her, når en function ændres.
  UNION ALL SELECT 90, 'edge function', 'import-dealer-feed',    'TJEK: deployet efter 2026-09-29'
  UNION ALL SELECT 91, 'edge function', 'suggest-listing',       'TJEK: deployet efter 2026-09-26'
  UNION ALL SELECT 92, 'edge function', 'notify-message',        'TJEK: deployet efter 2026-10-13'
  UNION ALL SELECT 93, 'edge function', 'notify-followers',      'TJEK: deployet efter 2026-09-26'
  UNION ALL SELECT 94, 'edge function', 'notify-saved-searches', 'TJEK: deployet efter 2026-09-26'

) AS t
ORDER BY sort;
