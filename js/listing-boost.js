/* ============================================================
   FREMHÆV ANNONCE (BOOST) — ES module factory
   ------------------------------------------------------------
   Genbrugt modal der lader en sælger fremhæve én annonce. v1:
     • Gratis intro-fremhævning (7 dage) — første gang pr. bruger
     • Betalt boost (39 kr) markeret "åbner snart" indtil Stripe wires op
   featured_until sættes server-side via claim_free_boost-RPC (beskyttet
   af en trigger), aldrig direkte fra klienten.
   ============================================================ */

const BOOST_PRICE_KR = 39;
const BOOST_DAYS     = 7;

const BOOST_BENEFITS = `
  <ul class="boost-benefits">
    <li><span>⭐</span> Vist i <strong>“Fremhævede cykler”</strong> øverst på forsiden</li>
    <li><span>✨</span> Gylden ramme + badge der fanger øjet i listen</li>
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

    // 1) Allerede fremhævet
    if (isFeatured) {
      el.innerHTML = `
        <div class="boost-state-active">
          <div class="boost-badge-big">⭐ Fremhævet</div>
          <p class="boost-active-text">Din annonce vises i toppen indtil <strong>${fmtDate(featuredUntil)}</strong>.</p>
          ${BOOST_BENEFITS}
          <p class="boost-soon-note">Forlængelse med betaling åbner snart.</p>
        </div>`;
      return;
    }

    // 2) Gratis intro-fremhævning tilgængelig
    if (status.free_available) {
      el.innerHTML = `
        <div class="boost-state-free">
          <p class="boost-pitch">Få din annonce vist øverst og med en ⭐-markering i <strong>${BOOST_DAYS} dage</strong>.</p>
          ${BOOST_BENEFITS}
          <button class="boost-cta-btn" id="boost-claim-btn">Fremhæv gratis i ${BOOST_DAYS} dage</button>
          <p class="boost-fineprint">Normalpris ${BOOST_PRICE_KR} kr. — <strong>gratis</strong> for din første fremhævning.</p>
        </div>`;
      const btn = document.getElementById('boost-claim-btn');
      if (btn) btn.onclick = claimFree;
      return;
    }

    // 3) Gratis brugt — betalt boost kommer snart
    el.innerHTML = `
      <div class="boost-state-paid">
        <p class="boost-pitch">Fremhæv din annonce i <strong>${BOOST_DAYS} dage</strong> for ${BOOST_PRICE_KR} kr.</p>
        ${BOOST_BENEFITS}
        <button class="boost-cta-btn boost-cta-btn--soon" disabled>Betaling åbner snart</button>
        <p class="boost-fineprint">Du har brugt din gratis fremhævning. Vil du fremhæves nu? Skriv til <strong>hej@cykelbørsen.dk</strong>.</p>
      </div>`;
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

  return { openBoostModal, closeBoostModal };
}
