/* ============================================================
   CYKELAGENT-MATCHING (client-side, lightweight)
   ============================================================
   Bruges af /cykelagenter til at vise "Nye match siden sidst".

   Den AUTORITATIVE matching (til e-mail-notifikationer) sker
   server-side i supabase/functions/notify-saved-searches. Denne
   client-side udgave dækker de mest brugte filter-dimensioner og er
   bevidst lidt mere generøs (over-match er bedre end at gemme noget
   væk for en bruger der specifikt klikker ind for at se match).

   "Sidst set"-tidsstempel ligger i localStorage pr. browser.
   ============================================================ */

const LAST_SEEN_KEY = 'cb_cykelagent_last_seen';
const LOOKBACK_DAYS = 30;
const FETCH_LIMIT   = 200;
const DISPLAY_LIMIT = 12;

export function getMatchesLastSeen() {
  try {
    const v = localStorage.getItem(LAST_SEEN_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch { return 0; }
}

export function markMatchesSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch {}
}

function bikeMatchesAgent(bike, f) {
  if (!f) return false;

  // Type (singular fra forside-flow eller liste fra cykelagent-form)
  if (f.type && bike.type !== f.type) return false;
  if (Array.isArray(f.types) && f.types.length && !f.types.includes(bike.type)) return false;

  if (Array.isArray(f.conditions) && f.conditions.length && !f.conditions.includes(bike.condition)) return false;

  if (Array.isArray(f.wheelSizes) && f.wheelSizes.length) {
    if (!bike.wheel_size || !f.wheelSizes.includes(bike.wheel_size)) return false;
  }

  if (Array.isArray(f.sizes) && f.sizes.length) {
    if (!bike.size || !f.sizes.includes(bike.size)) return false;
  }

  if (Array.isArray(f.colors) && f.colors.length) {
    const bcolors = Array.isArray(bike.colors) && bike.colors.length
      ? bike.colors
      : (bike.color ? [bike.color] : []);
    if (!bcolors.some(c => f.colors.includes(c))) return false;
  }

  if (Array.isArray(f.frameMaterials) && f.frameMaterials.length) {
    if (!bike.frame_material || !f.frameMaterials.includes(bike.frame_material)) return false;
  }

  if (Array.isArray(f.brakeTypes) && f.brakeTypes.length) {
    if (!bike.brake_type || !f.brakeTypes.includes(bike.brake_type)) return false;
  }

  if (Array.isArray(f.groupsets) && f.groupsets.length) {
    const g = String(bike.groupset || '').toLowerCase();
    if (!g || !f.groupsets.some(sel => g.startsWith(String(sel).toLowerCase()))) return false;
  }

  if (f.electronicShifting === 'true' || f.electronicShifting === 'false') {
    const want = f.electronicShifting === 'true';
    if (bike.electronic_shifting === null || bike.electronic_shifting === undefined) return false;
    if (!!bike.electronic_shifting !== want) return false;
  }

  if (f.maxWeightKg != null && !isNaN(Number(f.maxWeightKg))) {
    if (bike.weight_kg === null || bike.weight_kg === undefined) return false;
    if (Number(bike.weight_kg) > Number(f.maxWeightKg)) return false;
  }

  if (Array.isArray(f.motors) && f.motors.length) {
    const m = String(bike.motor || '').toLowerCase();
    if (!m || !f.motors.some(sel => m.startsWith(String(sel).toLowerCase()))) return false;
  }

  if (Array.isArray(f.motorPositions) && f.motorPositions.length) {
    if (!bike.motor_position || !f.motorPositions.includes(bike.motor_position)) return false;
  }

  if (f.batteryMin != null && !isNaN(Number(f.batteryMin))) {
    if (bike.battery_wh == null || Number(bike.battery_wh) < Number(f.batteryMin)) return false;
  }
  if (f.batteryMax != null && !isNaN(Number(f.batteryMax))) {
    if (bike.battery_wh == null || Number(bike.battery_wh) > Number(f.batteryMax)) return false;
  }

  if (Array.isArray(f.suspensions) && f.suspensions.length) {
    if (!bike.suspension || !f.suspensions.includes(bike.suspension)) return false;
  }

  if (Array.isArray(f.geartypes) && f.geartypes.length) {
    if (!bike.geartype || !f.geartypes.includes(bike.geartype)) return false;
  }

  if (f.minPrice != null && !isNaN(Number(f.minPrice)) && Number(bike.price) < Number(f.minPrice)) return false;
  if (f.maxPrice != null && !isNaN(Number(f.maxPrice)) && Number(bike.price) > Number(f.maxPrice)) return false;

  if (f.sellerType === 'dealer' || f.sellerType === 'private') {
    const st = bike.profiles?.seller_type;
    if (st && st !== f.sellerType) return false;
  }

  if (f.warranty === true && !bike.warranty) return false;

  // By: bidirektionel substring (matcher edge function — "København" matcher "København NV" og omvendt)
  if (f.city) {
    const bikeCity = String(bike.city || '').toLowerCase();
    const searchCity = String(f.city).toLowerCase();
    if (!bikeCity.includes(searchCity) && !searchCity.includes(bikeCity)) return false;
  }

  // Fritekst: substring på brand + model
  if (f.search) {
    const hay = `${bike.brand || ''} ${bike.model || ''}`.toLowerCase();
    const needle = String(f.search).toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  // brand-felt (cykelagent-form gemmer brand i både search + brand;
  // tjek for at undgå at vise andre mærker selvom search-substring tilfældigvis matcher)
  if (f.brand) {
    const q = String(f.brand).toLowerCase().trim();
    if (q && !String(bike.brand || '').toLowerCase().includes(q)) return false;
  }

  return true;
}

export async function fetchAgentMatches(supabase, agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return { matches: [], newCount: 0, totalMatches: 0 };
  }
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bikes')
    .select(`
      id, brand, model, price, type, city, condition, year, size, wheel_size, color, colors,
      warranty, created_at, user_id, frame_material, brake_type, groupset, motor, motor_position,
      battery_wh, suspension, geartype,
      profiles!user_id(seller_type, shop_name, verified),
      bike_images(url, thumb_url, is_primary)
    `)
    .eq('is_active', true)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error || !Array.isArray(data)) {
    return { matches: [], newCount: 0, totalMatches: 0 };
  }

  const lastSeen = getMatchesLastSeen();
  const seen = new Set();
  const all = [];
  let newCount = 0;

  for (const bike of data) {
    if (seen.has(bike.id)) continue;
    let agentMatch = null;
    for (const agent of agents) {
      if (bikeMatchesAgent(bike, agent.filters)) {
        agentMatch = agent;
        break;
      }
    }
    if (!agentMatch) continue;
    seen.add(bike.id);
    const ts = bike.created_at ? new Date(bike.created_at).getTime() : 0;
    const isNew = ts > lastSeen;
    if (isNew) newCount++;
    all.push({ bike, agent: agentMatch, isNew });
  }

  return {
    matches: all.slice(0, DISPLAY_LIMIT),
    newCount,
    totalMatches: all.length,
  };
}
