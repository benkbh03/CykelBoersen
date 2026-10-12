-- ============================================================
-- hide_private_profile_columns.sql
-- ============================================================
-- Skjuler e-mail, CVR, ID-dokument og Stripe-felter på profiles for den
-- offentlige nøgle.
--
-- BAGGRUND
-- profiles har SELECT-politikken "Alle kan se profiler" USING (true), og
-- Supabase giver anon og authenticated SELECT på hele tabellen. RLS styrer
-- rækker, ikke kolonner, så alle 45 kolonner kunne hentes af enhver:
--   curl '<projekt>/rest/v1/profiles?select=email' -H 'apikey: <offentlig nøgle>'
-- Optælling 12. okt. 2026: e-mail på alle 43 brugere, CVR på 10, stien til et
-- uploadet ID-dokument på 1.
--
-- RETTELSEN
-- Tabel-SELECT fjernes og gives tilbage kolonne for kolonne. Disse ti står
-- IKKE på listen og kan derefter kun læses af service-role (edge functions)
-- og gennem funktionerne i add_private_profile_rpcs.sql:
--   email, cvr, dealer_application, id_pending, id_doc_url,
--   stripe_customer_id, stripe_subscription_id, stripe_subscription_status,
--   stripe_account_id, admin_authorized_by
--
-- BLIVER OFFENTLIGE MED VILJE
-- - phone, address, postcode, lat, lng: kun forhandlere har dem
--   (strip_private_phone og strip_private_location nulstiller private).
--   Butikkens telefon og adresse står på forhandlersiden.
-- - id, is_admin, seller_type, verified: RLS-politikker på bikes, bike_images
--   m.fl. slår op i profiles med kalderens rettigheder. Mangler én af dem,
--   fejler HVER annonce-forespørgsel med "permission denied for table profiles".
-- - admin_can_create_listings, admin_authorized_at: samtykke-flag, ikke
--   persondata. Indgår i PROFILE_SESSION_FIELDS og annoncesidens forespørgsel.
-- - stripe_account_status: en status ('none', 'pending', 'enabled'), som
--   udlejningssiden bruger til at slå booking til.
--
-- VIGTIGT FREMOVER
-- En NY kolonne på profiles kan ikke læses fra browseren, før den får sin
-- egen GRANT. Det er sikkert som standard (en ny følsom kolonne bliver ikke
-- offentlig samme dag), men en offentlig kolonne skal tilføjes her:
--   GRANT SELECT (ny_kolonne) ON public.profiles TO anon, authenticated;
-- Ellers fejler forespørgslen der nævner den, og select('*') fejler altid.
--
-- RÆKKEFØLGE
-- 1. add_private_profile_rpcs.sql og remove_private_address.sql er kørt.
-- 2. Frontenden der ikke bruger select('*') på profiles er merget, OG har
--    været ude i et døgn. Statiske imports har ingen ?v=, så en cachet
--    js/profile-edit-page.js med select('*') kan leve i timevis efter
--    deploy. Den ville vise en tom formular, og et tryk på Gem ville skrive
--    de tomme felter over profilen.
-- 3. Denne fil.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- REVOKE og GRANT i samme blok, så de lykkes eller fejler sammen. Står
-- REVOKE alene, kan forsiden ikke hente en eneste annonce.
DO $$
BEGIN
  REVOKE SELECT ON public.profiles FROM anon, authenticated;

  GRANT SELECT (
    id, name, city, seller_type, shop_name, verified, created_at, is_admin,
    id_verified, address, avatar_url, bio, last_seen, email_verified,
    lat, lng, postcode, location_precision, phone,
    offers_financing, offers_tradein, opening_hours, website, facebook,
    instagram, services, featured_until,
    admin_can_create_listings, admin_authorized_at,
    hours_optout, offers_optout, services_optout, social_optout,
    avatar_thumb_url, stripe_account_status
  ) ON public.profiles TO anon, authenticated;
END $$;


-- ── Fortryd ──────────────────────────────────────────────────
-- Giver hele tabellen tilbage, præcis som før. Tager et sekund.
--
--   GRANT SELECT ON public.profiles TO anon, authenticated;


-- ── Kontrol ──────────────────────────────────────────────────
-- Forventet: 0 rækker.
--
--   SELECT grantee, column_name FROM information_schema.column_privileges
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND privilege_type = 'SELECT' AND grantee IN ('anon','authenticated')
--      AND column_name IN ('email','cvr','dealer_application','id_pending',
--          'id_doc_url','stripe_customer_id','stripe_subscription_id',
--          'stripe_subscription_status','stripe_account_id','admin_authorized_by');
