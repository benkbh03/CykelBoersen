/* ────────────────────────────────────────────────────────────────
   type-sort.js — sortér cykeltype-filteret så de største står først

   Udskilt fra condition-axis.js, som er slettet. Den fil ejede
   "Alle | Nye | Brugte"-genvejen over annoncelisten, og da genvejen var en
   kopi af sidebarens Stand-afkrydsninger — samme filter to steder — blev
   den fjernet til fordel for Stand-boksen, der nu ligger øverst i
   sidebaren. Tilbage var kun denne ene funktion, og så løj filnavnet.
──────────────────────────────────────────────────────────────── */

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
