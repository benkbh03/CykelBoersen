/* ────────────────────────────────────────────────────────────────
   filter-url.js — forsidens filtre i adressen

   /?type=racer&maxPrice=10000 viser racercykler under 10.000 kr., kan
   deles og bogmærkes, og tilbage-knappen går til det forrige filter i
   stedet for ud af siden.

   Sidebarens kontroller er stadig ÉN kilde til sandheden (se
   type-sync.js). Adressen er en afskrift af dem: applyFilters() skriver
   den, og ved indlæsning og tilbage-knap sættes kontrollerne ud fra den,
   hvorefter applyFilters() kører som hvis brugeren selv havde klikket.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

// Læselige værdier for de lister hvor databasens værdi er grim i en URL.
const TYPE_SLUGS = {
  'Racercykel': 'racer', 'Mountainbike': 'mountainbike', 'El-cykel': 'el-cykel',
  'Citybike': 'citybike', 'Gravel': 'gravel', 'Ladcykel': 'ladcykel',
  'Børnecykel': 'boernecykel', 'Senior cykel': 'senior',
};
const CONDITION_SLUGS = { 'Ny': 'ny', 'Som ny': 'som-ny', 'God stand': 'god-stand', 'Brugt': 'brugt' };
const SIZE_SLUGS = {
  'XS (44–48 cm)': 'xs', 'S (49–52 cm)': 's', 'M (53–56 cm)': 'm',
  'L (57–60 cm)': 'l', 'XL (61+ cm)': 'xl',
};

// [URL-nøgle, felt i filter-args, data-filter i sidebaren, slug-tabel]
const LISTS = [
  ['type',       'types',          'type',           TYPE_SLUGS],
  ['condition',  'conditions',     'condition',      CONDITION_SLUGS],
  ['size',       'sizes',          'size',           SIZE_SLUGS],
  ['brand',      'brands',         'brand'],
  ['color',      'colors',         'color'],
  ['wheel',      'wheelSizes',     'wheel'],
  ['frame',      'frameMaterials', 'frame_material'],
  ['brake',      'brakeTypes',     'brake_type'],
  ['groupset',   'groupsets',      'groupset'],
  ['motor',      'motors',         'motor'],
  ['motorPos',   'motorPositions', 'motor_position'],
  ['suspension', 'suspensions',    'suspension'],
  ['gear',       'geartypes',      'geartype'],
  ['step',       'stepTypes',      'step_type'],
];

// [URL-nøgle, felt i filter-args, finder for inputfeltet]
const NUMBERS = [
  ['minPrice',   'minPrice',   () => document.querySelector('.price-range input:first-of-type')],
  ['maxPrice',   'maxPrice',   () => document.querySelector('.price-range input:last-of-type')],
  ['maxWeight',  'maxWeight',  () => document.getElementById('sidebar-max-weight')],
  ['batteryMin', 'batteryMin', () => document.getElementById('battery-min')],
  ['batteryMax', 'batteryMax', () => document.getElementById('battery-max')],
];

const TEXTS = [
  ['q',    'search', () => document.getElementById('search-input')],
  ['city', 'city',   () => document.getElementById('search-city')],
];

const FILTER_KEYS = new Set([
  ...LISTS.map(l => l[0]), ...NUMBERS.map(n => n[0]), ...TEXTS.map(t => t[0]),
  'seller', 'giveaway', 'eshift',
]);

const enc = (v) => encodeURIComponent(v);
const toSlug   = (map, v) => (map && map[v]) || v;
const fromSlug = (map, s) => {
  if (!map) return s;
  const hit = Object.keys(map).find(k => map[k] === s);
  return hit || s;
};

/** Filter-args → query-streng uden '?'. Tom streng når intet er valgt. */
export function filterArgsToQuery(args) {
  if (!args) return '';
  const parts = [];
  for (const [key, field, , map] of LISTS) {
    const vals = args[field];
    if (Array.isArray(vals) && vals.length) {
      parts.push(`${key}=${vals.map(v => enc(toSlug(map, v))).join(',')}`);
    }
  }
  for (const [key, field] of NUMBERS) {
    if (args[field]) parts.push(`${key}=${enc(String(args[field]))}`);
  }
  for (const [key, field] of TEXTS) {
    if (args[field]) parts.push(`${key}=${enc(args[field])}`);
  }
  if (args.sellerType) parts.push(`seller=${args.sellerType === 'dealer' ? 'forhandler' : 'privat'}`);
  if (args.giveaway === true) parts.push('giveaway=1');
  if (args.electronicShifting === true)  parts.push('eshift=1');
  if (args.electronicShifting === false) parts.push('eshift=0');
  return parts.join('&');
}

