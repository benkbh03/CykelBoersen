-- ============================================================
-- last_edited_at: "sælger har rettet i annoncen" — adskilt fra updated_at
--
-- Annoncesiden viste "Sidst redigeret", afledt af updated_at. Men updated_at
-- betyder "rækken blev rørt", ikke "indholdet blev ændret", og mindst tre
-- automatiske processer rører rækken uden at nogen har redigeret noget:
--
--   1. increment_bike_views() kører UPDATE bikes SET views = views + 1 ved
--      hver visning (dedupliceret pr. person pr. døgn). Hver visning bumpede
--      derfor "Sidst redigeret".
--   2. Den natlige feed-synkronisering kalder .update() på hver eksisterende
--      annonce uanset om noget er ændret.
--   3. Friskheds-nudgens "Aktuel"-knap sætter updated_at eksplicit netop for
--      at nulstille friskheds-uret — helt uden indholdsændring.
--
-- Resultatet var et tillidssignal der lød som "sælger er aktiv lige nu", men
-- reelt betød "nogen kiggede på annoncen". last_edited_at sættes KUN af
-- rediger-formularen, så etiketten kommer til at betyde det den siger.
--
-- Med vilje uden default og uden backfill: eksisterende annoncer får NULL, og
-- frontenden skjuler etiketten når den er NULL. At bagudfylde fra updated_at
-- ville netop videreføre de forkerte tidsstempler vi prøver at komme af med.
--
-- Idempotent — sikker at køre igen.
-- ============================================================

ALTER TABLE bikes ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

COMMENT ON COLUMN bikes.last_edited_at IS
  'Sidste gang sælger (eller admin på sælgers vegne) rettede annoncens indhold. '
  'Sættes kun af rediger-flowet. Brug IKKE updated_at til dette — den bumpes '
  'også af visningstælleren, feed-sync og friskheds-nudgen.';

-- Sorterings-/filtreringsindeks. Delvist: kun rækker hvor feltet er sat, så
-- indekset ikke fyldes med NULL fra alle eksisterende annoncer.
CREATE INDEX IF NOT EXISTS idx_bikes_last_edited_at
  ON bikes (last_edited_at DESC)
  WHERE last_edited_at IS NOT NULL;
