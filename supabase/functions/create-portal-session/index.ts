// Supabase Edge Function: create-portal-session
// Deploy: supabase functions deploy create-portal-session
//
// Påkrævede secrets:
//   STRIPE_SECRET_KEY – Stripe secret key
//
// Aktivér Customer Portal i Stripe Dashboard:
//   Stripe Dashboard → Settings → Billing → Customer portal → Aktivér

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
    const { return_url } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    /* ── Kalderens egen session bestemmer hvis portal der åbnes ────────────
       user_id blev tidligere læst fra request-bodyen og brugt direkte til at
       slå en Stripe-kunde op. Enhver der kendte eller gættede et bruger-ID
       kunne dermed få en billing-portal-adgang til DEN forhandlers abonnement
       — kort, fakturaer, opsigelse. Dashboardets "Verify JWT" ville ikke have
       fanget det: anon-nøglen opfylder den indstilling.

       Nu kommer id'et udelukkende fra det verificerede token, og bodyens
       user_id ignoreres. Frontenden må gerne blive ved med at sende det. */
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) throw new Error("Ikke logget ind");
    const { data: { user: caller } } = await supabase.auth.getUser(jwt);
    if (!caller) throw new Error("Ugyldig session");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", caller.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      throw new Error("Intet aktivt Stripe-abonnement fundet for denne bruger");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: return_url ?? "https://xn--cykelbrsen-5cb.dk/",
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-portal-session fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
