// Supabase Edge Function: verify-cvr
// Verificerer et dansk CVR-nummer mod CVR-registret (cvrapi.dk) ved forhandler-
// tilmelding, så fake-CVR-ansøgninger (fx "00000000") aldrig når admin-køen.
//
// Kald:  POST { cvr: "12345678" }        (INGEN auth — anonyme kan ansøge)
// Svar:  { valid, name?, address?, zipcode?, city?, ceased?, reason }
//   reason: 'ok' | 'format' | 'fake' | 'not_found' | 'ceased' | 'lookup_error' | 'method'
//
// Fail-open ved lookup_error: hvis registret ikke kan nås, BLOKERES forhandleren
// IKKE (så et API-udfald ikke rammer rigtige butikker) — admin godkender stadig
// manuelt som backstop. Hårde blokke er kun format/fake/not_found/ceased.
//
// Deploy: Supabase Dashboard → Edge Functions → verify-cvr → Deploy.
//   "Verify JWT" SKAL være SLÅET FRA (anonyme forhandler-ansøgninger).
//   Ingen secrets nødvendige. cvrapi.dk kræver blot en identificerende User-Agent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// cvrapi.dk beder om en identificerende User-Agent (app-navn + kontakt).
const USER_AGENT = "CykelBoersen CVR-verify - hej@cykelboersen.dk";

// Alle-ens cifre (00000000, 11111111 …) er aldrig et rigtigt CVR.
function isObviousFake(cvr: string): boolean {
  return /^(\d)\1{7}$/.test(cvr);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ valid: false, reason: "method" }, 405);

  let cvr = "";
  try {
    const body = await req.json();
    cvr = String(body?.cvr ?? "").replace(/\D/g, "");
  } catch {
    return json({ valid: false, reason: "format" }, 400);
  }

  if (!/^\d{8}$/.test(cvr)) return json({ valid: false, reason: "format" });
  if (isObviousFake(cvr))   return json({ valid: false, reason: "fake" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `https://cvrapi.dk/api?search=${cvr}&country=dk`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Accept": "application/json", "User-Agent": USER_AGENT },
    });

    if (res.status === 404) return json({ valid: false, reason: "not_found" });
    if (!res.ok)            return json({ valid: false, reason: "lookup_error" });

    const data = JSON.parse(await res.text());
    if (!data?.name || data?.error) return json({ valid: false, reason: "not_found" });

    // cvrapi returnerer 'enddate' (ophørsdato) hvis virksomheden er lukket.
    const ceased = !!data.enddate;

    return json({
      valid:   !ceased,
      ceased,
      name:    data.name || null,
      address: data.address || null,
      zipcode: data.zipcode ? String(data.zipcode) : null,
      city:    data.city || null,
      reason:  ceased ? "ceased" : "ok",
    });
  } catch (_e) {
    // Timeout / netværk / parse-fejl → fail-open (admin verificerer manuelt).
    return json({ valid: false, reason: "lookup_error" });
  } finally {
    clearTimeout(timer);
  }
});
