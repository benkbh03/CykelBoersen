-- Location fields for DAWA-based precision control
-- Forhandlere: præcis adresse med koordinater (location_precision = 'exact')
-- Private brugere: kun bycentrum (location_precision = 'city', address kan være null)
-- Kør i Supabase SQL Editor én gang

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lat                DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lng                DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postcode           TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_precision TEXT;

-- Valgfrit: index til geografiske queries / sortering på afstand
CREATE INDEX IF NOT EXISTS idx_profiles_latlng ON profiles (lat, lng) WHERE lat IS NOT NULL;

COMMENT ON COLUMN profiles.lat                IS 'Breddegrad fra DAWA — præcis for dealers, bycentrum for private';
COMMENT ON COLUMN profiles.lng                IS 'Længdegrad fra DAWA';
COMMENT ON COLUMN profiles.postcode           IS 'Postnummer fra DAWA (kun dealers)';
COMMENT ON COLUMN profiles.location_precision IS '"exact" for dealers med præcis adresse, "city" for private';
