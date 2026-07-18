/* ============================================================
   UDLEJNING — bookings-oversigter
   ------------------------------------------------------------
   /udlejning/lejeaftaler – kundens egne bookinger
   /udlejning/bookinger   – forhandlerens indkomne bookinger
   Læse-visning i Fase 2. Handlinger (afbestil, markér returneret,
   frigiv depositum) kommer i Fase 3.
   ============================================================ */

const STATUS_LABELS = {
  pending_payment: { t: 'Afventer betaling', c: 'pend' },
  confirmed:       { t: 'Bekræftet',         c: 'ok' },
  active:          { t: 'I gang',            c: 'ok' },
  completed:       { t: 'Afsluttet',         c: 'done' },
  cancelled:       { t: 'Annulleret',        c: 'cancel' },
  refunded:        { t: 'Refunderet',        c: 'cancel' },
};

export function createRentalBooking({
  supabase,
  esc,
  showToast,
  getCurrentUser,
  showDetailView,
  navigateTo,
}) {

  function renterActions(b) {
    if (b.status !== 'confirmed') return '';
    return `<button class="rental-act-btn rental-act-cancel" onclick="rentalBookingAction('${b.id}','cancel')">Afbestil</button>`;
  }

  function dealerActions(b) {
    if (!['confirmed', 'active'].includes(b.status)) return '';
    return `
      <button class="rental-act-btn rental-act-ok" onclick="rentalBookingAction('${b.id}','return_ok')">Afleveret – OK</button>
      <button class="rental-act-btn rental-act-warn" onclick="rentalBookingAction('${b.id}','return_damage')">Skade</button>
      <button class="rental-act-btn rental-act-cancel" onclick="rentalBookingAction('${b.id}','cancel')">Afbestil</button>`;
  }

  async function rentalBookingAction(bookingId, action) {
    const msgs = {
      cancel:        'Afbestil bookingen? Kunden får det fulde beløb refunderet.',
      return_ok:     'Markér som afleveret uden skade? Depositum tilbagebetales til kunden.',
      return_damage: 'Registrér skade? Depositum tilbageholdes (tilbagebetales IKKE).',
    };
    if (!confirm(msgs[action] || 'Er du sikker?')) return;
    try {
      const { data, error } = await supabase.functions.invoke('rental-booking-action', {
        body: { booking_id: bookingId, action },
      });
      if (error) {
        let m = 'Handlingen fejlede. Prøv igen.';
        try { m = (await error.context.json()).error || m; } catch {}
        throw new Error(m);
      }
      if (showToast) showToast('✅ Opdateret');
      // Genindlæs den relevante liste
      const path = window.location.pathname;
      if (path === '/udlejning/bookinger') renderDealerBookings();
      else renderMyRentals();
    } catch (e) {
      if (showToast) showToast((e && e.message) || 'Handlingen fejlede.');
    }
  }

  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  function statusBadge(status) {
    const s = STATUS_LABELS[status] || { t: status, c: 'pend' };
    return `<span class="rental-status rental-status--${s.c}">${esc(s.t)}</span>`;
  }

  function itemThumb(item) {
    const img = (item?.rental_item_images || []).find(i => i.is_primary) || (item?.rental_item_images || [])[0];
    return img ? `<img src="${esc(img.url)}" alt="">` : '🚲';
  }

  async function renderMyRentals() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Mine lejeaftaler | Cykelbørsen';
    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="min-height:40vh;display:flex;align-items:center;justify-content:center;color:var(--muted);">Henter…</div>';

    const user = getCurrentUser();
    if (!user) { dv.innerHTML = _shell('Log ind for at se dine lejeaftaler.', "openLoginModal()", 'Log ind'); return; }

    const { data: bookings } = await supabase
      .from('rental_bookings')
      .select('id, start_date, end_date, days, total_amount, deposit_amount, status, rental_items!item_id(title, rental_item_images(url, is_primary)), profiles!dealer_id(shop_name, name)')
      .eq('renter_id', user.id)
      .order('created_at', { ascending: false });

    const rows = (bookings || []).map(b => {
      const item = b.rental_items || {};
      const dealer = b.profiles || {};
      return `
        <div class="rental-booking-row">
          <div class="rental-booking-thumb">${itemThumb(item)}</div>
          <div class="rental-booking-info">
            <div class="rental-booking-title">${esc(item.title || 'Udlejningscykel')}</div>
            <div class="rental-booking-sub">${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} · ${b.days} dage · hos ${esc(dealer.shop_name || dealer.name || 'forhandler')}</div>
            <div class="rental-booking-sub">${(b.total_amount || 0).toLocaleString('da-DK')} kr.${b.deposit_amount ? ` (heraf ${b.deposit_amount.toLocaleString('da-DK')} kr. depositum)` : ''}</div>
          </div>
          <div class="rental-booking-right">${statusBadge(b.status)}${renterActions(b)}</div>
        </div>`;
    }).join('');

    dv.innerHTML = `
      <div class="rental-manage">
        <button class="sell-back-btn" onclick="navigateTo('/udlejning')">← Til udlejning</button>
        <h1 class="rental-form-title">Mine lejeaftaler</h1>
        <div class="rental-booking-list">
          ${rows || '<p style="color:var(--muted);padding:24px;text-align:center;">Du har ingen lejeaftaler endnu. <a href="/udlejning" onclick="event.preventDefault();navigateTo(\'/udlejning\')" style="color:var(--rust);">Find en cykel at leje →</a></p>'}
        </div>
      </div>`;
  }

  async function renderDealerBookings() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Bookinger | Cykelbørsen';
    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="min-height:40vh;display:flex;align-items:center;justify-content:center;color:var(--muted);">Henter…</div>';

    const user = getCurrentUser();
    if (!user) { dv.innerHTML = _shell('Log ind som forhandler.', "openLoginModal()", 'Log ind'); return; }

    const { data: bookings } = await supabase
      .from('rental_bookings')
      .select('id, start_date, end_date, days, rental_amount, platform_fee, total_amount, status, rental_items!item_id(title, rental_item_images(url, is_primary)), profiles!renter_id(name)')
      .eq('dealer_id', user.id)
      .order('created_at', { ascending: false });

    const rows = (bookings || []).map(b => {
      const item = b.rental_items || {};
      const renter = b.profiles || {};
      const payout = (b.rental_amount || 0) - (b.platform_fee || 0);
      return `
        <div class="rental-booking-row">
          <div class="rental-booking-thumb">${itemThumb(item)}</div>
          <div class="rental-booking-info">
            <div class="rental-booking-title">${esc(item.title || 'Udlejningscykel')}</div>
            <div class="rental-booking-sub">${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} · ${b.days} dage · ${esc(renter.name || 'Kunde')}</div>
            <div class="rental-booking-sub">Din udbetaling: ${payout.toLocaleString('da-DK')} kr. (efter kommission)</div>
          </div>
          <div class="rental-booking-right">${statusBadge(b.status)}${dealerActions(b)}</div>
        </div>`;
    }).join('');

    dv.innerHTML = `
      <div class="rental-manage">
        <button class="sell-back-btn" onclick="navigateTo('/me')">← Min profil</button>
        <div class="rental-mine-head">
          <h1>Bookinger</h1>
          <button class="rental-onb-btn" onclick="navigateTo('/udlejning/mine')">Mine udlejningscykler</button>
        </div>
        <div class="rental-booking-list">
          ${rows || '<p style="color:var(--muted);padding:24px;text-align:center;">Du har ingen bookinger endnu.</p>'}
        </div>
      </div>`;
  }

  function _shell(msg, onclick, btn) {
    return `<div class="rental-manage"><button class="sell-back-btn" onclick="navigateTo('/udlejning')">← Til udlejning</button><div class="rental-onb-card" style="text-align:center;"><p>${esc(msg)}</p><button class="rental-onb-btn" onclick="${onclick}">${esc(btn)}</button></div></div>`;
  }

  return { renderMyRentals, renderDealerBookings, rentalBookingAction };
}
