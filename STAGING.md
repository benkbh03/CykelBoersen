# Staging

Test nye ting uden at røre rigtige brugeres data.

## Sådan virker det

`js/env.js` vælger database ud fra domænet:

| Hvor siden kører | Database |
|---|---|
| cykelbørsen.dk | Produktion (`ktufgncydxhkhfttojkh`) |
| Alt andet: preview-links, localhost | Staging (når den er udfyldt i `js/env.js`) |

På staging står der en orange bjælke nederst: "Staging: testdata". Er staging
ikke udfyldt, bruger alt produktion, som før.

## Arbejdsgang

1. Ændringen laves på en gren og får en pull request.
2. Pull requesten får et preview-link (Cloudflare Pages). Det link bruger staging-databasen.
3. SQL-migrationer og edge functions køres på **staging først**, derefter produktion.
4. Ser det rigtigt ud på preview-linket: merge. Så er frontenden live.

## Opsætning

**Gjort 12. okt. 2026:**
- Supabase-projektet "CykelBørsen staging" (`mbbfaqdxywueikowqyfk`, eu-west-1, gratis).
- Skemaet er kopieret fra produktion: 26 tabeller, 28 funktioner, 14 triggere, 71 RLS-politikker,
  90 indeks, rettigheder og de tre storage-buckets. Ingen data. Kontrolleret med fingeraftryk af
  kolonner, politikker, constraints og rettigheder: identiske.
- `notify_message_email()` peger på staging-projektets egen adresse, aldrig produktionens.
- `STAGING` i `js/env.js` og `connect-src` i CSP'en i `index.html` er udfyldt. De prerendrede sider
  får samme CSP automatisk, når sitemap-workflowet kører efter merge (de genereres fra `index.html`).

**Mangler (Dashboard, staging-projektet):**
1. Authentication → Sign In / Providers → Email → slå **Confirm email** fra. Supabases indbyggede
   mail sender kun til projektets egne medlemmer, så testbrugere ellers aldrig får bekræftelsen.
2. Authentication → URL Configuration → tilføj `https://*.cykelboersen.pages.dev/**` og
   `http://localhost:8080/**` som redirect URLs.

**Ikke kopieret, med vilje:**
- Edge functions (e-mail, support-chat, smart-filter m.fl.). Deploy dem til staging når en
  ændring i dem skal testes.
- Secrets (Resend, Stripe, Anthropic) og cron-jobs. Staging sender ingen mails og trækker ingen penge.

**Hold staging i takt:** hver SQL-migration køres på staging først, derefter produktion.

## Lokalt (kun for udviklere med terminal)

```
node scripts/serve-local.mjs
```

Åbn http://localhost:8080. Siden bruger staging.

## Hvad staging ikke har

- Gratis Supabase-projekter går i dvale efter en uge uden brug. Vækkes i Dashboard → Restore.
- Ingen e-mails, medmindre Resend-nøglen også lægges i staging-projektets secrets.
- Ingen rigtige annoncer. Lav testannoncer selv.
