-- ============================================================
-- add_low_price_review.sql
--
-- Cykelannoncer under 200 kr. vises ikke offentligt, før en admin har
-- godkendt dem.
--
-- Hvorfor: 6. okt. stod en Cannondale Navaro el-cykel fra 2025 til 9 kr. på
-- forsiden i flere dage. En pris i den størrelse er en test, en tastefejl
-- eller et lokkemiddel til svindel, og den får køberne til at stole mindre
-- på de andre annoncer. Intet fangede den.
--
-- Reglen ligger i databasen, ikke i frontenden, så den gælder uanset hvilken
-- vej annoncen kommer ind (sælg-siden, redigér, "Genaktiver", konsollen).
--
-- Sådan virker den:
--   * Skjult = is_active false + held_for_review true. Alle offentlige lister,
--     kortet, sitemap og prerender viser allerede kun is_active = true, så
--     der skal ikke ændres én eneste liste-query.
--   * Triggeren hold_low_price_bikes holder annoncen tilbage ved INSERT og
--     UPDATE, når prisen er under 200 kr., og frigiver den igen, hvis
--     sælgeren retter prisen til 200 kr. eller mere.
--   * Admin godkender eller afviser via admin_review_bike(). Godkendelsen
--     gælder den pris, der blev godkendt (review_approved_price). Sætter
--     sælgeren bagefter en ANDEN pris under 200 kr., holdes den tilbage igen.
--
-- Undtaget: tilbehør (category <> 'cykel'), "Gives væk" (is_giveaway),
-- verificerede forhandlere, admins og serverkald uden bruger (edge functions
-- med service-role, Dashboard).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_hold_low_price_bikes ON bikes;
--   UPDATE bikes SET is_active = true, held_for_review = false
--    WHERE held_for_review AND deleted_at IS NULL;
-- ============================================================


-- ── 1. Kolonner ─────────────────────────────────────────────────────
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS held_for_review boolean NOT NULL DEFAULT false;

-- Prisen admin har godkendt. NULL = ingen godkendelse.
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS review_approved_price numeric;

-- Admin-fanen henter kun de tilbageholdte. Delvist indeks: lille og billigt.
CREATE INDEX IF NOT EXISTS idx_bikes_held_for_review
  ON bikes (created_at DESC) WHERE held_for_review;


-- ── 2. Triggeren ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hold_low_price_bikes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_threshold CONSTANT numeric := 200;
  v_uid       uuid := auth.uid();
  v_exempt    boolean;
  v_needs     boolean;
BEGIN
  -- Serverkald (service-role, Dashboard) og admins styrer selv kolonnerne.
  IF v_uid IS NULL
     OR EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND is_admin) THEN
    RETURN NEW;
  END IF;

  -- Sælgeren må ikke selv godkende eller frigive sin annonce.
  IF TG_OP = 'INSERT' THEN
    NEW.review_approved_price := NULL;
    NEW.held_for_review       := false;
  ELSE
    NEW.review_approved_price := OLD.review_approved_price;
    NEW.held_for_review       := OLD.held_for_review;
  END IF;

  v_exempt := COALESCE(NEW.category, 'cykel') <> 'cykel'
           OR COALESCE(NEW.is_giveaway, false)
           OR EXISTS (SELECT 1 FROM profiles
                       WHERE id = NEW.user_id
                         AND seller_type = 'dealer' AND verified);

  v_needs := NOT v_exempt
         AND NEW.price IS NOT NULL
         AND NEW.price < c_threshold
         AND NEW.price IS DISTINCT FROM NEW.review_approved_price;

  IF v_needs AND (NEW.is_active OR NEW.held_for_review) THEN
    -- Hold tilbage (ny annonce, genaktivering, eller ny lav pris).
    NEW.is_active       := false;
    NEW.held_for_review := true;
  ELSIF NOT v_needs AND NEW.held_for_review THEN
    -- Sælgeren har rettet prisen: frigiv, medmindre annoncen er fjernet.
    NEW.held_for_review := false;
    NEW.is_active       := NEW.deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Navnet starter med "trg_hold" for at køre FØR trg_prevent_sold_bike_edits
