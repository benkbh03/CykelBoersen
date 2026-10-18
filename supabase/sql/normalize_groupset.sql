-- ============================================================
-- normalize_groupset.sql
--
-- Skriv komponentgruppen i én fast form, så filtrene kan finde den.
--
-- Hvorfor: filtret "Shimano 105" matcher som prefix (ilike
-- 'Shimano 105*' på forsiden og kortet, startsWith i begge
-- cykelagent-matchere). Sælgere skriver ofte kun "105" eller
-- "Ultegra". En Scott Foil med "105" og Di2 blev derfor ikke fundet
-- af "Carbon cykel med 105 elektronisk gear" (18. okt.), selv om
-- annoncekortet viste "Shimano 105" (js/card-spec.js tilføjer mærket
-- til visning, men kun til visning).
--
-- Rettet i databasen frem for i hver matcher: der er fire matchere
-- (forside, kort, to cykelagent-matchere) og fem veje ind (sælg,
-- rediger, admin, bulk-import, feed). En trigger dækker alle.
--
-- Reglerne (kun første ord tæller, resten står urørt):
--   · "105", "Ultegra", "Dura Ace", "GRX 800", "Deore" ...
--       -> "Shimano 105", "Shimano Ultegra", "Shimano Dura-Ace" ...
--   · "Rival", "Force AXS", "GX Eagle" ...  -> "SRAM ..."
--   · "Ekar", "Chorus", "Super Record" ... -> "Campagnolo ..."
--   · "shimano"/"sram"/"campagnolo" med forkerte store bogstaver
--       -> "Shimano"/"SRAM"/"Campagnolo"
--   · "Dura Ace"/"Duraace" -> "Dura-Ace"
--   · "Deore XT" -> "XT". Ellers rammer filtret "Shimano Deore" også
--     XT-cykler, og filtret "Shimano XT" rammer dem ikke.
--   · Dobbelte mellemrum fjernes; tom tekst bliver NULL.
--
-- Idempotent: sikker at køre igen. Funktionen giver samme svar på
-- sit eget svar, så en normaliseret værdi ændres aldrig igen.
-- Rollback: DROP TRIGGER IF EXISTS trg_normalize_groupset ON bikes;
--           DROP FUNCTION IF EXISTS normalize_groupset_trigger();
--           DROP FUNCTION IF EXISTS normalize_groupset(text);
--           (de rettede værdier bliver stående; de er stadig korrekte)
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_groupset(g text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF g IS NULL THEN RETURN NULL; END IF;
  v := btrim(regexp_replace(g, '\s+', ' ', 'g'));
  IF v = '' THEN RETURN NULL; END IF;

  -- Mærkets stavemåde
  v := regexp_replace(v, '^shimano\y', 'Shimano', 'i');
  v := regexp_replace(v, '^sram\y', 'SRAM', 'i');
  v := regexp_replace(v, '^campagnolo\y', 'Campagnolo', 'i');

  -- Dura-Ace skrives med bindestreg, også når mærket mangler
  v := regexp_replace(v, '\ydura[ -]?ace\y', 'Dura-Ace', 'i');

  -- "Deore XT" er XT (se ovenfor)
  v := regexp_replace(v, '^(Shimano )?deore xt\y', '\1XT', 'i');

  -- Mærket mangler: sæt det på ud fra første ord
  IF v ~* '^(105|ultegra|dura-ace|grx|tiagra|sora|claris|tourney|altus|acera|alivio|deore|slx|xtr|xt|cues)\y' THEN
    v := 'Shimano ' || v;
  ELSIF v ~* '^(apex|rival|force|red|nx|gx|sx|x01|xx1|xx)\y' THEN
    v := 'SRAM ' || v;
  ELSIF v ~* '^(ekar|centaur|chorus|record|super record|potenza)\y' THEN
    v := 'Campagnolo ' || v;
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_groupset_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.groupset := normalize_groupset(NEW.groupset);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_groupset ON bikes;
CREATE TRIGGER trg_normalize_groupset
  BEFORE INSERT OR UPDATE OF groupset ON bikes
  FOR EACH ROW EXECUTE FUNCTION normalize_groupset_trigger();

-- ── Oprydning i eksisterende annoncer ──────────────────────────
-- groupset er ikke låst på solgte annoncer (lock_sold_bike_edits.sql),
-- så opdateringen går igennem for alle.
UPDATE bikes
   SET groupset = normalize_groupset(groupset)
 WHERE groupset IS DISTINCT FROM normalize_groupset(groupset);
