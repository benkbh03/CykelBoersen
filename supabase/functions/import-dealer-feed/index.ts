// Supabase Edge Function: import-dealer-feed
// Deploy: Supabase Dashboard → Edge Functions → import-dealer-feed → Deploy
//
// Henter en forhandlers produkt-feed (Shopify products.json, Google Shopping XML
// eller CSV), opretter/opdaterer cyklerne (upsert på user_id+external_id) og
// deaktiverer udsolgte (reconcile). Spejler logikken i admin-create-bike, men
// kører server-side.
//
// Shopify: angiv feed-URL https://<shop>/products.json og format "shopify_json".
// Functionen paginerer automatisk (250/side) og springer åbenlyst tilbehør over.
//
// To måder at kalde:
//   1) Cron (run-all): header  x-cron-secret: <FEED_CRON_SECRET>   body {}
//      → synkroniserer ALLE aktive feeds.
//   2) Admin (én feed): Authorization: Bearer <admin-JWT>
//      body { feed_id, preview? }
//      → preview=true henter+parser uden at skrive (til "Test feed").
//
// "Verify JWT" SKAL være SLÅET FRA (cron sender ingen Supabase-JWT).
//
// Påkrævede secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-sat)
//   FEED_CRON_SECRET                         (vilkårlig hemmelig streng — samme som i cron-SQL)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FEED_CRON_SECRET     = Deno.env.get("FEED_CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_TYPES = ["Racercykel", "Mountainbike", "Citybike", "El-cykel", "Ladcykel", "Børnecykel", "Gravel", "Senior cykel"];

