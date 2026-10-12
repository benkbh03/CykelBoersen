/* ────────────────────────────────────────────────────────────────
   bike-filter-query.js — filterpanelets argumenter som Supabase-filtre.

   Flyttet ud af loadBikesWithFilters() så "nærmeste match" i
   tom-tilstanden (near-matches.js) bygger præcis samme forespørgsel med
   ét filter mindre. To kopier af denne logik ville drive fra hinanden.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

// Byer der dækker flere kommuner/distrikter under samme søgeord
export const CITY_GROUPS = {
  'København': [
    'København', 'Frederiksberg', 'Gentofte', 'Hellerup', 'Charlottenlund',
    'Klampenborg', 'Gladsaxe', 'Søborg', 'Lyngby', 'Herlev', 'Rødovre',
    'Hvidovre', 'Brøndby', 'Glostrup', 'Albertslund', 'Tårnby', 'Kastrup',
    'Dragør', 'Vallensbæk', 'Ishøj', 'Taastrup', 'Ballerup', 'Birkerød',
  ],
  'Aarhus': [
    'Aarhus', 'Brabrand', 'Viby', 'Højbjerg', 'Risskov', 'Lystrup',
    'Tilst', 'Skejby', 'Tranbjerg', 'Malling', 'Beder', 'Egå',
  ],
  'Odense': [
    'Odense', 'Bellinge', 'Tarup', 'Hjallese', 'Dalum', 'Sanderum', 'Seden',
  ],
  'Aalborg': [
    'Aalborg', 'Nørresundby', 'Svenstrup', 'Vejgaard', 'Frejlev', 'Gistrup',
  ],
};

// Mærkerne i filterpanelet. "Andre" = alt der ikke står her.
export const KNOWN_BRANDS = ['Amladcykler','Avenue','Babboe','Batavus','Bergamont','Bianchi','Bike by Gubi','Black Iron Horse','BMC','Brabus','Brompton','Butchers & Bicycles','Cannondale','Canyon','Carqon','Centurion','Cervélo','Christiania Bikes','Colnago','Conway','Corratec','Cube','E-Fly','Early Rider','Ebsen','Electra','Everton','FACTOR','Falcon','Felt','Focus','Frog Bikes','Gazelle','Ghost','Giant','GT','Gudereit','Haibike','Husqvarna','Kalkhoff','Kildemoes','Koga','Kona','Kreidler','Lapierre','Larry vs Harry / Bullitt','Lindebjerg','Liv','LOOK','Marin','Mate Bike','MBK','Merida','Momentum','Mondraker','Motobecane','Moustache','Nihola','Nishiki','Norden','Norco','Omnium','Orbea','Pegasus','Pinarello','Principia','Puky','Qio','QWIC','Raleigh','Remington','Riese & Müller','Ridley','Royal Cargobike','Santa Cruz','SCO','Scott','Seaside Bike','Silverback','Sparta','Specialized','Stevens','Superior','Tern','Trek','Triobike','Urban Arrow','uVelo','Van De Falk','VanMoof','Velo','Velo de Ville','Velo Lux','Victoria','Wilier','Winther','Woom','Yuba'];

/** Lægger filterargumenterne på en bikes-forespørgsel. Sælgertype kræver at
    forespørgslen joiner profiles!user_id!inner (se loadBikesWithFilters). */
export function applyFilterArgs(query, {
  types = [], conditions = [], minPrice, maxPrice, sellerType, dealerId,
  wheelSizes = [], sizes = [], colors = [], brands = [],
  frameMaterials = [], brakeTypes = [], groupsets = [], electronicShifting = null,
  motors = [], motorPositions = [], batteryMin, batteryMax,
  suspensions = [], geartypes = [], stepTypes = [],
  maxWeight = null, city = null, search = null, giveaway = null,
} = {}) {
  if (types.length > 0)      query = query.in('type', types);
  if (conditions.length > 0) query = query.in('condition', conditions);
  if (sizes.length > 0)      query = query.in('size', sizes);
  if (colors.length > 0)     query = query.overlaps('colors', colors);
  if (city) {
    const group = CITY_GROUPS[city];
    if (group) {
      query = query.or(group.map(c => `city.ilike.%${c}%`).join(','));
    } else {
      query = query.ilike('city', `%${city}%`);
    }
  }
  if (search) {
    // Fjern PostgREST-meta-tegn (%, _, \, komma, parenteser, anførselstegn) så
    // søgeteksten ikke kan ændre .or()-filterets logik (injection).
    const s = String(search).replace(/[%_\\,.()"']/g, '');
    if (s) query = query.or(`brand.ilike.%${s}%,model.ilike.%${s}%`);
  }
  // Gaver har prisen 0, så et min-beløb udelukker dem automatisk. Det er
  // korrekt: den der søger fra 2.000 kr. leder ikke efter noget gratis.
  if (giveaway === true)     query = query.eq('is_giveaway', true);
  if (minPrice)              query = query.gte('price', minPrice);
  if (maxPrice)              query = query.lte('price', maxPrice);
  if (dealerId)              query = query.eq('user_id', dealerId);
  if (wheelSizes.length > 0) query = query.in('wheel_size', wheelSizes);
  if (sellerType && !dealerId) query = query.eq('profiles.seller_type', sellerType);

  // Cykel-specifikke filtre
  if (frameMaterials.length > 0) query = query.in('frame_material', frameMaterials);
  if (brakeTypes.length > 0)     query = query.in('brake_type', brakeTypes);
  // Groupset er fritekst — match starter-substring så fx 'Shimano 105' matcher
  // 'Shimano 105 R7000', 'Shimano 105 11-speed' osv. via OR-kombination.
  if (groupsets.length > 0) {
    const orFilter = groupsets.map(g => `groupset.ilike.${g.replace(/,/g, '\\,')}*`).join(',');
    query = query.or(orFilter);
  }
  if (electronicShifting === true || electronicShifting === false) {
    query = query.eq('electronic_shifting', electronicShifting);
  }
  if (maxWeight != null && !isNaN(maxWeight)) query = query.lte('weight_kg', maxWeight);

  // El-cykel-filtre. Motor er fritekst → prefix-match (fx 'Bosch' matcher
  // 'Bosch Performance Line CX'). Motor-placering er eksakt. Batteri er Wh-interval.
  if (motors.length > 0) {
    const orFilter = motors.map(m => `motor.ilike.${m.replace(/,/g, '\\,')}*`).join(',');
    query = query.or(orFilter);
  }
  if (motorPositions.length > 0) query = query.in('motor_position', motorPositions);
  if (batteryMin) query = query.gte('battery_wh', batteryMin);
  if (batteryMax) query = query.lte('battery_wh', batteryMax);
  if (suspensions.length > 0) query = query.in('suspension', suspensions);
  if (geartypes.length > 0) query = query.in('geartype', geartypes);
  if (stepTypes.length > 0) query = query.in('step_type', stepTypes);
  if (brands.length > 0) {
    const hasAndre = brands.includes('Andre');
    const specificBrands = brands.filter(b => b !== 'Andre');
    if (hasAndre && specificBrands.length > 0) {
      query = query.or(`brand.in.(${specificBrands.map(b=>`"${b}"`).join(',')}),brand.not.in.(${KNOWN_BRANDS.map(b=>`"${b}"`).join(',')})`);
    } else if (hasAndre) {
      query = query.not('brand', 'in', `(${KNOWN_BRANDS.map(b=>`"${b}"`).join(',')})`);
    } else {
      query = query.in('brand', specificBrands);
    }
  }
  return query;
}
