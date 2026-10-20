/* ============================================================
   BIKE-MATCH — én regel for "matcher denne cykel disse filtre"
   ============================================================
   Kortet (js/map-page.js) og Cykelagent-skærmen
   (js/cykelagent-matches.js) havde hver sin kopi af reglen, og de
   drev fra hinanden to gange: kortet matchede groupset eksakt mens
   alle andre brugte prefix, og skærmen viste tilbehør som mailen
   sorterede fra. Nu kalder begge denne funktion.

   Mailen matches stadig af bikeMatchesSearch() i
   supabase/functions/notify-saved-searches/index.ts (Deno kan ikke
   importere denne fil). Ændres en regel her, så ret den også dér.

   Filterformen er Cykelagentens (lister i flertal, camelCase).
   Kortet oversætter sine Sets til den form før kaldet.

   Prefix   : groupsets, motors   (cyklen gemmer "Shimano 105 R7000")
   Eksakt   : alle andre lister
   Interval : pris, vægt, batteri — en cykel uden værdien matcher ikke
   ============================================================ */

const lc = v => String(v ?? '').toLowerCase();

/* Tal fra en gemt agent kan være strenge, eller tomme. Tomt eller
   ugyldigt = intet filter. */
const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);

const hasList = list => Array.isArray(list) && list.length > 0;
const inList  = (list, v) => !hasList(list) || (v != null && list.includes(v));
const prefix  = (list, v) => !hasList(list)
  || (!!v && list.some(p => lc(v).startsWith(lc(p))));

function inRange(min, max, v) {
  const lo = num(min), hi = num(max);
  if (lo == null && hi == null) return true;
  if (v == null) return false;
  const n = Number(v);
  return (lo == null || n >= lo) && (hi == null || n <= hi);
}

/* opts.lenientSeller: en cykel uden kendt sælgertype tæller som match
   (Cykelagent-skærmen, der hellere viser for meget end for lidt). Uden
   flaget regnes en ukendt sælger som privat, som på kortet. */
export function bikeMatches(bike, f, opts = {}) {
  if (!f) return false;

  if (f.category && (bike.category || 'cykel') !== f.category) return false;

  if (f.type && bike.type !== f.type) return false;
  if (!inList(f.types, bike.type)) return false;
  if (!inList(f.conditions, bike.condition)) return false;
  if (!inList(f.brands, bike.brand)) return false;
  if (!inList(f.sizes, bike.size)) return false;
  if (!inList(f.wheelSizes, bike.wheel_size)) return false;
  if (!inList(f.frameMaterials, bike.frame_material)) return false;
  if (!inList(f.brakeTypes, bike.brake_type)) return false;
  if (!inList(f.motorPositions, bike.motor_position)) return false;
  if (!inList(f.suspensions, bike.suspension)) return false;
  if (!inList(f.geartypes, bike.geartype)) return false;
  if (!inList(f.stepTypes, bike.step_type)) return false;

  if (!prefix(f.groupsets, bike.groupset)) return false;
  if (!prefix(f.motors, bike.motor)) return false;

  if (hasList(f.colors)) {
    const cols = hasList(bike.colors) ? bike.colors : (bike.color ? [bike.color] : []);
    if (!cols.some(c => f.colors.includes(c))) return false;
  }

  /* 'true' = elektronisk, 'false' = mekanisk. Begge valgt = gearet skal
     være oplyst. En cykel uden oplysning matcher aldrig. */
  if (hasList(f.electronicShiftings)) {
    const es = bike.electronic_shifting;
    if (es !== true && es !== false) return false;
    if (!f.electronicShiftings.includes(String(es))) return false;
  }

  if (!inRange(f.minPrice, f.maxPrice, bike.price)) return false;
  if (!inRange(null, f.maxWeightKg, bike.weight_kg)) return false;
  if (!inRange(f.batteryMin, f.batteryMax, bike.battery_wh)) return false;

  if (f.giveaway === true && !bike.is_giveaway) return false;
  if (f.warranty === true && !bike.warranty) return false;

  if (f.sellerType === 'dealer' || f.sellerType === 'private') {
    const st = opts.lenientSeller
      ? bike.profiles?.seller_type
      : (bike.profiles?.seller_type || 'private');
    if (st && st !== f.sellerType) return false;
  }

  // By: begge veje ("København" matcher "København NV" og omvendt)
  if (f.city) {
    const bikeCity = lc(bike.city), searchCity = lc(f.city);
    if (!bikeCity.includes(searchCity) && !searchCity.includes(bikeCity)) return false;
  }

  // Fritekst på mærke + model
  if (f.search && !`${bike.brand || ''} ${bike.model || ''}`.toLowerCase().includes(lc(f.search))) return false;

  // Cykelagent-formens enkelte mærke, som delstreng (modsat listen `brands`)
  if (f.brand) {
    const q = lc(f.brand).trim();
    if (q && !lc(bike.brand).includes(q)) return false;
  }

  return true;
}
