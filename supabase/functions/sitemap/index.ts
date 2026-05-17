// Supabase Edge Function: sitemap
// Deploy: Supabase Dashboard → Edge Functions → Create new → indsæt kode → Deploy
//
// Genererer komplet sitemap.xml fra DB:
//   - Statiske sider (forside, om-os, vilkår, guides, etc.)
//   - Brand-landing-pages for brands med aktive annoncer
//   - Blog-artikler
//   - Alle aktive bike-detail-sider
//   - Verificerede forhandlere
//   - Brugerprofiler med aktive annoncer
//
// Output cached i 1 time via Cache-Control så Googlebot ikke hamrer
// edge function ved hver indeksering.
//
// Påkrævede secrets (Dashboard → Settings → Edge Functions → Secrets):
//   SUPABASE_URL              – auto-tilgængelig
//   SUPABASE_SERVICE_ROLE_KEY – auto-tilgængelig

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BASE_URL      = "https://xn--cykelbrsen-5cb.dk";

// Statiske ruter — opdater manuelt når nye sider tilføjes
const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/",                       changefreq: "daily",   priority: "1.0" },
  { path: "/forhandlere",            changefreq: "daily",   priority: "0.9" },
  { path: "/maerker",                changefreq: "weekly",  priority: "0.8" },
  { path: "/blog",                   changefreq: "weekly",  priority: "0.7" },
  { path: "/kort",                   changefreq: "daily",   priority: "0.7" },
  { path: "/bliv-forhandler",        changefreq: "monthly", priority: "0.6" },
  { path: "/cykelagenter",           changefreq: "monthly", priority: "0.6" },
  { path: "/vurder-min-cykel",       changefreq: "monthly", priority: "0.6" },
  { path: "/stelstoerrelse-guide",   changefreq: "monthly", priority: "0.6" },
  { path: "/sammenlign",             changefreq: "monthly", priority: "0.5" },
  { path: "/guide/tjek-brugt-cykel", changefreq: "monthly", priority: "0.6" },
  { path: "/sikkerhedsguide",        changefreq: "monthly", priority: "0.5" },
  { path: "/om-os",                  changefreq: "monthly", priority: "0.5" },
  { path: "/kontakt",                changefreq: "monthly", priority: "0.4" },
  { path: "/vilkaar",                changefreq: "monthly", priority: "0.3" },
  { path: "/privatlivspolitik",      changefreq: "monthly", priority: "0.3" },
  { path: "/cookiepolitik",          changefreq: "monthly", priority: "0.3" },
  { path: "/databehandleraftale",    changefreq: "monthly", priority: "0.3" },
  { path: "/tilladt-sortiment",      changefreq: "monthly", priority: "0.3" },
];

// Blog-slugs — opdater manuelt når nye artikler tilføjes
const BLOG_SLUGS = [
  "undgaa-stjaalet-cykel",
  "cykelstoerrelse-guide",
  "koeb-brugt-el-cykel",
  "bedre-cykel-billeder",
  "saelg-cykel-tips",
  "racercykler-under-15000",
];

// Alle kendte cykelmærker — speglet fra js/brand-data-v2.js KNOWN_BRANDS.
// Hver brand har en dedikeret /cykler/<slug>-landingsside med indhold (beskrivelse,
// model-eksempler, relaterede mærker) selv uden aktive annoncer. SEO-værdi for at
// have dem alle i sitemap så Google kan ranke os på brand-navns-søgninger.
// Opdater listen når et nyt brand tilføjes i brand-data-v2.js.
const KNOWN_BRANDS = [
  "Amladcykler","Avenue","Babboe","Batavus","Bergamont","Bianchi",
  "Bike by Gubi","Black Iron Horse","BMC","Brompton",
  "Butchers & Bicycles","Cannondale","Canyon","Carqon","Centurion",
  "Cervélo","Christiania Bikes","Colnago","Conway","Corratec","Cube",
  "E-Fly","Early Rider","Electra","Everton","FACTOR","Felt","Focus",
  "Frog Bikes","Gazelle","Ghost","Giant","GT","Gudereit","Haibike",
  "Husqvarna","Kalkhoff","Kildemoes","Koga","Kona","Kreidler",
  "Lapierre","Larry vs Harry / Bullitt","Lindebjerg","Liv","LOOK",
  "Marin","Mate Bike","MBK","Merida","Momentum","Mondraker",
  "Motobecane","Moustache","Nihola","Nishiki","Norden","Norco",
  "Omnium","Orbea","Pegasus","Pinarello","Principia","Puky","Qio",
  "QWIC","Raleigh","Riese & Müller","Ridley","Royal Cargobike",
  "Santa Cruz","SCO","Scott","Seaside Bike","Silverback","Sparta",
  "Specialized","Stevens","Superior","Tern","Trek","Triobike",
  "Urban Arrow","uVelo","VanMoof","Velo de Ville","Victoria","Wilier",
  "Winther","Woom","Yuba",
];

