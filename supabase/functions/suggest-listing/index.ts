// Supabase Edge Function: suggest-listing
// Deploy: supabase functions deploy suggest-listing
//
// Påkrævede secrets:
//   ANTHROPIC_API_KEY_ANNONCE  – din Anthropic API-nøgle fra console.anthropic.com
//
// Input:  { images: [{ media_type, data }], hint?: string }
//         images er base64-data (uden "data:...;base64," prefix). Max 4 billeder.
// Output: { suggestion: { brand, model, type, size, wheel_size, year, condition,
//                         color, groupset, frame_material, brake_type,
//                         electronic_shifting, weight_kg,
//                         price_min, price_max, description } }

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY_ANNONCE") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGES          = 4;
const MAX_IMAGE_BYTES     = 5 * 1024 * 1024; // 5 MB base64-decoded

const SYSTEM_PROMPT = `Du er en ekspert i brugte cykler og hjælper sælgere udfylde annoncer på den danske markedsplads Cykelbørsen.

Brugeren uploader 1-4 billeder af en cykel. Analysér dem og udfyld så MANGE felter du kan med rimelig sikkerhed. Lad være med at være overdrevent forsigtig — gæt kvalificeret når du kan, men brug null hvis billedet er virkelig uklart eller du ikke kan se feltet.

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
  "groupset": "string eller null",
  "frame_material": "Carbon|Aluminium|Stål|Titanium eller null",
  "brake_type": "Skivebremser hydrauliske|Skivebremser mekaniske|Felgbremser|Tromlebremser eller null",
  "electronic_shifting": "true eller false eller null",
  "weight_kg": "decimal eller null",
  "price_min": "integer - laveste realistiske pris i DKK",
  "price_max": "integer - højeste realistiske pris i DKK",
  "description": "string - 2-4 sætninger på dansk om cyklen, dens stand og særlige features"
}

Hovedregler:
- "type" og "condition" SKAL altid forsøges udfyldt — selv på baggrund af generelt udseende. Det er kerne-felter.
- "brand" + "model" — udfyld hvis du genkender logo eller karakteristisk design. Hvis du kun kan se brand men ikke model, returnér brand alene og null på model.
- "color" — primærfarve(r) på rammen, fx "sort", "rød/sort", "hvid".
- "size" + "wheel_size" — udfyld baseret på typiske størrelser for den synlige cykel.
- "year" — kvalificeret gæt baseret på model + design-trends er OK.
- Prisestimat: realistisk for DANSK brugtmarked i DKK, baseret på model + condition.
- Beskrivelse: neutral og faktuel — ikke sælgende.

Avancerede felter (kun hvis tydeligt synlige — ellers null):
- "groupset" — fx "Shimano 105", "Shimano Ultegra Di2", "SRAM Rival AXS". Kun hvis derailleur/skifter-logo er læseligt.
- "frame_material" — Carbon (vævningsmønster, organisk formgivning), Aluminium (svejsninger ved samlinger), Stål (tynde rør, ofte klassisk), Titanium (matgrå metal, sjælden).
- "brake_type" — kig på hjulkant: skivebremser har kaliper og skive, felgbremser har klodser direkte på hjulkant.
- "electronic_shifting" — kun true hvis Di2/eTap/AXS-logo eller batteri synligt.
- "weight_kg" — kun hvis du kender model+spec og dens officielle vægt. Ellers null.`;

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
        model:      "claude-sonnet-4-6",
        max_tokens: 1200,
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
