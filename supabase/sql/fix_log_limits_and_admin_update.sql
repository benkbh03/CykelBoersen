-- ============================================================
-- fix_log_limits_and_admin_update.sql
-- ============================================================
-- To resterende fund fra agenten rls-og-autorisation, 4. september 2026.
-- Ingen af dem er adgangskontrol; det er dataintegritet og omkostning.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. Længdegrænser på de tre anonyme log-tabeller ──────────
--
-- client_errors, search_logs og sell_funnel_events har alle
-- INSERT WITH CHECK (true) for public, uden nogen begrænsning. Det er
-- korrekt for formålet: en fejl skal kunne rapporteres af en besøgende der
-- ikke er logget ind, og det er ofte netop dér de sker.
--
-- Men uden en øvre grænse kan enhver med den offentlige nøgle fylde tre
-- tabeller med vilkårligt store strenge. Det er ikke et persondatafund —
-- tabellerne er anonyme — det er lager og regning.
--
-- Klienten afkorter allerede (error-log.js: MAX_MESSAGE 300, MAX_STACK 900),
-- men klienten er ikke en kontrol. Grænserne herunder er sat rundhåndet over
-- klientens egne, så ærlige indsendelser aldrig afvises.

DO $$
BEGIN
  -- client_errors
  ALTER TABLE client_errors DROP CONSTRAINT IF EXISTS client_errors_len;
  ALTER TABLE client_errors ADD CONSTRAINT client_errors_len CHECK (
    length(message)             <= 1000
    AND length(COALESCE(source, ''))     <= 500
    AND length(COALESCE(path, ''))       <= 500
    AND length(COALESCE(stack, ''))      <= 4000
    AND length(COALESCE(user_agent, '')) <= 500
    AND length(COALESCE(kind, ''))       <= 40
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'client_errors: constraint ikke tilføjet (%). Findes der rækker der overskrider grænsen?', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE search_logs DROP CONSTRAINT IF EXISTS search_logs_len;
  ALTER TABLE search_logs ADD CONSTRAINT search_logs_len CHECK (
    length(COALESCE(query, '')) <= 300
    AND length(COALESCE(type, '')) <= 100
    AND length(COALESCE(city, '')) <= 100
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'search_logs: constraint ikke tilføjet (%). Tjek kolonnenavnene mod add_search_logs.sql.', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE sell_funnel_events DROP CONSTRAINT IF EXISTS sell_funnel_len;
  ALTER TABLE sell_funnel_events ADD CONSTRAINT sell_funnel_len CHECK (
    length(COALESCE(step, '')) <= 100
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'sell_funnel_events: constraint ikke tilføjet (%). Tjek kolonnenavnene mod add_sell_funnel_events.sql.', SQLERRM;
END $$;


-- ── 2. admin_update_bike nulstillede kolonner den ikke fik med ──
--
-- Funktionen byggede sin opdatering med:
--     jsonb_populate_record(NULL::bikes, p_updates)
--
-- Med NULL som udgangspunkt bliver ENHVER kolonne der ikke står i p_updates
-- til NULL — og hele whitelisten skrives. Sendte admin-panelet kun de
-- ændrede felter, blev resten af annoncen tømt.
--
-- Rettelsen er ét ord: brug den EKSISTERENDE række som udgangspunkt i stedet
-- for NULL. Så beholder kolonner der ikke er nævnt deres nuværende værdi, og
-- whitelisten fungerer stadig som whitelist, fordi SET-listen er uændret.

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
  -- b.* som udgangspunkt, ikke NULL::bikes. Det er hele rettelsen: med NULL
  -- blev enhver kolonne der ikke stod i p_updates skrevet som NULL, og hele
  -- whitelisten skrives. Sendte admin-panelet kun de ændrede felter, blev
  -- resten af annoncen tømt. Med den eksisterende række som udgangspunkt
  -- beholder unævnte kolonner deres værdi, og SET-listen virker stadig som
  -- whitelist.
  FROM (SELECT * FROM jsonb_populate_record(
          (SELECT bb FROM bikes bb WHERE bb.id = p_bike_id), p_updates)) AS u
  WHERE b.id = p_bike_id;
END;
$$;
