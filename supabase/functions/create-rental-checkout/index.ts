// Supabase Edge Function: create-rental-checkout
// Deploy: supabase functions deploy create-rental-checkout
//
// Opretter en udlejnings-booking + Stripe Checkout Session som DESTINATION
// CHARGE: kunden betaler leje + depositum, platformen beholder kommission +
// depositum (via application_fee_amount), og resten overføres til forhandlerens
// Connect-konto. Depositum tilbagebetales efter aflevering (Fase 3).
//
// "Verify JWT" SKAL være SLÅET TIL — kun loggede brugere kan booke.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto).
//
// TEST: skift midlertidigt Stripe-secrets til test-værdier for at teste hele
// flowet med testkort (4242…) uden rigtige penge. Boost kører i test i det vindue.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PLATFORM_FEE_PCT = 12; // hold i sync med js/rental-data.js
const BASE_URL = "https://xn--cykelbrsen-5cb.dk";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.floor((e - s) / 86400000) + 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Log ind for at booke");

    const { item_id, start_date, end_date, success_url, cancel_url } = await req.json();
    if (!item_id || !start_date || !end_date) throw new Error("Mangler booking-oplysninger");

    // Hent item + forhandlerens Connect-konto
    const { data: item } = await supabase
      .from("rental_items")
      .select("id, title, dealer_id, daily_rate, weekly_rate, deposit_amount, min_days, max_days, is_active, profiles!dealer_id(stripe_account_id, stripe_account_status)")
      .eq("id", item_id)
      .single();

    if (!item || !item.is_active) throw new Error("Udlejningscyklen er ikke tilgængelig");

    const dealer = item.profiles as any;
    if (!dealer?.stripe_account_id || dealer.stripe_account_status !== "enabled") {
      throw new Error("Forhandleren kan ikke modtage bookinger endnu");
    }
    if (item.dealer_id === user.id) throw new Error("Du kan ikke booke din egen udlejningscykel");

    // Prisberegning
    const days = daysBetweenInclusive(start_date, end_date);
    if (days < 1) throw new Error("Ugyldig periode");

    let rental = days * item.daily_rate;
    if (item.weekly_rate && days >= 7) {
      const weeks = Math.floor(days / 7);
      const rem   = days % 7;
      rental = weeks * item.weekly_rate + rem * item.daily_rate;
    }
    const deposit = item.deposit_amount || 0;
    const fee     = Math.round(rental * PLATFORM_FEE_PCT / 100);
    const total   = rental + deposit;

    // Opret pending booking (race-sikker availability-check i RPC)
    const { data: bookingId, error: rpcErr } = await supabase.rpc("create_rental_booking", {
      p_item_id:       item_id,
      p_renter_id:     user.id,
      p_start:         start_date,
      p_end:           end_date,
      p_days:          days,
      p_rental_amount: rental,
      p_deposit:       deposit,
      p_fee:           fee,
      p_total:         total,
    });
    if (rpcErr) throw new Error(rpcErr.message || "Kunne ikke reservere perioden");

    const base       = (success_url || `${BASE_URL}/udlejning/lejeaftaler`).split("?")[0];
    const cancelBase = (cancel_url || `${BASE_URL}/udlejning/${item_id}`).split("?")[0];

    const line_items: any[] = [{
      quantity: 1,
      price_data: {
        currency: "dkk",
        unit_amount: rental * 100,
        product_data: { name: `Leje: ${item.title}`.slice(0, 250), description: `${days} dage (${start_date} – ${end_date})` },
      },
    }];
    if (deposit > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "dkk",
          unit_amount: deposit * 100,
          product_data: { name: "Depositum (tilbagebetales efter aflevering)" },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      payment_intent_data: {
        // Platformen beholder kommission + depositum; resten til forhandleren.
        application_fee_amount: (fee + deposit) * 100,
        transfer_data: { destination: dealer.stripe_account_id },
      },
      metadata: { type: "rental", booking_id: bookingId, item_id, renter_id: user.id },
      success_url: `${base}?rental_success=true`,
      cancel_url:  `${cancelBase}?rental_cancel=true`,
      locale: "da",
    });

    // Knyt session til bookingen (idempotens-nøgle for webhook-bekræftelse)
    await supabase.from("rental_bookings").update({ stripe_session_id: session.id }).eq("id", bookingId);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-rental-checkout fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
