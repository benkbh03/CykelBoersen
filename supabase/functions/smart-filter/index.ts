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
// Filer:   index.ts + ../_shared/smart-filter-core.ts (filterlister og
//          instruktionen til modellen). I Dashboard: tilføj den som
//          _shared/smart-filter-core.ts. Kør testsættet før en ændring i den:
//          GitHub → Actions → "Test smart søgning" → Run workflow.
// Secrets: ANTHROPIC_API_KEY (findes allerede, bruges af chat-support).
// Tabeller: rate_limits_anon (add_anon_rate_limits.sql),
//          smart_search_logs (add_smart_search_logs.sql).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODEL, SYSTEM_PROMPT, parseReply, redactForLog } from "../_shared/smart-filter-core.ts";

const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

/* Gem søgningen anonymt i smart_search_logs, så vi kan se hvad smart
   søgning tager fejl af (add_smart_search_logs.sql). Antallet af fundne
   cykler sætter siden bagefter via set_smart_search_result(). En fejl her
   må aldrig koste brugeren svaret. */
async function logSearch(
  supa: ReturnType<typeof createClient>,
  text: string, filters: Record<string, unknown>, keywords: string[],
): Promise<string | null> {
  try {
    const { data, error } = await supa.from("smart_search_logs")
      .insert({ query: redactForLog(text), filters, keywords })
      .select("id").single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    console.error("smart-filter: kunne ikke logge søgningen:", err);
    return null;
  }
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
    const { filters, keywords } = parseReply(reply, text);
    const logId = await logSearch(supa, text, filters, keywords);
    return json({ filters, keywords, logId });
  } catch (err) {
    console.error("smart-filter: uventet fejl", err);
    return json({ error: "Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder." }, 500);
  }
});
