// Supabase Edge Function: rental-booking-action
// Deploy: supabase functions deploy rental-booking-action
//
// Livscyklus-handlinger på en udlejnings-booking, med tilhørende Stripe-refusion:
//   - cancel        : afbestil → fuld refusion (leje + depositum), transfer reverseres.
//                     Lejeren kun til og med to dage før første lejedag; forhandleren altid.
//   - return_ok     : forhandler markerer afleveret uden skade → depositum refunderes
//   - return_damage : forhandler registrerer skade og beholder keep_amount kr. af
//                     depositummet (standard: hele). Beløbet overføres til forhandleren,
//                     resten refunderes lejeren.
//
// Efter hver handling sendes mails via notify-message (med service-nøglen).
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
    // Mails må aldrig få en handling til at fejle, når pengene allerede er flyttet.
    const notify = async (body: Record<string, unknown>) => {
      try { await supabase.functions.invoke("notify-message", { body, headers: { "x-internal-key": SUPABASE_SERVICE_KEY } }); }
      catch (e) { console.error("notify-message fejlede:", e); }
    };

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Log ind igen");

    const { booking_id, action, keep_amount } = await req.json();
    if (!booking_id || !action) throw new Error("Mangler booking_id eller action");

    const { data: b } = await supabase
      .from("rental_bookings")
      .select("id, renter_id, dealer_id, start_date, status, deposit_amount, platform_fee, stripe_payment_intent_id")
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
      // Forhandleren må altid afbestille. Lejeren kun til og med to dage før
      // første lejedag, så forhandleren kan nå at leje cyklen ud igen, og så
      // man ikke kan cykle hele perioden og bagefter få alt refunderet.
      if (!isDealer) {
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
        const cutoff = new Date(Date.parse(today) + 2 * 86400000).toISOString().slice(0, 10);
        if (b.start_date < cutoff) {
          throw new Error("Du kan kun afbestille indtil to dage før lejen starter. Skriv til forhandleren.");
        }
      }
      if (pi) {
        await stripe.refunds.create({
          payment_intent: pi,
          reverse_transfer: true,       // træk forhandlerens andel tilbage
          // og platformens kommission + depositum, hvis der blev opkrævet et gebyr
          ...((b.platform_fee || 0) + (b.deposit_amount || 0) > 0 ? { refund_application_fee: true } : {}),
        });
      }
      await supabase.from("rental_bookings")
        .update({ status: "refunded", deposit_status: "refunded" })
        .eq("id", booking_id);
      await notify({ type: "rental_cancelled", booking_id, by: isDealer ? "dealer" : "renter" });

    } else if (action === "return_ok") {
      if (!isDealer) throw new Error("Kun forhandleren kan markere aflevering");
      // Refundér kun depositum (ligger i platformens application_fee)
      if (pi && b.deposit_amount > 0) {
        await stripe.refunds.create({ payment_intent: pi, amount: b.deposit_amount * 100 });
      }
      await supabase.from("rental_bookings")
        .update({ status: "completed", deposit_status: b.deposit_amount > 0 ? "refunded" : "none" })
        .eq("id", booking_id);
      await notify({ type: "rental_returned", booking_id, kept: 0 });

    } else if (action === "return_damage") {
      if (!isDealer) throw new Error("Kun forhandleren kan registrere skade");
      const deposit = b.deposit_amount || 0;
      const keep = deposit > 0
        ? Math.min(deposit, Math.max(0, Math.round(Number(keep_amount ?? deposit) || 0)))
        : 0;
      if (pi && keep > 0) {
        // Depositum ligger hos platformen (application fee). Den beholdte del
        // overføres til forhandleren, knyttet til samme betaling.
        const { data: dealer } = await supabase
          .from("profiles").select("stripe_account_id").eq("id", b.dealer_id).single();
        if (!dealer?.stripe_account_id) throw new Error("Forhandleren har ingen udbetalingskonto");
        const intent = await stripe.paymentIntents.retrieve(pi);
        await stripe.transfers.create({
          amount: keep * 100,
          currency: "dkk",
          destination: dealer.stripe_account_id,
          source_transaction: intent.latest_charge as string,
          metadata: { booking_id, reason: "depositum_skade" },
        });
      }
      if (pi && deposit - keep > 0) {
        await stripe.refunds.create({ payment_intent: pi, amount: (deposit - keep) * 100 });
      }
      await supabase.from("rental_bookings")
        .update({ status: "completed", deposit_status: keep > 0 ? "captured" : deposit > 0 ? "refunded" : "none" })
        .eq("id", booking_id);
      await notify({ type: "rental_returned", booking_id, kept: keep });

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
