-- ============================================================
-- Tilføj avatar_thumb_url til profiles (small avatar thumbnails)
-- ============================================================
-- Avatars vises i bike-grid (40×40) og top-nav (36×36) på hver
-- sidevisning. Uden Image Transformations (kræver Supabase Pro)
-- serveredes fuld upload-opløsning (~300 KB) hver gang.
--
-- Vi gemmer nu en lille 128px WebP-thumbnail (~10 KB) ved upload
-- og foretrækker den i kort-visninger. Profil-modals fortsætter
-- med fuld URL.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_thumb_url text;
