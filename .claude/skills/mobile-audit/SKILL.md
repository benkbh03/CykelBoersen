---
name: mobile-audit
description: Auditér mobile-responsivitet på CSS- eller HTML-ændringer i CykelBørsen. Tjekker media queries, touch-target-størrelser, iOS auto-zoom-fix på inputs, fixed widths der bryder layouts, horisontal scroll på små viewports, og hvordan ændringen renderer på 375px (iPhone SE), 414px (iPhone Plus) og 768px (iPad). Brug AUTOMATISK når brugeren ændrer CSS, tilføjer en ny komponent, eller spørger om noget "ser dårligt ud på mobil". Brug også manuelt før større mobile-tunge deploys.
---

# Mobile Audit (CykelBørsen)

## Formål
50%+ af CykelBørsens trafik er mobil. Hver CSS/HTML-ændring skal verificeres på små viewports inden push — ellers risikerer vi at en "lille forbedring" på desktop knækker hele mobile-UX'en.

## Hvornår skal jeg køre

Aktiveres ved:
- Ændringer i `css/*.css` (især nye selectors)
- Nye komponenter i `index.html` eller render-funktioner i JS
- Bruger nævner "mobil", "ser dårligt ud på mobil", "iPad", "iPhone", "responsive", "viewport"
- Før et større release-push (kør `/mobile-audit` manuelt)

## Procedure

### 1. Identificér hvad der er ændret
Tjek diffen for nye/ændrede:
- `.<class>` selectors (specielt nye komponenter)
- `<button>`, `<a>`, `<input>` der modtager tap
- `<input type="number">`, `<input type="text">`, `<select>` (iOS zoom-risiko)
- `width`, `min-width`, `max-width` med faste px-værdier
- `position: fixed/absolute` (kan slippe ud af viewport)
- Flex/grid containers (overflow-risiko)

### 2. Tjek de fire kritiske mønstre

#### A) Media queries findes på de rette breakpoints
For hver ny selector, tjek om der findes overrides i:
- `@media (max-width: 480px)` — small phone (375-480px)
- `@media (max-width: 768px)` — phone landscape / small tablet
- `@media (min-width: 769px) and (max-width: 1024px)` — tablet

CykelBørsens primære breakpoints. Manglende mobile-override = ofte buggy layout.

#### B) Touch targets ≥ 44px
Apple HIG og Android Material kræver tappable elementer på ≥ 44×44px. Tjek:
```bash
grep -A 5 "<class>" css/*.css | grep -E "height|width|padding"
```
Knapper, links, ikoner skal være målbart store nok. `font-size: 0.7rem; padding: 4px 8px` på en knap = problematisk tap-target.

#### C) iOS auto-zoom-prevention på inputs
Alle `<input>`, `<select>`, `<textarea>` skal have `font-size: 16px` (ikke mindre) for at undgå iOS Safari's auto-zoom-ind når brugeren trykker på dem.
```bash
grep -E "input|select|textarea" css/*.css | grep "font-size"
```
Eksisterende global regel: `@media (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }` i 01-base.css — verificér at den IKKE bliver overridden.

#### D) Ingen horisontal scroll på mobile viewport
Ved 375px viewport-bredde må intet element gå out-of-bounds. Risikomønstre:
- Fast bredde på indhold (`width: 400px`)
- Lange knapper med `white-space: nowrap`
- Flex container med items der ikke har `min-width: 0`
- Tabeller uden `overflow-x: auto`

`body { overflow-x: clip }` er sat globalt, men klipper kun visuelt — det fikser ikke layout-bredden internt.

### 3. Tjek konkrete CykelBørsen-mønstre

| Komponent | Risiko |
|---|---|
| Bike-card overlays (heart, compare, message-bobble) | Skal være ≥ 32px tappable, ikke overlappe condition-badge på små skærme |
| Hero | Title må ikke bryde linje 3+ gange. Søgebar-felter må stables ordentligt (column flex) |
| Sidebar-filtre | Skal være drawer på ≤768px, ikke fyld viewport |
| Modaler | Skal være full-screen på små skærme, ikke have fixed 800px-bredde |
| Tabeller (fx compare, profil) | Skal have `overflow-x: auto` parent |
| Footer-links | Skal wrappe pænt, ikke overflow |

### 4. Output-format

For hver ændring, rapportér:

```markdown
## Mobile-audit for <ændring>

### ✅ OK
- [stikprøvevis liste af tjek der bestod]

### ⚠️ Bekymringer (bør tjekkes manuelt)
- [item + viewport + foreslået fix]

### ❌ Bug — fix før push
- <fil>:<linje>: <konkret problem>
  Foreslået fix: <kodeblok>
```

### 5. Anbefal manuelle tests
Hvis ændringen rører hero / search / modaler, sig:
> "Test også manuelt i Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M) på iPhone SE (375×667), iPhone Plus (414×896), og iPad (768×1024) før push."

## ANTI-MØNSTRE — flag dem

- ❌ `font-size: 14px` (eller mindre) på `<input>` uden 16px-override på mobile
- ❌ `width: 1200px` faste bredder
- ❌ `padding: 14px 28px` på knapper der bliver til 24px på mobile (touch-target shrinks)
- ❌ `flex-wrap: nowrap` med items > viewport
- ❌ Modaler med `max-width` men uden `width: 95%` på mobile
- ❌ Position-fixed elementer uden `max-width: 100vw`
- ❌ `display: grid` med 3+ kolonner uden tablet/mobile-override
