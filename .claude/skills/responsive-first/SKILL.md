---
name: responsive-first
description: ALTID skrive ny CSS og HTML med mobile, tablet og desktop i tankerne fra første linje — ikke som efter-tanke. Bruger CykelBørsens fire breakpoints (≤480, ≤768, 769-1024, ≥1025), tilføjer touch-target og font-size krav, og leverer ALDRIG en komponent uden tilhørende media queries. Brug AUTOMATISK når brugeren beder mig skrive ny CSS, oprette en ny komponent, lave en ny side, eller ændre eksisterende CSS. Brug både PROAKTIVT (skrives med fra start) og som et tjek inden push. Komplementerer mobile-audit (som auditerer EFTER ændringer er lavet).
---

# Responsive-first (CykelBørsen)

## Formål
Mobile-audit-skillen tjekker EFTER jeg har skrevet kode. Den her skill ændrer HVORDAN jeg skriver kode fra start: hver gang jeg leverer en CSS-blok eller HTML-komponent, indeholder den ALLEREDE media queries, touch-targets og responsive sizing fra første linje. Ingen "vi tilføjer mobile senere".

## CykelBørsens 4 breakpoints (uændrelige)

Disse er de eneste breakpoints jeg bruger. Ikke 600, ikke 900, ikke nogen sjove værdier.

| Bredde | Enhed | Hvad ændres typisk |
|---|---|---|
| **≤ 480px** | Lille telefon (iPhone SE 1st-gen, gamle Android) | Mindste font, mindste padding, alle inputs i column, hide non-essential UI |
| **481-768px** | Standard telefon (iPhone Plus, Android) + lille tablet portrait | Stack columns, drawer-baseret sidebar, touch-optimerede knapper |
| **769-1024px** | Tablet (iPad portrait, iPad mini) | 2-3 kolonner i grids, sidebar synlig men kompakt |
| **≥ 1025px** | Desktop, iPad Pro landscape | Fuld layout, alle features synlige |

## Devices jeg skal teste mentalt

Når jeg skriver ny CSS, kør gennem disse mentale tjek:

- **iPhone SE 1st gen** (375×667) — den narrowest viewport vi understøtter
- **iPhone 14 Plus** (414×896) — large phone, stadig portrait
- **iPad mini portrait** (768×1024) — mest brugte tablet
- **iPad Pro 12.9" landscape** (1366×1024) — pseudo-desktop
- **MacBook 13" / Standard PC** (1280-1440 wide) — sweet spot for desktop
- **Ultrawide / 4K** (1920+) — vi caper indholdet ved max-width: 1300px

## Standard-mønstre jeg ALTID følger

### 1. Skriv altid mobile-first

```css
/* Default = mobile (≤480px). Ingen "@media"-block.
   Hver ekstra breakpoint vokser layoutet OP. */
.new-component {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  font-size: 0.9rem;
}

@media (min-width: 481px) {
  .new-component { padding: 20px; gap: 14px; }
}
@media (min-width: 769px) {
  .new-component {
    flex-direction: row;
    padding: 24px;
    font-size: 0.95rem;
  }
}
```

Mobile-first sparer specificity-konflikter og gør koden lettere at læse.

### 2. Touch-targets aldrig under 44×44px

```css
/* ❌ DÅRLIGT — for lille tap-area på mobil */
.icon-btn { width: 28px; height: 28px; padding: 0; }

/* ✅ GODT — visuelt lille, men tap-area 44×44 */
.icon-btn {
  width: 28px; height: 28px;
  /* Padding udvider klik-flade uden at ændre visuel størrelse */
  padding: 8px;
  /* Negative margin holder layout-rytmen */
  margin: -8px;
}
```

Eller eksplicit minimum:
```css
button, .clickable {
  min-width: 44px;
  min-height: 44px;
}
```

### 3. Inputs på mobil: ALTID 16px font-size

CykelBørsen har global regel i `01-base.css`:
```css
@media (max-width: 768px) {
  input, select, textarea { font-size: 16px !important; }
}
```

Mindre = iOS Safari auto-zoomer ind ved fokus. Brug ALDRIG mindre font-size på input-elementer på mobil. Hvis nogen specificity er højere, brug `!important`.

### 4. Ingen faste pixel-bredder

```css
/* ❌ DÅRLIGT — knækker på små viewports */
.card { width: 320px; }

/* ✅ GODT — adapter sig */
.card { width: 100%; max-width: 320px; }

/* ✅ Endnu bedre — fluid med min/max */
.card { width: clamp(280px, 90vw, 320px); }
```

### 5. Stack-på-mobil for flex/grid

```css
.row-on-desktop {
  display: flex;
  gap: 16px;
}
@media (max-width: 768px) {
  .row-on-desktop {
    flex-direction: column;
    gap: 12px;
  }
}
```

Eller med `flex-wrap` hvis indholdet er små items:
```css
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

### 6. Grid med fluid kolonner

```css
/* ❌ DÅRLIGT — kan tvinge horisontalt overflow */
.listings-grid { grid-template-columns: 1fr 1fr 1fr; }

