// Supabase Edge Function: delete-account
// Deploy: supabase functions deploy delete-account

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
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

  // Verificer brugerens JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Hent bruger fra JWT
  const { data: { user }, error: userError } = await adminClient.auth.getUser(
    authHeader.replace("Bearer ", "")
  );

  if (userError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const userId = user.id;

  try {
    // Slet brugerens data i rækkefølge (fremmednøgler først)
    await adminClient.from("saved_searches").delete().eq("user_id", userId);
    await adminClient.from("saved_bikes").delete().eq("user_id", userId);
    await adminClient.from("reviews").delete().eq("reviewer_id", userId);
    await adminClient.from("messages").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    // Hent cykel-id'er så vi kan slette billeder
    const { data: bikes } = await adminClient
      .from("bikes")
      .select("id")
      .eq("user_id", userId);

    if (bikes && bikes.length > 0) {
      const bikeIds = bikes.map((b: { id: string }) => b.id);
      await adminClient.from("bike_images").delete().in("bike_id", bikeIds);
      await adminClient.from("bikes").delete().eq("user_id", userId);
    }

    // Slet profil
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
