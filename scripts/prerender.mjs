#!/usr/bin/env node
/*
 * PRERENDERING til statiske SEO-sider på GitHub Pages.
 *
 * CykelBørsen er en client-rendered SPA. Uden prerendering serverer GitHub
 * Pages det SAMME index.html (med forsidens generiske <title>/description/
 * canonical) i RÅ-HTML for hver rute — appen retter det først via JS. Bing,
 * sociale delings-scrapers (Facebook/Messenger) og den første crawl-snapshot
 * ser derfor forkerte meta-tags og intet indhold.
 *
 * Dette script genererer ægte statiske filer (<rute>/index.html, HTTP 200) med:
 *   - korrekt per-rute <title>, meta-description, canonical, OG/Twitter-tags
 *   - per-rute JSON-LD (CollectionPage / BlogPosting / Blog + BreadcrumbList)
 *   - prerendret synligt indhold (H1, beskrivelse, modeller, artikeltekst)
 *
 * Når appen booter, kalder handleRoute() den normale render, der overskriver
 * #detail-view — så brugere ser den fulde interaktive side, og crawlers ser
 * indholdet med det samme.
 *
 * Indholdet er DETERMINISTISK: det bygges fra js/brand-data-v2.js og
 * js/blog-data-v2.js — ingen browser, ingen live-Supabase nødvendig. De
 * live cykel-lister fyldes af JS efter load (crawler-værdien ligger i den
 * beskrivende tekst + intern linking, som ér prerendret).
 *
 * Kør lokalt: node scripts/prerender.mjs
 * Kører i CI via .github/workflows/sitemap.yml (samme daglige job).
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BRANDS_META,
  brandToSlug,
  getBrandMeta,
} from '../js/brand-data-v2.js';
import {
  BLOG_ARTICLES,
  getAllArticlesSorted,
} from '../js/blog-data-v2.js';
import { CATEGORY_META } from '../js/category-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://cykelbørsen.dk'; // matcher BASE_URL i js/utils.js (canonical)
const TEMPLATE = readFileSync(join(ROOT, 'index.html'), 'utf8');

// Supabase — samme publishable key som resten af appen (sikker at eksponere).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

async function fetchSupabase(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Replikerer bikeTitle() i js/utils.js
function bikeTitle(brand, model) {
  const b = (brand == null ? '' : String(brand)).trim();
  const m = (model == null ? '' : String(model)).trim();
  if (!m || /^[-.?_/\\]+$/.test(m)) return b;
  return `${b} ${m}`.trim();
}

/* ---------- Escape-hjælpere ---------- */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Til <script type="application/ld+json"> — undgå at </script> lukker tagget
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/* ---------- Template-transformation ---------- */
function buildPage({ title, description, canonicalPath, jsonldBlocks, contentHtml, ogImage, ogImageAlt }) {
  const url = BASE_URL + canonicalPath;
  const t = escHtml(title);
  const d = escHtml(description);
  let html = TEMPLATE;

  // <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);

  // meta description (id="meta-description")
  html = html.replace(
    /<meta name="description"[^>]*id="meta-description"[^>]*>/,
    `<meta name="description" content="${d}" id="meta-description">`
  );

  // canonical (id="canonical-link")
  html = html.replace(
    /<link rel="canonical"[^>]*id="canonical-link"[^>]*>/,
    `<link rel="canonical" href="${escHtml(url)}" id="canonical-link">`
  );

  // Open Graph
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escHtml(url)}">`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${t}">`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${d}">`);

  // Twitter
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${t}">`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${d}">`);

  // Per-side OG-billede (fx annoncens primærbillede) — det store gevinst-punkt
  // for delinger på Facebook/Messenger, som ikke kører JS.
  if (ogImage) {
    const img = escHtml(ogImage);
    const alt = escHtml(ogImageAlt || title);
    html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${img}">`);
    html = html.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${img}">`);
    html = html.replace(/<meta property="og:image:alt"[^>]*>/, `<meta property="og:image:alt" content="${alt}">`);
    // Fjern faste dimensioner fra hero-billedet — annonce-billeder har andre mål.
    html = html.replace(/\s*<meta property="og:image:width"[^>]*>/, '');
    html = html.replace(/\s*<meta property="og:image:height"[^>]*>/, '');
  }

  // Rute-JSON-LD før </head>
  const ldScripts = jsonldBlocks
    .map(b => `<script type="application/ld+json" class="prerender-jsonld">${jsonLd(b)}</script>`)
    .join('\n  ');
  html = html.replace('</head>', `  ${ldScripts}\n</head>`);

  // Vis detalje-layout, skjul forside — matcher showDetailView()
  html = html.replace('<main id="landing-layout">', '<main id="landing-layout" style="display:none;">');
  html = html.replace(
    '<div id="page-layout" style="display:none;">',
    '<div id="page-layout" style="display:block;">'
  );
  html = html.replace(
    '<section id="detail-view"></section>',
    `<section id="detail-view">${contentHtml}</section>`
  );

  return html;
}

