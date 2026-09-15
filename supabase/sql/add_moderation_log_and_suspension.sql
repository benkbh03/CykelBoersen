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

-- Eksplicit REVOKE oveni. RLS uden politik raekker i dag, men tilfoejer
-- nogen senere en FOR ALL-politik (det er sket paa saved_bikes), aabner
-- baade INSERT og DELETE paa én gang.
REVOKE INSERT, UPDATE, DELETE ON moderation_log FROM anon, authenticated;

-- Kun admins må LÆSE. Ingen INSERT/UPDATE/DELETE-politik: skrivning sker
-- udelukkende fra edge functions med service-role, og ingen kan redigere
-- eller slette en logpost bagefter. En log man kan rette i, er ingen log.
DROP POLICY IF EXISTS moderation_log_admin_select ON moderation_log;
CREATE POLICY moderation_log_admin_select
  ON moderation_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));


-- ── 2. SUSPENDERING ──────────────────────────────────────────────────
--
--  EGEN TABEL, IKKE KOLONNER PAA profiles. Foerste udkast lagde
--  suspended_until og suspended_reason paa profiles. Det var forkert:
--  profiles SELECT er `USING (true)`, saa en admins fritekst om en navngiven
--  person ("mistaenkt for laanesvindel") kunne hentes i bulk med den
--  offentlige anon-noegle, og hele listen over suspenderede brugere var
--  scrapbar. Det er praecis det gentagne moenster fra CLAUDE.md: en ny
--  foelsom kolonne paa profiles bliver offentlig samme dag.
--
--  Her er der ingen offentlig SELECT. Kun admin, og den suspenderede selv,
--  kan se raekken. Sidstnaevnte fordi de skal kunne se HVORFOR.

CREATE TABLE IF NOT EXISTS user_suspensions (
  user_id    uuid        PRIMARY KEY,   -- bevidst uden FK: skal overleve sletning
  until      timestamptz NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS user_suspensions_until_idx ON user_suspensions (until);

ALTER TABLE user_suspensions ENABLE ROW LEVEL SECURITY;

-- Ingen INSERT/UPDATE/DELETE-politik: kun service-role skriver.
REVOKE INSERT, UPDATE, DELETE ON user_suspensions FROM anon, authenticated;

DROP POLICY IF EXISTS user_suspensions_admin_select ON user_suspensions;
CREATE POLICY user_suspensions_admin_select
  ON user_suspensions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- Den suspenderede skal kunne se sin egen begrundelse, ellers ved de ikke hvorfor.
DROP POLICY IF EXISTS user_suspensions_self_select ON user_suspensions;
CREATE POLICY user_suspensions_self_select
  ON user_suspensions FOR SELECT
  USING (user_id = auth.uid());

/* pg_temp med i search_path: PostgreSQL soeger det midlertidige skema foerst
   for relationsnavne, saa en pg_temp.user_suspensions ville kunne kapre
   opslaget. Der er ingen kendt vej til at oprette temp-tabeller gennem
   PostgREST i dag, saa det er haerdning, ikke et hul. */
CREATE OR REPLACE FUNCTION is_suspended(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_suspensions
     WHERE user_id = uid AND until > now()
  );
$$;

-- Funktionen eksponeres ellers automatisk som /rest/v1/rpc/is_suspended og
-- ville vaere et boolean-orakel paa enhver bruger.
REVOKE EXECUTE ON FUNCTION is_suspended(uuid) FROM anon, authenticated;

/* En suspenderet bruger kan stadig logge ind, laese sine egne beskeder og se
   sine annoncer. De kan bare ikke SKRIVE noget andre ser.

   Foerste udkast daekkede kun tre INSERT-stier. Det var for lidt: en
   suspenderet svindler kunne stadig omskrive beskrivelsen paa sine aktive
   annoncer til "ring paa 12 34 56 78", uploade nye billeder og boost'e
   annoncen til toppen. Annoncerteksten er den faktiske svindelflade. */
DROP POLICY IF EXISTS "Indlogget bruger kan sende besked" ON messages;
CREATE POLICY "Indlogget bruger kan sende besked"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND NOT is_suspended(auth.uid()));

/* COALESCE(p.seller_type, 'private') SKAL med. Uden den giver
   p.seller_type <> 'dealer' NULL naar feltet er NULL, OR p.verified (false)
   giver NULL, EXISTS finder ingen raekke, og brugeren kan tavst ikke oprette
   annoncer. Originalen staar i block_pending_dealer_listings.sql. */
DROP POLICY IF EXISTS bikes_insert_verified_only ON bikes;
CREATE POLICY bikes_insert_verified_only
  ON bikes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_suspended(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (COALESCE(p.seller_type, 'private') <> 'dealer' OR p.verified = true)
    )
  );

DROP POLICY IF EXISTS "Kun ejer kan redigere annonce" ON bikes;
CREATE POLICY "Kun ejer kan redigere annonce"
  ON bikes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND NOT is_suspended(auth.uid()));

