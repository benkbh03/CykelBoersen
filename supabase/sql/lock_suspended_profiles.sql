-- ══════════════════════════════════════════════════════════════════════
--  SUSPENDERING: lås profilen
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent, sikker at gentage.
-- ══════════════════════════════════════════════════════════════════════
--
--  BAGGRUND (25. okt. 2026)
--  add_moderation_log_and_suspension.sql stopper en suspenderet bruger i
--  at skrive beskeder, oprette og rette annoncer og skrive vurderinger.
--  Profilen var glemt: navn, bio, profilbillede, telefon, hjemmeside og
--  sociale links kunne stadig rettes, og de vises til alle. En suspenderet
--  svindler kunne altså skrive "ring på 12 34 56 78" i sin bio, eller give
--  sig selv et nyt navn, og bruge profilen som opslagstavle.
--
--  TILLADT-LISTE, IKKE FORBUDT-LISTE. En suspenderet bruger må kun ændre de
--  kolonner appen selv skriver uden at brugeren gør noget: last_seen (ved
--  hver session) og email_verified (når mailen bekræftes). Alt andet
--  afvises. Får profiles en ny offentlig kolonne senere, er den låst fra
--  start, i stedet for at være et nyt hul ingen husker at lukke.
--
--  Admins og edge functions (service-role, auth.uid() = NULL) er ikke ramt:
--  tjekket ser på om DEN DER SKRIVER er suspenderet, ikke på rækken. Så kan
--  admin stadig omdøbe en svindler til "Spærret bruger".
--
--  RULLE TILBAGE:
--    DROP TRIGGER IF EXISTS lock_suspended_profile_trg ON public.profiles;
--    DROP FUNCTION IF EXISTS public.lock_suspended_profile();

CREATE OR REPLACE FUNCTION public.lock_suspended_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_suspended(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'last_seen' - 'email_verified')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'last_seen' - 'email_verified') THEN
    -- Teksten vises i appen. Den rammer også en ærlig bruger, der er
    -- suspenderet ved en fejl, så den skal sige hvad de kan gøre.
    RAISE EXCEPTION 'Din konto er suspenderet, så profilen kan ikke ændres. Skriv til hej@cykelbørsen.dk hvis det er en fejl.'
      USING ERRCODE = 'check_violation', HINT = 'suspended';
  END IF;

  RETURN NEW;
END;
$$;

-- Funktionen må ikke kunne kaldes direkte som /rest/v1/rpc/...
REVOKE EXECUTE ON FUNCTION public.lock_suspended_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lock_suspended_profile_trg ON public.profiles;
CREATE TRIGGER lock_suspended_profile_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_suspended_profile();

-- ══════════════════════════════════════════════════════════════════════
--  EFTER KØRSEL: STATUS_TJEK.sql række 85 skal vise OK.
-- ══════════════════════════════════════════════════════════════════════