function writePage(canonicalPath, html) {
  // "/cykler/trek" -> <root>/cykler/trek/index.html
  const dir = join(ROOT, canonicalPath.replace(/^\//, ''));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

/* ---------- Relaterede mærker (replikerer js/brand-page.js getRelatedBrands) ---------- */
function getRelatedBrands(slug, meta) {
  const myTypes = meta.popular_models ? Object.keys(meta.popular_models) : [];
  const out = [];
  for (const [s, m] of Object.entries(BRANDS_META)) {
    if (s === slug) continue;
    if (!m.popular_models) continue;
    if (Object.keys(m.popular_models).some(t => myTypes.includes(t))) out.push(m.name);
  }
  return out.slice(0, 6);
}

/* ---------- Rute-generatorer ---------- */
function brandPage(slug, meta) {
  const name = meta.name;
  const title = `Brugte og nye ${name} cykler til salg | Cykelbørsen`;
  const description = meta.description.slice(0, 155);
  const canonicalPath = `/cykler/${slug}`;

  const chips = [
    meta.country ? `<span class="brand-meta-chip">🌍 ${escHtml(meta.country)}</span>` : '',
    meta.founded ? `<span class="brand-meta-chip">📅 Grundlagt ${meta.founded}</span>` : '',
    meta.typical_price_range ? `<span class="brand-meta-chip">💰 ${escHtml(meta.typical_price_range)}</span>` : '',
  ].join('');

  const models = meta.popular_models ? `
        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Populære ${escHtml(name)}-modeller</h2>
          <div class="brand-models-grid">
            ${Object.entries(meta.popular_models).map(([type, list]) => `
              <div class="brand-models-group">
                <h3 class="brand-models-group-title">${escHtml(type)}</h3>
                <ul class="brand-models-list">${list.map(m => `<li>${escHtml(m)}</li>`).join('')}</ul>
              </div>`).join('')}
          </div>
        </div>` : '';

  const related = getRelatedBrands(slug, meta);
  const relatedHtml = related.length ? `
        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Relaterede mærker</h2>
          <div class="brand-related-grid">
            ${related.map(b => `<a class="brand-related-chip" href="/cykler/${brandToSlug(b)}">${escHtml(b)}</a>`).join('')}
          </div>
        </div>` : '';

  const contentHtml = `
      <div class="brand-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <div class="brand-page-hero">
          <h1 class="brand-page-title">${escHtml(name)}</h1>
          ${meta.tagline ? `<p class="brand-page-tagline">${escHtml(meta.tagline)}</p>` : ''}
          ${chips ? `<div class="brand-page-meta">${chips}</div>` : ''}
        </div>
        <div class="brand-page-body">
          <p class="brand-page-description">${escHtml(meta.description)}</p>
        </div>
        <div id="brand-bikes-section" class="brand-page-section">
          <h2 class="brand-page-section-title">Cykler til salg</h2>
          <div id="brand-bikes-grid" class="brand-bikes-grid">
            <p style="color:var(--muted);padding:20px;">Henter ${escHtml(name)}-cykler…</p>
          </div>
          <div id="brand-bikes-more" class="brand-show-more-wrap"></div>
        </div>
        ${models}${relatedHtml}
      </div>`;

  const jsonldBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Brugte og nye ${name} cykler`,
      description: meta.description,
      url: `${BASE_URL}${canonicalPath}`,
      about: {
        '@type': 'Brand',
        name,
        ...(meta.country && { foundingLocation: meta.country }),
        ...(meta.founded && { foundingDate: String(meta.founded) }),
      },
    },
    breadcrumb([
      ['Forside', '/'],
      ['Cykelmærker', '/maerker'],
      [name, canonicalPath],
    ]),
  ];

  return { title, description, canonicalPath, jsonldBlocks, contentHtml };
}

function blogArticlePage(article) {
  const slug = article.slug;
  const title = `${article.title} — Cykelbørsen Blog`;
  const description = article.metaDesc;
  const canonicalPath = `/blog/${slug}`;

  const related = getAllArticlesSorted()
    .filter(a => a.slug !== slug && a.category === article.category)
    .slice(0, 3);
  const fallback = getAllArticlesSorted().filter(a => a.slug !== slug).slice(0, 3);
  const relatedFinal = related.length >= 2 ? related : fallback;

  const contentHtml = `
      <article class="blog-article">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/blog')">← Tilbage</button>
        <header class="blog-article-header">
          <div class="blog-article-emoji">${article.heroEmoji}</div>
          <span class="blog-article-category">${escHtml(article.category)}</span>
          <h1 class="blog-article-title">${escHtml(article.title)}</h1>
          <div class="blog-article-meta">
            <span>${formatDate(article.publishedAt)}</span><span>·</span>
            <span>${article.readTime} min. læsning</span><span>·</span><span>Cykelbørsen</span>
          </div>
        </header>
        <div class="blog-article-body">${article.body}</div>
        <div class="blog-article-cta">
          <h3>Klar til at handle?</h3>
          <div class="blog-article-cta-btns">
            <button onclick="navigateTo('/')">Se annoncer</button>
            <button onclick="navigateTo('/sell')" class="primary">Opret annonce</button>
          </div>
        </div>
        <section class="blog-related">
          <h2>Læs også</h2>
          <div class="blog-related-grid">
            ${relatedFinal.map(a => `
              <a class="blog-related-card" href="/blog/${a.slug}">
                <div class="blog-related-emoji">${a.heroEmoji}</div>
                <div class="blog-related-info">
                  <span class="blog-related-cat">${escHtml(a.category)}</span>
                  <h3>${escHtml(a.title)}</h3>
                  <span class="blog-related-meta">${a.readTime} min. læsning</span>
                </div>
              </a>`).join('')}
          </div>
        </section>
      </article>`;

  const jsonldBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.metaDesc,
      datePublished: article.publishedAt,
      author: { '@type': 'Organization', name: 'Cykelbørsen' },
      publisher: { '@type': 'Organization', name: 'Cykelbørsen', url: BASE_URL },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE_URL}${canonicalPath}` },
    },
    breadcrumb([
      ['Forside', '/'],
      ['Blog', '/blog'],
      [article.title, canonicalPath],
    ]),
  ];

  return { title, description, canonicalPath, jsonldBlocks, contentHtml };
}

