-- ══════════════════════════════════════════════════════════════════════
--  MODERATION: log, suspendering og grænse på nye samtaler
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent, sikker at gentage.
-- ══════════════════════════════════════════════════════════════════════
--
--  BAGGRUND
--  13. september 2026 sendte en konto en advance-fee lånesvindel som besked
--  på en 400 kr. annonce. Gennemgangen bagefter viste tre huller:
--
--    1. Den eneste måde at stoppe kontoen var PERMANENT SLETNING.
--       `admin-actions` kendte seks handlinger, og suspendering var ikke
--       en af dem. Valget stod mellem at overreagere og ikke at gøre noget.
--
--    2. Sletning ØDELÆGGER BEVISET. delete-account/index.ts sletter
--       `messages` for både afsender og modtager. Trykker man Slet,
--       forsvinder svindelbeskeden med kontoen. Spørger politiet tre
--       måneder senere, findes der intet.
--
--    3. Der er INGEN GRÆNSE på hvor mange den samme konto kan skrive til.
--       Én besked er et uheld. Det samme script kørt mod alle sælgere på
--       sitet er en kampagne, og intet i dag står i vejen for den.
--
--  Denne migration lukker alle tre.

-- ── 1. MODERATIONSLOG ────────────────────────────────────────────────
--
--  BEMÆRK: INGEN fremmednøgle på target_user_id. Det er hele pointen.
--  Rækken skal overleve at brugeren slettes, ellers forsvinder beviset
--  præcis når vi får brug for det. Samme grund til at snapshot er jsonb:
--  vi gemmer hvad vi vidste, ikke en reference til noget der kan ændre sig.

CREATE TABLE IF NOT EXISTS moderation_log (
  id             bigserial   PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now(),
  admin_id       uuid,                    -- hvem traf beslutningen
  admin_email    text,                    -- læsbart, overlever at admin skifter
  action         text        NOT NULL,    -- 'delete_user', 'suspend_user', …
  target_user_id uuid,                    -- hvem den ramte (bevidst uden FK)
  target_email   text,
  reason         text,
  snapshot       jsonb                    -- hvad vi vidste da vi besluttede
);

CREATE INDEX IF NOT EXISTS moderation_log_target_idx  ON moderation_log (target_user_id);
CREATE INDEX IF NOT EXISTS moderation_log_created_idx ON moderation_log (created_at DESC);

ALTER TABLE moderation_log ENABLE ROW LEVEL SECURITY;

-- Kun admins må LÆSE. Ingen INSERT/UPDATE/DELETE-politik: skrivning sker
-- udelukkende fra edge functions med service-role, og ingen kan redigere
-- eller slette en logpost bagefter. En log man kan rette i, er ingen log.
DROP POLICY IF EXISTS moderation_log_admin_select ON moderation_log;
CREATE POLICY moderation_log_admin_select
  ON moderation_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));


-- ── 2. SUSPENDERING ──────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE INDEX IF NOT EXISTS profiles_suspended_idx
  ON profiles (suspended_until) WHERE suspended_until IS NOT NULL;

/* De to nye kolonner SKAL med i protect_privileged_profile_columns, ellers
   kan en suspenderet bruger simpelthen fjerne sin egen suspendering med et
   almindeligt profil-UPDATE. Funktionen genskabes derfor i sin helhed
   nedenfor; alt andet i den er uændret fra harden_profile_insert_and_reviews.sql. */
CREATE OR REPLACE FUNCTION protect_privileged_profile_columns()
RETURNS trigger AS $$
DECLARE
  is_admin_caller boolean;
BEGIN
  -- service-role har auth.uid() = NULL og må alt (edge functions)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO is_admin_caller
  FROM profiles p WHERE p.id = auth.uid();

  IF is_admin_caller THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin    := false;
    NEW.verified    := false;
    NEW.id_verified := false;
    NEW.email_verified := COALESCE(
      (SELECT u.email_confirmed_at IS NOT NULL FROM auth.users u WHERE u.id = NEW.id),
      false);
    NEW.stripe_customer_id         := NULL;
    NEW.stripe_subscription_status := NULL;
    -- Nyt: en ny konto kan ikke fødes ususpenderet hvis nogen prøver at
    -- sætte feltet selv. Den kan heller ikke føde sig selv suspenderet,
    -- men det er der ingen grund til at forhindre.
    NEW.suspended_until  := NULL;
    NEW.suspended_reason := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_admin       IS DISTINCT FROM OLD.is_admin       THEN RAISE EXCEPTION 'Kan ikke ændre is_admin'; END IF;
  IF NEW.id_verified    IS DISTINCT FROM OLD.id_verified    THEN RAISE EXCEPTION 'Kan ikke ændre id_verified'; END IF;

  -- Nyt: kun admin og service-role må røre suspenderingen.
  IF NEW.suspended_until  IS DISTINCT FROM OLD.suspended_until  THEN RAISE EXCEPTION 'Kan ikke ændre suspended_until'; END IF;
  IF NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason THEN RAISE EXCEPTION 'Kan ikke ændre suspended_reason'; END IF;

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


