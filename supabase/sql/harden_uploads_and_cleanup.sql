-- ============================================================
-- harden_uploads_and_cleanup.sql
-- ============================================================
-- Tre små ting fra sikkerhedsgennemgangen 16. okt. 2026. Ingen af dem
-- ændrer hvad en almindelig bruger kan på siden i dag.
--
-- De tre gamle profil-kopier (profiles_*_2026*) slettes IKKE her. Hver
-- har sin egen slettedato i den migration der lavede den, og
-- STATUS_TJEK.sql række 78-80 siger til, når datoen er nået.
--
-- 1. UPLOAD-GRÆNSER PÅ avatars OG id-documents
--    bike-images var låst (5 MB, jpeg/png/webp). De to andre buckets tog
--    imod alt i alle størrelser, så en indlogget bruger kunne lægge store
--    filer eller HTML-sider i sin egen mappe, og avatars er offentlig.
--    - avatars: profile-edit-page.js uploader kun webp på 512 px (typisk
--      under 150 KB). 2 MB og tre billedtyper giver god luft.
--    - id-documents: ingen kode uploader dertil længere, men politikken
--      for upload står der stadig. 10 MB, billeder og PDF.
--
-- 2. DUBLETTER PÅ saved_bikes
--    Samme regel stod to gange under to navne (DELETE, INSERT og SELECT),
--    lavet af to migrationer. Politikker OR'es sammen, så det var
--    harmløst, men det er støj når politikkerne gennemgås. Navnene der
--    beholdes, står i CURRENT_POLICIES.md.
--
-- 3. FAST search_path PÅ 8 FUNKTIONER
--    Supabases sikkerhedsrådgiver ("Function Search Path Mutable"). Tre af
--    dem kører som SECURITY DEFINER, bl.a. den der beskytter is_admin.
--    Værdien er præcis den søgesti databasen bruger i dag
--    ("$user", public, extensions), så funktionerne opfører sig ens.
--    pg_temp står sidst, så en midlertidig tabel aldrig kan skygge for en
--    rigtig.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent: kan køres
-- igen uden at ændre noget.
--
-- Kvittering: STATUS_TJEK.sql række 74-77 skal stå OK bagefter.
-- ============================================================


-- ── 1. Upload-grænser ────────────────────────────────────────

UPDATE storage.buckets
   SET file_size_limit    = 2 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
 WHERE id = 'avatars';

UPDATE storage.buckets
   SET file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 WHERE id = 'id-documents';


-- ── 2. Dubletter på saved_bikes ──────────────────────────────
-- Beholdes: "Bruger kan slette eget save", "Bruger kan indsætte eget
-- save", "Bruger kan se egne saves" og "Ejer af bike kan se interesserede".

DROP POLICY IF EXISTS "Kun ejer kan fjerne gemte annoncer" ON public.saved_bikes;
DROP POLICY IF EXISTS "Kun ejer kan gemme annoncer"        ON public.saved_bikes;
DROP POLICY IF EXISTS "Kun ejer kan se gemte annoncer"     ON public.saved_bikes;


-- ── 3. Fast search_path ──────────────────────────────────────

ALTER FUNCTION public.handle_new_user()                      SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.notify_message_email()                 SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.protect_privileged_profile_columns()   SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.strip_phone_from_private_profiles()    SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.strip_location_from_private_profiles() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.prevent_sold_bike_edits()              SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.guard_bike_brand_model()               SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.bike_upgrades_valid(jsonb)             SET search_path = public, extensions, pg_temp;


-- ── Fortryd ──────────────────────────────────────────────────
-- Upload-grænser:
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--    WHERE id IN ('avatars', 'id-documents');
-- Dubletterne har ingen virkning og skal ikke genskabes.
-- search_path (pr. funktion):
--   ALTER FUNCTION public.handle_new_user() RESET search_path;
