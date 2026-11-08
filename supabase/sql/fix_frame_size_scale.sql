-- ══════════════════════════════════════════════════════════════════════
--  Ny stelstørrelse-skala: L 56–58 cm, XL 59+ cm
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  7. nov.: en Raleigh Yate Cargo på 60 cm stod som "ca. L". Skalaen lå
--  cirka én størrelse for højt (L 57–60, XL 61+). Almindelig praksis, både
--  på racere og bycykler, er 60 cm = XL.
--
--    gammel                ny
--    XS (44–48 cm)    →    XS (44–47 cm)
--    S (49–52 cm)     →    S (48–51 cm)
--    M (53–56 cm)     →    M (52–55 cm)
--    L (57–60 cm)     →    L (56–58 cm)
--    XL (61+ cm)      →    XL (59+ cm)
--
--  1. Funktion: gammel værdi → ny værdi. Har annoncen et cm-mål (og er
--     ikke mountainbike, børne- eller ladcykel, hvis stel måles
--     anderledes), regnes bogstavet ud fra cm. Ellers beholdes sælgerens
--     bogstav med den nye tekst.
--  2. Trigger på bikes: en browser med en cachet, gammel udgave af
--     sælg-siden kan i nogle timer efter deploy stadig sende den gamle
--     tekst. Triggeren oversætter den, så filtrene ikke misser annoncen.
--  3. Opdatér de eksisterende annoncer (13 på prod 7. nov.).
--  4. Gemte søgninger (cykelagenter) med gamle værdier i "sizes".
--
--  Fortryd: kør afsnittet FORTRYD nederst (udkommenteret).

CREATE OR REPLACE FUNCTION normalize_frame_size(p_size text, p_size_cm numeric, p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_size IS NULL OR p_size = '' THEN p_size
    -- cm-mål findes og typen måles som racer/bycykel: regn ud fra cm
    WHEN p_size_cm BETWEEN 38 AND 70
         AND coalesce(p_type, '') NOT IN ('Mountainbike', 'Børnecykel', 'Ladcykel')
         AND p_size IN ('XS (44–48 cm)','S (49–52 cm)','M (53–56 cm)','L (57–60 cm)','XL (61+ cm)')
      THEN CASE
        WHEN p_size_cm <= 47 THEN 'XS (44–47 cm)'
        WHEN p_size_cm <= 51 THEN 'S (48–51 cm)'
        WHEN p_size_cm <= 55 THEN 'M (52–55 cm)'
        WHEN p_size_cm <= 58 THEN 'L (56–58 cm)'
        ELSE 'XL (59+ cm)' END
    WHEN p_size = 'XS (44–48 cm)' THEN 'XS (44–47 cm)'
    WHEN p_size = 'S (49–52 cm)'  THEN 'S (48–51 cm)'
    WHEN p_size = 'M (53–56 cm)'  THEN 'M (52–55 cm)'
    WHEN p_size = 'L (57–60 cm)'  THEN 'L (56–58 cm)'
    WHEN p_size = 'XL (61+ cm)'   THEN 'XL (59+ cm)'
    ELSE p_size
  END
$$;

CREATE OR REPLACE FUNCTION bikes_normalize_frame_size()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.size := normalize_frame_size(NEW.size, NEW.size_cm, NEW.type);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bikes_normalize_frame_size ON public.bikes;
CREATE TRIGGER bikes_normalize_frame_size
  BEFORE INSERT OR UPDATE OF size, size_cm, type ON public.bikes
  FOR EACH ROW EXECUTE FUNCTION bikes_normalize_frame_size();

-- Eksisterende annoncer. Rører kun rækker med en gammel værdi.
-- Solgte annoncer er låst af trg_prevent_sold_bike_edits, som afviser en
-- ændring af size. Her er det kun teksten der skifter, så låsen slås fra
-- under opdateringen og til igen bagefter (første kørsel 8. nov. fejlede
-- med "Solgte annoncer kan ikke redigeres").
DO $$
DECLARE has_lock boolean := EXISTS (
  SELECT 1 FROM pg_trigger
   WHERE tgname = 'trg_prevent_sold_bike_edits' AND tgrelid = 'public.bikes'::regclass);
BEGIN
  IF has_lock THEN
    ALTER TABLE public.bikes DISABLE TRIGGER trg_prevent_sold_bike_edits;
  END IF;
  UPDATE public.bikes
     SET size = normalize_frame_size(size, size_cm, type)
   WHERE size IN ('XS (44–48 cm)','S (49–52 cm)','M (53–56 cm)','L (57–60 cm)','XL (61+ cm)');
  IF has_lock THEN
    ALTER TABLE public.bikes ENABLE TRIGGER trg_prevent_sold_bike_edits;
  END IF;
END $$;

-- Gemte søgninger: oversæt hver værdi i filters->'sizes'.
UPDATE public.saved_searches s
   SET filters = jsonb_set(s.filters, '{sizes}', (
         SELECT coalesce(jsonb_agg(DISTINCT normalize_frame_size(v, NULL, NULL)), '[]'::jsonb)
           FROM jsonb_array_elements_text(s.filters->'sizes') v))
 WHERE jsonb_typeof(s.filters->'sizes') = 'array'
   AND s.filters->'sizes' ?| ARRAY['XS (44–48 cm)','S (49–52 cm)','M (53–56 cm)','L (57–60 cm)','XL (61+ cm)'];

-- ── FORTRYD (kør kun hvis skalaen skal tilbage) ─────────────────────
-- DROP TRIGGER IF EXISTS bikes_normalize_frame_size ON public.bikes;
-- DROP FUNCTION IF EXISTS bikes_normalize_frame_size();
-- ALTER TABLE public.bikes DISABLE TRIGGER trg_prevent_sold_bike_edits;
-- UPDATE public.bikes SET size = CASE size
--     WHEN 'XS (44–47 cm)' THEN 'XS (44–48 cm)' WHEN 'S (48–51 cm)' THEN 'S (49–52 cm)'
--     WHEN 'M (52–55 cm)' THEN 'M (53–56 cm)' WHEN 'L (56–58 cm)' THEN 'L (57–60 cm)'
--     WHEN 'XL (59+ cm)' THEN 'XL (61+ cm)' ELSE size END;
-- ALTER TABLE public.bikes ENABLE TRIGGER trg_prevent_sold_bike_edits;
-- DROP FUNCTION IF EXISTS normalize_frame_size(text, numeric, text);
