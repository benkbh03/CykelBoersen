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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";
// Bruger Denos indbyggede Deno.serve (ingen ekstern std-afhængighed at bundle).

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

// Robust pris-parser der håndterer både "6299.00" (Shopify),
// "6.299,00" (dansk), "6,299.00" (engelsk) og rene heltal.
function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Det sidste tegn er decimal-separatoren; det andet er tusind-separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else                                         s = s.replace(/,/g, "");
  } else if (hasComma) {
    const p = s.split(",");
    s = (p.length === 2 && p[1].length <= 2) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const p = s.split(".");
    // ".000" / 3-cifret sidste gruppe = tusind-separator, ellers decimal.
    if (p.length > 1 && p[p.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Math.round(parseFloat(s));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Valuta → DKK ────────────────────────────────────────────
// Shopify products.json serverer butikkens PRIMÆRE valuta og ignorerer
// locale-cookies. Er den fx EUR, importeres tal som "629" der i virkeligheden
// er 629 EUR ≈ 4.692 kr. Vi opdager valutaen (via /cart.js) og omregner.
// EUR er fastkurs-bundet til DKK (ERM II ~7,46) → stabil. Øvrige kurser er
// rimelige cirka-værdier og kan finjusteres; admin kan også sætte valuta manuelt.
const FX_TO_DKK: Record<string, number> = {
  DKK: 1, EUR: 7.46, SEK: 0.64, NOK: 0.64, USD: 6.90, GBP: 8.70, PLN: 1.70, CHF: 7.90,
};

// Afrund en FX-omregnet pris til butikkens pris-mønster, så fx 4.692 → 4.699.
function roundPrice(n: number, mode: string): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  switch (mode) {
    case "99":  return Math.max(99, Math.round((n + 1) / 100) * 100 - 1);  // nærmeste x99
    case "95":  return Math.max(95, Math.round((n - 95) / 100) * 100 + 95); // nærmeste x95
    case "50":  return Math.round(n / 50) * 50;
    case "100": return Math.round(n / 100) * 100;
    default:    return n;                                                    // 'none'
  }
}

// Læs valutaen for en given Shopify-base (rod eller markeds-subfolder) via
// Ajax-API'et /cart.js. Returnerer "" hvis ukendt (så discovery kan gå videre).
async function fetchCartCurrency(base: string, headers: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(`${base}/cart.js`, { headers });
    if (res.ok) {
      const data = JSON.parse(await res.text());
      const cur = String(data?.currency ?? "").toUpperCase();
      if (/^[A-Z]{3}$/.test(cur)) return cur;
    }
  } catch (_e) { /* ukendt valuta */ }
  return "";
}

// Har denne products.json-URL mindst ét produkt? Verificerer at en markeds-
// subfolder faktisk har varer, før vi bruger den.
async function shopHasProducts(productsUrl: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(`${productsUrl}?limit=1`, { headers });
    if (!res.ok) return false;
    const data = JSON.parse(await res.text());
    return Array.isArray(data?.products) && data.products.length > 0;
  } catch (_e) { return false; }
}

// Hent første produkts (højeste variant-)pris fra en products.json-URL. Bruges
// til at se om ?country=DK får Shopify til at skifte til DKK-priser (prisen hopper).
async function firstShopifyPrice(url: string, headers: Record<string, string>): Promise<number | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = JSON.parse(await res.text());
    const p = (Array.isArray(data?.products) ? data.products : [])[0];
    if (!p) return null;
    const prices = (Array.isArray(p.variants) ? p.variants : [])
      .map((v: any) => parsePrice(v.price)).filter((n: any): n is number => n != null);
    return prices.length ? Math.max(...prices) : null;
  } catch (_e) { return null; }
}

