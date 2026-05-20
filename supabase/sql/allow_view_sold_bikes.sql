-- ============================================================
-- Tillad visning af solgte (inaktive) annoncer
-- ============================================================
-- Problem: når en bike sælges (is_active=false) kunne ikke-ejere ikke
-- længere åbne dens detalje-side ("Kunne ikke hente annonce") fordi en
-- RLS-policy kun tillod SELECT af aktive bikes for andre end ejeren.
--
-- Køberen skal stadig kunne se HVILKEN annonce de har købt, og solgte
-- annoncer bør forblive synlige (SEO + historik) — som DBA gør med en
-- "SOLGT"-overlay.
--
-- Løsning: tilføj en permissiv SELECT-policy der tillader alle at læse
-- alle bikes. RLS-policies for samme kommando OR'es sammen, så denne
-- åbner SELECT uanset eksisterende restriktioner. Det bryder IKKE
-- forsiden — loadBikes() filtrerer stadig is_active=true i selve queryen;
-- RLS styrer kun hvad der KAN læses, ikke hvad der VISES.
--
-- Bemærk: bikes-tabellen indeholder kun offentlig annonce-data (mærke,
-- model, pris osv.) — ingen følsomme felter. Sikkert at gøre læsbart.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

DROP POLICY IF EXISTS "bikes_public_select_all" ON bikes;
CREATE POLICY "bikes_public_select_all"
  ON bikes FOR SELECT
  USING (true);

-- Lad også prishistorik være synlig for solgte bikes (tidligere kun
-- aktive). Konsistent med at solgte annoncer nu kan ses.
DROP POLICY IF EXISTS "Anyone can read history for active bikes" ON bike_price_history;
DROP POLICY IF EXISTS "Anyone can read price history" ON bike_price_history;
CREATE POLICY "Anyone can read price history"
  ON bike_price_history FOR SELECT
  USING (true);
