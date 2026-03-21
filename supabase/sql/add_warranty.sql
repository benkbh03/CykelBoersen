-- Tilføj warranty kolonne til bikes tabellen
ALTER TABLE public.bikes ADD COLUMN IF NOT EXISTS warranty text DEFAULT NULL;
