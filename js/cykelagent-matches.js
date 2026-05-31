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

  if (f.search) {
    const q = String(f.search).toLowerCase().trim();
    if (q) {
      const hay = `${bike.brand || ''} ${bike.model || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  if (f.brand) {
    const q = String(f.brand).toLowerCase().trim();
    if (q && !String(bike.brand || '').toLowerCase().includes(q)) return false;
  }
  if (f.type && bike.type !== f.type) return false;
  if (f.city) {
    const c = String(f.city).toLowerCase().trim();
    if (c && !String(bike.city || '').toLowerCase().includes(c)) return false;
  }
  if (Array.isArray(f.types) && f.types.length && !f.types.includes(bike.type)) return false;
  if (Array.isArray(f.conditions) && f.conditions.length && !f.conditions.includes(bike.condition)) return false;
  if (Array.isArray(f.sizes) && f.sizes.length) {
    if (!bike.size) return false;
    const bs = String(bike.size).split(' ')[0];
    if (!f.sizes.some(s => String(s).split(' ')[0] === bs)) return false;
  }
  if (Array.isArray(f.wheelSizes) && f.wheelSizes.length && !f.wheelSizes.includes(String(bike.wheel_size || ''))) return false;
  if (Array.isArray(f.colors) && f.colors.length) {
    const bcolors = Array.isArray(bike.colors) && bike.colors.length
      ? bike.colors
      : (bike.color ? [bike.color] : []);
    if (!bcolors.some(c => f.colors.includes(c))) return false;
  }
  if (Array.isArray(f.frameMaterials) && f.frameMaterials.length && !f.frameMaterials.includes(bike.frame_material)) return false;
  if (Array.isArray(f.brakeTypes) && f.brakeTypes.length && !f.brakeTypes.includes(bike.brake_type)) return false;
  if (Array.isArray(f.groupsets) && f.groupsets.length) {
    const g = String(bike.groupset || '');
    if (!f.groupsets.some(x => g.startsWith(String(x)))) return false;
  }
  if (Array.isArray(f.motors) && f.motors.length) {
    const m = String(bike.motor || '');
    if (!f.motors.some(x => m.startsWith(String(x)))) return false;
  }
  if (Array.isArray(f.motorPositions) && f.motorPositions.length && !f.motorPositions.includes(bike.motor_position)) return false;
  if (Array.isArray(f.suspensions) && f.suspensions.length && !f.suspensions.includes(bike.suspension)) return false;
  if (f.sellerType === 'dealer' || f.sellerType === 'private') {
    const st = bike.profiles?.seller_type;
    if (st && st !== f.sellerType) return false;
  }
  if (f.minPrice != null && bike.price < Number(f.minPrice)) return false;
  if (f.maxPrice != null && bike.price > Number(f.maxPrice)) return false;
  if (f.warranty === true && !bike.warranty) return false;
  if (f.batteryMin != null && (bike.battery_wh == null || bike.battery_wh < Number(f.batteryMin))) return false;
  if (f.batteryMax != null && (bike.battery_wh == null || bike.battery_wh > Number(f.batteryMax))) return false;
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
      battery_wh, suspension,
      profiles!user_id(seller_type, shop_name, verified),
      bike_images(url, is_primary)
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