// Læs Shopify Markets-subfolders fra <link rel="alternate" hreflang=...> på
// forsiden. Shopify udsender én pr. marked (fx href=".../en-dk/"), så vi finder
// den faktiske danske sti i stedet for at gætte. Returnerer fx "en-dk" eller null.
async function findDkMarketFromHreflang(origin: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/`, { headers });
    if (!res.ok) return null;
    const html = await res.text();
    const hrefs = new Set<string>();
    const re = /<link\b[^>]*rel=["']alternate["'][^>]*>/gi;
    let tag: RegExpExecArray | null;
    while ((tag = re.exec(html))) {
      const lang = (tag[0].match(/hreflang=["']([^"']+)["']/i) || [])[1] || "";
      const href = (tag[0].match(/href=["']([^"']+)["']/i) || [])[1] || "";
      if (href && /(-dk|^da)/i.test(lang)) hrefs.add(href);  // dansk marked / DK-land
    }
    for (const href of hrefs) {
      try {
        const u = new URL(href, origin);
        if (u.origin !== origin) continue;
        const prefix = u.pathname.replace(/^\/+|\/+$/g, "");   // "en-dk" (tom = rod = geo, springes over)
        if (!prefix) continue;
        if (await fetchCartCurrency(`${origin}/${prefix}`, headers) === "DKK"
            && await shopHasProducts(`${origin}/${prefix}/products.json`, headers)) {
          return prefix;
        }
      } catch (_e) { /* ignorér ugyldig href */ }
    }
  } catch (_e) { /* forside utilgængelig */ }
  return null;
}

// Find en Shopify Markets-subfolder der serverer DKK, så vi får butikkens
// EKSAKTE danske priser (fx 4.699 kr) frem for en omtrentlig FX-omregning.
// Returnerer: "" = roden er allerede DKK · "en-dk" o.l. = brug den subfolder ·
// null = ingen DKK-markedssti fundet (→ FX-omregning som fallback).
const DK_MARKET_PREFIXES = ["en-dk", "da-dk", "da", "dk", "dk-da", "en-da"];
async function findDkkMarket(origin: string, headers: Record<string, string>): Promise<string | null> {
  if (await fetchCartCurrency(origin, headers) === "DKK") return "";
  const viaHreflang = await findDkMarketFromHreflang(origin, headers);
  if (viaHreflang) return viaHreflang;
  for (const p of DK_MARKET_PREFIXES) {
    if (await fetchCartCurrency(`${origin}/${p}`, headers) === "DKK"
        && await shopHasProducts(`${origin}/${p}/products.json`, headers)) {
      return p;
    }
  }
  return null;
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
  // Ladcykel KUN ved entydige cargo-signaler — IKKE bare "lad"/"cargo" (fx
  // "m. lad" eller modelnavnet "Yate Cargo" er ikke en ladcykel).
  if (/\bladcykel\b|long.?john|long.?tail|christiania|\bbullitt\b|babboe|nihola|urban\s*arrow|carqon|amladcykler|royal\s*cargobike|butchers/i.test(t)) return "Ladcykel";
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
const ACCESSORY_RE = /(l(å|aa)s|lygte|cykelpumpe|\bpumpe\b|hjelm|bagageb(æ|ae)rer|\bkurv\b|sk(æ|ae)rm|cykelstativ|cykelcomputer|reservedel|tilbeh(ø|o)r|gavekort|reflek|ringeklokke|str(ø|o)mpe|t-?shirt|trøje|handske|drikkedunk|flaskeholder|sadelovertr(æ|ae)k|sadelbetr(æ|ae)k|\bovertr(æ|ae)k\b|\bsadel\b|\bsadler\b|sadelpind|frempind|\bgreb\b|h(å|aa)ndtag|\bpedal(er)?\b|\bslange\b|st(ø|o)tteben|kickstand|cykeltaske|sadeltaske|barnestol|cykelstol|cykelanh(æ|ae)nger)/i;
function looksLikeAccessory(text: string): boolean {
  return ACCESSORY_RE.test(text || "");
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}

// ── Felt-berigelse ──────────────────────────────────────────
// VIGTIGT: ALDRIG gætte. Et felt sættes KUN hvis værdien bogstaveligt står i
// titel/beskrivelse/tags/varianter. Vi UDLEDER ikke (fx "dame"→indstigning eller
// "Nexus"→geartype). Står det ikke der, lades feltet TOMT. Forkert data er værre
// end manglende på en transparent markedsplads. Alle værdier er kanoniske.
// Farve-regler — SUBSTRING-match (ikke ordgrænse), så danske sammensatte
// farveord rammes: "MØRKEGRØN"→Grøn, "LYSERBLÅ"→Blå, "POSTKASSERØD"→Rød.
// Lyserød står FØR Rød, og en match fjernes fra teksten så "lyserød" ikke
// også tæller som Rød. Rækkefølgen er derfor betydningsfuld.
const _COLOR_RULES: [RegExp, string][] = [
  [/sort|black/i, "Sort"],
  [/hvid|white|perlemor/i, "Hvid"],
  [/gr(å|aa)|grey|gray|antracit|gunmetal/i, "Grå"],
  [/s(ø|o)lv|silver/i, "Sølv"],
  [/lyser(ø|o)d|pink|rosa/i, "Lyserød"],
  [/r(ø|o)d|red|bordeaux|vinr(ø|o)d|koral/i, "Rød"],
  [/bl(å|aa)|blue|navy|petrol|turkis|denim/i, "Blå"],
  [/gr(ø|o)n|green|oliven|army|mint/i, "Grøn"],
  [/gul|yellow|okker/i, "Gul"],
  [/orange/i, "Orange"],
  [/lilla|purple|violet/i, "Lilla"],
  [/cappuccino|brun|brown|kaffe|chokolade/i, "Brun"],
  [/beige|creme|nude/i, "Beige"],
];
// Længste/mest specifikke først (prefix-match i filteret).
const _GROUPSETS = [
  "Shimano Dura-Ace", "Shimano Ultegra", "Shimano GRX", "Shimano 105",
  "Shimano XT", "Shimano Deore", "SRAM Red XPLR", "SRAM Force XPLR",
  "SRAM Rival XPLR", "SRAM Red", "SRAM Force", "SRAM Apex", "SRAM Rival",
  "Campagnolo Ekar",
];
const _MOTOR_BRANDS = ["Bosch", "Yamaha", "Bafang", "Mahle", "Promovec", "Shimano"];

function extractColors(text: string): string[] {
  let work = text;
  const out: string[] = [];
  for (const [re, name] of _COLOR_RULES) {
    if (re.test(work) && !out.includes(name)) {
      out.push(name);
      work = work.replace(new RegExp(re.source, "gi"), " ");  // undgå dobbelt-match (fx lyserød→rød)
    }
  }
  return out.slice(0, 3);
}

function enrichFields(type: string, title: string, body: string, tags: string, variants: string): Record<string, unknown> {
  const name = `${title} ${tags} ${variants}`;           // titel/tags/variant-navne
  const spec = `${title} ${tags} ${body}`;               // inkl. beskrivelse
  const out: Record<string, unknown> = {};

  // Årgang (kun realistisk modelår)
  const ym = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  if (ym) { const y = +ym[1]; if (y >= 1990 && y <= 2031) out.year = y; }

  // Farve(r) — sættes som både array (colors) og tekst (color), som i sælg-flowet
  const colors = extractColors(name);
  if (colors.length) { out.colors = colors; out.color = colors.join(", "); }

  // Stelmateriale
  if (/\b(carbon|kulfiber)\b/i.test(spec)) out.frame_material = "Carbon";
  else if (/\b(titanium|titan)\b/i.test(spec)) out.frame_material = "Titanium";
  else if (/\b(aluminium|alu|alloy|alu\.)\b/i.test(spec)) out.frame_material = "Aluminium";
  else if (/\b(st(å|aa)l|steel|cr-?mo|chromoly|cromoly)\b/i.test(spec)) out.frame_material = "Stål";

  // Hjulstørrelse: et bart tomme-tal i titlen er TVETYDIGT — det kan være HJUL
  // eller STEL. Gammeldags herre-/damecykler måles i tommer-stel (fx "Raleigh
  // Tourist Herre ... 24"" = 24" STEL med 28" hjul). 26/27.5/28/29" findes ikke
  // som stelstørrelse → entydigt hjul. 12–24" overlapper med stel, så dem sætter
  // vi KUN som hjul hvis titlen IKKE markerer en voksencykel (herre/dame/voksen);
  // ellers er tallet sandsynligvis stelstørrelsen, og vi gætter ikke (jf. reglen
  // om aldrig at gætte — manglende felt er bedre end forkert).
  if (/27[.,]5|650b/i.test(spec)) out.wheel_size = '27.5" / 650b';
  else {
    // Accepter både "24"", "24 tommer", "24 inch" OG sammenskrevet "24in".
    const wm = spec.match(/\b(12|14|16|18|20|24|26|28|29)\s*("|''|″|tommer|inch)\b/i)
            || spec.match(/\b(12|14|16|18|20|24|26|28|29)in\b/i);
    if (wm) {
      const inch = +wm[1];
      // 24" er TVETYDIGT: hjul på en børne-/juniorcykel ELLER tommer-stel på en
      // voksen roadster (fx "Raleigh Herre 24"" = 24" stel med 28" hjul). Sæt
      // derfor kun 24 som hjul når der er et tydeligt børne-/junior-signal; ved
      // voksen-signal eller helt uden signal gætter vi ikke. Øvrige mål er
      // entydige (≤20 findes ikke som stel; 26"+ findes ikke som tvetydigt hjul).
      if (inch === 24) {
        const kidsBike  = /\bdreng[a-zæøå]*\b|\bpige[a-zæøå]*\b|\bjunior\b|\bb(ø|o)rn[a-zæøå]*\b|\bkids?\b|\byouth\b/i.test(name);
        const adultBike = /\bherre[a-zæøå]*\b|\bdame[a-zæøå]*\b|\bvoksen\b|\bmen'?s\b|\bwomen'?s\b/i.test(name);
        if (kidsBike && !adultBike) out.wheel_size = '24"';
      } else {
        out.wheel_size = `${inch}"`;
      }
    }
  }

  // Stelstørrelse i cm
  const sm = name.match(/\b([3-7]\d)\s*cm\b/i);
  if (sm) { const n = +sm[1]; if (n >= 38 && n <= 70) out.size_cm = n; }

  // Komponentgruppe
  for (const g of _GROUPSETS) { if (new RegExp(escapeRe(g), "i").test(spec)) { out.groupset = g; break; } }

  // Bremsetype — sæt KUN når der er ÉN entydig type i teksten. Klassiske
  // bycykler har ofte BÅDE en fodbremse (coaster) og en fælgbremse, så vi
  // gætter IKKE ud fra "fodbremse" alene (det gav forkert "Tromlebremser").
  {
    const hasDisc = /skivebrems|disc\s*brake/i.test(spec);
    const hasRim  = /f(æ|ae)lgbrems|v-?brems|rim\s*brake|caliper|stempelbrems/i.test(spec);
    const hasDrum = /tromlebrems|rullebrems|roller\s*brake|drum\s*brake/i.test(spec);
    if ((hasDisc ? 1 : 0) + (hasRim ? 1 : 0) + (hasDrum ? 1 : 0) === 1) {
      if (hasDisc) {
        if (/hydraulisk/i.test(spec)) out.brake_type = "Skivebremser hydrauliske";
        else if (/mekanisk/i.test(spec)) out.brake_type = "Skivebremser mekaniske";
        // generisk "skivebremser" uden hydraulisk/mekanisk → lad stå tomt
      } else if (hasRim) {
        out.brake_type = "Fælgbremser";
      } else {
        out.brake_type = "Tromlebremser";
      }
    }
  }

  // Vægt
  const gm = spec.match(/\b(\d{1,2}(?:[.,]\d)?)\s*kg\b/i);
  if (gm) { const w = parseFloat(gm[1].replace(",", ".")); if (w >= 2 && w <= 50) out.weight_kg = w; }

  // Geartype — KUN hvis det eksplicit står (navgear/indvendig vs kædeskifter/
  // udvendig). Vi UDLEDER ikke fra komponentnavne (fx "Nexus"), selvom det
  // teknisk er entydigt — kun hvad der bogstaveligt står.
  if (/navgear|indvendig[a-zæøå]*\s*gear|internal\s*(hub\s*)?gear|hub\s*gear/i.test(spec)) out.geartype = "Indvendig";
  else if (/k(æ|ae)deskifter|derailleur|udvendig[a-zæøå]*\s*gear|external\s*gear/i.test(spec)) out.geartype = "Udvendig";

  // Indstigning — udledes fra dame/herre/frame-type (passer pålideligt for
  // cykler: damecykel = step-through = lav, herrecykel = diamantstel = høj) +
  // eksplicit "lav/høj indstigning"/step-through. (Bevidst tilladt undtagelse.)
  if (/lav\s*indstigning|low[\s-]?step|step[\s-]?thru|step[\s-]?through|\bwave\b|\bdame[a-zæøå]*\b|\bunisex\b/i.test(name)) out.step_type = "Lav indstigning";
  else if (/h(ø|o)j\s*indstigning|high[\s-]?step|\bherre[a-zæøå]*\b/i.test(name)) out.step_type = "Høj indstigning";

  // Affjedring (kun MTB/Gravel/El-cykel) — KUN hvis eksplicit affjedring nævnt
  // (ikke bare "forgaffel", som en stiv cykel også har).
  if (["Mountainbike", "Gravel", "El-cykel"].includes(type)) {
    if (/\bfully\b|fuld\s*affjedring|full[\s-]?suspension|dual\s*suspension|dobbelt\s*affjedr/i.test(spec)) out.suspension = "Fuld affjedring (fully)";
    else if (/\bhardtail\b|affjedret\s*forgaffel|fjedergaffel|luftgaffel|front\s*suspension|suspension\s*fork/i.test(spec)) out.suspension = "Forgaffel (hardtail)";
  }

  // El-cykel: motor + placering + batteri
  if (type === "El-cykel") {
    for (const b of _MOTOR_BRANDS) { if (new RegExp(`\\b${b}\\b`, "i").test(spec)) { out.motor = b; break; } }
    if (/midtermotor|mid[\s-]?motor|mid[\s-]?drive/i.test(spec)) out.motor_position = "Midtermotor";
    else if (/forhjuls?\s*motor|front[\s-]?(motor|hub)/i.test(spec)) out.motor_position = "Forhjulsmotor";
    else if (/baghjuls?\s*motor|rear[\s-]?(motor|hub)/i.test(spec)) out.motor_position = "Baghjulsmotor";
    const bm = spec.match(/\b(\d{3,4})\s*wh\b/i);
    if (bm) { const wh = +bm[1]; if (wh >= 100 && wh <= 2000) out.battery_wh = wh; }
  }

  return out;
}

