-- ============================================================
-- bikes.deleted_at: blød sletning i stedet for hård
-- ============================================================
-- "Slet annonce" i Mine annoncer kørte en rigtig DELETE. Rækken forsvandt,
-- og med den det eneste signal der afgør om markedspladsen virker: blev
-- cyklen solgt, eller gav sælgeren op? De to kræver stik modsatte
-- handlinger — sælges der, mangler du udbud; gives der op, mangler du
-- købere — og de kunne ikke skelnes fra hinanden bagefter.
--
-- Sletningen tog desuden mere med sig end annoncen. Fremmednøglerne på
-- bike_id står som ON DELETE CASCADE for prishistorik, visninger og
-- prisfaldsvagter, så de blev slettet med i faldet.
--
-- Efter denne migration findes tre tilstande der kan skelnes:
--   sold_via sat                      -> solgt (via platform eller eksternt)
--   deleted_at sat, sold_via NULL     -> brugeren fjernede den uden salg
--   hverken/eller, men is_active=false-> skjult/deaktiveret (feed, admin)
--
-- Retten til sletning er urørt: sletter en bruger hele sin konto, sletter
-- edge-functionen delete-account fortsat alt fysisk. Det her gælder kun den
-- enkelte annonce-knap.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Partielt index: langt de fleste rækker er NULL, og både brugerens egen
-- liste og admin-opgørelsen spørger kun efter den ene eller den anden side.
CREATE INDEX IF NOT EXISTS idx_bikes_deleted_at
  ON bikes(deleted_at DESC) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN bikes.deleted_at IS
  'Sat når brugeren selv fjerner annoncen via "Slet". Rækken bliver stående '
  'så udfaldet kan opgøres. sold_via afgør om det var et salg. NULL på '
  'annoncer der blot er deaktiveret (feed-oprydning, admin).';

-- ── Kontrol ──────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE deleted_at IS NOT NULL AND sold_via IS NOT NULL) AS fjernet_som_solgt,
       count(*) FILTER (WHERE deleted_at IS NOT NULL AND sold_via IS NULL)     AS fjernet_uden_salg,
       count(*) FILTER (WHERE deleted_at IS NULL AND is_active = false)        AS blot_deaktiveret,
       count(*) FILTER (WHERE is_active)                                       AS aktive
  FROM bikes;
