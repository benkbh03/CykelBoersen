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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BRANDS_META,
  brandToSlug,
} from '../js/brand-data-v2.js';
import {
  BLOG_ARTICLES,
  getAllArticlesSorted,
} from '../js/blog-data-v2.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'https://cykelbørsen.dk'; // matcher BASE_URL i js/utils.js (canonical)
const TEMPLATE = readFileSync(join(ROOT, 'index.html'), 'utf8');

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
function buildPage({ title, description, canonicalPath, jsonldBlocks, contentHtml }) {
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

/* ---------- Main ---------- */
function main() {
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

  // Oversigtssider
  for (const page of [blogOverviewPage(), brandsOverviewPage()]) {
    writePage(page.canonicalPath, buildPage(page));
    count++;
  }

  console.log(`Prerendered ${count} statiske sider (mærker + blog + oversigter).`);
}

main();