/* Hjælper til politikkerne. SECURITY DEFINER fordi en suspenderet bruger
   godt må kunne LÆSE sin egen profil, men politikken skal kunne slå op i
   den uden at være afhængig af den kaldendes egne rettigheder. */
CREATE OR REPLACE FUNCTION is_suspended(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT suspended_until > now() FROM profiles WHERE id = uid),
    false);
$$;

/* En suspenderet bruger kan stadig logge ind, læse sine egne beskeder og
   se sine annoncer. Det er med vilje: de skal kunne se hvorfor, og de skal
   kunne nå deres egne data. De kan bare ikke SKRIVE til nogen. */
DROP POLICY IF EXISTS "Indlogget bruger kan sende besked" ON messages;
CREATE POLICY "Indlogget bruger kan sende besked"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND NOT is_suspended(auth.uid()));

DROP POLICY IF EXISTS bikes_insert_verified_only ON bikes;
CREATE POLICY bikes_insert_verified_only
  ON bikes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_suspended(auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles p
       WHERE p.id = auth.uid()
         AND (p.seller_type <> 'dealer' OR p.verified)
    )
  );

DROP POLICY IF EXISTS "Indlogget bruger kan indsætte" ON reviews;
CREATE POLICY "Indlogget bruger kan indsætte"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id AND NOT is_suspended(auth.uid()));


-- ── 3. GRÆNSE PÅ NYE SAMTALER ────────────────────────────────────────
--
--  Hvorfor en trigger og ikke en politik: en politik kan kun se den række
--  der indsættes. Her skal vi tælle hvad afsenderen har gjort den seneste
--  time, og det kræver et opslag.
--
--  Hvorfor to niveauer: en ny konto koster én gratis e-mailadresse, så den
--  er billig at smide væk og oprette igen. En konto der har eksisteret i en
--  uge har en historik, der er noget at miste, og den skal ikke generes.
--
--  Grænserne er sat så en ÆGTE køber aldrig rammer dem. Fem sælgere på en
--  time er allerede en meget aktiv aften. En spam-kampagne rammer dusinvis.

CREATE OR REPLACE FUNCTION limit_new_conversations()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  konto_alder   interval;
  graense       integer;
  modtagere     integer;
  er_ny_samtale boolean;
BEGIN
  -- service-role (edge functions) er undtaget
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT now() - created_at INTO konto_alder
    FROM profiles WHERE id = NEW.sender_id;

  graense := CASE
    WHEN konto_alder IS NULL                    THEN 5      -- ukendt = behandl som ny
    WHEN konto_alder < interval '7 days'        THEN 5
    ELSE 20
  END;

  -- Kun NYE samtaler tælles. Et svar i en igangværende tråd er aldrig spam,
  -- og en sælger der svarer tyve købere skal ikke bremses.
  SELECT NOT EXISTS (
    SELECT 1 FROM messages
     WHERE sender_id = NEW.sender_id
       AND receiver_id = NEW.receiver_id
  ) INTO er_ny_samtale;

  IF NOT er_ny_samtale THEN RETURN NEW; END IF;

  SELECT count(DISTINCT receiver_id) INTO modtagere
    FROM messages
   WHERE sender_id  = NEW.sender_id
     AND created_at > now() - interval '1 hour';

  IF modtagere >= graense THEN
    -- Beskeden vises til brugeren. Hold den forståelig og uden bebrejdelse:
    -- den rammer langt oftere en ivrig køber end en svindler.
    RAISE EXCEPTION 'For mange nye samtaler på kort tid. Prøv igen om en time.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_new_conversations_trg ON messages;
CREATE TRIGGER limit_new_conversations_trg
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION limit_new_conversations();

-- Triggeren slår op i (sender_id, created_at) ved hver eneste besked.
CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON messages (sender_id, created_at DESC);


-- ══════════════════════════════════════════════════════════════════════
--  EFTER KØRSEL: bekræft med forespørgsler, ikke med et "det er deployet".
-- ══════════════════════════════════════════════════════════════════════
--
--  -- 1. Kolonnerne findes
--  SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name LIKE 'suspended%';
--
--  -- 2. Politikkerne nævner is_suspended
--  SELECT tablename, policyname, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND with_check LIKE '%is_suspended%';
--
--  -- 3. Triggeren sidder på messages
--  SELECT tgname FROM pg_trigger WHERE tgrelid = 'messages'::regclass
--     AND NOT tgisinternal;
--
--  -- 4. Loggen er tom, men læsbar for dig som admin
--  SELECT count(*) FROM moderation_log;
