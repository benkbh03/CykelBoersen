// Supabase Edge Function: rental-booking-action
// Deploy: supabase functions deploy rental-booking-action
//
// Livscyklus-handlinger på en udlejnings-booking, med tilhørende Stripe-refusion:
//   - cancel        : afbestil → fuld refusion (leje + depositum), transfer reverseres
//   - return_ok     : forhandler markerer afleveret uden skade → depositum refunderes
//   - return_damage : forhandler registrerer skade → depositum beholdes (ingen refusion)
//
// "Verify JWT" SKAL være SLÅET TIL. Kun bookingens lejer eller forhandler må handle.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto).

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Log ind igen");

    const { booking_id, action } = await req.json();
    if (!booking_id || !action) throw new Error("Mangler booking_id eller action");

    const { data: b } = await supabase
      .from("rental_bookings")
      .select("id, renter_id, dealer_id, status, deposit_amount, stripe_payment_intent_id")
      .eq("id", booking_id)
      .single();
    if (!b) throw new Error("Booking findes ikke");

    const isRenter = b.renter_id === user.id;
    const isDealer = b.dealer_id === user.id;
    if (!isRenter && !isDealer) throw new Error("Du har ikke adgang til denne booking");

    if (!["confirmed", "active"].includes(b.status)) {
      throw new Error("Bookingen kan ikke ændres i sin nuværende status");
    }
    const pi = b.stripe_payment_intent_id;

    if (action === "cancel") {
      // Både lejer og forhandler må afbestille → fuld refusion
      if (pi) {
        await stripe.refunds.create({
          payment_intent: pi,
          reverse_transfer: true,       // træk forhandlerens andel tilbage
          refund_application_fee: true, // og platformens kommission
        });
      }
      await supabase.from("rental_bookings")
        .update({ status: "refunded", deposit_status: "refunded" })
        .eq("id", booking_id);

    } else if (action === "return_ok") {
      if (!isDealer) throw new Error("Kun forhandleren kan markere aflevering");
      // Refundér kun depositum (ligger i platformens application_fee)
      if (pi && b.deposit_amount > 0) {
        await stripe.refunds.create({ payment_intent: pi, amount: b.deposit_amount * 100 });
      }
      await supabase.from("rental_bookings")
        .update({ status: "completed", deposit_status: b.deposit_amount > 0 ? "refunded" : "none" })
        .eq("id", booking_id);

    } else if (action === "return_damage") {
      if (!isDealer) throw new Error("Kun forhandleren kan registrere skade");
      // Behold depositum (ingen refusion) — platform + forhandler afregner separat
      await supabase.from("rental_bookings")
        .update({ status: "completed", deposit_status: b.deposit_amount > 0 ? "captured" : "none" })
        .eq("id", booking_id);

    } else {
      throw new Error("Ukendt handling");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("rental-booking-action fejl:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
