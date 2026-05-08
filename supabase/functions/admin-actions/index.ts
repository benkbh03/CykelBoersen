// Supabase Edge Function: admin-actions
// Server-side gating af admin-handlinger (godkend/afvis forhandler, godkend/afvis ID).
// Erstatter de direkte supabase.from('profiles').update(...) kald fra browseren der
// gjorde alle is_admin-tjek til UI-only.
//
// Deploy: supabase functions deploy admin-actions
//
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

const ALLOWED_ACTIONS = new Set([
  "approve_dealer", "reject_dealer", "revoke_dealer",
  "approve_id",     "reject_id",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── Verificér caller-JWT ─────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Ikke logget ind" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: caller }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !caller) return jsonResponse({ error: "Ugyldig session" }, 401);

    // ── Verificér admin-status ──────────────────────────────
    const { data: callerProfile } = await supa
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();

    if (!callerProfile?.is_admin) {
      return jsonResponse({ error: "Kræver admin-rettigheder" }, 403);
    }

    // ── Parse handling ──────────────────────────────────────
    const { action, target_user_id } = await req.json();

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return jsonResponse({ error: "Ugyldig handling" }, 400);
    }
    if (!target_user_id || typeof target_user_id !== "string") {
      return jsonResponse({ error: "target_user_id påkrævet" }, 400);
    }

    let updates: Record<string, unknown> = {};
    switch (action) {
      case "approve_dealer":
        updates = { verified: true, seller_type: "dealer" };
        break;
      case "reject_dealer":
        updates = { seller_type: "private", verified: false };
        break;
      case "revoke_dealer":
        updates = { verified: false };
        break;
      case "approve_id":
        updates = { id_verified: true, id_pending: false };
        break;
      case "reject_id":
        updates = { id_pending: false, id_doc_url: null };
        break;
    }

    const { error: updateErr } = await supa
      .from("profiles")
      .update(updates)
      .eq("id", target_user_id);

    if (updateErr) {
      console.error("Update fejl:", updateErr);
      return jsonResponse({ error: "Kunne ikke opdatere profil" }, 500);
    }

    console.log(`Admin ${caller.id} udførte ${action} på ${target_user_id}`);
    return jsonResponse({ ok: true, action, target_user_id });

  } catch (err) {
    console.error("Uventet fejl:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
