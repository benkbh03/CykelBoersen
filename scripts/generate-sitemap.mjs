#!/usr/bin/env node
/*
 * Genererer sitemap.xml fra:
 *   1. Statiske ruter (forside, om, vilkår osv.) — hardcodet her
 *   2. Mærke-landingssider (/cykler/<slug>) — hardcodet liste
 *   3. Blog-artikler (/blog/<slug>) — hardcodet liste
 *   4. Aktive annoncer (/bike/<id>) — hentes live fra Supabase
 *   5. Verificerede forhandlere (/dealer/<id>) — hentes live fra Supabase
 *
 * Køres af .github/workflows/sitemap.yml dagligt + ved push til main.
 * Skriver til ./sitemap.xml i repo-roden.
 *
 * Kører lokalt med: node scripts/generate-sitemap.mjs
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';
const BASE = 'https://xn--cykelbrsen-5cb.dk';

/* ---------- Statiske ruter ---------- */
const STATIC_URLS = [
  { loc: '/',                          changefreq: 'daily',   priority: '1.0' },
  { loc: '/forhandlere',               changefreq: 'weekly',  priority: '0.8' },
  { loc: '/maerker',                   changefreq: 'weekly',  priority: '0.8' },
  { loc: '/cykelagenter',              changefreq: 'weekly',  priority: '0.7' },
  { loc: '/bliv-forhandler',           changefreq: 'monthly', priority: '0.6' },
  { loc: '/udlejning',                 changefreq: 'daily',   priority: '0.8' },
  { loc: '/bliv-udlejer',              changefreq: 'monthly', priority: '0.6' },
  { loc: '/udlejningsvilkaar',         changefreq: 'monthly', priority: '0.3' },
  { loc: '/vurder-min-cykel',          changefreq: 'weekly',  priority: '0.9' },
  { loc: '/sikkerhedsguide',           changefreq: 'monthly', priority: '0.7' },
  { loc: '/stelstoerrelse-guide',      changefreq: 'monthly', priority: '0.8' },
  { loc: '/guide/tjek-brugt-cykel',    changefreq: 'monthly', priority: '0.7' },
  { loc: '/blog',                      changefreq: 'weekly',  priority: '0.8' },
  { loc: '/om-os',                     changefreq: 'monthly', priority: '0.5' },
  { loc: '/kontakt',                   changefreq: 'monthly', priority: '0.4' },
  { loc: '/vilkaar',                   changefreq: 'monthly', priority: '0.3' },
  { loc: '/privatlivspolitik',         changefreq: 'monthly', priority: '0.3' },
  { loc: '/cookiepolitik',             changefreq: 'monthly', priority: '0.3' },
  { loc: '/tilladt-sortiment',         changefreq: 'monthly', priority: '0.4' },
  { loc: '/databehandleraftale',       changefreq: 'monthly', priority: '0.3' },
];

/* Kategori-landingssider (/racercykler, …). Match CATEGORY_META i js/category-data.js. */
const CATEGORY_SLUGS = [
  'racercykler', 'mountainbikes', 'el-cykler', 'citybikes',
  'ladcykler', 'boernecykler', 'gravelbikes',
];

const BLOG_SLUGS = [
  'mtb-affjedring-guide',
  'undgaa-stjaalet-cykel',
  'cykelstoerrelse-guide',
  'koeb-brugt-el-cykel',
  'bedre-cykel-billeder',
  'saelg-cykel-tips',
  'racercykler-under-15000',
];

