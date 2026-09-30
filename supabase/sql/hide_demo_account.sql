-- ============================================================
-- hide_demo_account.sql
--
-- Skjuler "Cykelbørsen Demo" fra alle offentlige lister, søgning og
-- sitemap. Godkendt ud fra LIST_TEST_ACCOUNTS.sql 30. sep.
--
-- Kun demo-butikken rammes. De fire andre kandidater (Forhandler 1,
-- Benjamin, Anna Hansen, test) er private konti uden aktive annoncer:
-- de står ikke i nogen offentlig liste og ikke i sitemap, så der er
-- intet at skjule.
--
-- Virkning: forhandlerlisterne, prerender og sitemap henter kun
-- verified = true. Kontoen har ingen aktive annoncer; skulle den få
-- nogen, stopper bikes_insert_verified_only nye, og UPDATE nedenfor
-- deaktiverer eksisterende.
--
-- Idempotent. Rollback:
--   UPDATE profiles SET verified = true
--    WHERE id = 'afc48c21-f3fd-45e3-ab6f-afff22ba9cf9';
-- ============================================================

UPDATE profiles
   SET verified = false
 WHERE id = 'afc48c21-f3fd-45e3-ab6f-afff22ba9cf9'
   AND verified = true;

UPDATE bikes
   SET is_active = false
 WHERE user_id = 'afc48c21-f3fd-45e3-ab6f-afff22ba9cf9'
   AND is_active = true;
