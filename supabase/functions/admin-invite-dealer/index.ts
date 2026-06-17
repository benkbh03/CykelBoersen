// Supabase Edge Function: admin-invite-dealer
// Inviterer en forhandler: opretter auth-bruger UDEN password (sender en invite-mail
// hvor forhandleren selv vælger password) + opretter en verificeret dealer-profil.
// Admin kender således aldrig forhandlerens adgangskode.
//
// Kun admins må kalde den (verificeret via JWT + is_admin).
//
// Deploy: supabase functions deploy admin-invite-dealer
// Påkrævede secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-sat)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── Verificér at kalderen er admin ───────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Ikke logget ind" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: caller }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !caller) return jsonResponse({ error: "Ugyldig session" }, 401);

    const { data: callerProfile } = await supa
      .from("profiles").select("is_admin").eq("id", caller.id).single();
    if (!callerProfile?.is_admin) {
      return jsonResponse({ error: "Kræver admin-rettigheder" }, 403);
    }

    // ── Input ────────────────────────────────────────────────
    const { email, shop_name, cvr, contact, phone, city, address } = await req.json();
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return jsonResponse({ error: "Ugyldig email" }, 400);
    }

    // ── Inviter brugeren: opretter konto UDEN password + sender invite-mail ──
    const { data: inviteData, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(cleanEmail);
    if (inviteErr || !inviteData?.user) {
      const msg = (inviteErr?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exist")) {
        return jsonResponse({ error: "En bruger med denne email findes allerede." }, 409);
      }
      return jsonResponse({ error: "Kunne ikke sende invitation: " + (inviteErr?.message || "ukendt fejl") }, 500);
    }
    const newUserId = inviteData.user.id;

    // ── Opret/forbered en verificeret dealer-profil ──────────
    // Upsert dækker både om en handle_new_user-trigger allerede har lavet rækken
    // og om den ikke har. name-fallback sikrer at et evt. NOT NULL-krav opfyldes.
    const { error: upsertErr } = await supa.from("profiles").upsert({
      id:          newUserId,
      name:        contact || shop_name || "Forhandler",
      shop_name:   shop_name || null,
      cvr:         cvr || null,
      phone:       phone || null,
      city:        city || null,
      address:     address || null,
      seller_type: "dealer",
      verified:    true,
    }, { onConflict: "id" });

    if (upsertErr) {
      console.error("Profil-upsert fejl:", upsertErr);
      return jsonResponse({ error: "Bruger inviteret, men profilen kunne ikke opdateres: " + upsertErr.message }, 500);
    }

    console.log(`Admin ${caller.id} inviterede forhandler ${cleanEmail} (${newUserId})`);
    return jsonResponse({ ok: true, user_id: newUserId, email: cleanEmail });

  } catch (err) {
    console.error("Uventet fejl:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
