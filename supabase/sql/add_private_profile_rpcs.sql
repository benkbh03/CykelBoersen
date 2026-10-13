-- ============================================================
-- add_private_profile_rpcs.sql
-- ============================================================
-- To funktioner der giver adgang til de profilkolonner som
-- hide_private_profile_columns.sql skjuler for den offentlige nøgle:
--
--   get_my_private_profile()  den indloggede brugers egne skjulte felter
--   admin_list_profiles()     alle kolonner på alle profiler, kun for admin
--
-- En kolonne-GRANT kan ikke sige "kun egen række" eller "kun admin". Det kan
-- en SECURITY DEFINER-funktion, fordi den selv tjekker auth.uid().
--
-- Kør FØR hide_private_profile_columns.sql, og før frontenden der kalder
-- dem er merget. Funktionerne ændrer intet i sig selv og er sikre at køre
-- når som helst.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. Egne skjulte felter ───────────────────────────────────
-- Bruges af /me/rediger (abonnementsboksen læser stripe-felterne).
-- Uden login returnerer den ingen rækker.

CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE (
  email                      text,
  cvr                        text,
  stripe_customer_id         text,
  stripe_subscription_status text,
  id_pending                 boolean,
  dealer_application         boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.cvr, p.stripe_customer_id, p.stripe_subscription_status,
         p.id_pending, p.dealer_application
    FROM profiles p
   WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_private_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;


-- ── 2. Admin: hele profiltabellen ────────────────────────────
-- Bruges af admin-panelets faner "Ansøgninger" og "Brugere", der viser
-- e-mail og CVR. Filtre og sortering lægges på kaldet fra frontenden
-- (PostgREST kan filtrere resultatet af en SETOF-funktion):
--   supabase.rpc('admin_list_profiles').eq('seller_type','dealer').order(...)

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin) THEN
    RAISE EXCEPTION 'Kræver admin-rettigheder' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM profiles;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;


-- ── Kontrol ──────────────────────────────────────────────────
-- Forventet: begge findes, og anon kan ikke kalde dem.
--
--   SELECT proname, prosecdef,
--          has_function_privilege('anon', oid, 'EXECUTE') AS anon_kan
--     FROM pg_proc
--    WHERE proname IN ('get_my_private_profile', 'admin_list_profiles');
