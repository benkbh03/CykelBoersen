// Supabase Edge Function: stripe-webhook
// Deploy: supabase functions deploy stripe-webhook
//
// Påkrævede secrets:
//   STRIPE_SECRET_KEY              – Stripe secret key
//   STRIPE_WEBHOOK_SECRET          – Signing secret, endpoint "events on your account"
//   STRIPE_CONNECT_WEBHOOK_SECRET  – Signing secret, endpoint "events on Connected
//                                    accounts" (valgfri indtil Connect tages i brug)
//
// Opsæt TO webhooks i Stripe Dashboard → Developers → Webhooks (samme URL):
//   URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   1) "Events on your account":
//     - checkout.session.completed
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_failed
//   2) "Events on Connected accounts" (Connect / udlejning):
//     - account.updated
//   Connect-endpointen har sin EGEN signing secret — deraf to secrets ovenfor.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// .trim() — fjern evt. mellemrum/linjeskift fra copy-paste af whsec_ (ellers
// fejler signatur-verifikationen med "signing secret contains whitespace").
const webhookSecret        = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
// Connect-endpointen ("events on Connected accounts") har sin egen secret.
// account.updated fra forhandlernes Express-konti ankommer via den.
const connectWebhookSecret = (Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "").trim();
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body      = await req.text();

  // Verificér mod begge endpoints' secrets — eventen er gyldig hvis én matcher.
  let event: Stripe.Event | null = null;
  let lastErr = "";
  for (const secret of [webhookSecret, connectWebhookSecret]) {
    if (!secret) continue;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature!, secret);
      break;
    } catch (err) {
      lastErr = err.message;
    }
  }
  if (!event) {
    console.error("Webhook signatur fejl:", lastErr || "ingen secrets konfigureret");
    return new Response(`Webhook error: ${lastErr || "no secrets configured"}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  try {
    switch (event.type) {

      // ── Betaling gennemført → aktiver forhandler / boost ──
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Engangsbetaling: promovering/boost af annonce
        if (session.mode === "payment" && session.metadata?.type === "boost") {
          const userId = session.metadata?.user_id;
          const bikeId = session.metadata?.bike_id;
          const days   = parseInt(session.metadata?.days ?? "7", 10) || 7;
          if (!userId || !bikeId) break;

          const { error } = await supabase.rpc("apply_paid_boost", {
            p_session_id: session.id,
            p_user_id:    userId,
            p_bike_id:    bikeId,
            p_days:       days,
            p_amount_kr:  Math.round((session.amount_total ?? 0) / 100),
          });

          if (error) console.error("apply_paid_boost fejlede:", error);
          else        console.log(`Boost aktiveret for annonce ${bikeId} (${days} dage)`);
          break;
        }

        // Udlejnings-booking: bekræft efter gennemført betaling (idempotent)
        if (session.mode === "payment" && session.metadata?.type === "rental") {
          /* Perioden holdes kun i 30 minutter. Betalte lejeren lige efter, kan en
             anden have nået at booke de samme dage. Så refunderes betalingen i
             stedet for at give to lejere samme cykel. */
          const { data: pend } = await supabase
            .from("rental_bookings")
            .select("id, item_id, start_date, end_date, status, deposit_amount, platform_fee, rental_items!item_id(quantity)")
            .eq("stripe_session_id", session.id)
            .maybeSingle();
          if (pend?.status === "pending_payment") {
            const { count } = await supabase
              .from("rental_bookings")
              .select("id", { count: "exact", head: true })
              .eq("item_id", pend.item_id)
              .neq("id", pend.id)
              .in("status", ["confirmed", "active"])
              .lte("start_date", pend.end_date)
              .gte("end_date", pend.start_date);
            if ((count ?? 0) >= ((pend as any).rental_items?.quantity ?? 1)) {
              console.warn(`Udlejning: perioden er optaget, refunderer session ${session.id}`);
              await stripe.refunds.create({
                payment_intent: session.payment_intent as string,
                reverse_transfer: true,
                ...((pend.deposit_amount || 0) + (pend.platform_fee || 0) > 0 ? { refund_application_fee: true } : {}),
              });
              await supabase.from("rental_bookings")
                .update({ status: "refunded", deposit_status: "refunded", stripe_payment_intent_id: session.payment_intent as string })
                .eq("id", pend.id);
              try {
                await supabase.functions.invoke("notify-message", {
                  headers: { "x-internal-key": SUPABASE_SERVICE },
                  body: { type: "rental_cancelled", booking_id: pend.id, by: "system" },
                });
              } catch (e) { console.error("notify-message (optaget) fejlede:", e); }
              break;
            }
          }

          const { data: confirmedId, error } = await supabase.rpc("confirm_rental_booking", {
            p_session_id:        session.id,
            p_payment_intent_id: (session.payment_intent as string) ?? null,
          });
          if (error) {
            console.error("confirm_rental_booking fejlede:", error);
          } else if (confirmedId) {
            // Kun ved FRISK bekræftelse (gensendt webhook returnerer null → ingen dobbelt-mail)
            console.log(`Udlejnings-booking bekræftet (session ${session.id})`);
            // Afvent mailen: en ikke-afventet invoke kan blive afbrudt, når svaret er sendt.
            try {
              await supabase.functions.invoke("notify-message", {
                headers: { "x-internal-key": SUPABASE_SERVICE },
                body: { type: "rental_booked", booking_id: confirmedId },
              });
            } catch (e) { console.error("notify-message (rental_booked) fejlede:", e); }
          }
          break;
        }

        // Abonnement: forhandler
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.user_id;
        if (!userId) break;

        const subscriptionId = session.subscription as string;

        const { error } = await supabase.from("profiles").update({
          verified:                    true,
          stripe_subscription_id:      subscriptionId,
          stripe_subscription_status:  "active",
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (checkout.session.completed):", error);
        else        console.log(`Forhandler aktiveret: ${userId}`);
        break;
      }

      // ── Abonnement opdateret (plan-skift, genaktivering, pause) ──
      case "customer.subscription.updated": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        const isActive = sub.status === "active" || sub.status === "trialing";

        const { error } = await supabase.from("profiles").update({
          verified:                   isActive,
          stripe_subscription_id:     sub.id,
          stripe_subscription_status: sub.status,
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (subscription.updated):", error);
        else        console.log(`Abonnement opdateret [${sub.status}] for: ${userId}`);
        break;
      }

      // ── Abonnement annulleret → deaktiver forhandler ──
      case "customer.subscription.deleted": {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;

        const { error } = await supabase.from("profiles").update({
          verified:                   false,
          stripe_subscription_status: "canceled",
        }).eq("id", userId);

        if (error) console.error("DB opdatering fejlede (subscription.deleted):", error);
        else        console.log(`Forhandler deaktiveret: ${userId}`);
        break;
      }

      // ── Connect-konto opdateret → synk forhandlerens udlejnings-status ──
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        let status = "pending";
        if (account.charges_enabled && account.payouts_enabled) status = "enabled";
        else if (account.requirements?.disabled_reason)        status = "disabled";

        const { error } = await supabase.from("profiles").update({
          stripe_account_status: status,
        }).eq("stripe_account_id", account.id);

        if (error) console.error("DB opdatering fejlede (account.updated):", error);
        else        console.log(`Connect-konto [${status}]: ${account.id}`);
        break;
      }

      // ── Betaling mislykkedes → marker som restance ──
      case "invoice.payment_failed": {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (!customerId) break;

        const { error } = await supabase.from("profiles").update({
          stripe_subscription_status: "past_due",
        }).eq("stripe_customer_id", customerId);

        if (error) console.error("DB opdatering fejlede (payment_failed):", error);
        else        console.log(`Betaling mislykkedes for kunde: ${customerId}`);
        break;
      }

      default:
        console.log(`Ubehandlet webhook-event: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook handler fejl:", err);
    return new Response("Intern fejl", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
