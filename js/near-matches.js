/* ────────────────────────────────────────────────────────────────
   near-matches.js — "nærmeste match" når filtrene giver nul.

   To filtre der hver for sig er fornuftige (fx et mærke valgt via
   søgeforslag og bagefter fanen Racer), kan sammen give en tom liste.
   Brugeren konkluderer så at der ikke er noget, selvom der er mange
   racercykler. Her prøver vi at fjerne én filtergruppe ad gangen (kun
   tællinger, head-forespørgsler), vælger den der giver flest annoncer og
   viser de første af dem under tom-beskeden.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

import { applyFilterArgs } from './bike-filter-query.js';

// Højst så mange tælle-forespørgsler pr. tom liste.
const MAX_CANDIDATES = 6;

/* Hver gruppe: pille-typen (samme navne som removeFilterPill/removeFilterGroup
   i filters.js), om den er sat, hvordan den ryddes, og hvad den hedder. */
const arr = (key, group, fmt = v => v.join(', ')) => ({
  group,
  isSet: a => Array.isArray(a[key]) && a[key].length > 0,
  clear: a => ({ ...a, [key]: [] }),
  label: a => fmt(a[key]),
});

const GROUPS = [
  arr('brands', 'brand'),
  arr('types', 'type'),
  arr('sizes', 'size', v => `str. ${v.map(s => s.split(' ')[0]).join(', ')}`),
  arr('conditions', 'condition'),
  arr('wheelSizes', 'wheel'),
  arr('colors', 'color'),
  arr('frameMaterials', 'frame_material'),
  arr('brakeTypes', 'brake_type'),
  arr('groupsets', 'groupset'),
  arr('motors', 'motor'),
  arr('motorPositions', 'motor_position'),
  arr('suspensions', 'suspension'),
  arr('geartypes', 'geartype', v => v.map(g => `${g.toLowerCase()} gear`).join(', ')),
  arr('stepTypes', 'step_type'),
  { group: 'electronic_shifting',
    isSet: a => a.electronicShifting === true || a.electronicShifting === false,
    clear: a => ({ ...a, electronicShifting: null }),
    label: a => a.electronicShifting ? 'elektronisk gear' : 'mekanisk gear' },
  { group: 'price',
    isSet: a => !!(a.minPrice || a.maxPrice),
    clear: a => ({ ...a, minPrice: null, maxPrice: null }),
    label: () => 'prisgrænsen' },
  { group: 'weight',
    isSet: a => a.maxWeight != null && a.maxWeight !== '',
    clear: a => ({ ...a, maxWeight: null }),
    label: () => 'vægtgrænsen' },
  { group: 'battery',
    isSet: a => !!(a.batteryMin || a.batteryMax),
    clear: a => ({ ...a, batteryMin: null, batteryMax: null }),
    label: () => 'batterigrænsen' },
  { group: 'seller',
    isSet: a => !!a.sellerType && !a.dealerId,
    clear: a => ({ ...a, sellerType: null }),
    label: a => a.sellerType === 'dealer' ? 'kun forhandlere' : 'kun private' },
  { group: 'giveaway',
    isSet: a => a.giveaway === true,
    clear: a => ({ ...a, giveaway: null }),
    label: () => 'gives væk' },
  { group: 'search',
    isSet: a => !!a.search,
    clear: a => ({ ...a, search: null }),
    label: a => `"${a.search}"` },
  { group: 'city',
    isSet: a => !!a.city,
    clear: a => ({ ...a, city: null }),
    label: a => a.city },
];

const joinFor = a => (a.sellerType && !a.dealerId) ? 'profiles!user_id!inner' : 'profiles!user_id';

/**
 * Finder den filtergruppe der, fjernet alene, giver flest annoncer.
 * Kræver mindst to aktive grupper: med kun ét filter er "uden det" bare
 * hele listen, og det tilbyder tom-tilstanden allerede.
 *
 * @param {object} p
 * @param {object} p.supabase
 * @param {object} p.args      samme argumenter som loadBikesWithFilters fik
 * @param {string} p.category  'cykel' | 'tilbehoer'
 * @param {(join:string)=>string} p.selectCols  kolonnerne til kortene
 * @param {number} [p.limit]
 * @returns {Promise<null | { group:string, label:string, count:number, bikes:object[] }>}
 */
export async function findNearMatch({ supabase, args, category, selectCols, limit = 8 }) {
  const active = GROUPS.filter(g => g.isSet(args));
  if (active.length < 2) return null;

  const candidates = active.slice(0, MAX_CANDIDATES).map(g => ({ g, relaxed: g.clear(args) }));

  const counts = await Promise.all(candidates.map(async ({ relaxed }) => {
    const sel = relaxed.sellerType && !relaxed.dealerId ? 'id, profiles!user_id!inner(seller_type)' : 'id';
    let q = supabase.from('bikes')
      .select(sel, { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('category', category);
    q = applyFilterArgs(q, relaxed);
    const { count, error } = await q;
    return error ? 0 : (count || 0);
  }));

  let best = -1;
  counts.forEach((n, i) => { if (n > 0 && (best < 0 || n > counts[best])) best = i; });
  if (best < 0) return null;

  const { g, relaxed } = candidates[best];
  let q = supabase.from('bikes')
    .select(selectCols(joinFor(relaxed)))
    .eq('is_active', true)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  q = applyFilterArgs(q, relaxed);
  const { data, error } = await q;
  if (error || !data?.length) return null;

  return { group: g.group, label: g.label(args), count: counts[best], bikes: data };
}

/** Overskriften over de nærmeste match. Kortene sættes ind efter den. */
export function nearMatchHeadHTML(match, { esc, isAccessory = false }) {
  const noun = isAccessory
    ? (match.count === 1 ? 'annonce' : 'annoncer')
    : (match.count === 1 ? 'cykel' : 'cykler');
  return `
    <div class="near-matches-head">
      <h3 class="near-matches-title">Uden ${esc(match.label)} matcher ${match.count.toLocaleString('da-DK')} ${noun}</h3>
    </div>`;
}
