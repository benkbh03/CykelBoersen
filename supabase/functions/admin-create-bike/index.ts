// Supabase Edge Function: admin-create-bike
// Lader admin oprette annoncer på vegne af forhandlere der har givet
// eksplicit samtykke (admin_can_create_listings = true på profiles).
//
// GDPR art. 28: forhandleren er dataansvarlig sælger, admin er databehandler
// med begrænset scope (kun bike + bike_images insert — ingen anden adgang).
//
// Audit-trail: bikes.created_by_admin_id sættes til caller.id, og handlingen
// console-logges så Supabase function-logs holder spor.
//
// Deploy: Supabase Dashboard → Edge Functions → admin-create-bike → Deploy
//
// Påkrævede secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-sat)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Whitelist af bike-felter — beskytter mod at admin sender uventede felter
// der kunne overskrive seller-fremmedfelter som user_id eller is_active
const ALLOWED_BIKE_FIELDS = new Set([
  "brand", "model", "title", "price", "original_price", "year",
  "city", "description", "type", "size", "size_cm", "condition",
  "wheel_size", "warranty", "external_url", "color", "colors",
  "groupset", "frame_material", "brake_type", "electronic_shifting",
  "weight_kg", "motor", "motor_position", "battery_wh", "suspension", "geartype", "step_type",
  "external_id",
]);

// "model" er bevidst IKKE påkrævet her — sælg-flowet tillader oprettelse
// uden model efter brugerbekræftelse (samme som det almindelige insert-flow
// for private/forhandler-oprettelse, der ikke håndhæver dette på DB-niveau).
const REQUIRED_BIKE_FIELDS = ["brand", "price", "city", "type", "condition"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── 1. Verificér caller-JWT ─────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ error: "Ikke logget ind" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: caller }, error: authErr } = await supa.auth.getUser(jwt);
    if (authErr || !caller) return jsonResponse({ error: "Ugyldig session" }, 401);

    // ── 2. Verificér admin-status ───────────────────────────
    const { data: callerProfile } = await supa
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();

    if (!callerProfile?.is_admin) {
      return jsonResponse({ error: "Kræver admin-rettigheder" }, 403);
    }

    // ── 3. Parse body ───────────────────────────────────────
    const body = await req.json();
    const { target_user_id, bike, images } = body;

    if (!target_user_id || typeof target_user_id !== "string") {
      return jsonResponse({ error: "target_user_id påkrævet" }, 400);
    }
    if (target_user_id === caller.id) {
      return jsonResponse({ error: "Du kan ikke oprette på vegne af dig selv" }, 400);
    }
    if (!bike || typeof bike !== "object") {
      return jsonResponse({ error: "bike-data påkrævet" }, 400);
    }

    // ── 4. Verificér at target er dealer + har givet opt-in ─
    const { data: target, error: targetErr } = await supa
      .from("profiles")
      .select("id, seller_type, admin_can_create_listings, name, shop_name")
      .eq("id", target_user_id)
      .single();

    if (targetErr || !target) {
      return jsonResponse({ error: "Forhandler ikke fundet" }, 404);
    }
    if (target.seller_type !== "dealer") {
      return jsonResponse({ error: "Target er ikke en forhandler" }, 400);
    }
    if (!target.admin_can_create_listings) {
      return jsonResponse({
        error: "Forhandler har ikke aktiveret onboarding-service. Bed dem aktivere det i deres indstillinger først."
      }, 403);
    }

    // ── 5. Valider bike-felter ──────────────────────────────
    for (const required of REQUIRED_BIKE_FIELDS) {
      if (!bike[required]) {
        return jsonResponse({ error: `Manglende felt: ${required}` }, 400);
      }
    }
    const price = Number(bike.price);
    if (!Number.isFinite(price) || price <= 0) {
      return jsonResponse({ error: "Ugyldig pris" }, 400);
    }

    // ── 6. Whitelist bike-felter + tilføj system-styrede ────
    const safeBike: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bike)) {
      if (ALLOWED_BIKE_FIELDS.has(key)) safeBike[key] = value;
    }
    safeBike.user_id             = target_user_id;
    safeBike.created_by_admin_id = caller.id;
    if (!safeBike.original_price) safeBike.original_price = price;

    // ── 7. Upsert bike ──────────────────────────────────────
    // Har annoncen et external_id (forhandlerens varenummer fra CSV/feed) og
    // findes der allerede en cykel med samme (user_id, external_id)? → opdatér
    // den i stedet for at lave en dublet. Ellers opret ny. Manuelt oprettede
    // cykler uden external_id opretter altid en ny række (uændret adfærd).
    const externalId = typeof safeBike.external_id === "string" && safeBike.external_id.trim()
      ? safeBike.external_id.trim()
      : null;

    let bikeId: string | null = null;
    let wasUpdate = false;

    if (externalId) {
      const { data: existing } = await supa
        .from("bikes")
        .select("id")
        .eq("user_id", target_user_id)
        .eq("external_id", externalId)
        .maybeSingle();

      if (existing?.id) {
        // Opdatér eksisterende: gen-aktivér + ryd sold_at (cyklen er tilbage i lager)
        safeBike.is_active = true;
        safeBike.sold_at   = null;
        const { error: updErr } = await supa
          .from("bikes")
          .update(safeBike)
          .eq("id", existing.id);
        if (updErr) {
          console.error("Bike update fejl:", updErr);
          return jsonResponse({ error: "Kunne ikke opdatere annonce" }, 500);
        }
        bikeId = existing.id;
        wasUpdate = true;
      }
    }

    if (!bikeId) {
      safeBike.is_active = true;
      const { data: newBike, error: insertErr } = await supa
        .from("bikes")
        .insert(safeBike)
        .select("id")
        .single();
      if (insertErr || !newBike) {
        console.error("Bike insert fejl:", insertErr);
        return jsonResponse({ error: "Kunne ikke oprette annonce" }, 500);
      }
      bikeId = newBike.id;
    }

    // ── 8. Synkronisér bike_images ──────────────────────────
    // Ved opdatering: erstat billeder (feedet er kilden) — slet gamle først.
    if (Array.isArray(images) && images.length > 0) {
      const imageRows = images
        .filter((img) => img && typeof img.url === "string" && img.url.startsWith("https://"))
        .map((img) => ({
          bike_id:    bikeId,
          url:        img.url,
          is_primary: !!img.is_primary,
        }));

      if (imageRows.length > 0) {
        if (wasUpdate) {
          await supa.from("bike_images").delete().eq("bike_id", bikeId);
        }
        const { error: imgErr } = await supa.from("bike_images").insert(imageRows);
        if (imgErr) {
          console.error("Bike_images insert fejl:", imgErr);
          // Bike er allerede oprettet/opdateret — log men returner ikke fejl
        }
      }
    }

    console.log(`Admin ${caller.id} ${wasUpdate ? "opdaterede" : "oprettede"} annonce ${bikeId} for forhandler ${target_user_id}`);
    return jsonResponse({
      ok: true,
      bike_id: bikeId,
      updated: wasUpdate,
      target_name: target.shop_name || target.name,
    });

  } catch (err) {
    console.error("admin-create-bike uventet fejl:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