function blogOverviewPage() {
  const articles = getAllArticlesSorted();
  const categories = [...new Set(articles.map(a => a.category))];
  const contentHtml = `
      <div class="blog-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <header class="blog-hero">
          <h1 class="blog-title">Cykelbørsen Blog</h1>
          <p class="blog-subtitle">Guides, tests og tips fra cykel-entusiaster — for cykel-entusiaster.</p>
        </header>
        <div class="blog-categories">
          <button class="blog-cat-btn active" data-cat="all">Alle</button>
          ${categories.map(c => `<button class="blog-cat-btn" data-cat="${escHtml(c)}">${escHtml(c)}</button>`).join('')}
        </div>
        <div class="blog-articles-grid" id="blog-articles-grid">
          ${articles.map(a => `
            <a class="blog-card" href="/blog/${a.slug}" data-cat="${escHtml(a.category)}">
              <div class="blog-card-emoji">${a.heroEmoji}</div>
              <div class="blog-card-body">
                <span class="blog-card-category">${escHtml(a.category)}</span>
                <h2 class="blog-card-title">${escHtml(a.title)}</h2>
                <p class="blog-card-excerpt">${escHtml(a.excerpt)}</p>
                <div class="blog-card-meta"><span>${formatDate(a.publishedAt)}</span><span>·</span><span>${a.readTime} min. læsning</span></div>
              </div>
            </a>`).join('')}
        </div>
      </div>`;

  const jsonldBlocks = [{
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Cykelbørsen Blog',
    description: 'Guides, tests og tips om cykler.',
    url: `${BASE_URL}/blog`,
    publisher: { '@type': 'Organization', name: 'Cykelbørsen', url: BASE_URL },
    blogPost: articles.map(a => ({
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.excerpt,
      datePublished: a.publishedAt,
      url: `${BASE_URL}/blog/${a.slug}`,
    })),
  }];

  return {
    title: 'Cykelbørsen Blog — Guides, tests og tips',
    description: 'Cykelbørsens blog: guides til at købe og sælge cykler, sikkerhed, test og inspiration. Skrevet af cykel-entusiaster for cykel-entusiaster.',
    canonicalPath: '/blog',
    jsonldBlocks,
    contentHtml,
  };
}

