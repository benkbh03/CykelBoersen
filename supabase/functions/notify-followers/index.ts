// Supabase Edge Function: notify-followers
// Sender e-mail til alle der følger en forhandler når forhandleren opretter en ny annonce.
//
// Deploy: supabase functions deploy notify-followers
//
// Kaldes som fire-and-forget fra klienten efter ny annonce-oprettelse:
//   supabase.functions.invoke('notify-followers', { body: { bike_id, dealer_id } })
//
// Påkrævede secrets:
//   RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Valgfri:
//   EMAIL_FROM
//
// Layoutet ligger i ../_shared/email.ts og skal deployes sammen med denne fil.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SITE, esc, heading, button, bikeCard, layout, sendEmail as send } from "../_shared/email.ts";

const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sendEmail(to: string, subject: string, html: string) {
  return send(RESEND_API_KEY, to, subject, html);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Verificér caller-JWT ─────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Ikke logget ind" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: caller }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Ugyldig session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { bike_id, dealer_id } = await req.json();
    if (!bike_id || !dealer_id) {
      return new Response(JSON.stringify({ error: "bike_id og dealer_id påkrævet" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verificér ejerskab + once-per-bike guard ─────────────
    const { data: bikeRow } = await supa
      .from("bikes")
      .select("id, user_id, brand, model, price, type, year, city, notify_sent_at, created_at")
      .eq("id", bike_id)
      .single();

    if (!bikeRow) {
      return new Response(JSON.stringify({ error: "Annonce ikke fundet" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (bikeRow.user_id !== dealer_id || caller.id !== dealer_id) {
      return new Response(JSON.stringify({ error: "Ikke ejer af annoncen" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Annoncen skal være oprettet inden for sidste 10 min — forhindrer
    // re-notifikation efter sletning/genoprettelse for samme følgere
    const ageMs = Date.now() - new Date(bikeRow.created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "too_old" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic once-per-bike guard: sæt notify_sent_at KUN hvis det stadig er null.
    // To samtidige invocations kan ikke begge "vinde" — kun den der faktisk
    // opdaterer en række fortsætter. Forhindrer dublerede mails (race condition).
    const { data: claimed } = await supa
      .from("bikes")
      .update({ notify_sent_at: new Date().toISOString() })
      .eq("id", bike_id)
      .is("notify_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "already_notified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: dealer }, { data: followers }] = await Promise.all([
      supa.from("profiles").select("id, shop_name, name").eq("id", dealer_id).single(),
      supa.from("dealer_followers").select("user_id").eq("dealer_id", dealer_id),
    ]);

    const bike = bikeRow;
    if (!dealer) {
      return new Response(JSON.stringify({ error: "Forhandler ikke fundet" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const followerIds = (followers ?? []).map(f => f.user_id);
    if (!followerIds.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hent e-mails målrettet pr. følger via getUserById — undgår at hente HELE
    // auth-tabellen ind i hukommelsen (og den tidligere 1000-bruger hard-cap der
    // lydløst ville droppe følgere ved vækst).
    const followerEmails: string[] = [];
    for (const id of followerIds) {
      const { data: { user: fu } } = await supa.auth.admin.getUserById(id);
      if (fu?.email) followerEmails.push(fu.email);
    }

    const dealerName = dealer.shop_name || dealer.name || "Forhandler";
    const bikeUrl    = `${SITE}/bike/${encodeURIComponent(bike.id)}`;
    const bikeName   = `${bike.brand ?? ""} ${bike.model ?? ""}`.trim();
    const subject    = `Ny cykel hos ${dealerName}: ${bikeName}`;

    const { data: imgs } = await supa
      .from("bike_images").select("url, is_primary").eq("bike_id", bike.id);
    const image = imgs?.find((i) => i.is_primary)?.url ?? imgs?.[0]?.url ?? null;

    const html = layout(
      heading(`Ny cykel hos ${esc(dealerName)}`) +
      bikeCard({
        href: bikeUrl,
        title: bikeName,
        price: typeof bike.price === "number" ? bike.price : null,
        meta: [bike.type, bike.year, bike.city].filter(Boolean).join(" · "),
        image,
      }) +
      button(bikeUrl, "Se annoncen"),
      `Du får denne mail fordi du følger ${esc(dealerName)}. Klik "Følger" på forhandlerens side for at stoppe.`,
    );

    let sent = 0;
    for (const to of followerEmails) {
      try {
        await sendEmail(to, subject, html);
        sent++;
      } catch (e) {
        console.error("send fejl", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: followerEmails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
