// Supabase Edge Function: import-listing
// Henter en annonce fra et eksternt link (DBA, Gul&Gratis, Facebook Marketplace
// m.fl.) server-side og trækker Open Graph-metadata + hovedbillede ud, så sælgeren
// kan genbruge sin EGEN annonce uden at taste alt forfra.
//
// Kald:  POST { url: "https://www.dba.dk/..." }   Authorization: Bearer <bruger-JWT>
// Svar:  {
//   ok, blocked?, reason,
//   title?, description?, price?, price_source?,
//   image_base64?, image_media_type?,
//   source_host?
// }
//   reason: 'ok' | 'auth' | 'format' | 'blocked' | 'no_data' | 'fetch_error' | 'method'
//
// SIKKERHED (SSRF): kun http/https, kun offentlige værter. Private/interne IP'er
// (localhost, 10.x, 192.168.x, 169.254.x, .internal osv.) afvises FØR fetch, så
// funktionen ikke kan misbruges til at ramme interne tjenester.
//
// Bemærk: nogle sider (fx DBA) kan bot-blokere server-side fetches. Så returnerer
// vi { ok:false, blocked:true } og frontend beder brugeren udfylde manuelt —
// aldrig en hård fejl.
//
// Deploy: Supabase Dashboard → Edge Functions → import-listing → Deploy.
//   "Verify JWT with legacy secret": SLÅET FRA. Den indstilling accepterer
//   den offentlige anon-nøgle og spærrer derfor ikke for nogen, og fordi
//   projektet bruger den nye sb_publishable-nøgleformat kan den afvise vores
//   egne brugeres tokens. Adgangskontrollen ligger i stedet i koden nedenfor
//   (auth.getUser på Authorization-headeren), som Supabase selv anbefaler.
//   Secrets: SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY — begge sættes
//   automatisk af Supabase, der er ikke noget at udfylde manuelt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// En almindelig browser-User-Agent — mange sider serverer ikke OG-tags til
// ukendte bots. Ingen garanti (DBA kan stadig blokere), men bedste forsøg.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 6 MB: <head> alene ville klare sig med langt mindre, men prisen ligger på
// Next.js-sider (bl.a. DBA) i en JSON-blok NEDERST i <body>. Skæres HTML'en
// af før den, findes prisen aldrig.
const MAX_HTML_BYTES  = 6_000_000;
const MAX_IMAGE_BYTES = 8_000_000;   // 8 MB billede-loft

// ── SSRF-guard: afvis private/interne værter ────────────────────────────
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;

  // IPv4-literal?
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;              // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16–31
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;                            // multicast/reserved
  }
  // IPv6 loopback / unique-local / link-local
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || isPrivateHost(u.hostname)) return null;
  return u;
}

// ── HTML-parsing (regex-baseret — vi behøver kun <head>-meta) ────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function metaContent(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    // Matcher både property="og:x" og name="x", uanset attribut-rækkefølge.
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
      "i",
    );
    const tag = html.match(re)?.[0];
    if (!tag) continue;
    const c = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (c && c.trim()) return decodeEntities(c.trim());
  }
  return null;
}

/* Talparsing der klarer både dansk og engelsk formatering:
   "1.234" → 1234, "1.234,50" → 1235, "1234.50" → 1235, "1 234" → 1234.
   Reglen: står den SIDSTE separator foran præcis 1–2 cifre, er den decimal;
   ellers er alle separatorer tusind-separatorer. */
