-- ============================================================
-- bikes.is_giveaway: "Gives væk" — annoncer man forærer bort
-- ============================================================
-- En del cykler og en STOR del tilbehør er ikke værd at sætte pris på, men
-- er værd at give videre frem for at smide ud. Uden et flag for det bliver
-- de enten ikke lagt op, eller lagt op til 1 kr., hvilket forurener både
-- prisstatistik og prisvurderingen.
--
-- Flaget driver tre ting i frontend:
--   1. Kortet og annoncesiden viser "Gives væk" i stedet for "0 kr."
--   2. Et selvstændigt filter i sidebaren og som hurtigfilter
--   3. Prisforslag (js/sell-page.js) og prisvurdering udelader dem, så et
--      gratis cykelstel ikke trækker gennemsnittet for en model ned
--
-- Gælder BÅDE category='cykel' og category='tilbehoer', men kun for PRIVATE
-- sælgere: en forhandler forærer ikke sit varelager væk, så feltet vises
-- slet ikke i deres sælg- og redigér-flow. Begrænsningen ligger i
-- frontenden, ikke i en constraint — et CHECK kan ikke slå seller_type op
-- i profiles, og admin skal fortsat kunne oprette en gave via import.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

-- ── 1. Kolonnen ──────────────────────────────────────────────
-- NOT NULL med DEFAULT false: alle eksisterende annoncer er per definition
-- ikke gaver, og koden skal aldrig skulle skelne mellem false og NULL.
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS is_giveaway BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Backfill ──────────────────────────────────────────────
-- DEFAULT false dækker eksisterende rækker ved ADD COLUMN i Postgres 11+,
-- men sætningen gør migrationen sikker hvis kolonnen blev tilføjet manuelt
-- som nullable i en tidligere omgang.
UPDATE bikes SET is_giveaway = false WHERE is_giveaway IS NULL;

-- ── 3. Datakonsistens ────────────────────────────────────────
-- En gave har prisen 0. Hvis flaget er sat men prisen ikke er nulstillet
-- (fx en annonce redigeret direkte i Dashboard), ville kortet vise
-- "Gives væk" mens sorteringen brugte den gamle pris. Rettes her.
UPDATE bikes
  SET price = 0, original_price = 0
  WHERE is_giveaway = true AND (price <> 0 OR original_price IS DISTINCT FROM 0);

-- Og modsat: en pris på 0 uden flaget er en annonce der ikke kan vises
-- meningsfuldt. Der findes ingen i dag (frontend kræver pris ≥ 1), men
-- sætningen fanger dem hvis de opstår via import eller admin-oprettelse.
UPDATE bikes
  SET is_giveaway = true
  WHERE is_giveaway = false AND price = 0;

-- Håndhæv reglen fremadrettet i stedet for at stole på at alle fire
-- indsættelsesveje (sælg-cykel, sælg-tilbehør, admin-create-bike,
-- import-dealer-feed) husker den.
ALTER TABLE bikes DROP CONSTRAINT IF EXISTS bikes_giveaway_price_zero;
ALTER TABLE bikes ADD CONSTRAINT bikes_giveaway_price_zero
  CHECK (is_giveaway = false OR price = 0);

-- ── 4. Index ─────────────────────────────────────────────────
-- Partielt index: langt de fleste rækker er false, og filteret spørger kun
-- efter true. Et fuldt index på en boolean hvor 99 % har samme værdi bliver
-- alligevel ikke brugt af planlæggeren.
CREATE INDEX IF NOT EXISTS idx_bikes_giveaway
  ON bikes(created_at DESC) WHERE is_giveaway = true;

COMMENT ON COLUMN bikes.is_giveaway IS
  'True = annoncen foræres væk. price og original_price er da altid 0, '
  'håndhævet af constraint bikes_giveaway_price_zero. Vises som "Gives væk". '
  'Tilbydes kun private sælgere i brugerfladen.';
