-- ============================================================
-- Cykelbørsen – Udlejnings-bookinger + betaling (Fase 2)
-- ============================================================
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
--
-- FORUDSÆTNING: add_rental_tables.sql er kørt.
--
-- Følger idempotens/sikkerheds-mønsteret fra add_paid_boost.sql:
-- SECURITY DEFINER RPC'er, REVOKE FROM PUBLIC + GRANT service_role.
-- create-rental-checkout kalder create_rental_booking (availability-lås),
-- og stripe-webhook kalder confirm_rental_booking ved gennemført betaling.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  uuid NOT NULL REFERENCES public.rental_items(id) ON DELETE CASCADE,
  renter_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dealer_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date               date NOT NULL,
  end_date                 date NOT NULL,
  days                     int  NOT NULL,
  rental_amount            int  NOT NULL,      -- leje i kr (ex. depositum)
  deposit_amount           int  NOT NULL DEFAULT 0,
  platform_fee             int  NOT NULL DEFAULT 0,  -- kommission i kr
  total_amount             int  NOT NULL,      -- opkrævet i alt (leje + depositum)
  -- pending_payment | confirmed | active | completed | cancelled | refunded
  status                   text NOT NULL DEFAULT 'pending_payment',
  -- none | charged | refunded | captured  (depositum-tilstand; håndteres i Fase 3)
  deposit_status           text NOT NULL DEFAULT 'none',
  stripe_session_id        text UNIQUE,
  stripe_payment_intent_id text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_bookings_item   ON public.rental_bookings (item_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_renter ON public.rental_bookings (renter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_bookings_dealer ON public.rental_bookings (dealer_id, created_at DESC);

ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;

-- Lejer ser egne bookinger; forhandler ser bookinger for sine items.
DROP POLICY IF EXISTS "rental_bookings_select" ON public.rental_bookings;
CREATE POLICY "rental_bookings_select" ON public.rental_bookings
  FOR SELECT USING (renter_id = auth.uid() OR dealer_id = auth.uid());

-- Ingen direkte INSERT/UPDATE fra klienten — alt går via RPC (service_role).

-- ── Opret pending booking med race-sikker availability-check ──
CREATE OR REPLACE FUNCTION create_rental_booking(
  p_item_id       uuid,
  p_renter_id     uuid,
  p_start         date,
  p_end           date,
  p_days          int,
  p_rental_amount int,
  p_deposit       int,
  p_fee           int,
  p_total         int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item     record;
  v_overlaps int;
  v_id       uuid;
BEGIN
  IF p_end < p_start THEN RAISE EXCEPTION 'Slutdato er før startdato'; END IF;
  IF p_start < current_date THEN RAISE EXCEPTION 'Startdato er i fortiden'; END IF;

  -- Serialisér samtidige bookinger for samme item (undgår dobbelt-booking)
  PERFORM pg_advisory_xact_lock(hashtext(p_item_id::text));

  SELECT id, dealer_id, quantity, min_days, max_days, is_active
    INTO v_item FROM rental_items WHERE id = p_item_id;
  IF v_item.id IS NULL OR NOT v_item.is_active THEN
    RAISE EXCEPTION 'Udlejningscyklen er ikke tilgængelig';
  END IF;
  IF p_days < v_item.min_days OR p_days > v_item.max_days THEN
    RAISE EXCEPTION 'Lejeperioden skal være mellem % og % dage', v_item.min_days, v_item.max_days;
  END IF;

  -- Tæl overlappende aktive bookinger + friske pending (< 30 min) mod antal enheder
  SELECT count(*) INTO v_overlaps
  FROM rental_bookings b
  WHERE b.item_id = p_item_id
    AND daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    AND (
      b.status IN ('confirmed', 'active')
      OR (b.status = 'pending_payment' AND b.created_at > now() - interval '30 minutes')
    );

  IF v_overlaps >= v_item.quantity THEN
    RAISE EXCEPTION 'Udlejt i den valgte periode. Vælg andre datoer.';
  END IF;

  INSERT INTO rental_bookings (
    item_id, renter_id, dealer_id, start_date, end_date, days,
    rental_amount, deposit_amount, platform_fee, total_amount, status
  ) VALUES (
    p_item_id, p_renter_id, v_item.dealer_id, p_start, p_end, p_days,
    p_rental_amount, p_deposit, p_fee, p_total, 'pending_payment'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION create_rental_booking(uuid, uuid, date, date, int, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_rental_booking(uuid, uuid, date, date, int, int, int, int, int) TO service_role;

-- ── Bekræft booking efter gennemført betaling (idempotent) ──
CREATE OR REPLACE FUNCTION confirm_rental_booking(
  p_session_id        text,
  p_payment_intent_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Kun pending → confirmed (gensendt webhook rører ikke en allerede bekræftet booking)
  UPDATE rental_bookings
     SET status = 'confirmed',
         deposit_status = CASE WHEN deposit_amount > 0 THEN 'charged' ELSE 'none' END,
         stripe_payment_intent_id = p_payment_intent_id
   WHERE stripe_session_id = p_session_id
     AND status = 'pending_payment'
   RETURNING id INTO v_id;

  RETURN v_id;  -- NULL hvis ingen række matchede (allerede bekræftet / ukendt)
END;
$$;

REVOKE ALL ON FUNCTION confirm_rental_booking(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_rental_booking(text, text) TO service_role;
