# CykelBørsen

Danmarks dedikerede markedsplads for køb og salg af brugte cykler. Single-page vanilla JS app hostet via GitHub Pages, med Supabase som backend, Resend til e-mail og Anthropic Claude Haiku som support-bot.

> **Bemærk om forhandler-betaling**: Forhandlerregistrering er **gratis lige nu** (lancering / ramp-up-fase) — målet er at få et kritisk antal forhandlere ind først. Stripe-edge-functions (`create-checkout-session`, `create-portal-session`, `stripe-webhook`) ligger klar i `supabase/functions/` til når betalt model genaktiveres, men kaldes ikke fra `/bliv-forhandler`-flowet pt. Formularen opretter direkte en `seller_type='dealer'`-profil der venter på admin-godkendelse (manuel `verified=true`).

## Projektstruktur

```
CykelBoersen/
├── index.html          # Al HTML og modal-markup (~1175 linjer)
├── main.js             # Al applogik (~7600+ linjer vanilla JS)
├── style.css           # Al styling (~3600 linjer)
├── CNAME               # GitHub Pages domæne (xn--cykelbrsen-5cb.dk)
├── _redirects          # SPA routing: /* → /index.html 200
├── robots.txt          # Tillader alle crawlers + sitemap-link
├── sitemap.xml         # 6 URLs (homepage, om, vilkår, privacy, kontakt, bliv-forhandler)
├── hero.jpg.png        # Hero-billede
├── .claude/
│   └── skills/
│       └── idle-modal-debug/   # Skill: debug modals der hænger efter idle/auth-events
└── supabase/
    └── functions/
        ├── notify-message/         # E-mail notifikationer (Resend)
        ├── notify-saved-searches/  # Match nye annoncer mod gemte søgninger
        ├── delete-account/         # Cascading sletning af konto + alle data
        ├── create-checkout-session/ # Stripe subscription checkout (DORMANT — forhandler er gratis pt.)
        ├── create-portal-session/  # Stripe billing portal (DORMANT)
        ├── stripe-webhook/         # Stripe events → dealer status sync (DORMANT)
        └── chat-support/           # Claude Haiku-baseret support-bot
```

## Git

- Repository: `benkbh03/CykelBoersen` på GitHub
- Hovedgren til deploy: læs aktuel branch fra `git branch --show-current`
- Push altid til den aktuelle arbejdsgren: `git push -u origin <branch>`

## Brugerens arbejdsmiljø — VIGTIGT

Brugeren bruger **IKKE terminal/kommandolinje**. Giv altid GUI-baserede instruktioner:

- **Git-operationer** (merge, PR, push): Vis trin via **github.com**-web-UI'et, ikke `git`-kommandoer.
  Eksempel: "Gå til github.com/benkbh03/CykelBoersen → klik 'Compare & pull request' → 'Merge'."
- **SQL-migrationer**: Sig "kopier indholdet af `<fil>.sql` ind i Supabase Dashboard → SQL Editor → Run", ikke `supabase db push`.
- **Edge function-deploy**: Sig "Supabase Dashboard → Edge Functions → opret/rediger → indsæt kode → Deploy", ikke `supabase functions deploy`.
- **DNS**: Cloudflare Dashboard, ikke `dig`/`nslookup`.
- **Supabase secrets**: Dashboard → Project Settings → Edge Functions → Secrets.

Hvis et problem virkelig kræver terminal, sig det eksplicit og foreslå en GUI-vej hvis muligt.

## Kodestil og filstruktur

Når ny funktionalitet tilføjes: **opret en ny fil** i `js/` frem for at udvide eksisterende filer. Filer bør holdes under ~400 linjer. Eksportér funktioner og importér dem i `main.js` (eller den relevante modul). Husk at eksportere nye `onclick`-handlere til `window` i `main.js`.

## Teknologier

- **Frontend**: Vanilla JS (ES modules via CDN), HTML, CSS — ingen frameworks
- **Kort**: Leaflet 1.9.4 (via CDN) til kort-visning af annoncer
- **Backend**: Supabase (auth, Postgres, Realtime, Edge Functions, Storage)
- **Betaling**: Stripe (subscription checkout + billing portal + webhooks)
- **E-mail**: Resend SMTP via Supabase Edge Functions
- **Support-bot**: Anthropic Claude Haiku via `chat-support` edge function
- **Hosting**: GitHub Pages (custom domain)

