/* "Hvad koster en citybike?" på kategori- og mærkesider.
   Svarer køberens første spørgsmål med tallene fra de aktive annoncer, i
   almindelige sætninger frem for et dashboard: hvor mange er der, hvad koster
   halvdelen under, hvad er spændet. Kategorisider får desuden en tabel over
   mærkerne. Hjælper med at bedømme en pris på afstand og giver siderne tekst
   Google kan læse.

   Bruges af både browseren (category-page.js, brand-page.js) og
   scripts/prerender.mjs, så tallene på skærmen og i den prerendrede HTML
   kommer fra samme regel. Ligger i sin egen fil af cache-hensyn (CLAUDE.md).

   Under MIN_LISTINGS annoncer med pris vises intet: tre cykler giver en
   "typisk pris" der ligner et marked, men bare er tre sælgeres gæt. */
import { esc } from './utils.js';
import { brandToSlug } from './brand-data-v2.js';

const MIN_LISTINGS = 5;
const MIN_PER_BRAND = 2;
const MAX_BRAND_ROWS = 8;

// Ender på "kr.", så punktummet også afslutter sætningen. Afrundet til nærmeste 100 kr.: "under 2.500 kr." læses, "under 2.487 kr." regnes.
const kr = n => `${(Math.round(n / 100) * 100).toLocaleString('da-DK')} kr.`;

function median(sorted) {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function priced(bikes) {
  return (bikes || []).filter(b => !b.is_giveaway && Number(b.price) > 0
    && (!b.category || b.category === 'cykel'));
}

/* bikes: aktive annoncer med mindst price, is_giveaway, brand og
   profiles.seller_type.
   one / many: "citybike" / "citybikes", "Centurion" / "Centurion-cykler".
   withBrands: vis mærketabellen (kategorisider). */
export function marketFactsHtml(bikes, { one, many, withBrands = false } = {}) {
  const list = priced(bikes);
  if (list.length < MIN_LISTINGS || !one || !many) return '';

  const prices = list.map(b => Number(b.price)).sort((a, b) => a - b);
  const dealers = list.filter(b => b.profiles?.seller_type === 'dealer').length;
  const dealerLine = dealers === 0
    ? 'Alle sælges af private.'
    : dealers === list.length
      ? 'Alle sælges af forhandlere.'
      : `${dealers} af dem sælges af en forhandler.`;

  const summary = `Lige nu er der ${list.length} ${esc(many)} til salg med en pris.
    Halvdelen koster under <strong>${kr(median(prices))}</strong>
    Den billigste koster ${kr(prices[0])}, den dyreste ${kr(prices[prices.length - 1])}
    ${dealerLine}`;

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
          <thead><tr><th scope="col">Mærke</th><th scope="col">Til salg</th><th scope="col">Typisk pris</th></tr></thead>
          <tbody>${rows.map(r => {
            const p = r.prices.sort((a, b) => a - b);
            const slug = brandToSlug(r.name);
            const link = /^[a-z0-9-]+$/.test(slug)
              ? `<a href="/cykler/${slug}/" onclick="event.preventDefault();navigateTo('/cykler/${slug}')">${esc(r.name)}</a>`
              : esc(r.name);
            return `<tr><td>${link}</td><td>${p.length}</td><td>${kr(median(p))}</td></tr>`;
          }).join('')}</tbody>
        </table>`;
    }
  }

  return `
    <h2 class="brand-page-section-title">Hvad koster ${esc(one)}?</h2>
    <p class="market-facts-summary">${summary}</p>
    ${table}
    <p class="market-facts-note">Tallene er fra de aktive annoncer, og gratis cykler er ikke talt med.${table ? ' Typisk pris er midten: halvdelen koster mindre.' : ''}
      Skal du selv sælge? <a href="/vurder-min-cykel/" onclick="event.preventDefault();navigateTo('/vurder-min-cykel')">Se hvad din cykel er værd</a>.</p>`;
}