function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s| /g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let normalized: string;
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2 && s.length - lastSep - 1 >= 1) {
    normalized = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    normalized = s.replace(/[.,]/g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  // Samme grænser som pris-feltet i sælg-formularen.
  if (rounded < 1 || rounded > 9_999_999) return null;
  return rounded;
}

/* Går et JSON-LD-træ igennem og samler pris-kandidater. Vi tager KUN et
   `price`-felt når objektet også oplyser en valuta (eller ligger under
   `offers`) — et bart tal ved navn "price" kan lige så godt være fragt
   eller en pris på en anden annonce på siden. Er valutaen oplyst og ikke
   DKK, springer vi den over. */
function collectJsonLdPrices(node: unknown, out: number[], underOffer = false): void {
  if (Array.isArray(node)) {
    for (const n of node) collectJsonLdPrices(n, out, underOffer);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;

  const currency = String(o.priceCurrency ?? o.currency ?? "").toUpperCase();
  const currencyOk = !currency || currency === "DKK";
  if ((o.priceCurrency != null || o.currency != null || underOffer) && currencyOk) {
    const v = parseAmount(o.price ?? o.lowPrice ?? o.highPrice);
    if (v != null) out.push(v);
  }

  for (const [key, value] of Object.entries(o)) {
    if (value && typeof value === "object") {
      collectJsonLdPrices(value, out, underOffer || key === "offers" || key === "priceSpecification");
    }
  }
}

function jsonLdPrice(html: string): number | null {
  const prices: number[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      collectJsonLdPrices(JSON.parse(decodeEntities(m[1].trim())), prices);
    } catch { /* ugyldig JSON-LD — spring over */ }
  }
  const distinct = [...new Set(prices)];
  // Flere forskellige priser = vi kan ikke se hvilken der er annoncens.
  // Så udfylder vi ingenting frem for at gætte.
  return distinct.length === 1 ? distinct[0] : null;
}

/* Sidste udvej: Next.js/Nuxt-sider lægger hele annoncen som JSON i en
   <script>-blok. Vi accepterer kun hvis ALLE "price"-forekomster på siden
   har samme værdi — ellers står vi med relaterede annoncer og aner ikke
   hvilken der er den rigtige. */
function embeddedJsonPrice(html: string): number | null {
  /* Valuta-spærre. Denne udtrækker læser rå tekst og ser derfor ikke om et
     tal hører til en pris i DKK eller i euro — den ville ellers hente 499
     ud af en JSON-LD-blok vi lige har afvist netop fordi valutaen var EUR.
     Nævner siden overhovedet en anden valuta, holder vi os fra tallene. */
  const currencies = new Set<string>();
  const cre = /"(?:priceCurrency|currency|currencyCode)"\s*:\s*"([A-Z]{3})"/gi;
  let cm: RegExpExecArray | null;
  while ((cm = cre.exec(html)) !== null) currencies.add(cm[1].toUpperCase());
  for (const c of currencies) if (c !== "DKK") return null;

  const values: number[] = [];
  const re = /"(?:price|amount|priceInDkk|total_price)"\s*:\s*"?(\d[\d.,]*)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = parseAmount(m[1]);
    if (v != null) values.push(v);
  }
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : null;
}

/* Pris — prøvet i rækkefølge efter hvor troværdig kilden er.
   Hver kilde er struktureret eller sælgerens egen tekst; ingen af dem
   gætter. Kan ingen af dem svare entydigt, returnerer vi null, og
   sælgeren taster prisen selv. */
