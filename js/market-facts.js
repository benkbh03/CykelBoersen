/* "Markedsdata" på kategori- og mærkesider: antal annoncer, prisinterval,
   medianpris og (på kategorisider) en tabel over mærkerne. Hjælper køberen
   med at bedømme en pris på afstand og giver siderne indhold Google kan læse.

   Bruges af både browseren (category-page.js, brand-page.js) og
   scripts/prerender.mjs, så tallene på skærmen og i den prerendrede HTML
   kommer fra samme regel. Ligger i sin egen fil af cache-hensyn (CLAUDE.md).

   Under MIN_LISTINGS annoncer med pris vises intet: tre cykler giver et
   "medianpris" der ligner et marked, men bare er tre sælgeres gæt. */
import { esc } from './utils.js';
import { brandToSlug } from './brand-data-v2.js';

const MIN_LISTINGS = 5;
const MIN_PER_BRAND = 2;
const MAX_BRAND_ROWS = 8;

const kr = n => `${Math.round(n).toLocaleString('da-DK')} kr.`;

function median(sorted) {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function priced(bikes) {
  return (bikes || []).filter(b => !b.is_giveaway && Number(b.price) > 0
    && (!b.category || b.category === 'cykel'));
}

/* bikes: aktive annoncer med mindst price, is_giveaway, brand og
   profiles.seller_type. withBrands: vis mærketabellen (kategorisider). */
export function marketFactsHtml(bikes, { withBrands = false } = {}) {
  const list = priced(bikes);
  if (list.length < MIN_LISTINGS) return '';

  const prices = list.map(b => Number(b.price)).sort((a, b) => a - b);
  const dealers = list.filter(b => b.profiles?.seller_type === 'dealer').length;

  const facts = [
    `<li><span>Annoncer med pris</span><strong>${list.length}</strong></li>`,
    `<li><span>Prisinterval</span><strong>${kr(prices[0])} – ${kr(prices[prices.length - 1])}</strong></li>`,
    `<li><span>Medianpris</span><strong>${kr(median(prices))}</strong></li>`,
    `<li><span>Fra forhandlere</span><strong>${dealers} af ${list.length}</strong></li>`,
  ].join('');

  let table = '';
  if (withBrands) {
    const byBrand = new Map();
    for (const b of list) {
      const name = String(b.brand || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byBrand.has(key)) byBrand.set(key, { name, prices: [] });
      byBrand.get(key).prices.push(Number(b.price));
    }
    const rows = [...byBrand.values()]
      .filter(r => r.prices.length >= MIN_PER_BRAND)
      .sort((a, b) => b.prices.length - a.prices.length || a.name.localeCompare(b.name, 'da'))
      .slice(0, MAX_BRAND_ROWS);
    if (rows.length >= 2) {
      table = `
        <table class="market-facts-table">
          <thead><tr><th scope="col">Mærke</th><th scope="col">Annoncer</th><th scope="col">Fra</th><th scope="col">Median</th></tr></thead>
          <tbody>${rows.map(r => {
            const p = r.prices.sort((a, b) => a - b);
            const slug = brandToSlug(r.name);
            const link = /^[a-z0-9-]+$/.test(slug)
              ? `<a href="/cykler/${slug}/" onclick="event.preventDefault();navigateTo('/cykler/${slug}')">${esc(r.name)}</a>`
              : esc(r.name);
            return `<tr><td>${link}</td><td>${p.length}</td><td>${kr(p[0])}</td><td>${kr(median(p))}</td></tr>`;
          }).join('')}</tbody>
        </table>`;
    }
  }

  return `
    <h2 class="brand-page-section-title">Markedsdata</h2>
    <ul class="market-facts-list">${facts}</ul>
    ${table}
    <p class="market-facts-note">Ud fra de aktive annoncer på Cykelbørsen lige nu. Gratis cykler tælles ikke med.</p>`;
}
