-- ============================================================
-- remove_feed_template_description.sql
--
-- Fjern skabelonteksten som forhandler-feedet satte ind, når butikken
-- ingen beskrivelse havde:
--   "<mærke> <model> — ny cykel fra forhandleren. Kontakt forhandleren
--    for nærmere info om udstyr og specifikationer."
-- Den sagde intet om cyklen. import-dealer-feed skriver den ikke længere,
-- og annoncesiden viser i stedet "Se fulde specifikationer hos {butik}".
--
-- Kun beskrivelser der ER skabelonen (og intet andet) tømmes. En
-- beskrivelse som admin har skrevet om, rammes ikke.
--
-- Idempotent: anden kørsel finder intet. Ingen rollback nødvendig; teksten
-- kan genskabes af mærke + model, hvis nogen skulle savne den.
-- ============================================================

-- Aktive annoncer.
UPDATE bikes
   SET description = ''
 WHERE external_id IS NOT NULL
   AND is_active = true
   AND description ~ ' — ny cykel fra forhandleren\. Kontakt forhandleren for nærmere info om udstyr og specifikationer\.\s*$';

-- Inaktive feed-annoncer. De er undtaget fra salgslåsen i
-- exempt_feed_bikes_from_sold_lock.sql. Er den migration IKKE kørt,
-- afviser låsen ændringen; så springes de over i stedet for at hele
-- filen fejler, og de ryddes ved næste kørsel.
DO $$
BEGIN
  UPDATE bikes
     SET description = ''
   WHERE external_id IS NOT NULL
     AND is_active = false
     AND description ~ ' — ny cykel fra forhandleren\. Kontakt forhandleren for nærmere info om udstyr og specifikationer\.\s*$';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Inaktive feed-annoncer sprunget over (salgslåsen er ikke undtaget for feed). Kør exempt_feed_bikes_from_sold_lock.sql og derefter denne fil igen.';
END $$;
