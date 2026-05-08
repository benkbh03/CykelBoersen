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
//   EMAIL_FROM, SITE_URL (default https://xn--cykelbrsen-5cb.dk)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_FROM           = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <onboarding@resend.dev>";
const SITE_URL             = Deno.env.get("SITE_URL") ?? "https://xn--cykelbrsen-5cb.dk";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Resend fejl: ${JSON.stringify(body)}`);
  return body;
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

    if (bikeRow.notify_sent_at) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "already_notified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Markér annoncen som notificeret FØR vi sender — atomic guard
    await supa.from("bikes").update({ notify_sent_at: new Date().toISOString() }).eq("id", bike_id);

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

    // Hent e-mails fra auth.users via service-role
    const { data: authUsers } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const followerEmails = (authUsers?.users ?? [])
      .filter(u => followerIds.includes(u.id) && u.email)
      .map(u => u.email!) as string[];

    const dealerName = dealer.shop_name || dealer.name || "Forhandler";
    const bikeUrl    = `${SITE_URL}/bike/${bike.id}`;
    const subject    = `${dealerName} har lige tilføjet en ny cykel`;
    const priceFmt   = (bike.price as number).toLocaleString("da-DK");

    const html = `<!DOCTYPE html><html lang="da"><body style="margin:0;background:#F5F0E8;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
          <tr><td style="background:#2A3D2E;padding:24px 32px;color:#F5F0E8;font-weight:bold;">🚲 Cykelbørsen</td></tr>
          <tr><td style="padding:32px;color:#2A3D2E;">
            <h2 style="margin:0 0 12px;font-family:Georgia,serif;">Ny cykel hos ${esc(dealerName)}</h2>
            <p style="line-height:1.55;">${esc(dealerName)} har netop oprettet en ny annonce du måske vil se:</p>
            <div style="border:1px solid #DDD8CE;border-radius:8px;padding:16px;margin:16px 0;background:#F5F0E8;">
              <div style="font-weight:bold;font-size:1.05rem;">${esc(bike.brand)} ${esc(bike.model)}</div>
              <div style="color:#5A5A5A;font-size:0.9rem;margin-top:4px;">
                ${esc(bike.type ?? "")} · ${bike.year ?? ""} · ${esc(bike.city ?? "")}
              </div>
              <div style="color:#C8502A;font-weight:bold;font-size:1.15rem;margin-top:8px;">${priceFmt} kr.</div>
            </div>
            <p style="text-align:center;margin:24px 0;">
              <a href="${bikeUrl}" style="background:#C8502A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Se annoncen →</a>
            </p>
            <p style="font-size:0.8rem;color:#8A8578;line-height:1.5;">
              Du modtager denne e-mail fordi du følger ${esc(dealerName)} på Cykelbørsen.
              <br>Du kan afmelde ved at gå ind på forhandlerens profil og klikke "Følger" igen.
            </p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
            <p style="color:#8A8578;font-size:0.75rem;margin:0;">
              <a href="${SITE_URL}" style="color:#C8502A;">Cykelbørsen</a> – Danmarks markedsplads for brugte cykler
            </p>
          </td></tr>
        </table>
      </td></tr></table></body></html>`;

    let sent = 0;
    for (const to of followerEmails) {
      try {
        await sendEmail(to, subject, html);
        sent++;
      } catch (e) {
        console.error("send fejl", to, e);
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
