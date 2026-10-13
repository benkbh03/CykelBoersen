/* ────────────────────────────────────────────────────────────────
   smart-rank.js — ord fra smart søgning der sorterer i stedet for at filtrere

   "City bike dame med kurv foran" giver to filtre (Citybike, Lav
   indstigning). "Kurv" findes ikke som filter, og kun få sælgere nævner
   den, så et filter på ordet ville efterlade en næsten tom liste. I stedet
   kommer annoncer der nævner ordet i mærke, model eller beskrivelse først,
   og resten står under dem i den sædvanlige rækkefølge.

   Ordene huskes kun i denne fane og nulstilles ved en ny smart søgning,
   når feltet tømmes, og ved "Nulstil alle". Vælger brugeren en sortering
   (pris, besparelse), vinder den: sortBikes() sorterer kortene om.

   Ny fil med vilje: se cache-reglen i CLAUDE.md. En cachet bikes-list.js
   kender ikke filen og sorterer bare ikke, hvilket er harmløst.
──────────────────────────────────────────────────────────────── */

let _words = [];

/** Sæt ordene. Tomme og meget korte ord smides væk; højst fem. */
export function setRankWords(words) {
  _words = [...new Set((Array.isArray(words) ? words : [])
    .map(w => String(w || '').toLowerCase().trim())
    .filter(w => w.length >= 3))].slice(0, 5);
}

export function clearRankWords() { _words = []; }

/** "Nulstil alle": glem ordene og fjern smart søgnings statuslinje. */
export function resetSmartRank() {
  _words = [];
  const status = document.getElementById('smart-filter-status');
  if (status) { status.textContent = ''; status.classList.remove('is-error'); }
}

export function getRankWords() { return _words.slice(); }

export function hasRankWords() { return _words.length > 0; }

/** Antal af ordene annoncen nævner. Delstreng, så "kurv" også rammer "cykelkurv". */
function score(b) {
  const hay = `${b.brand || ''} ${b.model || ''} ${b.description || ''}`.toLowerCase();
  let n = 0;
  for (const w of _words) if (hay.includes(w)) n += 1;
  return n;
}

/** Flest ramte ord først. Stabil, så rækkefølgen ellers er uændret. */
export function rankBikes(bikes) {
  if (!_words.length || !Array.isArray(bikes)) return bikes;
  return bikes
    .map((b, i) => ({ b, i, s: score(b) }))
    .sort((x, y) => (y.s - x.s) || (x.i - y.i))
    .map(x => x.b);
}
