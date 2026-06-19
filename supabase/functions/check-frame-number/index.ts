// Supabase Edge Function: check-frame-number
// Tjekker et cykel-stelnummer mod tyveriregisteret BikeIndex og gemmer KUN
// resultatet + de sidste 4 cifre på annoncen — ALDRIG det fulde stelnummer.
//
// Hvorfor ikke gemme nummeret: et offentligt fuldt stelnummer kan misbruges til
// at "hvidvaske" en stjålet cykel. Vi sender nummeret til BikeIndex for opslaget
// og kasserer det derefter. Køber får det fulde nummer af sælger ved overlevering.
//
// BikeIndex v3-søgning er offentlig (ingen auth). serial-match er fuzzy
// (Levenshtein < 3 tegn) → "match" betyder MULIGT match, ikke en garanti.
//
// Kald: POST { bike_id, frame_number }   Authorization: Bearer <bruger-JWT>
//   → autoriserer hvis caller ejer annoncen ELLER er admin.
//
// Deploy: Supabase Dashboard → Edge Functions → check-frame-number → Deploy.
// Påkrævede secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-sat).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

// Rens stelnummer: trim, fjern dobbelt-mellemrum. Returnér "" hvis ugyldigt.
function cleanSerial(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  return s.length >= 4 && s.length <= 50 ? s : "";
}

function last4(serial: string): string {
  const alnum = serial.replace(/[^a-zA-Z0-9]/g, "");
  return alnum.slice(-4).toUpperCase();
}

// Slå op mod BikeIndex. Returnerer { status, ref }.
//   'clear' = ingen stjålne match · 'match' = muligt match · 'error' = kunne ikke tjekke
async function checkBikeIndex(serial: string): Promise<{ status: string; ref: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `https://bikeindex.org/api/v3/search?per_page=10&stolenness=stolen&serial=${encodeURIComponent(serial)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Accept": "application/json", "User-Agent": "CykelboersenFrameCheck/1.0" },
    });
    if (!res.ok) return { status: "error", ref: null };
    const data = JSON.parse(await res.text());
    const bikes = Array.isArray(data?.bikes) ? data.bikes : [];
    if (bikes.length > 0) {
      const id = bikes[0]?.id;
      return { status: "match", ref: id ? `https://bikeindex.org/bikes/${id}` : "https://bikeindex.org" };
    }
    return { status: "clear", ref: null };
  } catch (_e) {
    return { status: "error", ref: null };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ── Auth ────────────────────────────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Ikke logget ind" }, 401);
    const { data: { user: caller } } = await supa.auth.getUser(jwt);
    if (!caller) return json({ error: "Ugyldig session" }, 401);

    // ── Parse + valider ─────────────────────────────────────
    const { bike_id, frame_number } = await req.json().catch(() => ({}));
    if (!bike_id || typeof bike_id !== "string") return json({ error: "bike_id påkrævet" }, 400);
    const serial = cleanSerial(frame_number);
    if (!serial) return json({ error: "Ugyldigt stelnummer (4–50 tegn)" }, 400);

    // ── Autorisér: ejer eller admin ─────────────────────────
    const { data: bike } = await supa.from("bikes").select("id, user_id").eq("id", bike_id).single();
    if (!bike) return json({ error: "Annonce ikke fundet" }, 404);
    if (bike.user_id !== caller.id) {
      const { data: p } = await supa.from("profiles").select("is_admin").eq("id", caller.id).single();
      if (!p?.is_admin) return json({ error: "Ingen adgang til denne annonce" }, 403);
    }

    // ── Tjek mod BikeIndex + gem KUN resultat + sidste 4 ────
    const { status, ref } = await checkBikeIndex(serial);
    const l4 = last4(serial);

    const { error: updErr } = await supa.from("bikes").update({
      frame_last4:        l4,
      frame_check_status: status,
      frame_check_at:     new Date().toISOString(),
      frame_check_ref:    ref,
    }).eq("id", bike_id);
    if (updErr) return json({ error: "Kunne ikke gemme resultat" }, 500);

    return json({ ok: true, status, last4: l4, ref });
  } catch (err) {
    console.error("check-frame-number fejl:", err);
    return json({ error: String(err) }, 500);
  }
});
