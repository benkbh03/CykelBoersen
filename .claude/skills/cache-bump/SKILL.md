---
name: cache-bump
description: Forklarer CykelBørsens cache-version, som sættes AUTOMATISK efter merge og aldrig må bumpes i en PR. Brug når nogen nævner "bump cache", "cache version", "ASSET_VERSION", "data-asset-v" eller "cache-bust", eller når en ændring i css/, js/, main.js eller partials/ skal committes, så versionen IKKE røres i hånden.
---

# Cache-version (CykelBørsen)

## Kort sagt: bump den ikke

Siden 14. okt. 2026 sættes cache-versionen automatisk. **En PR må ikke ændre
`data-asset-v` eller CSS-linkenes `?v=` i `index.html`.**

Før blev versionen bumpet i hånden i hver PR. To åbne PR'er rørte dermed
altid samme linje, og den der blev merget sidst, fik en merge-konflikt.
Det skete næsten hver gang.

## Sådan virker det nu

1. PR'en ændrer kode i `css/`, `js/`, `main.js` eller `partials/`. Den rører
   ikke versionen.
2. Efter merge kører `.github/workflows/sitemap.yml`. Første trin er
   `node scripts/stamp-asset-version.mjs`, som hasher indholdet af de fire
   stier og skriver de første 10 tegn i `<html data-asset-v>` og i hvert
   CSS-links `?v=`.
3. Prerender kører bagefter og kopierer `index.html`, så de statiske sider
   får samme version. Workflowet committer og pusher til main.

Samme indhold giver samme version, så den daglige kørsel ikke laver tomme
commits.

`check-content.yml` fejler en PR der fjerner en linje med `data-asset-v=`
eller `.css?v=` fra `index.html`. Ret linjerne tilbage til mains værdi.

## Det der stadig læser attributten

| Fil | Hvad den gør |
|---|---|
| `index.html`, bootstrap-scriptet nederst | `const V = document.documentElement.dataset.assetV` |
| `js/config.js` | `export const ASSET_VERSION = document.documentElement.dataset.assetV` |
| `main.js` (øverst) | `await import(\`./js/config.js?v=${ASSET_VERSION}\`)` |

Rør ikke nogen af dem. De skal blive ved med at læse fra DOM'en.

## Ny CSS-fil

Tilføj `<link rel="stylesheet" href="/css/<fil>.css?v=<samme som de andre>">`
i `index.html`. Scriptet retter versionen ved merge. Det er en ny linje, så
PR-tjekket brokker sig ikke.

## Det automatikken ikke dækker

- **Statiske imports** (`from './utils.js'`) har ingen `?v=`. En ny eksport i
  et eksisterende modul kan stadig møde en cachet gammel udgave. Reglen i
  CLAUDE.md gælder uændret: læg den i en ny fil, eller importér dynamisk.
- I minuttet mellem merge og workflowets commit står den gamle version på
  main. Det er det samme som før, når en PR glemte at bumpe.
- Preview-links fra Cloudflare Pages viser PR-grenens `index.html`, altså
  mains seneste version. Hver preview har sin egen adresse, så cachen deles
  ikke med produktion.

## Skal versionen tvinges op uden kodeændring

GitHub → Actions → "Generate sitemap + prerender" → Run workflow. Ændres
intet i de fire stier, bliver versionen den samme; det er meningen.