// ── Parse Shopify products.json → normaliserede items ───────
function parseShopifyProducts(products: any[], origin: string): any[] {
  return products.map((p: any) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const anyAvail = variants.some((v: any) => v.available);
    // Pris: højeste variant-pris (undgår at gribe en billig "depositum"/tilkøbs-
    // variant som variants[0]; ens for normale størrelses-/farve-varianter).
    const vPrices  = variants.map((v: any) => parsePrice(v.price)).filter((n: any): n is number => n != null);
    const vCompare = variants.map((v: any) => parsePrice(v.compare_at_price)).filter((n: any): n is number => n != null);
    const price    = vPrices.length  ? Math.max(...vPrices)  : null;
    const original = vCompare.length ? Math.max(...vCompare) : null;
    const variantText = variants.map((v: any) => [v.title, v.option1, v.option2, v.option3].filter(Boolean).join(" ")).join(" ");
    const tags = Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags ?? "");
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
      price,
      original_price: original,
      description,
      external_url:  p.handle ? `${origin}/products/${p.handle}` : null,
      condition:     "Ny",
      availability:  anyAvail ? "in_stock" : "out_of_stock",
      _typeHint:     `${p.product_type ?? ""} ${tags} ${title}`,
      _accessory:    looksLikeAccessory(`${p.product_type ?? ""} ${title}`),
      _body:         stripHtml(p.body_html ?? "").slice(0, 1500),
      _tags:         String(tags),
      _variantText:  variantText,
      images,
    };
  });
}