function extractPrice(html: string): { value: number; source: string } | null {
  // 1) JSON-LD Product/Offer — det marketplaces udstiller til Google.
  const ld = jsonLdPrice(html);
  if (ld != null) return { value: ld, source: "jsonld" };

  // 2) Facebook/OpenGraph produkt-meta.
  const meta = parseAmount(
    metaContent(html, "og:price:amount", "product:price:amount", "product:price", "twitter:data1"),
  );
  if (meta != null) return { value: meta, source: "meta" };

  // 3) Microdata itemprop="price" — begge attribut-rækkefølger.
  const itemprop =
    html.match(/itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([\d.,\s]+)["']/i)?.[1] ??
    html.match(/content\s*=\s*["']([\d.,\s]+)["'][^>]*itemprop\s*=\s*["']price["']/i)?.[1];
  const ip = parseAmount(itemprop);
  if (ip != null) return { value: ip, source: "itemprop" };

  // 4) "1.234 kr" / "1234 DKK" i sælgerens egen titel eller beskrivelse.
  const hay = `${metaContent(html, "og:title") || ""} ${metaContent(html, "og:description") || ""}`;
  const m = hay.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{3,7})\s*(?:kr|dkk|,-)/i);
  const text = m ? parseAmount(m[1]) : null;
  if (text != null) return { value: text, source: "ogtext" };

  // 5) Indlejret side-JSON, kun hvis den er entydig.
  const emb = embeddedJsonPrice(html);
  if (emb != null) return { value: emb, source: "embedded" };

  return null;
}

async function fetchImage(rawUrl: string): Promise<{ base64: string; mediaType: string } | null> {
  const u = safeUrl(rawUrl);
  if (!u) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, "Accept": "image/*" },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(ct)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    // base64-encode
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { base64: btoa(bin), mediaType: ct };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ ok: false, reason: "method" }, 405);

  /* ── Kræv en rigtig, logget ind bruger ──────────────────────────────────
     Dashboardets "Verify JWT with legacy secret" duer IKKE som spærre her:
     den accepterer den offentlige anon-nøgle (står eksplicit i UI'et), så
     den holder ingen ude. Og fordi projektet bruger den nye
     sb_publishable-nøgleformat, er en brugers access-token ikke nødvendigvis
     signeret med legacy-secret'en — slået til kan den afvise vores EGNE
     brugere. Derfor: indstillingen SLÅET FRA, og den rigtige kontrol her.

     Uden den er funktionen en åben proxy: hvem som helst kunne få vores
     projekt til at hente vilkårlige URL'er på deres vegne. SSRF-guarden
     nedenfor spærrer kun for interne adresser, ikke for at blive brugt som
     gennemgangsled mod resten af internettet. */
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, reason: "auth" }, 401);
  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user } } = await supa.auth.getUser(jwt);
    // Anon-/publishable-nøglen giver ingen bruger — kun en rigtig session gør.
    if (!user) return json({ ok: false, reason: "auth" }, 401);
  } catch {
    return json({ ok: false, reason: "auth" }, 401);
  }

  let rawUrl = "";
  try {
    const body = await req.json();
    rawUrl = String(body?.url ?? "").trim();
  } catch {
    return json({ ok: false, reason: "format" }, 400);
  }

  const u = safeUrl(rawUrl);
  if (!u) return json({ ok: false, reason: "format" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let html = "";
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "da,en;q=0.8",
      },
    });
    // Bot-blok / adgang nægtet → blød fejl, brugeren udfylder manuelt.
    if (res.status === 403 || res.status === 429 || res.status === 401) {
      return json({ ok: false, blocked: true, reason: "blocked", source_host: u.hostname });
    }
    if (!res.ok) return json({ ok: false, reason: "fetch_error", source_host: u.hostname });

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.includes("html") && !ct.includes("xml")) {
      return json({ ok: false, reason: "no_data", source_host: u.hostname });
    }

    // Læs op til MAX_HTML_BYTES (skal dække både <head> og side-JSON'en i bunden).
    const buf = new Uint8Array(await res.arrayBuffer());
    const slice = buf.slice(0, MAX_HTML_BYTES);
    html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return json({ ok: false, reason: "fetch_error", source_host: u.hostname });
  } finally {
    clearTimeout(timer);
  }

  const title =
    metaContent(html, "og:title", "twitter:title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;
  const description = metaContent(html, "og:description", "twitter:description", "description");
  const priceHit = extractPrice(html);
  const imageUrl = metaContent(html, "og:image", "og:image:url", "twitter:image");

  // Intet brugbart fundet → sandsynligvis blokeret eller en side uden OG-tags.
  if (!title && !description && !imageUrl) {
    return json({ ok: false, blocked: true, reason: "no_data", source_host: u.hostname });
  }

  let image_base64: string | null = null;
  let image_media_type: string | null = null;
  if (imageUrl) {
    // Relativ billede-URL → gør absolut ift. siden.
    let abs = imageUrl;
    try { abs = new URL(imageUrl, u).toString(); } catch { /* behold rå */ }
    const img = await fetchImage(abs);
    if (img) { image_base64 = img.base64; image_media_type = img.mediaType; }
  }

  return json({
    ok: true,
    reason: "ok",
    title:  title ? title.slice(0, 200) : null,
    description: description ? description.slice(0, 4000) : null,
    price: priceHit ? priceHit.value : null,
    // Hvilken kilde prisen kom fra ('jsonld' | 'meta' | 'itemprop' | 'ogtext'
    // | 'embedded'), eller null hvis ingen kunne svare entydigt. Bruges ikke i
    // UI'et — den er der så et "prisen kom ikke med"-problem kan diagnosticeres
    // uden at gætte på hvilken udtrækker der fejlede.
    price_source: priceHit ? priceHit.source : null,
    image_base64,
    image_media_type,
    source_host: u.hostname,
  });
});
