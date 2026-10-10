// Supabase Edge Function: smart-filter
//
// Oversætter en fritekst ("carbon gravel under 15.000 i str. M") til
// forsidens ALMINDELIGE filtre. Den finder ikke selv annoncer og opfinder
// ingen nye filtre: svaret er et filter-args-objekt i samme form som
// applyFilters() i main.js bygger, og frontenden sætter sidebarens
// afkrydsninger ud fra det. Brugeren ser derfor præcis hvad der blev valgt,
// som almindelige filter-piller, og kan fjerne dem enkeltvis.
//
// Deploy: Supabase Dashboard → Edge Functions → opret "smart-filter" →
// indsæt HELE filen → Deploy. "Verify JWT" skal være SLÅET FRA: forsiden
// bruges mest af besøgende der ikke er logget ind, og den offentlige
// sb_publishable-nøgle er ikke en JWT. Misbrug begrænses af grænserne nedenfor.
//
// Secrets: ANTHROPIC_API_KEY (findes allerede, bruges af chat-support).
// Tabel:   rate_limits_anon (supabase/sql/add_anon_rate_limits.sql).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MODEL     = "claude-haiku-5-5";
const MAX_CHARS = 300;

/* Hver forespørgsel koster penge, så grænserne fejler LUKKET: kan tælleren
   ikke læses, afvises kaldet. (notify-message gør det modsatte, fordi en
   kontaktformular der afviser alle er værre end et par ekstra mails. Her er
   det værste udfald en regning.)
   Ét kald koster ca. 2.000 input- og 300 output-tokens ≈ 0,2 øre med Haiku
   5.5, så dagsloftet svarer til ca. 4 kr. om dagen. */
const PER_IP_MAX       = 20;                    // pr. IP pr. time
const PER_IP_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_DAY_MAX   = 2000;                  // alle besøgende tilsammen pr. døgn
const DAY_MS           = 24 * 60 * 60 * 1000;

// ── Kanoniske værdier: SKAL svare til data-value i index.html ─────────────
const TYPES = ["Racercykel", "Mountainbike", "El-cykel", "Citybike", "Ladcykel", "Børnecykel", "Gravel", "Senior cykel"];
const CONDITIONS = ["Ny", "Som ny", "God stand", "Brugt"];
const SIZES = ["XS (44–48 cm)", "S (49–52 cm)", "M (53–56 cm)", "L (57–60 cm)", "XL (61+ cm)"];
const WHEELS = ['12"', '14"', '16"', '18"', '20"', '24"', '26"', '27.5" / 650b', '28"', '29"'];
const FRAMES = ["Carbon", "Aluminium", "Stål", "Titanium"];
const BRAKES = ["Skivebremser hydrauliske", "Skivebremser mekaniske", "Fælgbremser", "Rullebremser"];
const GROUPSETS = ["Shimano 105", "Shimano Ultegra", "Shimano Dura-Ace", "SRAM Rival", "SRAM Force", "SRAM Red", "Shimano GRX", "SRAM Apex", "SRAM Rival XPLR", "SRAM Force XPLR", "SRAM Red XPLR", "Campagnolo Ekar", "Shimano Deore", "Shimano XT"];
const MOTORS = ["Bosch", "Shimano", "Promovec", "Yamaha", "Bafang", "Mahle", "Brose", "Fazua"];
const MOTOR_POS = ["Midtermotor", "Forhjulsmotor", "Baghjulsmotor"];
const SUSPENSIONS = ["Forgaffel (hardtail)", "Fuld affjedring (fully)"];
const GEARTYPES = ["Indvendig", "Udvendig"];
const STEP_TYPES = ["Lav indstigning", "Høj indstigning"];
const COLORS = ["Sort", "Hvid", "Grå", "Sølv", "Rød", "Blå", "Grøn", "Gul", "Orange", "Lyserød", "Lilla", "Brun", "Beige"];
const BRANDS = ["Amladcykler", "Avenue", "Babboe", "Batavus", "Bergamont", "Bianchi", "Bike by Gubi", "Black Iron Horse", "BMC", "Brabus", "Brompton", "Butchers & Bicycles", "Cannondale", "Canyon", "Carqon", "Centurion", "Cervélo", "Christiania Bikes", "Colnago", "Conway", "Corratec", "Cube", "E-Fly", "Early Rider", "Ebsen", "Electra", "Everton", "FACTOR", "Falcon", "Felt", "Focus", "Frog Bikes", "Gazelle", "Ghost", "Giant", "GT", "Gudereit", "Haibike", "Husqvarna", "Kalkhoff", "Kildemoes", "Koga", "Kona", "Kreidler", "Lapierre", "Larry vs Harry / Bullitt", "Lindebjerg", "Liv", "LOOK", "Marin", "Mate Bike", "MBK", "Merida", "Momentum", "Mondraker", "Motobecane", "Moustache", "Nihola", "Nishiki", "Norden", "Norco", "Omnium", "Orbea", "Pegasus", "Pinarello", "Principia", "Puky", "Qio", "QWIC", "Raleigh", "Remington", "Riese & Müller", "Ridley", "Royal Cargobike", "Santa Cruz", "SCO", "Scott", "Seaside Bike", "Silverback", "Sparta", "Specialized", "Stevens", "Superior", "Tern", "Trek", "Triobike", "Urban Arrow", "uVelo", "Van De Falk", "VanMoof", "Velo", "Velo de Ville", "Velo Lux", "Victoria", "Wilier", "Winther", "Woom", "Yuba"];