## Arkitektur og mønstre

### Modaler (id'er fra `index.html`)
- `user-profile-modal`, `dealer-profile-modal`, `all-dealers-modal` — profil-visninger
- `modal` — opret annonce (legacy), `edit-modal` — rediger annonce
- `login-modal`, `reset-modal` — auth
- `profile-modal` — mine indstillinger
- `bike-modal`, `map-bike-modal` — annonce-detaljer
- `inbox-modal` — indbakke med tråde
- `share-modal`, `report-modal` — deling og rapportering
- `admin-modal` — admin-panel
- `listing-success-modal` — bekræftelse efter oprettelse
- `rate-now-modal` — vurdering efter handel
- `delete-account-modal` — kontosletning

Z-index hierarki (stigende prioritet):
- `.modal-overlay` base: 1500
- `#user-profile-modal`, `#dealer-profile-modal`: 2000
- `#bike-modal`, `#map-bike-modal`: 2500
- `#login-modal`, `#share-modal`, `#report-modal`: 3000
- `#buyer-picker-modal`: 5000
- `.toast`: 10000

De fleste modaler bruger `style.display = 'flex'` / `'none'`. `bike-modal`, `map-bike-modal`, `admin-modal`, `edit-modal`, `modal`, `profile-modal`, `login-modal`, `inbox-modal`, `share-modal` bruger `classList.add/remove('open')`. `document.body.style.overflow = 'hidden'` ved åbning, `''` ved lukning. Global `Escape`-lytter lukker den øverste åbne modal.

### Routing (pathname-baseret)
- `navigateTo(path)` → `history.pushState`, derefter `handleRoute()`
- `handleRoute()` læser `location.pathname` og ruter til `renderBikePage`, `renderUserProfilePage`, `renderDealerProfilePage`, `renderMyProfilePage`, `renderSellPage`, `renderBecomeDealerPage`, `renderDealersPage` m.fl.
- Backward-compat: gamle hash-URLs `#/bike/123` konverteres til `/bike/123`
- `?bike=ID` i query → auto-åbner bike-modal
- `?inbox=true` → auto-åbner indbakke
- Supabase hash params: `type=signup` (bekræft email) og `type=recovery` (reset password)
- Stripe returnerer `?dealer_success=true` eller `?dealer_cancel=true`

### Top-navigation (simplificeret)
- Nav-links: **Forhandlere** (→ `/forhandlere`) + **+ Sæt til salg** + inbox + avatar
- `Annoncer`- og `Om os`-links er fjernet: forsiden viser annoncer direkte, Om os ligger i footer
- `/forhandlere` er en dedikeret side (`renderDealersPage()`) med GPS-afstand, rating og sort

### Forhandler-side (`/forhandlere`)
- `renderDealersPage()` henter forhandlere + bikes + reviews parallelt
- State i `_dealersPageData` = `[{ dealer, bikeCount, avgRating, ratingCount, distKm }]`
- `toggleDealerGPS()` — henter brugerens position, geokoder alle forhandlere (præcis adresse via `geocodeAddress`, by-fallback via `geocodeCity`), auto-skifter sortering til "Tættest"
- `sortAndRenderDealers()` — sort options: Flest cykler | Tættest | Bedste rating
- `buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm)` — kort med distance-badge, stjerner og Google Maps-chip
- Kortene har en forest→rust gradient-stribe i toppen

### XSS-sikkerhed
Brug ALTID `esc()` til al bruger-genereret tekst før den sættes i HTML:
```js
${esc(b.description)}          // Beskrivelser
${esc(msg.content)}            // Beskeder
${esc(r.comment)}              // Anmeldelser
esc(query)                     // Søge-input i autocomplete
```
For beskrivelser med linjeskift: `esc(b.description).replace(/\n/g, '<br>')`.
Avatar-URLs valideres via `safeAvatarUrl(url)` — tillader kun `https:`.

