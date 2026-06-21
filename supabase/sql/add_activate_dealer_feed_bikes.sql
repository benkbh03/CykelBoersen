-- ============================================================
-- activate_dealer_feed_bikes — udgiv alle skjulte (kladde) feed-cykler
-- ============================================================
-- Kladde-import lægger forhandlerens cykler ind SKJULT (is_active=false), så
-- admin kan rette dem før kunderne ser dem. Denne funktion udgiver dem alle på
-- én gang (sætter is_active=true). RLS tillader ikke admin at opdatere andres
-- bikes, så vi bruger SECURITY DEFINER + internt admin-tjek (som remove-RPC'en).
--
-- Frontend kalder den via:
--   supabase.rpc('activate_dealer_feed_bikes', { p_user_id })
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION activate_dealer_feed_bikes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder';
  END IF;

  UPDATE bikes
     SET is_active = true
   WHERE user_id = p_user_id
     AND external_id IS NOT NULL
     AND is_active = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION activate_dealer_feed_bikes(uuid) TO authenticated;
