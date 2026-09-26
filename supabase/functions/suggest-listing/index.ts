// Supabase Edge Function: suggest-listing
// Deploy: supabase functions deploy suggest-listing
//
// Påkrævede secrets:
//   ANTHROPIC_API_KEY_ANNONCE  – din Anthropic API-nøgle fra console.anthropic.com
//
// Input:  { images: [{ media_type, data }], hint?: string }
//         images er base64-data (uden "data:...;base64," prefix). Max 4 billeder.
// Output: { suggestion: { brand, model, type, size, wheel_size, year, condition,
//                         color, price_min, price_max, description } }
//         eller { suggestion: null, not_bike: true } hvis billedet ikke viser en cykel.
//         Alle felter er renset: ukendt = null, aldrig teksten "null".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY_ANNONCE") || Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Rate-limit: max 40 AI-analyser pr. bruger pr. time (Claude Vision koster penge).
const RATE_LIMIT_MAX = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_SCOPE     = "suggest_listing";

async function checkAndIncrementRateLimit(
  supa: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: boolean }> {
  const now = new Date();
  const { data: row } = await supa
    .from("rate_limits")
    .select("count, window_start")
    .eq("user_id", userId)
    .eq("scope", RATE_SCOPE)
    .maybeSingle();

  if (!row) {
    await supa.from("rate_limits").insert({
      user_id: userId, scope: RATE_SCOPE, count: 1, window_start: now.toISOString(),
    });
    return { ok: true };
  }
  const windowAgeMs = now.getTime() - new Date(row.window_start as string).getTime();
  if (windowAgeMs > RATE_WINDOW_MS) {
    await supa.from("rate_limits").update({ count: 1, window_start: now.toISOString() })
      .eq("user_id", userId).eq("scope", RATE_SCOPE);
    return { ok: true };
  }
  if ((row.count as number) >= RATE_LIMIT_MAX) return { ok: false };
  await supa.from("rate_limits").update({ count: (row.count as number) + 1 })
    .eq("user_id", userId).eq("scope", RATE_SCOPE);
  return { ok: true };
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGES          = 4;
const MAX_IMAGE_BYTES     = 5 * 1024 * 1024; // 5 MB base64-decoded

const SYSTEM_PROMPT = `Du er en ekspert i brugte cykler og vurderer annoncer til den danske markedsplads Cykelbørsen.

Brugeren uploader 1-4 billeder af en cykel. Din opgave er at analysere billederne og foreslå felter til annoncen.

Returnér KUN gyldig JSON – ingen forklaringer, ingen markdown-kodeblokke, intet andet. Brug dette præcise schema:

{
  "is_bike": true eller false,
  "brand": "string eller null",
  "model": "string eller null",
  "type": "Racercykel|Mountainbike|Citybike|El-cykel|Ladcykel|Børnecykel|Gravel|Senior cykel eller null",
  "size": "XS (44–48 cm)|S (49–52 cm)|M (53–56 cm)|L (57–60 cm)|XL (61+ cm) eller null",
  "wheel_size": "12\\"|14\\"|16\\"|18\\"|20\\"|24\\"|26\\"|27.5\\" / 650b|28\\"|29\\" eller null",
  "year": "integer eller null",
  "condition": "Ny|Som ny|God stand|Brugt",
  "color": "string eller null",
  "price_min": "integer - laveste realistiske pris i DKK",
  "price_max": "integer - højeste realistiske pris i DKK",
  "description": "string eller null - 2-4 sætninger på dansk om cyklen, dens stand og særlige features"
}

Regler:
- "is_bike": false hvis billederne ikke viser en cykel (fx en person, et rum,
  en bil, en barnevogn, et skærmbillede). Så skal ALLE andre felter være null.
- null betyder JSON-værdien null uden anførselstegn. Skriv aldrig teksten
  "null", "undefined", "ukendt" eller "-" i et felt.
- "description" handler KUN om cyklen, som sælgeren selv ville skrive den.
  Aldrig noget om billedet, analysen, hvad du kan eller ikke kan se, eller
  hvor sikker du er. Kan du ikke beskrive cyklen, så null.
- ABSOLUT VIGTIGST: Start med at zoome ind mentalt på rammens down tube
  (det store rør mellem styr og pedaler). Næsten alle producenter sætter
  deres navn DER. Læs hvert bogstav. Eksempler på brands der ofte står
  skrevet: "CUBE", "Trek", "Specialized", "Cervélo", "Canyon", "Giant",
  "Scott", "Cannondale", "Bianchi", "Focus", "Merida", "Bergamont",
  "Kalkhoff", "Gazelle", "Kildemoes", "MBK", "Principia", "Norco", "BMC",
  "Ebsen", "Remington", "Van De Falk", "Velo", "Falcon", "Brabus".
  HVIS DU KAN SE ET LOGO, BRUG DET — gæt aldrig et andet brand når et
  navn er synligt på rammen.
- Hvis du ikke kan se logoet tydeligt, returnér null for brand frem for
  at gætte. Det er bedre at returnere null end forkert mærke.
- Kun felter du er rimeligt sikker på. Returnér null hvis du ikke kan se det.
- Vær ærlig: hvis du kun ser delvist, returnér null på ukendte felter.
- "condition" vælges baseret på synlig slitage, lak, dæk, kædestand.
- "Senior cykel": vælg denne type hvis cyklen tydeligt er designet til ældre/komfort —
  meget lav indstigning (step-through/wave-ramme), oprejst styr, fodbremse/tilbagetrædsbremse,
  ofte med kurv/bagagebærer og lavgear. Hvis det blot er en almindelig citybike, vælg Citybike.
- Prisestimat skal være realistisk for DANSK brugtmarked i DKK.
- Beskrivelse skal være neutral og faktuel — ikke sælgende overdrivelse.
- Matchsøg kun brand/model hvis du tydeligt kan se logo eller karakteristisk design.

VIGTIGT om output:
- Output ÉT enkelt JSON-objekt. Intet andet.
- Ingen forklaringer, ingen kommentarer, ingen markdown.
- Hvis du opdager en fejl undervejs, så outputtér IKKE multiple forsøg — tænk færdigt og output kun det endelige korrekte JSON.`;

/* ── Rens modellens svar ──────────────────────────────────────────
   Samme regler som js/ai-suggestion-clean.js (browseren renser igen, fordi
   en ældre udgave af denne funktion kan være deployet). Filen her deployes
   som én fil i Dashboardet og kan ikke importere fra js/, derfor en kopi.
   Ændres den ene, skal den anden med. */
const EMPTY_WORDS = /^(null|undefined|none|nil|n\/?a|ukendt|unknown|ingen|-+|—|\?+)$/i;
const META_TEXT = /\b(jeg|billedet|billederne|foto(et)?|kan ikke (se|afgøre|bestemme|vurdere|identificere)|ikke muligt|ikke tydelig\w*|fremgår ikke|svært at (se|afgøre)|usikker|ingen cykel|ikke en cykel|analys\w*|json)\b/i;
const NOT_BIKE_TEXT = /\b(ingen cykel|ikke en cykel|viser ikke en cykel|ikke (af )?en cykel|no bicycle|not a bicycle)\b/i;
const BIKE_TYPES = ["Racercykel", "Mountainbike", "Citybike", "El-cykel", "Ladcykel", "Børnecykel", "Gravel", "Senior cykel"];
const CONDITIONS = ["Ny", "Som ny", "God stand", "Brugt"];

function cleanText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!s || EMPTY_WORDS.test(s)) return null;
  return s;
}
function cleanInt(v: unknown, min: number, max: number): number | null {
  const t = cleanText(v);
  if (t === null) return null;
  // Hele tal: punktum er tusindtalsseparator ("4.500"), ikke decimaltegn.
  const n = Number(String(t).replace(/[^\d-]/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function cleanNumber(v: unknown, min: number, max: number): number | null {
  const t = cleanText(v);
  if (t === null) return null;
  const n = Number(String(t).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function oneOf(v: unknown, list: string[]): string | null {
  const t = cleanText(v);
  if (t === null) return null;
  return list.find((x) => x.toLowerCase() === t.toLowerCase()) ?? null;
}

function cleanSuggestion(raw: any): { notBike: boolean; suggestion: Record<string, unknown> | null } {
  if (!raw || typeof raw !== "object") return { notBike: false, suggestion: null };
  const rawDesc = cleanText(raw.description);
  if (raw.is_bike === false || (rawDesc && NOT_BIKE_TEXT.test(rawDesc))) {
    return { notBike: true, suggestion: null };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" || typeof v === "number") out[k] = cleanText(v);
    else if (typeof v === "boolean") out[k] = v;
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
  out.electronic_shifting = typeof raw.electronic_shifting === "boolean" ? raw.electronic_shifting : null;
  out.description = rawDesc && !META_TEXT.test(rawDesc) ? rawDesc : null;
  return { notBike: false, suggestion: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY_ANNONCE mangler");
    return new Response(
      JSON.stringify({ error: "AI ikke konfigureret" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── JWT-auth: kun loggede-ind brugere må bruge AI-analysen (omkostningsbeskyttelse) ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Log ind for at bruge AI-forslag" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Ugyldig session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate-limit pr. bruger ──
    const limit = await checkAndIncrementRateLimit(supa, user.id);
    if (!limit.ok) {
      return new Response(
        JSON.stringify({ error: "For mange AI-forslag på kort tid. Prøv igen om lidt." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { images, hint } = await req.json();

    if (!Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "Mindst ét billede kræves" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (images.length > MAX_IMAGES) {
      return new Response(
        JSON.stringify({ error: `Max ${MAX_IMAGES} billeder` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validering af billeder
    for (const img of images) {
      if (!img || typeof img !== "object") {
        return new Response(
          JSON.stringify({ error: "Ugyldigt billede-format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!ALLOWED_MEDIA_TYPES.includes(img.media_type)) {
        return new Response(
          JSON.stringify({ error: `Ugyldig billedtype: ${img.media_type}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (typeof img.data !== "string" || img.data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Tom billed-data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Base64-størrelse: ca. 4/3 af binær størrelse
      const approxBytes = Math.floor(img.data.length * 0.75);
      if (approxBytes > MAX_IMAGE_BYTES) {
        return new Response(
          JSON.stringify({ error: "Billede er for stort (max 5 MB)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Byg brugerbesked med billed-content
    const userContent: any[] = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.media_type,
        data: img.data,
      },
    }));

    const hintText = (typeof hint === "string" && hint.trim())
      ? `\n\nBrugerens egne noter (kan hjælpe): ${hint.trim().slice(0, 500)}`
      : "";

    userContent.push({
      type: "text",
      text: `Analysér denne cykel og returnér JSON med forslag til annoncen.${hintText}`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-sonnet-4-5-20250929",
        max_tokens:  800,
        temperature: 0,
        system:      SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userContent },
          // Kun "{" som prefill. Tidligere stod '{"brand":"' her, og så kunne
          // modellen ikke svare null på mærket, kun skrive ordet "null".
          { role: "assistant", content: "{" },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API fejl:", err);
      return new Response(
        JSON.stringify({ error: "Kunne ikke få svar fra AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? "";

    // Pga. assistant-prefill ("{") skal vi rekonstruere JSON.
    // Modellen fortsætter fra hvor vi stoppede, så vi prepender prefix'et.
    const reconstructed = "{" + rawText;

    // Forsøg at parse JSON – strip evt. markdown fences
    const cleaned = reconstructed
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "")
      .trim();

    // Ekstrahér det sidste gyldige JSON-objekt i teksten — AI'en kan af og til
    // udskrive et fejlbehæftet forsøg efterfulgt af det korrekte JSON.
    function extractValidJson(text: string): any {
      try { return JSON.parse(text); } catch (_) {}
      const blocks: string[] = [];
      let depth = 0, start = -1, inStr = false, esc = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (c === "\\") { esc = true; continue; }
          if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === "{") { if (depth === 0) start = i; depth++; }
        else if (c === "}") {
          depth--;
          if (depth === 0 && start !== -1) { blocks.push(text.slice(start, i + 1)); start = -1; }
        }
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        try { return JSON.parse(blocks[i]); } catch (_) {}
      }
      throw new Error("Ingen gyldig JSON fundet i svar");
    }

    let suggestion: any;
    try {
      suggestion = extractValidJson(cleaned);
    } catch (parseErr) {
      console.error("JSON-parse fejl:", parseErr, "raw:", rawText);
      return new Response(
        JSON.stringify({ error: "AI-svar kunne ikke fortolkes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = cleanSuggestion(suggestion);
    if (result.notBike) {
      return new Response(
        JSON.stringify({ suggestion: null, not_bike: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ suggestion: result.suggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Uventet fejl:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