// Skal matche brandToSlug() i js/brand-data-v2.js præcist
function brandToSlug(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "-")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/[^\wæøåéèáàíóú-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;",
  }[c] as string));
}

function urlEntry(loc: string, opts?: { lastmod?: string; changefreq?: string; priority?: string }): string {
  const parts: string[] = [`  <url>`, `    <loc>${xmlEscape(loc)}</loc>`];
  if (opts?.lastmod)    parts.push(`    <lastmod>${opts.lastmod}</lastmod>`);
  if (opts?.changefreq) parts.push(`    <changefreq>${opts.changefreq}</changefreq>`);
  if (opts?.priority)   parts.push(`    <priority>${opts.priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join("\n");
}

serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const entries: string[] = [];

  // 1. Statiske sider
  for (const r of STATIC_ROUTES) {
    entries.push(urlEntry(`${BASE_URL}${r.path}`, { changefreq: r.changefreq, priority: r.priority }));
  }

  // 2. Blog-artikler
  for (const slug of BLOG_SLUGS) {
    entries.push(urlEntry(`${BASE_URL}/blog/${slug}`, { changefreq: "monthly", priority: "0.6" }));
  }

  // 3. Brands — alle kendte brand-landingssider + højere prioritet/changefreq
  //    for brands med aktive annoncer (de er "varmere" content)
  const { data: brandRows } = await supa
    .from("bikes")
    .select("brand")
    .eq("is_active", true)
    .not("brand", "is", null);
  const activeBrandSlugs = new Set<string>();
  for (const row of brandRows || []) {
    if (row.brand) activeBrandSlugs.add(brandToSlug(String(row.brand).trim()));
  }
  const seenSlugs = new Set<string>();
  for (const brand of KNOWN_BRANDS) {
    const slug = brandToSlug(brand);
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    const isActive = activeBrandSlugs.has(slug);
    entries.push(urlEntry(`${BASE_URL}/cykler/${slug}`, {
      changefreq: isActive ? "daily" : "weekly",
      priority: isActive ? "0.8" : "0.6",
    }));
  }

  // 4. Aktive bike-detail-sider
  const { data: bikes } = await supa
    .from("bikes")
    .select("id, updated_at, created_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(50000);
  for (const b of bikes || []) {
    const lastmod = (b.updated_at || b.created_at || "").slice(0, 10);
    entries.push(urlEntry(`${BASE_URL}/bike/${b.id}`, {
      lastmod: lastmod || undefined,
      changefreq: "weekly",
      priority: "0.6",
    }));
  }

  // 5. Verificerede forhandlere
  const { data: dealers } = await supa
    .from("profiles")
    .select("id, updated_at, created_at")
    .eq("seller_type", "dealer")
    .eq("verified", true);
  for (const d of dealers || []) {
    const lastmod = (d.updated_at || d.created_at || "").slice(0, 10);
    entries.push(urlEntry(`${BASE_URL}/dealer/${d.id}`, {
      lastmod: lastmod || undefined,
      changefreq: "weekly",
      priority: "0.6",
    }));
  }

  // 6. Privat-profiler med aktive annoncer
  const { data: privateUserIds } = await supa
    .from("bikes")
    .select("user_id")
    .eq("is_active", true)
    .not("user_id", "is", null);
  const userIdSet = new Set<string>();
  for (const row of privateUserIds || []) {
    if (row.user_id) userIdSet.add(String(row.user_id));
  }
  if (userIdSet.size > 0) {
    const { data: privProfiles } = await supa
      .from("profiles")
      .select("id, updated_at, created_at")
      .in("id", Array.from(userIdSet))
      .neq("seller_type", "dealer");
    for (const p of privProfiles || []) {
      const lastmod = (p.updated_at || p.created_at || "").slice(0, 10);
      entries.push(urlEntry(`${BASE_URL}/profile/${p.id}`, {
        lastmod: lastmod || undefined,
        changefreq: "weekly",
        priority: "0.4",
      }));
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": "noindex",
    },
  });
});
