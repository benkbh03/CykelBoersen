// Supabase Edge Function: create-boost-checkout
// Deploy: supabase functions deploy create-boost-checkout
//
// Engangsbetaling (mode=payment) for at fremhæve/promovere ÉN annonce i 7 dage.
// Genbruger den eksisterende Stripe-konto (samme STRIPE_SECRET_KEY som
// forhandler-abonnementet). Ingen nyt Stripe-produkt nødvendigt — prisen
// sendes inline via price_data.
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY           – Stripe secret key (sk_test_... ved test)
//   SUPABASE_URL                – (sættes automatisk)
//   SUPABASE_SERVICE_ROLE_KEY   – (sættes automatisk)
//
// "Verify JWT" SKAL være SLÅET TIL for denne function (kun loggede brugere
// må starte en betaling — vi verificerer ejerskab af annoncen).
//
// Betalingsmetoder: automatic_payment_methods viser dem du har aktiveret i
// Stripe (kort, MobilePay, Apple/Google Pay). MobilePay virker i payment-mode (DK).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const BOOST_PRICE_KR = 39;
const BOOST_DAYS     = 7;

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
      throw new Error("Log ind for at fremhæve din annonce");
    }

    const { bike_id, success_url, cancel_url } = await req.json();
    if (!bike_id) throw new Error("Mangler bike_id");

    // Verificér ejerskab + aktiv annonce (service-role læsning)
    const { data: bike } = await supabase
      .from("bikes")
      .select("id, user_id, is_active, brand, model")
      .eq("id", bike_id)
      .single();

    if (!bike || bike.user_id !== user.id) {
      throw new Error("Du kan kun fremhæve dine egne annoncer");
    }
    if (!bike.is_active) {
      throw new Error("Kun aktive annoncer kan fremhæves");
    }

    const base = (success_url || "").split("?")[0];
    const cancelBase = (cancel_url || success_url || "").split("?")[0];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      automatic_payment_methods: { enabled: true },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "dkk",
          unit_amount: BOOST_PRICE_KR * 100,
          product_data: {
            name: `Promovering: ${bike.brand ?? ""} ${bike.model ?? ""}`.trim().slice(0, 250),
            description: `Vist øverst i listen i ${BOOST_DAYS} dage`,
          },
        },
      }],
      metadata: {
        type:    "boost",
        user_id: user.id,
        bike_id: bike_id,
        days:    String(BOOST_DAYS),
      },
      success_url: `${base}?boost_success=true`,
      cancel_url:  `${cancelBase}?boost_cancel=true`,
      locale: "da",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-boost-checkout fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
