/* ============================================================
   FREMHÆVEDE CYKLER — forsidens "⭐ Fremhævede cykler"-sektion
   ------------------------------------------------------------
   Henter aktive annoncer med featured_until > NOW(), nyeste
   fremhævning først, max 8. Spejler dealer-promoted-mønstret
   (loadDealers + buildPromotedDealerCard i main.js).
   ============================================================ */

import { bikeTitle } from './utils.js';

const FEATURED_LIMIT = 8;

export function createFeaturedBikes({ supabase, esc }) {

  function buildCard(b) {
    const primary    = b.bike_images?.find(i => i.is_primary) || b.bike_images?.[0];
    const imgUrl     = primary?.thumb_url || primary?.url || '';
    const title      = bikeTitle(b.brand, b.model);
    const imgContent = imgUrl
      ? `<img src="${esc(imgUrl)}" alt="${esc(title)}" loading="lazy" decoding="async">`
      : `<span class="featured-card-img-placeholder">🚲</span>`;
    const metaParts  = [
      `<span>${esc(b.type || '')}</span>`,
      `<span>${b.year || '–'}</span>`,
    ];
    if (b.condition) metaParts.push(`<span>${esc(b.condition)}</span>`);

    return `
      <div class="bike-card bike-card--featured" onclick="navigateToBike('${b.id}')" title="${esc(title)}">
        <div class="bike-card-img">
          ${imgContent}
          <div class="bike-card-badges"><span class="featured-card-badge">Fremhævet</span></div>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${esc(title)}</div>
            <div class="bike-price">${(b.price || 0).toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">${metaParts.join('')}</div>
          <div class="card-footer">
            <span class="card-location">📍 <span class="bike-city">${esc(b.city || '')}</span></span>
          </div>
        </div>
      </div>`;
  }

  async function loadFeaturedBikes() {
    const section = document.getElementById('promoted-bikes');
    const grid    = document.getElementById('promoted-bikes-grid');
    if (!section || !grid) return;

    const nowIso = new Date().toISOString();
    let data, error;
    try {
      ({ data, error } = await supabase
        .from('bikes')
        .select('id, brand, model, price, type, city, condition, year, featured_until, bike_images(url, thumb_url, is_primary)')
        .eq('is_active', true)
        .gt('featured_until', nowIso)
        .order('featured_until', { ascending: false })
        .limit(FEATURED_LIMIT));
    } catch (e) {
      error = e;
    }

    if (error || !data || data.length === 0) {
      section.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    section.style.display = '';
    grid.innerHTML = data.map(buildCard).join('');
  }

  return { loadFeaturedBikes };
}
