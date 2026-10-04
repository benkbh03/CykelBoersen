/* ────────────────────────────────────────────────────────────────
   breadcrumbs.js — én komponent til brødkrummer

   Annonce:  Alle cykler › {Kategori} › {Mærke} › {Titel}
   Mærke:    Alle cykler › {Mærke}
   Kategori: Alle cykler › {Kategori}
   Blog:     Blog › {Titel}

   Kun led med en side bag sig bliver links. Har en cykeltype ingen
   kategoriside (fx Senior cykel), springes leddet over i stedet for at stå
   som død tekst. Sidste led er siden selv: fed og uden link.

   På mobil vises kun "‹ {Forælder}", som erstatter "← Tilbage". Det går til
   forælderen, ikke til forrige side i historikken, så man ikke ryger ud af
   sitet når man kom fra Google.

   Bruges også af scripts/prerender.mjs, så JSON-LD'en i den rå HTML og
   krummerne på skærmen er samme liste. Derfor ingen DOM og ingen window
   ved import.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

import { CATEGORY_META } from './category-data.js';
import { brandToSlug } from './brand-data-v2.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Samme regel som canonicalUrl(): undersider ender på '/'.
const hrefOf = (path) => (path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`);

// SPA-navigation når appen er indlæst; ellers et almindeligt link (fx i den
// forhåndsrenderede HTML, før main.js har kørt).
// Stierne kommer fra slugs (kategori, brandToSlug) og indeholder aldrig ',
// men esc() sikrer attributten alligevel.
const linkHtml = (label, path, cls = '') =>
  `<a${cls ? ` class="${cls}"` : ''} href="${esc(hrefOf(path))}" onclick="if(window.navigateTo){event.preventDefault();navigateTo('${esc(path)}')}">${label}</a>`;

export const ALL_BIKES = { label: 'Alle cykler', path: '/' };

/** Kategoriside for en cykeltype, eller null. */
export function categoryForType(type) {
  if (!type) return null;
  for (const [slug, meta] of Object.entries(CATEGORY_META)) {
    if (meta.type === type) return { label: meta.name, path: `/${slug}` };
  }
  return null;
}

/** @param {{brand?:string, type?:string, category?:string}} bike */
export function bikeCrumbs(bike, title) {
  if ((bike?.category || 'cykel') === 'tilbehoer') {
    return [{ label: 'Forside', path: '/' }, { label: title }];
  }
  // Mærkesider med accent i stien (fx cervélo) forhåndsrenderes ikke og
  // svarer 404 til en crawler. Kun ASCII-slugs bliver led, samme regel som
  // scripts/prerender.mjs bruger når den skriver /cykler/-siderne.
  const raw  = bike?.brand ? brandToSlug(bike.brand) : '';
  const slug = /^[a-z0-9-]+$/.test(raw) ? raw : '';
  return [
    ALL_BIKES,
    categoryForType(bike?.type),
    slug ? { label: bike.brand, path: `/cykler/${slug}` } : null,
    { label: title },
  ].filter(Boolean);
}

export const brandCrumbs    = (brandName) => [ALL_BIKES, { label: brandName }];
export const categoryCrumbs = (name)      => [ALL_BIKES, { label: name }];
export const blogCrumbs     = (title)     => [{ label: 'Blog', path: '/blog' }, { label: title }];

/**
 * @param {{label:string, path?:string}[]} items  sidste element er siden selv
 */
export function breadcrumbsHtml(items) {
  if (!Array.isArray(items) || items.length < 2) return '';
  const last = items.length - 1;
  const lis = items.map((it, i) => {
    if (i === last) return `<li class="crumbs-current" aria-current="page">${esc(it.label)}</li>`;
    return `<li>${it.path ? linkHtml(esc(it.label), it.path) : esc(it.label)}</li>`;
  }).join('');
  const parent = items.slice(0, last).reverse().find(it => it.path);
  const back = parent ? linkHtml(`‹ ${esc(parent.label)}`, parent.path, 'crumbs-back') : '';
  // div med role, ikke <nav>: sitets topmenu styles via elementvælgeren
  // `nav` i 01-base.css (grøn baggrund, fast position).
  return `<div class="crumbs" role="navigation" aria-label="Brødkrummer"><ol class="crumbs-list">${lis}</ol>${back}</div>`;
}

/**
 * schema.org BreadcrumbList. Sidste led får sidens egen adresse.
 * @param {(path:string)=>string} canonicalUrl  fra utils.js eller prerender
 */
export function breadcrumbsJsonLd(items, currentPath, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.label,
      item: canonicalUrl(i === items.length - 1 ? currentPath : it.path),
    })),
  };
}
