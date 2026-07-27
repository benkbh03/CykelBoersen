// Supabase Edge Function: import-listing
// Henter en annonce fra et eksternt link (DBA, Gul&Gratis, Facebook Marketplace
// m.fl.) server-side og trækker Open Graph-metadata + hovedbillede ud, så sælgeren
// kan genbruge sin EGEN annonce uden at taste alt forfra.
//
// Kald:  POST { url: "https://www.dba.dk/..." }   (INGEN auth — åbent sælg-flow)
// Svar:  {
//   ok, blocked?, reason,
//   title?, description?, price?,
//   image_base64?, image_media_type?,
//   source_host?
// }
//   reason: 'ok' | 'format' | 'blocked' | 'no_data' | 'fetch_error' | 'method'
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
//   "Verify JWT" SKAL være SLÅET FRA (åbent sælg-flow, også for ikke-loggede).
//   Ingen secrets nødvendige.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

const MAX_HTML_BYTES  = 2_000_000;   // 2 MB HTML er rigeligt til <head>
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

function extractPrice(html: string): number | null {
  // 1) Struktureret pris (og:price:amount / product:price:amount / itemprop=price)
  const structured =
    metaContent(html, "og:price:amount", "product:price:amount") ||
    html.match(/itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([\d.,]+)["']/i)?.[1];
  if (structured) {
    const n = Number(String(structured).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  // 2) Fald tilbage til "1.234 kr" / "1234 DKK" i titel/beskrivelse
  const title = metaContent(html, "og:title") || "";
  const desc  = metaContent(html, "og:description") || "";
  const hay = `${title} ${desc}`;
  const m = hay.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{3,7})\s*(?:kr|dkk|,-)/i);
  if (m) {
    const n = Number(m[1].replace(/[.\s]/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) return n;
  }
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

    // Læs op til MAX_HTML_BYTES (nok til <head>).
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
  const price = extractPrice(html);
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
    price,
    image_base64,
    image_media_type,
    source_host: u.hostname,
  });
});
