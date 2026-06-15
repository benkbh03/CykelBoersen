/* ============================================================
   FREMHÆV ANNONCE (BOOST) — ES module factory
   ------------------------------------------------------------
   Genbrugt modal der lader en sælger fremhæve én annonce:
     • Gratis intro-fremhævning (7 dage) — første gang pr. bruger
     • Betalt boost (39 kr / 7 dage) via Stripe engangsbetaling
   featured_until sættes ALTID server-side — gratis via claim_free_boost-RPC,
   betalt via stripe-webhook → apply_paid_boost-RPC. Aldrig direkte fra klienten.
   ============================================================ */

const BOOST_PRICE_KR = 39;
const BOOST_DAYS     = 7;

const BOOST_BENEFITS = `
  <ul class="boost-benefits">
    <li><span>⬆️</span> Vist <strong>øverst i listen</strong> på forsiden</li>
    <li><span>🏷️</span> <strong>Betalt promovering</strong>-mærkat der fanger øjet</li>
    <li><span>🚀</span> Større chance for at blive set — og solgt hurtigere</li>
  </ul>`;

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

export function createBoostModule({ supabase, showToast, getCurrentUser, esc, onBoosted }) {
  let _bikeId = null;

  function bodyEl() { return document.getElementById('boost-modal-body'); }

  function openBoostModal(bikeId) {
    if (!bikeId) return;
    _bikeId = bikeId;
    const modal = document.getElementById('boost-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const user = getCurrentUser && getCurrentUser();
    if (!user) {
      renderMessage('Log ind for at fremhæve din annonce.');
      return;
    }
    renderLoading();
    loadStatus(bikeId);
  }

  function closeBoostModal() {
    const modal = document.getElementById('boost-modal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    _bikeId = null;
  }

  async function loadStatus(bikeId) {
    let status;
    try {
      const { data, error } = await supabase.rpc('get_boost_status', { p_bike_id: bikeId });
      if (error) throw error;
      status = data || {};
    } catch (e) {
      renderMessage('Kunne ikke hente status. Prøv igen.');
      return;
    }
    if (bikeId !== _bikeId) return; // modalen er lukket/skiftet imens
    renderStatus(status);
  }

  function renderLoading() {
    const el = bodyEl();
    if (el) el.innerHTML = `<div class="boost-loading">Henter…</div>`;
  }

  function renderMessage(msg) {
    const el = bodyEl();
    if (el) el.innerHTML = `<p class="boost-msg">${esc(msg)}</p>`;
  }

  function renderStatus(status) {
    const el = bodyEl();
    if (!el) return;

    const featuredUntil = status.featured_until ? new Date(status.featured_until) : null;
    const isFeatured = featuredUntil && featuredUntil.getTime() > Date.now();

    // 1) Allerede fremhævet — vis aktiv-status, ingen forlæng-knap
    if (isFeatured) {
      el.innerHTML = `
        <div class="boost-state-active">
          <div class="boost-badge-big">⭐ Promovering aktiveret</div>
          <p class="boost-active-text">Din annonce er fremhævet og vises i toppen indtil <strong>${fmtDate(featuredUntil)}</strong>.</p>
          ${BOOST_BENEFITS}
        </div>`;
    }
    // 2) Gratis intro-fremhævning tilgængelig
    else if (status.free_available) {
      el.innerHTML = `
        <div class="boost-state-free">
          <p class="boost-pitch">Få din annonce vist øverst og med en "Betalt promovering"-mærkat i <strong>${BOOST_DAYS} dage</strong>.</p>
          ${BOOST_BENEFITS}
          <button class="boost-cta-btn" id="boost-claim-btn">Fremhæv gratis i ${BOOST_DAYS} dage</button>
          <p class="boost-fineprint">Normalpris ${BOOST_PRICE_KR} kr. — <strong>gratis</strong> for din første fremhævning.</p>
        </div>`;
    }
    // 3) Gratis brugt — betal for at fremhæve
    else {
      el.innerHTML = `
        <div class="boost-state-paid">
          <p class="boost-pitch">Fremhæv din annonce i <strong>${BOOST_DAYS} dage</strong> for ${BOOST_PRICE_KR} kr.</p>
          ${BOOST_BENEFITS}
          <button class="boost-cta-btn" id="boost-pay-btn">Betal ${BOOST_PRICE_KR} kr. – fremhæv ${BOOST_DAYS} dage</button>
          <p class="boost-fineprint">Du har brugt din gratis fremhævning. Sikker betaling via Stripe.</p>
        </div>`;
    }

    const claimBtn = document.getElementById('boost-claim-btn');
    if (claimBtn) claimBtn.onclick = claimFree;
    const payBtn = document.getElementById('boost-pay-btn');
    if (payBtn) payBtn.onclick = startPaidBoost;
  }

  async function claimFree() {
    const btn = document.getElementById('boost-claim-btn');
    const bikeId = _bikeId;
    if (!bikeId) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Fremhæver…'; }
    try {
      const { data, error } = await supabase.rpc('claim_free_boost', { p_bike_id: bikeId });
      if (error) throw error;
      if (showToast) showToast('⭐ Din annonce er nu fremhævet i ' + BOOST_DAYS + ' dage!');
      // Vis den nye "aktiv"-tilstand
      renderStatus({ free_available: false, featured_until: data, is_owner: true });
      if (onBoosted) { try { onBoosted(bikeId); } catch {} }
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Noget gik galt. Prøv igen.';
      if (showToast) showToast(msg);
      if (btn) { btn.disabled = false; btn.textContent = `Fremhæv gratis i ${BOOST_DAYS} dage`; }
    }
  }

  async function startPaidBoost() {
    const btn = document.getElementById('boost-pay-btn');
    const bikeId = _bikeId;
    if (!bikeId) return;
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sender dig til betaling…'; }
    try {
      const base = window.location.origin + window.location.pathname;
      const { data, error } = await supabase.functions.invoke('create-boost-checkout', {
        body: { bike_id: bikeId, success_url: base, cancel_url: base },
      });
      // supabase.functions.invoke pakker function-fejl i error.context (Response)
      if (error) {
        let msg = 'Kunne ikke starte betaling. Prøv igen.';
        try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      if (!data || !data.url) throw new Error('Kunne ikke starte betaling. Prøv igen.');
      window.location.href = data.url;
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Kunne ikke starte betaling. Prøv igen.';
      if (showToast) showToast(msg);
      if (btn) { btn.disabled = false; btn.textContent = origText || `Betal ${BOOST_PRICE_KR} kr.`; }
    }
  }

  return { openBoostModal, closeBoostModal };
}