/** Den del af den aktuelle adresse der er filtre, i fast rækkefølge. */
export function currentUrlFilterQuery() {
  return filterArgsToQuery(readUrlFilterArgs());
}

export function hasFilterParams() {
  const sp = new URLSearchParams(window.location.search);
  for (const k of sp.keys()) if (FILTER_KEYS.has(k)) return true;
  return false;
}

/** Adressens filtre som et args-objekt (samme form som applyFilters bygger). */
export function readUrlFilterArgs() {
  const sp = new URLSearchParams(window.location.search);
  const args = {};
  for (const [key, field, , map] of LISTS) {
    const raw = sp.get(key);
    if (raw) args[field] = raw.split(',').filter(Boolean).map(s => fromSlug(map, s));
  }
  for (const [key, field] of NUMBERS) {
    const n = parseFloat(sp.get(key));
    if (Number.isFinite(n) && n > 0) args[field] = n;
  }
  for (const [key, field] of TEXTS) {
    const t = (sp.get(key) || '').trim();
    if (t) args[field] = t;
  }
  const seller = sp.get('seller');
  if (seller === 'forhandler') args.sellerType = 'dealer';
  if (seller === 'privat')     args.sellerType = 'private';
  if (sp.get('giveaway') === '1') args.giveaway = true;
  if (sp.get('eshift') === '1') args.electronicShifting = true;
  if (sp.get('eshift') === '0') args.electronicShifting = false;
  return args;
}

/**
 * Skriv filtrene i adressen. pushState, så tilbage-knappen går til det
 * forrige filter; replace: true når vi selv genskaber fra adressen.
 * Andre parametre bevares, undtagen 'vist' (antal viste kort), som hører
 * til den ufiltrerede liste.
 */
export function writeFilterUrl(args, { replace = false } = {}) {
  const sp = new URLSearchParams(window.location.search);
  const others = [];
  for (const [k, v] of sp) {
    if (!FILTER_KEYS.has(k) && k !== 'vist') others.push(`${enc(k)}=${enc(v)}`);
  }
  const q = [filterArgsToQuery(args), ...others].filter(Boolean).join('&');
  const next = window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
  const now  = window.location.pathname + window.location.search + window.location.hash;
  if (next === now) return;
  if (replace) history.replaceState(history.state, '', next);
  else         history.pushState(history.state, '', next);
}

/**
 * Sæt sidebarens kontroller ud fra adressen. Kalderen har ryddet dem
 * først (clearAllFilters({ reload: false })) og kører applyFilters()
 * bagefter.
 */
export function applyUrlToControls() {
  const args = readUrlFilterArgs();
  const check = (filter, value) => {
    document.querySelectorAll(`[data-filter="${filter}"]`).forEach(cb => {
      if (cb.dataset.value === value) {
        cb.checked = true;
        cb.closest('.color-swatch')?.classList.add('is-on');
      }
    });
  };
  for (const [, field, filter] of LISTS) {
    for (const v of (args[field] || [])) check(filter, v);
  }
  for (const [, field, find] of NUMBERS) {
    const el = find();
    if (el && args[field]) el.value = String(args[field]);
  }
  for (const [, field, find] of TEXTS) {
    const el = find();
    if (el && args[field]) el.value = args[field];
  }
  if (args.sellerType) {
    document.querySelectorAll('[data-filter="seller"]').forEach(cb => {
      cb.checked = cb.dataset.value === args.sellerType;
    });
  }
  if (args.giveaway) check('giveaway', 'true');
  if (args.electronicShifting === true)  check('electronic_shifting', 'true');
  if (args.electronicShifting === false) check('electronic_shifting', 'false');
  return args;
}
