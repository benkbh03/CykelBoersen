-- ============================================================
-- remove_dealer_feed_bikes — admin-knap "Fjern cykler" uden edge-deploy
-- ============================================================
-- "Fjern cykler"-knappen i admin skal kunne deaktivere ALLE feed-importerede
-- cykler (external_id not null) for en forhandler. En admin må ikke opdatere
-- andres cykler via RLS, så vi bruger en SECURITY DEFINER-funktion (kører med
-- definer-rettigheder = omgår RLS) med et internt admin-tjek. Frontend kalder
-- den via supabase.rpc('remove_dealer_feed_bikes', { p_user_id }).
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION remove_dealer_feed_bikes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Kun admins må kalde denne
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder';
  END IF;

  UPDATE bikes
     SET is_active = false
   WHERE user_id = p_user_id
     AND external_id IS NOT NULL
     AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_dealer_feed_bikes(uuid) TO authenticated;
