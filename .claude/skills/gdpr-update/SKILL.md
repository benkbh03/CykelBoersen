---
name: gdpr-update
description: Identificér når en ny CykelBørsen-feature samler persondata, og foreslå konkrete opdateringer til privatlivspolitik, vilkår og/eller cookiepolitik i js/static-pages-content.js. Brug AUTOMATISK når kode-ændringer tilføjer en ny supabase-tabel, en ny localStorage/sessionStorage-nøgle, en ny edge function-payload-type, et nyt eksternt API-kald, eller en ny user-input-form. Brug ikke til kosmetiske CSS-ændringer eller refactoring der ikke ændrer dataflowet.
---

# GDPR-update (CykelBørsen)

## Formål
Hver gang vi tilføjer en feature der rører persondata, skal de juridiske dokumenter holdes opdaterede — ellers bryder vi GDPR art. 13 (oplysningspligt). Det er nemt at glemme. Denne skill kører automatisk når koden indikerer ny data-indsamling.

## Hvornår skal jeg trigge

Aktivér automatisk ved:
- Ny tabel i `supabase/sql/*.sql` der har en `user_id`-kolonne
- Ny `localStorage.setItem(...)` eller `sessionStorage.setItem(...)` med ny key
- Ny `supabase.from('...').insert(...)` med en payload jeg ikke har set før
- Ny edge function payload-type i `supabase/functions/notify-message/`
- Nyt eksternt API-kald (fetch til andet domæne end Supabase/DAWA)
- Ny form i HTML der samler bruger-input
- Ny `dataLayer.push()` (HubSpot/GA4 tracking event)

## Procedure

### 1. Identificér data-typen og formålet

For hver ny data-indsamling, besvar:
- **Hvilken kategori?** (kontaktdata, adfærdsdata, betalingsdata, kommunikationsdata)
- **Hvor opbevares det?** (Supabase DB, localStorage, sessionStorage, edge function logs)
- **Hvor længe opbevares det?** (session, X dage, indtil sletning)
- **Hvilket retsgrundlag?** GDPR art. 6(1):
  - (a) samtykke (fx newsletter)
  - (b) kontraktopfyldelse (fx kontodata)
  - (f) legitim interesse (fx notifikationer)
- **Deles det med tredjepart?** (Stripe, Resend, Anthropic, Google osv.)

### 2. Find relevante steder i juridiske docs

I `js/static-pages-content.js`:
- `privacy.body` § 2 (Hvilke personoplysninger indsamler vi?)
- `privacy.body` § 3 (Formål og retsgrundlag — tabel)
- `privacy.body` § 4 (Databehandlere og tredjeparter)
- `privacy.body` § 6 (Opbevaringsperiode)
- `cookies.body` (Cookies-tabel — for localStorage/sessionStorage)
- `terms.body` § 2 (Brugeroprettelse) eller § 5 (Forhandlerkonto) — kun hvis det rører brugerens forpligtelser

### 3. Foreslå konkret tekst

For hver dokument der skal opdateres, generér en patch som:

```diff
- <li><strong>Tekniske data:</strong> IP-adresse, browsertype, besøgstidspunkt</li>
+ <li><strong>Tekniske data:</strong> IP-adresse, browsertype, besøgstidspunkt</li>
+ <li><strong>[Ny kategori]:</strong> [Beskrivelse af hvad der indsamles, formål, hvor det opbevares]</li>
```

### 4. Bump datoer

Hvis dokumenter ændres, opdatér `Senest opdateret: <dato>` til dagens dato (formatet: `13. maj 2026`).

## CykelBørsen-specifikke huskeregler

### LocalStorage-nøgler i drift (skal være listed i cookies.body)
- `cb_cookie_consent` — cookie-samtykke
- `cb_recently_viewed` — sidst sete annoncer (30 dage)
- `cb_compare_ids` (sessionStorage) — sammenlignings-valg
- `cb_scam_warning_ack` — anti-scam-modal bekræftet
- `ss_checked_<userId>` — gemt-søgning-notifikation-cursor
- `dealer_signup_source` (sessionStorage) — UTM-tracking
- Supabase auth: `sb-<projectref>-auth-token`

Hvis JEG tilføjer en NY localStorage-nøgle, SKAL den listes i cookies-tabellen med navn, formål, og levetid.

### Edge function notify-message types (privacy § 4 nævner Resend)
Eksisterende: `message_id`, `bid_accepted`, `listing_liked`, `report_listing`, `id_approved`, `id_rejected`, `contact_form`, `price_drop`. Nye types → udvider Resend-emails → behøver normalt ikke ny privacy-tekst hvis de bruger eksisterende email-adresse og formål, MEN tjek alligevel.

### Tredjeparter (privacy § 4)
- **Supabase** (USA) — autentificering, DB, storage
- **Resend** (USA) — transaktionelle emails
- **Stripe** (USA) — DORMANT, men nævnes for fremtid
- **Anthropic** (USA) — AI-chat
- **GitHub Pages** (USA) — hosting (ingen persondata)
- **DAWA** (Danmark) — adresse-geokoding

Hvis ny feature tilføjer en NY tredjepart, SKAL den tilføjes til § 4 med navn, formål, link til deres privacy policy, og databehandler-aftale-grundlag.

### Retsgrundlag-tabel (privacy § 3)
Nye formål skal mappes til art. 6(1):
- Konto-relateret = art. 6(1)(b) kontraktopfyldelse
- Newsletter / marketing = art. 6(1)(a) samtykke
- Notifikationer brugeren har "opt-in'et" til = art. 6(1)(a) samtykke
- Beskedsystem brug = art. 6(1)(b) kontraktopfyldelse
- Misbrug-detection = art. 6(1)(f) legitim interesse

## Output-format

Når jeg detekterer ny dataindsamling, generér:

```markdown
## GDPR-impact af <feature>

### Hvad indsamles
- [Liste af data-felter + formål]

### Påkrævede dokument-opdateringer

#### Privacy § 2 (Hvilke personoplysninger)
```diff
+ <li><strong>[Ny kategori]:</strong> ...</li>
```

#### Privacy § 3 (Retsgrundlag)
| Formål | Retsgrundlag |
|---|---|
| ... | art. 6(1)(...) |

#### Cookies-tabel (hvis ny localStorage-key)
| Navn | Formål | Levetid |
|---|---|---|
| ... | ... | ... |

#### Tredjepart (hvis relevant)
- [Ny tredjepart] (land) — formål, link til privacy

### Datoer at bump
- privacy: 8. maj 2026 → 13. maj 2026
- cookies: 5. maj 2026 → 13. maj 2026 (hvis cookies-tabel ændret)
```

Tilbyd derefter at lave Edit-operationerne automatisk.

## VIGTIGT

- ❌ Tilføj aldrig nye tredjeparter til § 4 uden at bruger har bekræftet at de faktisk vil bruge den service
- ❌ Slet aldrig eksisterende GDPR-tekst — kun udvid eller justér
- ❌ "Senest opdateret"-datoer skal ALTID matche dagens dato hvis ENDDA en linje er ændret
- ✅ Hvis i tvivl om retsgrundlag — defaultér til samtykke (a) over legitim interesse (f), det er strengere men sikrere
