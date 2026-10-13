-- ============================================================
-- revoke_client_payment_rpcs.sql
-- ============================================================
-- Lukker tre betalingsfunktioner for browseren. De må kun kaldes af
-- stripe-webhook og create-rental-checkout (service-role).
--
-- BAGGRUND
-- add_paid_boost.sql og add_rental_bookings.sql skrev
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION ... TO service_role;
-- Men Supabase giver anon og authenticated deres EGEN execute-ret på nye
-- funktioner, og den fjernes ikke af en REVOKE fra PUBLIC. Fundet 13. okt.
-- 2026: alle tre kunne kaldes med den offentlige nøgle.
--
-- - apply_paid_boost: fremhæver en vilkårlig annonce i et vilkårligt antal
--   dage uden betaling og uden ejertjek. Negativt antal dage fjerner en
--   konkurrents betalte fremhævning.
-- - confirm_rental_booking: sætter en ubetalt booking til betalt, hvis man
--   kender checkout-sessionens id (det står i Stripe-adressen).
-- - create_rental_booking: opretter en booking med selvvalgt lejer og beløb.
--
-- Ingen kode i browseren kalder dem (js/listing-boost.js: "Aldrig direkte
-- fra klienten"). Edge functions bruger service-role og rammes ikke.
--
-- is_suspended() kan også kaldes af PUBLIC, men den må IKKE lukkes her:
-- RLS-politikkerne på messages, bikes og reviews kalder den som
-- authenticated.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.apply_paid_boost(text, uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_rental_booking(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_rental_booking(uuid, uuid, date, date, integer, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_paid_boost(text, uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_rental_booking(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_rental_booking(uuid, uuid, date, date, integer, integer, integer, integer, integer) TO service_role;


-- ── Fortryd ──────────────────────────────────────────────────
--   GRANT EXECUTE ON FUNCTION public.apply_paid_boost(text, uuid, uuid, integer, integer) TO anon, authenticated;
--   (og tilsvarende for de to andre)


-- ── Kontrol ──────────────────────────────────────────────────
-- Forventet: false i begge kolonner for alle tre.
--
--   SELECT proname,
--          has_function_privilege('anon', oid, 'EXECUTE')          AS anon,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated
--     FROM pg_proc
--    WHERE proname IN ('apply_paid_boost', 'confirm_rental_booking', 'create_rental_booking');