### Hjælpere
```js
esc(str)                          // Escaper HTML — forhindrer XSS
safeAvatarUrl(url)                // Validér avatar-URL (kun https)
retryHTML(msg, fnName)            // Fejl-HTML med "Prøv igen"-knap
debounce(fn, ms)                  // Debounce funktion
showToast(msg)                    // Toast-notifikation (z-index: 10000, 3.5s)
btnLoading(id, label)             // Deaktivér knap + spinner; returnér gendan-fn
trapFocus(modalEl)                // Focus trap for Tab-navigation
enableFocusTrap / disableFocusTrap(modalId)
formatLastSeen(dateStr)           // "Aktiv for 5 min. siden"
haversineKm([lat,lon],[lat,lon])  // Afstand mellem to koordinater
renderMessages(messages, isSeller, bikeActive, isInbox)  // Fælles besked-renderer
updateSEOMeta(description, canonicalPath)   // Opdatér meta-tags ved routing
```

### Beskeder og handel
- `sendReply(isInbox)` — ét unified svar-funktion for begge indbakker
- `acceptBid(content, isInbox)` — ét unified bud-accept for begge kontekster
- `renderMessages(data, isSeller, bikeActive, isInbox)` — fælles besked-renderer
- State: `activeThread` (bike-modal kontekst) og `activeInboxThread` (indbakke-modal kontekst)
- Realtime: `startRealtimeNotifications()` subscriber til `messages INSERT` via `supabase.channel('new-messages-<userId>')` og viser toast + badge-update

### Vurderingssystem
- Brugere kan kun vurdere hinanden efter en reel handel
- `hasTraded` tjekker for beskeder der indeholder "accepteret"
- Tre veje til handel: accepter bud → automatisk, "Sæt solgt" → buyer-picker modal, manuel markering
- Efter handel åbnes købers profil automatisk med vurderingsformular i fokus (`openUserProfileWithReview`)

### Sælgertype-kontrol
- Privatpersoner kan IKKE skifte til forhandler via profil-dropdown
- Forhandleroprettelse sker KUN via "Bliv forhandler"-flowet (`/bliv-forhandler`)
- `saveProfile()` låser `seller_type` til nuværende værdi
- **Lige nu (gratis-fase)**: `submitDealerApplication()` opretter `seller_type='dealer'` med `verified=false`. Admin godkender manuelt via admin-panelet (sætter `verified=true`).
- **Når Stripe-modellen genaktiveres**: redirect til `create-checkout-session` efter formular-submit, og `stripe-webhook` sætter `verified=true` ved vellykket `checkout.session.completed`. Stripe-functions er stadig i `supabase/functions/` — klar til reaktivering.

### Sporing af forhandler-leads
- `/bliv-forhandler` capturer `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` + `document.referrer` ved sidevisning og gemmer i `sessionStorage` under nøglen `dealer_signup_source`.
- UTMs sendes med i `notify-message`-payload som `source`-objekt → admin-emailen viser kilde + kampagne for hver ny forhandleransøgning.
- `window.dataLayer.push({ event: 'view_become_dealer' | 'submit_dealer_application', ...source })` så HubSpot/GA4-tracking automatisk plukker events op når en tracking-snippet senere tilføjes til `index.html`.
- Brug fx `?utm_source=hubspot&utm_campaign=dealer_invite_v1` på links i mail-kampagner for at kunne se konvertering pr. kanal.

### Fejl-HTML med "Prøv igen"-knap
```js
list.innerHTML = retryHTML('Kunne ikke hente X.', 'loadX');
```

### Notifikationer (fire-and-forget)
```js
supabase.functions.invoke('notify-message', {
  body: { type: 'TYPE', ...payload },
}).catch(() => {});
```
`notify-message`-typer: `'message_id'`, `'bid_accepted'`, `'listing_liked'`, `'report_listing'`, `'id_approved'`, `'id_rejected'`, `'contact_form'`.
`notify-saved-searches` kaldes ved ny/re-aktiveret annonce — matcher mod `saved_searches` og sender e-mail til hver matchende bruger (max 1 pr. 24h pr. søgning).

### Globale variabler (øverst i `main.js`)
- `currentUser` — Supabase auth user
- `currentProfile` — Profil fra `profiles`-tabellen
- `_userSavedSet` — Set af brugerens gemte bike-ID'er (opdateres ved `loadBikes`/`toggleSave`)
- `bikeCache` — `Map` til in-memory bike-data (forhindrer dobbelt-fetch ved tilbage-navigation)
- `_bikeModalToken`, `_userProfileToken`, `_dealerProfileToken` — stale-request guards: hver modal-open inkrementerer sit token, async responses tjekker at token stadig matcher før render
- `activeThread` / `activeInboxThread` — aktiv beskedtråd-kontekst
- `bikesOffset`, `filterOffset`, `currentFilters`, `currentFilterArgs` — paginering og aktuelt filter-state
- `userGeoCoords`, `activeRadius` — GPS-position og "nær mig"-radius
- `_dealersPageData`, `_dealerGPSActive`, `_dealerGPSCoords` — state for `/forhandlere`-siden
- `selectedFiles`, `editNewFiles`, `editExistingImgs` — upload-state for create/edit modaler
- `chatHistory`, `chatOpen` — support-chat widget state
- `askedAvailableSet` — bikes hvor bruger allerede har spurgt "er den stadig til salg?"
- Modale kontekst-vars: `_reportBikeId`, `_reportBikeTitle`, `currentShareBikeId`, `_ratingModalUserId`
- `_realtimeChannel` — aktuel Supabase realtime-kanal
- `_focusTrapCleanup` — Map<modalId, cleanupFn>

### Window-eksporter
Alle funktioner der kaldes fra HTML `onclick` skal eksporteres nederst i `main.js`:
```js
window.functionName = functionName;
```
Eksporter er samlet i blokke omkring linje 4184, 5433-5537, 5829-5838 og 6350-6351. Glem ikke at tilføje nye window-eksporter når du introducerer nye `onclick`-handlere.

## Performance-mønstre

### Session og data-refresh
- `visibilitychange` listener refresher session + `loadBikes()` når tab aktiveres (500ms debounce)
- Refresh-guards: `REFRESH_THROTTLE_MS = 5000`, `_refreshInProgress` concurrent-guard, `_isAnyModalOpen()` skip-guard
- `onAuthStateChange` bruger `_hasHadSession`-flag: token-refresh pseudo-`SIGNED_IN` opdaterer KUN `currentUser` — ingen sideeffekter
- `SIGNED_OUT` → `window.location.href = window.location.pathname` for at rydde stale state
- `checkSavedSearchNotifications()` køres efter rigtigt login og bruger `localStorage` `ss_checked_<userId>` som cursor
- `updateFilterCounts()` kaldes KUN ved initial load og efter mutationer — IKKE på tab-fokus

### Database-queries
- `loadBikes()` bruger `.eq('is_active', true)` — henter kun aktive annoncer
- Brug specifikke `.select()` felter i stedet for `select('*')` for at reducere data
- `loadBikesWithFilters()` og `loadBikes()` skal have identiske `profiles(...)` felter inkl. `verified, id_verified, email_verified, last_seen, address` (address bruges til præcis GPS-distance for forhandlere)
- `loadInitialData()` kører `loadDealers` + `updateFilterCounts` parallelt (2 queries i stedet for 4)

### Geocoding og "Nær mig"-filter
- `geocodeCity(city)` — DAWA `/steder` API, by-center. Cache i `_geocodeCache` localStorage
- `geocodeAddress(address, city)` — DAWA `/datavask/adresser` for præcis koordinat. Bruges til forhandler-adresser
- Bike-cards får data-attributter: `data-city`, `data-address` (kun dealers), `data-seller-type`
- `applyNearMeFilter()` bruger `geocodeAddress` for dealers med adresse, `geocodeCity` for private. Sorterer DOM efter afstand (nærmeste først). "~" prefix indikerer ca-afstand (by-center), uden prefix = præcis
- Re-anvendes automatisk efter `renderBikes()` når Nær mig er aktiv (dvs. respekterer pagination + filter-ændringer)
- Google Maps-links: `https://www.google.com/maps/search/?api=1&query=<adresse,by>` på dealer-profil + dealer-kort

### Galleri
- Maks 5 thumbnails synlige — viser "+N" overlay på den 5. hvis flere
- `object-fit: contain` + blurred background (`.gallery-main-bg`) for at undgå cropping
- `galleryGoto()` opdaterer baggrund: `bg.style.backgroundImage = url(...)`

## Database-tabeller (Supabase)

