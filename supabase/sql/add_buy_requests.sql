-- ══════════════════════════════════════════════════════════════════════
--  Forhandlere der køber cykler (/opkoeb)
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  17. okt.: en forhandler (Upway) vil købe mange brugte el-cykler. En
--  verificeret forhandler kan nu lægge et opkøbsønske op: titel, tekst,
--  cykeltyper, mærker, laveste årgang og højeste pris. /opkoeb viser dem,
--  og en sælger tilbyder sin cykel ved at sende en almindelig besked om
--  en af sine egne annoncer. Der er ingen ny beskedtype: tråden er bundet
--  til sælgerens annonce som alle andre tråde.
--
--  Reglerne ligger her, ikke kun i frontenden:
--  · kun verificerede forhandlere kan oprette og rette (RLS)
--  · suspenderede konti kan ikke oprette (is_suspended, som messages/bikes)
--  · højst 10 aktive ønsker pr. forhandler (trigger)
--  · offentligt synlige kun mens forhandleren stadig er verificeret
--  · slettes med profilen (ON DELETE CASCADE), så delete-account behøver
--    ikke ændres

CREATE TABLE IF NOT EXISTS buy_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  types       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(types) <= 8),
  brands      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(brands) <= 20),
  min_year    int CHECK (min_year IS NULL OR min_year BETWEEN 1990 AND 2100),
  max_price   int CHECK (max_price IS NULL OR max_price BETWEEN 1 AND 1000000),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buy_requests_active_idx ON buy_requests (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS buy_requests_dealer_idx ON buy_requests (dealer_id);

ALTER TABLE buy_requests ENABLE ROW LEVEL SECURITY;

-- Verificeret forhandler. SECURITY DEFINER, så politikken ikke afhænger af
-- hvilke profiles-kolonner klienten må læse. EXECUTE må IKKE fjernes fra
-- anon/authenticated: politikken kalder den som den besøgende, og svaret
-- (verified + seller_type) er offentligt i forvejen.
CREATE OR REPLACE FUNCTION is_verified_dealer(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles
                  WHERE id = uid AND seller_type = 'dealer' AND verified = true);
$$;

DROP POLICY IF EXISTS buy_requests_select ON buy_requests;
CREATE POLICY buy_requests_select ON buy_requests FOR SELECT
  USING (
    (is_active AND is_verified_dealer(dealer_id))
    OR dealer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS buy_requests_insert ON buy_requests;
CREATE POLICY buy_requests_insert ON buy_requests FOR INSERT
  WITH CHECK (
    dealer_id = auth.uid()
    AND is_verified_dealer(auth.uid())
    AND NOT is_suspended(auth.uid())
  );

DROP POLICY IF EXISTS buy_requests_update ON buy_requests;
CREATE POLICY buy_requests_update ON buy_requests FOR UPDATE
  USING (
    dealer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    (dealer_id = auth.uid() AND is_verified_dealer(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS buy_requests_delete ON buy_requests;
CREATE POLICY buy_requests_delete ON buy_requests FOR DELETE
  USING (
    dealer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Klienten må ikke flytte et ønske til en anden forhandler eller rette
-- tidsstemplerne. Kolonne-GRANTs, samme mønster som messages og reviews.
-- Supabase giver anon og authenticated ALT på nye tabeller. Tag det fra
-- dem først, ellers er kolonne-GRANTs nedenfor uden virkning.
REVOKE ALL ON buy_requests FROM anon, authenticated;
GRANT SELECT ON buy_requests TO anon, authenticated;
GRANT INSERT (title, description, types, brands, min_year, max_price, is_active)
  ON buy_requests TO authenticated;
GRANT UPDATE (title, description, types, brands, min_year, max_price, is_active)
  ON buy_requests TO authenticated;
GRANT DELETE ON buy_requests TO authenticated;

-- Højst 10 aktive pr. forhandler + updated_at.
CREATE OR REPLACE FUNCTION buy_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); END IF;
  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active) THEN
    IF (SELECT count(*) FROM buy_requests
         WHERE dealer_id = NEW.dealer_id AND is_active AND id <> NEW.id) >= 10 THEN
      RAISE EXCEPTION 'Du kan højst have 10 aktive opkøbsønsker.'
        USING ERRCODE = 'check_violation', HINT = 'buy_request_limit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS buy_requests_guard ON buy_requests;
CREATE TRIGGER buy_requests_guard
  BEFORE INSERT OR UPDATE ON buy_requests
  FOR EACH ROW EXECUTE FUNCTION buy_requests_guard();

-- ── Tjek bagefter ─────────────────────────────────────────────────────
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'buy_requests';
--   (forventet 4 rækker: select, insert, update, delete)
