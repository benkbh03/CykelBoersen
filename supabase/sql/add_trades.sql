-- ============================================================
-- add_trades.sql — en handel er en række, ikke en besked
--
-- Før: en "handel" var en besked der starter med flueben og indeholder
-- "accepteret". "Handler afsluttet", fanen Handler, profilerne og retten
-- til at vurdere talte alle den besked. En besked har ingen status, så en
-- handel kunne aldrig annulleres: blev en solgt annonce sat aktiv igen,
-- talte handlen stadig, og vurderingen blev stående. Og enhver kunne selv
-- skrive en flueben-besked til en anden bruger og få ret til at vurdere dem
-- (forbeholdet i harden_profile_insert_and_reviews.sql).
--
-- Nu:
--   · trades-tabellen med status 'gennemført' | 'annulleret'.
--   · En handel oprettes af databasen, når annoncens SÆLGER sender
--     flueben-beskeden til en bruger, der har skrevet om annoncen. En
--     selvskrevet flueben-besked fra en anden bruger opretter ingenting.
--   · Sættes en solgt annonce aktiv igen, annulleres handlen (rækken
--     bliver stående), og sold_via nulstilles. Sælges den igen, oprettes
--     en ny handel.
--   · En vurdering bindes til en gennemført handel (reviews.trade_id).
--     Vurderinger på en annulleret handel er skjult for alle via RLS.
--
-- Backfill: handler oprettes fra de eksisterende flueben-beskeder, alle som
-- 'gennemført'. Handler hvor annoncen i dag er aktiv igen, annulleres
-- IKKE her. Det gør cancel_reactivated_trades.sql, efter godkendelse af
-- listen fra LIST_REACTIVATED_TRADES.sql.
--
-- Idempotent: sikker at køre igen.
-- Rollback (i denne rækkefølge):
--   DROP TRIGGER IF EXISTS trg_create_trade_from_message ON messages;
--   DROP TRIGGER IF EXISTS trg_cancel_trade_on_reactivate ON bikes;
--   DROP POLICY IF EXISTS "Alle kan se vurderinger" ON reviews;
--   CREATE POLICY "Alle kan se vurderinger" ON reviews FOR SELECT USING (true);
--   derefter den gamle require_trade_before_review fra
--   harden_profile_insert_and_reviews.sql, og til sidst
--   ALTER TABLE reviews DROP COLUMN trade_id; DROP TABLE trades;
-- ============================================================


-- ── 1. Tabellen ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id      uuid        NOT NULL REFERENCES bikes(id)    ON DELETE CASCADE,
  seller_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'gennemført'
                           CHECK (status IN ('gennemført', 'annulleret')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (seller_id <> buyer_id)
);

-- Højst én gennemført handel pr. annonce ad gangen. Beskytter også mod to
-- flueben-beskeder for samme salg (bud accepteret og derefter "Sæt solgt").
CREATE UNIQUE INDEX IF NOT EXISTS trades_one_completed_per_bike
  ON trades (bike_id) WHERE status = 'gennemført';
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades (seller_id);
CREATE INDEX IF NOT EXISTS idx_trades_buyer  ON trades (buyer_id);

-- Kun parterne kan se en handel. Hvem der har handlet med hvem, er ikke
-- offentligt. Ingen INSERT/UPDATE/DELETE-politikker: kun triggerne
-- nedenfor (SECURITY DEFINER) og service-role skriver.
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
-- Eksplicit: læse ja (RLS afgør hvilke rækker), skrive nej. Supabase giver
-- normalt nye tabeller brede rettigheder; dem vil vi ikke have her.
GRANT SELECT ON trades TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON trades FROM authenticated, anon;
DROP POLICY IF EXISTS trades_select_parties ON trades;
CREATE POLICY trades_select_parties ON trades
  FOR SELECT USING (auth.uid() = seller_id OR auth.uid() = buyer_id);


