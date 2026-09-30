-- ============================================================
-- add_frontpage_indexes.sql
--
-- Indeks til de forespørgsler forsiden og annoncesiden kører ved hver
-- sidevisning. Rører ingen data og ingen RLS.
--
-- Ærligt om gevinsten: med ca. 100 aktive annoncer læser Postgres hele
-- tabellen på under et millisekund, og planlæggeren vælger ofte at
-- gøre det alligevel. Indeksene flytter ikke 21 sekunder; se
-- PERF_TJEK.sql for hvor tiden faktisk går. De er her, fordi
-- fremmednøgler i Postgres IKKE får et indeks af sig selv, og fordi
-- de bliver nødvendige, før annoncerne tæller i tusinder.
--
--   bike_images(bike_id)          billederne til hvert kort og hver annonce.
--                                  Fremmednøgle uden indeks: hvert opslag
--                                  læser alle billeder
--   bikes(category, created_at)    forsidens "nyeste først" i én kategori,
--      WHERE is_active             kun de aktive
--   saved_bikes(user_id, bike_id)  hjerterne på kortene
--
-- bikes(user_id) mangler ikke: idx_bikes_user_external (user_id,
-- external_id) dækker opslag på user_id, fordi det står forrest.
--
-- Ikke CONCURRENTLY: SQL Editor kører filen i én transaktion, og der er
-- det ikke tilladt. Tabellerne er små, så låsen varer et øjeblik.
--
-- Idempotent. Rollback:
--   DROP INDEX IF EXISTS idx_bike_images_bike_id;
--   DROP INDEX IF EXISTS idx_bikes_active_category_created;
--   DROP INDEX IF EXISTS idx_saved_bikes_user_bike;
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bike_images_bike_id
  ON bike_images (bike_id);

CREATE INDEX IF NOT EXISTS idx_bikes_active_category_created
  ON bikes (category, created_at DESC)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_saved_bikes_user_bike
  ON saved_bikes (user_id, bike_id);

ANALYZE bikes;
ANALYZE bike_images;
ANALYZE saved_bikes;
