// Supabase Edge Function: suggest-listing
// Deploy: supabase functions deploy suggest-listing
//
// Påkrævede secrets:
//   ANTHROPIC_API_KEY_ANNONCE  – din Anthropic API-nøgle fra console.anthropic.com
//
// Input:  { images: [{ media_type, data }], hint?: string }
//         images er base64-data (uden "data:...;base64," prefix). Max 4 billeder.
// Output: { suggestion: { brand, model, type, size, wheel_size, year, condition,
//                         color, price, description } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY_ANNONCE") ?? "";

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
  "type": "Racercykel|Mountainbike|Citybike|El-cykel|Ladcykel|Børnecykel|Gravel eller null",
  "size": "XS (44–48 cm)|S (49–52 cm)|M (53–56 cm)|L (57–60 cm)|XL (61+ cm) eller null",
  "wheel_size": "26\\"|27.5\\" / 650b|28\\"|29\\" eller null",
  "year": "integer eller null",
  "condition": "Ny|Som ny|God stand|Brugt",
  "color": "string eller null",
  "price_min": "integer - laveste realistiske pris i DKK",
  "price_max": "integer - højeste realistiske pris i DKK",
  "description": "string - 2-4 sætninger på dansk om cyklen, dens stand og særlige features"
}

Regler:
- Kun felter du er rimeligt sikker på. Returnér null hvis du ikke kan se det.
- Vær ærlig: hvis du kun ser delvist, returnér null på ukendte felter.
- "condition" vælges baseret på synlig slitage, lak, dæk, kædestand.
- Prisestimat skal være realistisk for DANSK brugtmarked i DKK.
- Beskrivelse skal være neutral og faktuel — ikke sælgende overdrivelse.
- Matchsøg kun brand/model hvis du tydeligt kan se logo eller karakteristisk design.`;

serve(async (req) => {
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
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:     SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userContent },
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

    // Forsøg at parse JSON – strip evt. markdown fences
    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "")
      .trim();

    let suggestion: any;
    try {
      suggestion = JSON.parse(cleaned);
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
