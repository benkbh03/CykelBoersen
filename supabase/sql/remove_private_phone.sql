-- ============================================================
-- remove_private_phone.sql
-- ============================================================
-- Fjerner telefonnumre fra private profiler. Forhandlere beholder deres.
--
-- BAGGRUND
-- profiles har SELECT-policy USING (true) uden kolonne-begrænsning. RLS er
-- rækkebaseret og kan ikke skjule enkelte kolonner, så alt på tabellen kan
-- læses af enhver med den offentlige nøgle. Blandt kolonnerne ligger phone.
--
-- Optælling 1. sep. 2026: 7 af 24 private brugere havde et nummer gemt.
-- Ingen af dem blev vist nogen steder i appen. Nummeret blev indsamlet af et
-- felt i profil-formularen og derefter aldrig brugt til noget.
--
-- HVORFOR FJERNE FREM FOR AT BESKYTTE
-- 1. Et telefonnummer på en privat annonce er selve vejen ud af platformen,
--    og den vej er hvor svindlen sker ("jeg sender en fragtmand, her er et
--    betalingslink"). Går samtalen på SMS, kan den hverken modereres, logges
--    eller efterforskes bagefter.
-- 2. Data man ikke har, kan ikke lække. Det er billigere end enhver form for
--    beskyttelse og fjerner 100 % af risikoen i stedet for 80 %.
-- 3. Uden et formål er indsamlingen i sig selv i strid med dataminimering.
--
-- For en FORHANDLER er det modsat: butikkens nummer er offentlig
-- virksomhedsinformation på linje med adressen, og det vises nu på
-- forhandlerprofilen (js/profile-pages.js) så det gør nytte.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. Gem numrene før de slettes ────────────────────────────
-- Ren fortrydelsesmulighed. Uden RLS-policies er tabellen kun læsbar for
-- service-role, altså ikke for nogen bruger og ikke for admin-UI'et.
-- Den SKAL slettes igen når vinduet er udløbet — se punkt 5.

CREATE TABLE IF NOT EXISTS profiles_phone_removed_20260901 (
  id         uuid        PRIMARY KEY,
  phone      text,
  removed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles_phone_removed_20260901 ENABLE ROW LEVEL SECURITY;
-- Ingen policies = ingen adgang for anon eller authenticated.

INSERT INTO profiles_phone_removed_20260901 (id, phone)
SELECT id, phone
FROM profiles
WHERE COALESCE(seller_type, 'private') <> 'dealer'
  AND phone IS NOT NULL
  AND phone <> ''
ON CONFLICT (id) DO NOTHING;


-- ── 2. Nulstil dem ───────────────────────────────────────────

UPDATE profiles
SET phone = NULL
WHERE COALESCE(seller_type, 'private') <> 'dealer'
  AND phone IS NOT NULL;


-- ── 3. Hold det sådan ────────────────────────────────────────
-- Frontenden skjuler nu feltet for private og sender phone = null, men det er
-- præcis den slags kontrol denne gennemgang har vist ikke holder alene.
-- Triggeren gør det strukturelt.
--
-- Den nulstiller stille i stedet for at kaste en fejl. Det er med vilje:
-- forhandler-flowet skriver phone og seller_type i SAMME statement (se
-- js/dealers-page.js:721 og :786, main.js:1188 og :1209), så en rigtig
-- forhandler rammes aldrig. En fejl ville kun kunne ramme legitime kald.

CREATE OR REPLACE FUNCTION strip_phone_from_private_profiles()
RETURNS trigger AS $$
BEGIN
  IF COALESCE(NEW.seller_type, 'private') <> 'dealer' THEN
    NEW.phone := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Navnet er valgt så den sorterer EFTER protect_profile_columns: Postgres
-- kører triggere i alfabetisk rækkefølge, og rettighedstjekket skal have
-- lov at køre først.
DROP TRIGGER IF EXISTS strip_private_phone ON profiles;
CREATE TRIGGER strip_private_phone
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION strip_phone_from_private_profiles();


-- ── 4. Dokumentation ─────────────────────────────────────────

COMMENT ON COLUMN profiles.phone IS
  'Kun forhandlere. Private profiler nulstilles af triggeren '
  'strip_private_phone. Vises på forhandlerprofilen som tel:-link.';


-- ── 5. Oprydning — kør denne linje efter 1. december 2026 ────
-- Fortrydelsesvinduet er tre måneder. Derefter er der ikke længere et formål
-- med at opbevare numrene, og så skal tabellen væk.
--
--   DROP TABLE IF EXISTS profiles_phone_removed_20260901;


-- ── Kontrol ──────────────────────────────────────────────────
-- Kør efter migrationen. Forventet: dealer har numre, private har 0.
--
--   SELECT COALESCE(seller_type,'private') AS type,
--          count(*) AS antal, count(phone) AS har_telefon
--   FROM profiles GROUP BY 1;