function brandsOverviewPage() {
  const brands = Object.entries(BRANDS_META)
    .map(([slug, m]) => ({ slug, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));
  const contentHtml = `
      <div class="brands-overview-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <header class="brands-overview-hero">
          <h1 class="brands-overview-title">Alle cykelmærker</h1>
          <p class="brands-overview-subtitle">Browse brugte og nye cykler fra alle de store cykelmærker.</p>
        </header>
        <section class="brands-overview-section">
          <h2 class="brands-overview-section-title">Kuraterede mærker</h2>
          <div class="brands-overview-grid">
            ${brands.map(({ slug, name }) => `
              <a class="brand-tile" href="/cykler/${slug}"><div class="brand-tile-name">${escHtml(name)}</div></a>`).join('')}
          </div>
        </section>
      </div>`;
  return {
    title: 'Alle cykelmærker — Brugte og nye cykler | Cykelbørsen',
    description: 'Browse alle cykelmærker på Cykelbørsen — fra Trek og Cube til Christiania Bikes og Brompton. Find brugte og nye cykler fra over 70 mærker.',
    canonicalPath: '/maerker',
    jsonldBlocks: [breadcrumb([['Forside', '/'], ['Cykelmærker', '/maerker']])],
    contentHtml,
  };
}

function categoryPage(slug, meta) {
  const canonicalPath = `/${slug}`;
  const faqHtml = meta.faq && meta.faq.length ? `
        <div class="brand-page-section category-faq">
          <h2 class="brand-page-section-title">Ofte stillede spørgsmål om ${escHtml(meta.name.toLowerCase())}</h2>
          <div class="category-faq-list">
            ${meta.faq.map(f => `
              <details class="category-faq-item">
                <summary>${escHtml(f.q)}</summary>
                <p>${escHtml(f.a)}</p>
              </details>`).join('')}
          </div>
        </div>` : '';

  const relatedHtml = `
        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Andre kategorier</h2>
          <div class="brand-related-grid">
            ${meta.related.map(rs => CATEGORY_META[rs]
              ? `<a class="brand-related-chip" href="/${rs}">${escHtml(CATEGORY_META[rs].name)}</a>`
              : '').join('')}
          </div>
        </div>`;

  const contentHtml = `
      <div class="brand-page category-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <div class="brand-page-hero">
          <h1 class="brand-page-title">${escHtml(meta.h1)}</h1>
        </div>
        <div class="brand-page-body">
          <p class="brand-page-description">${escHtml(meta.intro)}</p>
        </div>
        <div id="category-bikes-section" class="brand-page-section">
          <h2 class="brand-page-section-title">${escHtml(meta.name)} til salg</h2>
          <div id="category-bikes-grid" class="brand-bikes-grid">
            <p style="color:var(--muted);padding:20px;">Henter ${escHtml(meta.name.toLowerCase())}…</p>
          </div>
          <div id="category-bikes-more" class="brand-show-more-wrap"></div>
        </div>
        ${faqHtml}${relatedHtml}
      </div>`;

  const jsonldBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: meta.h1,
      description: meta.metaDesc,
      url: `${BASE_URL}${canonicalPath}`,
    },
    breadcrumb([['Forside', '/'], [meta.name, canonicalPath]]),
  ];
  if (meta.faq && meta.faq.length) {
    jsonldBlocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: meta.faq.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return { title: meta.title, description: meta.metaDesc, canonicalPath, jsonldBlocks, contentHtml };
}

