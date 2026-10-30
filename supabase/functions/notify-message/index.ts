// Supabase Edge Function: notify-message
// Deploy: supabase functions deploy notify-message
//
// Påkrævede secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  – din Resend API-nøgle fra resend.com/api-keys
//
// Valgfri secrets:
//   EMAIL_FROM    – f.eks. "Cykelbørsen <hej@xn--cykelbrsen-5cb.dk>"
//                   Skal være et verificeret Resend-afsenderdomain.
//                   Standard: den officielle afsender (se ../_shared/email.ts)
//   ADMIN_EMAIL   – email der modtager kontaktformular-notifikationer
//                   Standard: hej@xn--cykelbrsen-5cb.dk
//
// Layoutet ligger i ../_shared/email.ts og skal deployes sammen med denne fil.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SITE, esc, safeSubject, kr, heading, p, small, quote, facts, button, layout, sendEmail as send } from "../_shared/email.ts";

const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAIL          = Deno.env.get("ADMIN_EMAIL") ?? "hej@xn--cykelbrsen-5cb.dk";

/* ── Rate-limit for ANONYME kald ────────────────────────────────────────
   Denne function har med vilje "Verify JWT" slaaet fra, saa en besoegende
   kan bruge kontaktformularen uden konto. Uden en graense kan hvem som helst
   kalde endpointet i en loekke og sende ubegraenset mange mails til admin
   gennem Resend: fyldt indbakke, betaling pr. mail, og risiko for at Resend
   lukker kontoen for misbrug.

   Den eksisterende rate_limits-tabel kraever et user_id med fremmednoegle til
   auth.users og kan derfor ikke bruges her. rate_limits_anon noegles paa fri
   tekst — klientens IP. Se supabase/sql/add_anon_rate_limits.sql.

   Fejler tabelopslaget (tabellen ikke oprettet endnu, database nede), lader
   vi kaldet gaa igennem. En kontaktformular der afviser alle fordi en
   taeller ikke kunne laeses, er en vaerre fejl end en der slipper et par
   ekstra mails igennem. */
const ANON_RATE_MAX       = 5;                 // pr. IP pr. vindue
const ANON_RATE_WINDOW_MS = 60 * 60 * 1000;    // 1 time

function clientIp(req: Request): string {
  /* Supabase' edge-proxy saetter x-forwarded-for. Foerste element er
     klienten; resten er proxier. Findes headeren ikke, bruger vi en fast
     noegle — saa deles graensen af alle ukendte, hvilket er strengere og
     dermed den sikre vej at fejle. */
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || "ukendt";
}

