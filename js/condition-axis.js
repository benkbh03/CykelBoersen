/* ────────────────────────────────────────────────────────────────
   condition-axis.js — "Alle | Nye | Brugte" over annoncelisten

   Ny-eller-brugt er den første beslutning en cykelkøber tager, men den
   var gemt i sidebarens Stand-boks — plads 4, foldet sammen som standard,
   og med fire afkrydsningsfelter hvor "brugt" krævede tre klik.

   VIGTIGT — knappen er en GENVEJ, ikke et nyt filter. Den sætter de
   `[data-filter="condition"]`-checkboxes der allerede findes i sidebaren
   og kalder derefter applyFilters(). Der er altså fortsat ÉN kilde til
   sandheden om stand, og alt der i forvejen læser condition (query'en,
   aktive-filter-pills, gemte søgninger, cykelagenten, tællerne, kortet)
   virker uændret uden at skulle røres.

   Det er med vilje: et parallelt "er_ny"-flag ved siden af condition ville
   være præcis den "filtrér her, men ikke der"-fejl som filter-tjeklisten i
   CLAUDE.md advarer imod.
──────────────────────────────────────────────────────────────── */

/* Kanonisk opdeling af de fire condition-værdier. "Ny" betyder ubrugt i
   original emballage (se stand-guiden i sidebaren) — alt andet har haft
   en ejer og hører til under Brugte. */
export const CONDITION_NEW  = ['Ny'];
export const CONDITION_USED = ['Som ny', 'God stand', 'Brugt'];

function conditionBoxes() {
  return [...document.querySelectorAll('[data-filter="condition"]')];
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(v => setB.has(v));
}

/**
 * Aflæs hvilket segment der svarer til sidebarens nuværende afkrydsninger.
 * @returns {'all'|'new'|'used'|'custom'} 'custom' når brugeren har lavet en
 *   kombination der ikke er nogen af de tre (fx kun "Som ny"). Så markeres
 *   ingen knap — at fremhæve et segment der ikke matcher filtrene ville lyve.
 */
export function currentConditionAxis() {
  const checked = conditionBoxes().filter(cb => cb.checked).map(cb => cb.dataset.value);
  if (checked.length === 0) return 'all';
  if (sameSet(checked, CONDITION_NEW))  return 'new';
  if (sameSet(checked, CONDITION_USED)) return 'used';
  return 'custom';
}

/** Opdatér knappernes udseende + aria ud fra sidebarens faktiske tilstand. */
export function syncConditionAxis() {
  const mode = currentConditionAxis();
  document.querySelectorAll('.cond-seg-btn').forEach(btn => {
    const active = btn.dataset.cond === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/**
 * Sæt aksen og kør filtreringen.
 * @param {'all'|'new'|'used'} mode
 * @param {Function} applyFilters - injiceres, så modulet ikke afhænger af main.js
 */
export function setConditionAxis(mode, applyFilters) {
  const want = mode === 'new' ? CONDITION_NEW
             : mode === 'used' ? CONDITION_USED
             : [];
  conditionBoxes().forEach(cb => { cb.checked = want.includes(cb.dataset.value); });
  syncConditionAxis();
  if (typeof applyFilters === 'function') applyFilters();
}

/* ── Sortér cykeltype-filteret efter antal ────────────────────────────
   Rækkefølgen i index.html er fast, så listen begyndte med den kategori
   der tilfældigvis stod først i markuppen — også når den kun havde én
   annonce, mens kategorien med 88 lå nede i midten. Efter hver optælling
   flyttes rækkerne så de største kommer først.

   Kører på DOM'en frem for på markuppen, fordi tællerne først kendes
   efter updateFilterCounts, og fordi tilbehørs-kategorien genbruger
   samme boks med en helt anden værdiliste. */
export function sortTypeFilterByCount() {
  const box = document.querySelector('[data-fsec="cykeltype"] .filter-group');
  if (!box) return;

  const rows = [...box.querySelectorAll('.filter-option')];
  if (rows.length < 2) return;

  const countOf = row => {
    const raw = row.querySelector('.filter-count')?.textContent ?? '';
    // Tællerne er tusind-separerede ("1.234") og er "–" før første optælling.
    const n = parseInt(raw.replace(/\./g, ''), 10);
    return Number.isFinite(n) ? n : -1;
  };

  // Er intet talt op endnu (alle "–"), lad markuppens rækkefølge stå.
  if (rows.every(r => countOf(r) < 0)) return;

  rows
    .slice()
    .sort((a, b) => {
      const d = countOf(b) - countOf(a);
      if (d !== 0) return d;
      // Samme antal → alfabetisk, så rækkefølgen ikke hopper tilfældigt rundt
      // mellem to optællinger med ens tal.
      return (a.textContent || '').trim().localeCompare((b.textContent || '').trim(), 'da');
    })
    .forEach(row => box.appendChild(row));
}
