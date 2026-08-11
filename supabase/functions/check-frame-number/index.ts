// Supabase Edge Function: check-frame-number
// Modtager et stelnummer fra sælgeren og gemmer KUN de sidste 4 cifre på
// annoncen — ALDRIG det fulde nummer. Resten kasseres straks.
//
// Hvorfor ikke gemme nummeret: et offentligt fuldt stelnummer kan misbruges til
// at "hvidvaske" en stjålet cykel. Køber får det fulde nummer af sælger ved
// overleveringen og kan dér holde det op mod stellet.
//
// Nummeret sendes IKKE videre til nogen. Funktionen slog tidligere op mod det
// amerikanske register BikeIndex, men det er fjernet: danske cykeltyverier
// registreres hos politiet og står stort set aldrig i BikeIndex, så et
// "ingen match" var nær-intetsigende — og et match var fuzzy (Levenshtein
// under 3 tegn), altså kun et MULIGT match. Signalet var for svagt til at
// retfærdiggøre at sende danske sælgeres stelnumre til USA. Køberen henvises
// i stedet til politi.dk, som er den danske, autoritative kilde.
//
// Værdien i feltet ligger i forhåndsbindingen: sælger har oplyst et nummer
// offentligt FØR mødet, så en løgn kan kontrolleres ved overdragelsen.
//
// Kald: POST { bike_id, frame_number }   Authorization: Bearer <bruger-JWT>
//   → autoriserer hvis caller ejer annoncen ELLER er admin.
//
// Deploy: Supabase Dashboard → Edge Functions → check-frame-number → Deploy.
// Påkrævede secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-sat).
// Ingen udgående netværkskald.

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

    /* ── Gem KUN de sidste 4 cifre ──────────────────────────
       `serial` forlader aldrig denne funktion: den bruges udelukkende til at
       udlede l4 og forsvinder når kaldet er slut. Status 'stored' betyder
       "sælger har oplyst et nummer" — ikke at vi har verificeret noget.
       frame_check_ref sættes til null: feltet indeholdt BikeIndex-links, og
       der er ikke længere et eksternt register at henvise til. */
    const l4 = last4(serial);

    const { error: updErr } = await supa.from("bikes").update({
      frame_last4:        l4,
      frame_check_status: "stored",
      frame_check_at:     new Date().toISOString(),
      frame_check_ref:    null,
    }).eq("id", bike_id);
    if (updErr) return json({ error: "Kunne ikke gemme resultat" }, 500);

    return json({ ok: true, status: "stored", last4: l4 });
  } catch (err) {
    console.error("check-frame-number fejl:", err);
    return json({ error: String(err) }, 500);
  }
});
