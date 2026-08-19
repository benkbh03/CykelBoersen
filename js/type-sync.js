/* ────────────────────────────────────────────────────────────────
   type-sync.js — hold de tre cykeltype-kontroller enige

   Cykeltype kan sættes tre steder på forsiden:

     1. dropdown'en "Alle typer" i søgefeltet   (#search-type)
     2. chip-rækken under søgefeltet            (.hero-cat-chip)
     3. sidebarens Cykeltype-boks               ([data-filter="type"])

   De to første og den sidste var to helt adskilte veje:

     hero-chip  -> #search-type -> searchBikes() -> rørte IKKE checkboxene
     sidebar    -> applyFilters()               -> læste IKKE #search-type

   Så klikkede man "Citybike" i chip-rækken og krydsede derefter
   "Racercykel" af i sidebaren, så man racercykler — mens Citybike-chippen
   stadig stod fremhævet. Siden viste ét filter og brugte et andet.

   Løsningen er den samme som for ny/brugt-fanebladene: sidebarens
   checkboxes er ÉN kilde til sandheden, og de øvrige kontroller er
   visninger af dem. Alt går gennem applyFilters().
──────────────────────────────────────────────────────────────── */

function typeBoxes() {
  return [...document.querySelectorAll('[data-filter="type"]')];
}

/** Hvilke typer er valgt lige nu? */
export function selectedTypes() {
  return typeBoxes().filter(cb => cb.checked).map(cb => cb.dataset.value);
}

/**
 * Spejl sidebarens tilstand ud i chip-rækken og dropdown'en.
 *
 * Chip-rækken og dropdown'en kan kun vise ÉN type, mens sidebaren tillader
 * flere. Er der valgt flere, viser vi derfor ingen aktiv chip og tom
 * dropdown frem for at fremhæve en tilfældig af dem — en chip der lyver er
 * værre end en chip der er neutral.
 */
export function syncTypeControls() {
  const sel = selectedTypes();
  const one = sel.length === 1 ? sel[0] : null;

  document.querySelectorAll('.hero-cat-chip').forEach(chip => {
    // "Alle"-chippen har data-type="" — normalisér til null, så tom streng og
    // manglende attribut behandles ens. Den er aktiv når intet er valgt.
    const chipType = chip.dataset.type || null;
    const active = sel.length === 0 ? chipType === null : chipType === one;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const dd = document.getElementById('search-type');
  if (dd) dd.value = one ?? '';
}

/**
 * Sæt typen fra en hero-kontrol (chip eller dropdown) og filtrér.
 * @param {string|null} type - null/'' rydder typefilteret
 * @param {Function} applyFilters
 */
export function setHeroType(type, applyFilters) {
  typeBoxes().forEach(cb => { cb.checked = !!type && cb.dataset.value === type; });
  syncTypeControls();
  if (typeof applyFilters === 'function') applyFilters();
}