// [felt i svaret, tilladte værdier]
const LISTS: [string, string[]][] = [
  ["types", TYPES], ["conditions", CONDITIONS], ["sizes", SIZES],
  ["wheelSizes", WHEELS], ["frameMaterials", FRAMES], ["brakeTypes", BRAKES],
  ["groupsets", GROUPSETS], ["motors", MOTORS], ["motorPositions", MOTOR_POS],
  ["suspensions", SUSPENSIONS], ["geartypes", GEARTYPES], ["stepTypes", STEP_TYPES],
  ["colors", COLORS], ["brands", BRANDS],
];

const SYSTEM_PROMPT = `Du oversætter en dansk (eller engelsk) beskrivelse af en cykel, som en køber leder efter, til filtre på cykelbørsen.dk.

Svar KUN med ét JSON-objekt, uden forklaring og uden kodeblok. Brug kun de værdier der står herunder, stavet præcis sådan. Udelad et felt, eller giv en tom liste, når beskrivelsen ikke siger noget om det. Gæt ikke: et filter der ikke blev bedt om, skjuler cykler køberen gerne ville se.

Felter (lister kan have flere værdier, som betyder "en af dem"):
- "types": ${JSON.stringify(TYPES)}
- "conditions": ${JSON.stringify(CONDITIONS)}. "Ny" kun når køberen vil have en ny cykel. "Brugt" alene betyder ikke at der skal filtreres; udelad så feltet.
- "sizes": ${JSON.stringify(SIZES)}
- "wheelSizes": ${JSON.stringify(WHEELS)}
- "frameMaterials": ${JSON.stringify(FRAMES)}
- "brakeTypes": ${JSON.stringify(BRAKES)}
- "groupsets": ${JSON.stringify(GROUPSETS)}
- "motors" (el-cykelmotorens mærke): ${JSON.stringify(MOTORS)}
- "motorPositions": ${JSON.stringify(MOTOR_POS)}
- "suspensions": ${JSON.stringify(SUSPENSIONS)}
- "geartypes": ${JSON.stringify(GEARTYPES)} (Indvendig = navgear, Udvendig = kædeskifter)
- "stepTypes": ${JSON.stringify(STEP_TYPES)}
- "colors": ${JSON.stringify(COLORS)}
- "brands": ${JSON.stringify(BRANDS)}
- "minPrice", "maxPrice": hele kroner. "under 3.000" og "max 3k" giver maxPrice 3000. "omkring 10.000" giver 8000 til 12000. Euro omregnes med 7,5.
- "maxWeight": kg, kun når en vægt nævnes.
- "batteryMin": Wh, kun når batteristørrelse nævnes.
- "sellerType": "dealer" (forhandler/butik) eller "private". Udelad hvis begge er fine.
- "electronicShifting": true for Di2/AXS/elektronisk gear.
- "city": én dansk by eller ét postnummer, kun når køberen nævner hvor.
- "search": en model eller et ord der ikke passer i noget felt ovenfor, fx "Tarmac" eller "Domane". Højst tre ord. Ikke mærker, typer eller materialer, de har egne felter.

Hjælp til tolkning:
- Højde til stelstørrelse (voksen): under 160 cm XS, 160-170 S, 170-180 M, 180-190 L, over 190 XL. Giv højst to nabostørrelser.
- Barn: types Børnecykel. Alder til hjul: 2-4 år 12", 3-5 år 14", 4-6 år 16", 5-7 år 18", 6-9 år 20", 8-12 år 24".
- "racer", "landevej" = Racercykel. "MTB" = Mountainbike. "elcykel", "e-bike" = El-cykel. "ladcykel", "cargo", "christianiacykel" = Ladcykel. "bycykel", "pendlercykel" = Citybike, medmindre der står el.
- "fully" = Fuld affjedring (fully). "hardtail" = Forgaffel (hardtail).
- "billig" alene giver ingen pris.`;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || "ukendt";
}

