/* ============================================================
   UDLEJNING — browse (/udlejning)
   ------------------------------------------------------------
   Offentlig oversigt over aktive udlejningscykler fra forhandlere.
   Filtrér på type. Kort linker til /udlejning/:id.
   ============================================================ */

import { RENTAL_TYPES } from './rental-data.js';

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

    const title = 'Lej en cykel — udlejning hos forhandlere | Cykelbørsen';
    document.title = title;
    updateSEOMeta(
      'Lej cykler direkte hos danske cykelforhandlere. Racercykler, mountainbikes, el-cykler, ladcykler og mere — book og betal sikkert online.',
      '/udlejning',
      { title }
    );

    const dv = document.getElementById('detail-view');
    if (!dv) return;

    dv.innerHTML = `
      <div class="rental-browse">
        <div class="rental-browse-hero">
          <h1 class="rental-browse-title">Lej en cykel</h1>
          <p class="rental-browse-sub">Book cykler direkte hos forhandlere — betal sikkert online, hent og kør.</p>
        </div>
        <div class="rental-type-chips" id="rental-type-chips">
          <button class="rental-type-chip active" onclick="filterRentalType(null, this)">Alle</button>
          ${RENTAL_TYPES.map(t => `<button class="rental-type-chip" onclick="filterRentalType('${esc(t)}', this)">${esc(t)}</button>`).join('')}
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
      grid.innerHTML = `<p style="color:var(--muted);padding:24px;text-align:center;">Kunne ikke hente udlejningscykler. <button onclick="renderRentalBrowse()" style="background:var(--rust);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Prøv igen</button></p>`;
      return;
    }

    if (!items || items.length === 0) {
      grid.innerHTML = `
        <div class="rental-empty">
          <p>Der er ingen udlejningscykler${_typeFilter ? ` i kategorien "${esc(_typeFilter)}"` : ''} lige nu.</p>
          <p style="margin-top:6px;font-size:0.9rem;color:var(--muted);">Er du forhandler? <a href="/bliv-udlejer" onclick="event.preventDefault();navigateTo('/bliv-udlejer')" style="color:var(--rust);">Tilbyd dine cykler til udlejning →</a></p>
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
            : '<span style="font-size:3.5rem">🚲</span>'}
        </div>
        <div class="rental-card-body">
          <div class="rental-card-title">${esc(it.title)}</div>
          <div class="rental-card-price">${(it.daily_rate || 0).toLocaleString('da-DK')} kr./dag</div>
          <div class="rental-card-meta">
            ${it.type ? `<span>${esc(it.type)}</span>` : ''}${it.city ? `<span>📍 ${esc(it.city)}</span>` : ''}
          </div>
          <div class="rental-card-dealer">🏪 ${esc(dealerName)}${dealer.verified ? ' ✓' : ''}</div>
        </div>
      </div>`;
  }

  function filterRentalType(type, btn) {
    _typeFilter = type;
    document.querySelectorAll('.rental-type-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const grid = document.getElementById('rental-grid');
    if (grid) grid.innerHTML = '<p style="color:var(--muted);padding:24px;text-align:center;">Henter…</p>';
    loadRentalItems();
  }

  return { renderRentalBrowse, filterRentalType };
}
