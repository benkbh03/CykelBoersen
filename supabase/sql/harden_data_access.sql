-- Datatilgangs-hærdning: sikrer RLS + ejerskabs-policies på de tabeller hvor
-- repoet ikke selv definerer dem (messages, reviews, bike_images) samt
-- UPDATE/DELETE på bikes. Baseret på QA-audit 2026-06-09.
--
-- SIKKER AT KØRE: alt er idempotent (DROP POLICY IF EXISTS + CREATE, og
-- ENABLE ROW LEVEL SECURITY er et no-op hvis allerede slået til). Policy-navnene
-- er unikke for denne fil, så eksisterende policies røres ikke. Edge functions
-- bruger service-role og omgås RLS uændret.
--
-- KØR FØRST denne diagnose for at se nuværende tilstand:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('messages','reviews','bike_images','bikes');
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('messages','reviews','bike_images','bikes')
--   ORDER BY tablename, cmd;

-- ── 1. MESSAGES — kun afsender/modtager må læse; afsender må indsætte; ──────
--        modtager må markere som læst.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_participants ON messages;
CREATE POLICY messages_select_participants ON messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS messages_insert_own ON messages;
CREATE POLICY messages_insert_own ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS messages_update_receiver_read ON messages;
CREATE POLICY messages_update_receiver_read ON messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- ── 2. REVIEWS — offentligt læsbare; kun forfatteren må oprette. ────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_select_public ON reviews;
CREATE POLICY reviews_select_public ON reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS reviews_insert_own ON reviews;
CREATE POLICY reviews_insert_own ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- ── 3. BIKE_IMAGES — offentligt læsbare; kun ejeren af den tilhørende ───────
--        annonce (eller admin) må indsætte/ændre/slette.
ALTER TABLE bike_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bike_images_select_public ON bike_images;
CREATE POLICY bike_images_select_public ON bike_images FOR SELECT
  USING (true);

DROP POLICY IF EXISTS bike_images_insert_owner ON bike_images;
CREATE POLICY bike_images_insert_owner ON bike_images FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM bikes b WHERE b.id = bike_images.bike_id AND b.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS bike_images_update_owner ON bike_images;
CREATE POLICY bike_images_update_owner ON bike_images FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM bikes b WHERE b.id = bike_images.bike_id AND b.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS bike_images_delete_owner ON bike_images;
CREATE POLICY bike_images_delete_owner ON bike_images FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM bikes b WHERE b.id = bike_images.bike_id AND b.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ── 4. BIKES — UPDATE/DELETE kun for ejeren (eller admin). SELECT/INSERT ────
--        håndteres allerede af bikes_public_select_all + bikes_insert_verified_only.
ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bikes_update_owner ON bikes;
CREATE POLICY bikes_update_owner ON bikes FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS bikes_delete_owner ON bikes;
CREATE POLICY bikes_delete_owner ON bikes FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );
