---
name: pre-launch-audit
description: Gennemfør systematisk lanceringsklar-check af CykelBørsen før et større release eller marketing-push. Tjekker juridiske dokumenter, SEO, OAuth-konfig, performance, mobile-responsivitet, payment-status, edge functions, og email-deliverability. Brug når brugeren nævner "lancering", "go live", "pre-launch", "release", "tjek alt er klar", eller spørger om hvad der mangler før en marketing-kampagne (fx HubSpot-udsendelse).
---

# Pre-launch Audit (CykelBørsen)

## Formål
En markedsplads-launch (eller stor outreach-kampagne) afhænger af at MANGE små ting er på plads samtidigt. Selv én glemt detalje (forkert OG-billede, åbent demo-data, manglende SPF-record) kan koste konverteringer i hundredvis. Denne skill kører et systematisk audit.

## Procedure

Når jeg kaldes, kører jeg ALLE 8 kategorier nedenfor. For hver kategori: scan koden, identificér risici, output en checkliste med ✅/⚠️/❌. Til sidst: prioriteret to-do-liste med hvad der SKAL fixes inden launch.

### Kategori 1: Juridiske dokumenter

```bash
# Tjek datoer i juridiske docs er friske (max 30 dage gamle)
grep -E "Senest opdateret: [0-9]+\. \w+ [0-9]+" js/static-pages-content.js
```

- ✅/❌ Privatlivspolitik dato ≤ 30 dage gammel
- ✅/❌ Vilkår dato ≤ 30 dage gammel
- ✅/❌ Cookiepolitik dato ≤ 30 dage gammel
- ✅/❌ Alle dokumenter henviser konsistent til samme CVR-nummer
- ✅/❌ Cookie-banner siger samme ting som cookiepolitik (ingen "vi viser ikke banner" når der ER en)
- ✅/❌ Privacy nævner ALLE databehandlere (Supabase, Stripe, Resend, Anthropic, DAWA)
- ✅/❌ Privacy nævner alle localStorage-keys (cb_cookie_consent, cb_recently_viewed, ss_checked_*, cb_compare_ids, cb_scam_warning_ack, dealer_signup_source)

### Kategori 2: SEO

- Tjek `index.html` linje 1-100 for:
  - ✅/❌ `<title>` ≤ 60 tegn, indeholder "Cykelbørsen"
  - ✅/❌ `<meta name="description">` ≤ 155 tegn
  - ✅/❌ OG-tags (`og:title`, `og:description`, `og:image`, `og:url`)
  - ✅/❌ Twitter-card-tags
  - ✅/❌ `<link rel="canonical">`
  - ✅/❌ JSON-LD Organization + WebSite + FAQPage validates
- ✅/❌ `sitemap.xml` indeholder alle public URLs (forside, mærker, blog, om-os, vilkår, privacy, kontakt, bliv-forhandler, sikkerhedsguide, guide/tjek-brugt-cykel)
- ✅/❌ `robots.txt` tillader crawlers + peger på sitemap
- ✅/❌ Per-bike JSON-LD genereres dynamisk i bike-detail
- ✅/❌ Demo-annoncer (`shop_name = "Cykelbørsen Demo"`) har `noindex` ELLER er ekskluderet fra sitemap

### Kategori 3: OAuth + Auth

- ✅/❌ Google OAuth Consent Screen har App name = "Cykelbørsen" (ikke supabase.co URL)
- ✅/❌ Authorized domains inkluderer cykelbørsen.dk
- ✅/❌ Supabase Site URL = `https://cykelbørsen.dk` (eller punycode-version)
- ✅/❌ Redirect URLs i Supabase Dashboard matcher `https://xn--cykelbrsen-5cb.dk/*`
- ✅/❌ Email-verification mail har korrekt afsender-domæne (Resend SPF/DKIM verificeret)
- ✅/❌ Reset-password-mail virker (test manuelt med test-konto)

### Kategori 4: Payment (Stripe — dormant)

- ✅/❌ Stripe-functions findes i `supabase/functions/` men kaldes IKKE fra frontend
- ✅/❌ Privatlivspolitik nævner Stripe som "fremtidig" eller "dormant"
- ✅/❌ Vilkår § 5 dækker både gratis-fase OG fremtidig betalt model
- ⚠️ Hvis Stripe genaktiveres: tjek webhook secret, price ID, testmode/livemode konsistens

### Kategori 5: Edge functions

```bash
ls supabase/functions/
```

For hver function:
- ✅/❌ CORS headers tilladt for cykelbørsen.dk
- ✅/❌ Service-role key bruges (ikke anon key)
- ✅/❌ Hemmelige API-keys (RESEND_API_KEY, ANTHROPIC_API_KEY) er sat i Dashboard → Secrets
- ✅/❌ Rate limiting? (notify-message kan spammes — overvej DB-niveau check)
- ✅/❌ Error-handling — fejler ikke stille uden log
- ✅/❌ Deploy er current (sammenlign git-hash i kode vs Dashboard)

### Kategori 6: Performance

- Hent siden via curl og tjek:
  - ✅/❌ Hero-billede preload præfetches (`<link rel="preload">`)
  - ✅/❌ ASSET_VERSION query-string konsistent på alle CSS/JS
  - ✅/❌ Critical CSS inline ELLER `<link rel="stylesheet">` har korrekt cache-bust
- Lighthouse-mål (kør i Chrome DevTools → Lighthouse):
  - ✅/❌ LCP < 2.5s på mobile + desktop
  - ✅/❌ FID < 100ms
  - ✅/❌ CLS < 0.1
  - ✅/❌ Performance score > 85
- ✅/❌ Lazy-loaded billeder har `loading="lazy" decoding="async"`
- ✅/❌ Ingen blocking 3rd-party scripts i `<head>` (Leaflet osv. lazyloades i main.js)

### Kategori 7: Mobile responsivitet

Tjek key breakpoints i devtools (375px, 768px, 1024px):
- ✅/❌ Hero-titlen fitter på 1-2 linjer
- ✅/❌ Søgebar er klikbar (ingen overlap med nav)
- ✅/❌ Annonce-grid er 2 kolonner på mobil
- ✅/❌ "Sæt til salg"-CTA synlig i top-nav
- ✅/❌ Footer ikke for tæt på chat-widget
- ✅/❌ Inputs har `font-size: 16px` (forhindrer iOS auto-zoom)
- ✅/❌ Touch-targets ≥ 44px (knapper, links)
- ✅/❌ Cookie-banner ikke blokerer hele skærmen

### Kategori 8: Indhold + data-hygiejne

- ✅/❌ Ingen "lorem ipsum" / placeholder-tekst i public-pages
- ✅/❌ Demo-annoncer (Cykelbørsen Demo) er markeret med EKSEMPEL-badge
- ✅/❌ Demo-annoncer er ikke "Verificeret forhandler" misvisende
- ✅/❌ Ingen TODO-kommentarer i kode der peger på blocking-issues
- ✅/❌ Footer-links virker (Om os, Blog, Kontakt, Vilkår, Privacy, Cookies)
- ✅/❌ Email-template-billeder peger på faste URLs (ikke localhost / staging)
- ✅/❌ Hero-billede er optimeret (< 200KB, korrekt aspect-ratio)
- ✅/❌ Brand-data faktatjekket (Centurion=DK, MBK=FR, GT=1979 osv.)

## Output-format

Efter scan, lever en rapport som denne:

```markdown
# CykelBørsen Pre-launch Audit — <DATO>

## ✅ Klart til launch (47 items)
- [item liste]

## ⚠️ Bør fixes (8 items)
- [item liste med risiko-niveau]

## ❌ KRITISK — blokerer launch (3 items)
- [konkrete fixes med fil + linje + forslag]

## 🎯 Anbefaling
<en sætning: "Klar / Klar med forbehold / Ikke klar — anslået fix-tid X timer">
```

## Hvornår skal jeg IKKE køres?
- For små bugfixes (brug normal kode-flow)
- Ved dagligt udviklingsarbejde
- Hvis brugeren bare leder efter ÉN specifik ting (fx kun SEO) — så kør bare den kategori