function bikePage(b) {
  const name = bikeTitle(b.brand, b.model);
  const price = Number(b.price) || 0;
  const priceStr = price.toLocaleString('da-DK');
  const city = b.city || 'Danmark';
  const canonicalPath = `/bike/${b.id}`;

  const title = `${name} – ${priceStr} kr. | Cykelbørsen`;
  const description = `${name} – ${b.type || 'Cykel'} i ${city}. ${b.condition || ''}. ${priceStr} kr. Køb på Cykelbørsen.`;

  const images = (b.bike_images || []).map(i => i.url).filter(Boolean);
  const primary = (b.bike_images || []).find(i => i.is_primary)?.url || images[0] || '';
  const sizeStr = b.size_cm ? `${b.size_cm} cm` : (b.size || '');

  const metaBits = [b.type, b.year, sizeStr, b.condition, city].filter(Boolean)
    .map(x => `<span>${escHtml(x)}</span>`).join('');
  const descHtml = b.description ? `<div class="bike-prerender-desc">${escHtml(b.description).replace(/\n/g, '<br>')}</div>` : '';

  const contentHtml = `
      <div class="bike-page bike-prerender">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        ${primary ? `<img class="bike-prerender-img" src="${escHtml(primary)}" alt="${escHtml(name)} – ${escHtml(b.type || 'cykel')} i ${escHtml(city)}" width="600" height="450">` : ''}
        <h1 class="bike-prerender-title">${escHtml(name)}</h1>
        <p class="bike-prerender-price">${priceStr} kr.</p>
        <div class="bike-prerender-meta">${metaBits}</div>
        ${descHtml}
      </div>`;

  // Product JSON-LD — matcher buildBikeJsonLd() i js/bike-detail.js (uden
  // sælger-rating; JS re-injicerer med rating når trust-data ankommer).
  const priceValidUntil = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const jsonldBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      sku: b.id,
      productID: b.id,
      description: b.description || `${b.type || 'Cykel'} – ${b.condition || ''}`,
      image: images.length ? images : (primary ? [primary] : []),
      brand: { '@type': 'Brand', name: b.brand },
      category: b.type,
      url: `${BASE_URL}${canonicalPath}`,
      offers: {
        '@type': 'Offer',
        price,
        priceCurrency: 'DKK',
        priceValidUntil,
        availability: 'https://schema.org/InStock',
        itemCondition: b.condition === 'Ny' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
        url: `${BASE_URL}${canonicalPath}`,
        seller: {
          '@type': b.profiles?.seller_type === 'dealer' ? 'Organization' : 'Person',
          name: b.profiles?.shop_name || b.profiles?.name || 'Sælger',
        },
      },
    },
    breadcrumb([['Forside', '/'], [name, canonicalPath]]),
  ];

  return {
    title, description, canonicalPath, jsonldBlocks, contentHtml,
    ogImage: primary || undefined,
    ogImageAlt: primary ? `${name} – ${b.type || 'cykel'} i ${city}` : undefined,
  };
}

function rentalBrowsePage() {
  const contentHtml = `
      <div class="rental-browse">
        <div class="rental-browse-hero">
          <h1 class="rental-browse-title">Lej en cykel</h1>
          <p class="rental-browse-sub">Book cykler direkte hos forhandlere — betal sikkert online, hent og kør.</p>
        </div>
        <div class="rental-grid"><p style="color:var(--muted);padding:24px;text-align:center;">Henter udlejningscykler…</p></div>
      </div>`;
  return {
    title: 'Lej en cykel — udlejning hos forhandlere | Cykelbørsen',
    description: 'Lej cykler direkte hos danske cykelforhandlere. Racercykler, mountainbikes, el-cykler, ladcykler og mere — book og betal sikkert online.',
    canonicalPath: '/udlejning',
    jsonldBlocks: [breadcrumb([['Forside', '/'], ['Udlejning', '/udlejning']])],
    contentHtml,
  };
}

