-- ============================================================
-- harden_bike_images_bucket.sql
-- ============================================================
-- Fundet af agenten rls-og-autorisation, 3. september 2026.
--
-- To fejl i den samme bucket, med samme rod: politikkerne antager at første
-- mappeled er et BRUGER-id, men for annoncebilleder er det et ANNONCE-id.
--
--   Sti i dag:  <annonce-id>/<tidsstempel>-<tilfældig>.<ext>
--
-- Konsekvens 1 — INSERT var uden scope:
--   WITH CHECK (bucket_id = 'bike-images' AND auth.role() = 'authenticated')
--   Enhver der er logget ind kunne lægge en vilkårlig fil på en vilkårlig
--   sti i en offentligt læsbar bucket. Gratis fil-hosting på vores lager og
--   vores egress, og en vej til at få fremmed indhold liggende på domænet.
--
-- Konsekvens 2 — DELETE virkede for INGEN:
--   USING (auth.uid()::text = (storage.foldername(name))[1])
--   Første mappeled er et annonce-id og er aldrig lig et bruger-id, så
--   politikken kunne aldrig matche. js/listing-edit.js:537 KALDER faktisk
--   .remove() når brugeren fjerner et billede — kaldet fejlede bare tavst,
--   og returværdien blev ignoreret. Hvert fjernet billede blev liggende.
--
-- LØSNINGEN, og hvorfor den ikke ændrer stien for annoncebilleder:
-- I stedet for at tvinge et bruger-id ind i stien accepterer politikkerne nu
-- to former for ejerskab af første mappeled:
--   (a) det ER kalderens bruger-id  → dækker rental/ og admin-onbehalf/,
--       som flyttes til <bruger-id>/… i samme ombæring
--   (b) det er et annonce-id kalderen ejer → dækker alle annoncebilleder,
--       også de tusindvis der allerede ligger der
-- Dermed begynder DELETE at virke for eksisterende filer med det samme, og
-- der opstår ingen splittelse mellem gamle og nye stier.
--
-- Der oprettes bevidst INGEN UPDATE-politik: alle fire upload-steder bruger
-- upsert: false, så ingen har brug for at overskrive en eksisterende fil.
-- Uden UPDATE kan en angriber heller ikke overskrive en andens billede.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── INSERT: kun i egen mappe eller på egen annonce ───────────

DROP POLICY IF EXISTS "Authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "bike_images_insert_own" ON storage.objects;

CREATE POLICY "bike_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bike-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.bikes b
        WHERE b.id::text = (storage.foldername(name))[1]
          AND b.user_id  = auth.uid()
      )
    )
  );


-- ── DELETE: samme betingelse ─────────────────────────────────

DROP POLICY IF EXISTS "Owner delete" ON storage.objects;
DROP POLICY IF EXISTS "bike_images_delete_own" ON storage.objects;

CREATE POLICY "bike_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bike-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.bikes b
        WHERE b.id::text = (storage.foldername(name))[1]
          AND b.user_id  = auth.uid()
      )
    )
  );


-- ── Kontrol ──────────────────────────────────────────────────
-- Forventet: to politikker på bike-images, begge TO authenticated, og
-- INGEN med auth.role() = 'authenticated' alene i sit udtryk.
--
--   SELECT policyname, cmd, roles::text,
--          replace(COALESCE(qual, with_check), E'\n', ' ') AS udtryk
--   FROM pg_policies
--   WHERE schemaname = 'storage'
--     AND (qual LIKE '%bike-images%' OR with_check LIKE '%bike-images%')
--   ORDER BY cmd;
--
-- Funktionel prøve, som er den der tæller: rediger en annonce, fjern et
-- billede, gem, og se i Storage at filen faktisk er væk. Det virkede ikke
-- før denne migration.
