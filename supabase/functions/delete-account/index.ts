// Supabase Edge Function: delete-account
// Deploy: supabase functions deploy delete-account

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Supabase gateway verificerer JWT — vi udtrækker blot user id fra payload
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = parseJwtPayload(token);
  const userId = payload?.sub as string | undefined;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Hent brugerens cykler
    const { data: bikes } = await adminClient
      .from("bikes").select("id").eq("user_id", userId);
    const bikeIds = (bikes || []).map((b: { id: string }) => b.id);

    // 2. Slet FK-afhængigheder til cykler
    if (bikeIds.length > 0) {
      await adminClient.from("saved_bikes").delete().in("bike_id", bikeIds);
      await adminClient.from("bike_images").delete().in("bike_id", bikeIds);
    }

    // 3. Slet brugerens øvrige data
    await adminClient.from("saved_searches").delete().eq("user_id", userId);
    await adminClient.from("saved_bikes").delete().eq("user_id", userId);
    await adminClient.from("reviews").delete().or(`reviewer_id.eq.${userId},reviewed_user_id.eq.${userId}`);
    await adminClient.from("messages").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await adminClient.from("dealer_applications").delete().eq("user_id", userId);
    await adminClient.from("id_applications").delete().eq("user_id", userId);

    // 4. Slet cykler og profil
    if (bikeIds.length > 0) {
      await adminClient.from("bikes").delete().eq("user_id", userId);
    }
    await adminClient.from("profiles").delete().eq("id", userId);

    // 5. Slet auth-bruger sidst
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Fejl ved sletning:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