/* ✅ GODT — auto-adapter */
.listings-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
@media (max-width: 768px) {
  .listings-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .listings-grid { grid-template-columns: 1fr; }
}
```

### 7. min-width: 0 på flex/grid children med overflow

```css
.flex-parent { display: flex; }
.flex-parent > * { min-width: 0; }  /* tillader children at shrinke under min-content */
```

Forhindrer dem i at presse forælderen ud over viewport. Vigtigt for grid items der indeholder lange tekster eller scroll-containers.

### 8. Modaler på mobil = full-screen

```css
.modal {
  max-width: 500px;
  margin: 60px auto;
  padding: 32px;
}
@media (max-width: 560px) {
  .modal {
    max-width: 100vw;
    margin: 0;
    padding: 20px 16px;
    min-height: 100vh;
    border-radius: 0;
  }
}
```

## Procedure når jeg trigges

### Når brugeren beder mig om en NY komponent

1. **Identificér komponent-type** (knap, card, modal, navigation, grid, formular)
2. **Find tilsvarende eksisterende komponent** for at matche styling-mønster
3. **Skriv CSS mobile-first**: default for ≤480, derefter media queries opad
4. **Tilføj ALTID disse i samme blok**:
   - Min-touch-target hvis interaktiv
   - Font-size ≥ 16px hvis input
   - max-width: 100% / clamp() for fluid bredde
   - Media query for ≤480 + ≤768 minimum
5. **Skriv en kort kommentar** øverst: hvilke devices er testet mentalt

### Når brugeren ændrer EKSISTERENDE CSS

1. **Tjek diff** for hvad der er ændret
2. **Tjek om eksisterende media queries dækker ændringen**
3. **Tilføj manglende breakpoint-overrides** før jeg pusher
4. **Kør mobile-audit i hovedet**: rammer ændringen min-touch-target / input-font / overflow?

### Hver gang jeg leverer en CSS-blok

Inkludér en kort kommentar i CSS som denne:
```css
/* Testet: ≤480 (iPhone SE), ≤768 (iPhone Plus), 769-1024 (iPad), ≥1025 (desktop) */
```

Det forpligter mig og gør det synligt for fremtidig code-review at jeg har overvejet alle viewports.

## Standard-templates for hyppige komponenter

### Card med billede + content

```css
.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.card-image {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
}
.card-body { padding: 14px 16px; }
.card-title {
  font-family: 'Fraunces', serif;
  font-size: 1rem;
  margin: 0 0 4px;
}
@media (min-width: 769px) {
  .card-body { padding: 16px 18px; }
  .card-title { font-size: 1.05rem; }
}
```

### Knap (ikke-icon)

```css
.btn {
  display: inline-flex;
  align-items: center; justify-content: center;
  padding: 11px 18px;
  min-height: 44px;            /* touch-target */
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  font-family: 'DM Sans', sans-serif;
  background: var(--forest);
  color: #fff;
  transition: background 0.15s;
}
.btn:hover { background: var(--forest-light); }
@media (max-width: 480px) {
  .btn { width: 100%; padding: 12px 16px; }   /* full-width på små skærme */
}
```

### Modal

```css
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 2000;
  display: none;
  align-items: center; justify-content: center;
  padding: 16px;
}
.modal-overlay.open { display: flex; }
.modal {
  background: var(--cream);
  border-radius: 14px;
  width: 100%;
  max-width: 500px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 24px;
}
@media (max-width: 560px) {
  .modal-overlay { padding: 0; align-items: stretch; }
  .modal {
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
    padding: 18px 16px;
  }
}
```

### Input-felt

```css
.input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-family: 'DM Sans', sans-serif;
  font-size: 16px;             /* ALDRIG mindre — iOS auto-zoom */
  background: var(--cream);
  color: var(--charcoal);
  transition: border-color 0.15s;
}
.input:focus { outline: none; border-color: var(--forest); }
```

### Navigation/header

```css
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--forest-light);
}
.nav-links { display: flex; gap: 12px; }
.nav-links a:not(.btn-cta) { display: none; }  /* skjul tekst-links default */
@media (min-width: 769px) {
  .nav { padding: 14px 48px; }
  .nav-links { gap: 18px; }
  .nav-links a:not(.btn-cta) { display: inline-block; }  /* vis på tablet+ */
}
```

## Anti-mønstre — slå alarm hvis jeg ser dem

- ❌ Min CSS uden noget `@media`-block overhovedet
- ❌ `width: <number>px` uden tilhørende max-width / clamp
- ❌ Faste `padding`-værdier > 32px (typisk knækker på mobil)
- ❌ `font-size: <14px>` på interaktive elementer
- ❌ `<input>` uden eksplicit font-size eller med <16px
- ❌ Multi-column layouts uden mobile-stack media query
- ❌ Hover-states uden tilsvarende focus-states (touch har ikke hover)
- ❌ Position: fixed elementer uden `max-width: 100vw`
- ❌ Faste px-bredder på tabeller (skal være `width: 100%` + `overflow-x: auto`)
- ❌ Knapper uden `min-height: 44px` (eller udvidet via padding)

## Hvornår skal jeg IKKE bruges

- Ren JavaScript-only ændringer (uden CSS)
- SQL-migrationer
- Edge function-deploys
- Kommentar-rettelser i CSS
- Backup/refactor af eksisterende velprøvet CSS uden funktionalitetsændring

## Hvornår skal mobile-audit køre i stedet

Når du beder mig om at TJEKKE eksisterende kode for problemer — det er en post-hoc audit. Den her skill er om at SKRIVE rigtigt fra start. Begge skills kan trigge på samme arbejdsgang: responsive-first ved skrivning, mobile-audit ved push.
