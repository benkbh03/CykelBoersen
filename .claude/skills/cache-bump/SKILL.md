---
name: cache-bump
description: Bumper cache-versionen på CykelBørsen. Versionen står ÉT sted, på <html data-asset-v> i index.html, og CSS-linkene i samme fil bruger samme streng. Brug AUTOMATISK når der er ændringer i CSS-filer, js/-moduler, main.js, partials/modals.html eller hero.jpg, og brugeren beder om at committe/pushe. Brug også når brugeren nævner "bump cache", "cache version", "ASSET_VERSION" eller "cache-bust".
---

# Cache-bump (CykelBørsen)

## Formål
Sikre at browsere altid henter den nyeste CSS og JS efter en deploy.

## Vigtigst at vide først

**Versionen står ét sted: `<html data-asset-v="...">` øverst i `index.html`.**

Sådan har det ikke altid været. Den stod som fem literaler der skulle holdes
i sync i hånden, og tre af dem drev fra hinanden — bootstrap-`V` stod på
`20260830b` og `main.js`' config-import på `20260701t`, mens CSS var nået til
`w`. Resultatet var ikke et nedbrud, men skævhed: ny HTML og ny CSS serveret
sammen med en `main.js` browseren hentede fra sit eget cache.

Disse tre læser nu attributten og må **ikke** redigeres ved en bump:

| Fil | Hvad den gør |
|---|---|
| `index.html`, bootstrap-scriptet nederst | `const V = document.documentElement.dataset.assetV` |
| `js/config.js` | `export const ASSET_VERSION = document.documentElement.dataset.assetV` |
| `main.js` (øverst) | `await import(\`./js/config.js?v=${ASSET_VERSION}\`)` — dynamisk, fordi en statisk import-sti er en literal der ikke kan læse DOM'en |

**Rører du ASSET_VERSION i `config.js` for at sætte et tal, laver du fejlen om
igen.** Den skal blive ved med at læse fra DOM'en.

CSS-linkene i `<head>` er stadig literaler. De er statiske `href`s der skal
blokere gengivelsen, og lod man JavaScript skrive dem om, ville siden blinke
ustylet først. De bruger med vilje samme streng som attributten, så én
søg-og-erstat rammer det hele.

## Hvornår

Bump når noget af dette er ændret: `css/*`, `js/*`, `main.js`,
`partials/modals.html`, `hero.jpg`.

## Procedure

### 1. Aflæs nuværende version
```bash
grep -o 'data-asset-v="[^"]*"' index.html
```
Format: `20260830<suffix>`, suffix `a-z`, derefter `aa-zz`.

### 2. Bestem næste suffix
`a` → `b`, `z` → `aa`, `az` → `ba`, `bz` → `ca`. Kun små bogstaver.

### 3. Erstat i index.html — og KUN der
```bash
sed -i 's/20260830<GAMMEL>/20260830<NY>/g' index.html
```
Uden `v=`-præfiks i mønstret, så attributten rammes sammen med CSS-linkene.

### 4. Verificér — spring ALDRIG dette over
```bash
grep -c '20260830<NY>'     index.html   # forventet: 14 (1 attribut + 12 CSS + 1 hero)
grep -c '20260830<GAMMEL>' index.html   # skal være 0
```

Bumpen er fejlet tavst tre gange: to gange matchede `sed` ikke det man troede
(én gang fordi skallen døde før kommandoen kørte, én gang fordi mønstret
allerede var forældet), og der blev committet uden at nogen så efter.
**Læs tallene. Antag aldrig at `sed` ramte.**

Ændrer tallet i trin 4 sig ikke som forventet, så find ud af hvorfor før du
committer. Et nyt CSS-link hæver tallet med ét; det er den normale forklaring.

### 5. Ved en ny CSS-fil
Tilføj `<link>` i `index.html` med samme versionsstreng som resten.

## VIGTIGT
- Rør **ikke** `ASSET_VERSION` i `js/config.js`. Den læser fra DOM'en.
- Rør **ikke** `const V` i bootstrap-scriptet. Samme grund.
- De præ-renderede sider (`/om-os/`, `/vilkaar/` osv.) har deres egne gamle
  kopier af bootstrap'en. De genskrives af `sitemap.yml`-actionen ud fra
  `index.html` — redigér dem ikke i hånden. Uden attributten falder de
  tilbage til `?v=` uden værdi, hvilket virker uden fejl.
- Brug **aldrig** `--no-verify`.

## Eksempel-output
```
Bumpet 20260830w → 20260830x:
  ✓ index.html — 14 forekomster (1 data-asset-v + 12 CSS + 1 hero)
  ✓ 0 forekomster af den gamle streng tilbage
  · js/config.js og bootstrap-V rørt ikke — de læser attributten
```
