-- ============================================================
-- harden_messages_and_reviews.sql
-- ============================================================
-- Fundet ved policy-gennemgang 1. september 2026.
--
-- To huller, begge af samme type: RLS er slået til, og policy'en ser
-- rigtig ud, men den beskytter kun HVILKE RÆKKER man må røre — ikke
-- HVILKE KOLONNER. Resten blev antaget håndteret af frontenden, og
-- frontenden er ikke en sikkerhedskontrol.
--
-- ── 1. messages ────────────────────────────────────────────────
-- Policy'en "Modtager kan markere som læst" er:
--     FOR UPDATE USING (auth.uid() = receiver_id)
-- Den er tænkt som "modtageren må sætte read = true". Men RLS kan ikke
-- begrænse kolonner, så den siger i virkeligheden "modtageren må ændre
-- ALT på en besked han har modtaget" — herunder content og sender_id.
-- En modtager kan altså omskrive hvad afsenderen skrev, og ændre hvem
-- den ser ud til at komme fra. I et system hvor beskeder er beviset for
-- at en handel fandt sted, er det ikke en teoretisk detalje.
--
-- Frontenden opdaterer kun { read: true } (js/inbox.js:225 og :610), så
-- en kolonne-begrænsning bryder ingenting.
--
-- ── 2. reviews ─────────────────────────────────────────────────
-- INSERT tjekker kun at reviewer_id er kalderen. Der er ingen kontrol af
-- at der har været en handel, ingen unik-constraint, og intet der
-- forhindrer selv-anmeldelse. hasTraded-tjekket ligger udelukkende i
-- frontenden. Med den offentlige nøgle kan man derfor:
--   • give sig selv 5 stjerner fra en anden konto, ubegrænset
--   • give en forhandler 1 stjerne så mange gange man gider
-- UPDATE har samme kolonneproblem som messages: USING er reviewer_id, så
-- man må ændre reviewed_user_id og flytte sin egen 1-stjerne over på en
-- vilkårlig anden bruger.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. messages: kun `read` må opdateres af brugere ──────────
-- Kolonne-GRANT er det rigtige værktøj her; RLS kan ikke gøre det.
-- service_role rammes ikke: den kører som superbruger-lignende rolle og
-- bruges af edge functions (fx delete-account).

REVOKE UPDATE ON messages FROM anon, authenticated;
GRANT  UPDATE (read) ON messages TO authenticated;


-- ── 2. reviews: kun rating og comment må opdateres ────────────
-- Frontenden opdaterer i dag slet ikke reviews, så dette er rent
-- forebyggende og kan ikke bryde noget.

REVOKE UPDATE ON reviews FROM anon, authenticated;
GRANT  UPDATE (rating, comment) ON reviews TO authenticated;


-- ── 3. reviews: man kan ikke anmelde sig selv ─────────────────

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_no_self_review;
ALTER TABLE reviews ADD  CONSTRAINT reviews_no_self_review
  CHECK (reviewer_id IS DISTINCT FROM reviewed_user_id);


-- ── 4. reviews: én anmeldelse pr. anmelder pr. handel ─────────
-- Lægges i en DO-blok med fejlhåndtering: findes der allerede dubletter
-- i tabellen, ville et nøgent CREATE UNIQUE INDEX fejle og rulle HELE
-- scriptet tilbage — også de tre rettelser ovenfor, som er de vigtigste.
-- Her får du i stedet en besked, og resten står ved magt.
--
-- Bemærk: rækker hvor bike_id er NULL (gamle anmeldelser fra før
-- add_review_bike_id.sql) tælles som forskellige af Postgres og er
-- derfor ikke dækket. Det er acceptabelt — de er allerede skrevet.

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_per_trade
    ON reviews (reviewer_id, reviewed_user_id, bike_id);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Kunne ikke oprette reviews_unique_per_trade: der findes '
               'allerede dubletter. Kør forespørgslen i kommentaren '
               'nedenfor, ryd op, og kør denne fil igen.';
END $$;

-- Find dubletter, hvis blokken ovenfor gav en NOTICE:
--   SELECT reviewer_id, reviewed_user_id, bike_id, count(*)
--   FROM reviews
--   WHERE bike_id IS NOT NULL
--   GROUP BY 1,2,3 HAVING count(*) > 1;


-- ── 5. Dokumentation ─────────────────────────────────────────

COMMENT ON CONSTRAINT reviews_no_self_review ON reviews IS
  'Blokerer selv-anmeldelse. Tilføjet 1. sep. 2026 efter policy-gennemgang: '
  'INSERT-policy''en tjekkede kun reviewer_id, så en bruger kunne anmelde '
  'sig selv direkte via API''et uden om frontenden.';
