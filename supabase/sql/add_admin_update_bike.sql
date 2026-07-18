-- ============================================================
-- admin_update_bike — admin retter forhandlerens importerede annonce
-- ============================================================
-- Vej B (udvidet onboarding-samtykke): en admin må manuelt rette de
-- felter en feed-import ikke kan ramme 100% (type, specs, beskrivelse mm.)
-- på en forhandlers annonce, OG låse annoncen (feed_locked=true) så den
-- natlige feed-sync derefter kun rører pris/lagerstatus.
--
-- RLS tillader ikke en admin at opdatere andres bikes-rækker, så vi bruger
-- en SECURITY DEFINER-funktion (kører med definer-rettigheder = omgår RLS)
-- med to interne tjek:
--   1) kalderen er admin (profiles.is_admin = true)
--   2) ejeren har accepteret det UDVIDEDE onboarding-samtykke
--      (admin_can_create_listings = true OG admin_authorized_at >= 2026-06-19).
--      Datoen = DPA_EFFECTIVE i frontend; ældre samtykke dækker kun "opret",
--      ikke "rediger", så her kræves gen-accept.
--
-- Hvilke kolonner der må røres = SET-listen nedenfor (whitelist). user_id,
-- created_by_admin_id, external_id, original_price, views, created_at mm.
-- røres ALDRIG. Typecasting håndteres af jsonb_populate_record mod bikes-
-- rowtypen, så arrays/booleans/tal rammer de rigtige kolonnetyper.
--
-- Frontend kalder den via:
--   supabase.rpc('admin_update_bike', { p_bike_id, p_updates })
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION admin_update_bike(p_bike_id uuid, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner          uuid;
  v_can            boolean;
  v_authorized_at  timestamptz;
BEGIN
  -- 1) Kun admins
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder';
  END IF;

  SELECT user_id INTO v_owner FROM bikes WHERE id = p_bike_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Annonce findes ikke';
  END IF;

  -- 2) Ejeren skal have accepteret det UDVIDEDE samtykke (>= 2026-06-19)
  SELECT admin_can_create_listings, admin_authorized_at
    INTO v_can, v_authorized_at
    FROM profiles WHERE id = v_owner;

  IF NOT COALESCE(v_can, false)
     OR v_authorized_at IS NULL
     OR v_authorized_at < TIMESTAMPTZ '2026-06-19 00:00:00+00' THEN
    RAISE EXCEPTION 'Forhandleren har ikke accepteret de opdaterede onboarding-vilkar';
  END IF;

  -- Whitelist: kun disse kolonner opdateres. feed_locked sættes altid = true,
  -- så natlig sync herefter kun rører pris/lagerstatus.
  UPDATE bikes AS b SET
    brand               = u.brand,
    model               = u.model,
    title               = u.title,
    price               = u.price,
    year                = u.year,
    city                = u.city,
    color               = u.color,
    colors              = u.colors,
    description         = u.description,
    type                = u.type,
    size                = u.size,
    size_cm             = u.size_cm,
    condition           = u.condition,
    is_active           = u.is_active,
    warranty            = u.warranty,
    external_url        = u.external_url,
    wheel_size          = u.wheel_size,
    frame_material      = u.frame_material,
    brake_type          = u.brake_type,
    electronic_shifting = u.electronic_shifting,
    groupset            = u.groupset,
    weight_kg           = u.weight_kg,
    motor               = u.motor,
    motor_position      = u.motor_position,
    battery_wh          = u.battery_wh,
    suspension          = u.suspension,
    geartype            = u.geartype,
    step_type           = u.step_type,
    feed_locked         = true,
    updated_at          = now()
  FROM (SELECT * FROM jsonb_populate_record(NULL::bikes, p_updates)) AS u
  WHERE b.id = p_bike_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_bike(uuid, jsonb) TO authenticated;
