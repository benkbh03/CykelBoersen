-- Forhandler-fordele opt-in: forhandlere kan vælge hvad de tilbyder
-- Vises i bike-modal under "Køb hos forhandler"-banneret

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS offers_financing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_tradein   boolean NOT NULL DEFAULT false;
