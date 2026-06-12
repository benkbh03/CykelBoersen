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
  "description": "string - 2-4 sætninger på dansk om cyklen, dens stand og særlige features"
}

Regler:
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
          { role: "assistant", content: '{"brand":"' },
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

    // Pga. assistant-prefill ('{"brand":"') skal vi rekonstruere JSON.
    // Modellen fortsætter fra hvor vi stoppede, så vi prepender prefix'et.
    const reconstructed = '{"brand":"' + rawText;

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

    return new Response(
      JSON.stringify({ suggestion }),
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