// Oversæt HTTP-status fra feed-serveren til en forståelig fejl. 403/404/429 fra
// en webshop betyder oftest bot-beskyttelse (Cloudflare/WAF), ikke at feedet
// mangler — så admin ved at det er adgang, ikke en forkert URL.
function feedErr(status: number): string {
  if (status === 403 || status === 404 || status === 429) {
    return `Feed svarede ${status} — butikken blokerer sandsynligvis automatiske kald (bot-beskyttelse). Bed forhandleren whiteliste CykelBørsen, eller tjek at URL'en er korrekt og offentlig.`;
  }
  return `Feed svarede ${status}`;
}

// ── Hent + parse feed (håndterer Shopify-paginering) ────────
async function fetchItems(feed: any): Promise<{ items: any[]; currency: string }> {
  // Mange webshops (Cloudflare/WAF) blokerer bot-agtige User-Agents fra
  // datacenter-IP'er med 403/404. En realistisk browser-UA + standard accept-
  // headers slipper typisk forbi de simple bot-regler. Durabel løsning for en
  // RIGTIG partner er dog at de whitelister os (UA/IP) eller giver en feed-URL
  // uden bot-beskyttelse — så vi ikke er afhængige af UA-spoofing.
  const ua = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
  };

  let items: any[];
  // Manuelt valgt valuta vinder; "auto"/tom → auto-registrér (Shopify) / DKK.
  let currency = feed.currency && String(feed.currency).toLowerCase() !== "auto"
    ? String(feed.currency).toUpperCase()
    : "";

  let extraQuery = "";  // fx "&country=DK" hvis Shopify honorerer det
  if (feed.format === "shopify_json") {
    const origin = originOf(feed.feed_url);
    let base = feed.feed_url.split("?")[0].replace(/\/$/, "");
    // Tving det danske marked, så Shopify så vidt muligt serverer DKK-priser
    // DIREKTE — så importerer vi den EKSAKTE værdi uden omregning/afrunding.
    // Virker det ikke (priserne forbliver fremmede), FX-omregner magnitude-
    // tjekket nedenfor som nødfald. Manuel valuta springer country=DK over.
    if (!currency) extraQuery = "&country=DK";

    const all: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(`${base}?limit=250&page=${page}${extraQuery}`, { headers: ua });
      if (!res.ok) throw new Error(feedErr(res.status));
      const data = JSON.parse(await res.text());
      const prods = Array.isArray(data?.products) ? data.products : [];
      if (prods.length === 0) break;
      all.push(...parseShopifyProducts(prods, origin));
      if (prods.length < 250) break;
    }
    items = all.filter((it) => !it._accessory);
  } else {
    const res = await fetch(feed.feed_url, { headers: ua });
    if (!res.ok) throw new Error(feedErr(res.status));
    const raw = await res.text();
    items = feed.format === "csv" ? parseCsv(raw) : parseGoogleXml(raw);
    if (!currency) currency = "DKK";   // XML/CSV antages i DKK medmindre admin vælger andet
  }

  // ── Valuta-reconciliation via pris-magnitude (robust mod geo-flakiness) ──
  // Geo-routing kan give cart.js=DKK men EUR-priser i SAMME kald, så cart.js er
  // upålidelig. Pris-magnituden er det eneste pålidelige signal: nye cykler
  // koster ikke under ~1.800 kr. Er medianprisen for lav, er feedet i fremmed
  // valuta — uanset cart.js. (Admin kan sætte valuta manuelt for at overstyre.)
  {
    const manual = feed.currency && String(feed.currency).toLowerCase() !== "auto"
      ? String(feed.currency).toUpperCase() : "";
    const sorted = items.map((it: any) => it.price)
      .filter((n: any): n is number => typeof n === "number" && n > 0)
      .sort((a: number, b: number) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    if (manual === "DKK") currency = "DKK";
    else if (median > 0 && median < 1800) currency = manual || (currency && currency !== "DKK" ? currency : "EUR");
    else if (median >= 1800) currency = "DKK";
  }

  // Omregn til DKK hvis butikken sælger i anden valuta (gem rå pris til preview).
  // FX rammer ikke butikkens "pæne" priser (4.692 vs 4.699) → valgfri afrunding
  // til butikkens pris-mønster (kun på FX-omregnede priser, ikke eksakt DKK).
  const rate = FX_TO_DKK[currency] ?? 1;
  const roundMode = String(feed.price_round || "none");
  for (const it of items) {
    it._currency = currency;
    if (rate !== 1) {
      it._rawPrice = it.price;
      if (typeof it.price === "number")          it.price = roundPrice(Math.round(it.price * rate), roundMode);
      if (typeof it.original_price === "number") it.original_price = roundPrice(Math.round(it.original_price * rate), roundMode);
    }
  }
  return { items, currency };
}

