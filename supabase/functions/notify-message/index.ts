// Supabase Edge Function: notify-message
// Deploy: supabase functions deploy notify-message
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  – din Resend API-nøgle fra resend.com/api-keys
//
// Valgfri secrets:
//   EMAIL_FROM    – f.eks. "Cykelbørsen <no-reply@cykelborsen.dk>"
//                   Skal være et verificeret Resend-afsenderdomain.
//                   Standard: Resend sandbox-adresse (virker uden domain-verificering)
//   ADMIN_EMAIL   – email der modtager kontaktformular-notifikationer
//                   Standard: samme som EMAIL_FROM

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_FROM           = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <onboarding@resend.dev>";
const ADMIN_EMAIL          = Deno.env.get("ADMIN_EMAIL") ?? EMAIL_FROM;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Resend fejl: ${JSON.stringify(body)}`);
  return body;
}

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
        <tr>
          <td style="background:#2A3D2E;padding:24px 32px;">
            <span style="color:#F5F0E8;font-size:1.2rem;font-weight:bold;">🚲 Cykelbørsen</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
            <p style="color:#8A8578;font-size:0.75rem;margin:0;">
              <a href="https://cykelbørsen.dk" style="color:#C8502A;">Cykelbørsen</a>
              – Danmarks markedsplads for brugte cykler
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY mangler");
    return new Response("RESEND_API_KEY not configured", { status: 500, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── ID VERIFICERING GODKENDT ──────────────────────────────
    if (payload.type === "id_approved") {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.user_id);
      if (error || !user?.email) {
        return new Response("User not found", { status: 400, headers: corsHeaders });
      }
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", payload.user_id).single();
      const name = profile?.name ?? "bruger";

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">Tillykke – dit ID er godkendt! 🪪</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${name},<br><br>
          Vi har verificeret dit ID og du har nu et <strong style="color:#1A1A18;">verificeret badge</strong> på din profil.
          Det øger tilliden hos potentielle købere.
        </p>
        <a href="https://cykelbørsen.dk"
           style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Se din profil →
        </a>
      `);

      const result = await sendEmail(user.email, "✅ Dit ID er verificeret – Cykelbørsen", html);
      console.log("ID-godkendelse email sendt til:", user.email, "| ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ID VERIFICERING AFVIST ────────────────────────────────
    if (payload.type === "id_rejected") {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.user_id);
      if (error || !user?.email) {
        return new Response("User not found", { status: 400, headers: corsHeaders });
      }
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", payload.user_id).single();
      const name = profile?.name ?? "bruger";

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">Din ID-ansøgning er afvist</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${name},<br><br>
          Vi kunne desværre ikke godkende dit ID. Det kan skyldes at billedet var uklart eller ufuldstændigt.
          Du er velkommen til at indsende dit ID igen via din profil.
        </p>
        <a href="https://cykelbørsen.dk"
           style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Prøv igen →
        </a>
      `);

      const result = await sendEmail(user.email, "Din ID-ansøgning er afvist – Cykelbørsen", html);
      console.log("ID-afvisning email sendt til:", user.email, "| ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── KONTAKTFORMULAR → ADMIN ───────────────────────────────
    if (payload.type === "contact_form") {
      const { name, email, message } = payload;
      if (!name || !email || !message) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">Ny henvendelse via kontaktformularen</h2>
        <p style="color:#8A8578;margin:0 0 8px;font-size:0.9rem;"><strong style="color:#1A1A18;">Fra:</strong> ${name} (${email})</p>
        <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
          <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;white-space:pre-wrap;">${message}</p>
        </div>
        <a href="mailto:${email}"
           style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Svar til ${name} →
        </a>
      `);

      const result = await sendEmail(ADMIN_EMAIL, `📬 Ny kontakthenvendelse fra ${name} – Cykelbørsen`, html);
      console.log("Kontaktformular email sendt til admin | ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── RAPPORTER ANNONCE ─────────────────────────────────────
    if (payload.type === "report_listing") {
      const { bike_id, bike_title, reason, details, reporter_name, reporter_email } = payload;
      if (!bike_id || !reason) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">🚩 Annonce rapporteret</h2>
        <p style="color:#8A8578;margin:0 0 8px;font-size:0.9rem;">
          <strong style="color:#1A1A18;">Annonce:</strong> ${bike_title ?? bike_id}<br>
          <strong style="color:#1A1A18;">Årsag:</strong> ${reason}<br>
          ${reporter_name ? `<strong style="color:#1A1A18;">Rapporteret af:</strong> ${reporter_name} (${reporter_email ?? "ingen email"})` : "Rapporteret af: anonym"}
        </p>
        ${details ? `
        <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0 24px;">
          <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;white-space:pre-wrap;">${details}</p>
        </div>` : ""}
        <a href="https://cykelbørsen.dk?bike=${bike_id}"
           style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Se annonce →
        </a>
      `);

      const result = await sendEmail(ADMIN_EMAIL, `🚩 Annonce rapporteret: ${bike_title ?? bike_id} – Cykelbørsen`, html);
      console.log("Rapport email sendt til admin | ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ANNONCE LIKED ────────────────────────────────────────
    if (payload.type === "listing_liked") {
      const { bike_id, bike_brand, bike_model, bike_owner_id, liker_id, liker_name } = payload;
      if (!bike_id || !bike_owner_id || !liker_id) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      // Sælger og liker må ikke være samme person
      if (bike_owner_id === liker_id) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: { user: ownerUser }, error: authErr } = await supabase.auth.admin.getUserById(bike_owner_id);
      if (authErr || !ownerUser?.email) {
        console.error("Bike owner email not found:", authErr?.message ?? "ukendt fejl");
        return new Response("Owner email not found", { status: 400, headers: corsHeaders });
      }

      const { data: ownerProfile } = await supabase.from("profiles").select("name").eq("id", bike_owner_id).single();
      const ownerName = ownerProfile?.name ?? "sælger";
      const bikeName = `${bike_brand || "Din cykel"} ${bike_model || ""}`.trim();

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">❤️ Din annonce er blevet gemt!</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${ownerName},<br><br>
          <strong style="color:#1A1A18;">${liker_name || "En bruger"}</strong> har gemt din annonce: <strong style="color:#1A1A18;">${bikeName}</strong><br>
          Det er en god tegn – interesserede købere følger annoncerne tæt!
        </p>
        <a href="https://cykelbørsen.dk/#/bike/${bike_id}"
           style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Se din annonce →
        </a>
      `);

      const result = await sendEmail(ownerUser.email, `❤️ ${liker_name || "En bruger"} har gemt din annonce – Cykelbørsen`, html);
      console.log("Listing liked email sendt til:", ownerUser.email, "| ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── BUD ACCEPTERET ──────────────────────────────────────
    if (payload.type === "bid_accepted") {
      const { bike_id, bike_brand, bike_model, bid_amount, bidder_id, seller_name } = payload;
      if (!bike_id || !bidder_id) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      const { data: { user: bidderUser }, error: authErr } = await supabase.auth.admin.getUserById(bidder_id);
      if (authErr || !bidderUser?.email) {
        console.error("Byder email ikke fundet:", authErr?.message ?? "ukendt fejl");
        return new Response("Bidder email not found", { status: 400, headers: corsHeaders });
      }

      const { data: bidderProfile } = await supabase.from("profiles").select("name").eq("id", bidder_id).single();
      const bidderName = bidderProfile?.name ?? "køber";
      const bikeName = `${bike_brand || "cykel"} ${bike_model || ""}`.trim();

      const html = emailWrapper(`
        <h2 style="color:#2A7D4F;font-size:1.1rem;margin:0 0 12px;">✅ Dit bud blev accepteret! 🎉</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${bidderName},<br><br>
          <strong style="color:#1A1A18;">${seller_name || "Sælger"}</strong> har accepteret dit bud på
          <strong style="color:#1A1A18;">${bikeName}</strong> for <strong style="color:#2A7D4F;">${bid_amount}</strong>!<br><br>
          Nu er det tid til at kontakte hinanden og aftale overdragelsen.
        </p>
        <a href="https://cykelbørsen.dk/#/inbox"
           style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Gå til din indbakke →
        </a>
      `);

      const result = await sendEmail(bidderUser.email, `✅ Dit bud blev accepteret – ${bikeName} – Cykelbørsen`, html);
      console.log("Bud accepteret email sendt til:", bidderUser.email, "| ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── NY BESKED / BUD (eksisterende logik) ─────────────────
    let message = payload.record ?? null;

    if (!message && payload.message_id) {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("id", payload.message_id)
        .single();
      if (error) {
        console.error("Kunne ikke hente besked:", error.message);
        return new Response("Message not found", { status: 404, headers: corsHeaders });
      }
      message = data;
    }

    if (!message?.receiver_id) {
      return new Response("No valid message record", { status: 400, headers: corsHeaders });
    }

    const { data: { user: receiverUser }, error: authErr } = await supabase.auth.admin.getUserById(
      message.receiver_id
    );
    if (authErr || !receiverUser?.email) {
      console.error("Modtager email ikke fundet:", authErr?.message ?? "ukendt fejl");
      return new Response("Receiver email not found", { status: 400, headers: corsHeaders });
    }
    const receiverEmail = receiverUser.email;

    const [{ data: receiverProfile }, { data: senderProfile }, { data: bike }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", message.receiver_id).single(),
      supabase.from("profiles").select("name, shop_name, seller_type").eq("id", message.sender_id).single(),
      supabase.from("bikes").select("brand, model").eq("id", message.bike_id).single(),
    ]);

    const senderName =
      senderProfile?.seller_type === "dealer"
        ? senderProfile?.shop_name
        : senderProfile?.name;

    const isBid        = message.content?.startsWith("💰 Bud:");
    const bikeName     = bike ? `${bike.brand} ${bike.model}` : "din cykel";
    const receiverName = receiverProfile?.name ?? "sælger";

    const subject = isBid
      ? `💰 Nyt bud på din ${bikeName} – Cykelbørsen`
      : `✉️ Ny besked om din ${bikeName} – Cykelbørsen`;

    const emailHtml = emailWrapper(`
      <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">
        ${isBid ? "Du har fået et bud! 💰" : "Du har fået en besked! ✉️"}
      </h2>
      <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
        Hej ${receiverName},<br><br>
        <strong style="color:#1A1A18;">${senderName ?? "En bruger"}</strong>
        ${isBid ? " har givet et bud" : " har sendt dig en besked"}
        om din annonce: <strong style="color:#1A1A18;">${bikeName}</strong>
      </p>
      <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;">${message.content}</p>
      </div>
      <a href="https://cykelbørsen.dk?inbox=true"
         style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
        Svar på Cykelbørsen →
      </a>
    `);

    const resendResult = await sendEmail(receiverEmail, subject, emailHtml);
    console.log("Email sendt til:", receiverEmail, "| Resend ID:", resendResult.id);
    return new Response(
      JSON.stringify({ ok: true, id: resendResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Uventet fejl:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
