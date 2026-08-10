-- ============================================================
-- Ryd de sidste spor af BikeIndex-opslaget
--
-- check-frame-number slog tidligere oplyste stelnumre op mod det amerikanske
-- tyveriregister BikeIndex. Opslaget er fjernet fra edge-functionen: danske
-- cykeltyverier registreres hos politiet og står stort set aldrig i BikeIndex,
-- så et "ingen match" var nær-intetsigende (falsk tryghed), og et match var
-- fuzzy — Levenshtein under 3 tegn, altså kun et MULIGT match. Signalet var
-- for svagt til at retfærdiggøre at sende danske sælgeres stelnumre til USA.
--
-- Funktionen sender ikke længere noget udenlands, men gamle rækker bærer
-- stadig resultatet af opslag der ER foretaget. Denne migration rydder dem:
--
--   1. frame_check_ref indeholder links til bikeindex.org. Der er ikke længere
--      et eksternt register at henvise køberen til, og linket er det sidste
--      sted en BikeIndex-reference kan nå ud på en annonce.
--   2. frame_check_status 'clear' / 'match' / 'error' beskriver alle udfaldet
--      af et opslag vi ikke laver mere. De erstattes af 'stored', som betyder
--      det eneste vi nu kan stå inde for: sælger har oplyst et nummer.
--      Det er vigtigt for 'match': den status gør at annoncen ikke får sit
--      stelnummer-tag, og en gammel omtrentlig træffer i et amerikansk
--      register skal ikke blive ved med at koste en dansk sælger tillid.
--
-- frame_last4 og frame_check_at RØRES IKKE. De sidste 4 cifre er stadig det
-- annoncen viser, og tidsstemplet er stadig "hvornår oplyste sælger nummeret".
--
-- Kolonnerne beholdes (ingen DROP COLUMN): frame_check_status bruges fortsat,
-- og frame_check_ref er billig at lade stå tom frem for en irreversibel
-- skemaændring.
--
-- Idempotent — sikker at køre igen.
-- ============================================================

UPDATE bikes
   SET frame_check_ref = NULL
 WHERE frame_check_ref IS NOT NULL;

UPDATE bikes
   SET frame_check_status = 'stored'
 WHERE frame_check_status IN ('clear', 'match', 'error');

COMMENT ON COLUMN bikes.frame_check_status IS
  'Altid ''stored'' = sælger har oplyst et stelnummer. Det er IKKE en '
  'verifikation — vi kan ikke afgøre om et nummer er ægte. Værdierne '
  '''clear''/''match''/''error'' er legacy fra BikeIndex-opslaget, som er fjernet.';

COMMENT ON COLUMN bikes.frame_check_ref IS
  'Ubrugt. Indeholdt links til BikeIndex indtil opslaget blev fjernet.';
