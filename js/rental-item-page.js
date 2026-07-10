/* ============================================================
   UDLEJNING — item-detalje + booking (/udlejning/:id)
   ------------------------------------------------------------
   Viser én udlejningscykel og en booking-widget: kunden vælger
   datoer, ser prisen (leje + depositum), og betaler via Stripe
   (destination charge — create-rental-checkout). Instant-book.
   ============================================================ */

export function createRentalItemPage({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  showListingView,
  navigateTo,
  navigateToDealer,
  getCurrentUser,
  showToast,
  openLoginModal,
  BASE_URL,
}) {

  let _item = null;

  async function renderRentalItemPage(itemId) {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:50vh;color:var(--muted);">Henter…</div>';

    const { data: it, error } = await supabase
      .from('rental_items')
      .select('*, profiles!dealer_id(id, shop_name, name, city, verified, avatar_url, stripe_account_status), rental_item_images(url, is_primary)')
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

    _item = it;

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
    const canBook = dealer.stripe_account_status === 'enabled';
    const today = new Date().toISOString().slice(0, 10);

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

              ${canBook ? `
              <div class="rental-book-form">
                <div class="rental-date-row">
                  <label>Fra<input type="date" id="rental-start" min="${today}" onchange="updateRentalPrice()"></label>
                  <label>Til<input type="date" id="rental-end" min="${today}" onchange="updateRentalPrice()"></label>
                </div>
                <div id="rental-price-summary" class="rental-price-summary"></div>
                <button class="rental-book-btn-active" id="rental-book-btn" onclick="startRentalBooking()" disabled>Vælg datoer</button>
                <p class="rental-book-note">💳 Sikker betaling via Stripe. ${it.deposit_amount ? `Depositum ${it.deposit_amount.toLocaleString('da-DK')} kr. tilbagebetales efter aflevering.` : ''}</p>
              </div>` : `
              <div class="rental-book-placeholder">
                <button class="rental-book-btn" disabled>Booking ikke tilgængelig</button>
                <p class="rental-book-note">Denne forhandler er ved at færdiggøre sin opsætning. Kontakt dem direkte.</p>
              </div>`}

              <a class="rental-dealer-link" href="/dealer/${dealer.id}" onclick="event.preventDefault();navigateToDealer('${dealer.id}')">🏪 ${esc(dealerName)}${dealer.verified ? ' ✓' : ''} →</a>
            </div>

            ${it.description ? `<div class="rental-item-desc">${esc(it.description).replace(/\n/g, '<br>')}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function _calc() {
    const s = document.getElementById('rental-start')?.value;
    const e = document.getElementById('rental-end')?.value;
    if (!s || !e || !_item) return null;
    const days = Math.floor((new Date(e) - new Date(s)) / 86400000) + 1;
    if (days < 1) return { error: 'Slutdato skal være efter startdato' };
    if (days < _item.min_days) return { error: `Minimum ${_item.min_days} dage` };
    if (days > _item.max_days) return { error: `Maksimum ${_item.max_days} dage` };
    let rental = days * _item.daily_rate;
    if (_item.weekly_rate && days >= 7) {
      const weeks = Math.floor(days / 7), rem = days % 7;
      rental = weeks * _item.weekly_rate + rem * _item.daily_rate;
    }
    const deposit = _item.deposit_amount || 0;
    return { days, rental, deposit, total: rental + deposit };
  }

  function updateRentalPrice() {
    const box = document.getElementById('rental-price-summary');
    const btn = document.getElementById('rental-book-btn');
    const c = _calc();
    if (!c) { if (box) box.innerHTML = ''; if (btn) { btn.disabled = true; btn.textContent = 'Vælg datoer'; } return; }
    if (c.error) {
      if (box) box.innerHTML = `<div class="rental-price-err">${esc(c.error)}</div>`;
      if (btn) { btn.disabled = true; btn.textContent = 'Vælg datoer'; }
      return;
    }
    if (box) box.innerHTML = `
      <div class="rental-price-line"><span>Leje (${c.days} dage)</span><span>${c.rental.toLocaleString('da-DK')} kr.</span></div>
      ${c.deposit ? `<div class="rental-price-line"><span>Depositum</span><span>${c.deposit.toLocaleString('da-DK')} kr.</span></div>` : ''}
      <div class="rental-price-line rental-price-total"><span>I alt nu</span><span>${c.total.toLocaleString('da-DK')} kr.</span></div>`;
    if (btn) { btn.disabled = false; btn.textContent = `Book – ${c.total.toLocaleString('da-DK')} kr.`; }
  }

  async function startRentalBooking() {
    const user = getCurrentUser();
    if (!user) { openLoginModal(); return; }
    const c = _calc();
    if (!c || c.error || !_item) { showToast('Vælg gyldige datoer'); return; }
    const btn = document.getElementById('rental-book-btn');
    const s = document.getElementById('rental-start').value;
    const e = document.getElementById('rental-end').value;
    if (btn) { btn.disabled = true; btn.textContent = 'Sender dig til betaling…'; }
    try {
      const base = `${BASE_URL}/udlejning/lejeaftaler`;
      const { data, error } = await supabase.functions.invoke('create-rental-checkout', {
        body: { item_id: _item.id, start_date: s, end_date: e, success_url: base, cancel_url: `${BASE_URL}/udlejning/${_item.id}` },
      });
      if (error) {
        let msg = 'Kunne ikke starte booking. Prøv igen.';
        try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (!data || !data.url) throw new Error('Kunne ikke starte booking. Prøv igen.');
      window.location.href = data.url;
    } catch (err) {
      showToast((err && err.message) || 'Kunne ikke starte booking.');
      updateRentalPrice();
    }
  }

  return { renderRentalItemPage, updateRentalPrice, startRentalBooking };
}
