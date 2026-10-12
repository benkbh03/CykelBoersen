-- ============================================================
-- Opgraderinger: dele sælgeren har skiftet siden købet
-- ============================================================
-- En brugt racer-, gravel- eller mountainbike er sjældent som den kom
-- fra fabrikken. Hjul, gear og sadel er skiftet, og det er dér prisen
-- kommer fra. I dag står det i en lang beskrivelse, og køberen skal selv
-- regne ud hvorfor cyklen koster det den gør.
--
-- bikes.upgrades er en liste:
--   [{"part": "Hjul", "name": "DT Swiss ERC 1400", "price": 5000}, …]
-- part og name er tekst (navn påkrævet), price er hele kroner eller null.
--
-- Reglerne håndhæves HER, ikke kun i formularen (jf. "kontrol kun i
-- frontenden" i CLAUDE.md): højst 15 rækker, korte tekster, pris 0–200.000.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- SKAL køres FØR merge: formularen sender feltet, når sælgeren har
-- tilføjet en opgradering.
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS upgrades jsonb DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.bike_upgrades_valid(u jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT u IS NULL OR (
    jsonb_typeof(u) = 'array'
    AND jsonb_array_length(u) <= 15
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(u) AS e
      WHERE jsonb_typeof(e) <> 'object'
         -- kun de tre kendte nøgler
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN ('part','name','price'))
         -- navn er påkrævet tekst, højst 80 tegn
         OR jsonb_typeof(e->'name') IS DISTINCT FROM 'string'
         OR length(btrim(e->>'name')) NOT BETWEEN 1 AND 80
         -- del er valgfri tekst, højst 40 tegn
         OR (e ? 'part' AND jsonb_typeof(e->'part') NOT IN ('string','null'))
         OR length(COALESCE(e->>'part','')) > 40
         -- pris er valgfri, hele kroner mellem 0 og 200.000
         OR (e ? 'price' AND jsonb_typeof(e->'price') NOT IN ('number','null'))
         OR (jsonb_typeof(e->'price') = 'number' AND (
               (e->>'price')::numeric <> trunc((e->>'price')::numeric)
            OR (e->>'price')::numeric NOT BETWEEN 0 AND 200000))
    )
  );
$$;

ALTER TABLE bikes DROP CONSTRAINT IF EXISTS bikes_upgrades_valid;
ALTER TABLE bikes
  ADD CONSTRAINT bikes_upgrades_valid CHECK (public.bike_upgrades_valid(upgrades));