// ── Synkronisér ÉN feed ─────────────────────────────────────
async function syncFeed(supa: any, feed: any, preview: boolean, draft = false) {
  // Forhandler-profil (city-fallback + samtykke-tjek). Ved test-preview uden
  // forhandler (test_url) springes tjekket over — preview skriver alligevel intet.
  let profileCity = "Danmark";
  if (feed.user_id) {
    const { data: profile } = await supa
      .from("profiles")
      .select("id, city, seller_type, admin_can_create_listings")
      .eq("id", feed.user_id)
      .single();
    if (!preview) {
      if (!profile || profile.seller_type !== "dealer") throw new Error("Forhandler ikke fundet");
      if (!profile.admin_can_create_listings) throw new Error("Forhandler har ikke aktiveret onboarding-samtykke");
    }
    if (profile?.city) profileCity = profile.city;
  } else if (!preview) {
    throw new Error("Forhandler påkrævet for synkronisering");
  }

  // Hent + parse feed (Google XML / CSV / Shopify products.json) + valuta
  const { items: fetched, currency } = await fetchItems(feed);
  const items = fetched.filter((it) => it.external_id && it.price && (it.brand || it.title));

  // Byg bike-payloads — sikrer altid de obligatoriske felter (brand, type,
  // condition, price, city) + beriger med alle specs vi kan udlede sikkert.
  const fallbackCity = profileCity;
  const built = items.map((it) => {
    let type = it._explicitType && VALID_TYPES.includes(it._explicitType)
      ? it._explicitType
      : inferType(it._typeHint, feed.default_type);
    const enriched = enrichFields(type, it.title || "", it._body || it.description || "", it._tags || "", it._variantText || "");
    // Hjul under 26" = børnecykel — MEN ikke hvis titlen markerer en voksencykel
    // (Herre/Dame/voksen), da fx en 24" herrecykel er til voksne, ikke børn.
    const ws = parseInt(String(enriched.wheel_size || ""), 10);
    const adultHint = /\bherre\b|\bdame\b|\bmen'?s\b|\bwomen'?s\b|\bvoksen\b/i.test(it.title || "");
    if (ws && ws < 26 && !adultHint) type = "Børnecykel";
    return {
      external_id: it.external_id,
      available:   !it.availability.includes("out"),
      bike: {
        external_id:  it.external_id,
        brand:        it.brand || it.title || "Cykel",            // obligatorisk
        model:        it.model || "",
        title:        it.title || "",
        type,                                                      // obligatorisk
        price:        it.price,                                    // obligatorisk
        original_price: it.original_price || it.price,
        condition:    VALID_TYPES.includes(it.condition) ? "God stand" : (it.condition || "God stand"), // obligatorisk
        city:         it.city || fallbackCity,                     // obligatorisk
        description:  it.description || "",
        external_url: it.external_url,
        ...enriched,                                               // year, colors, motor, groupset, …
      },
      images: it.images.map((url: string, idx: number) => ({ url, is_primary: idx === 0 })),
    };
  });

  if (preview) {
    return {
      preview: true, total: built.length, currency,
      items: built.slice(0, 500).map((b, i) => ({ ...b.bike, _rawPrice: items[i]?._rawPrice ?? null })),
    };
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
        .select("id, feed_locked")
        .eq("user_id", feed.user_id)
        .eq("external_id", row.external_id)
        .maybeSingle();

      // Kladde-import (draft): opret cyklerne SKJULT (is_active=false), så admin
      // kan rette dem før kunderne ser dem. "Aktivér alle" udgiver dem bagefter.
      const payload: Record<string, unknown> = { ...row.bike, user_id: feed.user_id, is_active: draft ? false : true };

      if (existing?.id) {
        if (existing.feed_locked) {
          // Manuelt redigeret/låst — opdatér KUN pris, bevar type/specs/billeder.
          await supa.from("bikes").update({
            price: row.bike.price,
            original_price: row.bike.original_price,
          }).eq("id", existing.id);
        } else {
          payload.sold_at = null;
          // is_active er sat ovenfor (draft ? false : true). Ved kladde-import
          // SKJULER vi derfor også eksisterende cykler (tager dem midlertidigt
          // offline), så hele kataloget kan gennemgås før det udgives igen.
          await supa.from("bikes").update(payload).eq("id", existing.id);
          await supa.from("bike_images").delete().eq("bike_id", existing.id);
          if (row.images.length) await supa.from("bike_images").insert(row.images.map((im) => ({ ...im, bike_id: existing.id })));
        }
        updated++;
      } else {
        const { data: nb } = await supa.from("bikes").insert(payload).select("id").single();
        if (nb?.id && row.images.length) await supa.from("bike_images").insert(row.images.map((im) => ({ ...im, bike_id: nb.id })));
        created++;
      }
    } catch (_e) { failed++; }
  }

  // Reconcile: deaktivér feed-cykler der ikke længere er i feedet (= udsolgt).
  // Springes over ved kladde-import — vi vil ikke røre synlighed der.
  let deactivated = 0;
  if (!draft && seenIds.length > 0) {
    const { data } = await supa.rpc("reconcile_dealer_feed", { p_user_id: feed.user_id, p_seen_ids: seenIds });
    deactivated = data || 0;
  }

  await supa.from("dealer_feeds").update({
    last_synced_at:   new Date().toISOString(),
    last_status:      "ok",
    last_count:       created + updated,
    last_deactivated: deactivated,
  }).eq("id", feed.id);

  return { created, updated, failed, deactivated, total: built.length, currency };
}