-- (BEFORE-triggere kører i alfabetisk orden). Så ser låsen den frigivne
-- annonce som aktiv, når sælgeren retter prisen op.
DROP TRIGGER IF EXISTS trg_hold_low_price_bikes ON bikes;
CREATE TRIGGER trg_hold_low_price_bikes
  BEFORE INSERT OR UPDATE ON bikes
  FOR EACH ROW
  EXECUTE FUNCTION hold_low_price_bikes();


-- ── 3. Låsen på solgte annoncer må ikke ramme tilbageholdte ─────────
-- En tilbageholdt annonce har is_active = false og lignede derfor en solgt
-- annonce for prevent_sold_bike_edits: sælgeren kunne ikke rette prisen.
-- Samme funktion som exempt_feed_bikes_from_sold_lock.sql, plus held_for_review.
CREATE OR REPLACE FUNCTION prevent_sold_bike_edits()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = false AND NEW.is_active = false
     AND OLD.external_id IS NULL
     AND NOT COALESCE(OLD.held_for_review, false) THEN
    IF NEW.brand          IS DISTINCT FROM OLD.brand
    OR NEW.model          IS DISTINCT FROM OLD.model
    OR NEW.type           IS DISTINCT FROM OLD.type
    OR NEW.price          IS DISTINCT FROM OLD.price
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.condition      IS DISTINCT FROM OLD.condition
    OR NEW.year           IS DISTINCT FROM OLD.year
    OR NEW.size           IS DISTINCT FROM OLD.size
    OR NEW.color          IS DISTINCT FROM OLD.color
    OR NEW.city           IS DISTINCT FROM OLD.city
    OR NEW.warranty       IS DISTINCT FROM OLD.warranty
    THEN
      RAISE EXCEPTION 'Solgte annoncer kan ikke redigeres. Genaktiver annoncen først.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── 4. Admin godkender eller afviser ────────────────────────────────
-- Godkend: annoncen går live, og prisen huskes som godkendt.
-- Afvis:   annoncen forbliver skjult og ryger ud af køen. Sætter sælgeren
--          den aktiv igen til samme pris, holdes den tilbage igen.
-- Begge skrives i moderation_log, så vi kan se hvad vi besluttede og hvornår.
CREATE OR REPLACE FUNCTION admin_review_bike(p_bike_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bike bikes%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder';
  END IF;

  SELECT * INTO v_bike FROM bikes WHERE id = p_bike_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Annonce findes ikke';
  END IF;

  IF p_approve THEN
    UPDATE bikes
       SET held_for_review       = false,
           review_approved_price = price,
           is_active             = (deleted_at IS NULL)
     WHERE id = p_bike_id;
  ELSE
    UPDATE bikes
       SET held_for_review = false,
           is_active       = false
     WHERE id = p_bike_id;
  END IF;

  INSERT INTO moderation_log (admin_id, admin_email, action, target_user_id, target_email, reason, snapshot)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    CASE WHEN p_approve THEN 'approve_low_price' ELSE 'reject_low_price' END,
    v_bike.user_id,
    (SELECT email FROM auth.users WHERE id = v_bike.user_id),
    p_reason,
    jsonb_build_object('bike_id', v_bike.id, 'brand', v_bike.brand, 'model', v_bike.model,
                       'price', v_bike.price, 'city', v_bike.city, 'created_at', v_bike.created_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_review_bike(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_review_bike(uuid, boolean, text) TO authenticated;


-- ── 5. Eksisterende annoncer ────────────────────────────────────────
-- Aktive cykelannoncer under 200 kr. fra private og ikke-godkendte
-- forhandlere lægges i køen nu. Kører som Dashboard-bruger, så triggeren
-- springer over, og vi sætter kolonnerne selv.
UPDATE bikes b
   SET is_active = false, held_for_review = true
 WHERE b.is_active
   AND b.price < 200
   AND COALESCE(b.category, 'cykel') = 'cykel'
   AND NOT COALESCE(b.is_giveaway, false)
   AND b.review_approved_price IS DISTINCT FROM b.price
   AND NOT EXISTS (SELECT 1 FROM profiles p
                    WHERE p.id = b.user_id AND p.seller_type = 'dealer' AND p.verified);

-- Kvittering: hvad ligger i køen nu.
SELECT b.id, b.brand, b.model, b.price, b.city, b.created_at
  FROM bikes b
 WHERE b.held_for_review AND b.deleted_at IS NULL
 ORDER BY b.created_at DESC;