// Kanonisk mærke-liste — SKAL matche KNOWN_BRANDS i main.js, så et importeret
// mærke er præcis den værdi mærke-filteret bruger (ellers filtrerer det ikke).
const KNOWN_BRANDS = ["Amladcykler","Avenue","Babboe","Batavus","Bergamont","Bianchi","Bike by Gubi","Black Iron Horse","BMC","Brabus","Brompton","Butchers & Bicycles","Cannondale","Canyon","Carqon","Centurion","Cervélo","Christiania Bikes","Colnago","Conway","Corratec","Cube","E-Fly","Early Rider","Ebsen","Electra","Everton","FACTOR","Falcon","Felt","Focus","Frog Bikes","Gazelle","Ghost","Giant","GT","Gudereit","Haibike","Husqvarna","Kalkhoff","Kildemoes","Koga","Kona","Kreidler","Lapierre","Larry vs Harry / Bullitt","Lindebjerg","Liv","LOOK","Marin","Mate Bike","MBK","Merida","Momentum","Mondraker","Motobecane","Moustache","Nihola","Nishiki","Norden","Norco","Omnium","Orbea","Pegasus","Pinarello","Principia","Puky","Qio","QWIC","Raleigh","Remington","Riese & Müller","Ridley","Royal Cargobike","Santa Cruz","SCO","Scott","Seaside Bike","Silverback","Sparta","Specialized","Stevens","Superior","Tern","Trek","Triobike","Urban Arrow","uVelo","Van De Falk","VanMoof","Velo","Velo de Ville","Velo Lux","Victoria","Wilier","Winther","Woom","Yuba"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find det kanoniske mærke i en titel (længste match vinder, så "Velo Lux"
// foretrækkes frem for "Velo"). Falder tilbage til vendor hvis det ikke er
// shoppens eget navn, ellers første ord.
function matchBrand(title: string, vendor: string): string {
  let best = "";
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp(`(^|[^\\p{L}])${escapeRe(b)}([^\\p{L}]|$)`, "iu");
    if (re.test(title) && b.length > best.length) best = b;
  }
  if (best) return best;
  const v = stripHtml(vendor);
  if (v && !/forum\s+cykel|v(æ|ae)rksted/i.test(v)) return v;
  return (title.trim().split(/\s+/)[0] || "Cykel");
}

// Fjern shop-støj ("forum cykel værksted") fra en titel
function cleanTitle(t: string): string {
  return stripHtml(t).replace(/forum\s+cykel\s+v(æ|ae)rksted/gi, "").replace(/\s+/g, " ").trim();
}

// ── Feltkonvertering ────────────────────────────────────────
function stripHtml(s: string): string {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const m = String(raw).replace(",", ".").match(/[\d.]+/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[0]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function scalePrice(n: number | null, factor: number): number | null {
  return n == null ? null : Math.round(n * factor);
}

function mapCondition(raw: unknown): string {
  const c = String(raw ?? "").toLowerCase();
  if (c.includes("refurb")) return "Som ny";
  if (c.includes("used"))   return "God stand";
  if (c.includes("new"))    return "Ny";
  return "God stand";
}

// Gæt cykeltype ud fra feed-kategori/titel, ellers feedets default
function inferType(text: string, fallback: string | null): string {
  const t = (text || "").toLowerCase();
  if (/\b(gravel|grus)\b/.test(t)) return "Gravel";
  if (/\b(mtb|mountain|terr)\b/.test(t)) return "Mountainbike";
  if (/\b(el-?cykel|e-?bike|elektrisk|pedelec)\b/.test(t)) return "El-cykel";
  if (/\b(lad|cargo|long.?john)\b/.test(t)) return "Ladcykel";
  if (/\b(b(ø|o)rn|junior|kids?)\b/.test(t)) return "Børnecykel";
  if (/\b(rac|road|landevej)\b/.test(t)) return "Racercykel";
  if (/\b(senior|komfort)\b/.test(t)) return "Senior cykel";
  if (/\b(city|hybrid|pendl)\b/.test(t)) return "Citybike";
  if (fallback && VALID_TYPES.includes(fallback)) return fallback;
  return "Citybike";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// ── Parse Google Shopping XML → normaliserede items ─────────
function parseGoogleXml(xml: string): any[] {
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.feed ?? {};
  const items = asArray(channel.item ?? doc?.feed?.entry);
  return items.map((it: any) => {
    const title = stripHtml(it["g:title"] ?? it.title ?? "");
    const brandRaw = stripHtml(it["g:brand"] ?? "");
    const brand = brandRaw || title.split(/\s+/)[0] || "";
    const model = brandRaw && title.toLowerCase().startsWith(brandRaw.toLowerCase())
      ? title.slice(brandRaw.length).trim()
      : title;
    const images = [
      it["g:image_link"] ?? it.image_link,
      ...asArray(it["g:additional_image_link"] ?? it.additional_image_link),
    ].filter((u) => typeof u === "string" && u.startsWith("https://"));
    return {
      external_id:  String(it["g:id"] ?? it.id ?? "").trim(),
      brand, model, title,
      price:        parsePrice(it["g:price"] ?? it.price),
      description:  stripHtml(it["g:description"] ?? it.description ?? ""),
      external_url: typeof it.link === "string" ? it.link : (it.link?.["@_href"] ?? null),
      condition:    mapCondition(it["g:condition"] ?? it.condition),
      availability: String(it["g:availability"] ?? it.availability ?? "in_stock").toLowerCase(),
      _typeHint:    `${it["g:product_type"] ?? ""} ${it["g:google_product_category"] ?? ""} ${title}`,
      images,
    };
  });
}

// ── Parse CSV → normaliserede items (samme felter som bulk-import) ──
function parseCsv(text: string): any[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const splitLine = (line: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = splitLine(line); const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").trim(); });
    const images: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const u = row[`image_${i}`] || row[`image${i}`] || "";
      if (u.startsWith("https://")) images.push(u);
    }
    return {
      external_id:  (row.external_id || "").trim(),
      brand: row.brand || "", model: row.model || "",
      title: `${row.brand || ""} ${row.model || ""}`.trim(),
      price: parsePrice(row.price),
      description: row.description || "",
      external_url: row.external_url || null,
      condition: row.condition || "God stand",
      availability: (row.availability || "in_stock").toLowerCase(),
      _typeHint: `${row.type || ""}`,
      _explicitType: row.type || null,
      city: row.city || null,
      images,
    };
  });
}

// ── Shopify: spring åbenlyst tilbehør over (ikke cykler) ────
// Kun ord der entydigt er tilbehør/beklædning — IKKE ord der kan stå i en
// cykel-titel (gear, lys, dæk, kæde, bremse osv. er bevidst udeladt).
const ACCESSORY_RE = /(l(å|aa)s|lygte|cykelpumpe|\bpumpe\b|hjelm|bagageb(æ|ae)rer|\bkurv\b|sk(æ|ae)rm|cykelstativ|cykelcomputer|reservedel|tilbeh(ø|o)r|gavekort|reflek|ringeklokke|str(ø|o)mpe|t-?shirt|trøje|handske|drikkedunk|flaskeholder)/i;
function looksLikeAccessory(text: string): boolean {
  return ACCESSORY_RE.test(text || "");
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}

// ── Shopify Markets serverer priser i besøgerens lokale valuta baseret på
//    IP-geolokation — edge-funktionen kører ikke fra en dansk IP og kan derfor
//    få priser i EUR i stedet for DKK. /cart.js afslører hvilken valuta
//    Shopify har valgt til DENNE request, så vi kan regne tilbage til DKK.
//    DKK er ERM II-fastkurset til EUR (~7,46, bånd ±2,25%) — derfor er en fast
//    kurs sikker at bruge. Andre valutaer er kun et grovt fallback-gæt.
const FX_TO_DKK: Record<string, number> = { DKK: 1, EUR: 7.46, USD: 6.9, GBP: 8.7, SEK: 0.66, NOK: 0.62 };

async function detectCurrencyFactor(origin: string, ua: Record<string, string>): Promise<number> {
  try {
    const res = await fetch(`${origin}/cart.js`, { headers: ua });
    if (!res.ok) return 1;
    const data = JSON.parse(await res.text());
    const code = String(data?.currency ?? "DKK").toUpperCase();
    return FX_TO_DKK[code] ?? 1;
  } catch {
    return 1;
  }
}

// ── Parse Shopify products.json → normaliserede items ───────
function parseShopifyProducts(products: any[], origin: string, fxFactor = 1): any[] {
  return products.map((p: any) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const v0 = variants[0] || {};
    const anyAvail = variants.some((v: any) => v.available);
    const images = (Array.isArray(p.images) ? p.images : [])
      .map((im: any) => im?.src)
      .filter((u: any) => typeof u === "string" && u.startsWith("https://"));
    const vendor = stripHtml(p.vendor ?? "");
    const title  = cleanTitle(p.title ?? "");
    // Kanonisk mærke (matcher mærke-filteret) udledt fra titlen
    const brand  = matchBrand(title, vendor);
    // Model = titel uden mærket (så "Centurion Basic Free" → "Basic Free")
    let model = title.replace(new RegExp(escapeRe(brand), "i"), "").replace(/\s+/g, " ").trim();
    if (!model) model = title;
    // Beskrivelse: brug webshoppens tekst, men sikr min. længde (påkrævet felt)
    let description = stripHtml(p.body_html ?? "");
    if (description.length < 40) {
      description = `${brand} ${model}`.trim() + " — ny cykel fra forhandleren. Kontakt forhandleren for nærmere info om udstyr og specifikationer.";
    }
    return {
      external_id:   String(p.id ?? "").trim(),
      brand, model, title,
      price:         scalePrice(parsePrice(v0.price), fxFactor),
      original_price: scalePrice(parsePrice(v0.compare_at_price), fxFactor) || null,
      description,
      external_url:  p.handle ? `${origin}/products/${p.handle}` : null,
      condition:     "Ny",
      availability:  anyAvail ? "in_stock" : "out_of_stock",
      _typeHint:     `${p.product_type ?? ""} ${Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags ?? "")} ${title}`,
      _accessory:    looksLikeAccessory(`${p.product_type ?? ""} ${title}`),
      images,
    };
  });
}

// ── Hent + parse feed (håndterer Shopify-paginering) ────────
async function fetchItems(feed: any): Promise<any[]> {
  // Sprog + landehints så Shopify Markets serverer DKK-priser i stedet for
  // geo-IP-baseret EUR (edge-funktionen kører ikke fra en dansk IP).
  // "localization"-cookien er Shopify Markets' egen landevælger-cookie.
  const ua = {
    "User-Agent": "CykelboersenFeedBot/1.0",
    "Accept-Language": "da-DK,da;q=0.9",
    "Cookie": "localization=DK; cart_currency=DKK",
  };

  if (feed.format === "shopify_json") {
    const origin = originOf(feed.feed_url);
    const fxFactor = await detectCurrencyFactor(origin, ua);
    const base = feed.feed_url.split("?")[0].replace(/\/$/, "");
    const all: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`${base}?limit=250&page=${page}`, { headers: ua });
      if (!res.ok) throw new Error(`Feed svarede ${res.status}`);
      const data = JSON.parse(await res.text());
      const prods = Array.isArray(data?.products) ? data.products : [];
      if (prods.length === 0) break;
      all.push(...parseShopifyProducts(prods, origin, fxFactor));
      if (prods.length < 250) break;
    }
    return all.filter((it) => !it._accessory);
  }

  const res = await fetch(feed.feed_url, { headers: ua });
  if (!res.ok) throw new Error(`Feed svarede ${res.status}`);
  const raw = await res.text();
  return feed.format === "csv" ? parseCsv(raw) : parseGoogleXml(raw);
}