Deno.serve(async (req) => {
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
    const { feed_id, preview, action, test_url, test_format, test_type, draft } = body ?? {};

    // ── Test af vilkårlig products.json-URL (admin, preview-only, ingen forhandler) ──
    if (test_url) {
      if (!isAdmin) return json({ error: "Kræver admin-rettigheder" }, 403);
      const synthetic = {
        feed_url: String(test_url), format: test_format || "shopify_json",
        default_type: test_type || null, currency: "auto", price_round: "none", user_id: null,
      };
      try {
        return json({ ok: true, ...(await syncFeed(supa, synthetic, true)) });
      } catch (e) {
        return json({ error: String((e as Error).message) }, 400);
      }
    }

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

    // ── Fjern: deaktivér ALLE feed-importerede cykler for forhandleren ──
    // (kun dem med external_id — manuelt oprettede annoncer røres ikke).
    if (action === "remove") {
      const { data, error } = await supa.from("bikes")
        .update({ is_active: false })
        .eq("user_id", feed.user_id)
        .eq("is_active", true)
        .not("external_id", "is", null)
        .select("id");
      if (error) return json({ error: "Kunne ikke fjerne cykler" }, 500);
      return json({ ok: true, removed: (data || []).length });
    }

    try {
      const result = await syncFeed(supa, feed, !!preview, !!draft);
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