async function anonRateLimit(
  supa: ReturnType<typeof createClient>,
  key: string,
  scope: string,
): Promise<boolean> {
  try {
    const now = new Date();
    const { data: row, error } = await supa
      .from("rate_limits_anon")
      .select("count, window_start")
      .eq("key", key).eq("scope", scope)
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      await supa.from("rate_limits_anon").insert({
        key, scope, count: 1, window_start: now.toISOString(),
      });
      return true;
    }

    const alder = now.getTime() - new Date(row.window_start).getTime();
    if (alder > ANON_RATE_WINDOW_MS) {
      await supa.from("rate_limits_anon")
        .update({ count: 1, window_start: now.toISOString() })
        .eq("key", key).eq("scope", scope);
      return true;
    }

    if (row.count >= ANON_RATE_MAX) return false;

    await supa.from("rate_limits_anon")
      .update({ count: row.count + 1 })
      .eq("key", key).eq("scope", scope);
    return true;
  } catch (err) {
    console.warn("anonRateLimit kunne ikke slaa op — lader kaldet passere:", err);
    return true;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sendEmail(to: string, subject: string, html: string) {
  return send(RESEND_API_KEY, to, subject, html);
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
    const ADMIN_ONLY_TYPES = new Set(["id_approved", "id_rejected", "dealer_rejected"]);
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

    // ── UDLEJNING: booket / afbestilt / afleveret ─────────────
    /* Kaldes KUN af andre edge functions med service-nøglen (stripe-webhook
       ved betaling, rental-booking-action ved afbestilling og aflevering).
       Frontenden kalder dem aldrig, så en browser-kalder afvises: ellers
       kunne enhver der gættede et booking-id sende mails i Cykelbørsens navn. */
    if (["rental_booked", "rental_cancelled", "rental_returned"].includes(payload.type)) {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!bearer || bearer !== SUPABASE_SERVICE_KEY) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const { data: b } = await supabase
        .from("rental_bookings")
        .select("id, dealer_id, renter_id, start_date, end_date, days, rental_amount, deposit_amount, platform_fee, total_amount, deposit_status, rental_items!item_id(id, title, address, city), renter:profiles!renter_id(name), dealer:profiles!dealer_id(name, shop_name, address, city, phone)")
        .eq("id", payload.booking_id)
        .single();
      if (!b) return new Response("Booking not found", { status: 400, headers: corsHeaders });

      const item   = (b as any).rental_items || {};
      const renter = (b as any).renter || {};
      const dealer = (b as any).dealer || {};
      const [{ data: { user: dealerUser } }, { data: { user: renterUser } }] = await Promise.all([
        supabase.auth.admin.getUserById(b.dealer_id),
        supabase.auth.admin.getUserById(b.renter_id),
      ]);

      const date = (d: string) => new Date(d + "T00:00:00Z")
        .toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      const period    = `${date(b.start_date)} til ${date(b.end_date)} (${b.days} ${b.days === 1 ? "dag" : "dage"})`;
      const title     = esc(item.title ?? "udlejningscykel");
      const shop      = esc(dealer.shop_name || dealer.name || "Forhandleren");
      const where     = [item.address || dealer.address, item.city || dealer.city].filter(Boolean).join(", ");
      const mapsUrl   = where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : "";
      const payout    = (b.rental_amount || 0) - (b.platform_fee || 0);
      const deposit   = b.deposit_amount || 0;
      // Lejeren kan afbestille til og med to dage før start (samme regel som rental-booking-action).
      const cancelBy  = date(new Date(Date.parse(b.start_date + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10));
      const sent: string[] = [];

      if (payload.type === "rental_booked") {
        if (renterUser?.email) {
          const html = layout(
            heading(`Din leje af ${title} er bekræftet`) +
            p(`Hej ${esc(renter.name || "")}`.trim() + `. Betalingen er gået igennem, og cyklen er reserveret til dig.`) +
            facts([
              ["Cykel", title],
              ["Periode", esc(period)],
              ["Afhentning", where ? `${shop}, <a href="${esc(mapsUrl)}" style="color:inherit;">${esc(where)}</a>` : shop],
              ["Telefon", esc(dealer.phone || "")],
              ["Leje", kr(b.rental_amount)],
              ["Depositum", deposit > 0 ? `${kr(deposit)}, tilbagebetales når cyklen er afleveret uden skader` : ""],
              ["Betalt i alt", kr(b.total_amount)],
            ]) +
            p(`Tag billedlegitimation med, når du henter cyklen; forhandleren kan bede om at se den. Spørg ${shop} om åbningstider, hvis du er i tvivl.`) +
            p(`Du kan afbestille og få hele beløbet tilbage til og med ${esc(cancelBy)}. Derefter skal du skrive til ${shop}.`) +
            button(`${SITE}/udlejning/lejeaftaler/`, "Se din leje") +
            small("Kvitteringen for selve betalingen kommer i en separat mail fra Stripe."),
            "Du får denne mail fordi du har lejet en cykel via Cykelbørsen.",
          );
          await sendEmail(renterUser.email, `Bekræftet: ${item.title ?? "din leje"}, ${date(b.start_date)}`, html);
          sent.push("renter");
        }
        if (dealerUser?.email) {
          const html = layout(
            heading(`${title} er booket`) +
            facts([
              ["Lejer", esc(renter.name || "")],
              ["Periode", esc(period)],
              ["Leje", kr(b.rental_amount)],
              ["Depositum", deposit > 0 ? kr(deposit) : ""],
              ["Udbetaling til dig", b.platform_fee > 0 ? `${kr(payout)} efter kommission` : kr(payout)],
            ]) +
            p("Tjek lejerens legitimation ved udlevering. Når cyklen er afleveret, så markér det under bookingen, så depositummet kan blive frigivet.") +
            button(`${SITE}/udlejning/bookinger/`, "Se bookingen"),
            "Du får denne mail fordi du udlejer cykler på Cykelbørsen.",
          );
          await sendEmail(dealerUser.email, `Ny booking: ${item.title ?? "udlejningscykel"}, ${date(b.start_date)}`, html);
          sent.push("dealer");
        }
      }

      if (payload.type === "rental_cancelled") {
        const byDealer = payload.by === "dealer";
        // "system": perioden blev booket af en anden, mens betalingssiden stod åben.
        const bySystem = payload.by === "system";
        const refundLine = p(`Hele beløbet, ${kr(b.total_amount)}, er refunderet til det kort, der blev betalt med. Det tager normalt 5 til 10 bankdage, før pengene står på kontoen.`);
        if (renterUser?.email) {
          const html = layout(
            heading(`Din leje af ${title} er afbestilt`) +
            p(bySystem
              ? `Perioden ${esc(period)} blev booket af en anden, mens din betaling stod åben, så vi har ikke kunnet bekræfte din leje.`
              : byDealer ? `${shop} har afbestilt din leje i perioden ${esc(period)}.` : `Du har afbestilt din leje i perioden ${esc(period)}.`) +
            refundLine +
            button(`${SITE}/udlejning/`, "Find en anden cykel"),
            "Du får denne mail fordi du har lejet en cykel via Cykelbørsen.",
          );
          await sendEmail(renterUser.email, `Afbestilt: ${item.title ?? "din leje"}`, html);
          sent.push("renter");
        }
        if (dealerUser?.email && !bySystem) {
          const html = layout(
            heading(`Booking af ${title} er afbestilt`) +
            p(byDealer ? `Du har afbestilt ${esc(renter.name || "lejerens")} booking i perioden ${esc(period)}.` : `${esc(renter.name || "Lejeren")} har afbestilt sin booking i perioden ${esc(period)}.`) +
            p("Lejeren har fået hele beløbet refunderet, og perioden er ledig igen.") +
            button(`${SITE}/udlejning/bookinger/`, "Se bookinger"),
            "Du får denne mail fordi du udlejer cykler på Cykelbørsen.",
          );
          await sendEmail(dealerUser.email, `Afbestilt: ${item.title ?? "booking"}, ${date(b.start_date)}`, html);
          sent.push("dealer");
        }
      }

      if (payload.type === "rental_returned" && renterUser?.email) {
        const kept   = Math.min(deposit, Math.max(0, Number(payload.kept) || 0));
        const damage = kept > 0;
        const rest   = deposit - kept;
        const body = deposit === 0
          ? p(`${shop} har registreret, at cyklen er afleveret. Tak fordi du lejede via Cykelbørsen.`)
          : damage
            ? p(`${shop} har registreret en skade på cyklen og beholder ${kr(kept)} af dit depositum på ${kr(deposit)}.` +
                (rest > 0 ? ` Resten, ${kr(rest)}, er refunderet til det kort, der blev betalt med.` : "")) +
              p(`Er du uenig, så skriv til ${shop} direkte. Kommer I ikke videre, kan du skrive til os på hej@cykelbørsen.dk.`)
            : p(`${shop} har registreret, at cyklen er afleveret uden skader. Dit depositum på ${kr(deposit)} er refunderet til det kort, der blev betalt med. Det tager normalt 5 til 10 bankdage.`);
        const html = layout(
          heading(damage ? `Skade registreret på ${title}` : `Tak for lejen af ${title}`) + body +
          button(`${SITE}/udlejning/lejeaftaler/`, "Se din leje"),
          "Du får denne mail fordi du har lejet en cykel via Cykelbørsen.",
        );
        await sendEmail(renterUser.email, damage ? `Depositum tilbageholdt: ${item.title ?? "din leje"}` : `Afleveret: ${item.title ?? "din leje"}`, html);
        sent.push("renter");
      }

      return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ID VERIFICERING GODKENDT ──────────────────────────────
    if (payload.type === "id_approved") {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.user_id);
      if (error || !user?.email) {
        return new Response("User not found", { status: 400, headers: corsHeaders });
      }
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", payload.user_id).single();
      const name = esc(profile?.name ?? "bruger");

      const html = layout(
        heading("Dit ID er godkendt") +
        p(`Hej ${name}`) +
        p("Din profil viser nu, at dit ID er tjekket. Købere ser mærket ved dine annoncer og i dine beskeder.") +
        button(`${SITE}/me/`, "Se din profil"),
      );
      const result = await sendEmail(user.email, "Dit ID er godkendt", html);
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

      const html = layout(
        heading("Vi kunne ikke godkende dit ID") +
        p(`Hej ${name}`) +
        p("Billedet var uklart eller viste ikke hele dokumentet. Du kan sende et nyt billede fra din profil.") +
        button(`${SITE}/me/`, "Send et nyt billede"),
      );
      const result = await sendEmail(user.email, "Dit ID blev ikke godkendt", html);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FORHANDLER-ANSØGNING AFVIST ───────────────────────────
    if (payload.type === "dealer_rejected") {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.user_id);
      if (error || !user?.email) {
        return new Response("User not found", { status: 400, headers: corsHeaders });
      }
      const { data: profile } = await supabase.from("profiles").select("shop_name, name").eq("id", payload.user_id).single();
      const name = esc(profile?.shop_name ?? profile?.name ?? "");

      const html = layout(
        heading("Vi kunne ikke godkende jeres forhandlerprofil") +
        p(`Hej ${name || "der"}`) +
        p("Det skyldes som regel manglende dokumentation, eller at CVR-nummeret ikke kunne bekræftes.") +
        p("Svar på denne mail eller skriv til hej@cykelbørsen.dk, så finder vi ud af det sammen.") +
        button("mailto:hej@xn--cykelbrsen-5cb.dk", "Skriv til os"),
      );
      const result = await sendEmail(user.email, "Jeres forhandlerprofil på Cykelbørsen", html);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── KONTAKTFORMULAR → ADMIN ───────────────────────────────
    if (payload.type === "contact_form") {
      const { name, email, message } = payload;
      if (!name || !email || !message) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      /* Graensen ligger EFTER feltvalideringen, saa et tomt kald ikke bruger
         en af de fem forsoeg, men FOER mailen sendes. 429 er den korrekte
         status: klienten maa proeve igen senere. */
      const ip = clientIp(req);
      if (!(await anonRateLimit(supabase, ip, "contact_form"))) {
        console.warn("Kontaktformular rate-limited for IP:", ip);
        return new Response(
          JSON.stringify({ ok: false, error: "For mange henvendelser. Prøv igen om en time." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" } },
        );
      }

      const html = layout(
        heading("Ny henvendelse via kontaktformularen") +
        facts([["Fra", `${esc(name)} (${esc(email)})`]]) +
        quote(esc(message)) +
        button(`mailto:${email}`, `Svar ${esc(name)}`),
      );

      const result = await sendEmail(ADMIN_EMAIL, `Kontaktformular: ${safeSubject(name, 60)}`, html);
      console.log("Kontaktformular email sendt til admin | ID:", result.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FORHANDLER ANSØGNING → ADMIN ─────────────────────────
    if (payload.type === "dealer_application") {
      const { shop_name, cvr, contact, city, phone, address, email, user_id, source } = payload;

      /* Samme aabne doer som kontaktformularen: ingen admin-gate, ingen JWT,
         og mailen gaar til admin. Egen scope-noegle, saa en forhandler der
         ogsaa har skrevet via kontaktformularen ikke bliver blokeret. */
      const ipDealer = clientIp(req);
      if (!(await anonRateLimit(supabase, ipDealer, "dealer_application"))) {
        console.warn("Forhandleransoegning rate-limited for IP:", ipDealer);
        return new Response(
          JSON.stringify({ ok: false, error: "For mange ansøgninger. Prøv igen om en time." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" } },
        );
      }


      const html = layout(
        heading("Ny forhandleransøgning") +
        facts([
          ["Butik", esc(shop_name ?? "")],
          ["CVR", esc(cvr ?? "")],
          ["Kontakt", esc(contact ?? "")],
          ["Telefon", esc(phone ?? "")],
          ["Adresse", esc(address ?? "")],
          ["By", esc(city ?? "")],
          ["E-mail", esc(email ?? "")],
          ["Kilde", esc(source?.utm_source ?? "")],
          ["Kampagne", esc(source?.utm_campaign ?? "")],
          ["Medium", esc(source?.utm_medium ?? "")],
          ["Variant", esc(source?.utm_content ?? "")],
          ["Henvist fra", esc(source?.referrer ?? "")],
        ]) +
        button(`${SITE}/?admin=dealers`, "Åbn ansøgningerne"),
      );

      await sendEmail(ADMIN_EMAIL, `Forhandleransøgning: ${safeSubject(shop_name ?? email, 60)}`, html);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── RAPPORTER ANNONCE ─────────────────────────────────────
    if (payload.type === "report_listing") {
      const { bike_id, bike_title, reason, details, reporter_name, reporter_email } = payload;
      if (!bike_id || !reason) {
        return new Response("Manglende felter", { status: 400, headers: corsHeaders });
      }

      /* Rapporter kan sendes uden login (anonyme besoegende maa ogsaa
         melde svindel), saa samme IP-graense som kontaktformularen. Uden
         den kunne et script braende Resend-kvoten af paa admin-mails, og
         saa naar de rigtige notifikationer ikke frem. */
      const ipReport = clientIp(req);
      if (!(await anonRateLimit(supabase, ipReport, "report_listing"))) {
        console.warn("Rapport rate-limited for IP:", ipReport);
        return new Response(
          JSON.stringify({ ok: false, error: "For mange rapporter. Prøv igen om en time." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" } },
        );
      }

      const html = layout(
        heading("Annonce rapporteret") +
        facts([
          ["Annonce", esc(bike_title ?? bike_id)],
          ["Årsag", esc(reason)],
          ["Rapporteret af", reporter_name ? `${esc(reporter_name)} (${esc(reporter_email ?? "ingen e-mail")})` : "anonym"],
        ]) +
        (details ? quote(esc(details)) : "") +
        button(`${SITE}/bike/${encodeURIComponent(bike_id)}`, "Se annoncen"),
      );

      const result = await sendEmail(ADMIN_EMAIL, `Rapporteret: ${safeSubject(bike_title ?? bike_id, 60)}`, html);
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

      const html = layout(
        heading(`${esc(liker_name || "En bruger")} har gemt din ${bikeName}`) +
        p(`Hej ${ownerName}`) +
        p("Annoncen står nu på personens liste over gemte cykler. Sætter du prisen ned, får de besked, hvis de har slået prisfald til.") +
        button(`${SITE}/bike/${encodeURIComponent(bike_id)}`, "Se din annonce"),
        "Du får denne mail når nogen gemmer en af dine annoncer.",
      );

      const result = await sendEmail(ownerUser.email, `${safeSubject(liker_name || "En bruger", 60)} har gemt din ${safeSubject(likedBike.brand ?? "", 40)} ${safeSubject(likedBike.model ?? "", 40)}`.trim(), html);
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

        const html = layout(
          heading(`${esc(bikeName)} er sat ned til ${kr(new_price)}`) +
          p(`Hej ${watcherName}`) +
          p(`Prisen var ${kr(old_price)}. Den er sat ${kr(savings)} ned.`) +
          button(`${SITE}/bike/${encodeURIComponent(bike_id)}`, "Se annoncen"),
          "Du får denne mail fordi du har slået prisfald til på annoncen. Klik på knappen på annoncen igen for at slå det fra.",
        );

        try {
          await sendEmail(watcherUser.email, `${bikeName} er sat ned til ${kr(new_price)}`, html);
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

      const html = layout(
        heading(`Dit bud på ${esc(bikeName)} er accepteret`) +
        p(`Hej ${bidderName}`) +
        p(`${esc(seller_name || "Sælgeren")} har accepteret dit bud (${esc(bid_amount)}). Aftal tid og sted for overdragelsen i jeres beskeder.`) +
        p("Betal først, når du står med cyklen, og tjek stelnummeret mod annoncen.") +
        button(`${SITE}/inbox/`, "Gå til beskeder"),
      );

      const result = await sendEmail(bidderUser.email, `Dit bud på ${bikeName} er accepteret`, html);
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

    const [{ data: senderProfile }, { data: bike }] = await Promise.all([
      supabase.from("profiles").select("name, shop_name, seller_type, is_official").eq("id", message.sender_id).single(),
      supabase.from("bikes").select("user_id, brand, model").eq("id", message.bike_id).maybeSingle(),
    ]);

    const senderName =
      senderProfile?.seller_type === "dealer"
        ? senderProfile?.shop_name
        : senderProfile?.name;

    const isBid = message.content?.startsWith("💰 Bud:");
    const bikeName = bike ? `${bike.brand ?? ""} ${bike.model ?? ""}`.trim() : "";
    /* Modtageren ejer ikke altid annoncen: sælgeren svarer køberen, og på
       /opkoeb tilbyder en privat sin egen cykel til en forhandler. */
    const prep = isBid ? "på" : "om";
    const om = !bikeName ? ""
      : bike?.user_id === message.receiver_id ? ` ${prep} din ${bikeName}` : ` ${prep} ${bikeName}`;
    const from = esc(senderName ?? "En bruger");
    // Samme mærke som i indbakken (js/official-badge.js). Kun admin kan
    // sætte is_official, så et navn alene kan ikke give det.
    const badge = senderProfile?.is_official
      ? ' <span style="border:1px solid #2A3D2E;color:#2A3D2E;border-radius:6px;padding:0 6px;font-size:12px;white-space:nowrap;">&#10003; Officiel</span>'
      : "";
    // Beskedkoderne (💰 ✅ ✉️) er data, ikke tekst til læseren; indbakken fjerner dem også.
    const content = String(message.content ?? "").replace(/^(💰|✅|✉️)\s*/u, "");

    const subject = isBid
      ? `Bud${om} fra ${safeSubject(senderName ?? "en bruger", 60)}`
      : `Ny besked${om} fra ${safeSubject(senderName ?? "en bruger", 60)}`;

    const emailHtml = layout(
      heading(`${isBid ? "Nyt bud" : "Ny besked"}${esc(om)}`) +
      p(`Fra ${from}${badge}`) +
      quote(esc(content)) +
      button(`${SITE}/inbox/`, "Svar i indbakken") +
      small("Svar på Cykelbørsen, ikke på denne mail. Betal aldrig via et link i en besked."),
      "Du får denne mail når nogen skriver til dig på Cykelbørsen.",
    );

    const resendResult = await sendEmail(receiverEmail, subject, emailHtml);
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
