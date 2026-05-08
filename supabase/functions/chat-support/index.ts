// Supabase Edge Function: chat-support
// Deploy: supabase functions deploy chat-support
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  – din Anthropic API-nøgle fra console.anthropic.com

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Rate-limit: max 30 beskeder pr. bruger pr. time
const RATE_LIMIT_MAX    = 30;
const RATE_WINDOW_MS    = 60 * 60 * 1000;
const RATE_SCOPE        = "chat_support";

async function checkAndIncrementRateLimit(
  supa: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: boolean; remaining: number }> {
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
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  const windowAgeMs = now.getTime() - new Date(row.window_start).getTime();
  if (windowAgeMs > RATE_WINDOW_MS) {
    await supa.from("rate_limits").update({
      count: 1, window_start: now.toISOString(),
    }).eq("user_id", userId).eq("scope", RATE_SCOPE);
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (row.count >= RATE_LIMIT_MAX) return { ok: false, remaining: 0 };

  await supa.from("rate_limits").update({ count: row.count + 1 })
    .eq("user_id", userId).eq("scope", RATE_SCOPE);
  return { ok: true, remaining: RATE_LIMIT_MAX - row.count - 1 };
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du er en venlig og hjælpsom supportassistent for Cykelbørsen – en dansk online markedsplads for brugte cykler.

Svar altid på dansk. Hold svarene korte, præcise og venlige. Brug ikke unødige formaliteter.

Om Cykelbørsen:
- Online markedsplads for køb og salg af brugte cykler i Danmark
- Både private sælgere og forhandlere kan bruge platformen
- Gratis at oprette og publicere annoncer

Hjælp med disse emner:

OPRETTE ANNONCE:
Klik på "Opret annonce" øverst på siden. Du skal have en gratis konto. Udfyld mærke, model, pris, stand, størrelse og by. Du kan uploade billeder. Annoncen er gratis at oprette.

OPRETTE KONTO / LOGGE IND:
Klik på "Log ind" øverst til højre. Vælg "Opret konto" og udfyld navn, email og adgangskode (mindst 6 tegn). Bekræft din email via det link vi sender.

KONTAKTE EN SÆLGER:
Åbn en annonce og klik "Send besked" eller "Giv bud". Du skal være logget ind. Sælger modtager en email-notifikation og kan svare i indbakken.

INDBAKKE:
Find dine beskeder ved at klikke på kuvert-ikonet øverst til højre, når du er logget ind.

SØGNING OG FILTRERING:
Brug søgefeltet øverst til at søge på mærke eller model. Brug filtrene i venstre side til at filtrere på type, stand, størrelse og pris.

FORHANDLER-KONTO:
Vælg "Forhandler" som sælgertype, når du opretter konto. Du kan angive butikkens navn og kontaktoplysninger.

MINE ANNONCER:
Log ind og klik på dit profilikon øverst til højre → "Mine annoncer". Her kan du se, redigere og markere annoncer som solgte.

PRISER:
Det er gratis at oprette annoncer som privat sælger. Der er ingen skjulte gebyrer.

Hvis du ikke kender svaret på et spørgsmål, sig det ærligt og henvis til at kontakte os direkte.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY mangler");
    return new Response(
      JSON.stringify({ error: "AI ikke konfigureret" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── JWT-auth ─────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Log ind for at bruge support-chatten" }),
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

    // ── Rate-limit ───────────────────────────────────────────
    const limit = await checkAndIncrementRateLimit(supa, user.id);
    if (!limit.ok) {
      return new Response(
        JSON.stringify({ error: "Du har sendt for mange beskeder. Prøv igen om en time." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Ugyldige beskeder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system:     SYSTEM_PROMPT,
        messages,
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
    console.log("Anthropic svar:", JSON.stringify(data));
    const reply = data.content?.[0]?.text ?? "Beklager, jeg kunne ikke svare. Prøv igen.";

    return new Response(
      JSON.stringify({ reply }),
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
