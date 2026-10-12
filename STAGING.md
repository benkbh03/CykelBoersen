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

## Opsætning (én gang)

1. **Staging-database:** et ekstra gratis Supabase-projekt ("CykelBørsen staging", eu-west-1).
   Skemaet kopieres fra produktion, uden brugerdata. Udfyld `STAGING` i `js/env.js`
   og tilføj adressen til `connect-src` i CSP'en i `index.html`.
2. **Preview-links:** findes allerede. Cloudflare Pages-projektet `cykelboersen` bygger hver
   gren og skriver linket som kommentar på pull requesten
   (`https://<gren>.cykelboersen.pages.dev`).
3. **Login på staging:** Supabase (staging) → Authentication → URL Configuration →
   tilføj `https://*.pages.dev/**` og `http://localhost:8080/**` som redirect URLs.

## Lokalt (kun for udviklere med terminal)

```
node scripts/serve-local.mjs
```

Åbn http://localhost:8080. Siden bruger staging.

## Hvad staging ikke har

- Gratis Supabase-projekter går i dvale efter en uge uden brug. Vækkes i Dashboard → Restore.
- Ingen e-mails, medmindre Resend-nøglen også lægges i staging-projektets secrets.
- Ingen rigtige annoncer. Lav testannoncer selv.
