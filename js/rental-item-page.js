/* ============================================================
   UDLEJNING — item-detalje (/udlejning/:id)
   ------------------------------------------------------------
   Viser én udlejningscykel med billeder, pris, depositum og
   forhandler. Booking-widget (dato + betaling) tilføjes i Fase 2 —
   indtil da vises en "kontakt forhandler"-pladsholder.
   ============================================================ */

import { PLATFORM_FEE_PCT } from './rental-data.js';

export function createRentalItemPage({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  showListingView,
  navigateTo,
  navigateToDealer,
  BASE_URL,
}) {

  async function renderRentalItemPage(itemId) {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh;color:var(--muted);">Henter…</div>';

    const { data: it, error } = await supabase
      .from('rental_items')
      .select('*, profiles!dealer_id(id, shop_name, name, city, verified, avatar_url), rental_item_images(url, is_primary)')
      .eq('id', itemId)
      .eq('is_active', true)
      .single();

    if (error || !it) {
      dv.innerHTML = `
        <div class="rental-item-page">
          <button class="sell-back-btn" onclick="navigateTo('/udlejning')">← Til udlejning</button>
          <div class="rental-empty"><p>Denne udlejningscykel findes ikke længere.</p></div>
        </div>`;
      return;
    }

    const title = `Lej ${it.title} — ${(it.daily_rate || 0).toLocaleString('da-DK')} kr./dag | Cykelbørsen`;
    document.title = title;
    updateSEOMeta(
      `Lej ${it.title}${it.city ? ` i ${it.city}` : ''} for ${(it.daily_rate || 0).toLocaleString('da-DK')} kr./dag. Book direkte hos forhandleren på Cykelbørsen.`,
      `/udlejning/${itemId}`,
      { title }
    );

    const images = (it.rental_item_images || []);
    const primary = images.find(i => i.is_primary) || images[0];
    const dealer = it.profiles || {};
    const dealerName = dealer.shop_name || dealer.name || 'Forhandler';

    dv.innerHTML = `
      <div class="rental-item-page">
        <button class="sell-back-btn" onclick="navigateTo('/udlejning')">← Til udlejning</button>
        <div class="rental-item-grid">
          <div class="rental-item-gallery">
            <div class="rental-item-main-img">
              ${primary ? `<img id="rental-main-img" src="${esc(primary.url)}" alt="${esc(it.title)}">` : '<span style="font-size:5rem">🚲</span>'}
            </div>
            ${images.length > 1 ? `
            <div class="rental-item-thumbs">
              ${images.map(im => `<img src="${esc(im.url)}" alt="${esc(it.title)}" onclick="document.getElementById('rental-main-img').src='${esc(im.url)}'">`).join('')}
            </div>` : ''}
          </div>

          <div class="rental-item-info">
            <h1 class="rental-item-title">${esc(it.title)}</h1>
            <div class="rental-item-meta">
              ${it.type ? `<span class="rental-item-chip">${esc(it.type)}</span>` : ''}
              ${it.city ? `<span class="rental-item-chip">📍 ${esc(it.city)}</span>` : ''}
            </div>

            <div class="rental-item-pricebox">
              <div class="rental-item-price">${(it.daily_rate || 0).toLocaleString('da-DK')} kr. <span>/ dag</span></div>
              ${it.weekly_rate ? `<div class="rental-item-weekly">${it.weekly_rate.toLocaleString('da-DK')} kr. / uge</div>` : ''}
              <div class="rental-item-terms">
                ${it.deposit_amount ? `<div>💳 Depositum: ${it.deposit_amount.toLocaleString('da-DK')} kr. (reserveres, ikke trukket)</div>` : ''}
                <div>📅 Lejeperiode: ${it.min_days}–${it.max_days} dage</div>
              </div>

              <div class="rental-book-placeholder">
                <button class="rental-book-btn" disabled>Online booking kommer snart</button>
                <p class="rental-book-note">Vil du leje nu? Kontakt forhandleren direkte via deres profil.</p>
                <a class="rental-dealer-link" href="/dealer/${dealer.id}" onclick="event.preventDefault();navigateToDealer('${dealer.id}')">🏪 ${esc(dealerName)}${dealer.verified ? ' ✓' : ''} →</a>
              </div>
            </div>

            ${it.description ? `<div class="rental-item-desc">${esc(it.description).replace(/\n/g, '<br>')}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  return { renderRentalItemPage };
}
