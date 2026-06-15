-- ============================================================
-- Betalt boost (engangsbetaling via Stripe) — idempotent forlængelse
-- ============================================================
-- Supplerer add_bike_boost.sql. Når en Stripe checkout-session (mode=payment,
-- metadata.type='boost') gennemføres, kalder stripe-webhook apply_paid_boost()
-- med service-role. Den forlænger bikes.featured_until med N dage.
--
-- Idempotens: Stripe kan gensende samme webhook-event flere gange. Hver
-- checkout-session logges i boost_orders med stripe_session_id som PRIMARY KEY,
-- så en gentaget levering IKKE forlænger featured_until dobbelt.
--
-- Sikkerhed: funktionen er SECURITY DEFINER og kun GRANTet til service_role
-- (REVOKE fra PUBLIC) — en almindelig bruger kan ikke kalde den og selv give
-- sig gratis boosts. featured_until-ændringen tillades via den whitelistede
-- transaktions-lokale flag (samme mønster som claim_free_boost).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at køre igen.
-- ============================================================

-- 1. Log over gennemførte boost-betalinger (idempotens-nøgle = Stripe session-id)
CREATE TABLE IF NOT EXISTS boost_orders (
  stripe_session_id text        PRIMARY KEY,
  user_id           uuid,
  bike_id           uuid,
  amount_kr         int,
  days              int,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE boost_orders ENABLE ROW LEVEL SECURITY;

-- 2. Anvend en betalt boost (kaldes KUN af stripe-webhook via service-role)
CREATE OR REPLACE FUNCTION apply_paid_boost(
  p_session_id text,
  p_user_id    uuid,
  p_bike_id    uuid,
  p_days       int DEFAULT 7,
  p_amount_kr  int DEFAULT 39
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner     uuid;
  v_current   timestamptz;
  v_new_until timestamptz;
BEGIN
  -- Idempotens: allerede behandlet denne session? Returnér nuværende uden ny forlængelse.
  INSERT INTO boost_orders (stripe_session_id, user_id, bike_id, amount_kr, days)
  VALUES (p_session_id, p_user_id, p_bike_id, p_amount_kr, p_days)
  ON CONFLICT (stripe_session_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT featured_until INTO v_new_until FROM bikes WHERE id = p_bike_id;
    RETURN v_new_until;
  END IF;

  SELECT user_id, featured_until INTO v_owner, v_current
    FROM bikes WHERE id = p_bike_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Annoncen blev ikke fundet: %', p_bike_id;
  END IF;

  -- Forlæng hvis allerede fremhævet, ellers N dage fra nu
  v_new_until := GREATEST(now(), COALESCE(v_current, now())) + make_interval(days => p_days);

  -- Tillad featured_until-ændringen i netop denne transaktion (whitelistet)
  PERFORM set_config('app.allow_featured_update', 'on', true);
  UPDATE bikes SET featured_until = v_new_until WHERE id = p_bike_id;

  RETURN v_new_until;
END;
$$;

REVOKE ALL ON FUNCTION apply_paid_boost(text, uuid, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_paid_boost(text, uuid, uuid, int, int) TO service_role;
