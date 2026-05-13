---
name: cache-bump
description: Bumper ASSET_VERSION i js/config.js og opdaterer alle ?v=... query-strings i index.html samt eventuelle inline JS-imports. Brug AUTOMATISK når der er ændringer i CSS-filer, lazy-loaded JS-moduler, eller hero.jpg, og brugeren beder om at committe/pushe. Brug også når brugeren eksplicit nævner "bump cache", "cache version", "ASSET_VERSION", eller "cache-bust".
---

# Cache-bump (CykelBørsen)

## Formål
Sikre at browsere ALTID henter den nyeste CSS/JS efter en deploy. CykelBørsen bruger version-suffix-pattern (`?v=20261113ay` → `?v=20261113az`) på alle aggressivt-cachede assets.

## Hvornår skal det køres
Bump cache HVER GANG nogen af disse filer er ændret:
- Alle filer i `css/` (8 CSS-filer)
- Alle filer i `js/` (lazy-loaded moduler)
- `main.js` (auto-genindlæses, men bump tjener som signal)
- `hero.jpg` (separate preload-tag i index.html)
- Filer der dynamisk-importes med `?v=${ASSET_VERSION}` i main.js

## Procedure

### 1. Aflæs nuværende version
```bash
grep ASSET_VERSION js/config.js
```
Format: `'20261113<suffix>'` hvor suffix er `a-z`, `aa-zz` osv.

### 2. Bestem næste suffix
- `a` → `b`
- `z` → `aa`
- `az` → `ba`
- `bz` → `ca`
- Kun lowercase. Tabel:

| Nuværende | Næste |
|---|---|
| `at` | `au` |
| `az` | `ba` |
| `bz` | `ca` |
| `zz` | `aaa` (ekstremt sjældent — efter ~700 bumps) |

### 3. Opdater config.js
Brug Edit-værktøjet med `replace_all: false` for at sikre præcis ét hit:
```js
export const ASSET_VERSION = '20261113<NY_SUFFIX>';
```

### 4. Opdater index.html via sed
```bash
sed -i 's/v=20261113<GAMMEL>/v=20261113<NY>/g' index.html
```

Bekræft med grep at præcis 9 hits ændredes (8 CSS-links + 1 hero-preload — flere hvis nye links er tilføjet).

### 5. Verifikation
- `grep "v=20261113" index.html | wc -l` → forventet antal (typisk 9-10)
- `grep "ASSET_VERSION" js/config.js` → ny version

## VIGTIGT
- **Aldrig** spring trin 4 over — index.html'ens CSS-links er separate fra config.js-versionen
- **Aldrig** brug `--no-verify` eller skip hooks i commit
- Hvis brugeren laver en NY CSS-fil (fx `css/10-foo.css`), tilføj den til index.html med samme version-suffix
- Hvis `hero.jpg` ER ændret men ingen CSS/JS-filer er det, skal `?v=...` på preload-tagget stadig bumpes

## Eksempel-output (efter bump)

```
Bumpet 20261113ax → 20261113ay:
  ✓ js/config.js
  ✓ index.html (8 CSS-links + 1 hero-preload)
```