function rentalItemPage(it) {
  const name  = it.title;
  const daily = Number(it.daily_rate) || 0;
  const city  = it.city || 'Danmark';
  const canonicalPath = `/udlejning/${it.id}`;
  const images  = (it.rental_item_images || []).map(i => i.url).filter(Boolean);
  const primary = (it.rental_item_images || []).find(i => i.is_primary)?.url || images[0] || '';

  const title = `Lej ${name} — ${daily.toLocaleString('da-DK')} kr./dag | Cykelbørsen`;
  const description = `Lej ${name}${city ? ` i ${city}` : ''} for ${daily.toLocaleString('da-DK')} kr./dag. Book direkte hos forhandleren på Cykelbørsen.`;
  const descHtml = it.description ? `<div class="rental-item-desc">${escHtml(it.description).replace(/\n/g, '<br>')}</div>` : '';

  const contentHtml = `
      <div class="rental-item-page">
        <button class="sell-back-btn" onclick="navigateTo('/udlejning')">← Til udlejning</button>
        ${primary ? `<img class="rental-item-main-img" src="${escHtml(primary)}" alt="${escHtml(name)}" style="max-width:520px;width:100%;border-radius:14px;">` : ''}
        <h1 class="rental-item-title">${escHtml(name)}</h1>
        <p class="rental-item-price">${daily.toLocaleString('da-DK')} kr. <span>/ dag</span></p>
        <div class="rental-item-meta">${it.type ? `<span class="rental-item-chip">${escHtml(it.type)}</span>` : ''}${city ? `<span class="rental-item-chip">📍 ${escHtml(city)}</span>` : ''}</div>
        ${descHtml}
      </div>`;

  const jsonldBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      description: it.description || `Udlejning: ${it.type || 'cykel'}`,
      image: images.length ? images : (primary ? [primary] : []),
      category: it.type,
      url: `${BASE_URL}${canonicalPath}`,
      offers: {
        '@type': 'Offer',
        price: daily,
        priceCurrency: 'DKK',
        availability: 'https://schema.org/InStock',
        url: `${BASE_URL}${canonicalPath}`,
      },
    },
    breadcrumb([['Forside', '/'], ['Udlejning', '/udlejning'], [name, canonicalPath]]),
  ];

  return {
    title, description, canonicalPath, jsonldBlocks, contentHtml,
    ogImage: primary || undefined,
    ogImageAlt: primary ? name : undefined,
  };
}

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${BASE_URL}${path}`,
    })),
  };
}

function formatDate(iso) {
  const d = new Date(iso);
  const months = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- Statiske app-ruter ----------
   Ruter som sitemap.xml annoncerer, men som indtil nu IKKE blev prerendret.
   GitHub Pages svarer derfor HTTP 404 på dem (404.html-fallbacken redirecter
   ganske vist brugere korrekt via JS, men crawleren registrerer 404-statussen
   — det var præcis disse ruter Search Console rapporterede som "Not found").
   En mappe med index.html pr. rute = HTTP 200 + korrekt title/description/
   canonical i rå HTML. Appen overskriver indholdet ved boot som på alle andre
   prerendrede sider. Holdes i sync med STATIC_URLS i generate-sitemap.mjs. */
const STATIC_APP_PAGES = [
  { path: '/forhandlere',            h1: 'Cykelforhandlere i hele Danmark',
    title: 'Cykelforhandlere i hele Danmark | Cykelbørsen',
    description: 'Alle verificerede cykelforhandlere på Cykelbørsen. Køb med tryghed — garanti, servicehistorik og professionel rådgivning.' },
  { path: '/cykelagenter',           h1: 'Cykelagenter',
    title: 'Cykelagenter — få besked når din næste cykel dukker op | Cykelbørsen',
    description: 'Opret en Cykelagent og få besked når den perfekte cykel dukker op. Du behøver ikke have en konto for at komme i gang.' },
  { path: '/bliv-forhandler',        h1: 'Bliv forhandler på Cykelbørsen',
    title: 'Bliv forhandler på Cykelbørsen — gratis i lanceringsfasen',
    description: 'Bliv forhandler på Cykelbørsen. Nå cykelkøbere i hele Danmark. Helt gratis — ingen binding.' },
  { path: '/sell',                   h1: 'Sæt din cykel til salg',
    title: 'Sæt din cykel til salg — gratis annonce | Cykelbørsen',
    description: 'Sælg din cykel eller cykeltilbehør gratis på Cykelbørsen. Opret en annonce på under 2 minutter.' },
  { path: '/vurder-min-cykel',       h1: 'Hvad er min cykel værd?',
    title: 'Hvad er min cykel værd? Gratis vurdering | Cykelbørsen',
    description: 'Få en gratis og øjeblikkelig vurdering af din cykels værdi baseret på mærke, model, alder og stand.' },
  { path: '/stelstoerrelse-guide',   h1: 'Stelstørrelse-finder',
    title: 'Stelstørrelse-finder — Hvilken cykelstørrelse passer mig? | Cykelbørsen',
    description: 'Find din rigtige stelstørrelse ud fra højde og skridtlængde — for racercykler, mountainbikes, citybikes og børnecykler.' },
  { path: '/sikkerhedsguide',        h1: 'Sikkerhedsguide',
    title: 'Sikkerhedsguide — handl trygt på Cykelbørsen',
    description: 'Sådan handler du trygt: undgå snyd, tjek stelnummer, mød sælger sikkert og betal fornuftigt.' },
  { path: '/guide/tjek-brugt-cykel', h1: 'Sådan tjekker du en brugt cykel inden køb',
    title: 'Sådan tjekker du en brugt cykel inden køb | Cykelbørsen',
    description: 'Tjekliste til køb af brugt cykel: stel, gear, bremser, stelnummer og prisforhandling — alt du skal se efter inden du køber.' },
  { path: '/bliv-udlejer',           h1: 'Bliv udlejer på Cykelbørsen',
    title: 'Bliv udlejer — lej din cykel ud | Cykelbørsen',
    description: 'Tjen penge på cykler du ikke bruger. Opret udlejningsannoncer gratis på Cykelbørsen.' },
  { path: '/udlejningsvilkaar',      h1: 'Udlejningsvilkår',
    title: 'Udlejningsvilkår | Cykelbørsen',
    description: 'Vilkår for leje og udlejning af cykler gennem Cykelbørsen.' },
  { path: '/om-os',                  h1: 'Om Cykelbørsen',
    title: 'Om Cykelbørsen — Danmarks cykelmarkedsplads',
    description: 'Cykelbørsen er Danmarks dedikerede markedsplads for køb og salg af nye og brugte cykler — fra private sælgere og forhandlere.' },
  { path: '/kontakt',                h1: 'Kontakt os',
    title: 'Kontakt Cykelbørsen',
    description: 'Kontakt Cykelbørsen — vi svarer typisk inden for 24 timer på hverdage.' },
  { path: '/vilkaar',                h1: 'Vilkår og betingelser',
    title: 'Vilkår og betingelser | Cykelbørsen',
    description: 'Vilkår og betingelser for brug af Cykelbørsen.' },
  { path: '/privatlivspolitik',      h1: 'Privatlivspolitik',
    title: 'Privatlivspolitik | Cykelbørsen',
    description: 'Sådan behandler Cykelbørsen dine personoplysninger.' },
  { path: '/cookiepolitik',          h1: 'Cookiepolitik',
    title: 'Cookiepolitik | Cykelbørsen',
    description: 'Cookies og lokal lagring på Cykelbørsen — hvad vi gemmer og hvorfor.' },
  { path: '/tilladt-sortiment',      h1: 'Tilladt sortiment',
    title: 'Tilladt sortiment | Cykelbørsen',
    description: 'Hvad må sælges på Cykelbørsen? Cykler, el-cykler og cykeltilbehør — og hvad der ikke hører hjemme her.' },
  { path: '/databehandleraftale',    h1: 'Databehandleraftale',
    title: 'Databehandleraftale | Cykelbørsen',
    description: 'Databehandleraftale for Cykelbørsens onboarding-service til forhandlere.' },
];

function staticAppPage({ path, h1, title, description }) {
  const contentHtml = `
      <div class="static-prerender-page" style="max-width:820px;margin:0 auto;padding:32px 24px;">
        <h1 style="font-family:'Fraunces',serif;">${escHtml(h1)}</h1>
        <p>${escHtml(description)}</p>
      </div>`;
  const jsonldBlocks = [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${BASE_URL}${path}`,
    isPartOf: { '@type': 'WebSite', name: 'Cykelbørsen', url: BASE_URL },
  }];
  return { title, description, canonicalPath: path, jsonldBlocks, contentHtml };
}

