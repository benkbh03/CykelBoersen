// Supabase Edge Function: delete-account
// Deploy: supabase functions deploy delete-account

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Brug anon-klient med brugerens auth-header til at verificere session
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = user.id;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Hent brugerens cykler (bruges til at slette relaterede data)
    const { data: bikes } = await adminClient
      .from("bikes")
      .select("id")
      .eq("user_id", userId);
    const bikeIds = (bikes || []).map((b: { id: string }) => b.id);

    // 2. Slet ting der refererer til brugerens cykler (fremmednøgler)
    if (bikeIds.length > 0) {
      await adminClient.from("saved_bikes").delete().in("bike_id", bikeIds);
      await adminClient.from("bike_images").delete().in("bike_id", bikeIds);
    }

    // 3. Slet brugerens egne rækker
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

    // Slet auth-bruger (skal være sidst)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Auth delete fejl: ${deleteError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Fejl ved sletning af konto:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
