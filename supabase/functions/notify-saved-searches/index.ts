import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to, subject, html) {
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

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html lang="da">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FEFAF3;border-radius:12px;overflow:hidden;border:1px solid #DDD8CE;max-width:600px;width:100%;">
        <tr><td style="background:#2A3D2E;padding:24px 32px;"><span style="color:#F5F0E8;font-size:1.2rem;font-weight:bold;">🚲 Cykelbørsen</span></td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="padding:16px 32px;background:#F5F0E8;border-top:1px solid #DDD8CE;">
          <p style="color:#8A8578;font-size:0.75rem;margin:0;">
            <a href="https://cykelbørsen.dk" style="color:#C8502A;">Cykelbørsen</a> – Danmarks dedikerede markedsplads for nye og brugte cykler
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* Har agenten overhovedet ét reelt søgekriterium?
   Uden dette tjek matcher en agent med tomme filtre ALT: `{}` er sandt, og hver
   eneste kontrol i bikeMatchesSearch er betinget (`if (filters.types?.length)`),
   så en tom agent falder igennem hele funktionen og returnerer true. Det er
   sådan en agent ved navn "Brugte cykler" kunne udløse en mail om en el-cykel.
   `category` tæller IKKE med — den er en akse der altid er sat (cykel/tilbehør),
   ikke noget brugeren har valgt at søge efter. */
function hasEffectiveCriteria(f) {
  if (!f || typeof f !== "object") return false;

  const arrays = [
    "types", "conditions", "sizes", "wheelSizes", "colors",
    "frameMaterials", "brakeTypes", "groupsets",
    "motors", "motorPositions", "suspensions", "geartypes", "stepTypes",
    "brands",   // sidebarens mærkefilter — manglede, så en agent med KUN
                // mærker talte som "uden kriterier" og notificerede aldrig
  ];
  if (arrays.some((k) => Array.isArray(f[k]) && f[k].length > 0)) return true;

  const texts = ["type", "search", "city", "sellerType", "dealerId", "brand"];
  if (texts.some((k) => f[k] != null && String(f[k]).trim() !== "")) return true;

  const numbers = ["minPrice", "maxPrice", "batteryMin", "batteryMax", "maxWeightKg"];
  if (numbers.some((k) => f[k] != null && f[k] !== "" && !isNaN(Number(f[k])))) return true;

  if (f.warranty) return true;
  if (f.giveaway) return true;
  if (f.electronicShifting === "true" || f.electronicShifting === "false") return true;

  return false;
}

/* Sidebaren og Cykelagent-editoren gemmer de SAMME filtre under forskellige
   navne og typer, fordi de er bygget hver for sig. Uden en normalisering
   fejler de tavst hver sin vej:

   - Sidebaren gemmer `maxWeight`, denne funktion læste `maxWeightKg`.
     Filteret blev ignoreret, og brugeren fik mails om 22-kg ladcykler.
   - Sidebaren gemmer `electronicShifting` som boolean, denne funktion
     sammenlignede med strengene "true"/"false". Filteret faldt bort.

   Normalisér ét sted. Samme funktion findes i js/cykelagent-matches.js;
   ændres den ene, skal den anden med. */
function normalizeFilters(f) {
  const es = f.electronicShifting;
  return {
    ...f,
    maxWeightKg: f.maxWeightKg ?? f.maxWeight ?? null,
    electronicShifting: es === true ? "true" : es === false ? "false" : es,
  };
}

function bikeMatchesSearch(bike, rawFilters) {
  if (!rawFilters) return false;
  const filters = normalizeFilters(rawFilters);
  // En agent uden kriterier må ALDRIG notificere. Frontendens hasFilters-guard
  // dækker kun nye agenter — rækker gemt før den fandtes, eller via
  // _pendingCykelagent-stien, kan stadig ligge med tomme filtre.
  if (!hasEffectiveCriteria(filters)) return false;

  // Hård kategori-akse: en cykel-agent matcher ALDRIG tilbehør (og omvendt).
  // Eksisterende cykel-agenter har ingen filters.category → defaulter til 'cykel';
  // cykel-annoncer har category (eller default 'cykel'). Ingen ændring for cykler.
  if ((bike.category || "cykel") !== (filters.category || "cykel")) return false;

  // Legacy enkelt-type dropdown
  if (filters.type && bike.type !== filters.type) return false;

  // Sidebar: multi-select cykeltyper
  if (Array.isArray(filters.types) && filters.types.length > 0) {
    if (!filters.types.includes(bike.type)) return false;
  }

  // Sidebar: multi-select stand
  if (Array.isArray(filters.conditions) && filters.conditions.length > 0) {
    if (!filters.conditions.includes(bike.condition)) return false;
  }

  // Sidebar: multi-select hjulstørrelser
  if (Array.isArray(filters.wheelSizes) && filters.wheelSizes.length > 0) {
    if (!bike.wheel_size || !filters.wheelSizes.includes(bike.wheel_size)) return false;
  }

  // Sidebar: multi-select stelstørrelser
  // STRICT: bike.size NULL → ingen match. Brugeren har bedt om specifik størrelse,
  // og en cykel uden størrelsesinfo er ikke "sikker" at sende notifikation om.
  if (Array.isArray(filters.sizes) && filters.sizes.length > 0) {
    if (!bike.size || !filters.sizes.includes(bike.size)) return false;
  }

  // Sidebar: multi-select farver (overlap med bike.colors-array)
  if (Array.isArray(filters.colors) && filters.colors.length > 0) {
    const bikeColors = Array.isArray(bike.colors) ? bike.colors : [];
    if (!bikeColors.some(c => filters.colors.includes(c))) return false;
  }

  // ── TEKNISKE SPECS ───────────────────────────────────────
  // STRICT-MATCH-POLITIK: Hvis brugeren har bedt om en specifik teknisk spec
  // (carbon-stel, hydrauliske bremser, elektronisk gear osv.) og bike-feltet
  // er NULL eller ikke matcher → ingen notifikation. Brugeren skal aldrig
  // skuffes ved at åbne en notifikation og opdage at cyklen mangler det info
  // de bad om.

  if (Array.isArray(filters.frameMaterials) && filters.frameMaterials.length > 0) {
    if (!bike.frame_material || !filters.frameMaterials.includes(bike.frame_material)) return false;
  }

  if (Array.isArray(filters.brakeTypes) && filters.brakeTypes.length > 0) {
    if (!bike.brake_type || !filters.brakeTypes.includes(bike.brake_type)) return false;
  }

  // Groupset: prefix-match som sidebaren (ilike 'X%'), så "Shimano GRX" matcher
  // en cykel gemt som "Shimano GRX 800". Holder agent og live-filter ens.
  if (Array.isArray(filters.groupsets) && filters.groupsets.length > 0) {
    const g = (bike.groupset || "").toLowerCase();
    if (!g || !filters.groupsets.some((sel) => g.startsWith(String(sel).toLowerCase()))) return false;
  }

  // electronicShifting: '' = ligegyldigt, 'true' = elektronisk, 'false' = mekanisk
  if (filters.electronicShifting === "true" || filters.electronicShifting === "false") {
    const wantElectronic = filters.electronicShifting === "true";
    if (bike.electronic_shifting === null || bike.electronic_shifting === undefined) return false;
    if (!!bike.electronic_shifting !== wantElectronic) return false;
  }

  // maxWeightKg: bike.weight_kg skal være sat OG <= grænsen
  if (filters.maxWeightKg != null && !isNaN(Number(filters.maxWeightKg))) {
    if (bike.weight_kg === null || bike.weight_kg === undefined) return false;
    if (Number(bike.weight_kg) > Number(filters.maxWeightKg)) return false;
  }

  // ── EL-CYKEL ─────────────────────────────────────────────
  // Motor-mærke: prefix-match som sidebaren (fx "Bosch" matcher "Bosch Performance Line CX")
  if (Array.isArray(filters.motors) && filters.motors.length > 0) {
    const m = (bike.motor || "").toLowerCase();
    if (!m || !filters.motors.some((sel) => m.startsWith(String(sel).toLowerCase()))) return false;
  }
  // Motor-placering: eksakt match
  if (Array.isArray(filters.motorPositions) && filters.motorPositions.length > 0) {
    if (!bike.motor_position || !filters.motorPositions.includes(bike.motor_position)) return false;
  }
  // Batteri-kapacitet (Wh): bike.battery_wh skal være sat OG inden for interval
  if (filters.batteryMin != null && !isNaN(Number(filters.batteryMin))) {
    if (bike.battery_wh == null || Number(bike.battery_wh) < Number(filters.batteryMin)) return false;
  }
  if (filters.batteryMax != null && !isNaN(Number(filters.batteryMax))) {
    if (bike.battery_wh == null || Number(bike.battery_wh) > Number(filters.batteryMax)) return false;
  }

  // Affjedring: eksakt match (Forgaffel/Fuld/Ingen)
  if (Array.isArray(filters.suspensions) && filters.suspensions.length > 0) {
    if (!bike.suspension || !filters.suspensions.includes(bike.suspension)) return false;
  }

  // Geartype: eksakt match (Indvendig/Udvendig)
  if (Array.isArray(filters.geartypes) && filters.geartypes.length > 0) {
    if (!bike.geartype || !filters.geartypes.includes(bike.geartype)) return false;
  }

  // Stel-type: eksakt match (Lav/Høj indstigning)
  if (Array.isArray(filters.stepTypes) && filters.stepTypes.length > 0) {
    if (!bike.step_type || !filters.stepTypes.includes(bike.step_type)) return false;
  }

  // Pris
  const bikePrice = Number(bike.price);
  if (filters.minPrice != null && !isNaN(Number(filters.minPrice)) && bikePrice < Number(filters.minPrice)) return false;
  if (filters.maxPrice != null && !isNaN(Number(filters.maxPrice)) && bikePrice > Number(filters.maxPrice)) return false;

  // Sælgertype (fra profiles)
  if (filters.sellerType && bike.seller_type && bike.seller_type !== filters.sellerType) return false;

  // Specifik forhandler
  if (filters.dealerId && bike.user_id && bike.user_id !== filters.dealerId) return false;

  // Garanti (Hurtigfilter-pill)
  if (filters.warranty && !bike.warranty) return false;

  // Gives væk. Kun ét-vejs: en agent kan bede om KUN gaver, men der findes
  // ikke et "skjul gaver". Bemærk at en agent med minPrice automatisk aldrig
  // matcher en gave, fordi gavens pris er 0 — samme semantik som i
  // loadBikesWithFilters på forsiden.
  if (filters.giveaway && !bike.is_giveaway) return false;

  // By-match
  if (filters.city) {
    const bikeCity = (bike.city || "").toLowerCase();
    const searchCity = filters.city.toLowerCase();
    if (!bikeCity.includes(searchCity) && !searchCity.includes(bikeCity)) return false;
  }

  // Fritekst søgning (mærke/model)
  if (filters.search) {
    const haystack = `${bike.brand} ${bike.model}`.toLowerCase();
    const needle = filters.search.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  /* Sidebarens mærkefilter. Blev slet ikke læst her, selvom saveCurrentSearch
     gemmer feltet via sin ...fa-spread. Konsekvensen var ikke manglende mails
     men FALSKE: en søgning gemt med "Trek + Specialized" sendte mail om hver
     eneste ny cykel uanset mærke. Eksakt match, som sidebarens .in()-query. */
  if (Array.isArray(filters.brands) && filters.brands.length > 0) {
    if (!filters.brands.includes(bike.brand)) return false;
  }

  // Cykelagent-formens enkelte mærke: substring, ikke eksakt.
  if (filters.brand && String(filters.brand).trim() !== "") {
    const q = String(filters.brand).toLowerCase().trim();
    if (!String(bike.brand || "").toLowerCase().includes(q)) return false;
  }

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!RESEND_API_KEY) {
    return new Response("RESEND_API_KEY not configured", { status: 500, headers: corsHeaders });
  }

  try {
    const { bike } = await req.json();
    if (!bike?.id) {
      return new Response("Mangler bike objekt", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    /* ── Kun annoncens ejer (eller en admin) må udløse notifikationen ──────
       Funktionen mailer et vilkårligt antal af VORES brugere, og teksten i
       mailen kommer fra `bike` i request-bodyen — mærke, model og pris skrives
       direkte ind. Uden denne kontrol kunne enhver med den offentlige
       anon-nøgle sende mails med selvvalgt indhold ud til brugere fra vores
       eget afsender-domæne. Dashboardets "Verify JWT" hjælper ikke: anon-nøglen
       opfylder den. Kontrollen skal ligge her.

       Samme model som check-frame-number: ejer ELLER admin (admin kan oprette
       annoncer på en forhandlers vegne, og så er user_id forhandlerens). */
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return new Response("Ikke logget ind", { status: 401, headers: corsHeaders });
    const { data: { user: caller } } = await supabase.auth.getUser(jwt);
    if (!caller) return new Response("Ugyldig session", { status: 401, headers: corsHeaders });

    const { data: ownerRow } = await supabase
      .from("bikes").select("user_id").eq("id", bike.id).single();
    if (!ownerRow) return new Response("Annonce ikke fundet", { status: 404, headers: corsHeaders });
    if (ownerRow.user_id !== caller.id) {
      const { data: p } = await supabase
        .from("profiles").select("is_admin").eq("id", caller.id).single();
      if (!p?.is_admin) {
        return new Response("Ingen adgang til denne annonce", { status: 403, headers: corsHeaders });
      }
    }

    // Hent alle gemte søgninger (ikke notificeret i 24 timer)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: searches } = await supabase
      .from("saved_searches")
      .select("id, user_id, name, filters, last_notified_at")
      .or(`last_notified_at.is.null,last_notified_at.lt.${oneDayAgo}`);

    if (!searches || searches.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtrer: kun søgninger der matcher + ekskludér cyklens ejer
    console.log(`Bike: id=${bike.id} type=${bike.type} price=${bike.price} (${typeof bike.price})`);
    const matching = searches.filter(s => {
      const f = s.filters || {};
      const isOwner = s.user_id === bike.user_id;
      const matches = bikeMatchesSearch(bike, f);
      if (!matches) console.log(`Search "${s.name}" (${s.id}): NO MATCH — filters.maxPrice=${f.maxPrice}, filters.minPrice=${f.minPrice}`);
      return !isOwner && matches;
    });
    if (matching.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Grupper pr. bruger
    const byUser = {};
    for (const s of matching) {
      if (!byUser[s.user_id]) byUser[s.user_id] = [];
      byUser[s.user_id].push(s);
    }

    // Send emails
    const bikeName = `${bike.brand} ${bike.model}`;
    const bikePrice = typeof bike.price === "number" ? bike.price.toLocaleString("da-DK") + " kr." : "";
    let sent = 0;

    for (const [userId, userSearches] of Object.entries(byUser)) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;

        const { data: profile } = await supabase.from("profiles").select("name").eq("id", userId).single();
        const userName = profile?.name ?? "Hej";

        const searchNames = userSearches.map(s => `<li style="margin-bottom:4px;">${s.name}</li>`).join("");

        const bikeUrl  = `https://xn--cykelbrsen-5cb.dk/bike/${bike.id}`;
        // Filter ud kendte placeholder/test-URLs (fake bulk-import data)
        const isValidImageUrl = (u: string | null | undefined): boolean => {
          if (!u || typeof u !== "string") return false;
          if (!/^https:\/\//.test(u)) return false;
          if (/eksempel\.dk|placeholder|example\.(com|dk|org)|test\.dk/i.test(u)) return false;
          return true;
        };
        const placeholderHtml = `<a href="${bikeUrl}" style="text-decoration:none;display:block;">
          <div style="width:100%;max-width:536px;height:200px;background:#F5F0E8;border:1px solid #E5DCC9;display:flex;align-items:center;justify-content:center;font-size:3.5rem;border-radius:10px;margin:0 0 16px;text-align:center;line-height:200px;">🚲</div>
        </a>`;
        const imgHtml  = isValidImageUrl(bike.image)
          ? `<a href="${bikeUrl}" style="text-decoration:none;"><img src="${bike.image}" alt="${bikeName}" style="width:100%;max-width:536px;height:auto;max-height:320px;object-fit:cover;border-radius:10px;display:block;margin:0 0 16px;"></a>`
          : placeholderHtml;

        const html = emailWrapper(`
          <h2 style="color:#1A1A18;font-size:1.1rem;margin:0 0 12px;">🔔 Ny annonce matcher din søgning!</h2>
          <p style="color:#8A8578;margin:0 0 16px;font-size:0.9rem;line-height:1.6;">
            Hej ${userName},<br><br>
            Der er netop oprettet en ny annonce, der matcher ${userSearches.length === 1 ? 'din gemte søgning' : 'dine gemte søgninger'}:
          </p>
          <ul style="color:#8A8578;font-size:0.9rem;margin:0 0 20px;padding-left:20px;">${searchNames}</ul>
          ${imgHtml}
          <div style="background:#F5F0E8;border-left:4px solid #2A3D2E;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <p style="color:#1A1A18;margin:0 0 4px;font-weight:bold;font-size:1rem;">${bikeName}</p>
            ${bikePrice ? `<p style="color:#C8502A;margin:0 0 4px;font-weight:bold;">${bikePrice}</p>` : ""}
            ${bike.type ? `<p style="color:#8A8578;margin:0;font-size:0.85rem;">${bike.type}${bike.city ? " · " + bike.city : ""}${bike.condition ? " · " + bike.condition : ""}</p>` : ""}
          </div>
          <a href="${bikeUrl}"
             style="background:#2A3D2E;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-bottom:16px;">
            Se annonce →
          </a>
          <p style="color:#8A8578;font-size:0.8rem;margin:16px 0 0;">
            Du modtager denne besked fordi du har gemt en søgning på Cykelbørsen.
            <br><a href="https://xn--cykelbrsen-5cb.dk/me" style="color:#8A8578;">Administrér dine gemte søgninger</a>
          </p>
        `);

        await sendEmail(user.email, `🔔 Ny ${bikeName} matcher din søgning – Cykelbørsen`, html);

        // Markér som notificeret
        const ids = userSearches.map(s => s.id);
        await supabase
          .from("saved_searches")
          .update({ last_notified_at: new Date().toISOString() })
          .in("id", ids);

        sent++;
        console.log(`Email sendt til ${user.email}`);
      } catch (userErr) {
        console.error(`Fejl ved user ${userId}:`, userErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, matched: matching.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fejl:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