-- ── 2. Handel oprettes fra sælgerens flueben-besked ──────────────────
-- Begge handelsveje (acceptBid i js/inbox.js og "Sæt solgt" i
-- js/sold-actions.js) indsætter allerede beskeden. Frontenden skal
-- derfor ikke ændres for at oprette handlen.
CREATE OR REPLACE FUNCTION create_trade_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $create_trade$
BEGIN
  -- chr(9989) er flueben-emojien, skrevet som tegnkode.
  -- Kun annoncens saelger kan oprette en handel, ikke med sig selv, og
  -- kun med en bruger der har skrevet til saelgeren om annoncen.
  IF NEW.bike_id IS NOT NULL
     AND NEW.content ILIKE chr(9989) || '%accepteret%'
     AND NEW.receiver_id <> NEW.sender_id
     AND EXISTS (SELECT 1 FROM bikes b
                  WHERE b.id = NEW.bike_id AND b.user_id = NEW.sender_id)
     AND EXISTS (SELECT 1 FROM messages m
                  WHERE m.bike_id = NEW.bike_id
                    AND m.sender_id = NEW.receiver_id
                    AND m.receiver_id = NEW.sender_id)
  THEN
    INSERT INTO trades (bike_id, seller_id, buyer_id)
    VALUES (NEW.bike_id, NEW.sender_id, NEW.receiver_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
-- En fejl her maa ALDRIG stoppe selve beskeden.
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_trade_from_message: %', SQLERRM;
  RETURN NEW;
END;
$create_trade$;

DROP TRIGGER IF EXISTS trg_create_trade_from_message ON messages;
CREATE TRIGGER trg_create_trade_from_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION create_trade_from_message();


-- ── 3. Genaktivering annullerer handlen ─────────────────────────
CREATE OR REPLACE FUNCTION cancel_trade_on_reactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $cancel_trade$
BEGIN
  IF OLD.is_active = false AND NEW.is_active = true THEN
    UPDATE trades
       SET status = 'annulleret', cancelled_at = now()
     WHERE bike_id = NEW.id AND status = 'gennemført';
    -- En aktiv annonce er ikke solgt. Uden dette talte en genaktiveret
    -- annonce stadig som solgt i statistikken (sold_via blev stående).
    NEW.sold_via := NULL;
  END IF;
  RETURN NEW;
END;
$cancel_trade$;

DROP TRIGGER IF EXISTS trg_cancel_trade_on_reactivate ON bikes;
CREATE TRIGGER trg_cancel_trade_on_reactivate
  BEFORE UPDATE OF is_active ON bikes
  FOR EACH ROW EXECUTE FUNCTION cancel_trade_on_reactivate();


-- ── 4. Vurderinger bindes til en gennemført handel ──────────────
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS trade_id uuid REFERENCES trades(id) ON DELETE CASCADE;

-- Erstatter den besked-baserede udgave fra harden_profile_insert_and_reviews.sql.
-- Finder en gennemført handel mellem de to, som anmelderen ikke allerede
-- har vurderet, og sætter trade_id + bike_id. Klientens egne værdier i de
-- to felter bliver overskrevet.
CREATE OR REPLACE FUNCTION require_trade_before_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $require_trade$
DECLARE
  v_trade uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_trade := (
    SELECT t.id
      FROM trades t
     WHERE t.status = 'gennemført'
       AND ((t.seller_id = NEW.reviewer_id AND t.buyer_id  = NEW.reviewed_user_id)
         OR (t.buyer_id  = NEW.reviewer_id AND t.seller_id = NEW.reviewed_user_id))
       AND (NEW.bike_id IS NULL OR t.bike_id = NEW.bike_id)
       AND NOT EXISTS (SELECT 1 FROM reviews rv
                        WHERE rv.trade_id = t.id AND rv.reviewer_id = NEW.reviewer_id)
     ORDER BY t.created_at DESC
     LIMIT 1);

  IF v_trade IS NULL THEN
    RAISE EXCEPTION 'Du kan kun vurdere brugere du har handlet med via Cykelbørsen';
  END IF;

  NEW.trade_id := v_trade;
  NEW.bike_id  := (SELECT bike_id FROM trades WHERE id = v_trade);
  RETURN NEW;
END;
$require_trade$;

DROP TRIGGER IF EXISTS require_trade_before_review ON reviews;
CREATE TRIGGER require_trade_before_review
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION require_trade_before_review();

-- Synlighed: en vurdering på en annulleret handel er skjult for alle.
-- Funktionen er SECURITY DEFINER, fordi trades kun kan læses af parterne;
-- uden den ville alle vurderinger forsvinde for andre besøgende.
-- trade_id IS NULL = en ældre vurdering uden en handel at pege på. Den
-- bliver stående som hidtil.
CREATE OR REPLACE FUNCTION review_trade_visible(p_trade uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $review_visible$
  SELECT p_trade IS NULL
      OR EXISTS (SELECT 1 FROM trades WHERE id = p_trade AND status = 'gennemført');
$review_visible$;

DROP POLICY IF EXISTS "Alle kan se vurderinger" ON reviews;
CREATE POLICY "Alle kan se vurderinger" ON reviews
  FOR SELECT USING (review_trade_visible(trade_id));

-- (Det unikke indeks oprettes til sidst, efter backfill. Se afsnit 6.)


-- ── 5. Backfill ────────────────────────────────────────────────
-- Én handel pr. annonce fra den seneste flueben-besked sendt af annoncens
-- sælger. Beskeder fra andre end sælgeren bliver ikke til handler.
INSERT INTO trades (bike_id, seller_id, buyer_id, status, created_at)
SELECT DISTINCT ON (m.bike_id)
       m.bike_id, m.sender_id, m.receiver_id, 'gennemført', m.created_at
  FROM messages m
  JOIN bikes b    ON b.id = m.bike_id AND b.user_id = m.sender_id
  JOIN profiles p ON p.id = m.receiver_id
 WHERE m.content ILIKE chr(9989) || '%accepteret%'
   AND m.receiver_id <> m.sender_id
   AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.bike_id = m.bike_id)
 ORDER BY m.bike_id, m.created_at DESC;

-- Eksisterende vurderinger peges på deres handel.
UPDATE reviews r
   SET trade_id = t.id
  FROM trades t
 WHERE r.trade_id IS NULL
   AND r.bike_id = t.bike_id
   AND ((t.seller_id = r.reviewer_id AND t.buyer_id  = r.reviewed_user_id)
     OR (t.buyer_id  = r.reviewer_id AND t.seller_id = r.reviewed_user_id));


-- ── 6. Én vurdering pr. anmelder pr. handel ───────────────────────
-- Det gamle unikke indeks (anmelder, anmeldt, cykel) ville forhindre en ny
-- vurdering, hvis samme cykel sælges igen til samme køber. Nu er det én
-- vurdering pr. anmelder pr. handel.
-- Oprettes efter backfill, så eventuelle gamle dubletter ikke vælter
-- hele migrationen; så springes indekset over med en besked.
DROP INDEX IF EXISTS reviews_unique_per_trade;
DO $idx$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_trade
    ON reviews (reviewer_id, trade_id) WHERE trade_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Kunne ikke oprette reviews_one_per_trade: der findes dubletter. STATUS_TJEK viser det.';
END $idx$;
