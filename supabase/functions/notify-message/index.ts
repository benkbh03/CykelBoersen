// Supabase Edge Function: notify-message
// Sender email-notifikation til sælger når der modtages en ny besked eller bud
// Deploy: supabase functions deploy notify-message
// Kræver env-variabel: RESEND_API_KEY (sættes i Supabase Dashboard → Settings → Edge Functions)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY      = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Tillad kun POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();

    // Understøtter både database webhook format { record: {...} }
    // og direkte kald fra frontend { message_id: "..." }
    let message = payload.record;

    // Hvis vi kun fik et message_id, hent besked fra DB
    if (!message && payload.message_id) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("id", payload.message_id)
        .single();
      message = data;
    }

    if (!message || !message.receiver_id) {
      return new Response("No valid message record", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Hent modtagerens email via Supabase Auth Admin API
    const { data: { user: receiverUser } } = await supabase.auth.admin.getUserById(
      message.receiver_id
    );
    const receiverEmail = receiverUser?.email;

    if (!receiverEmail) {
      console.error("Modtager email ikke fundet for user:", message.receiver_id);
      return new Response("Receiver email not found", { status: 400 });
    }

    // Hent modtagerens navn
    const { data: receiverProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", message.receiver_id)
      .single();

    // Hent afsenderens navn
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("name, shop_name, seller_type")
      .eq("id", message.sender_id)
      .single();

    const senderName =
      senderProfile?.seller_type === "dealer"
        ? senderProfile?.shop_name
        : senderProfile?.name;

    // Hent cykelinfo
    const { data: bike } = await supabase
      .from("bikes")
      .select("brand, model")
      .eq("id", message.bike_id)
      .single();

    const isBid = message.content?.startsWith("💰 Bud:");
    const bikeName = bike ? `${bike.brand} ${bike.model}` : "din cykel";
    const receiverName = receiverProfile?.name || "sælger";

    const subject = isBid
      ? `💰 Nyt bud på din ${bikeName} – Cykelbørsen`
      : `✉️ Ny besked om din ${bikeName} – Cykelbørsen`;

    const emailHtml = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#2A3D2E;padding:24px 32px;">
              <h1 style="color:#F5F0E8;font-size:1.3rem;margin:0;font-family:Georgia,serif;letter-spacing:-0.5px;">
                🚲 Cykelbørsen
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#1A1A18;font-size:1.15rem;margin:0 0 12px;font-family:Georgia,serif;">
                ${isBid ? "Du har fået et bud! 💰" : "Du har fået en besked! ✉️"}
              </h2>
              <p style="color:#8A8578;margin:0 0 24px;font-size:0.92rem;line-height:1.6;">
                Hej ${receiverName},<br><br>
                <strong style="color:#1A1A18;">${senderName || "En bruger"}</strong>
                ${isBid ? " har givet et bud" : " har sendt dig en besked"}
                om din annonce: <strong style="color:#1A1A18;">${bikeName}</strong>
              </p>
              <!-- Message box -->
              <div style="background:#F5F0E8;border-left:4px solid #C8502A;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:28px;">
                <p style="color:#1A1A18;margin:0;font-size:1rem;line-height:1.5;">
                  ${message.content}
                </p>
              </div>
              <!-- CTA -->
              <a href="https://cykelborsen.dk"
                 style="background:#C8502A;color:white;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:0.9rem;">
                Svar på Cykelbørsen →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
              <p style="color:#8A8578;font-size:0.75rem;margin:0;line-height:1.5;">
                Du modtager denne email fordi du har en aktiv annonce på Cykelbørsen.<br>
                <a href="https://cykelborsen.dk" style="color:#C8502A;">cykelborsen.dk</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    "Cykelbørsen <notifikationer@cykelborsen.dk>",
        to:      receiverEmail,
        subject,
        html:    emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API fejl:", errText);
      return new Response("Email sending failed", { status: 500 });
    }

    const resendData = await resendRes.json();
    console.log("Email sendt:", resendData.id, "til:", receiverEmail);

    return new Response(JSON.stringify({ ok: true, id: resendData.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Edge function fejl:", err);
    return new Response("Internal error", { status: 500 });
  }
});
