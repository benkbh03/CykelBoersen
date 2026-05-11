-- Tilføjer external_url-felt på bikes-tabellen
-- Bruges af forhandlere til at linke til samme cykel på deres egen webshop.
-- Når feltet er udfyldt, vises 'Gå til varen'-knap på detail-siden, og
-- bud-knappen skjules (købere skal handle direkte på forhandlerens side).

ALTER TABLE bikes ADD COLUMN IF NOT EXISTS external_url TEXT;