- `profiles` — brugere/forhandlere (id, name, shop_name, seller_type, city, address, verified, id_verified, email_verified, is_admin, avatar_url, bio, last_seen, created_at)
- `bikes` — annoncer (brand, model, type, price, city, condition, year, size, color, warranty, is_active, user_id); slettes ikke, deaktiveres via `is_active=false`
- `bike_images` — billeder med `is_primary` flag (præcis ét primary pr. bike)
- `messages` — beskeder (sender_id, receiver_id, bike_id, content, read, created_at)
- `reviews` — anmeldelser (reviewer_id, reviewed_user_id, rating, comment, bike_id)
- `saved_bikes` — favoritter (user_id, bike_id)
- `saved_searches` — gemte søgefiltre (user_id, name, filters JSON)
- `contact_messages` — kontaktform-indsendelser
- `dealer_applications` — afventende forhandler-ansøgninger (admin gennemgår)
- `id_applications` — afventende ID-verifikationer (admin godkender/afviser)

Storage buckets: `avatars` (profilbilleder), bike-images (annonce-billeder).

## Edge Functions (`supabase/functions/`)

| Function | Formål |
|---|---|
| `notify-message` | Resend e-mail: ny besked, bud accepteret, annonce liket, ID godkendt/afvist, kontaktform, rapport |
| `notify-saved-searches` | Match nye annoncer mod gemte søgninger → daglig e-mail pr. match |
| `delete-account` | Cascading sletning: saved_searches → bikes → reviews → messages → bike_images → profile → auth user |
| `create-checkout-session` | **DORMANT** — Stripe subscription checkout. Klar til reaktivering når betalt model genaktiveres. |
| `create-portal-session` | **DORMANT** — Stripe billing portal for aktive abonnementer |
| `stripe-webhook` | **DORMANT** — Aktiver/deaktiver forhandler-status baseret på Stripe events |
| `chat-support` | Claude Haiku-baseret support-bot (dansk, FAQ om annoncer, konto, beskeder, forhandler) |

Alle edge functions bruger Deno runtime, inkluderer CORS headers og bruger Supabase service-role key hvor nødvendigt.

## Supabase-klient

```js
const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_…';  // anon/publishable — sikker at eksponere
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
```
Keys importeres fra `https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm`. Service-role keys eksisterer KUN i edge functions (env vars).

## Konstanter og grænser

```js
const BIKES_PAGE_SIZE         = 24;
const MAX_IMAGE_SIZE_MB       = 10;
const ALLOWED_IMAGE_TYPES     = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const REFRESH_THROTTLE_MS     = 5000;                      // visibilitychange throttle
const CHAT_FUNCTION_URL       = `${SUPABASE_URL}/functions/v1/chat-support`;
const staticPageRoutes        = { about: '/om-os', terms: '/vilkaar',
                                  privacy: '/privatlivspolitik', contact: '/kontakt',
                                  'guide-tjek': '/guide/tjek-brugt-cykel' };
```
Besked-emoji-konventioner: `💰` = bud, `✅` = accepteret, `✉️` = almindelig besked. `renderMessages` og realtime-toast tjekker på første emoji.

## Billede-upload pipeline

- `validateImageFile(file)` — tjekker MIME + størrelse mod `ALLOWED_IMAGE_TYPES`/`MAX_IMAGE_SIZE_MB`
- `compressImage(file)` — reducerer dimensioner før upload
- Create: `selectedFiles = [{ file, url, isPrimary }]`
- Edit: `editNewFiles = [{ file, url, isPrimary }]` + `editExistingImgs = [{ id, url, is_primary, toDelete }]`
- `uploadImages()` batch-inserts i `bike_images` efter bike er oprettet
- Præcis ét `is_primary=true` pr. bike — opdateres transaktionelt i edit-flow

## Domæne og SEO

- Unicode: `cykelbørsen.dk`
- Punycode (DNS/CNAME): `xn--cykelbrsen-5cb.dk`
- `BASE_URL = 'https://xn--cykelbrsen-5cb.dk'` — brugt til canonical + OG tags
- Del-links bruger Unicode-versionen: `https://cykelbørsen.dk/?bike=...`
- Supabase redirect URLs bruger punycode
- `updateSEOMeta(desc, path)` opdaterer meta-description, canonical og OG-tags ved routing
- `index.html` har JSON-LD skemaer: Organization, WebSite + SearchAction, FAQPage
- Per-annonce JSON-LD tilføjes dynamisk med `id="bike-jsonld"`; fjernes via `removeBikeJsonLd()` ved navigation
