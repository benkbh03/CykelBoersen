-- ============================================================
-- list_dealer_feed_bikes — admin henter en forhandlers feed-cykler til gennemgang
-- ============================================================
-- "Gennemgå & udgiv" skal kunne liste ALLE feed-importerede cykler for en
-- forhandler (både aktive og skjulte), så admin kan rette dem. En direkte
-- klient-SELECT kan blokeres af RLS (en anden forhandlers ikke-aktive cykler),
-- så vi bruger en SECURITY DEFINER-funktion med internt admin-tjek (som de
-- øvrige feed-RPC'er). Returnerer hele bikes-rækken (SETOF) så typer matcher.
--
-- Frontend kalder den via:
--   supabase.rpc('list_dealer_feed_bikes', { p_user_id })
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION list_dealer_feed_bikes(p_user_id uuid)
RETURNS SETOF bikes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder';
  END IF;

  RETURN QUERY
    SELECT *
      FROM bikes
     WHERE user_id = p_user_id
       AND external_id IS NOT NULL
     ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_dealer_feed_bikes(uuid) TO authenticated;
