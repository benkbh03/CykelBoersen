/* ────────────────────────────────────────────────────────────────
   filter-availability.js — vis kun filterværdier der giver et resultat

   updateFilterCounts() skjulte allerede nul-værdier for stand, størrelse,
   hjul, farve og type, fordi de har en tæller. Mærke og de tekniske
   filtre (stel, bremser, gear, motor …) har ingen tæller og viste hele
   den kanoniske liste: 99 mærker, hvoraf de fleste gav nul annoncer. Et
   filter der fører til en tom side, lærer brugeren at filtrene ikke kan
   bruges.

   Her skjules værdier med 0 aktive annoncer i den aktive kategori, og en
   sektion der ender helt tom, skjules med. En AFKRYDSET værdi skjules
   aldrig: så kunne brugeren ikke fjerne sit eget filter igen.

   Typefanerne over listen (Racer, Mountainbike …) skjules også ved 0.

   Samme matchsemantik som loadBikesWithFilters: groupset og motor er
   prefix, resten eksakt. Mærket "Andre" = alt uden for den kendte liste.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

// Kolonnerne optællingen skal bruge. main.js henter dem i loadInitialData.
export const AVAILABILITY_COLS =
  'brand, frame_material, brake_type, groupset, electronic_shifting, motor, motor_position, suspension, geartype, step_type';

const EXACT = {
  frame_material: 'frame_material',
  brake_type:     'brake_type',
  motor_position: 'motor_position',
  suspension:     'suspension',
  geartype:       'geartype',
  step_type:      'step_type',
};
const PREFIX = { groupset: 'groupset', motor: 'motor' };

function markEmpty(input, empty) {
  const opt = input.closest('.filter-option');
  if (!opt) return;
  opt.classList.toggle('filter-option--empty', empty && !input.checked);
}

/**
 * @param {Array} bikes  aktive annoncer i den aktive kategori, med AVAILABILITY_COLS + type
 * @param {string[]} knownBrands  den kanoniske mærkeliste (til "Andre")
 */
export function hideUnavailableFilterValues(bikes, knownBrands = []) {
  if (!Array.isArray(bikes)) return;
  const lc = (s) => String(s || '').toLowerCase();

  // Mærke
  const brandSet = new Set(bikes.map(b => b.brand).filter(Boolean));
  const known = new Set(knownBrands);
  const hasOther = bikes.some(b => b.brand && !known.has(b.brand));
  document.querySelectorAll('[data-filter="brand"]').forEach(cb => {
    const v = cb.dataset.value;
    markEmpty(cb, v === 'Andre' ? !hasOther : !brandSet.has(v));
  });

  // Eksakte tekniske filtre
  for (const [filter, col] of Object.entries(EXACT)) {
    const present = new Set(bikes.map(b => b[col]).filter(Boolean));
    document.querySelectorAll(`[data-filter="${filter}"]`).forEach(cb => {
      markEmpty(cb, !present.has(cb.dataset.value));
    });
  }

  // Prefix-filtre (groupset, motor)
  for (const [filter, col] of Object.entries(PREFIX)) {
    const values = bikes.map(b => lc(b[col])).filter(Boolean);
    document.querySelectorAll(`[data-filter="${filter}"]`).forEach(cb => {
      const p = lc(cb.dataset.value);
      markEmpty(cb, !values.some(v => v.startsWith(p)));
    });
  }

  // Elektronisk / mekanisk gear
  const eTrue  = bikes.some(b => b.electronic_shifting === true);
  const eFalse = bikes.some(b => b.electronic_shifting === false);
  document.querySelectorAll('[data-filter="electronic_shifting"]').forEach(cb => {
    markEmpty(cb, cb.dataset.value === 'true' ? !eTrue : !eFalse);
  });

  // Sektioner der kun består af afkrydsningsfelter, og hvor alle er tomme
  document.querySelectorAll('#sidebar-filters .sidebar-box').forEach(box => {
    const opts = [...box.querySelectorAll('.filter-option')];
    if (!opts.length) return;
    if (box.querySelector('input[type="number"], input[type="text"]:not(.brand-search-input)')) return;
    const allEmpty = opts.every(o =>
      o.classList.contains('filter-option--empty') || o.style.display === 'none');
    const anyChecked = !!box.querySelector('input[type="checkbox"]:checked');
    box.classList.toggle('sidebar-box--empty', allEmpty && !anyChecked);
  });

  // Typefaner
  const typeCount = {};
  for (const b of bikes) if (b.type) typeCount[b.type] = (typeCount[b.type] || 0) + 1;
  document.querySelectorAll('.hero-cat-chip[data-type]').forEach(chip => {
    const t = chip.dataset.type;
    if (!t) return; // "Alle typer"
    const empty = !typeCount[t] && !chip.classList.contains('active');
    chip.hidden = empty;
  });
}
