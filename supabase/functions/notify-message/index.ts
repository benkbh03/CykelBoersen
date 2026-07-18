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

// HTML-escape af bruger-leveret indhold før indsættelse i e-mail-HTML (anti-injection).
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

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

// Verificér caller-JWT og returnér brugeren (eller null). Bruges af de
// notifikationstyper der mailer en ANDEN bruger med caller-leveret indhold —
// uden dette kunne enhver sende troværdige mails under Cykelbørsens afsender.
async function getCaller(req: Request, supabase: ReturnType<typeof createClient>) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data: { user } } = await supabase.auth.getUser(jwt);
  return user ?? null;
}

// Fjern CRLF + afgræns længde før user-input går i et e-mail Subject (header-injection-værn).
function safeSubject(s: unknown, maxLen = 120): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLen);
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
              – Danmarks dedikerede markedsplads for nye og brugte cykler
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

    // ── Admin-gating af privilegerede notifikationstyper ──────
    // id_approved/id_rejected sender en troværdig "dit ID er godkendt/afvist"-mail.
    // Kun en admin må udløse dem — ellers er det en phishing-vektor (hvem som helst
    // kunne sende en falsk "ID godkendt"-mail til enhver bruger).
    const ADMIN_ONLY_TYPES = new Set(["id_approved", "id_rejected"]);
    if (ADMIN_ONLY_TYPES.has(payload.type)) {
      const callerJwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      let callerIsAdmin = false;
      if (callerJwt) {
        const { data: { user: caller } } = await supabase.auth.getUser(callerJwt);
        if (caller) {
          const { data: callerProfile } = await supabase
            .from("profiles").select("is_admin").eq("id", caller.id).single();
          callerIsAdmin = Boolean(callerProfile?.is_admin);
        }
      }
      if (!callerIsAdmin) {
        return new Response(JSON.stringify({ error: "Kræver admin-rettigheder" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── UDLEJNING: NY BOOKING (→ forhandler) ──────────────────
    if (payload.type === "rental_booked") {
      const { data: b } = await supabase
        .from("rental_bookings")
        .select("dealer_id, start_date, end_date, days, rental_amount, platform_fee, rental_items!item_id(title), profiles!renter_id(name)")
        .eq("id", payload.booking_id)
        .single();
      if (!b) return new Response("Booking not found", { status: 400, headers: corsHeaders });

      const { data: { user: dealer } } = await supabase.auth.admin.getUserById(b.dealer_id);
      if (!dealer?.email) {
        return new Response(JSON.stringify({ ok: true, skipped: "no dealer email" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const item   = (b as any).rental_items || {};
      const renter = (b as any).profiles || {};
      const payout = (b.rental_amount || 0) - (b.platform_fee || 0);

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">Ny udlejnings-booking! 🚲</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          <strong style="color:#1A1A18;">${esc(item.title ?? "Din udlejningscykel")}</strong> er booket af ${esc(renter.name ?? "en kunde")}.<br><br>
          📅 ${esc(b.start_date)} – ${esc(b.end_date)} (${b.days} dage)<br>
          💰 Din udbetaling: <strong style="color:#1A1A18;">${payout.toLocaleString("da-DK")} kr.</strong> (efter kommission)
        </p>
        <a href="https://cykelbørsen.dk/udlejning/bookinger"
           style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Se dine bookinger →
        </a>
      `);
      const result = await sendEmail(dealer.email, "🚲 Ny udlejnings-booking – Cykelbørsen", html);
      console.log("Rental-booking email sendt til:", dealer.email, "| ID:", result.id);
      return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ID VERIFICERING GODKENDT ──────────────────────────────
    if (payload.type === "id_approved") {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.user_id);
      if (error || !user?.email) {
        return new Response("User not found", { status: 400, headers: corsHeaders });
      }
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", payload.user_id).single();
      const name = esc(profile?.name ?? "bruger");

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
      const name = esc(profile?.name ?? "bruger");

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
        <p style="color:#8A8578;margin:0 0 8px;font-size:0.9rem;"><strong style="color:#1A1A18;">Fra:</strong> ${esc(name)} (${esc(email)})</p>
        <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
          <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;white-space:pre-wrap;">${esc(message)}</p>
        </div>
        <a href="mailto:${esc(email)}"
           style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Svar til ${esc(name)} →
        </a>
      `);

      const result = await sendEmail(ADMIN_EMAIL, `📬 Ny kontakthenvendelse fra ${safeSubject(name, 60)} – Cykelbørsen`, html);
      console.log("Kontaktformular email sendt til admin | ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FORHANDLER ANSØGNING → ADMIN ─────────────────────────
    if (payload.type === "dealer_application") {
      const { shop_name, cvr, contact, city, phone, address, email, user_id, source } = payload;

      const sourceRows = source && (source.utm_source || source.utm_campaign || source.referrer)
        ? `
          <strong>Kilde:</strong> ${esc(source.utm_source ?? "–")}<br>
          ${source.utm_campaign ? `<strong>Kampagne:</strong> ${esc(source.utm_campaign)}<br>` : ""}
          ${source.utm_medium   ? `<strong>Medium:</strong> ${esc(source.utm_medium)}<br>` : ""}
          ${source.utm_content  ? `<strong>Variant:</strong> ${esc(source.utm_content)}<br>` : ""}
          ${source.referrer     ? `<strong>Referrer:</strong> ${esc(source.referrer)}<br>` : ""}
        `
        : "";

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 16px;">🏪 Ny forhandleransøgning</h2>
        <p style="color:#1A1A18;margin:0 0 16px;font-size:0.95rem;line-height:1.6;">
          <strong>Butik:</strong> ${esc(shop_name ?? "–")}<br>
          <strong>CVR:</strong> ${esc(cvr ?? "–")}<br>
          <strong>Kontaktperson:</strong> ${esc(contact ?? "–")}<br>
          ${phone ? `<strong>Telefon:</strong> ${esc(phone)}<br>` : ""}
          ${address ? `<strong>Adresse:</strong> ${esc(address)}<br>` : ""}
          <strong>By:</strong> ${esc(city ?? "–")}<br>
          <strong>Email:</strong> ${esc(email ?? "–")}${sourceRows ? `<br><br>${sourceRows}` : ""}
        </p>
        <div style="background:#FEF3E7;border-left:4px solid #C8502A;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
          <p style="color:#1A1A18;margin:0;font-size:0.9rem;">
            Klik nedenfor for at åbne admin-panelet direkte på ansøgningerne. Her kan du godkende eller afvise.
          </p>
        </div>
        <a href="https://cykelbørsen.dk/?admin=dealers"
           style="background:#2A3D2E;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:0.95rem;">
          ✓ Godkend forhandler →
        </a>
      `);

      await sendEmail(ADMIN_EMAIL, `🏪 Ny forhandleransøgning: ${safeSubject(shop_name ?? email, 60)} – Cykelbørsen`, html);
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
          <strong style="color:#1A1A18;">Annonce:</strong> ${esc(bike_title ?? bike_id)}<br>
          <strong style="color:#1A1A18;">Årsag:</strong> ${esc(reason)}<br>
          ${reporter_name ? `<strong style="color:#1A1A18;">Rapporteret af:</strong> ${esc(reporter_name)} (${esc(reporter_email ?? "ingen email")})` : "Rapporteret af: anonym"}
        </p>
        ${details ? `
        <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0 24px;">
          <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;white-space:pre-wrap;">${esc(details)}</p>
        </div>` : ""}
        <a href="https://cykelbørsen.dk?bike=${bike_id}"
           style="background:#C8502A;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Se annonce →
        </a>
      `);

      const result = await sendEmail(ADMIN_EMAIL, `🚩 Annonce rapporteret: ${safeSubject(bike_title ?? bike_id, 60)} – Cykelbørsen`, html);
      console.log("Rapport email sendt til admin | ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ANNONCE LIKED ────────────────────────────────────────
    if (payload.type === "listing_liked") {
      // Auth: caller skal være logget ind OG faktisk have gemt annoncen.
      // Alle viste felter hentes fra DB — ikke fra payload (anti-phishing).
      const caller = await getCaller(req, supabase);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Ikke logget ind" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { bike_id } = payload;
      if (!bike_id) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      // Verificér at caller rent faktisk har gemt denne annonce
      const { data: savedRow } = await supabase
        .from("saved_bikes").select("user_id").eq("user_id", caller.id).eq("bike_id", bike_id).maybeSingle();
      if (!savedRow) {
        return new Response(JSON.stringify({ error: "Ingen like-record" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Hent annonce + ejer fra DB
      const { data: likedBike } = await supabase
        .from("bikes").select("user_id, brand, model").eq("id", bike_id).single();
      if (!likedBike) {
        return new Response("Annonce ikke fundet", { status: 404, headers: corsHeaders });
      }
      const bike_owner_id = likedBike.user_id;

      // Sælger og liker må ikke være samme person
      if (bike_owner_id === caller.id) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: { user: ownerUser }, error: authErr } = await supabase.auth.admin.getUserById(bike_owner_id);
      if (authErr || !ownerUser?.email) {
        console.error("Bike owner email not found:", authErr?.message ?? "ukendt fejl");
        return new Response("Owner email not found", { status: 400, headers: corsHeaders });
      }

      // liker_name fra callers EGEN profil — ikke payload
      const { data: likerProfile } = await supabase.from("profiles").select("name").eq("id", caller.id).single();
      const liker_name = likerProfile?.name ?? "En bruger";

      const { data: ownerProfile } = await supabase.from("profiles").select("name").eq("id", bike_owner_id).single();
      const ownerName = esc(ownerProfile?.name ?? "sælger");
      const bikeName = esc(`${likedBike.brand || "Din cykel"} ${likedBike.model || ""}`.trim());

      const html = emailWrapper(`
        <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">❤️ Din annonce er blevet gemt!</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${ownerName},<br><br>
          <strong style="color:#1A1A18;">${esc(liker_name || "En bruger")}</strong> har gemt din annonce: <strong style="color:#1A1A18;">${bikeName}</strong><br>
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

    // ── PRIS-DROP ALARM ─────────────────────────────────────
    // Sælger har reduceret prisen på en annonce. Vi finder alle brugere
    // der har "watchet" annoncen ved en pris HØJERE end den nye, sender
    // dem en email-notifikation, og opdaterer last_notified_at.
    if (payload.type === "price_drop") {
      // Auth: caller skal eje annoncen. brand/model/new_price hentes fra DB.
      const caller = await getCaller(req, supabase);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Ikke logget ind" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { bike_id, old_price } = payload;
      if (!bike_id || old_price == null) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      const { data: dropBike } = await supabase
        .from("bikes").select("user_id, brand, model, price").eq("id", bike_id).single();
      if (!dropBike) {
        return new Response("Annonce ikke fundet", { status: 404, headers: corsHeaders });
      }
      if (dropBike.user_id !== caller.id) {
        return new Response(JSON.stringify({ error: "Ikke ejer af annoncen" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const bike_brand = dropBike.brand;
      const bike_model = dropBike.model;
      const new_price  = dropBike.price;   // sandheden er DB'ens aktuelle pris
      if (new_price == null || new_price >= old_price) {
        return new Response(JSON.stringify({ ok: true, note: "no drop" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: watches, error: watchErr } = await supabase
        .from("price_drop_watches")
        .select("user_id, watched_at_price")
        .eq("bike_id", bike_id)
        .gt("watched_at_price", new_price);

      if (watchErr) {
        console.error("Watches query failed:", watchErr.message);
        return new Response("Watches query failed", { status: 500, headers: corsHeaders });
      }
      if (!watches || watches.length === 0) {
        return new Response(JSON.stringify({ ok: true, notified: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const bikeName = `${bike_brand || "Cyklen"} ${bike_model || ""}`.trim();
      const savings = old_price - new_price;
      let notified = 0;

      for (const w of watches) {
        const { data: { user: watcherUser }, error: authErr } = await supabase.auth.admin.getUserById(w.user_id);
        if (authErr || !watcherUser?.email) continue;

        const { data: watcherProfile } = await supabase.from("profiles").select("name").eq("id", w.user_id).single();
        const watcherName = esc(watcherProfile?.name ?? "der");

        const html = emailWrapper(`
          <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">🔔 Prisen er faldet!</h2>
          <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
            Hej ${watcherName},<br><br>
            En cykel du følger har lige fået ny pris:<br><br>
            <strong style="color:#1A1A18;font-size:1.05rem;">${esc(bikeName)}</strong><br>
            <span style="text-decoration:line-through;color:#8A8578;">${old_price.toLocaleString("da-DK")} kr.</span>
            →
            <strong style="color:#C8302A;font-size:1.1rem;">${new_price.toLocaleString("da-DK")} kr.</strong>
            <span style="color:#2e7d32;font-weight:bold;"> (spar ${savings.toLocaleString("da-DK")} kr.)</span>
          </p>
          <a href="https://cykelbørsen.dk/bike/${bike_id}"
             style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Se annonce →
          </a>
          <p style="color:#8A8578;font-size:0.78rem;margin-top:20px;">
            Du modtog denne mail fordi du klikkede "Få besked ved prisfald" på annoncen.
            Du kan altid afmelde alarmen ved at klikke knappen igen på annoncen.
          </p>
        `);

        try {
          await sendEmail(watcherUser.email, `🔔 Prisen på ${bikeName} er faldet ${savings.toLocaleString("da-DK")} kr.`, html);
          notified++;
        } catch (e) {
          console.error("price_drop send fejl:", e);
        }
      }

      // Markér alle notificerede watches så vi ikke spam'er ved næste lille prisjustering
      await supabase
        .from("price_drop_watches")
        .update({ last_notified_at: new Date().toISOString() })
        .eq("bike_id", bike_id)
        .gt("watched_at_price", new_price);

      return new Response(JSON.stringify({ ok: true, notified }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── BUD ACCEPTERET ──────────────────────────────────────
    if (payload.type === "bid_accepted") {
      // Auth: caller skal eje annoncen (kun sælger kan acceptere bud).
      const caller = await getCaller(req, supabase);
      if (!caller) {
        return new Response(JSON.stringify({ error: "Ikke logget ind" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { bike_id, bid_amount, bidder_id } = payload;
      if (!bike_id || !bidder_id) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      // Hent annonce + verificér ejerskab fra DB
      const { data: bidBike } = await supabase
        .from("bikes").select("user_id, brand, model").eq("id", bike_id).single();
      if (!bidBike) {
        return new Response("Annonce ikke fundet", { status: 404, headers: corsHeaders });
      }
      if (bidBike.user_id !== caller.id) {
        return new Response(JSON.stringify({ error: "Ikke ejer af annoncen" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: { user: bidderUser }, error: authErr } = await supabase.auth.admin.getUserById(bidder_id);
      if (authErr || !bidderUser?.email) {
        console.error("Byder email ikke fundet:", authErr?.message ?? "ukendt fejl");
        return new Response("Bidder email not found", { status: 400, headers: corsHeaders });
      }

      // seller_name fra callers EGEN profil — ikke payload
      const { data: sellerProfile } = await supabase.from("profiles").select("name, shop_name, seller_type").eq("id", caller.id).single();
      const seller_name = sellerProfile?.seller_type === "dealer" ? sellerProfile?.shop_name : sellerProfile?.name;

      const { data: bidderProfile } = await supabase.from("profiles").select("name").eq("id", bidder_id).single();
      const bidderName = esc(bidderProfile?.name ?? "køber");
      const bikeName = `${bidBike.brand || "cykel"} ${bidBike.model || ""}`.trim();

      const html = emailWrapper(`
        <h2 style="color:#2A7D4F;font-size:1.1rem;margin:0 0 12px;">✅ Dit bud blev accepteret! 🎉</h2>
        <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
          Hej ${bidderName},<br><br>
          <strong style="color:#1A1A18;">${esc(seller_name || "Sælger")}</strong> har accepteret dit bud på
          <strong style="color:#1A1A18;">${esc(bikeName)}</strong> for <strong style="color:#2A7D4F;">${esc(bid_amount)}</strong>!<br><br>
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

    // ── NY BESKED / BUD ──────────────────────────────────────
    // Auth: caller skal være logget ind OG afsenderen af beskeden.
    // Vi henter ALTID beskeden fra DB via message_id — payload.record
    // accepteres ikke (ellers kunne enhver fabrikere en besked til enhver
    // bruger og sende den under Cykelbørsens afsender = phishing).
    const caller = await getCaller(req, supabase);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Ikke logget ind" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!payload.message_id) {
      return new Response("message_id påkrævet", { status: 400, headers: corsHeaders });
    }

    const { data: message, error: msgErr } = await supabase
      .from("messages")
      .select("*")
      .eq("id", payload.message_id)
      .single();
    if (msgErr || !message) {
      console.error("Kunne ikke hente besked:", msgErr?.message ?? "ukendt");
      return new Response("Message not found", { status: 404, headers: corsHeaders });
    }

    if (message.sender_id !== caller.id) {
      return new Response(JSON.stringify({ error: "Ikke afsender af beskeden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!message.receiver_id) {
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
    const receiverName = esc(receiverProfile?.name ?? "sælger");

    const subject = isBid
      ? `💰 Nyt bud på din ${bikeName} – Cykelbørsen`
      : `✉️ Ny besked om din ${bikeName} – Cykelbørsen`;

    const emailHtml = emailWrapper(`
      <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">
        ${isBid ? "Du har fået et bud! 💰" : "Du har fået en besked! ✉️"}
      </h2>
      <p style="color:#8A8578;margin:0 0 20px;font-size:0.9rem;line-height:1.6;">
        Hej ${receiverName},<br><br>
        <strong style="color:#1A1A18;">${esc(senderName ?? "En bruger")}</strong>
        ${isBid ? " har givet et bud" : " har sendt dig en besked"}
        om din annonce: <strong style="color:#1A1A18;">${esc(bikeName)}</strong>
      </p>
      <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
        <p style="color:#1A1A18;margin:0;font-size:0.95rem;line-height:1.5;">${esc(message.content)}</p>
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