/* Mærke-slugs + prioritet. Match KNOWN_BRANDS + brandToSlug i js/brand-data-v2.js. */
const BRAND_SLUGS = [
  // Top — premium/volume
  ['trek', '0.8'], ['cube', '0.8'], ['specialized', '0.8'], ['canyon', '0.8'],
  ['cannondale', '0.8'], ['giant', '0.8'], ['gazelle', '0.8'],
  ['christiania-bikes', '0.8'],
  // Stærk dansk/nordisk
  ['scott', '0.7'], ['bianchi', '0.7'], ['kildemoes', '0.7'], ['mbk', '0.7'],
  ['cerv%C3%A9lo', '0.7'], ['batavus', '0.7'], ['sparta', '0.7'], ['brompton', '0.7'],
  ['riese-mueller', '0.7'], ['puky', '0.7'], ['woom', '0.7'],
  ['larry-vs-harry-bullitt', '0.7'], ['babboe', '0.7'], ['urban-arrow', '0.7'],
  // Mid
  ['bmc', '0.7'], ['colnago', '0.7'], ['orbea', '0.7'], ['focus', '0.7'],
  ['santa-cruz', '0.7'], ['haibike', '0.7'],
  ['pinarello', '0.6'], ['merida', '0.6'], ['kalkhoff', '0.6'], ['vanmoof', '0.6'],
  ['wilier', '0.6'], ['ridley', '0.6'], ['mondraker', '0.6'], ['lapierre', '0.6'],
  ['ghost', '0.6'], ['kona', '0.6'], ['marin', '0.6'], ['gt', '0.6'],
  ['bergamont', '0.6'], ['centurion', '0.6'], ['stevens', '0.6'], ['look', '0.6'],
  ['felt', '0.6'], ['koga', '0.6'], ['moustache', '0.6'], ['liv', '0.6'],
  ['raleigh', '0.6'], ['tern', '0.6'], ['mate-bike', '0.6'],
  ['butchers-bicycles', '0.6'], ['triobike', '0.6'], ['nihola', '0.6'], ['winther', '0.6'],
  ['avenue', '0.6'],
  // Specialty / niche
  ['frog-bikes', '0.5'], ['principia', '0.5'], ['sco', '0.5'],
  ['amladcykler', '0.5'], ['e-fly', '0.5'], ['nishiki', '0.5'], ['factor', '0.5'],
  ['motobecane', '0.5'], ['qio', '0.5'], ['uvelo', '0.5'], ['kreidler', '0.5'],
  ['norden', '0.5'],
  ['ebsen', '0.5'], ['remington', '0.5'], ['van-de-falk', '0.5'],
  ['velo', '0.5'], ['falcon', '0.5'], ['brabus', '0.5'],
];

/* ---------- Supabase fetch ---------- */
async function fetchSupabase(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json();
}

/* ---------- XML helpers ---------- */
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlNode({ loc, changefreq, priority }) {
  return `  <url><loc>${BASE}${escXml(loc)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/* ---------- Main ---------- */
async function main() {
  let bikes = [];
  let dealers = [];
  let dynamicFailed = false;

  try {
    bikes = await fetchSupabase('bikes?is_active=eq.true&select=id');
  } catch (err) {
    console.warn('Kunne ikke hente bikes:', err.message);
    dynamicFailed = true;
  }

  try {
    dealers = await fetchSupabase('profiles?seller_type=eq.dealer&verified=eq.true&select=id');
  } catch (err) {
    console.warn('Kunne ikke hente dealers:', err.message);
    dynamicFailed = true;
  }

  let rentals = [];
  try {
    rentals = await fetchSupabase('rental_items?is_active=eq.true&select=id');
  } catch (err) {
    console.warn('Kunne ikke hente rental_items:', err.message);
  }

  // Hvis vi ikke kunne hente det dynamiske og der allerede findes en sitemap.xml,
  // bevar den eksisterende fil i stedet for at overskrive med en mangelfuld version.
  if (dynamicFailed && existsSync('sitemap.xml')) {
    const existing = readFileSync('sitemap.xml', 'utf8');
    if (existing.includes('/bike/') || existing.includes('/dealer/')) {
      console.log('Supabase ikke tilgængelig — bevarer eksisterende sitemap.xml med dynamiske URL\'er.');
      return;
    }
  }

  const urls = [
    ...STATIC_URLS,
    ...CATEGORY_SLUGS.map(slug => ({ loc: `/${slug}`, changefreq: 'daily', priority: '0.9' })),
    ...BLOG_SLUGS.map(slug => ({ loc: `/blog/${slug}`, changefreq: 'monthly', priority: '0.7' })),
    ...BRAND_SLUGS.map(([slug, priority]) => ({ loc: `/cykler/${slug}`, changefreq: 'daily', priority })),
    ...bikes.map(b => ({ loc: `/bike/${b.id}`, changefreq: 'weekly', priority: '0.6' })),
    ...dealers.map(d => ({ loc: `/dealer/${d.id}`, changefreq: 'weekly', priority: '0.6' })),
    ...rentals.map(r => ({ loc: `/udlejning/${r.id}`, changefreq: 'weekly', priority: '0.6' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlNode).join('\n')}
</urlset>
`;

  writeFileSync('sitemap.xml', xml);
  console.log(
    `Genereret sitemap.xml med ${urls.length} URLs ` +
    `(${STATIC_URLS.length} statiske + ${BLOG_SLUGS.length} blog + ${BRAND_SLUGS.length} mærker + ` +
    `${bikes.length} bikes + ${dealers.length} dealers)`
  );
}

main().catch(err => {
  console.error('Sitemap-generering fejlede:', err);
  process.exit(1);
});
