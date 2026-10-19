/* ============================================================
   UDLEJNING — browse (/udlejning)
   ------------------------------------------------------------
   Offentlig oversigt over aktive udlejningscykler fra forhandlere.
   Filtrér på type. Kort linker til /udlejning/:id.
   ============================================================ */

import { RENTAL_TYPES } from './rental-data.js';
import { noImagePlaceholder } from './ui-icons.js';

export function createRentalBrowse({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  navigateTo,
  BASE_URL,
}) {

  let _typeFilter = null;

  async function renderRentalBrowse() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    const title = 'Lej en cykel: udlejning hos forhandlere | Cykelbørsen';
    document.title = title;
    updateSEOMeta(
      'Lej cykler direkte hos danske cykelforhandlere. Racercykler, mountainbikes, el-cykler, ladcykler og mere. Book og betal sikkert online.',
      '/udlejning',
      { title }
    );

    const dv = document.getElementById('detail-view');
    if (!dv) return;

    dv.innerHTML = `
      <div class="rental-browse">
        <div class="rental-browse-head">
          <div>
            <h1 class="rental-browse-title">Lej en cykel</h1>
            <p class="rental-browse-sub">Cykler til udlejning hos forhandlere. Du booker og betaler her på siden.</p>
          </div>
          <label class="rental-type-select">Type
            <select onchange="filterRentalType(this.value || null)">
              <option value="">Alle typer</option>
              ${RENTAL_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div id="rental-grid" class="rental-grid">
          <p style="color:var(--muted);padding:24px;text-align:center;">Henter udlejningscykler…</p>
        </div>
      </div>
    `;

    loadRentalItems();
  }

  async function loadRentalItems() {
    const grid = document.getElementById('rental-grid');
    if (!grid) return;

    let q = supabase
      .from('rental_items')
      .select('id, title, type, daily_rate, weekly_rate, city, quantity, dealer_id, profiles!dealer_id(shop_name, name, verified), rental_item_images(url, is_primary)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(60);

    if (_typeFilter) q = q.eq('type', _typeFilter);

    const { data: items, error } = await q;

    if (error) {
      grid.innerHTML = `<p style="color:var(--muted);padding:24px;text-align:center;">Kunne ikke hente udlejningscykler. <button class="rental-retry" onclick="renderRentalBrowse()">Prøv igen</button></p>`;
      return;
    }

    if (!items || items.length === 0) {
      grid.innerHTML = `
        <div class="rental-empty">
          <p>Der er ingen udlejningscykler${_typeFilter ? ` i kategorien "${esc(_typeFilter)}"` : ''} lige nu.</p>
          <p style="margin-top:6px;font-size:0.9rem;color:var(--muted);">Er du forhandler? <a href="/bliv-udlejer/" onclick="event.preventDefault();navigateTo('/bliv-udlejer')" style="color:var(--rust);">Tilbyd dine cykler til udlejning</a></p>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(buildRentalCard).join('');
  }

  function buildRentalCard(it) {
    const imgRec = (it.rental_item_images || []).find(i => i.is_primary) || (it.rental_item_images || [])[0];
    const img = imgRec?.url;
    const dealer = it.profiles || {};
    const dealerName = dealer.shop_name || dealer.name || 'Forhandler';
    return `
      <div class="rental-card" onclick="navigateTo('/udlejning/${it.id}')">
        <div class="rental-card-img">
          ${img
            ? `<img src="${esc(img)}" alt="${esc(it.title)}" loading="lazy" decoding="async" width="400" height="300">`
            : noImagePlaceholder()}
        </div>
        <div class="rental-card-body">
          <div class="rental-card-title">${esc(it.title)}</div>
          <div class="rental-card-price">${(it.daily_rate || 0).toLocaleString('da-DK')} kr. <span>pr. dag</span></div>
          <div class="rental-card-meta">${[it.type, it.city].filter(Boolean).map(esc).join(' · ')}</div>
          <div class="rental-card-dealer">${esc(dealerName)}</div>
        </div>
      </div>`;
  }

  function filterRentalType(type, btn) {
    _typeFilter = type;
    const grid = document.getElementById('rental-grid');
    if (grid) grid.innerHTML = '<p style="color:var(--muted);padding:24px;text-align:center;">Henter…</p>';
    loadRentalItems();
  }

  return { renderRentalBrowse, filterRentalType };
}
