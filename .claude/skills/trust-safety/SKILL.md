---
name: trust-safety
description: Gennemgang af misbrugsmønstre på markedspladsen. Køres bevidst og sjældent, ikke automatisk.
---

# Misbrug af markedspladsen

Det her er en tænkeøvelse, ikke en kodegennemgang. Den handler om hvad et menneske kan finde på, og hvad der reelt står i vejen for dem.

**Hold dig fra det `rls-og-autorisation` dækker.** Kontoovertagelse, rate limiting og adgangskontrol hører til dér, hvis de har en teknisk grænse. Her handler det om mønstrene og processen.

For hvert mønster nedenfor: **hvad forhindrer det i dag, konkret og med henvisning til kode eller politik — og hvad er den billigste forbedring?** Ingen ML-forslag før der er simple regler på plads. Et opslag i en liste slår en model, når man har tyve brugere.

## Udgangspunktet, så du ikke leder efter noget der ikke findes

Dette er tilstanden pr. september 2026. Bekræft den frem for at antage den; har den ændret sig, er selve denne liste et fund.

- **Ingen betaling går gennem platformen.** Der er ingen escrow, ingen forudbetaling, intet gebyr. Stripe-funktionerne ligger i repoet, men er dormante. Alle penge skifter hænder uden for sitet, hvilket fjerner en hel klasse af svindel og gør en anden klasse usynlig for os.
- **Al kommunikation går gennem beskedsystemet.** Der vises ingen telefonnumre for private sælgere (`remove_private_phone.sql`); forhandlernes nummer er offentlig virksomhedsinfo. Samtalen kan altså i udgangspunktet modereres — hvis nogen læser den.
- **Verifikation:** e-mail, plus manuel admin-godkendelse af forhandlere med CVR-opslag (`verify-cvr`). Ingen MitID. `id-documents`-bucket'en findes, men flowet er ikke i brug.
- **Anmeldelse af en annonce:** 🚩-knappen sender en `report_listing`-mail til admin (`js/bike-detail.js`). Den lander i en indbakke, ikke i et system.
- **Stelnummer:** `check-frame-number` gemmer bevidst kun de sidste fire cifre. Det fulde nummer forlader aldrig funktionen, fordi et offentligt fuldt stelnummer kan bruges til at hvidvaske en stjålet cykel.
- **Moderationsværktøjer:** `admin-actions` kan `approve_dealer`, `reject_dealer`, `revoke_dealer`, `approve_id`, `reject_id` og `delete_user`. **Der er ingen suspendering.** Den eneste vej til at stoppe en bruger er permanent sletning.
- **Ingen dubletdetektion på billeder.** Intet perceptual hashing, ingen omvendt billedsøgning.
- **Ingen moderationslog.** Der findes intet sted der registrerer hvad der blev besluttet hvornår og hvorfor.

## Mønstrene

Gå dem igennem én ad gangen. Vær konkret om hvad der sker, ikke om hvad der kunne ske i teorien.

**Falsk sælger.** Annonce på en dyr cykel, køber overtales til at forudbetale via MobilePay, sælger forsvinder. Hvad ser køberen inden? Hvad ville få dem til at tøve?

**Falsk køber.** "Jeg sender en fragtmand, her er et betalingslink" — et link der ligner MobilePay eller banken. Bemærk at dette angreb altid starter med at få samtalen væk fra platformen. Hvad gør vi ved netop det øjeblik?

**Overbetalingssvindel.** Køber "overfører for meget" og beder om at få forskellen retur.

**Selvhandel.** To konti der giver hinanden gode anmeldelser. Bemærk: `require_trade_before_review` kræver nu at der findes en accepteret-besked mellem parterne, men en angriber kan selv sende sådan en besked. Hvor meget er den spærring reelt værd?

**Fupforhandler.** Opretter et rigtigt CVR, bliver godkendt, tager forudbetalinger, lukker. Hvad ville have fanget det, og hvornår?

**Stjålne cykler — kernerisikoen i denne branche.**
- Kan en bestjålet ejer overhovedet anmelde en annonce, og hvor lander det?
- Kan du dokumentere hvad du vidste hvornår, hvis politiet spørger om tre måneder?
- Hvad er din politik, første gang de henvender sig? Er den skrevet ned?
- Er stelnummer frivilligt eller obligatorisk, og hvad er argumenterne hver vej?

**Genbrugte billeder.** Samme foto på flere annoncer, typisk taget fra en anden annonce eller fra en forhandlers webshop. Hvad ville den simpleste regel være — ikke den bedste?

**En bruger du vil stoppe.** Der er ingen suspendering. Hvad gør du med en konto du er i tvivl om? Sletter du permanent på mistanke, eller lader du den stå? Hvad sker der med deres aktive annoncer og igangværende samtaler i hvert af de to tilfælde?

**Én person, mange konti.** Hvad koster det at oprette den anden konto? Hvad ville gøre det dyrere uden at gøre den første konto dyrere?

## Skriv svarene ned

Det er hele pointen med øvelsen. En politik der ikke er skrevet ned, findes ikke den dag den skal bruges, og det er altid en dag hvor der er travlt.

Rapportér i formatet:

`[KRITISK|HØJ|MEDIUM|LAV] Mønster — Hvad der står i vejen i dag — Hvad der mangler — Billigste forbedring`

Skeln mellem **(a) håndteret, med bevis**, **(b) ikke håndteret**, og **(c) kunne ikke afgøres**.

Slut med de tre mønstre der er mest sandsynlige at ramme først ved den nuværende størrelse, og hvad der bør gøres ved dem i denne uge.

Svar på dansk.
