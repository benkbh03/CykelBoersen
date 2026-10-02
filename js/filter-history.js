/* ────────────────────────────────────────────────────────────────
   filter-history.js — hvilket filter blev sat sidst?

   Tomme resultater tilbyder "Fjern sidste filter". Filterpillerne står i
   en fast rækkefølge (mærke før stand osv.), ikke i den rækkefølge
   brugeren satte dem, så "sidste" skal huskes for sig.

   recordActiveFilters() kaldes med de aktive piller hver gang pillebaren
   tegnes. Nye piller lægges bagerst, fjernede piller strøges.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

let _order = [];

const keyOf = (p) => `${p.type}|${p.value || ''}`;

/** @param {{type:string, value?:string}[]} pills */
export function recordActiveFilters(pills) {
  const active = new Map((pills || []).map(p => [keyOf(p), p]));
  _order = _order.filter(k => active.has(k));
  for (const k of active.keys()) if (!_order.includes(k)) _order.push(k);
}

/** Senest satte filter som { type, value }, eller null. */
export function lastActiveFilter() {
  const k = _order[_order.length - 1];
  if (!k) return null;
  const i = k.indexOf('|');
  return { type: k.slice(0, i), value: k.slice(i + 1) };
}
