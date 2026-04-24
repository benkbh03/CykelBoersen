-- Server-side blokering: uverificerede forhandlere må IKKE oprette annoncer
-- Kør i Supabase SQL Editor én gang.
--
-- Hvorfor: Frontend-checks (blockIfPendingDealer) kan omgås hvis nogen åbner
-- browser-konsollen og kalder Supabase direkte. Denne RLS-policy håndhæver
-- reglen i databasen selv, så det er umuligt at oprette en annonce uden at
-- være enten privat bruger eller en VERIFICERET forhandler.
--
-- Reglen:
--   auth.uid() = user_id
--   AND (
--     profil er ikke forhandler  -- privatpersoner må altid
--     OR profil er verificeret forhandler  -- dealers skal være godkendt
--   )

-- Drop eksisterende INSERT-policy hvis navnet kolliderer (idempotent)
DROP POLICY IF EXISTS "bikes_insert_verified_only" ON bikes;

CREATE POLICY "bikes_insert_verified_only"
  ON bikes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          COALESCE(p.seller_type, 'private') <> 'dealer'
          OR p.verified = true
        )
    )
  );

-- Sørg for at RLS er aktiveret på tabellen (kan allerede være det)
ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;
