/* Rens et svar fra billedanalysen (suggest-listing) før det rører formularen.

   To fejl er set i drift:
   1. Mærke og model blev udfyldt med ordet "null". Edge-funktionen tvang
      svaret til at begynde med {"brand":" — så kunne modellen ikke svare
      null, kun skrive det som tekst.
   2. Modellens forklaringer ("Billedet viser ikke en cykel, men …") landede
      i beskrivelsesfeltet og blev udgivet som sælgerens egen tekst.

   Edge-funktionen renser nu selv, men denne fil gør det igen i browseren:
   en ældre udgave af funktionen kan stadig være deployet, og formularen må
   aldrig kunne få "null" at se. Samme regler står i
   supabase/functions/suggest-listing/index.ts (den kan ikke importere herfra,
   fordi den deployes som én fil). Ændres den ene, skal den anden med.

   Ny fil med vilje: se cache-reglen i CLAUDE.md. */

// Ord der betyder "ingen værdi" og aldrig må stå i et felt.
const EMPTY_WORDS = /^(null|undefined|none|nil|n\/?a|ukendt|unknown|ingen|-+|—|\?+)$/i;

/* En beskrivelse der handler om billedet eller om analysen, ikke om cyklen.
   Hellere smide en god beskrivelse væk end udgive en forklaring som
   sælgerens tekst: feltet er alligevel frivilligt at få udfyldt. */
const META_TEXT = /\b(jeg|billedet|billederne|foto(et)?|kan ikke (se|afgøre|bestemme|vurdere|identificere)|ikke muligt|ikke tydelig\w*|fremgår ikke|svært at (se|afgøre)|usikker|ingen cykel|ikke en cykel|analys\w*|json)\b/i;

const NOT_BIKE_TEXT = /\b(ingen cykel|ikke en cykel|viser ikke en cykel|ikke (af )?en cykel|no bicycle|not a bicycle)\b/i;

const BIKE_TYPES = ['Racercykel', 'Mountainbike', 'Citybike', 'El-cykel', 'Ladcykel', 'Børnecykel', 'Gravel', 'Senior cykel'];
const CONDITIONS = ['Ny', 'Som ny', 'God stand', 'Brugt'];

export const NOT_BIKE_MESSAGE = 'Vi kan ikke se en cykel på billedet. Tjek at du har valgt det rigtige.';

// Tekst → trimmet streng, eller null hvis den er tom eller et "ingen værdi"-ord.
export function cleanText(v) {
  if (v == null) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (!s || EMPTY_WORDS.test(s)) return null;
  return s;
}

export function isEmptyValue(v) {
  return cleanText(v) === null;
}

function cleanInt(v, min, max) {
  const t = cleanText(v);
  if (t === null) return null;
  // Hele tal: punktum er tusindtalsseparator ("4.500"), ikke decimaltegn.
  const n = Number(String(t).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function cleanNumber(v, min, max) {
  const t = cleanText(v);
  if (t === null) return null;
  const n = Number(String(t).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function oneOf(v, list) {
  const t = cleanText(v);
  if (t === null) return null;
  return list.find((x) => x.toLowerCase() === t.toLowerCase()) || null;
}

/* Returnerer { notBike, suggestion }. suggestion er null når billedet ikke
   viser en cykel, ellers en kopi hvor hvert felt er gyldigt eller null. */
export function cleanAiSuggestion(raw, { notBike: flaggedNotBike = false } = {}) {
  if (flaggedNotBike) return { notBike: true, suggestion: null };
  if (!raw || typeof raw !== 'object') return { notBike: false, suggestion: null };

  const rawDesc = cleanText(raw.description);
  if (raw.is_bike === false || (rawDesc && NOT_BIKE_TEXT.test(rawDesc))) {
    return { notBike: true, suggestion: null };
  }

  const out = {};
  // Alle tekstfelter først, så ukendte felter også bliver renset.
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = cleanText(v);
    else if (typeof v === 'boolean') out[k] = v;
    else out[k] = null;
  }
  delete out.is_bike;

  const thisYear = new Date().getFullYear();
  out.type       = oneOf(raw.type, BIKE_TYPES);
  out.condition  = oneOf(raw.condition, CONDITIONS);
  out.year       = cleanInt(raw.year, 1950, thisYear + 1);
  out.price_min  = cleanInt(raw.price_min, 1, 500000);
  out.price_max  = cleanInt(raw.price_max, 1, 500000);
  out.weight_kg  = cleanNumber(raw.weight_kg, 3, 60);
  out.battery_wh = cleanInt(raw.battery_wh, 100, 2000);
  out.electronic_shifting = typeof raw.electronic_shifting === 'boolean' ? raw.electronic_shifting : null;
  out.description = rawDesc && !META_TEXT.test(rawDesc) ? rawDesc : null;

  return { notBike: false, suggestion: out };
}
