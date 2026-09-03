-- ============================================================
-- harden_profile_insert_and_reviews.sql
-- ============================================================
-- Fundet af agenten rls-og-autorisation, 3. september 2026.
-- Tre huller, alle af samme slags: kontrollen findes, men den står ét
-- skridt ved siden af der hvor den skulle stå.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================


-- ── 1. KRITISK: en ny konto kunne gøre sig selv til admin ────
--
-- protect_privileged_profile_columns var BEFORE UPDATE. Den så aldrig en
-- INSERT. Og INSERT-politikken "Kun ejer kan indsætte profil" siger kun
-- auth.uid() = id og intet om kolonnerne.
--
-- Klienten opretter selv profilrækken efter signup (main.js: "Ny
-- OAuth-bruger uden profil endnu"), så vinduet var reelt: en ny bruger
-- kunne indsætte sin egen række med is_admin = true og derfra nå alle
-- admin-edge-functions, alle kontaktbeskeder og sletning af enhver konto.
--
-- Ved INSERT er der ingen OLD at sammenligne med, så vi kan ikke bruge
-- samme "er kolonnen ændret"-logik. I stedet tvinges flagene ned. En
-- profil må aldrig fødes privilegeret; rettigheder gives bagefter, af en
-- admin, gennem admin-actions.

CREATE OR REPLACE FUNCTION protect_privileged_profile_columns()
RETURNS trigger AS $$
DECLARE
  is_admin_caller boolean;
BEGIN
  -- service-role har auth.uid() = NULL og må alt (edge functions)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Slår op i profiles. Ved en INSERT fra en ny bruger findes rækken endnu
  -- ikke, så resultatet er NULL, og NULL er ikke true — den falder korrekt
  -- igennem til begrænsningerne nedenfor.
  SELECT COALESCE(p.is_admin, false) INTO is_admin_caller
  FROM profiles p WHERE p.id = auth.uid();

  IF is_admin_caller THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin    := false;
    NEW.verified    := false;
    NEW.id_verified := false;
    -- email_verified afledes af den faktiske tilstand i auth.users frem for
    -- at blive nulstillet: en OAuth-bruger har allerede bekræftet sin mail
    -- på oprettelsestidspunktet, og sync-triggeren på auth.users fyrer kun
    -- ved UPDATE og ville derfor ikke nå at rette det bagefter.
    NEW.email_verified := COALESCE(
      (SELECT u.email_confirmed_at IS NOT NULL FROM auth.users u WHERE u.id = NEW.id),
      false);
    NEW.stripe_customer_id         := NULL;
    NEW.stripe_subscription_status := NULL;
    RETURN NEW;
  END IF;

  -- ── Herfra: uændret UPDATE-logik ──
  IF NEW.is_admin       IS DISTINCT FROM OLD.is_admin       THEN RAISE EXCEPTION 'Kan ikke ændre is_admin'; END IF;
  IF NEW.id_verified    IS DISTINCT FROM OLD.id_verified    THEN RAISE EXCEPTION 'Kan ikke ændre id_verified'; END IF;

  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    IF NEW.email_verified = true THEN
      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id AND email_confirmed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Kan ikke selv-sætte email_verified uden faktisk bekræftelse';
      END IF;
    ELSE
      RAISE EXCEPTION 'Kan ikke fjerne email_verified';
    END IF;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified AND NEW.verified = true THEN
    RAISE EXCEPTION 'Kan ikke selv-promovere til verificeret forhandler';
  END IF;

  IF NEW.seller_type IS DISTINCT FROM OLD.seller_type THEN
    IF NOT (COALESCE(OLD.seller_type, 'private') = 'private' AND NEW.seller_type = 'dealer') THEN
      RAISE EXCEPTION 'Kan ikke ændre seller_type';
    END IF;
  END IF;

  IF NEW.stripe_customer_id         IS DISTINCT FROM OLD.stripe_customer_id         THEN RAISE EXCEPTION 'Kan ikke ændre stripe_customer_id'; END IF;
  IF NEW.stripe_subscription_status IS DISTINCT FROM OLD.stripe_subscription_status THEN RAISE EXCEPTION 'Kan ikke ændre stripe_subscription_status'; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_columns ON profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_privileged_profile_columns();


-- ── 2. HØJ: anmeldelser kunne postes uden en handel ──────────
--
-- hasTraded-tjekket lå udelukkende i browseren, og INSERT-politikken
-- tjekker kun at reviewer_id er kalderen. Med den offentlige nøgle kunne
-- én konto skrive en forhandlers rating i bund på få sekunder.
--
-- Det unikke indeks reviews_unique_per_trade var samtidig virkningsløst,
-- fordi frontenden aldrig satte bike_id: NULL'er tælles som indbyrdes
-- forskellige i et unikt indeks, så det ramte aldrig. Frontenden sætter
-- det nu (js/reviews.js), og triggeren herunder flytter selve
-- handelskravet ind i databasen.
--
-- ÆRLIGT FORBEHOLD: kravet er "der findes en accepteret-besked mellem de
-- to parter". En angriber kan selv sende en besked der starter med ✅ og
-- indeholder "accepteret", og dermed kvalificere sig. Det hæver barren
-- fra ingenting til "du skal have skrevet til offeret", men lukker den
-- ikke. En rigtig lukning kræver at anmeldelser bindes til en registreret
-- handel (bikes.sold_via + køber), hvilket er en større ændring.

CREATE OR REPLACE FUNCTION require_trade_before_review()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- service-role
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM messages m
    WHERE ((m.sender_id = NEW.reviewer_id      AND m.receiver_id = NEW.reviewed_user_id)
        OR (m.sender_id = NEW.reviewed_user_id AND m.receiver_id = NEW.reviewer_id))
      AND m.content ILIKE '✅%accepteret%'
  ) THEN
    RAISE EXCEPTION 'Du kan kun vurdere brugere du har handlet med via Cykelbørsen';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS require_trade_before_review ON reviews;
CREATE TRIGGER require_trade_before_review
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION require_trade_before_review();


-- ── 3. HØJ: udlejning krævede 'dealer', men ikke 'verified' ──
--
-- bikes har bikes_insert_verified_only, som kræver begge dele. Udlejning
-- havde kun seller_type = 'dealer'. Og triggeren ovenfor tillader bevidst
-- selv-overgangen private → dealer (det er forhandler-ansøgningen).
--
-- Enhver bruger kunne altså sætte sin egen seller_type til 'dealer' og
-- derefter udgive udlejningsannoncer, som vises offentligt på /udlejning
-- uden at der filtreres på verified.

DROP POLICY IF EXISTS rental_items_insert ON public.rental_items;
CREATE POLICY rental_items_insert ON public.rental_items
  FOR INSERT
  WITH CHECK (
    dealer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.seller_type = 'dealer'
        AND p.verified = true
    )
  );


-- ── Kontrol ──────────────────────────────────────────────────
-- Kør efter migrationen. Forventet: protect_profile_columns står med
-- INSERT OR UPDATE, og require_trade_before_review findes.
--
--   SELECT tgname, tgtype FROM pg_trigger
--   WHERE NOT tgisinternal
--     AND tgrelid IN ('public.profiles'::regclass, 'public.reviews'::regclass);