DROP POLICY IF EXISTS "Kun ejer kan tilføje billeder" ON bike_images;
CREATE POLICY "Kun ejer kan tilføje billeder"
  ON bike_images FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT b.user_id FROM public.bikes b WHERE b.id = bike_images.bike_id)
    AND NOT is_suspended(auth.uid())
  );

DROP POLICY IF EXISTS "Indlogget bruger kan indsætte" ON reviews;
CREATE POLICY "Indlogget bruger kan indsætte"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id AND NOT is_suspended(auth.uid()));


-- ── 2b. OPRYDNING EFTER FØRSTE VERSION ───────────────────────────────
--
--  Kun relevant hvis du nåede at køre den FØRSTE udgave af denne fil
--  (commit a8db0b79). Den lagde suspended_until og suspended_reason som
--  kolonner på profiles, hvor SELECT er USING (true). Afsnittet her flytter
--  eventuelle data over og fjerner kolonnerne igen.
--
--  Har du aldrig kørt den version, gør hele afsnittet ingenting.
--
--  RÆKKEFØLGEN ER IKKE TILFÆLDIG. Den gamle udgave lagde to linjer ind i
--  protect_privileged_profile_columns der henviser til NEW.suspended_until
--  og NEW.suspended_reason. Droppes kolonnerne FØR triggeren er skrevet
--  tilbage, fejler hver eneste INSERT og UPDATE på profiles med
--  "record NEW has no field suspended_until". Og fordi appen skriver
--  last_seen ved hver session, ville det ramme hver eneste indloggede
--  bruger med det samme.

DO $upgrade$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'suspended_until'
  ) THEN
    -- 1) Red data over. Ingen havde nået at blive suspenderet da dette blev
    --    skrevet, men koden må ikke antage det.
    INSERT INTO user_suspensions (user_id, until, reason)
    SELECT id, suspended_until, suspended_reason
      FROM profiles
     WHERE suspended_until IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Flyttede % suspendering(er) fra profiles til user_suspensions',
      (SELECT count(*) FROM profiles WHERE suspended_until IS NOT NULL);
  END IF;
END
$upgrade$;

-- 2) Skriv triggeren tilbage til sin oprindelige form UDEN de to linjer om
--    suspended_*. Ordret som i harden_profile_insert_and_reviews.sql.
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

-- 3) Først NU er det sikkert at fjerne kolonnerne.
DROP INDEX IF EXISTS profiles_suspended_idx;
ALTER TABLE profiles DROP COLUMN IF EXISTS suspended_until;
ALTER TABLE profiles DROP COLUMN IF EXISTS suspended_reason;


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
SET search_path = public, pg_temp
AS $$
DECLARE
  konto_alder   interval;
  graense       integer;
  modtagere     integer;
  er_ny_samtale boolean;
BEGIN
  -- service-role (edge functions) er undtaget
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  /* SKAL staa foerst. created_at er klient-sat ved INSERT (kun UPDATE blev
     revoked i harden_messages_and_reviews.sql), saa en angriber kunne sende
     created_at 61 minutter tilbage i hver besked. Taelleren nedenfor fandt
     saa nul raekker i vinduet, og graensen var fuldstaendig virkningsloes.
     Lukker samtidig forfalskede tidsstempler i indbakken. */
  NEW.created_at := now();

  SELECT now() - created_at INTO konto_alder
    FROM profiles WHERE id = NEW.sender_id;

  graense := CASE
    WHEN konto_alder IS NULL                    THEN 5      -- ukendt = behandl som ny
    WHEN konto_alder < interval '7 days'        THEN 5
    ELSE 20
  END;

  /* Kun NYE samtaler taelles. BEGGE retninger: skrev koeberen foerst, er
     saelgerens svar ikke en ny samtale. Foerste udkast saa kun
     sender -> receiver, saa en ny forhandler der besvarede fem henvendelser
     paa en aften blev blokeret, stik imod hensigten. */
  SELECT NOT EXISTS (
    SELECT 1 FROM messages
     WHERE (sender_id = NEW.sender_id   AND receiver_id = NEW.receiver_id)
        OR (sender_id = NEW.receiver_id AND receiver_id = NEW.sender_id)
  ) INTO er_ny_samtale;

  IF NOT er_ny_samtale THEN RETURN NEW; END IF;

  /* Taeller kun modtagere som afsenderen ALDRIG har vaeret i kontakt med
     foer den seneste time. Uden det undtag ville en travl saelgers
     igangvaerende traade taelle med og bremse dem. */
  SELECT count(*) INTO modtagere FROM (
    SELECT DISTINCT m.receiver_id
      FROM messages m
     WHERE m.sender_id  = NEW.sender_id
       AND m.created_at > now() - interval '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM messages tidligere
          WHERE tidligere.created_at <= now() - interval '1 hour'
            AND ((tidligere.sender_id = NEW.sender_id AND tidligere.receiver_id = m.receiver_id)
              OR (tidligere.sender_id = m.receiver_id AND tidligere.receiver_id = NEW.sender_id))
       )
  ) AS nye;

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
