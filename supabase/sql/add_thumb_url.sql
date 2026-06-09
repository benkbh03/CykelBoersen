-- ============================================================
-- Tilføj thumb_url til bike_images ("DIY thumbnails")
-- ============================================================
-- Hvert annonce-billede får nu en valgfri 800px-thumbnail-URL.
-- Kort-visninger (forside-grid, profil, kort, cykelagent-match) serverer
-- thumb_url når den findes (~3× mindre data), og falder tilbage til den
-- fulde url når den mangler (eksisterende billeder = ingen regression).
-- Annonce-detalje + lightbox bruger fortsat fuld størrelse.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

ALTER TABLE bike_images
  ADD COLUMN IF NOT EXISTS thumb_url text;
