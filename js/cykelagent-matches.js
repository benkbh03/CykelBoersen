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

import { bikeMatches } from './bike-match.js';

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

/* Sidebaren og Cykelagent-editoren gemmer de SAMME filtre under forskellige
   navne og typer, fordi de er bygget hver for sig. Uden en normalisering
   fejler de tavst hver sin vej:

   - Sidebaren gemmer `maxWeight`, matcheren læste `maxWeightKg`. Filteret
     blev ignoreret, og brugeren fik mails om 22-kg ladcykler.
   - Sidebaren gemmer `electronicShifting` som boolean, matcheren
     sammenlignede med strengene 'true'/'false'. Filteret faldt bort.

   Normalisér ét sted til den form bikeMatches() kender.

   category: hård akse, magen til edge-funktionens. En agent uden kategori
   er en cykel-agent og må aldrig matche tilbehør. */
function normalizeAgentFilters(f) {
  const es = f.electronicShifting;
  const esStr = es === true ? 'true' : es === false ? 'false' : es;
  return {
    ...f,
    category: f.category || 'cykel',
    maxWeightKg: f.maxWeightKg ?? f.maxWeight ?? null,
    electronicShiftings: (esStr === 'true' || esStr === 'false') ? [esStr] : null,
  };
}

/* Reglen selv ligger i js/bike-match.js, delt med kortet. */
function bikeMatchesAgent(bike, rawFilters) {
  if (!rawFilters) return false;
  return bikeMatches(bike, normalizeAgentFilters(rawFilters), { lenientSeller: true });
}

export async function fetchAgentMatches(supabase, agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return { matches: [], newCount: 0, totalMatches: 0 };
  }
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bikes')
    /* category, electronic_shifting og weight_kg SKAL med. Matcheren afviser
       hårdt på null for de to sidste, så uden dem gav enhver agent med
       "Elektronisk gear" eller "Maks. vægt" altid nul match — uden fejlbesked.
       Feltet blev bare aldrig hentet. */
    .select(`
      id, brand, model, price, is_giveaway, category, type, city, condition, year, size, wheel_size, color, colors,
      warranty, created_at, user_id, frame_material, brake_type, groupset, electronic_shifting, weight_kg,
      motor, motor_position, battery_wh, suspension, geartype, step_type,
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
  /* Pr. agent: antal match og nyeste matchdato, til linjen på agentkortet.
     En cykel tælles hos HVER agent den matcher; listen ovenfor viser den
     kun én gang, under den første. */
  const perAgent = {};

  for (const bike of data) {
    if (seen.has(bike.id)) continue;
    let agentMatch = null;
    for (const agent of agents) {
      if (bikeMatchesAgent(bike, agent.filters)) {
        if (!agentMatch) agentMatch = agent;
        const pa = perAgent[agent.id] || (perAgent[agent.id] = { count: 0, latest: null });
        pa.count++;
        if (!pa.latest || bike.created_at > pa.latest) pa.latest = bike.created_at;
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
    perAgent,
    // Ramte hentningen loftet, er tallene en nedre grænse.
    capped: data.length >= FETCH_LIMIT,
  };
}