/** Tæl ét kald for (key, scope). false = grænsen er nået ELLER tælleren kunne ikke læses. */
async function take(
  supa: ReturnType<typeof createClient>,
  key: string, scope: string, max: number, windowMs: number,
): Promise<boolean> {
  try {
    const now = new Date();
    const { data: row, error } = await supa
      .from("rate_limits_anon")
      .select("count, window_start")
      .eq("key", key).eq("scope", scope)
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      const { error: e } = await supa.from("rate_limits_anon").insert({
        key, scope, count: 1, window_start: now.toISOString(),
      });
      if (e) throw e;
      return true;
    }
    if (now.getTime() - new Date(row.window_start).getTime() > windowMs) {
      await supa.from("rate_limits_anon")
        .update({ count: 1, window_start: now.toISOString() })
        .eq("key", key).eq("scope", scope);
      return true;
    }
    if (row.count >= max) return false;
    await supa.from("rate_limits_anon")
      .update({ count: row.count + 1 })
      .eq("key", key).eq("scope", scope);
    return true;
  } catch (err) {
    console.error("smart-filter: rate limit kunne ikke slås op — afviser:", err);
    return false;
  }
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

/** Modellens svar → kun kendte felter og kendte værdier. Alt andet smides væk. */
function sanitize(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, allowed] of LISTS) {
    const v = raw[field];
    if (!Array.isArray(v)) continue;
    const hits = [...new Set(v.filter((x) => typeof x === "string" && allowed.includes(x)))];
    if (hits.length) out[field] = hits.slice(0, 6);
  }
  let minPrice = num(raw.minPrice, 1, 1_000_000);
  let maxPrice = num(raw.maxPrice, 1, 1_000_000);
  if (minPrice && maxPrice && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  if (minPrice) out.minPrice = minPrice;
  if (maxPrice) out.maxPrice = maxPrice;
  const maxWeight = num(raw.maxWeight, 3, 80);
  if (maxWeight) out.maxWeight = maxWeight;
  const batteryMin = num(raw.batteryMin, 100, 2000);
  if (batteryMin) out.batteryMin = batteryMin;
  if (raw.sellerType === "dealer" || raw.sellerType === "private") out.sellerType = raw.sellerType;
  if (raw.electronicShifting === true) out.electronicShifting = true;
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/[<>{}"]/g, "").trim().slice(0, max) : "";
  const city = text(raw.city, 40);
  if (city) out.city = city;
  const search = text(raw.search, 40);
  if (search) out.search = search;
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) {
    console.error("smart-filter: ANTHROPIC_API_KEY mangler");
    return json({ error: "Smart filter er ikke sat op endnu." }, 503);
  }

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch { /* tom tekst håndteres nedenfor */ }
  if (text.length < 3) return json({ error: "Skriv lidt om cyklen du leder efter." }, 400);
  if (text.length > MAX_CHARS) return json({ error: `Højst ${MAX_CHARS} tegn.` }, 400);

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  if (!(await take(supa, clientIp(req), "smart_filter", PER_IP_MAX, PER_IP_WINDOW_MS))) {
    return json({ error: "Du har brugt smart filter mange gange den sidste time. Brug filtrene herunder, eller prøv igen senere." }, 429);
  }
  if (!(await take(supa, "alle", "smart_filter_dag", GLOBAL_DAY_MAX, DAY_MS))) {
    return json({ error: "Smart filter er ikke tilgængeligt lige nu. Brug filtrene herunder." }, 429);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      console.error("smart-filter: Anthropic-fejl", res.status, await res.text());
      return json({ error: "Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder." }, 502);
    }
    const data = await res.json();
    const reply: string = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "";
    const match = reply.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown> = {};
    try { parsed = match ? JSON.parse(match[0]) : {}; } catch { parsed = {}; }
    return json({ filters: sanitize(parsed) });
  } catch (err) {
    console.error("smart-filter: uventet fejl", err);
    return json({ error: "Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder." }, 500);
  }
});
