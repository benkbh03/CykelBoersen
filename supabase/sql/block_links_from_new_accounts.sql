-- ══════════════════════════════════════════════════════════════════════
--  Nye konti kan ikke sende links i beskeder
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  13. okt.: en konto oprettet kl. 10.56 sendte kl. 11.00-11.04 fem
--  beskeder med et falsk betalingslink. Den fik fire sendt, før nogen
--  opdagede den, og notify-message lagde linket i e-mailen til hver
--  modtager. limit_new_conversations (5 nye samtaler pr. time for konti
--  under 7 dage) bremsede den ikke, fordi den kun nåede fire.
--
--  Svindel af den type kræver et link. En ægte køber på sin første uge har
--  næsten aldrig brug for at sende et. Derfor: konti under 7 dage kan ikke
--  sende en besked der indeholder en webadresse. Henvisninger til
--  cykelbørsen.dk er tilladt.
--
--  Grænsen er den samme 7 dage som i limit_new_conversations, så der kun
--  er én regel for "ny konto" at forklare.
--
--  Fanger: https://..., www...., og nøgne domæner som "bekreftzn.com/a/x".
--  Fanger ikke: et link skrevet ud med mellemrum ("bekreftzn . com"). Det
--  er bevidst. Målet er at gøre svindlen dyrere, ikke umulig, og et link
--  man ikke kan trykke på, virker langt dårligere.
--
--  Service-role (auth.uid() er NULL) er undtaget, ligesom i de andre
--  besked-triggere. Admins er undtaget.

CREATE OR REPLACE FUNCTION message_contains_link(txt text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT txt IS NOT NULL AND
    regexp_replace(lower(txt),
      '(https?://)?(www\.)?(cykelbørsen|cykelboersen|xn--cykelbrsen-5cb)\.dk[^[:space:]]*',
      '', 'g')
    ~ '(https?://|www\.|[a-z0-9-]+\.(com|net|org|dk|de|se|no|eu|io|co|me|info|biz|xyz|top|shop|site|online|link|app|click|live|store|ru|cn|ly|gl|cc|pw|vip|icu|buzz)([/?#:]|[[:space:]]|$))';
$$;

CREATE OR REPLACE FUNCTION block_links_from_new_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  oprettet timestamptz;
  admin    boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT message_contains_link(NEW.content) THEN RETURN NEW; END IF;

  SELECT created_at, COALESCE(is_admin, false) INTO oprettet, admin
    FROM profiles WHERE id = NEW.sender_id;

  IF admin THEN RETURN NEW; END IF;

  IF oprettet IS NULL OR oprettet > now() - interval '7 days' THEN
    -- Teksten vises til brugeren via beskedFejl() i js/utils.js.
    RAISE EXCEPTION 'Links kan først sendes i beskeder, når din konto er 7 dage gammel.'
      USING ERRCODE = 'check_violation', HINT = 'link_new_account';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER block_links_from_new_accounts
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION block_links_from_new_accounts();