// ── Synkronisér ÉN feed ─────────────────────────────────────
async function syncFeed(supa: any, feed: any, preview: boolean) {
  // Forhandler-profil (city-fallback + tjek samtykke)
  const { data: profile } = await supa
    .from("profiles")
    .select("id, city, seller_type, admin_can_create_listings")
    .eq("id", feed.user_id)
    .single();

  if (!profile || profile.seller_type !== "dealer") throw new Error("Forhandler ikke fundet");
  if (!profile.admin_can_create_listings) throw new Error("Forhandler har ikke aktiveret onboarding-samtykke");

  // Hent + parse feed (Google XML / CSV / Shopify products.json)
  let items = await fetchItems(feed);
  items = items.filter((it) => it.external_id && it.price && (it.brand || it.title));

  // Byg bike-payloads
  const fallbackCity = profile.city || "Danmark";
  const built = items.map((it) => ({
    external_id: it.external_id,
    available:   !it.availability.includes("out"),
    bike: {
      external_id:  it.external_id,
      brand:        it.brand || it.title,
      model:        it.model || "",
      title:        it.title,
      type:         it._explicitType && VALID_TYPES.includes(it._explicitType) ? it._explicitType : inferType(it._typeHint, feed.default_type),
      price:        it.price,
      original_price: it.original_price || it.price,
      condition:    VALID_TYPES.includes(it.condition) ? "God stand" : it.condition,
      city:         it.city || fallbackCity,
      description:  it.description || "",
      external_url: it.external_url,
    },
    images: it.images.map((url: string, idx: number) => ({ url, is_primary: idx === 0 })),
  }));

  if (preview) {
    return { preview: true, total: built.length, items: built.slice(0, 50).map((b) => b.bike) };
  }

  // Upsert hver vare (kun in-stock; out_of_stock håndteres af reconcile)
  let created = 0, updated = 0, failed = 0;
  const seenIds: string[] = [];

  for (const row of built) {
    if (!row.available) continue;  // udsolgt — lad reconcile deaktivere
    seenIds.push(row.external_id);
    try {
      const { data: existing } = await supa
        .from("bikes")
        .select("id")
        .eq("user_id", feed.user_id)
        .eq("external_id", row.external_id)
        .maybeSingle();

      const payload: Record<string, unknown> = { ...row.bike, user_id: feed.user_id, is_active: true };

      if (existing?.id) {
        payload.sold_at = null;
        await supa.from("bikes").update(payload).eq("id", existing.id);
        await supa.from("bike_images").delete().eq("bike_id", existing.id);
        if (row.images.length) await supa.from("bike_images").insert(row.images.map((im) => ({ ...im, bike_id: existing.id })));
        updated++;
      } else {
        const { data: nb } = await supa.from("bikes").insert(payload).select("id").single();
        if (nb?.id && row.images.length) await supa.from("bike_images").insert(row.images.map((im) => ({ ...im, bike_id: nb.id })));
        created++;
      }
    } catch (_e) { failed++; }
  }

  // Reconcile: deaktivér feed-cykler der ikke længere er i feedet (= udsolgt)
  let deactivated = 0;
  if (seenIds.length > 0) {
    const { data } = await supa.rpc("reconcile_dealer_feed", { p_user_id: feed.user_id, p_seen_ids: seenIds });
    deactivated = data || 0;
  }

  await supa.from("dealer_feeds").update({
    last_synced_at:   new Date().toISOString(),
    last_status:      "ok",
    last_count:       created + updated,
    last_deactivated: deactivated,
  }).eq("id", feed.id);

  return { created, updated, failed, deactivated, total: built.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const cronSecret = req.headers.get("x-cron-secret") ?? "";
    const isCron = FEED_CRON_SECRET && cronSecret === FEED_CRON_SECRET;

    let isAdmin = false;
    if (!isCron) {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "Ikke logget ind" }, 401);
      const { data: { user } } = await supa.auth.getUser(jwt);
      if (!user) return json({ error: "Ugyldig session" }, 401);
      const { data: p } = await supa.from("profiles").select("is_admin").eq("id", user.id).single();
      isAdmin = !!p?.is_admin;
      if (!isAdmin) return json({ error: "Kræver admin-rettigheder" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { feed_id, preview } = body ?? {};

    // ── Run-all (cron) ──────────────────────────────────────
    if (!feed_id) {
      if (!isCron && !isAdmin) return json({ error: "feed_id påkrævet" }, 400);
      const { data: feeds } = await supa.from("dealer_feeds").select("*").eq("active", true);
      const results: any[] = [];
      for (const feed of feeds ?? []) {
        try {
          results.push({ feed_id: feed.id, ...(await syncFeed(supa, feed, false)) });
        } catch (e) {
          await supa.from("dealer_feeds").update({
            last_synced_at: new Date().toISOString(), last_status: String((e as Error).message),
          }).eq("id", feed.id);
          results.push({ feed_id: feed.id, error: String((e as Error).message) });
        }
      }
      return json({ ok: true, feeds: results.length, results });
    }

    // ── Single feed (admin: test/preview eller sync nu) ─────
    const { data: feed } = await supa.from("dealer_feeds").select("*").eq("id", feed_id).single();
    if (!feed) return json({ error: "Feed ikke fundet" }, 404);

    try {
      const result = await syncFeed(supa, feed, !!preview);
      return json({ ok: true, ...result });
    } catch (e) {
      if (!preview) {
        await supa.from("dealer_feeds").update({
          last_synced_at: new Date().toISOString(), last_status: String((e as Error).message),
        }).eq("id", feed.id);
      }
      return json({ error: String((e as Error).message) }, 400);
    }
  } catch (err) {
    console.error("import-dealer-feed uventet fejl:", err);
    return json({ error: String(err) }, 500);
  }
});