/* ---------- Main ---------- */
async function main() {
  let count = 0;

  // Mærke-sider — kun ASCII-slugs (accenttegn undgås pga. URL-encoding i filstier;
  // de virker stadig via 404.html-fallback + JS-render).
  for (const [slug, meta] of Object.entries(BRANDS_META)) {
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const page = brandPage(slug, meta);
    writePage(page.canonicalPath, buildPage(page));
    count++;
  }

  // Blog-artikler
  for (const article of Object.values(BLOG_ARTICLES)) {
    const page = blogArticlePage(article);
    writePage(page.canonicalPath, buildPage(page));
    count++;
  }

  // Kategori-landingssider
  for (const [slug, meta] of Object.entries(CATEGORY_META)) {
    const page = categoryPage(slug, meta);
    writePage(page.canonicalPath, buildPage(page));
    count++;
  }

  // Oversigtssider
  for (const page of [blogOverviewPage(), brandsOverviewPage()]) {
    writePage(page.canonicalPath, buildPage(page));
    count++;
  }

  // Statiske app-ruter (kontakt, sell, bliv-forhandler, guides, juridiske sider…)
  // — de stod i sitemap.xml men blev aldrig prerendret → HTTP 404 for crawlere.
  for (const def of STATIC_APP_PAGES) {
    writePage(def.path, buildPage(staticAppPage(def)));
    count++;
  }

  console.log(`Prerendered ${count} statiske sider (mærker + blog + kategorier + oversigter + app-ruter).`);

  // Annonce-sider (/bike/:id) — hentes live fra Supabase. Dynamiske OG-billeder
  // (annoncens primærbillede) + Product-schema i rå-HTML → delinger på
  // Facebook/Messenger viser cyklen, og Bing/scrapers indekserer uden JS.
  let bikes = null;
  try {
    bikes = await fetchSupabase(
      'bikes?is_active=eq.true&select=id,brand,model,price,type,city,condition,year,size,size_cm,description,' +
      'bike_images(url,is_primary),profiles!user_id(seller_type,shop_name,name)'
    );
  } catch (err) {
    console.warn('Kunne ikke hente annoncer:', err.message);
  }

  if (bikes) {
    // Ryd gamle annonce-sider, så solgte/inaktive annoncer forsvinder (deres
    // /bike/:id falder tilbage på 404.html + JS). Regenerér kun aktive.
    const bikeRoot = join(ROOT, 'bike');
    if (existsSync(bikeRoot)) rmSync(bikeRoot, { recursive: true, force: true });
    for (const b of bikes) {
      writePage(`/bike/${b.id}`, buildPage(bikePage(b)));
    }
    console.log(`Prerendered ${bikes.length} annonce-sider (med dynamiske OG-billeder).`);

    // Ukuraterede mærker med aktive annoncer: annonce-siderne linker
    // "Se alle <mærke>-cykler →" til /cykler/<slug> for ALLE mærker, og appen
    // renderer siden fint via getBrandMeta()-fallback — men uden prerender
    // svarer GitHub Pages 404 på ruten (Search Console: /cykler/omnium).
    // Generér derfor også en side pr. mærke der kun findes i annoncerne.
    const uncurated = new Map();
    for (const b of bikes) {
      const brand = (b.brand || '').trim();
      if (!brand) continue;
      const slug = brandToSlug(brand);
      if (!/^[a-z0-9-]+$/.test(slug)) continue;   // samme ASCII-regel som kuraterede
      if (BRANDS_META[slug] || uncurated.has(slug)) continue;
      uncurated.set(slug, brand);
    }
    for (const [slug, brand] of uncurated) {
      writePage(`/cykler/${slug}`, buildPage(brandPage(slug, getBrandMeta(brand))));
    }
    if (uncurated.size) console.log(`Prerendered ${uncurated.size} ukuraterede mærkesider (${[...uncurated.values()].join(', ')}).`);
  } else {
    console.warn('Springer annonce-prerender over (ingen data) — beholder eksisterende /bike-sider.');
  }

  // Udlejnings-sider: /udlejning (browse, statisk) + /udlejning/:id (fra Supabase).
  let rentals = null;
  try {
    rentals = await fetchSupabase(
      'rental_items?is_active=eq.true&select=id,title,type,city,daily_rate,description,rental_item_images(url,is_primary)'
    );
  } catch (err) {
    console.warn('Kunne ikke hente udlejnings-items:', err.message);
  }

  // Ryd hele /udlejning-mappen (browse + gamle item-sider) FØR vi genskriver,
  // så deaktiverede udlejningscykler forsvinder. Kun hvis fetch lykkedes.
  if (rentals) {
    const rentalRoot = join(ROOT, 'udlejning');
    if (existsSync(rentalRoot)) rmSync(rentalRoot, { recursive: true, force: true });
  }
  // Browse-siden er statisk — skriv den altid.
  { const p = rentalBrowsePage(); writePage(p.canonicalPath, buildPage(p)); count++; }
  if (rentals) {
    for (const it of rentals) writePage(`/udlejning/${it.id}`, buildPage(rentalItemPage(it)));
    console.log(`Prerendered ${rentals.length} udlejnings-sider + /udlejning.`);
  }
}

main().catch(err => {
  console.error('Prerender fejlede:', err);
  process.exit(1);
});
