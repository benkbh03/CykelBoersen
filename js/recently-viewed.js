/* ============================================================
   SIDST SETE CYKLER — localStorage-baseret tracking
   ============================================================
   Gemmer op til MAX_ITEMS senest sete cykler i localStorage.
   Vises på forsiden over "Seneste annoncer".
   ============================================================ */

import { esc } from './utils.js';

const STORAGE_KEY = 'cb_recently_viewed';
const MAX_ITEMS   = 8;
const MAX_AGE_DAYS = 30;

/* Læs liste fra localStorage. Filtrerer ældre end MAX_AGE_DAYS. */
function _read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return list.filter(b => b && b.id && b.viewedAt && b.viewedAt > cutoff);
  } catch {
    return [];
  }
}

function _write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* quota exceeded — ignorer */
  }
}

/* Tilføj eller flyt en cykel øverst på listen. */
export function addRecentlyViewed(bike) {
  if (!bike || !bike.id) return;
  const primaryImg = bike.bike_images?.find(i => i.is_primary)?.url
                  || bike.bike_images?.[0]?.url
                  || bike.image
                  || null;
  const item = {
    id:    bike.id,
    brand: bike.brand || '',
    model: bike.model || '',
    price: bike.price || 0,
    type:  bike.type  || '',
    image: primaryImg,
    viewedAt: Date.now(),
  };
  const list = _read().filter(b => b.id !== bike.id);
  list.unshift(item);
  _write(list);
}

/* Hent listen, optionelt eksklusiv en bestemt cykel-ID (fx den nuværende detail-side). */
export function getRecentlyViewed(excludeId = null) {
  return _read().filter(b => b.id !== excludeId);
}

export function clearRecentlyViewed() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/* Render en horizontal scroll-sektion. Hvis listen er tom, skjules sektionen.
   Bruger eksisterende navigateToBike() globalt fra main.js for routing. */
export function renderRecentlyViewedSection(containerId, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = getRecentlyViewed(opts.excludeId);
  if (items.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const cards = items.map(b => {
    const title = `${esc(b.brand)} ${esc(b.model)}`.trim() || 'Cykel';
    const priceFmt = b.price ? `${b.price.toLocaleString('da-DK')} kr.` : '';
    const imgHtml = b.image
      ? `<img src="${esc(b.image)}" alt="${title}" loading="lazy" decoding="async">`
      : '<span class="rv-placeholder">🚲</span>';
    return `
      <button class="rv-card" type="button" onclick="navigateToBike('${esc(b.id)}')" aria-label="Se ${title}">
        <div class="rv-card-img">${imgHtml}</div>
        <div class="rv-card-body">
          <div class="rv-card-title">${title}</div>
          <div class="rv-card-price">${priceFmt}</div>
        </div>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="rv-header">
      <h2 class="rv-heading">Sidst set</h2>
      <button type="button" class="rv-clear" onclick="clearRecentlyViewedSection()" aria-label="Ryd sidst sete">Ryd</button>
    </div>
    <div class="rv-scroll-wrap">
      <button type="button" class="rv-nav rv-nav-prev" aria-label="Rul tilbage" tabindex="-1">‹</button>
      <div class="rv-scroll" role="list">${cards}</div>
      <button type="button" class="rv-nav rv-nav-next" aria-label="Rul frem" tabindex="-1">›</button>
    </div>
  `;

  const scroller = container.querySelector('.rv-scroll');
  const prev = container.querySelector('.rv-nav-prev');
  const next = container.querySelector('.rv-nav-next');
  if (!scroller) return;

  // Konverter lodret musehjul til vandret scroll på .rv-scroll
  scroller.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scroller.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  const scrollByCards = (dir) => {
    const firstCard = scroller.querySelector('.rv-card');
    const step = firstCard ? (firstCard.offsetWidth + 12) * 2 : 320;
    scroller.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  if (prev) prev.addEventListener('click', () => scrollByCards(-1));
  if (next) next.addEventListener('click', () => scrollByCards(1));

  // Vis/skjul prev/next-knapper baseret på scroll-position og om der overhovedet
  // er noget at scrolle. Bruger visibility (ikke opacity) så knapperne ikke
  // tager click-events når de er skjult, og display: none hvis ingen overflow.
  const updateNav = () => {
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    if (overflow <= 4) {
      if (prev) prev.style.display = 'none';
      if (next) next.style.display = 'none';
      return;
    }
    if (prev) {
      prev.style.display = 'flex';
      prev.style.visibility = scroller.scrollLeft > 4 ? 'visible' : 'hidden';
    }
    if (next) {
      next.style.display = 'flex';
      next.style.visibility = scroller.scrollLeft < overflow - 1 ? 'visible' : 'hidden';
    }
  };
  scroller.addEventListener('scroll', updateNav);
  window.addEventListener('resize', updateNav);
  // Initial state efter render (vent på layout + billed-loading)
  requestAnimationFrame(updateNav);
  setTimeout(updateNav, 150);
}
