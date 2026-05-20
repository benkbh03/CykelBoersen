-- ============================================================
-- Annullér handel ved genaktivering — KUN hvis ingen anmeldelse
-- ============================================================
-- Når en sælger genaktiverer en solgt annonce (is_active false→true)
-- betyder det reelt at handlen ikke blev til noget (fortrudt, faldt
-- fra, eller fejlmarkeret). Så skal den ikke længere stå som en
-- gennemført handel i "Handler", og den skal ikke kunne anmeldes.
--
-- MEN: hvis køber ALLEREDE har afgivet en anmeldelse, beviser det at
-- handlen reelt fandt sted. Så låses den — genaktivering må IKKE kunne
-- slette en afgiven anmeldelse (ellers kunne en sælger vaske dårlige
-- anmeldelser væk ved at genaktivere igen og igen).
--
-- Mekanik: handel udledes af accept-beskeder (content ILIKE
-- '%accepteret%'). Når en handel annulleres sletter vi disse beskeder
-- for annoncen — så forsvinder den fra historikken OG hasTraded-gaten
-- (begge bygger på samme besked). sold_via nulstilles så et evt.
-- "Trygt køb"-badge heller ikke tæller den.
--
-- SECURITY DEFINER: triggeren skal kunne slette beskeder uanset RLS.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE OR REPLACE FUNCTION void_trade_on_reactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kun ved genaktivering: solgt (false) → aktiv (true)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    -- Kun hvis INGEN anmeldelse er afgivet for denne annonce
    IF NOT EXISTS (SELECT 1 FROM reviews WHERE bike_id = NEW.id) THEN
      DELETE FROM messages
       WHERE bike_id = NEW.id
         AND content ILIKE '%accepteret%';
      NEW.sold_via := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_void_trade_on_reactivation ON bikes;
CREATE TRIGGER trg_void_trade_on_reactivation
  BEFORE UPDATE ON bikes
  FOR EACH ROW
  EXECUTE FUNCTION void_trade_on_reactivation();
