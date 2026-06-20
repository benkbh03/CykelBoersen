-- ============================================================
-- bikes.feed_locked — beskyt manuelle rettelser mod feed-sync
-- ============================================================
-- Auto-import kan ikke ramme 100% (fx cykeltype/specs gættet fra titel).
-- Når en forhandler retter en importeret cykel manuelt, sættes feed_locked=true.
-- Den natlige feed-sync opdaterer så KUN pris (og lagerstatus via reconcile) for
-- låste cykler — type, specs, beskrivelse og billeder bevares som rettet.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS feed_locked boolean NOT NULL DEFAULT false;
