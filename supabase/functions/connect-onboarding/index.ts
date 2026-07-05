// Supabase Edge Function: connect-onboarding
// Deploy: supabase functions deploy connect-onboarding
//
// Stripe Connect onboarding for udlejnings-forhandlere. Opretter (eller genbruger)
// en Stripe Express-konto for forhandleren og returnerer et onboarding-link, hvor
// Stripe håndterer KYC, bankkonto og ToS-accept. Uden en fuldført Connect-konto kan
// forhandleren ikke modtage udlejnings-betalinger.
//
// Genbruger samme Stripe-konto som resten af appen (STRIPE_SECRET_KEY).
//
// "Verify JWT" SKAL være SLÅET TIL — kun loggede forhandlere må onboarde.
//
// Påkrævede secrets (Dashboard → Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY, SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto)
//
// FORUDSÆTNING: Stripe Connect er aktiveret i Stripe Dashboard.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

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

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verificér bruger via medsendt JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      throw new Error("Log ind for at komme i gang med udlejning");
    }

    const { return_url } = await req.json().catch(() => ({}));

    // Kun forhandlere må onboarde til Connect
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, seller_type, shop_name, city, stripe_account_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.seller_type !== "dealer") {
      throw new Error("Kun forhandlere kan tilbyde udlejning");
    }

    // Opret Express-konto hvis forhandleren ikke allerede har én
    let accountId = profile.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "DK",
        email: user.email ?? undefined,
        business_type: "company",
        capabilities: {
          transfers:     { requested: true },
          card_payments: { requested: true },
        },
        business_profile: {
          name: profile.shop_name ?? undefined,
          product_description: "Cykeludlejning via CykelBørsen",
        },
        metadata: { user_id: user.id },
      });
      accountId = account.id;

      await supabase
        .from("profiles")
        .update({ stripe_account_id: accountId, stripe_account_status: "pending" })
        .eq("id", user.id);
    }

    // Onboarding-link (Stripe-hostet). refresh_url bruges hvis linket udløber.
    const base = (return_url || "").split("?")[0] || "https://xn--cykelbrsen-5cb.dk/bliv-udlejer";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}?connect_refresh=true`,
      return_url:  `${base}?connect_return=true`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("connect-onboarding fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
