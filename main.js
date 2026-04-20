/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Global bruger-cache — hentes én gang ved init
let currentUser    = null;
let currentProfile = null;

// Brugerens gemte bike-IDs — opdateres ved loadBikes og toggleSave
let _userSavedSet = new Set();

// In-memory cache til bike-data — forhindrer dobbelt-fetch ved tilbage-navigation
const bikeCache = new Map();

// Stale-request guards: hvert modal-open incrementerer sit token.
// Async responses tjekker om tokenet stadig matcher — ellers ignoreres response.
let _bikeModalToken = 0;
let _userProfileToken = 0;
let _dealerProfileToken = 0;
let _sellStep = 1;
let _aiSuggestionPending = null;
let _aiApplied = false;
let _sellFormCache = {};

// Hjælper: deaktiver knap og vis spinner, returnerer gendan-funktion
function btnLoading(id, label) {
  const btn = document.getElementById(id);
  if (!btn) return () => {};
  btn.disabled = true;
  btn.dataset.origText = btn.innerHTML;
  btn.innerHTML = `<span class="btn-spinner"></span>${label}`;
  return () => { btn.disabled = false; btn.innerHTML = btn.dataset.origText; };
}

// Hjælper: debounce
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Hjælper: escap HTML for at forhindre XSS
function formatLastSeen(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5)   return 'Netop aktiv';
  if (mins < 60)  return `Aktiv for ${mins} min. siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Aktiv for ${hrs} ${hrs === 1 ? 'time' : 'timer'} siden`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `Aktiv for ${days} ${days === 1 ? 'dag' : 'dage'} siden`;
  return 'Aktiv for over en uge siden';
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// SEO-hjælper: opdater meta description + canonical URL + OG tags ved sidenavigation
const BASE_URL = 'https://xn--cykelbrsen-5cb.dk';
const DEFAULT_DESC = 'Danmarks markedsplads for brugte cykler. Køb og sælg racercykler, mountainbikes, el-cykler og meget mere. Gratis at oprette annonce. Fra private sælgere og autoriserede forhandlere.';

function removeBikeJsonLd() {
  const old = document.getElementById('bike-jsonld');
  if (old) old.remove();
}

function updateSEOMeta(description, canonicalPath) {
  const desc = description || DEFAULT_DESC;
  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', desc);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.setAttribute('href', canonicalPath ? BASE_URL + canonicalPath : BASE_URL + '/');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', canonicalPath ? BASE_URL + canonicalPath : BASE_URL + '/');
}

// Validér avatar-URL — tillad kun https Supabase storage URLs for at forhindre XSS
function safeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return esc(url);
  } catch { return null; }
}

// Hjælper: focus trap — returnerer cleanup-funktion
function trapFocus(modalEl) {
  const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const els = () => Array.from(modalEl.querySelectorAll(focusable));
  const first = () => els()[0];
  const last  = () => els()[els().length - 1];

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const all = els();
    if (!all.length) return;
    if (e.shiftKey) {
      if (document.activeElement === first()) { e.preventDefault(); last().focus(); }
    } else {
      if (document.activeElement === last())  { e.preventDefault(); first().focus(); }
    }
  }

  modalEl.addEventListener('keydown', onKeyDown);
  // Sæt fokus på første fokuserbare element
  requestAnimationFrame(() => { const f = first(); if (f) f.focus(); });
  return () => modalEl.removeEventListener('keydown', onKeyDown);
}

// Map: modal-id → cleanup-funktion
const _focusTrapCleanup = {};

function enableFocusTrap(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (_focusTrapCleanup[modalId]) _focusTrapCleanup[modalId]();
  _focusTrapCleanup[modalId] = trapFocus(el);
}

function disableFocusTrap(modalId) {
  if (_focusTrapCleanup[modalId]) {
    _focusTrapCleanup[modalId]();
    delete _focusTrapCleanup[modalId];
  }
}

// Pagination
const BIKES_PAGE_SIZE = 24;
let bikesOffset       = 0;
let currentFilters    = {};
let userGeoCoords     = null; // [lat, lng] fra GPS
let activeRadius      = null; // km radius filter
const askedAvailableSet = new Set(); // Track sent "er den stadig til salg?" per bike

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Deterministisk offset baseret på annonce-ID — pin-position er stabil på tværs af page-loads
function stableOffset(id, axis) {
  let h = axis === 0 ? 0x811c9dc5 : 0xdeadbeef;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x1000193) >>> 0;
  return (h / 0xFFFFFFFF) - 0.5; // [-0.5, 0.5]
}

/* ============================================================
   INIT – hent session én gang og sæt alt op
   ============================================================ */

async function init() {
  // Start offentlig data med det samme – venter ikke på auth
  const sessionPromise = supabase.auth.getSession();
  loadBikes();
  loadInitialData(); // Erstatter loadDealers() + updateFilterCounts() med 2 parallelle queries

  const { data: { session } } = await sessionPromise;

  if (session) {
    currentUser = session.user;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = profile;

    updateNav(true, profile?.name, profile?.avatar_url);
    startRealtimeNotifications();
    // Vis admin knap hvis admin
    if (profile && profile.is_admin) {
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = 'flex';
    }
    checkEmailConfirmed();
    // Opdater last_seen (fire-and-forget)
    supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id).then(null, () => {});
  } else {
    updateNav(false);
  }

  // Opdater nav når bruger logger ind/ud
  // _hasHadSession forhindrer at token-refresh (der fyrer SIGNED_IN) kalder loadBikes() unødvendigt
  let _hasHadSession = !!currentUser;
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      const isNewLogin = !_hasHadSession;
      _hasHadSession = true;
      currentUser = session.user;

      if (_event === 'SIGNED_IN' && !isNewLogin) {
        // Token-refresh pseudo-SIGNED_IN: opdater kun currentUser (har nyt token) — ingen sideeffekter
        return;
      }

      // Ægte login eller TOKEN_REFRESHED/andre events: hent profil og opdater UI
      let { data: profile, error: profileErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();
      if (profileErr) console.warn('onAuthStateChange profile fetch FAIL:', profileErr.message);

      // Ny OAuth-bruger uden profil endnu — opret den automatisk
      if (!profile && _event === 'SIGNED_IN') {
        const meta = currentUser.user_metadata || {};
        const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || 'Ny bruger';
        await supabase.from('profiles').upsert({
          id:             currentUser.id,
          name,
          email:          currentUser.email,
          seller_type:    'private',
          email_verified: true,
        }, { onConflict: 'id' });
        const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        profile = newProfile;
      }

      currentProfile = profile;
      updateNav(true, profile?.name, profile?.avatar_url);
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = profile?.is_admin ? 'flex' : 'none';
      checkEmailConfirmed();
      if (_event === 'SIGNED_IN' && isNewLogin) {
        loadBikes();
        if (!localStorage.getItem('onboarded')) showOnboardingBanner();
        checkSavedSearchNotifications();
      }
    } else {
      _hasHadSession = false;
      currentUser    = null;
      currentProfile = null;
      stopRealtimeNotifications();
      updateNav(false);
      // Session udløbet — reload siden for at rydde stale state
      if (_event === 'SIGNED_OUT') {
        window.location.href = window.location.pathname;
      }
    }
  });

  // --- Idle/refresh guards ---
  let _refreshInProgress = false;
  let _lastRefreshTime = 0;
  const REFRESH_THROTTLE_MS = 5000; // mindst 5s mellem refreshes

  function _isAnyModalOpen() {
    // Check display='flex' modals
    for (const id of ['dealer-profile-modal', 'user-profile-modal', 'all-dealers-modal', 'login-modal', 'share-modal', 'report-modal', 'inbox-modal']) {
      const el = document.getElementById(id);
      if (el && el.style.display === 'flex') return true;
    }
    // Check classList='open' modals
    for (const id of ['bike-modal', 'map-bike-modal']) {
      const el = document.getElementById(id);
      if (el && el.classList.contains('open')) return true;
    }
    return false;
  }

  // Refresh session + data når bruger vender tilbage til fanen
  // Guards: throttle, concurrent protection, skip if modal open
  let _visibilityTimeout = null;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(_visibilityTimeout);
    _visibilityTimeout = setTimeout(async () => {
      // Guard: skip if a modal is open
      if (_isAnyModalOpen()) return;
      // Guard: throttle
      const now = Date.now();
      if (now - _lastRefreshTime < REFRESH_THROTTLE_MS) return;
      // Guard: concurrent refresh
      if (_refreshInProgress) return;
      _refreshInProgress = true;
      _lastRefreshTime = now;
      try {
        const { data, error } = await supabase.auth.getSession();
        loadBikes();
        // Opdater last_seen når brugeren vender tilbage til fanen
        if (currentUser) {
          supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id).then(() => {}, (err) => {});
        }
      } finally {
        _refreshInProgress = false;
      }
      // updateFilterCounts opdateres kun ved initial load og efter mutationer
    }, 500);
  });

  // Åbn indbakke automatisk hvis ?inbox=true er i URL'en
  if (new URLSearchParams(window.location.search).get('inbox') === 'true' && currentUser) {
    history.replaceState(null, '', window.location.pathname);
    openInboxModal();
  }

  // Åbn delt annonce automatisk hvis ?bike=ID er i URL'en
  const sharedBikeId = new URLSearchParams(window.location.search).get('bike');
  if (sharedBikeId) {
    history.replaceState(null, '', window.location.pathname);
    openBikeModal(sharedBikeId);
  }

  // Håndter email-bekræftelse og password reset (Supabase sætter type i hash)
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get('type') === 'signup') {
    history.replaceState(null, '', window.location.pathname);
    dismissEmailBanner();
    // Synk email_verified til profil for at vise badge til andre brugere
    if (currentUser) {
      supabase.from('profiles').update({ email_verified: true }).eq('id', currentUser.id).then(() => {
        if (currentProfile) currentProfile.email_verified = true;
      });
    }
    showToast('✅ Din e-mail er bekræftet – velkommen til Cykelbørsen!');
  } else if (hashParams.get('type') === 'recovery') {
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Håndter returnering fra Stripe Checkout
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('dealer_success') === 'true') {
    history.replaceState(null, '', window.location.pathname);
    // Genindlæs profil så verified-status er opdateret
    if (currentUser) {
      const { data: freshProfile } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();
      currentProfile = freshProfile;
      updateNav(true, freshProfile?.name, freshProfile?.avatar_url);
    }
    showToast('🎉 Velkommen som forhandler! Din 3-måneders gratis periode er startet.');
    setTimeout(() => openProfileModal(), 600);
  } else if (urlParams.get('dealer_cancel') === 'true') {
    history.replaceState(null, '', window.location.pathname);
    showToast('ℹ️ Betalingen blev annulleret. Du kan prøve igen når du er klar.');
  }

  // Klik uden for modal lukker den
  document.getElementById('inbox-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeInboxModal();
  });
  document.getElementById('admin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAdminPanel();
  });
  document.getElementById('share-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeShareModal();
  });

  // Backward compat: omstil gamle hash-URLs (#/bike/123 → /bike/123)
  const _initHash = window.location.hash;
  if (_initHash.startsWith('#/') && !_initHash.includes('type=')) {
    history.replaceState({}, '', _initHash.slice(1));
  }

  // Pathname routing: håndter initial route (køres efter Supabase hash-params er tjekket)
  if (!_initHash.includes('type=signup') && !_initHash.includes('type=recovery')) {
    handleRoute();
  }

  // Global Escape-tast: lukker den øverste åbne modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Tjek modaler i prioriteret rækkefølge (inderste/øverste først)
    if (document.getElementById('share-modal')?.classList.contains('open'))      { closeShareModal(); return; }
    if (document.getElementById('admin-modal')?.classList.contains('open'))      { closeAdminPanel(); return; }
    if (document.getElementById('edit-modal')?.classList.contains('open'))       { closeEditModal(); return; }
    if (document.getElementById('bike-modal')?.classList.contains('open'))       { closeBikeModal(); return; }
    if (document.getElementById('map-bike-modal')?.classList.contains('open'))   { closeMapBikeModal(); return; }
    if (document.getElementById('inbox-modal')?.classList.contains('open'))      { closeInboxModal(); return; }
    if (document.getElementById('profile-modal')?.classList.contains('open'))    { closeProfileModal(); return; }
    if (document.getElementById('modal')?.classList.contains('open'))            { closeModal(); return; }
    if (document.getElementById('login-modal')?.classList.contains('open'))      { closeLoginModal(); return; }
    // display:flex-baserede modaler
    if (document.getElementById('user-profile-modal')?.style.display === 'flex')   { closeUserProfileModal(); return; }
    if (document.getElementById('dealer-profile-modal')?.style.display === 'flex') { closeDealerProfileModal(); return; }
    if (document.getElementById('all-dealers-modal')?.style.display === 'flex')    { closeAllDealersModal(); return; }
  });
}

function updateNav(loggedIn, name, avatarUrl) {
  const sellBtn        = document.querySelector('.btn-sell');
  const navProfile     = document.getElementById('nav-profile');
  const mbnProfile     = document.getElementById('mbn-profile-btn');
  const mbnLogin       = document.getElementById('mbn-login-btn');
  if (loggedIn) {
    if (sellBtn) { sellBtn.textContent = '+ Sæt til salg'; sellBtn.setAttribute('onclick', 'openModal()'); }
    if (navProfile) navProfile.style.display = 'flex';
    if (mbnProfile) mbnProfile.style.display = 'flex';
    if (mbnLogin)   mbnLogin.style.display = 'none';
    updateNavAvatar(name, avatarUrl);
    checkUnreadMessages();
  } else {
    if (sellBtn) { sellBtn.textContent = 'Log ind / Sælg'; sellBtn.setAttribute('onclick', 'openLoginModal()'); }
    if (navProfile) navProfile.style.display = 'none';
    if (mbnProfile) mbnProfile.style.display = 'none';
    if (mbnLogin)   mbnLogin.style.display = 'flex';
  }
}

function checkEmailConfirmed() {
  var banner = document.getElementById('email-confirm-banner');
  if (!banner || !currentUser) return;
  if (currentUser.email_confirmed_at) {
    banner.style.display = 'none';
    // Synk email_verified til profil hvis ikke allerede sat
    if (currentProfile && !currentProfile.email_verified) {
      supabase.from('profiles').update({ email_verified: true }).eq('id', currentUser.id).then(() => {
        if (currentProfile) currentProfile.email_verified = true;
      });
    }
  } else {
    banner.style.display = 'block';
  }
}

function dismissEmailBanner() {
  var banner = document.getElementById('email-confirm-banner');
  if (banner) banner.style.display = 'none';
}

async function resendConfirmationEmail() {
  if (!currentUser?.email) return;
  var { error } = await supabase.auth.resend({ type: 'signup', email: currentUser.email });
  if (error) {
    showToast('Kunne ikke sende bekræftelsesmail – prøv igen senere');
  } else {
    showToast('Bekræftelsesmail sendt! Tjek din indbakke');
  }
}

function updateNavAvatar(name, avatarUrl) {
  const el = document.getElementById('nav-initials');
  if (!el) return;
  const safeUrl = safeAvatarUrl(avatarUrl);
  if (safeUrl) {
    el.innerHTML = `<img src="${safeUrl}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:50%;display:block;">`;
  } else {
    el.textContent = (name || '?').substring(0, 2).toUpperCase();
  }
}

async function checkUnreadMessages() {
  if (!currentUser) return;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', currentUser.id)
    .eq('read', false);
  const badge = document.getElementById('inbox-badge');
  if (badge) {
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
    else { badge.style.display = 'none'; }
  }
  const navBadge = document.getElementById('nav-inbox-badge');
  if (navBadge) {
    if (count > 0) { navBadge.textContent = count; navBadge.style.display = 'flex'; }
    else { navBadge.style.display = 'none'; }
  }
}

/* ============================================================
   FORHANDLERE
   ============================================================ */

async function loadDealers(dealers, bikeRows) {
  const container = document.getElementById('dealer-cards-container');
  if (!container) return;

  let error;
  if (!dealers || !bikeRows) {
    // Standalone kald – hent data selv
    let dealerRes, bikeRes;
    [dealerRes, bikeRes] = await Promise.all([
      supabase.from('profiles').select('id, shop_name, city, address, name').eq('seller_type', 'dealer').eq('verified', true).order('created_at', { ascending: true }),
      supabase.from('bikes').select('user_id').eq('is_active', true)
    ]);
    dealers  = dealerRes.data;
    bikeRows = bikeRes.data;
    error    = dealerRes.error;
  }

  if (error || !dealers || dealers.length === 0) {
    container.className = 'dealer-cards dealer-empty-state';
    container.innerHTML = `
      <div class="dealer-empty-card">
        <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
        <h3>Ingen forhandlere endnu</h3>
        <p>Vær den første forhandler på Cykelbørsen og nå tusindvis af cykelkøbere.</p>
        <button class="btn-become-dealer-small" onclick="navigateTo('/bliv-forhandler')">Tilmeld din butik →</button>
      </div>
    `;
    return;
  }

  const dealerIdSet = new Set(dealers.map(d => d.id));

  const countMap = {};
  if (bikeRows) {
    for (const b of bikeRows) {
      if (dealerIdSet.has(b.user_id)) {
        countMap[b.user_id] = (countMap[b.user_id] || 0) + 1;
      }
    }
  }

  // Sorter efter antal cykler (flest først)
  dealers.sort((a, b) => (countMap[b.id] || 0) - (countMap[a.id] || 0));

  const top3    = dealers.slice(0, 3);
  const rest    = dealers.slice(3);

  container.className = 'dealer-cards';
  container.innerHTML = top3.map(dealer => buildDealerCard(dealer, countMap, true)).join('');

  // Resten vises inline under en "Se resten"-knap
  if (rest.length > 0) {
    const restHtml = rest.map(d => buildDealerCard(d, countMap, false)).join('');
    const restWrap = document.createElement('div');
    restWrap.innerHTML = `
      <button class="btn-see-all-dealers" id="toggle-rest-dealers" onclick="toggleRestDealers()">
        Se resten (${rest.length} forhandlere) ↓
      </button>
      <div class="dealer-cards dealer-rest-grid" id="rest-dealers-grid" style="display:none;margin-top:16px;">
        ${restHtml}
      </div>
    `;
    container.after(restWrap);
  }

  // Gem alle forhandlere til modal brug
  window._allDealers    = dealers;
  window._dealerCountMap = countMap;
}

// Kombineret startup-fetch: 2 parallelle queries i stedet for 5
async function loadInitialData() {
  const [{ data: dealers, count: dealerCount }, { data: bikesData }] = await Promise.all([
    supabase.from('profiles')
      .select('id, shop_name, city, address, name', { count: 'exact' })
      .eq('seller_type', 'dealer').eq('verified', true)
      .order('created_at', { ascending: true }),
    supabase.from('bikes')
      .select('type, condition, wheel_size, user_id, profiles(seller_type)')
      .eq('is_active', true)
  ]);
  updateFilterCounts(bikesData, dealerCount);
  loadDealers(dealers, bikesData);
}

function buildDealerCard(dealer, countMap, featured = false) {
  const displayName   = dealer.shop_name || dealer.name || 'Forhandler';
  const initials      = displayName.substring(0, 2).toUpperCase();
  const bikeCount     = countMap[dealer.id] || 0;
  const locationText  = dealer.address && dealer.city ? `${dealer.address}, ${dealer.city}` : dealer.address || dealer.city || '';
  const featuredClass = featured ? ' dealer-card--featured' : '';
  return `
    <div class="dealer-card${featuredClass}" onclick="navigateToDealer('${dealer.id}')" style="cursor:pointer;" title="Se ${displayName}s profil">
      <div class="dealer-logo-circle">${initials}</div>
      <div class="dealer-name">${displayName} <span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></div>
      ${locationText ? `<div class="dealer-city">📍 ${locationText}</div>` : ''}
      <div class="dealer-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>
    </div>
  `;
}

function toggleRestDealers() {
  const grid = document.getElementById('rest-dealers-grid');
  const btn  = document.getElementById('toggle-rest-dealers');
  if (!grid || !btn) return;
  const open = grid.style.display === 'none';
  grid.style.display  = open ? '' : 'none';
  btn.textContent     = open
    ? `Skjul resten ↑`
    : `Se resten (${grid.querySelectorAll('.dealer-card').length} forhandlere) ↓`;
}

function openAllDealersModal() {
  const modal = document.getElementById('all-dealers-modal');
  if (!modal) return;
  const grid = document.getElementById('all-dealers-grid');
  const dealers   = window._allDealers    || [];
  const countMap  = window._dealerCountMap || {};
  grid.innerHTML = dealers.map(d => buildDealerCard(d, countMap, false)).join('');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeAllDealersModal() {
  const modal = document.getElementById('all-dealers-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function closeMapBikeModal() {
  const el = document.getElementById('map-bike-modal');
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

function closeAllModals() {
  ['all-dealers-modal','dealer-profile-modal','user-profile-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['bike-modal','map-bike-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  document.body.style.overflow = '';
}

function filterByDealerCard(dealerId) {
  openDealerProfile(dealerId);
}

async function openDealerProfile(dealerId) {
  const myToken = ++_dealerProfileToken;
  closeAllDealersModal();
  const modal = document.getElementById('dealer-profile-modal');
  const header = document.getElementById('dealer-profile-header');
  const bikesGrid = document.getElementById('dealer-profile-bikes');
  if (!modal) return;

  header.innerHTML = '<p style="color:var(--muted);padding:20px 0">Henter forhandler...</p>';
  bikesGrid.innerHTML = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Hent forhandlerens profil
  let dealer, dealerErr;
  try {
    const fetchPromise = supabase
      .from('profiles')
      .select('id, shop_name, name, city, verified, avatar_url')
      .eq('id', dealerId)
      .single();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: forhandlerforespørgsel tog for lang tid')), 15000));
    ({ data: dealer, error: dealerErr } = await Promise.race([fetchPromise, timeoutPromise]));
  } catch (e) {
    dealerErr = e;
    console.error('openDealerProfile fetch error:', e.message);
  }

  if (myToken !== _dealerProfileToken) return;

  if (!dealer) {
    header.innerHTML = retryHTML('Kunne ikke hente forhandler.', `() => openDealerProfile('${dealerId}')`);
    return;
  }

  const displayName = dealer.shop_name || dealer.name || 'Forhandler';
  const initials    = displayName.substring(0, 2).toUpperCase();
  const countMap    = window._dealerCountMap || {};
  const bikeCount   = countMap[dealerId] ?? null;

  const dealerLogoContent = safeAvatarUrl(dealer.avatar_url)
    ? `<img src="${safeAvatarUrl(dealer.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  header.innerHTML = `
    <div class="dealer-profile-hero">
      <div class="dealer-profile-logo">${dealerLogoContent}</div>
      <div class="dealer-profile-info">
        <h2 class="dealer-profile-name">
          ${displayName}
          ${dealer.verified ? '<span class="dealer-verified-tick" title="Verificeret forhandler">✓</span>' : ''}
        </h2>
        ${dealer.city ? `<div class="dealer-profile-city">📍 ${dealer.city}</div>` : ''}
        ${bikeCount !== null ? `<div class="dealer-profile-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>` : ''}
      </div>
    </div>
    <hr class="dealer-profile-divider">
    <h3 class="dealer-profile-section-title">Cykler til salg</h3>
  `;

  if (myToken !== _dealerProfileToken) return;

  // Hent forhandlerens cykler
  let bikes, bikesErr;
  try {
    const bikesFetch = supabase
      .from('bikes')
      .select('*, profiles(name, seller_type, shop_name, verified, id_verified, email_verified), bike_images(url, is_primary)')
      .eq('user_id', dealerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    const bikesTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: forhandlercykler tog for lang tid')), 15000));
    ({ data: bikes, error: bikesErr } = await Promise.race([bikesFetch, bikesTimeout]));
  } catch (e) {
    bikesErr = e;
    console.error('openDealerProfile bikes fetch error:', e.message);
  }

  if (bikesErr || !bikes) {
    bikesGrid.innerHTML = retryHTML('Kunne ikke hente forhandlerens cykler.', `() => openDealerProfile('${dealerId}')`);
    return;
  }
  if (bikes.length === 0) {
    bikesGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:3rem;margin-bottom:12px;">🚲</div>
        <p>Ingen aktive annoncer fra denne forhandler.</p>
      </div>`;
    return;
  }

  bikesGrid.innerHTML = bikes.map((b, i) => {
    const profile    = b.profiles || {};
    const sellerType = profile.seller_type || 'dealer';
    const sellerName = profile.shop_name || profile.name || displayName;
    const avatarInit = (sellerName).substring(0, 2).toUpperCase();
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${b.brand} ${b.model}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
      : '<span style="font-size:4rem">🚲</span>';
    return `
      <div class="bike-card" style="animation-delay:${i * 50}ms" onclick="navigateToBike('${b.id}')">
        <div class="bike-card-img">
          ${imgContent}
          <span class="condition-tag">${b.condition}</span>
          <button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${_userSavedSet.has(b.id) ? '❤️' : '🤍'}</button>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${b.brand} ${b.model}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${b.type}</span><span>${b.year || '–'}</span><span>Str. ${b.size || '–'}</span>
          </div>
          <div class="card-footer">
            <div class="seller-info">
              <div class="seller-avatar">${avatarInit}</div>
              <div>
                <div class="seller-name">${sellerName}${profile.verified ? ' <span class="verified-badge" title="Verificeret forhandler">✓</span>' : ''}</div>
                <span class="badge badge-dealer">🏪 Forhandler</span>
              </div>
            </div>
            <div class="card-location">📍 ${b.city}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function closeDealerProfileModal() {
  const modal = document.getElementById('dealer-profile-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

/* ============================================================
   BRUGER PROFIL
   ============================================================ */

async function openUserProfileWithReview(userId) {
  await openUserProfile(userId);
  // Vent på at profil-indhold renderes, scroll så til og fremhæv vurderingsformularen
  setTimeout(() => {
    const wrap = document.getElementById('write-review-wrap');
    if (wrap) {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      wrap.style.outline = '2.5px solid var(--rust)';
      wrap.style.borderRadius = '12px';
      setTimeout(() => { wrap.style.outline = ''; }, 2000);
    }
  }, 600);
}

async function openUserProfile(userId) {
  const myToken = ++_userProfileToken;
  closeAllModals();
  const modal   = document.getElementById('user-profile-modal');
  const content = document.getElementById('user-profile-content');
  if (!modal || !content) { console.error('user-profile-modal eller user-profile-content ikke fundet i DOM'); return; }
  content.innerHTML = '<p style="color:var(--muted);padding:60px 0;text-align:center;">Henter profil...</p>';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Hent parallelt: profil, aktive cykler, solgte cykler, anmeldelser
  let profile, activeBikes, soldBikes, reviews, messagesCount;
  try {
    const safe = p => Promise.resolve(p).catch(e => { console.warn('Query fejl:', e); return { data: null, error: e }; });

    const dataPromise = Promise.all([
      safe(supabase.from('profiles').select('id, name, shop_name, seller_type, city, address, verified, id_verified, email_verified, created_at, avatar_url, last_seen, bio').eq('id', userId).single()),
      safe(supabase.from('bikes').select('id, brand, model, price, type, city, condition, year, color, warranty, is_active, created_at, bike_images(url, is_primary)').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false })),
      safe(supabase.from('bikes').select('brand, model, price, type, condition, year, city').eq('user_id', userId).eq('is_active', false).order('created_at', { ascending: false })),
      safe(supabase.from('reviews').select('*, reviewer:profiles(name, shop_name, seller_type)').eq('reviewed_user_id', userId).order('created_at', { ascending: false })),
    ]);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: profilforespørgsel tog for lang tid')), 15000));
    const [r1, r2, r3, r4] = await Promise.race([dataPromise, timeoutPromise]);

    profile     = r1.data;
    activeBikes = r2.data;
    soldBikes   = r3.data;
    reviews     = r4.error ? [] : (r4.data || []);

    if (currentUser) {
      // hasTraded = der findes en budaccepterings-besked mellem de to brugere
      const { data: tradeMsg, error: msgErr } = await safe(
        supabase.from('messages')
          .select('id')
          .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
          .ilike('content', '%accepteret%')
          .limit(1)
      );
      messagesCount = tradeMsg?.length || 0;
    } else {
      messagesCount = 0;
    }
  } catch (err) {
    console.error('openUserProfile error:', err.message);
    content.innerHTML = retryHTML('Kunne ikke hente profil.', `() => openUserProfile('${userId}')`);
    return;
  }

  if (myToken !== _userProfileToken) return;

  if (!profile) {
    content.innerHTML = retryHTML('Kunne ikke hente profil.', `() => openUserProfile('${userId}')`);
    return;
  }

  const displayName  = profile.seller_type === 'dealer' ? (profile.shop_name || profile.name) : profile.name;
  const initials     = (displayName || 'U').substring(0, 2).toUpperCase();
  const isDealer     = profile.seller_type === 'dealer';
  const memberYear   = profile.created_at ? new Date(profile.created_at).getFullYear() : null;
  const isOwnProfile = currentUser && currentUser.id === userId;
  const lastSeenText = !isOwnProfile ? formatLastSeen(profile.last_seen) : null;

  // Gennemsnit og anmeldelsesantal
  const reviewList   = reviews || [];
  const avgRating    = reviewList.length ? (reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) : null;
  const hasReviewed  = currentUser && reviewList.some(r => r.reviewer_id === currentUser.id);
  const hasTraded    = currentUser && messagesCount > 0;

  // Stjerner helper
  function stars(n) {
    return [1,2,3,4,5].map(i => `<span class="star${i <= Math.round(n) ? ' filled' : ''}">★</span>`).join('');
  }

  // Aktive annoncer
  const activeBikeCards = (activeBikes || []).map((b, i) => {
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
      : '<span style="font-size:2.5rem">🚲</span>';
    return `
      <div class="up-bike-card" onclick="openBikeModal('${b.id}')" style="animation-delay:${i*40}ms">
        <div class="up-bike-img">${imgContent}</div>
        <div class="up-bike-info">
          <div class="up-bike-title">${esc(b.brand)} ${esc(b.model)}</div>
          <div class="up-bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          <div class="up-bike-meta">${esc(b.type)} · ${esc(b.condition)} · ${esc(b.city || '–')}</div>
        </div>
      </div>`;
  }).join('') || `<p class="up-empty">Ingen aktive annoncer.</p>`;

  // Solgte cykler (kompakt liste)
  const soldRows = (soldBikes || []).map(b => `
    <div class="up-sold-row">
      <div class="up-sold-info">
        <span class="up-sold-title">${esc(b.brand)} ${esc(b.model)}</span>
        <span class="up-sold-meta">${esc(b.type)} · ${esc(b.condition)}${b.year ? ' · ' + b.year : ''}</span>
      </div>
      <div class="up-sold-price">${b.price.toLocaleString('da-DK')} kr. <span class="sold-chip">Solgt</span></div>
    </div>`).join('') || `<p class="up-empty">Ingen solgte cykler endnu.</p>`;

  // Anmeldelser
  const reviewCards = reviewList.map(r => {
    const rName = r.reviewer?.seller_type === 'dealer' ? r.reviewer.shop_name : r.reviewer?.name;
    const rInit = (rName || 'U').substring(0,2).toUpperCase();
    const date  = new Date(r.created_at).toLocaleDateString('da-DK', { year:'numeric', month:'short', day:'numeric' });
    return `
      <div class="up-review-card">
        <div class="up-review-top">
          <div class="up-review-avatar">${rInit}</div>
          <div>
            <div class="up-review-name">${esc(rName || 'Anonym')}</div>
            <div class="up-review-stars">${stars(r.rating)}</div>
          </div>
          <div class="up-review-date">${date}</div>
        </div>
        ${r.comment ? `<p class="up-review-comment">${esc(r.comment)}</p>` : ''}
      </div>`;
  }).join('') || `<p class="up-empty">Ingen vurderinger endnu.</p>`;

  // Skriv anmeldelse formular — kun synlig hvis de to har handlet (beskeder) og ikke allerede vurderet
  const writeReviewHtml = (!isOwnProfile && currentUser && !hasReviewed && hasTraded) ? `
    <div class="up-write-review" id="write-review-wrap">
      <h4 class="up-section-title" style="margin-bottom:12px;">Giv en vurdering</h4>
      <div class="up-star-picker" id="star-picker">
        ${[1,2,3,4,5].map(i => `<span class="star-pick" data-val="${i}" onclick="pickStar(${i})">★</span>`).join('')}
      </div>
      <textarea id="review-comment" class="up-review-textarea" placeholder="Fortæl om din handel med ${esc(displayName)}... (valgfrit)"></textarea>
      <button class="btn-submit-review" onclick="submitReview('${userId}')">Send vurdering</button>
    </div>`
  : (!isOwnProfile && currentUser && !hasReviewed) ? `
    <p class="up-empty" style="font-size:0.85rem;color:var(--muted);margin-top:8px;">Du kan kun vurdere brugere du har handlet med via Cykelbørsen.</p>`
  : '';

  // Send besked sektion — kun for andre brugeres profiler med aktive annoncer
  const numActive = (activeBikes || []).length;
  const sendMsgHtml = (!isOwnProfile && currentUser && numActive > 0) ? `
    <div class="up-contact-section" id="up-contact-section">
      <button class="up-contact-btn" onclick="toggleProfileContact()">✉️ Send besked</button>
      <div class="up-contact-form" id="up-contact-form" style="display:none;">
        ${numActive > 1 ? `
        <select class="up-contact-bike-select" id="up-contact-bike-select">
          ${(activeBikes || []).map(b => `<option value="${b.id}">${esc(b.brand)} ${esc(b.model)} – ${b.price.toLocaleString('da-DK')} kr.</option>`).join('')}
        </select>` : `<input type="hidden" id="up-contact-bike-select" value="${activeBikes[0].id}">`}
        <textarea id="up-contact-message" class="up-review-textarea" placeholder="Skriv en besked til ${esc(displayName)}..." rows="3"></textarea>
        <button class="up-contact-send-btn" onclick="sendProfileMessage('${userId}')">Send besked</button>
      </div>
    </div>` : '';

  const upAvatarContent = safeAvatarUrl(profile.avatar_url)
    ? `<img src="${safeAvatarUrl(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  const nActive  = (activeBikes || []).length;
  const nSold    = (soldBikes || []).length;
  const nReviews = reviewList.length;

  content.innerHTML = `
    <!-- Header -->
    <div class="up-header">
      <div class="up-avatar">${upAvatarContent}</div>
      <div class="up-meta">
        <h2 class="up-name">
          ${esc(displayName)}
          ${profile.verified ? '<span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}
          ${profile.email_verified ? '<span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}
        </h2>
        ${isDealer && profile.address ? `<div class="up-city">📍 ${esc(profile.address)}${profile.city ? ', ' + esc(profile.city) : ''}</div>` : profile.city ? `<div class="up-city">📍 ${esc(profile.city)}</div>` : ''}
        ${lastSeenText ? `<div class="up-last-seen">🕐 ${lastSeenText}</div>` : ''}
        <div class="up-badges">
          <span class="badge ${isDealer ? 'badge-dealer' : 'badge-private'}">${isDealer ? '🏪 Forhandler' : '👤 Privat sælger'}</span>
          ${memberYear ? `<span class="up-member-since">Medlem siden ${memberYear}</span>` : ''}
        </div>
        <div class="up-achievements" id="user-achievements"></div>
        ${profile.bio ? `<p class="up-bio">${esc(profile.bio)}</p>` : ''}
        ${sendMsgHtml}
      </div>
    </div>

    <!-- Statistik -->
    <div class="up-stats">
      <div class="up-stat up-stat-clickable" onclick="switchUserProfileTab('listings')">
        <div class="up-stat-val">${nActive}</div>
        <div class="up-stat-label">Til salg</div>
      </div>
      <div class="up-stat up-stat-clickable" onclick="switchUserProfileTab('sold')">
        <div class="up-stat-val">${nSold}</div>
        <div class="up-stat-label">Solgt</div>
      </div>
      <div class="up-stat up-stat-clickable" onclick="switchUserProfileTab('reviews')">
        <div class="up-stat-val">${avgRating !== null ? avgRating.toFixed(1) + ' ★' : '–'}</div>
        <div class="up-stat-label">${nReviews} ${nReviews === 1 ? 'vurdering' : 'vurderinger'}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="up-tabs">
      <button class="up-tab active" data-tab="listings" onclick="switchUserProfileTab('listings')">Til salg (${nActive})</button>
      <button class="up-tab" data-tab="sold" onclick="switchUserProfileTab('sold')">Solgt (${nSold})</button>
      <button class="up-tab" data-tab="reviews" onclick="switchUserProfileTab('reviews')">Vurderinger${avgRating !== null ? ` ${avgRating.toFixed(1)} ★` : ` (${nReviews})`}</button>
    </div>

    <!-- Tab: Til salg -->
    <div id="up-tab-listings" class="up-tab-panel">
      <div class="up-bikes-grid">${activeBikeCards}</div>
    </div>

    <!-- Tab: Solgte cykler -->
    <div id="up-tab-sold" class="up-tab-panel" style="display:none;">
      <div class="up-sold-list">${soldRows}</div>
    </div>

    <!-- Tab: Vurderinger -->
    <div id="up-tab-reviews" class="up-tab-panel" style="display:none;">
      <div class="up-reviews-list">${reviewCards}</div>
      ${writeReviewHtml}
    </div>
  `;

  // Aktivér stjerne-hover
  document.querySelectorAll('.star-pick').forEach(s => {
    s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
    s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
  });
  window._pickedStar = 0;

  // Beregn og vis achievements asynkront
  loadUserAchievements(userId, activeBikes, soldBikes, reviewList, profile);
}

function switchUserProfileTab(tab) {
  document.querySelectorAll('.up-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.up-tab-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById('up-tab-' + tab);
  if (panel) panel.style.display = '';
}

function switchDealerProfileTab(tab) {
  document.querySelectorAll('.dp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  ['listings', 'reviews'].forEach(t => {
    const p = document.getElementById('dp-tab-' + t);
    if (p) p.style.display = t === tab ? '' : 'none';
  });
}

function toggleProfileContact() {
  const form = document.getElementById('up-contact-form');
  if (!form) return;
  const isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const ta = document.getElementById('up-contact-message');
    if (ta) ta.focus();
  }
}

async function sendProfileMessage(receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at sende beskeder'); return; }
  const bikeId  = document.getElementById('up-contact-bike-select')?.value;
  const content = document.getElementById('up-contact-message')?.value?.trim();
  if (!bikeId)  { showToast('⚠️ Vælg en annonce'); return; }
  if (!content) { showToast('⚠️ Skriv en besked'); return; }

  const btn = document.querySelector('#up-contact-form .up-contact-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sender...'; }
  try {
    const { data: inserted, error } = await supabase.from('messages').insert({
      bike_id:     bikeId,
      sender_id:   currentUser.id,
      receiver_id: receiverId,
      content,
    }).select('id').single();

    if (error) { showToast('❌ Kunne ikke sende besked'); console.error(error); return; }
    showToast('✅ Besked sendt!');
    document.getElementById('up-contact-form').style.display = 'none';
    const ta = document.getElementById('up-contact-message');
    if (ta) ta.value = '';

    if (inserted?.id) {
      supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } }).catch(() => {});
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send besked'; }
  }
}

async function loadUserAchievements(userId, activeBikes, soldBikes, reviewList, profile) {
  const wrap = document.getElementById('user-achievements');
  if (!wrap) return;
  try {
    const badges = [];
    const numActive = (activeBikes || []).length;
    const numSold   = (soldBikes || []).length;
    const avgRating = reviewList.length ? (reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) : 0;

    // Uploader ofte: 3+ aktive annoncer
    if (numActive >= 3) badges.push({ icon: '📦', label: 'Uploader ofte', title: '3+ aktive annoncer' });

    // Erfaren sælger: 5+ solgte
    if (numSold >= 5) badges.push({ icon: '🏆', label: 'Erfaren sælger', title: '5+ solgte cykler' });
    else if (numSold >= 1) badges.push({ icon: '🤝', label: 'Har solgt', title: `${numSold} gennemført${numSold === 1 ? '' : 'e'} salg` });

    // Top-rated: 4.5+ gennemsnit med mindst 3 vurderinger
    if (reviewList.length >= 3 && avgRating >= 4.5) badges.push({ icon: '⭐', label: 'Topvurderet', title: `${avgRating.toFixed(1)} gns. fra ${reviewList.length} vurderinger` });

    // Verificeret: e-mail
    if (profile.email_verified) badges.push({ icon: '✉️', label: 'E-mail verificeret', title: 'Har verificeret sin e-mail' });

    // Veteranmedlem: 1+ år
    if (profile.created_at) {
      const ageMonths = (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageMonths >= 12) badges.push({ icon: '🎖️', label: 'Veteranmedlem', title: 'Medlem i 1+ år' });
    }

    // Svarer hurtigt: hent responstid
    const { data: sent } = await supabase
      .from('messages')
      .select('created_at, bike_id')
      .eq('sender_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);
    const { data: received } = await supabase
      .from('messages')
      .select('created_at, bike_id')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (sent && received && sent.length >= 3 && received.length >= 1) {
      const responseTimes = [];
      received.forEach(inMsg => {
        const reply = sent.find(o => o.bike_id === inMsg.bike_id && new Date(o.created_at) > new Date(inMsg.created_at));
        if (reply) {
          const mins = (new Date(reply.created_at) - new Date(inMsg.created_at)) / 60000;
          if (mins > 0 && mins < 10080) responseTimes.push(mins);
        }
      });
      if (responseTimes.length >= 2) {
        const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        if (avg < 60) badges.push({ icon: '⚡', label: 'Svarer hurtigt', title: 'Svarer typisk inden for en time' });
        else if (avg < 360) badges.push({ icon: '💬', label: 'Svarer samme dag', title: 'Svarer typisk inden for få timer' });
      }
    }

    if (badges.length === 0) return;

    wrap.innerHTML = badges.map(b =>
      `<span class="achievement-badge" title="${esc(b.title)}">${b.icon} ${esc(b.label)}</span>`
    ).join('');
  } catch (e) {
    console.error('loadUserAchievements fejl:', e);
  }
}

function pickStar(val) {
  window._pickedStar = val;
  highlightStars(val);
}

function highlightStars(val) {
  document.querySelectorAll('.star-pick').forEach(s => {
    s.classList.toggle('active', +s.dataset.val <= val);
  });
}

async function submitReview(reviewedUserId) {
  const rating  = window._pickedStar || 0;
  const comment = document.getElementById('review-comment')?.value?.trim() || '';

  if (!currentUser)       { showToast('⚠️ Log ind for at give en vurdering'); return; }
  if (rating < 1)         { showToast('⚠️ Vælg et antal stjerner'); return; }

  // Verificér at der er en budaccepterings-besked mellem de to brugere (= reel handel)
  const { data: tradeMsg } = await supabase.from('messages')
    .select('id')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${reviewedUserId}),and(sender_id.eq.${reviewedUserId},receiver_id.eq.${currentUser.id})`)
    .ilike('content', '%accepteret%')
    .limit(1);
  const hasTraded = tradeMsg?.length > 0;
  if (!hasTraded) { showToast('⚠️ Du kan kun vurdere brugere du har handlet med via Cykelbørsen'); return; }

  const { error } = await supabase.from('reviews').insert({
    reviewer_id:      currentUser.id,
    reviewed_user_id: reviewedUserId,
    rating,
    comment: comment || null,
  });

  if (error) { showToast('❌ Kunne ikke sende vurdering'); console.error(error); return; }

  showToast('✅ Vurdering sendt!');
  // Genindlæs profilen
  openUserProfile(reviewedUserId);
}

// Global state for rating modal
let _ratingModalUserId = null;
let _ratingModalUserName = null;

function openRateModal(otherId, otherName, bikeInfo) {
  // Store the user we're about to rate
  _ratingModalUserId = otherId;
  _ratingModalUserName = otherName;

  // Build and insert the modal content
  const content = `
    <div class="rate-modal-section">
      <div class="rate-modal-person">Vurder ${esc(otherName)}</div>
      <label class="rate-modal-label">Hvordan var din handel?</label>
      <div class="rate-stars" id="rate-stars">
        ${[1,2,3,4,5].map(i => `<span class="star-pick" data-val="${i}" onclick="pickStar(${i})">★</span>`).join('')}
      </div>
      <label class="rate-modal-label">Kommentar (valgfrit)</label>
      <textarea id="rate-modal-comment" class="rate-comment" placeholder="Fortæl om din handel..."></textarea>
    </div>
  `;

  document.getElementById('rate-modal-content').innerHTML = content;

  // Set up star hover listeners
  document.querySelectorAll('#rate-stars .star-pick').forEach(s => {
    s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
    s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
  });

  // Reset star picker state
  window._pickedStar = 0;
  document.querySelectorAll('#rate-stars .star-pick').forEach(s => s.classList.remove('active'));

  // Show the modal
  const modal = document.getElementById('rate-now-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  enableFocusTrap('rate-now-modal');
}

function closeRateModal() {
  const modal = document.getElementById('rate-now-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  _ratingModalUserId = null;
  _ratingModalUserName = null;
  window._pickedStar = 0;
}

async function submitRatingFromModal() {
  if (!_ratingModalUserId) return;

  const rating  = window._pickedStar || 0;
  const comment = document.getElementById('rate-modal-comment')?.value?.trim() || '';

  if (!currentUser) { showToast('⚠️ Log ind for at give en vurdering'); return; }
  if (rating < 1)   { showToast('⚠️ Vælg et antal stjerner'); return; }

  // Verificér at der er en budaccepterings-besked mellem de to brugere
  const { data: tradeMsg } = await supabase.from('messages')
    .select('id')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${_ratingModalUserId}),and(sender_id.eq.${_ratingModalUserId},receiver_id.eq.${currentUser.id})`)
    .ilike('content', '%accepteret%')
    .limit(1);
  const hasTraded = tradeMsg?.length > 0;
  if (!hasTraded) { showToast('⚠️ Du kan kun vurdere brugere du har handlet med via Cykelbørsen'); return; }

  const { error } = await supabase.from('reviews').insert({
    reviewer_id:      currentUser.id,
    reviewed_user_id: _ratingModalUserId,
    rating,
    comment: comment || null,
  });

  if (error) { showToast('❌ Kunne ikke sende vurdering'); console.error(error); return; }

  showToast('✅ Vurdering sendt!');
  closeRateModal();
}

function closeUserProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  window._pickedStar = 0;
}

/* ============================================================
   ANNONCER
   ============================================================ */

async function loadBikes(filters = {}, append = false) {
  const grid = document.getElementById('listings-grid');

  if (!append) {
    bikesOffset    = 0;
    currentFilters = filters;
    grid.innerHTML = Array(6).fill(`
      <div class="bike-card skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--sub"></div>
          <div class="skeleton-line skeleton-line--price"></div>
        </div>
      </div>`).join('');
    // Fjern evt. eksisterende "Vis flere"-knap
    const old = document.getElementById('load-more-btn');
    if (old) old.remove();
  }

  let query = supabase
    .from('bikes')
    .select('id, brand, model, price, type, city, condition, year, size, color, warranty, is_active, created_at, user_id, profiles(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, address), bike_images(url, is_primary)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(bikesOffset, bikesOffset + BIKES_PAGE_SIZE - 1);

  if (filters.type)       query = query.eq('type', filters.type);
  if (filters.city)       query = query.ilike('city', `%${filters.city}%`);
  if (filters.maxPrice)   query = query.lte('price', filters.maxPrice);
  if (filters.search) {
    const s = filters.search.replace(/[%_\\,.()"']/g, '');
    if (s) query = query.or(`brand.ilike.%${s}%,model.ilike.%${s}%`);
  }
  if (filters.warranty)   query = query.not('warranty', 'is', null);
  if (filters.newOnly)    query = query.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const { data: rawData, error } = await query;

  if (error) {
    console.error('loadBikes fejl:', error);
    if (!append) grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer.</p>';
    return;
  }

  // sellerType filtreres client-side da det er en join-kolonne
  const data = filters.sellerType
    ? rawData.filter(b => b.profiles?.seller_type === filters.sellerType)
    : rawData;

  // Hent favorit-tæller + brugerens egne gemte bikes i én query
  const bikeIds = data.map(b => b.id);
  let saveCounts = {};
  let userSavedSet = new Set();
  if (bikeIds.length > 0) {
    const { data: countData } = await supabase
      .from('saved_bikes')
      .select('bike_id, user_id')
      .in('bike_id', bikeIds);
    if (countData) {
      countData.forEach(row => {
        saveCounts[row.bike_id] = (saveCounts[row.bike_id] || 0) + 1;
        if (currentUser && row.user_id === currentUser.id) {
          userSavedSet.add(row.bike_id);
          _userSavedSet.add(row.bike_id);
        }
      });
    }
  }

  if (append) {
    renderBikes(data, true, saveCounts, userSavedSet);
  } else {
    renderBikes(data, false, saveCounts, userSavedSet);
  }

  bikesOffset += data.length;

  // Vis "Vis flere"-knap eller "Ingen flere"-besked
  const existing = document.getElementById('load-more-btn');
  if (existing) existing.remove();

  const footer = document.createElement('div');
  footer.id = 'load-more-btn';
  if (data.length === BIKES_PAGE_SIZE) {
    footer.innerHTML = `<button onclick="loadBikes(currentFilters, true)" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Vis flere cykler</button>`;
  } else if (append && bikesOffset > BIKES_PAGE_SIZE) {
    footer.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
  } else {
    // Første side med færre end BIKES_PAGE_SIZE — intet footer element nødvendigt
    return;
  }
  grid.after(footer);
}

// Tjekker om der er aktive filtre (sidebar, hurtigfilter, søgning)
function hasActiveFilters() {
  const filtersSet = currentFilters && Object.keys(currentFilters).some(k => {
    const v = currentFilters[k];
    return v !== null && v !== undefined && v !== '' && v !== false;
  });
  const filterArgsSet = currentFilterArgs && (
    (currentFilterArgs.types && currentFilterArgs.types.length > 0) ||
    (currentFilterArgs.conditions && currentFilterArgs.conditions.length > 0) ||
    (currentFilterArgs.wheelSizes && currentFilterArgs.wheelSizes.length > 0) ||
    currentFilterArgs.minPrice ||
    currentFilterArgs.maxPrice ||
    currentFilterArgs.sellerType
  );
  return !!(filtersSet || filterArgsSet);
}

// Beskriver de aktive filtre i menneske-læsbar form
function describeActiveFilters() {
  const parts = [];
  if (currentFilters?.search)    parts.push(`"${currentFilters.search}"`);
  if (currentFilters?.type)      parts.push(currentFilters.type);
  if (currentFilters?.city)      parts.push(currentFilters.city);
  if (currentFilters?.maxPrice)  parts.push(`under ${currentFilters.maxPrice.toLocaleString('da-DK')} kr.`);
  if (currentFilters?.warranty)  parts.push('med garanti');
  if (currentFilters?.newOnly)   parts.push('nye annoncer');
  if (currentFilters?.sellerType === 'dealer')  parts.push('forhandlere');
  if (currentFilters?.sellerType === 'private') parts.push('private');

  if (currentFilterArgs?.types?.length)      parts.push(currentFilterArgs.types.join(', '));
  if (currentFilterArgs?.conditions?.length) parts.push(currentFilterArgs.conditions.join(', '));
  if (currentFilterArgs?.wheelSizes?.length) parts.push(currentFilterArgs.wheelSizes.join(', '));
  if (currentFilterArgs?.minPrice && currentFilterArgs?.maxPrice) {
    parts.push(`${currentFilterArgs.minPrice.toLocaleString('da-DK')}–${currentFilterArgs.maxPrice.toLocaleString('da-DK')} kr.`);
  } else if (currentFilterArgs?.minPrice) {
    parts.push(`fra ${currentFilterArgs.minPrice.toLocaleString('da-DK')} kr.`);
  } else if (currentFilterArgs?.maxPrice) {
    parts.push(`under ${currentFilterArgs.maxPrice.toLocaleString('da-DK')} kr.`);
  }
  if (currentFilterArgs?.sellerType === 'dealer')  parts.push('forhandlere');
  if (currentFilterArgs?.sellerType === 'private') parts.push('private');

  return parts;
}

// Nulstil alle filtre — søgning, hurtigfilter-pills, sidebar
function clearAllFilters() {
  // Søgefelter
  const s = document.getElementById('search-input'); if (s) s.value = '';
  const t = document.getElementById('search-type');  if (t) t.value = '';
  const c = document.getElementById('search-city');  if (c) c.value = '';

  // Pills — sæt "Alle" aktiv, fjern resten
  document.querySelectorAll('.filters-row .pill').forEach(p => {
    const isAlle = (p.textContent || '').trim() === 'Alle';
    p.classList.toggle('active', isAlle);
    p.setAttribute('aria-pressed', isAlle ? 'true' : 'false');
  });

  // Sidebar checkboxes
  document.querySelectorAll('.sidebar-box input[type="checkbox"]').forEach(cb => {
    cb.checked = cb.dataset.value === 'all';
  });

  // Pris-felter
  document.querySelectorAll('.price-range input[type="number"]').forEach(inp => inp.value = '');

  currentFilters    = {};
  currentFilterArgs = null;
  loadBikes();
  showToast('Filtre nulstillet');
}

function renderListingsEmptyState() {
  if (!hasActiveFilters()) {
    return `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-size:4rem;margin-bottom:16px;">🚲</div>
        <h3 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:10px;color:var(--charcoal);">Ingen cykler her endnu</h3>
        <p style="color:var(--muted);font-size:0.9rem;max-width:340px;margin:0 auto 24px;line-height:1.6;">Vær den første til at sælge din cykel på Cykelbørsen — det er gratis og tager kun 2 minutter.</p>
        <button onclick="openModal()" style="background:var(--rust);color:#fff;border:none;padding:13px 28px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">+ Sæt din cykel til salg</button>
      </div>`;
  }

  const filterDesc = describeActiveFilters();
  const filterText = filterDesc.length > 0
    ? `<p style="color:var(--muted);font-size:0.85rem;margin:0 auto 18px;max-width:380px;">Filtre: <strong style="color:var(--charcoal)">${esc(filterDesc.join(' · '))}</strong></p>`
    : '';

  return `
    <div style="grid-column:1/-1;text-align:center;padding:50px 20px;">
      <div style="font-size:3.5rem;margin-bottom:14px;">🔍</div>
      <h3 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:10px;color:var(--charcoal);">Ingen cykler matcher dine filtre</h3>
      <p style="color:var(--muted);font-size:0.92rem;max-width:380px;margin:0 auto 14px;line-height:1.55;">Prøv at fjerne et filter eller udvid dit søgekriterium.</p>
      ${filterText}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px;">
        <button onclick="clearAllFilters()" style="background:var(--rust);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">↺ Nulstil filtre</button>
        <button onclick="saveCurrentSearch()" style="background:var(--sand);color:var(--charcoal);border:1.5px solid var(--border);padding:12px 24px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">🔔 Få besked når der dukker en op</button>
      </div>
    </div>`;
}

function renderBikes(bikes, append = false, saveCounts = {}, userSavedSet = new Set()) {
  const grid = document.getElementById('listings-grid');

  if (!append && (!bikes || bikes.length === 0)) {
    grid.innerHTML = renderListingsEmptyState();
    return;
  }

  if (!bikes || bikes.length === 0) return;

  const startIndex = append ? grid.querySelectorAll('.bike-card').length : 0;
  const conditionClass = c => {
    if (c === 'Ny')        return 'condition-tag--ny';
    if (c === 'Som ny')    return 'condition-tag--som-ny';
    if (c === 'God stand') return 'condition-tag--god';
    return 'condition-tag--brugt';
  };

  const html = bikes.map((b, i) => {
    const profile    = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    const initials   = (sellerName || 'U').substring(0, 2).toUpperCase();
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy">`
      : '<span style="font-size:4rem">🚲</span>';
    const avatarUrl  = safeAvatarUrl(profile.avatar_url);
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="">`
      : esc(initials);

    var isSold = !b.is_active;
    var saveCount = saveCounts[b.id] || 0;
    var cityAttr     = b.city ? ` data-city="${esc(b.city)}"` : '';
    var addrAttr     = (sellerType === 'dealer' && profile.address) ? ` data-address="${esc(profile.address)}"` : '';
    var sellerAttr   = ` data-seller-type="${sellerType || 'private'}"`;
    return `
      <div class="bike-card"${cityAttr}${addrAttr}${sellerAttr} style="animation-delay:${(startIndex + i) * 50}ms;${isSold ? 'opacity:0.7' : ''}" onclick="${isSold ? '' : "navigateToBike('" + b.id + "')"}">
        <div class="bike-card-img">
          ${imgContent}
          ${isSold ? '<div class="sold-tag"><span>SOLGT</span></div>' : ''}
          <span class="condition-tag ${conditionClass(b.condition)}">${esc(b.condition)}</span>
          ${b.warranty && !isSold ? '<span class="warranty-card-badge">🛡️ Garanti</span>' : ''}
          ${saveCount > 0 ? `<span class="fav-count-badge">❤ ${saveCount}</span>` : ''}
          ${!isSold ? `<button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${userSavedSet.has(b.id) ? '❤️' : '🤍'}</button>` : ''}
          ${!isSold && b.profiles?.id !== currentUser?.id ? `<button class="ask-available-btn${askedAvailableSet.has(b.id) ? ' asked' : ''}" onclick="event.stopPropagation();askIfAvailable('${b.id}','${b.user_id}',this)" title="Er den stadig til salg?">${askedAvailableSet.has(b.id) ? '✅' : '💬'}</button>` : ''}
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${esc(b.brand)} ${esc(b.model)}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${esc(b.type)}</span><span>${b.year || '–'}</span><span>Str. ${esc(b.size) || '–'}</span>
          </div>
          <div class="card-footer">
            <div class="seller-info">
              <div class="seller-avatar">${avatarHtml}</div>
              <div>
                <div class="seller-name">${esc(sellerName) || 'Ukendt'}${profile.verified ? ' <span class="verified-badge" title="Verificeret forhandler">✓</span>' : ''}</div>
                <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                  ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
                </span>
              </div>
            </div>
            <div class="card-location">📍 <span class="bike-city">${esc(b.city)}</span></div>
          </div>
        </div>
      </div>`;
  }).join('');

  if (append) {
    grid.insertAdjacentHTML('beforeend', html);
  } else {
    grid.innerHTML = html;
  }

  // Hvis "Nær mig" er aktiv, re-filtrér + sortér efter afstand
  if (userGeoCoords && activeRadius) applyNearMeFilter();
}

function searchBikes() {
  const search = document.getElementById('search-input').value;
  const type   = document.getElementById('search-type').value;
  const city   = document.getElementById('search-city').value;
  loadBikes({ search, type, city });
}

async function askIfAvailable(bikeId, sellerId, btn) {
  if (!currentUser) { openLoginModal(); return; }
  if (sellerId === currentUser.id) return;
  if (askedAvailableSet.has(bikeId)) { showToast('Du har allerede spurgt om denne cykel'); return; }
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const { error } = await supabase.from('messages').insert({
    bike_id: bikeId, sender_id: currentUser.id, receiver_id: sellerId,
    content: '👋 Er cyklen stadig til salg?',
  });
  if (error) { showToast('❌ Kunne ikke sende besked'); if (btn) { btn.disabled = false; btn.style.opacity = ''; } return; }
  askedAvailableSet.add(bikeId);
  if (btn) { btn.textContent = '✅'; btn.style.opacity = '1'; }
  showToast('✅ Besked sendt til sælgeren!');

  supabase.functions.invoke('notify-message', {
    body: { type: 'message_id', bikeId, senderId: currentUser.id, receiverId: sellerId },
  }).catch(() => {});
}

function toggleNearMe(pill) {
  const isActive = pill.classList.contains('active');
  const radiusSel = document.getElementById('nearme-radius');
  if (isActive) {
    pill.classList.remove('active');
    if (radiusSel) radiusSel.style.display = 'none';
    userGeoCoords = null;
    activeRadius  = null;
    // Fjern afstandstags
    document.querySelectorAll('.nearme-dist').forEach(el => el.remove());
    loadBikes(currentFilters);
    return;
  }
  if (!navigator.geolocation) { showToast('⚠️ GPS er ikke tilgængeligt i din browser'); return; }
  showToast('📍 Henter din position...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      userGeoCoords = [pos.coords.latitude, pos.coords.longitude];
      activeRadius  = parseInt(document.getElementById('nearme-radius').value || 20);
      pill.classList.add('active');
      if (radiusSel) radiusSel.style.display = 'inline-block';
      // Deaktiver andre pills
      document.querySelectorAll('.filters-row .pill.active:not(#pill-nearme)').forEach(p => p.classList.remove('active'));
      applyNearMeFilter();
    },
    () => showToast('❌ Kunne ikke hente din position — tjek GPS-tilladelser')
  );
}

function updateNearMeRadius(val) {
  activeRadius = parseInt(val);
  if (userGeoCoords) applyNearMeFilter();
}

function formatDistance(km) {
  if (km < 1)  return (Math.round(km * 10) / 10).toString().replace('.', ',') + ' km';
  if (km < 10) return (Math.round(km * 10) / 10).toString().replace('.', ',') + ' km';
  return Math.round(km) + ' km';
}

async function applyNearMeFilter() {
  if (!userGeoCoords || !activeRadius) return;
  const grid = document.getElementById('listings-grid');
  const cards = [...grid.querySelectorAll('.bike-card:not(.skeleton-card)')];
  grid.querySelector('.nearme-empty')?.remove();

  cards.forEach(c => c.style.opacity = '0.4');
  showToast('📍 Filtrerer efter afstand...');

  // Hent koordinater for hvert kort — præcis adresse for forhandlere, by for private
  const resolved = await Promise.all(cards.map(async card => {
    const city    = card.dataset.city || card.querySelector('.bike-city')?.textContent.trim() || '';
    const address = card.dataset.address || '';
    const isDealer = card.dataset.sellerType === 'dealer';

    let coords = null;
    let precise = false;
    if (isDealer && address && city) {
      coords = await geocodeAddress(address, city);
      if (coords) precise = true;
    }
    if (!coords && city) {
      coords = await geocodeCity(city);
    }
    if (!coords) return { card, km: null, precise: false };
    const km = haversineKm(userGeoCoords, coords);
    return { card, km, precise };
  }));

  // Filtrér inden for radius og sortér efter afstand
  const within = resolved
    .filter(r => r.km !== null && r.km <= activeRadius)
    .sort((a, b) => a.km - b.km);
  const outside = resolved.filter(r => r.km === null || r.km > activeRadius);

  // Skjul dem uden for radius
  outside.forEach(({ card }) => { card.style.display = 'none'; });

  // Vis + opdatér distance-tag på dem inden for radius
  within.forEach(({ card, km, precise }) => {
    card.style.display = '';
    card.style.opacity = '';
    let distTag = card.querySelector('.nearme-dist');
    if (!distTag) {
      distTag = document.createElement('span');
      distTag.className = 'nearme-dist';
      card.querySelector('.bike-card-img')?.appendChild(distTag);
    }
    distTag.textContent = (precise ? '' : '~') + formatDistance(km);
    distTag.title = precise ? 'Præcis afstand (forhandler-adresse)' : 'Ca. afstand (by-center)';
  });

  // Reordne DOM så nærmeste kort vises først
  within.forEach(({ card }) => grid.appendChild(card));

  if (within.length === 0) {
    const el = document.createElement('div');
    el.className = 'nearme-empty empty-state-box';
    el.innerHTML = `<div class="empty-state-icon">📍</div><h3 class="empty-state-title">Ingen cykler inden for ${activeRadius} km</h3><p class="empty-state-sub">Prøv en større radius</p>`;
    grid.appendChild(el);
  }
  showToast(`📍 ${within.length} ${within.length === 1 ? 'cykel' : 'cykler'} inden for ${activeRadius} km`);
}

function sortBikes(value) {
  const grid  = document.getElementById('listings-grid');
  const cards = [...grid.querySelectorAll('.bike-card')];
  cards.sort((a, b) => {
    const pA = parseInt(a.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    const pB = parseInt(b.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    if (value === 'price_asc')  return pA - pB;
    if (value === 'price_desc') return pB - pA;
    return 0;
  });
  cards.forEach(c => grid.appendChild(c));
}

/* ============================================================
   FILTER TÆLLER
   ============================================================ */

async function updateFilterCounts(data, dealerCount) {
  if (!data) {
    const [bikesRes, dealerRes] = await Promise.all([
      supabase.from('bikes').select('type, condition, wheel_size, profiles(seller_type)').eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('seller_type', 'dealer').eq('verified', true)
    ]);
    if (bikesRes.error || !bikesRes.data) {
      const { data: fallback } = await supabase.from('bikes').select('type, condition, profiles(seller_type)').eq('is_active', true);
      if (!fallback) return;
      data = fallback;
    } else {
      data = bikesRes.data;
    }
    dealerCount = dealerRes?.count ?? null;
  }

  const total    = data.length;
  const dealers  = data.filter(b => b.profiles?.seller_type === 'dealer').length;
  const privates = data.filter(b => b.profiles?.seller_type !== 'dealer').length;

  setCount('seller', 'all',           total);
  setCount('seller', 'dealer',        dealers);
  setCount('seller', 'private',       privates);
  setCount('type',   'Racercykel',    data.filter(b => b.type === 'Racercykel').length);
  setCount('type',   'Mountainbike',  data.filter(b => b.type === 'Mountainbike').length);
  setCount('type',   'El-cykel',      data.filter(b => b.type === 'El-cykel').length);
  setCount('type',   'Citybike',      data.filter(b => b.type === 'Citybike').length);
  setCount('type',   'Ladcykel',      data.filter(b => b.type === 'Ladcykel').length);
  setCount('type',   'Børnecykel',    data.filter(b => b.type === 'Børnecykel').length);
  setCount('type',   'Gravel',        data.filter(b => b.type === 'Gravel').length);
  setCount('condition', 'Ny',         data.filter(b => b.condition === 'Ny').length);
  setCount('condition', 'Som ny',     data.filter(b => b.condition === 'Som ny').length);
  setCount('condition', 'God stand',  data.filter(b => b.condition === 'God stand').length);
  setCount('condition', 'Brugt',      data.filter(b => b.condition === 'Brugt').length);
  setCount('wheel',  '26"',           data.filter(b => b.wheel_size === '26"').length);
  setCount('wheel',  '27.5" / 650b',  data.filter(b => b.wheel_size === '27.5" / 650b').length);
  setCount('wheel',  '28"',           data.filter(b => b.wheel_size === '28"').length);
  setCount('wheel',  '29"',           data.filter(b => b.wheel_size === '29"').length);

  const countEl   = document.getElementById('listings-count');
  const statTotal = document.getElementById('stat-total');
  if (countEl)   countEl.textContent   = `${total} cykler til salg`;
  if (statTotal) statTotal.textContent = total > 0 ? total.toLocaleString('da-DK') : '0';

  const statDealers = document.getElementById('stat-dealers');
  if (statDealers && dealerCount != null) statDealers.textContent = dealerCount > 0 ? dealerCount.toLocaleString('da-DK') : '0';
}

function setCount(filterAttr, filterValue, count) {
  document.querySelectorAll(`[data-filter="${filterAttr}"]`).forEach(input => {
    if (input.dataset.value !== filterValue) return;
    const countEl = input.closest('.filter-option')?.querySelector('.filter-count');
    if (countEl) countEl.textContent = count > 0 ? count.toLocaleString('da-DK') : '0';
  });
}

/* ============================================================
   GEM / FJERN ANNONCE
   ============================================================ */

async function toggleSave(btn, bikeId) {
  if (!currentUser) { showToast('⚠️ Log ind for at gemme annoncer'); return; }
  const isSaved = btn.textContent === '❤️';
  if (isSaved) {
    const { error } = await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
    if (error) { showToast('❌ Kunne ikke fjerne fra gemte'); return; }
    btn.textContent = '🤍';
    _userSavedSet.delete(bikeId);
    showToast('Fjernet fra gemte');
  } else {
    const { error } = await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
    if (error) { showToast('❌ Kunne ikke gemme annonce'); return; }
    btn.textContent = '❤️';
    _userSavedSet.add(bikeId);
    showToast('❤️ Gemt! Find den under Gemte i din profil.');

    // Send email notification to bike owner (fire-and-forget)
    const { data: bike } = await supabase.from('bikes').select('brand, model, user_id').eq('id', bikeId).single();
    if (bike) {
      supabase.functions.invoke('notify-message', {
        body: {
          type: 'listing_liked',
          bike_id: bikeId,
          bike_brand: bike.brand,
          bike_model: bike.model,
          bike_owner_id: bike.user_id,
          liker_id: currentUser.id,
          liker_name: currentProfile?.name || 'En bruger',
        },
      }).catch(() => {});
    }
  }
}

/* ============================================================
   FILTER PILLS
   ============================================================ */

function togglePill(el) {
  document.querySelectorAll('.pill').forEach(p => {
    p.classList.remove('active');
    p.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('active');
  el.setAttribute('aria-pressed', 'true');
  const text = el.textContent.trim();
  if      (text === 'Alle')            loadBikes();
  else if (text === 'El-cykler')       loadBikes({ type: 'El-cykel' });
  else if (text === 'Kun forhandlere') loadBikes({ sellerType: 'dealer' });
  else if (text === 'Kun private')     loadBikes({ sellerType: 'private' });
  else if (text === 'Under 3.000 kr') loadBikes({ maxPrice: 3000 });
  else if (text === 'Med garanti')     loadBikes({ warranty: true });
  else if (text === 'Ny annonce')      loadBikes({ newOnly: true });
}

// Keyboard-aktivering af filterpills (Enter/Space)
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePill(pill);
    }
  });
});

/* ============================================================
   OPRET ANNONCE MODAL
   ============================================================ */

function openModal() {
  if (!currentUser) { openLoginModal(); showToast('⚠️ Log ind for at oprette en annonce'); return; }
  navigateTo('/sell');
}

function _openModalLegacy() {
  const isDealer = currentProfile?.seller_type === 'dealer';

  // Vis kun den relevante selger-type knap baseret på brugerens profil
  document.getElementById('type-private').style.display = !isDealer ? '' : 'none';
  document.getElementById('type-dealer').style.display  = isDealer  ? '' : 'none';

  // Skjul "Hvem sælger du som?"-toggle helt for privatpersoner (kun én mulighed)
  const sellerToggleLabel = document.querySelector('.modal-seller-label');
  const sellerToggle      = document.querySelector('.seller-toggle');
  if (sellerToggleLabel) sellerToggleLabel.style.display = isDealer ? '' : 'none';
  if (sellerToggle)      sellerToggle.style.display      = isDealer ? '' : 'none';

  selectType(isDealer ? 'dealer' : 'private');
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  enableFocusTrap('modal');

  // Tilknyt prisforslag-listener til type-select
  const modalEl = document.getElementById('modal');
  const typeSelect = modalEl.querySelectorAll('select')[0];
  if (typeSelect && !typeSelect._priceSuggestBound) {
    typeSelect._priceSuggestBound = true;
    typeSelect.addEventListener('change', () => updatePriceSuggestion(typeSelect.value));
  }
}

async function updatePriceSuggestion(bikeType) {
  const wrap = document.getElementById('price-suggestion');
  if (!wrap || !bikeType) { if (wrap) wrap.style.display = 'none'; return; }

  const { data } = await supabase
    .from('bikes')
    .select('price')
    .eq('type', bikeType)
    .eq('is_active', true)
    .limit(50);

  if (!data || data.length < 3) { wrap.style.display = 'none'; return; }

  const prices = data.map(b => b.price).sort((a, b) => a - b);
  const avg    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const low    = prices[Math.floor(prices.length * 0.25)];
  const high   = prices[Math.floor(prices.length * 0.75)];

  wrap.innerHTML = `💡 Andre ${esc(bikeType).toLowerCase()}er sælges typisk for <strong>${low.toLocaleString('da-DK')}–${high.toLocaleString('da-DK')} kr.</strong> (gns. ${avg.toLocaleString('da-DK')} kr.)`;
  wrap.style.display = 'block';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
  disableFocusTrap('modal');
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

function selectType(type) {
  const isDealer = type === 'dealer';
  document.getElementById('type-private').classList.toggle('selected', !isDealer);
  document.getElementById('type-dealer').classList.toggle('selected', isDealer);
  document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
}

async function submitListing() {
  if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }
  const restore = btnLoading('submit-listing-btn', 'Opretter...');
  try {

  // Hent felter specifikt fra opret-annonce modalen (#modal)
  const modalEl = document.getElementById('modal');
  const brand   = modalEl.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value.trim();
  const model   = modalEl.querySelector('[placeholder="f.eks. FX 3 Disc"]').value.trim();
  const price   = parseInt(modalEl.querySelector('[placeholder="f.eks. 4500"]').value);
  const year    = parseInt(modalEl.querySelector('[placeholder="f.eks. 2021"]').value) || null;
  const city    = modalEl.querySelector('[placeholder="f.eks. København"]').value.trim();
  const desc    = modalEl.querySelector('textarea').value.trim();
  const selects = modalEl.querySelectorAll('select');
  const type      = selects[0].value;
  const size      = selects[1].value;
  const condition = selects[3].value;

  const wheelSize = document.getElementById('modal-wheel-size')?.value || null;
  const warranty  = document.getElementById('modal-warranty')?.value.trim() || null;

  const bikeData = {
    user_id:     currentUser.id,
    brand, model, price, year, city,
    description: desc,
    type, size, condition,
    wheel_size:  wheelSize || null,
    warranty:    warranty || null,
    title:       `${brand} ${model}`,
    is_active:   true,
  };

  if (!bikeData.brand || !bikeData.model || !bikeData.price || !bikeData.city) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }

  const { data: newBike, error } = await supabase.from('bikes').insert(bikeData).select().single();
  if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); restore(); return; }

  // Upload billeder hvis der er valgt nogle
  if (selectedFiles.length > 0) {
    showToast('⏳ Uploader billeder...');
    await uploadImages(newBike.id);
  }

  closeModal();
  resetImageUpload();
  showToast('✅ Din annonce er oprettet!');
  loadBikes();
  updateFilterCounts();

  // Notificér brugere med matchende gemte søgninger (fire-and-forget)
  supabase.functions.invoke('notify-saved-searches', {
    body: { bike: { id: newBike.id, brand: newBike.brand, model: newBike.model, type: newBike.type, city: newBike.city, price: newBike.price, condition: newBike.condition } },
  }).catch(() => {});
  } finally { restore(); }
}

async function submitSellPage() {
  if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }
  const restore = btnLoading('sell-submit-btn', 'Opretter...');
  try {
    // Read from DOM first, fall back to _sellFormCache (step 2 fields are gone when on step 3)
    const getVal = (id) => (document.getElementById(id)?.value ?? _sellFormCache[id] ?? '').toString().trim();
    const brand     = getVal('sell-brand');
    const model     = getVal('sell-model');
    const price     = parseInt(getVal('sell-price'));
    const year      = parseInt(getVal('sell-year')) || null;
    const city      = getVal('sell-city');
    const desc      = getVal('sell-desc');
    const type      = getVal('sell-type');
    const size      = getVal('sell-size') || null;
    const condition = getVal('sell-condition');
    const wheelSize = getVal('sell-wheel-size') || null;
    const warranty  = getVal('sell-warranty') || null;
    const color     = getVal('sell-color') || null;

    if (!brand || !model || !price || !city || !type || !condition) {
      showToast('⚠️ Udfyld alle påkrævede felter (*)'); restore(); return;
    }

    const bikeData = {
      user_id: currentUser.id,
      brand, model, price, year, city,
      description: desc || null,
      type, size: size || null, condition,
      wheel_size: wheelSize || null,
      warranty: warranty || null,
      color: color || null,
      title: `${brand} ${model}`,
      is_active: true,
    };

    const { data: newBike, error } = await supabase.from('bikes').insert(bikeData).select().single();
    if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); restore(); return; }

    if (selectedFiles.length > 0) {
      showToast('⏳ Uploader billeder...');
      await uploadImages(newBike.id);
    }

    loadBikes();
    updateFilterCounts();

    supabase.functions.invoke('notify-saved-searches', {
      body: { bike: { id: newBike.id, brand: newBike.brand, model: newBike.model, type: newBike.type, city: newBike.city, price: newBike.price, condition: newBike.condition } },
    }).catch(() => {});

    clearSellDraft();
    showListingSuccessModal(newBike);
  } finally {
    restore();
  }
}

/* ============================================================
   LOGIN MODAL
   ============================================================ */

function openLoginModal() {
  document.getElementById('login-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  enableFocusTrap('login-modal');
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
  document.body.style.overflow = '';
  disableFocusTrap('login-modal');
}
document.getElementById('login-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLoginModal();
});

function switchTab(tab) {
  // Fane-knapper kun for login/register
  document.getElementById('tab-login').classList.toggle('selected', tab === 'login');
  document.getElementById('tab-register').classList.toggle('selected', tab === 'register');

  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('form-forgot').style.display   = tab === 'forgot'   ? 'block' : 'none';

  // Opdater modal-titel
  const titles = { login: 'Log ind', register: 'Opret konto', forgot: 'Glemt adgangskode' };
  document.querySelector('#login-modal .modal-header h2').textContent = titles[tab] || 'Log ind';
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('⚠️ Indtast din email'); return; }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://xn--cykelbrsen-5cb.dk/',
  });

  if (error) {
    showToast('❌ Kunne ikke sende link – tjek emailen');
  } else {
    closeLoginModal();
    showToast('✅ Tjek din email for nulstillingslinket');
  }
}

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://xn--cykelbrsen-5cb.dk/' },
  });
}


async function handleLogin() {
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('⚠️ Udfyld email og adgangskode'); return; }
  const restore = btnLoading('login-btn', 'Logger ind...');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('❌ Forkert email eller adgangskode');
    else { closeLoginModal(); showToast('✅ Du er nu logget ind'); }
  } finally { restore(); }
}

async function handleRegister() {
  const name     = document.getElementById('register-name').value;
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  if (!name || !email || !password) { showToast('⚠️ Udfyld alle felter'); return; }
  if (password.length < 6) { showToast('⚠️ Adgangskode skal være mindst 6 tegn'); return; }
  const restore = btnLoading('register-btn', 'Opretter konto...');
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) showToast('❌ ' + error.message);
    else { closeLoginModal(); showToast('✅ Tjek din email for at bekræfte kontoen'); }
  } finally { restore(); }
}

/* ============================================================
   PROFIL MODAL
   ============================================================ */

function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  showProfileData();
  switchProfileTab('info');
  enableFocusTrap('profile-modal');
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('open');
  document.body.style.overflow = '';
  disableFocusTrap('profile-modal');
}
document.getElementById('profile-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeProfileModal();
});

function onSellerTypeChange(select) {
  if (select.value === 'dealer' && currentProfile?.seller_type !== 'dealer') {
    // Nulstil dropdown — forhandleransøgning sker via det officielle flow
    select.value = currentProfile?.seller_type || 'private';
    closeProfileModal();
    navigateTo('/bliv-forhandler');
  }
}

function showProfileData() {
  // Brug den cachede profil — ingen ekstra netværkskald
  const profile = currentProfile || {};
  const name    = profile.name || currentUser?.email?.split('@')[0] || 'Ukendt';
  const initials = name.substring(0, 2).toUpperCase();

  const avatarEl = document.getElementById('profile-big-avatar');
  const _safeAv = safeAvatarUrl(profile.avatar_url);
  if (_safeAv) {
    avatarEl.innerHTML = `<img src="${_safeAv}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatarEl.textContent = initials;
  }
  document.getElementById('profile-display-name').textContent  = name;
  document.getElementById('profile-display-email').textContent = currentUser?.email || '';

  const badge = document.getElementById('profile-type-badge');
  if (profile.seller_type === 'dealer') {
    badge.textContent = '🏪 Forhandler';
    badge.className   = 'badge badge-dealer';
  } else {
    badge.textContent = '👤 Privat';
    badge.className   = 'badge badge-private';
  }

  document.getElementById('edit-name').value        = profile.name || '';
  document.getElementById('edit-phone').value       = profile.phone || '';
  document.getElementById('edit-city').value        = profile.city || '';
  document.getElementById('edit-seller-type').value = profile.seller_type || 'private';
  document.getElementById('edit-shop-name').value   = profile.shop_name || '';
  document.getElementById('edit-address').value     = profile.address || '';
  const bioEl = document.getElementById('edit-bio');
  if (bioEl) bioEl.value = profile.bio || '';

  const shopGroup    = document.getElementById('edit-shop-group');
  const addressGroup = document.getElementById('edit-address-group');
  const isDealer = profile.seller_type === 'dealer';
  shopGroup.style.display    = isDealer ? 'flex' : 'none';
  addressGroup.style.display = isDealer ? 'flex' : 'none';

  // Vis sælgertype som tekst (ikke redigerbar dropdown)
  const sellerDisplay = document.getElementById('edit-seller-type-display');
  if (sellerDisplay) sellerDisplay.textContent = isDealer ? '🏪 Forhandler' : '👤 Privatperson';

  // Vis abonnementsboks kun for forhandlere med aktiv Stripe-kunde
  const subBox = document.getElementById('subscription-box');
  if (subBox) {
    const hasSubscription = isDealer && profile.stripe_customer_id && profile.stripe_subscription_status !== 'canceled';
    subBox.style.display = hasSubscription ? 'block' : 'none';
    if (hasSubscription) {
      const badge  = document.getElementById('subscription-status-badge');
      const status = profile.stripe_subscription_status || 'active';
      const labels = {
        active:     { text: 'Aktivt',    cls: 'sub-status-active'  },
        trialing:   { text: '3 mdr. fri',cls: 'sub-status-trial'   },
        past_due:   { text: 'Forfaldent',cls: 'sub-status-past-due'},
        canceled:   { text: 'Annulleret',cls: 'sub-status-canceled'},
      };
      const { text, cls } = labels[status] || { text: status, cls: 'sub-status-active' };
      if (badge) { badge.textContent = text; badge.className = cls; }
    }
  }

  document.getElementById('edit-seller-type').onchange = function () {
    const dealer = this.value === 'dealer';
    shopGroup.style.display    = dealer ? 'flex' : 'none';
    addressGroup.style.display = dealer ? 'flex' : 'none';
  };
  updateVerifyUI();
}

function switchProfileTab(tab) {
  ['info', 'listings', 'saved', 'searches', 'trades', 'inbox'].forEach(t => {
    document.getElementById(`profile-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`ptab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'listings') loadMyListings();
  if (tab === 'saved')    loadSavedListings();
  if (tab === 'searches') loadSavedSearches();
  if (tab === 'trades')   loadTradeHistory();
  if (tab === 'inbox')    loadInbox();
}

async function saveProfile() {
  if (!currentUser) return;

  const updates = {
    name:        document.getElementById('edit-name').value,
    phone:       document.getElementById('edit-phone').value,
    city:        document.getElementById('edit-city').value,
    seller_type: currentProfile?.seller_type || 'private', // sælgertype ændres kun via forhandler-flow
    shop_name:   document.getElementById('edit-shop-name').value,
    address:     document.getElementById('edit-address').value,
    bio:         (document.getElementById('edit-bio')?.value || '').trim(),
  };

  const restore = btnLoading('save-profile-btn', 'Gemmer...');
  try {
    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    if (error) { showToast('❌ Kunne ikke gemme profil'); return; }

    // Sync ny by til alle brugerens cykelannoncer så kortet opdateres
    if (updates.city && updates.city !== (currentProfile && currentProfile.city)) {
      await supabase.from('bikes').update({ city: updates.city }).eq('user_id', currentUser.id);
    }
    // Ryd DAWA-cache for gammel adresse+by så kortet henter nye koordinater
    var oldAddr = (currentProfile && currentProfile.address || '').toLowerCase().trim();
    var oldCity = (currentProfile && currentProfile.city || '').toLowerCase().trim();
    if (oldAddr && oldCity) {
      var oldDawaKey = 'dawa3:' + oldAddr + ', ' + oldCity;
      delete _geocodeCache[oldDawaKey];
      _saveGeocodeCache();
    }

    // Opdater cache
    currentProfile = { ...currentProfile, ...updates };
    showProfileData();
    updateNavAvatar(updates.name, currentProfile.avatar_url);
    showToast('✅ Profil opdateret!');
  } finally { restore(); }
}

async function uploadAvatar(file) {
  if (!file || !currentUser) return;
  if (file.size > 5 * 1024 * 1024) { showToast('❌ Billedet må maks være 5 MB'); return; }

  const ext  = file.name.split('.').pop();
  const path = `${currentUser.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) { showToast('❌ Kunne ikke uploade billede'); console.error(uploadError); return; }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
  // Tilføj cache-busting så browseren henter det nye billede
  const avatarUrl = publicUrl + '?t=' + Date.now();

  const { error: updateError } = await supabase
    .from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);

  if (updateError) { showToast('❌ Kunne ikke gemme profilbillede'); return; }

  currentProfile = { ...currentProfile, avatar_url: avatarUrl };
  showProfileData();
  updateNavAvatar(currentProfile?.name, avatarUrl);
  showToast('✅ Profilbillede opdateret!');
}

// Reload listings i den rette kontekst (page vs modal)
function reloadMyListings() {
  if (document.getElementById('mp-listings-grid')) loadMyListings('mp-listings-grid');
  else loadMyListings();
}

async function loadMyListings(containerId = 'my-listings-grid') {
  if (!currentUser) return;
  const grid = document.getElementById(containerId);
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('bikes')
      .select('*, bike_images(url, is_primary)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false }));
  } catch (e) {
    grid.innerHTML = retryHTML('Kunne ikke hente annoncer.', 'loadMyListings');
    return;
  }

  // Opdatér annonce-tæller i stats-boksen (kun på #/me page)
  const statEl = document.getElementById('mp-stat-listings');
  if (statEl) statEl.textContent = data ? data.filter(b => b.is_active).length : 0;

  if (error || !data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state-box">
      <div class="empty-state-icon">🚲</div>
      <h3 class="empty-state-title">Ingen annoncer endnu</h3>
      <p class="empty-state-sub">Sæt din første cykel til salg — det tager under 2 minutter.</p>
      <button class="empty-state-cta" onclick="openModal()">+ Sæt til salg</button>
    </div>`;
    return;
  }

  // Brug marketplace-kortlayout på page, simpelt row-layout i modal
  const isPage = containerId === 'mp-listings-grid';

  try {
    grid.innerHTML = data.map(b => {
      const isSold = !b.is_active;
      const views  = b.views || 0;
      const daysOld = b.created_at ? Math.floor((Date.now() - new Date(b.created_at)) / 86400000) : 0;
      const isOld  = !isSold && daysOld >= 30;

      if (isPage) {
        const imgUrl = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url || '';
        const thumb  = imgUrl
          ? `<img src="${imgUrl}" alt="" class="mp-listing-thumb" loading="lazy">`
          : `<div class="mp-listing-thumb mp-listing-thumb--empty">🚲</div>`;
        return `
          <div class="mp-listing-card${isSold ? ' mp-listing-card--sold' : ''}">
            <div class="mp-listing-img" onclick="navigateTo('/bike/${b.id}')" title="Se annonce">${thumb}</div>
            <div class="mp-listing-body" onclick="navigateTo('/bike/${b.id}')" title="Se annonce">
              <div class="mp-listing-title">${esc(b.brand)} ${esc(b.model)}${isSold ? ' <span class="mp-sold-tag">SOLGT</span>' : ''}${isOld ? ` <span class="mp-old-tag" title="Annoncen er ${daysOld} dage gammel — overvej at opdatere prisen">⚠️ ${daysOld}d</span>` : ''}</div>
              <div class="mp-listing-meta">${esc(b.type)} · ${esc(b.city)} · ${esc(b.condition)}</div>
              <div class="mp-listing-views">👁 ${views.toLocaleString('da-DK')} visninger</div>
            </div>
            <div class="mp-listing-aside">
              <div class="mp-listing-price">${(b.price || 0).toLocaleString('da-DK')} kr.</div>
              <div class="mp-listing-actions">
                <button class="mp-btn-edit"   onclick="openEditModal('${b.id}')">✏️ Redigér</button>
                ${!isSold
                  ? `<button class="mp-btn-sold"   onclick="toggleSold('${b.id}', false)">Sæt solgt</button>`
                  : `<button class="mp-btn-unsold" onclick="toggleSold('${b.id}', true)">Genaktiver</button>`}
                <button class="mp-btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
              </div>
            </div>
          </div>`;
      }

      // Modal-layout (kompakt)
      return `<div class="my-listing-row" style="${isSold ? 'opacity:0.65' : ''}">
        <div class="my-listing-info">
          <div class="my-listing-title">${esc(b.brand)} ${esc(b.model)} ${isSold ? '<span style="background:var(--charcoal);color:#fff;font-size:.68rem;padding:2px 7px;border-radius:4px;vertical-align:middle;">SOLGT</span>' : ''}</div>
          <div class="my-listing-meta">${esc(b.type)} · ${esc(b.city)} · ${esc(b.condition)}</div>
          <div class="my-listing-views">👁 ${views.toLocaleString('da-DK')} visninger</div>
        </div>
        <div class="my-listing-price">${(b.price || 0).toLocaleString('da-DK')} kr.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${!isSold ? `<button class="btn-sold" onclick="toggleSold('${b.id}', false)">Sæt solgt</button>` : `<button class="btn-unsold" onclick="toggleSold('${b.id}', true)">Genaktiver</button>`}
          <button class="btn-edit" onclick="openEditModal('${b.id}')">✏️</button>
          <button class="btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
        </div>
      </div>`;
    }).join('');
  } catch (renderErr) {
    console.error('Fejl ved rendering af mine annoncer:', renderErr);
    grid.innerHTML = retryHTML('Kunne ikke vise annoncer.', 'loadMyListings');
  }
}

async function deleteListing(id) {
  if (!confirm('Er du sikker på at du vil slette denne annonce?')) return;
  const { error } = await supabase.from('bikes').delete().eq('id', id);
  if (error) { showToast('❌ Kunne ikke slette annonce'); return; }
  showToast('🗑️ Annonce slettet');
  reloadMyListings();
  loadBikes();
  updateFilterCounts();
}

async function loadSavedListings(containerId = 'my-saved-grid') {
  if (!currentUser) return;
  const grid = document.getElementById(containerId);
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('saved_bikes')
      .select('bike_id, bikes(brand, model, price, type, city, condition, is_active, bike_images(url, is_primary))')
      .eq('user_id', currentUser.id));
  } catch (e) {
    grid.innerHTML = retryHTML('Kunne ikke hente gemte annoncer.', 'loadSavedListings');
    return;
  }
  const savedStat = document.getElementById('mp-stat-saved');
  if (savedStat) savedStat.textContent = data ? data.length : 0;

  if (error || !data || data.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted)">Du har ikke gemt nogen annoncer endnu.</p>';
    return;
  }

  grid.className = 'saved-cards-grid';
  grid.innerHTML = data.map(s => {
    const b = s.bikes;
    if (!b) return '';
    const imgs    = b.bike_images || [];
    const primary = imgs.find(i => i.is_primary) || imgs[0];
    const imgHtml = primary
      ? `<img src="${primary.url}" alt="${esc(b.brand)} ${esc(b.model)}" class="saved-card-img" loading="lazy">`
      : `<div class="saved-card-img-placeholder">🚲</div>`;
    const isSold = b.is_active === false;
    return `
      <div class="saved-card${isSold ? ' saved-card--sold' : ''}" onclick="navigateToBike('${s.bike_id}')">
        <div class="saved-card-thumb">
          ${imgHtml}
          ${isSold ? '<span class="saved-card-sold-badge">Solgt</span>' : ''}
          <button class="saved-card-remove" onclick="event.stopPropagation();removeSaved('${s.bike_id}',this)" title="Fjern fra gemte">♡</button>
        </div>
        <div class="saved-card-body">
          <div class="saved-card-title">${esc(b.brand)} ${esc(b.model)}</div>
          <div class="saved-card-meta">${esc(b.type)} · ${esc(b.city)}</div>
          <div class="saved-card-price">${b.price ? b.price.toLocaleString('da-DK') + ' kr.' : '–'}</div>
        </div>
      </div>`;
  }).join('');
}

async function removeSaved(bikeId, btn) {
  if (!currentUser) return;
  const { error } = await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
  if (error) { showToast('❌ Kunne ikke fjerne annonce'); return; }
  showToast('Fjernet fra gemte');
  const card = btn.closest('.saved-card');
  if (card) card.remove();
  const grid = document.getElementById('mp-saved-grid') || document.getElementById('my-saved-grid');
  if (grid && !grid.querySelector('.saved-card')) {
    grid.innerHTML = '<p style="color:var(--muted)">Du har ikke gemt nogen annoncer endnu.</p>';
  }
}

/* ============================================================
   GEMTE SØGNINGER
   ============================================================ */

async function saveCurrentSearch() {
  if (!currentUser) { showToast('⚠️ Log ind for at gemme søgninger'); return; }

  const search = document.getElementById('search-input').value.trim();
  const type   = document.getElementById('search-type').value;
  const city   = document.getElementById('search-city').value;

  // Include sidebar filter state
  const fa = currentFilterArgs || {};
  const hasFilters = search || type || city
    || (fa.types?.length > 0)
    || (fa.conditions?.length > 0)
    || fa.minPrice || fa.maxPrice
    || fa.sellerType
    || (fa.wheelSizes?.length > 0);

  if (!hasFilters) { showToast('⚠️ Ingen aktive filtre at gemme'); return; }

  // Build a readable name from all active filters
  const parts = [];
  if (search)                    parts.push(search);
  if (type)                      parts.push(type);
  if (fa.types?.length)          parts.push(...fa.types);
  if (fa.sellerType === 'dealer')  parts.push('Forhandlere');
  if (fa.sellerType === 'private') parts.push('Private');
  if (fa.conditions?.length)     parts.push(...fa.conditions);
  if (fa.minPrice)               parts.push(`over ${fa.minPrice.toLocaleString('da-DK')} kr.`);
  if (fa.maxPrice)               parts.push(`under ${fa.maxPrice.toLocaleString('da-DK')} kr.`);
  if (city)                      parts.push(city);
  const name = parts.join(' · ') || 'Min søgning';

  const { error } = await supabase.from('saved_searches').insert({
    user_id: currentUser.id,
    name,
    filters: { search, type, city, ...fa },
  });

  if (error) { showToast('❌ Kunne ikke gemme søgning'); return; }
  showToast('🔔 Søgning gemt! Du finder den under "Søgninger" i din profil.');

  const btn = document.getElementById('save-search-btn');
  if (btn) { btn.style.color = 'var(--rust)'; btn.style.borderColor = 'var(--rust)'; setTimeout(() => { btn.style.color = ''; btn.style.borderColor = ''; }, 2000); }
}

async function loadSavedSearches(containerId = 'my-searches-list') {
  if (!currentUser) return;
  const list = document.getElementById(containerId);
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false }));
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente gemte søgninger.', 'loadSavedSearches');
    return;
  }

  if (error) { list.innerHTML = retryHTML('Kunne ikke hente gemte søgninger.', 'loadSavedSearches'); return; }
  if (!data || data.length === 0) {
    list.innerHTML = `<p style="color:var(--muted)">Ingen gemte søgninger endnu. Brug 🔔 knappen ved søgefeltet for at gemme en søgning.</p>`;
    return;
  }

  list.innerHTML = data.map(s => {
    const f = s.filters || {};
    const tags = [f.search, f.type, f.city].filter(Boolean).map(t =>
      `<span style="background:var(--border);border-radius:4px;padding:2px 8px;font-size:0.75rem;">${esc(t)}</span>`
    ).join(' ');
    return `
      <div class="my-listing-row">
        <div class="my-listing-info" style="cursor:pointer;" onclick="applySavedSearch('${s.id}')">
          <div class="my-listing-title">${esc(s.name)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${tags}</div>
          <div class="my-listing-meta" style="margin-top:4px;">${new Date(s.created_at).toLocaleDateString('da-DK', { day:'numeric', month:'short', year:'numeric' })}</div>
        </div>
        <button class="btn-delete" onclick="deleteSavedSearch('${s.id}', this)" title="Slet søgning">🗑️</button>
      </div>`;
  }).join('');
}

async function applySavedSearch(searchId) {
  const { data } = await supabase.from('saved_searches').select('filters').eq('id', searchId).single();
  if (!data) return;
  const f = data.filters || {};

  // Udfyld søgefelter
  const inp  = document.getElementById('search-input');
  const type = document.getElementById('search-type');
  const city = document.getElementById('search-city');
  if (inp)  inp.value  = f.search || '';
  if (type) type.value = f.type   || '';
  if (city) city.value = f.city   || '';

  // Luk profil-modal og søg
  closeProfileModal();
  searchBikes();
  showToast('🔍 Søgning genaktiveret');
}

async function deleteSavedSearch(id, btn) {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { showToast('❌ Kunne ikke slette søgning'); return; }
  btn.closest('.my-listing-row').remove();
  showToast('Søgning slettet');
  const list = document.getElementById('my-searches-list');
  if (list && !list.querySelector('.my-listing-row')) {
    list.innerHTML = `<p style="color:var(--muted)">Ingen gemte søgninger endnu.</p>`;
  }
}

/* ============================================================
   HANDELSHISTORIK
   ============================================================ */

async function loadTradeHistory(containerId = 'trade-history-list') {
  if (!currentUser) return;
  const list = document.getElementById(containerId);

  try {
    // Find alle beskeder med "accepteret" der involverer den aktuelle bruger
    const { data: tradeMessages, error } = await supabase
      .from('messages')
      .select('id, bike_id, sender_id, receiver_id, content, created_at')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .ilike('content', '%accepteret%')
      .order('created_at', { ascending: false });

    if (error) { list.innerHTML = retryHTML('Kunne ikke hente handelshistorik.', 'loadTradeHistory'); return; }
    const tradesStat = document.getElementById('mp-stat-trades');
    if (tradesStat) tradesStat.textContent = tradeMessages ? new Set(tradeMessages.map(m => m.bike_id)).size : 0;
    if (!tradeMessages || tradeMessages.length === 0) {
      list.innerHTML = '<p style="color:var(--muted)">Ingen gennemførte handler endnu.</p>';
      return;
    }

    // Dedupliker pr. bike_id (kun nyeste trade-besked pr. cykel)
    const seen = new Set();
    const uniqueTrades = tradeMessages.filter(m => {
      if (seen.has(m.bike_id)) return false;
      seen.add(m.bike_id);
      return true;
    });

    // Hent bike-info og modparts profil
    const bikeIds  = uniqueTrades.map(m => m.bike_id);
    const otherIds = uniqueTrades.map(m => m.sender_id === currentUser.id ? m.receiver_id : m.sender_id);

    const [bikesRes, profilesRes] = await Promise.all([
      supabase.from('bikes').select('id, brand, model, price, type, bike_images(url, is_primary)').in('id', bikeIds),
      supabase.from('profiles').select('id, name, shop_name, seller_type').in('id', [...new Set(otherIds)]),
    ]);

    const bikesMap    = {};
    const profilesMap = {};
    (bikesRes.data || []).forEach(b => bikesMap[b.id] = b);
    (profilesRes.data || []).forEach(p => profilesMap[p.id] = p);

    list.innerHTML = uniqueTrades.map(trade => {
      const bike     = bikesMap[trade.bike_id] || {};
      const otherId  = trade.sender_id === currentUser.id ? trade.receiver_id : trade.sender_id;
      const other    = profilesMap[otherId] || {};
      const otherName = other.seller_type === 'dealer' ? other.shop_name : other.name;
      const isSeller  = trade.sender_id === currentUser.id;
      const date       = new Date(trade.created_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
      const img        = bike.bike_images?.find(i => i.is_primary)?.url || bike.bike_images?.[0]?.url;

      return `
        <div class="trade-row">
          <div class="trade-img" onclick="openBikeModal('${trade.bike_id}')">
            ${img ? `<img src="${img}" alt="" loading="lazy">` : '<span style="font-size:1.5rem">🚲</span>'}
          </div>
          <div class="trade-info">
            <div class="trade-title">${esc(bike.brand || '')} ${esc(bike.model || '')}</div>
            <div class="trade-meta">${isSeller ? 'Solgt til' : 'Købt fra'} <strong onclick="navigateToProfile('${otherId}')" style="cursor:pointer;color:var(--rust);">${esc(otherName || 'Ukendt')}</strong></div>
            <div class="trade-date">${date}</div>
          </div>
          <div class="trade-price">${bike.price ? bike.price.toLocaleString('da-DK') + ' kr.' : ''}</div>
          <span class="trade-status">✅ Gennemført</span>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('loadTradeHistory fejl:', e);
    list.innerHTML = retryHTML('Kunne ikke hente handelshistorik.', 'loadTradeHistory');
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */

async function logout() {
  // Forsøg signOut men vent max 3 sekunder
  await Promise.race([
    supabase.auth.signOut().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
  // Ryd al Supabase session-data uanset hvad
  Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
  Object.keys(sessionStorage).filter(k => k.startsWith('sb-')).forEach(k => sessionStorage.removeItem(k));
  window.location.href = window.location.pathname;
}

function deleteAccount() {
  if (!currentUser) return;
  const modal = document.getElementById('delete-account-modal');
  const input = document.getElementById('delete-confirm-input');
  input.value = '';
  onDeleteConfirmInput();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => input.focus(), 100);
}

function closeDeleteAccountModal() {
  document.getElementById('delete-account-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function onDeleteConfirmInput() {
  const val = document.getElementById('delete-confirm-input').value.trim().toLowerCase();
  const btn = document.getElementById('delete-account-confirm-btn');
  const active = val === 'slet';
  btn.disabled = !active;
  btn.style.background = active ? '#c0392b' : '#e0e0e0';
  btn.style.color       = active ? '#fff'    : '#aaa';
  btn.style.cursor      = active ? 'pointer' : 'not-allowed';
}

async function confirmDeleteAccount() {
  if (!currentUser) return;
  const btn = document.getElementById('delete-account-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Sletter...';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Ikke logget ind');
    const { error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;

    currentUser    = null;
    currentProfile = null;
    closeDeleteAccountModal();
    closeProfileModal();
    var adminBtn = document.getElementById('nav-admin');
    if (adminBtn) adminBtn.style.display = 'none';
    updateNav(false);
    showToast('Din konto er slettet');
  } catch (err) {
    console.error('Sletning fejlede:', err);
    btn.disabled = false;
    btn.textContent = 'Slet konto';
    showToast('Noget gik galt – prøv igen');
  }
}

/* ============================================================
   TOAST & NAVIGATION SCROLL
   ============================================================ */

function retryHTML(msg, fn) {
  return `<p style="color:var(--rust)">${msg} <button onclick="${fn}()" style="background:none;border:none;color:var(--rust);text-decoration:underline;cursor:pointer;">Prøv igen</button></p>`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function showOnboardingBanner() {
  const existing = document.getElementById('onboarding-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'onboarding-banner';
  banner.innerHTML = `
    <div class="onboarding-content">
      <button class="onboarding-close" onclick="dismissOnboarding()">✕</button>
      <div class="onboarding-icon">🚲</div>
      <h3 class="onboarding-title">Velkommen til Cykelbørsen!</h3>
      <p class="onboarding-sub">Hvad vil du gøre?</p>
      <div class="onboarding-actions">
        <button class="onboarding-btn onboarding-btn--primary" onclick="dismissOnboarding();openModal()">+ Sæt cykel til salg</button>
        <button class="onboarding-btn" onclick="dismissOnboarding();document.getElementById('search-input')?.focus();">Søg efter cykler</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('onboarding-visible'));
}

async function checkSavedSearchNotifications() {
  if (!currentUser) return;
  const key = `ss_checked_${currentUser.id}`;
  const lastChecked = localStorage.getItem(key) || new Date(0).toISOString();

  const { data: searches } = await supabase
    .from('saved_searches').select('id, name, filters').eq('user_id', currentUser.id);
  if (!searches?.length) return;

  // Tjek om der er nye annoncer siden sidst checked
  const { count } = await supabase.from('bikes')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .gt('created_at', lastChecked);

  localStorage.setItem(key, new Date().toISOString());
  if (!count || count === 0) return;

  // Find søgninger der matcher
  const matchingSearches = searches.filter(s => s.filters && (s.filters.search || s.filters.type || s.filters.city));
  if (!matchingSearches.length) return;

  // Vis notifikation
  const banner = document.createElement('div');
  banner.id = 'ss-notification';
  banner.innerHTML = `
    <div class="ss-notif-content">
      <span class="ss-notif-icon">🔔</span>
      <span class="ss-notif-text">${count} nye cykler siden dit sidste besøg — <a onclick="navigateToMyProfile();setTimeout(()=>switchMyProfileTab('searches'),400)" style="color:var(--forest);font-weight:600;cursor:pointer;">Tjek dine søgninger →</a></span>
      <button onclick="this.closest('#ss-notification').remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--muted);padding:4px;">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('ss-notif-visible'), 100);
  setTimeout(() => { banner.classList.remove('ss-notif-visible'); setTimeout(() => banner.remove(), 400); }, 8000);
}

function useQuickReply(textareaId, btn) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  ta.value = btn.textContent.replace(/\s*👍$/, ' 👍').trim();
  ta.focus();
}

function dismissOnboarding() {
  localStorage.setItem('onboarded', '1');
  const banner = document.getElementById('onboarding-banner');
  if (!banner) return;
  banner.classList.remove('onboarding-visible');
  setTimeout(() => banner.remove(), 300);
}

function showSection(section) {
  const onDetailPage = document.getElementById('page-layout')?.style.display !== 'none';
  if (onDetailPage) {
    navigateTo('/');
    return;
  }
  document.querySelector('.main')?.scrollIntoView({ behavior: 'smooth' });
}


/* ============================================================
   ANNONCE DETALJE — FÆLLES FETCH + HTML BUILDER
   ============================================================ */

async function fetchBikeById(bikeId) {
  if (bikeCache.has(bikeId)) {
    return { data: bikeCache.get(bikeId), error: null };
  }
  const fetchPromise = supabase
    .from('bikes')
    .select('*, profiles(id, name, seller_type, shop_name, phone, city, verified, id_verified, email_verified), bike_images(url, is_primary)')
    .eq('id', bikeId)
    .single();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: annonceforespørgsel tog for lang tid')), 15000));
  const result = await Promise.race([fetchPromise, timeoutPromise]);
  if (result.data && !result.error) {
    bikeCache.set(bikeId, result.data);
  }
  return result;
}

function buildBikeBodyHTML(b) {
  const profile    = b.profiles || {};
  const sellerType = profile.seller_type || 'private';
  const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
  const initials   = (sellerName || 'U').substring(0, 2).toUpperCase();
  const isOwner    = currentUser && currentUser.id === profile.id;

  // Sorter billeder: primærbillede først
  const allImages = (b.bike_images || []).slice().sort((a, x) => (x.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
  window._galleryImages = allImages.map(img => img.url);
  window._galleryIndex  = 0;

  let galleryHtml;
  if (allImages.length === 0) {
    galleryHtml = `<div class="bike-detail-img"><span style="font-size:4rem">🚲</span></div>`;
  } else if (allImages.length === 1) {
    galleryHtml = `<div class="bike-detail-img" style="cursor:zoom-in;" onclick="openLightbox(0)"><img src="${allImages[0].url}" alt="${b.brand} ${b.model}" loading="lazy"></div>`;
  } else {
    const maxThumbs = 5;
    const visibleImages = allImages.slice(0, maxThumbs);
    const extraCount = allImages.length > maxThumbs ? allImages.length - maxThumbs : 0;
    const thumbsHtml = visibleImages.map((img, i) => {
      const isLast = extraCount > 0 && i === maxThumbs - 1;
      return `<button class="gallery-thumb${i === 0 ? ' active' : ''}" onclick="galleryGoto(${i})" aria-label="Billede ${i + 1}" style="position:relative;">
        <img src="${img.url}" alt="Billede ${i + 1}" loading="lazy">
        ${isLast ? `<span style="position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;font-family:'DM Sans',sans-serif;border-radius:5px;">+${extraCount}</span>` : ''}
      </button>`;
    }).join('');
    galleryHtml = `
      <div class="bike-gallery">
        <div class="gallery-main">
          <div class="gallery-main-bg" id="gallery-main-bg" style="background-image:url('${allImages[0].url}')"></div>
          <img id="gallery-main-img" src="${allImages[0].url}" alt="${b.brand} ${b.model}" onclick="openLightbox(window._galleryIndex || 0)">
          <button class="gallery-nav-btn gallery-prev" onclick="galleryNav(-1)" aria-label="Forrige billede">&#8249;</button>
          <button class="gallery-nav-btn gallery-next" onclick="galleryNav(1)" aria-label="Næste billede">&#8250;</button>
          <span class="gallery-counter" id="gallery-counter">1 / ${allImages.length}</span>
        </div>
        <div class="gallery-thumbs">${thumbsHtml}</div>
      </div>`;
  }

  return {
    html: `
    <div class="bike-detail-grid">
      <div>
        ${galleryHtml}
      </div>
      <div class="bike-detail-info">
        <div class="bike-detail-price">${b.price.toLocaleString('da-DK')} kr.</div>
        <div class="bike-detail-tags">
          <span class="detail-tag">${b.type}</span>
          ${b.year ? `<span class="detail-tag">${b.year}</span>` : ''}
          ${b.size ? `<span class="detail-tag">Str. ${b.size}</span>` : ''}
          ${b.condition ? `<span class="detail-tag">${b.condition}</span>` : ''}
          ${b.color ? `<span class="detail-tag">🎨 ${esc(b.color)}</span>` : ''}
          ${b.city ? `<span class="detail-tag">📍 ${b.city}</span>` : ''}
          ${b.warranty ? `<span class="detail-tag" style="background:#e8f5e9;color:#2e7d32;">🛡️ ${esc(b.warranty)}</span>` : ''}
        </div>
        ${b.description ? `<p style="font-size:0.85rem;color:var(--muted);margin:10px 0 0;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(b.description)}</p>` : ''}
        <div class="bike-detail-seller" onclick="navigateToProfile('${profile.id}')" style="cursor:pointer;" title="Se sælgers profil">
          <div class="seller-avatar-large">${initials}</div>
          <div style="flex:1">
            <div class="seller-detail-name">${sellerName || 'Ukendt'}${profile.verified ? ' <span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}${profile.email_verified ? ' <span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}</div>
            <div class="seller-detail-city">${profile.city || ''}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">
              <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
              </span>
              <span id="response-time-badge" style="font-size:0.75rem;color:var(--muted);">⏱ Henter responstid...</span>
            </div>
          </div>
          <div style="color:var(--muted);font-size:0.8rem;align-self:center;">Se profil →</div>
        </div>
        ${!isOwner ? `
        <div class="action-buttons">
          <button class="btn-bid" onclick="toggleBidBox()">💰 Giv et bud</button>
          <div class="bid-box" id="bid-box">
            <div class="bid-box-inner">
              <input type="number" id="bid-amount" placeholder="Dit bud i kr." oninput="updateMeetMiddle(${b.price})">
              <button onclick="sendBid('${b.id}', '${profile.id}')">Send bud</button>
            </div>
            <div class="meet-middle" id="meet-middle" style="display:none">
              Mød i midten: <strong id="meet-middle-price"></strong>
              <button class="meet-middle-btn" onclick="useMeetMiddle()">Brug dette bud</button>
            </div>
          </div>
          <button class="btn-contact" onclick="toggleMessageBox()">✉️ Kontakt sælger</button>
          <div class="message-box" id="message-box">
            <textarea id="message-text" placeholder="Skriv en besked til sælgeren..."></textarea>
            <button onclick="sendMessage('${b.id}', '${profile.id}')">Send besked</button>
          </div>
          <button class="btn-save-listing" onclick="toggleSaveFromModal(this, '${b.id}')">🤍 Gem annonce</button>
          <button class="btn-save-listing" onclick="event.stopPropagation();openShareModal('${b.id}', '${b.brand} ${b.model}')">🔗 Del annonce</button>
          <button class="btn-report-listing" onclick="openReportModal('${b.id}', '${b.brand} ${b.model}')">🚩 Rapporter annonce</button>
        </div>
        ` : `<p style="color:var(--muted);font-size:.85rem">Dette er din egen annonce.</p>`}
      </div>
    </div>
    ${b.description ? `
    <div style="margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1rem;margin-bottom:10px;">Beskrivelse</h3>
      <div class="bike-detail-description">${esc(b.description).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
    <div id="seller-other-listings" style="margin-top:28px;"></div>
    <div id="similar-listings" style="margin-top:24px;"></div>
    ${!isOwner ? `
    <div class="bike-sticky-bar" id="bike-sticky-bar">
      <div class="bike-sticky-price">${b.price.toLocaleString('da-DK')} kr.</div>
      <div class="bike-sticky-actions">
        <button class="bike-sticky-contact" onclick="stickyBarAction('msg')" aria-label="Kontakt sælger">✉️ Kontakt</button>
        <button class="bike-sticky-bid" onclick="stickyBarAction('bid')" aria-label="Giv bud">💰 Giv bud</button>
      </div>
    </div>` : ''}
  `,
    profile,
    allImages,
  };
}

/* ============================================================
   ANNONCE DETALJE MODAL
   ============================================================ */

async function openBikeModal(bikeId) {
  const myToken = ++_bikeModalToken;
  closeAllModals();
  document.getElementById('bike-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('bike-modal-body').innerHTML = '<p style="color:var(--muted)">Indlæser...</p>';
  document.getElementById('bike-modal-title').textContent = '';

  let b, error;
  try {
    ({ data: b, error } = await fetchBikeById(bikeId));
  } catch (e) {
    error = e;
    console.error('openBikeModal fetch error:', e.message);
  }

  if (myToken !== _bikeModalToken) return;

  // Tæl visning (fire-and-forget, kun ikke-ejere)
  if (b && (!currentUser || currentUser.id !== b.user_id)) {
    supabase.rpc('increment_bike_views', { bike_id: bikeId }).then(null, () => {});
  }

  if (error || !b) {
    document.getElementById('bike-modal-body').innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <p style="color:var(--rust);margin-bottom:16px;">Kunne ikke hente annonce – tjek din internetforbindelse.</p>
        <button onclick="openBikeModal('${bikeId}')" style="background:var(--rust);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:0.9rem;">Prøv igen</button>
      </div>`;
    return;
  }

  try {
    const { html, profile, allImages } = buildBikeBodyHTML(b);
    document.getElementById('bike-modal-title').textContent = `${b.brand} ${b.model}`;

    // Dynamisk SEO: opdater document.title og OG-tags
    const _origTitle = document.title;
    document.title = `${b.brand} ${b.model} – ${b.price.toLocaleString('da-DK')} kr. | Cykelbørsen`;
    const _setMeta = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    _setMeta('og:title', `${b.brand} ${b.model} – ${b.price.toLocaleString('da-DK')} kr.`);
    _setMeta('og:description', b.description || `${b.type} · ${b.condition}${b.city ? ' · ' + b.city : ''} – til salg på Cykelbørsen`);
    if (allImages[0]?.url) _setMeta('og:image', allImages[0].url);
    document.getElementById('bike-modal')._restoreTitle = () => {
      document.title = _origTitle;
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && !ogImage.dataset.static) ogImage.remove();
      _setMeta('og:title', 'Cykelbørsen – Køb & Sælg Brugte Cykler i Danmark');
      _setMeta('og:description', 'Danmarks markedsplads for brugte cykler. Køb og sælg racercykler, mountainbikes, el-cykler og meget mere. Gratis at oprette annonce.');
    };

    document.getElementById('bike-modal-body').innerHTML = html;
    attachGallerySwipe();
    loadResponseTime(profile.id);
    loadSellerOtherListings(profile.id, b.id);
    loadSimilarListings(b.type, b.id);
  } catch (renderErr) {
    console.error('openBikeModal render error:', renderErr.message);
    document.getElementById('bike-modal-body').innerHTML = retryHTML('Kunne ikke vise annonce.', `() => openBikeModal('${bikeId}')`);
  }
}

/* ============================================================
   ANNONCE DETALJE PAGE (hash routing)
   ============================================================ */

function renderBikeSkeleton() {
  const s = 'background:linear-gradient(90deg,#e8e3d9 25%,#f0ebe3 50%,#e8e3d9 75%);background-size:200% 100%;animation:skeleton-shimmer 1.4s infinite;border-radius:6px;';
  return `
    <div style="max-width:1000px;margin:0 auto;padding:20px 16px;">
      <div style="${s}height:34px;width:90px;margin-bottom:24px;"></div>
      <div style="${s}height:36px;width:55%;margin-bottom:24px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div style="${s}height:340px;border-radius:12px;"></div>
        <div>
          <div style="${s}height:44px;width:45%;margin-bottom:16px;"></div>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <div style="${s}height:28px;width:80px;border-radius:20px;"></div>
            <div style="${s}height:28px;width:60px;border-radius:20px;"></div>
            <div style="${s}height:28px;width:70px;border-radius:20px;"></div>
          </div>
          <div style="${s}height:14px;width:90%;margin-bottom:8px;"></div>
          <div style="${s}height:14px;width:75%;margin-bottom:24px;"></div>
          <div style="${s}height:80px;border-radius:12px;margin-bottom:16px;"></div>
          <div style="${s}height:44px;border-radius:8px;margin-bottom:10px;"></div>
          <div style="${s}height:44px;border-radius:8px;"></div>
        </div>
      </div>
    </div>`;
}

async function renderBikePage(bikeId) {
  showDetailView();
  const detailView = document.getElementById('detail-view');
  detailView.innerHTML = renderBikeSkeleton();

  let b, error;
  try {
    ({ data: b, error } = await fetchBikeById(bikeId));
  } catch (e) {
    error = e;
  }

  if (error || !b) {
    const errBackAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";
    detailView.innerHTML = `
      <div style="padding:60px 24px;text-align:center;">
        <p style="color:var(--rust);margin-bottom:16px;">Kunne ikke hente annonce.</p>
        <button onclick="${errBackAction}" style="background:var(--forest);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;">← Tilbage</button>
      </div>`;
    return;
  }

  if (!currentUser || currentUser.id !== b.user_id) {
    supabase.rpc('increment_bike_views', { bike_id: bikeId }).then(null, () => {});
  }

  document.title = `${b.brand} ${b.model} – ${b.price.toLocaleString('da-DK')} kr. | Cykelbørsen`;
  updateSEOMeta(`${b.brand} ${b.model} – ${b.type} i ${b.city || 'Danmark'}. ${b.condition}. ${b.price.toLocaleString('da-DK')} kr. Køb på Cykelbørsen.`, `/bike/${bikeId}`);

  // Inject Product JSON-LD for rich search results
  removeBikeJsonLd();
  const primaryImg = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url || '';
  const jsonLd = document.createElement('script');
  jsonLd.type = 'application/ld+json';
  jsonLd.id = 'bike-jsonld';
  jsonLd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': `${b.brand} ${b.model}`,
    'description': b.description || `${b.type} – ${b.condition}`,
    'image': primaryImg,
    'brand': { '@type': 'Brand', 'name': b.brand },
    'offers': {
      '@type': 'Offer',
      'price': b.price,
      'priceCurrency': 'DKK',
      'availability': 'https://schema.org/InStock',
      'itemCondition': b.condition === 'Ny' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      'seller': { '@type': b.profiles?.seller_type === 'dealer' ? 'Organization' : 'Person', 'name': b.profiles?.shop_name || b.profiles?.name || 'Sælger' }
    },
    'category': b.type,
    'url': `${BASE_URL}/bike/${bikeId}`
  });
  document.head.appendChild(jsonLd);

  const { html, profile } = buildBikeBodyHTML(b);
  const backAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";
  detailView.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:20px 16px;">
      <button onclick="${backAction}" style="margin-bottom:20px;background:none;border:1px solid var(--border);padding:8px 18px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.9rem;color:var(--charcoal);">← Tilbage</button>
      <h1 style="font-family:'Fraunces',serif;font-size:1.8rem;font-weight:700;margin-bottom:20px;color:var(--charcoal);">${esc(b.brand)} ${esc(b.model)}</h1>
      ${html}
    </div>`;

  attachGallerySwipe();
  loadResponseTime(profile.id);
  loadSellerOtherListings(profile.id, b.id);
  loadSimilarListings(b.type, b.id);
}

function showDetailView() {
  const landingLayout = document.getElementById('landing-layout');
  const pageLayout    = document.getElementById('page-layout');
  if (landingLayout) landingLayout.style.display = 'none';
  if (pageLayout)    pageLayout.style.display    = 'block';
}

function showListingView() {
  const landingLayout = document.getElementById('landing-layout');
  const pageLayout    = document.getElementById('page-layout');
  if (pageLayout)    pageLayout.style.display    = 'none';
  if (landingLayout) landingLayout.style.display = '';
  document.title = 'Cykelbørsen – Køb & Sælg Brugte Cykler i Danmark';
  updateSEOMeta(DEFAULT_DESC, '/');
  removeBikeJsonLd();
}

/* ============================================================
   OPRET ANNONCE SIDE (#/sell)
   ============================================================ */

function renderSellPage() {
  if (!currentUser) {
    openLoginModal();
    showToast('⚠️ Log ind for at oprette en annonce');
    navigateTo('/');
    return;
  }
  showDetailView();
  document.body.classList.add('on-sell-page');
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Opret annonce – Cykelbørsen';
  updateSEOMeta('Sælg din brugte cykel gratis på Cykelbørsen. Opret en annonce på under 2 minutter og nå tusindvis af cykellkøbere i Danmark.', '/sell');
  selectedFiles = [];
  _sellStep = 1;
  _aiApplied = false;
  _aiSuggestionPending = null;
  _sellFormCache = {};

  document.getElementById('detail-view').innerHTML = `
    <div class="sell-wizard">
      <div class="sell-wizard-top">
        <button class="sell-wizard-back-btn" onclick="backSell()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="sell-wizard-logo">
          <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
            <circle cx="11" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
            <circle cx="29" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
            <path d="M11 27l7-13h7l5 13M18 14h-3M23 14l-5 13" stroke="var(--rust)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Cykelbørsen</span>
        </div>
        <div style="width:40px"></div>
      </div>

      <div class="sell-wizard-desktop-header">
        <div id="sell-desktop-step-label" class="sell-wizard-step-label">Trin 1 af 3</div>
        <h1 class="sell-wizard-page-title">Sæt din cykel <em>til salg</em></h1>
      </div>

      <div class="sell-wizard-layout">
        <aside id="sell-desktop-stepper" class="sell-wizard-desktop-stepper"></aside>

        <div class="sell-wizard-main">
          <div id="sell-wizard-progress" class="sell-wizard-progress"></div>
          <div id="sell-step-body" class="sell-wizard-body"></div>
          <div id="sell-desktop-footer" class="sell-wizard-desktop-footer"></div>
        </div>

        <aside id="sell-desktop-preview" class="sell-wizard-desktop-preview"></aside>
      </div>

      <div id="sell-wizard-footer" class="sell-wizard-footer"></div>
    </div>
  `;

  setSellStep(1);
}

function renderSellProgressHTML(step) {
  const steps = [
    { n: 1, label: 'Billeder' },
    { n: 2, label: 'Om cyklen' },
    { n: 3, label: 'Publicer' },
  ];
  return `<div class="sell-progress-row">${steps.map((s, i) => {
    const done = step > s.n;
    const active = step === s.n;
    const dotClass = active ? 'active' : done ? 'done' : 'pending';
    const labelClass = active ? 'active' : done ? '' : 'pending';
    const connector = i < steps.length - 1
      ? `<div class="sell-progress-line" style="background:${done ? 'var(--forest)' : 'var(--border)'}"></div>`
      : '';
    return `
      <button class="sell-progress-step" onclick="step > ${s.n} ? setSellStep(${s.n}) : null" style="cursor:${step > s.n ? 'pointer' : 'default'}">
        <div class="sell-progress-dot ${dotClass}">${done ? '✓' : s.n}</div>
        <span class="sell-progress-label ${labelClass}">${s.label}</span>
      </button>${connector}`;
  }).join('')}</div>`;
}

function renderSellStep1HTML() {
  const aiDone = _aiApplied;
  return `
    <h1 class="sell-step-heading">Start med <em>billeder</em></h1>
    <p class="sell-step-subtitle">Gode billeder sælger bedre. Tilføj mindst ét — gerne fra flere vinkler.</p>

    <div class="sell-drop-zone" id="sell-drop-zone" onclick="document.getElementById('sell-file-input').click()"
      ondragover="event.preventDefault();this.classList.add('dragover')"
      ondragleave="this.classList.remove('dragover')"
      ondrop="event.preventDefault();this.classList.remove('dragover');previewSellImages({files:event.dataTransfer.files})">
      <div class="sell-drop-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="sell-drop-title">Træk billeder hertil</div>
      <div class="sell-drop-sub">eller tryk for at vælge fra bibliotek</div>
      <div class="sell-drop-badge">JPG, PNG, WEBP · op til 10 MB</div>
    </div>
    <input type="file" id="sell-file-input" accept="image/*" multiple style="display:none" onchange="previewSellImages(this)">

    <div id="ai-suggest-wrap" style="display:${selectedFiles.length > 0 ? 'block' : 'none'}">
      ${aiDone ? `
        <div class="sell-ai-applied">
          <div class="sell-ai-applied-icon">✓</div>
          <div><b>AI-forslag anvendt.</b> Gennemse i næste trin.</div>
        </div>` : `
        <button type="button" id="ai-suggest-btn" class="sell-ai-btn" onclick="suggestListingFromImages()">
          <div class="sell-ai-btn-icon">✨</div>
          <div>
            <div class="sell-ai-btn-title">Få AI-forslag</div>
            <div class="sell-ai-btn-sub">Vi udfylder mærke, model og beskrivelse fra billederne</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg);opacity:.6"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div id="ai-suggest-status" class="ai-suggest-status"></div>`}
    </div>

    ${selectedFiles.length > 0 ? `
      <div class="sell-photo-grid-header">
        <div class="sell-photo-grid-title">Dine billeder <span class="sell-photo-count">· ${selectedFiles.length}/8</span></div>
        <div class="sell-photo-hint">Tryk ★ for primær</div>
      </div>` : ''}
    <div id="sell-preview-grid" class="img-preview-grid sell-preview-grid-new"></div>
    <p class="img-upload-hint" id="sell-img-hint" style="display:none"></p>
  `;
}

function renderSellStep2HTML() {
  const isDealer = currentProfile?.seller_type === 'dealer';
  const ai = _aiApplied;
  const c = _sellFormCache;
  const aiClass = ai ? ' ai-field' : '';

  const opt = (val, list) => list.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('');

  return `
    <h1 class="sell-step-heading">Om <em>cyklen</em></h1>
    <p class="sell-step-subtitle">${ai ? 'Vi har udfyldt det vi kunne — gennemgå og ret hvis nødvendigt.' : 'Jo mere præcist, jo bedre bud.'}</p>

    <div class="sell-form-grid-2">
      <div class="sell-field">
        <label>Mærke <span class="req">*</span></label>
        <input type="text" id="sell-brand" placeholder="Trek" value="${esc(c['sell-brand'] || '')}" class="${aiClass}">
      </div>
      <div class="sell-field">
        <label>Model <span class="req">*</span></label>
        <input type="text" id="sell-model" placeholder="FX 3 Disc" value="${esc(c['sell-model'] || '')}" class="${aiClass}">
      </div>
    </div>

    <div class="sell-field">
      <label>Cykeltype <span class="req">*</span></label>
      <select id="sell-type">
        <option value="">Vælg type</option>
        ${opt(c['sell-type'] || '', ['Racercykel','Mountainbike','Citybike','El-cykel','Ladcykel','Børnecykel','Gravel'])}
      </select>
    </div>

    <div class="sell-form-grid-2">
      <div class="sell-field">
        <label>Stelstørrelse</label>
        <select id="sell-size">
          <option value="">Vælg</option>
          ${opt(c['sell-size'] || '', ['XS (44–48 cm)','S (49–52 cm)','M (53–56 cm)','L (57–60 cm)','XL (61+ cm)'])}
        </select>
      </div>
      <div class="sell-field">
        <label>Hjulstørrelse</label>
        <select id="sell-wheel-size">
          <option value="">Vælg</option>
          ${opt(c['sell-wheel-size'] || '', ['26"','27.5" / 650b','28"','29"'])}
        </select>
      </div>
      <div class="sell-field">
        <label>Årgang</label>
        <input type="number" id="sell-year" placeholder="2021" min="1950" max="2030" value="${c['sell-year'] || ''}">
      </div>
      <div class="sell-field">
        <label>Stand <span class="req">*</span></label>
        <select id="sell-condition" class="${aiClass}">
          <option value="">Vælg stand</option>
          ${opt(c['sell-condition'] || '', ['Ny','Som ny','God stand','Brugt'])}
        </select>
      </div>
    </div>

    <div class="sell-field">
      <label>Farve</label>
      <input type="text" id="sell-color" placeholder="Sort, Hvid, Rød …" value="${esc(c['sell-color'] || '')}" class="${aiClass}">
    </div>

    <div class="sell-field">
      <label>Pris <span class="req">*</span> <span class="hint">inkl. moms</span></label>
      <div class="suffix-wrap">
        <input type="number" id="sell-price" placeholder="4.500" min="0" value="${c['sell-price'] || ''}">
        <span class="suffix">DKK</span>
      </div>
      <div id="sell-price-suggestion" class="price-suggestion" style="display:none;"></div>
    </div>

    ${isDealer ? `
    <div class="sell-field">
      <label>Garanti <span class="hint">(valgfrit)</span></label>
      <input type="text" id="sell-warranty" placeholder="f.eks. 2 års garanti" value="${esc(c['sell-warranty'] || '')}">
    </div>` : ''}
  `;
}

function renderSellStep3HTML() {
  const c = _sellFormCache;
  const brand = c['sell-brand'] || '';
  const model = c['sell-model'] || '';
  const type  = c['sell-type'] || '';
  const size  = c['sell-size'] || '';
  const wheel = c['sell-wheel-size'] || '';
  const year  = c['sell-year'] || '';
  const cond  = c['sell-condition'] || '';
  const color = c['sell-color'] || '';
  const price = c['sell-price'] || '';

  const primaryImg = selectedFiles.find(f => f.isPrimary) || selectedFiles[0];
  const thumbHTML = primaryImg
    ? `<img src="${primaryImg.url}" alt="" class="sell-summary-thumb-img">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:.3">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none"><circle cx="11" cy="27" r="9" stroke="currentColor" stroke-width="2"/><circle cx="29" cy="27" r="9" stroke="currentColor" stroke-width="2"/><path d="M11 27l7-13h7l5 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>`;

  const rows = [
    ['Mærke & model', [brand, model].filter(Boolean).join(' ') || '—'],
    ['Type', type || '—'],
    ['Størrelse', [size, wheel].filter(Boolean).join(' · ') || '—'],
    ['Årgang · Stand', [year, cond].filter(Boolean).join(' · ') || '—'],
    ['Farve', color || '—'],
    ['Pris', price ? `${Number(price).toLocaleString('da-DK')} DKK` : '—'],
    ['Billeder', `${selectedFiles.length} uploadet`],
  ];

  return `
    <h1 class="sell-step-heading">Sidste <em>finish</em></h1>
    <p class="sell-step-subtitle">Beskriv cyklen med dine egne ord og tjek oversigten.</p>

    <div class="sell-field">
      <label>Beskrivelse <span class="req">*</span> <span class="hint">min. 40 tegn</span></label>
      <textarea id="sell-desc" placeholder="Fortæl om cyklens stand, udstyr, historik, hvorfor du sælger…" rows="5">${esc(c['sell-desc'] || '')}</textarea>
    </div>

    <div class="sell-field">
      <label>By <span class="req">*</span></label>
      <div class="suffix-wrap">
        <span class="suffix" style="left:12px;right:auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="1.6"/></svg>
        </span>
        <input type="text" id="sell-city" placeholder="København" value="${esc(c['sell-city'] || '')}" style="padding-left:34px">
      </div>
    </div>

    <div class="sell-summary-card">
      <div class="sell-summary-label">Oversigt</div>
      <div class="sell-summary-top">
        <div class="sell-summary-thumb">${thumbHTML}</div>
        <div>
          <div class="sell-summary-title">${esc([brand, model].filter(Boolean).join(' ') || 'Din cykel')}</div>
          <div class="sell-summary-sub">${esc(type || 'Type')} · ${esc(c['sell-city'] || 'By')}</div>
          <div class="sell-summary-price">${price ? Number(price).toLocaleString('da-DK') + ' DKK' : '— DKK'}</div>
        </div>
      </div>
      <div class="sell-summary-rows">
        ${rows.map(([k, v]) => `
          <div class="sell-summary-row">
            <span class="sell-summary-row-key">${k}</span>
            <span class="sell-summary-row-val">${esc(String(v))}</span>
          </div>`).join('')}
      </div>
    </div>

    <p class="sell-disclaimer" style="margin-top:16px;text-align:center">
      Ved oprettelse accepterer du vores <span onclick="navigateTo('/vilkaar')" class="sell-terms-link">vilkår og betingelser</span>.
    </p>
    <button id="sell-submit-btn" style="display:none"></button>
  `;
}

function renderSellFooterHTML(step, canContinue) {
  const labels = { 1: 'Fortsæt til om cyklen', 2: 'Fortsæt til publicer', 3: 'Opret annonce' };
  const cls = canContinue ? 'enabled' : 'disabled';
  const dis = canContinue ? '' : 'disabled';
  return `<button class="sell-wizard-cta ${cls}" onclick="advanceSell()" ${dis}>
    ${labels[step]}
    ${step < 3 ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg)"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
  </button>`;
}

function renderSellDesktopStepperHTML(step) {
  const steps = [
    { n: 1, label: 'Billeder',  desc: 'Upload fotos af din cykel' },
    { n: 2, label: 'Om cyklen', desc: 'Mærke, model, pris' },
    { n: 3, label: 'Publicer',  desc: 'Beskrivelse & oversigt' },
  ];
  return `
    <div class="sell-desktop-stepper-title">Opret annonce</div>
    ${steps.map(s => {
      const done = step > s.n;
      const active = step === s.n;
      const dotClass = active ? 'active' : done ? 'done' : 'pending';
      const rowClass = active ? 'active' : '';
      const clickable = step > s.n ? `onclick="setSellStep(${s.n})" style="cursor:pointer"` : 'style="cursor:default"';
      return `
        <button class="sell-desktop-step-row ${rowClass}" ${clickable}>
          <div class="sell-progress-dot ${dotClass}">${done ? '✓' : s.n}</div>
          <div class="sell-desktop-step-text">
            <div class="sell-desktop-step-label ${active || done ? '' : 'muted'}">${s.label}</div>
            <div class="sell-desktop-step-desc">${s.desc}</div>
          </div>
        </button>`;
    }).join('')}
    <div class="sell-desktop-stepper-footer">
      Alle felter med <span style="color:var(--rust)">*</span> skal udfyldes.<br>
      Annoncer er aktive i 60 dage.
    </div>
  `;
}

function renderSellDesktopPreviewHTML() {
  const c = _sellFormCache;
  const brand = c['sell-brand'] || '';
  const model = c['sell-model'] || '';
  const type  = c['sell-type'] || '';
  const size  = c['sell-size'] || '';
  const year  = c['sell-year'] || '';
  const cond  = c['sell-condition'] || '';
  const price = c['sell-price'] || '';
  const city  = c['sell-city'] || '';

  const primaryImg = selectedFiles.find(f => f.isPrimary) || selectedFiles[0];
  const heroHTML = primaryImg
    ? `<img src="${primaryImg.url}" alt="" class="sell-desktop-preview-img">`
    : `<div class="sell-desktop-preview-placeholder">Billede vises her</div>`;

  const condBadge = cond
    ? `<div class="sell-desktop-preview-badge">${esc(cond)}</div>`
    : '';

  const title = [brand, model].filter(Boolean).join(' ') || 'Din cykel';
  const meta  = [type, size, year].filter(Boolean).join(' · ') || 'Type · Størrelse · Årgang';

  const thumbs = selectedFiles.length > 1
    ? `<div class="sell-desktop-preview-thumbs">
        ${selectedFiles.slice(0, 4).map(f => `
          <div class="sell-desktop-preview-thumb ${f.isPrimary ? 'primary' : ''}">
            <img src="${f.url}" alt="">
          </div>`).join('')}
       </div>`
    : '';

  const ownerName = currentProfile?.shop_name || currentProfile?.name || 'Sælger';

  return `
    <div class="sell-desktop-preview-label">Sådan ser annoncen ud</div>
    <div class="sell-desktop-preview-card">
      <div class="sell-desktop-preview-hero">
        ${heroHTML}
        ${condBadge}
      </div>
      <div class="sell-desktop-preview-body">
        <div class="sell-desktop-preview-topline">
          <div class="sell-desktop-preview-title">${esc(title)}</div>
          <div class="sell-desktop-preview-price">${price ? Number(price).toLocaleString('da-DK') + ' kr' : '— kr'}</div>
        </div>
        <div class="sell-desktop-preview-meta">${esc(meta)}</div>
        <div class="sell-desktop-preview-foot">
          <span class="sell-desktop-preview-owner">${esc(ownerName)}</span>
          <span class="sell-desktop-preview-city">${esc(city || 'By')}</span>
        </div>
      </div>
    </div>
    ${thumbs}
  `;
}

function renderSellDesktopFooterHTML(step, canContinue) {
  const labels = { 1: 'Fortsæt til om cyklen', 2: 'Fortsæt til publicer', 3: 'Opret annonce' };
  const cls = canContinue ? 'enabled' : 'disabled';
  const dis = canContinue ? '' : 'disabled';
  const backDisabled = step === 1;
  return `
    <button class="sell-desktop-back ${backDisabled ? 'disabled' : ''}" ${backDisabled ? 'disabled' : ''} onclick="backSell()">Tilbage</button>
    <button class="sell-desktop-cta ${cls}" onclick="advanceSell()" ${dis}>
      ${labels[step]}
      ${step < 3 ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg)"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
    </button>
  `;
}

function canAdvanceSell() {
  if (_sellStep === 1) return selectedFiles.length > 0;
  if (_sellStep === 2) {
    const brand = document.getElementById('sell-brand')?.value.trim();
    const model = document.getElementById('sell-model')?.value.trim();
    const type  = document.getElementById('sell-type')?.value;
    const cond  = document.getElementById('sell-condition')?.value;
    const price = document.getElementById('sell-price')?.value;
    return !!(brand && model && type && cond && price);
  }
  if (_sellStep === 3) {
    const desc = document.getElementById('sell-desc')?.value.trim();
    const city = document.getElementById('sell-city')?.value.trim();
    return !!(desc && desc.length >= 10 && city);
  }
  return false;
}

function updateSellFooter() {
  const can = canAdvanceSell();
  const el = document.getElementById('sell-wizard-footer');
  if (el) el.innerHTML = renderSellFooterHTML(_sellStep, can);
  const elDesk = document.getElementById('sell-desktop-footer');
  if (elDesk) elDesk.innerHTML = renderSellDesktopFooterHTML(_sellStep, can);
}

function updateSellDesktopPreview() {
  const el = document.getElementById('sell-desktop-preview');
  if (el) el.innerHTML = renderSellDesktopPreviewHTML();
}

function captureSellFormCache() {
  if (_sellStep === 2) {
    ['sell-brand','sell-model','sell-type','sell-size','sell-wheel-size',
     'sell-year','sell-condition','sell-color','sell-price','sell-warranty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) _sellFormCache[id] = el.value;
    });
  }
  if (_sellStep === 3) {
    ['sell-desc','sell-city'].forEach(id => {
      const el = document.getElementById(id);
      if (el) _sellFormCache[id] = el.value;
    });
  }
}

function setSellStep(n) {
  captureSellFormCache();

  _sellStep = n;

  const stepLabel = document.getElementById('sell-desktop-step-label');
  if (stepLabel) stepLabel.textContent = `Trin ${n} af 3`;

  const stepper = document.getElementById('sell-desktop-stepper');
  if (stepper) stepper.innerHTML = renderSellDesktopStepperHTML(n);

  const progress = document.getElementById('sell-wizard-progress');
  if (progress) progress.innerHTML = renderSellProgressHTML(n);

  const body = document.getElementById('sell-step-body');
  if (body) {
    body.innerHTML = n === 1 ? renderSellStep1HTML()
                   : n === 2 ? renderSellStep2HTML()
                   : renderSellStep3HTML();
  }

  updateSellFooter();
  updateSellDesktopPreview();

  if (n === 1) {
    renderSellImagePreviews();
    updateAiSuggestVisibility();
  }

  const refreshOnChange = () => { updateSellFooter(); updateSellDesktopPreview(); };

  if (n === 2) {
    const typeEl = document.getElementById('sell-type');
    if (typeEl) typeEl.addEventListener('change', () => updateSellPriceSuggestion(typeEl.value));
    initSellDraft();
    if (_aiSuggestionPending) {
      setTimeout(() => { applyAiSuggestion(_aiSuggestionPending); _aiSuggestionPending = null; }, 50);
    }
    // Live footer + preview updates
    ['sell-brand','sell-model','sell-type','sell-size','sell-wheel-size',
     'sell-year','sell-condition','sell-color','sell-price'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => { captureSellFormCache(); refreshOnChange(); });
      el.addEventListener('change', () => { captureSellFormCache(); refreshOnChange(); });
    });
  }

  if (n === 3) {
    ['sell-desc','sell-city'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => { captureSellFormCache(); refreshOnChange(); });
    });
    // Re-init draft listeners for step 3 fields
    const debouncedSave = debounce(() => saveSellDraft(), 600);
    ['sell-desc','sell-city'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', debouncedSave);
    });
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function advanceSell() {
  if (!canAdvanceSell()) {
    showToast('⚠️ Udfyld alle påkrævede felter');
    return;
  }
  if (_sellStep < 3) {
    setSellStep(_sellStep + 1);
  } else {
    captureSellFormCache(); // ensure step 3 fields are saved before submit
    submitSellPage();
  }
}

function backSell() {
  if (_sellStep > 1) setSellStep(_sellStep - 1);
  else navigateTo('/');
}

const SELL_DRAFT_KEY = 'cb_sell_draft_v1';
const SELL_DRAFT_FIELDS = [
  'sell-brand', 'sell-model', 'sell-type', 'sell-size', 'sell-wheel-size',
  'sell-year', 'sell-condition', 'sell-city', 'sell-color', 'sell-desc',
  'sell-price', 'sell-warranty',
];

function saveSellDraft() {
  try {
    const draft = {};
    let hasAny = false;
    SELL_DRAFT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value != null && el.value !== '') {
        draft[id] = el.value;
        hasAny = true;
      }
    });
    if (hasAny) {
      draft._savedAt = Date.now();
      localStorage.setItem(SELL_DRAFT_KEY, JSON.stringify(draft));
    } else {
      localStorage.removeItem(SELL_DRAFT_KEY);
    }
  } catch (_) {}
}

function clearSellDraft() {
  try { localStorage.removeItem(SELL_DRAFT_KEY); } catch (_) {}
  const banner = document.getElementById('sell-draft-banner');
  if (banner) banner.remove();
}

function applySellDraft(draft) {
  SELL_DRAFT_FIELDS.forEach(id => {
    if (draft[id] != null) {
      const el = document.getElementById(id);
      if (el) el.value = draft[id];
    }
  });
  const typeSelect = document.getElementById('sell-type');
  if (typeSelect && typeSelect.value) updateSellPriceSuggestion(typeSelect.value);
  showDraftSavedIndicator('Kladde gendannet');
}

function showDraftSavedIndicator(text) {
  const ind = document.getElementById('sell-draft-indicator');
  if (!ind) return;
  ind.textContent = text || '✓ Kladde gemt';
  ind.classList.add('show');
  clearTimeout(ind._hideTimer);
  ind._hideTimer = setTimeout(() => ind.classList.remove('show'), 1600);
}

function initSellDraft() {
  let existing = null;
  try {
    const raw = localStorage.getItem(SELL_DRAFT_KEY);
    if (raw) existing = JSON.parse(raw);
  } catch (_) {}

  // Tilføj kladde-indikator
  const actions = document.querySelector('.sell-page-actions');
  if (actions && !document.getElementById('sell-draft-indicator')) {
    const ind = document.createElement('div');
    ind.id = 'sell-draft-indicator';
    ind.className = 'sell-draft-indicator';
    ind.textContent = '✓ Kladde gemt';
    actions.prepend(ind);
  }

  // Vis "gendan kladde"-banner hvis der er en gemt kladde
  if (existing && existing._savedAt) {
    const body = document.querySelector('.sell-page-body');
    if (body && !document.getElementById('sell-draft-banner')) {
      const minsAgo = Math.max(1, Math.round((Date.now() - existing._savedAt) / 60000));
      const banner = document.createElement('div');
      banner.id = 'sell-draft-banner';
      banner.className = 'sell-draft-banner';
      banner.innerHTML = `
        <span>💾 Du har en gemt kladde fra ${minsAgo} min. siden.</span>
        <div class="sell-draft-banner-actions">
          <button type="button" class="sell-draft-restore">Gendan</button>
          <button type="button" class="sell-draft-discard">Kassér</button>
        </div>`;
      body.prepend(banner);
      banner.querySelector('.sell-draft-restore').onclick = () => {
        applySellDraft(existing);
        banner.remove();
      };
      banner.querySelector('.sell-draft-discard').onclick = () => {
        clearSellDraft();
      };
    }
  }

  // Lyt på ændringer → debounce-gem
  const debouncedSave = debounce(() => {
    saveSellDraft();
    showDraftSavedIndicator('✓ Kladde gemt');
  }, 600);
  SELL_DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', debouncedSave);
    el.addEventListener('change', debouncedSave);
  });
}

async function updateSellPriceSuggestion(bikeType) {
  const wrap = document.getElementById('sell-price-suggestion');
  if (!wrap || !bikeType) { if (wrap) wrap.style.display = 'none'; return; }

  const { data } = await supabase
    .from('bikes')
    .select('price')
    .eq('type', bikeType)
    .eq('is_active', true)
    .limit(50);

  if (!data || data.length < 3) { wrap.style.display = 'none'; return; }

  const prices = data.map(b => b.price).sort((a, b) => a - b);
  const avg    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const low    = prices[Math.floor(prices.length * 0.25)];
  const high   = prices[Math.floor(prices.length * 0.75)];

  wrap.innerHTML = `💡 Andre ${esc(bikeType).toLowerCase()}er sælges typisk for <strong>${low.toLocaleString('da-DK')}–${high.toLocaleString('da-DK')} kr.</strong> (gns. ${avg.toLocaleString('da-DK')} kr.)`;
  wrap.style.display = 'block';
}

function previewSellImages(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  const remaining = 8 - selectedFiles.length;
  const toAdd = files.filter(validateImageFile).slice(0, remaining);

  toAdd.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    selectedFiles.push({ file, url, isPrimary: selectedFiles.length === 0 && i === 0 });
  });

  renderSellImagePreviews();
  updateAiSuggestVisibility();
  const label = document.getElementById('sell-upload-label');
  if (label) label.textContent = `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`;
}

function renderSellImagePreviews() {
  const grid = document.getElementById('sell-preview-grid');
  if (!grid) return;
  grid.innerHTML = selectedFiles.map((item, i) => `
    <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
      <img src="${item.url}" alt="Billede ${i + 1}">
      ${item.isPrimary
        ? '<span class="primary-badge">⭐ Forsidebillede</span>'
        : `<button class="set-primary" title="Sæt som forsidebillede" onclick="setSellPrimary(${i})">★</button>`}
      <button class="remove-img" onclick="removeSellImage(${i})">✕</button>
    </div>`).join('');
  const hint = document.getElementById('sell-img-hint');
  if (hint) hint.style.display = selectedFiles.length > 1 ? 'block' : 'none';
  if (typeof updateSellDesktopPreview === 'function') updateSellDesktopPreview();
  if (typeof updateSellFooter === 'function') updateSellFooter();
}

function updateAiSuggestVisibility() {
  const wrap = document.getElementById('ai-suggest-wrap');
  if (!wrap) return;
  wrap.style.display = selectedFiles.length > 0 ? 'block' : 'none';
}

function setSellPrimary(index) {
  selectedFiles = selectedFiles.map((item, i) => ({ ...item, isPrimary: i === index }));
  renderSellImagePreviews();
}

function removeSellImage(index) {
  URL.revokeObjectURL(selectedFiles[index].url);
  selectedFiles.splice(index, 1);
  if (selectedFiles.length > 0 && !selectedFiles.some(f => f.isPrimary)) selectedFiles[0].isPrimary = true;
  renderSellImagePreviews();
  updateAiSuggestVisibility();
  const label = document.getElementById('sell-upload-label');
  if (label) label.textContent = selectedFiles.length > 0
    ? `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`
    : 'Klik for at vælge billeder';
}

async function suggestListingFromImages() {
  if (!selectedFiles.length) {
    showToast('⚠️ Upload mindst ét billede først');
    return;
  }
  if (!currentUser) {
    openLoginModal();
    return;
  }

  const btn = document.getElementById('ai-suggest-btn');
  const status = document.getElementById('ai-suggest-status');
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('loading');
  const labelEl = btn.querySelector('.sell-ai-btn-title') || btn.querySelector('.ai-suggest-label');
  const originalLabel = labelEl ? labelEl.textContent : '';
  if (labelEl) labelEl.textContent = 'Analyserer billeder...';
  if (status) { status.textContent = ''; status.className = 'ai-suggest-status'; }

  try {
    // Brug op til 4 billeder, prioriter forsidebilledet først
    const ordered = selectedFiles.slice().sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    const picks = ordered.slice(0, 4);

    const images = await Promise.all(picks.map(async (item) => {
      const { mediaType, base64 } = await fileToBase64(item.file);
      return { media_type: mediaType, data: base64 };
    }));

    // Brug evt. eksisterende tekst som hint (hvis brugeren allerede har skrevet noget)
    const hint = [
      document.getElementById('sell-brand')?.value,
      document.getElementById('sell-model')?.value,
    ].filter(Boolean).join(' ').trim();

    const { data, error } = await supabase.functions.invoke('suggest-listing', {
      body: { images, hint: hint || undefined },
    });

    if (error || !data?.suggestion) {
      console.error('suggest-listing fejl:', error || data);
      if (status) { status.textContent = '❌ Kunne ikke hente forslag. Prøv igen.'; status.className = 'ai-suggest-status error'; }
      return;
    }

    applyAiSuggestion(data.suggestion);
    if (status) { status.textContent = '✓ Felter udfyldt med AI-forslag. Tjek og ret inden du opretter.'; status.className = 'ai-suggest-status success'; }
  } catch (err) {
    console.error('suggestListingFromImages fejl:', err);
    if (status) { status.textContent = '❌ Noget gik galt. Prøv igen.'; status.className = 'ai-suggest-status error'; }
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (labelEl) labelEl.textContent = originalLabel;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      // result format: "data:image/jpeg;base64,XXXXX"
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { reject(new Error('Ugyldig fil')); return; }
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error('Kunne ikke læse fil'));
    reader.readAsDataURL(file);
  });
}

function applyAiSuggestion(s) {
  if (!s || typeof s !== 'object') return;
  _aiApplied = true;
  // If step 2 fields don't exist yet, store for when step 2 renders
  if (!document.getElementById('sell-brand')) {
    _aiSuggestionPending = s;
    // Re-render step 1 to show "AI applied" state
    const body = document.getElementById('sell-step-body');
    if (body && _sellStep === 1) body.innerHTML = renderSellStep1HTML();
    return;
  }

  const setField = (id, value) => {
    if (value == null || value === '') return;
    const el = document.getElementById(id);
    if (!el) return;
    // Skriv ikke over hvis brugeren allerede har udfyldt feltet
    if (el.value && el.value.trim() !== '') return;
    el.value = String(value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setField('sell-brand', s.brand);
  setField('sell-model', s.model);
  setField('sell-type', s.type);
  setField('sell-size', s.size);
  setField('sell-wheel-size', s.wheel_size);
  setField('sell-year', s.year);
  setField('sell-condition', s.condition);
  setField('sell-color', s.color);
  setField('sell-desc', s.description);

  // Pris: brug midten af intervallet hvis både min og max er givet
  if (s.price_min != null && s.price_max != null) {
    const mid = Math.round((Number(s.price_min) + Number(s.price_max)) / 2);
    if (!isNaN(mid)) setField('sell-price', mid);
  } else if (s.price_min != null) {
    setField('sell-price', s.price_min);
  }

  // Trigger draft-save så AI-forslag også persisteres
  if (typeof saveSellDraft === 'function') saveSellDraft();
}

function showListingSuccessModal(bike) {
  const modal = document.getElementById('listing-success-modal');
  if (!modal) return;
  const titleEl = document.getElementById('success-bike-title');
  const priceEl = document.getElementById('success-bike-price');
  const viewBtn = document.getElementById('success-view-btn');
  const newBtn  = document.getElementById('success-new-btn');
  if (titleEl) titleEl.textContent = `${bike.brand} ${bike.model}`;
  if (priceEl) priceEl.textContent = bike.price ? `${bike.price.toLocaleString('da-DK')} kr.` : '';
  if (viewBtn) viewBtn.onclick = () => { closeListingSuccessModal(); navigateTo(`/bike/${bike.id}`); };
  if (newBtn)  newBtn.onclick  = () => { closeListingSuccessModal(); renderSellPage(); };
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeListingSuccessModal() {
  const modal = document.getElementById('listing-success-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

/* ============================================================
   PROFIL SIDER (hash routing)
   ============================================================ */

function renderProfileSkeleton() {
  const s = 'background:linear-gradient(90deg,#e8e3d9 25%,#f0ebe3 50%,#e8e3d9 75%);background-size:200% 100%;animation:skeleton-shimmer 1.4s infinite;border-radius:6px;';
  return `
    <div class="pp-wrap">
      <div style="${s}height:34px;width:90px;margin-bottom:24px;"></div>
      <div class="pp-header-skeleton">
        <div style="${s}width:96px;height:96px;border-radius:50%;flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="${s}height:28px;width:55%;margin-bottom:12px;"></div>
          <div style="${s}height:14px;width:35%;margin-bottom:8px;"></div>
          <div style="${s}height:14px;width:45%;margin-bottom:16px;"></div>
          <div style="${s}height:38px;width:150px;border-radius:8px;"></div>
        </div>
      </div>
      <div style="display:flex;gap:0;margin:28px 0 20px;">
        <div style="${s}height:72px;flex:1;border-radius:0;"></div>
        <div style="${s}height:72px;flex:1;border-radius:0;"></div>
        <div style="${s}height:72px;flex:1;border-radius:0;"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">
        <div style="${s}height:260px;border-radius:12px;"></div>
        <div style="${s}height:260px;border-radius:12px;"></div>
        <div style="${s}height:260px;border-radius:12px;"></div>
      </div>
    </div>`;
}

async function fetchUserProfileData(userId) {
  const safe = p => Promise.resolve(p).catch(e => ({ data: null, error: e }));
  const dataPromise = Promise.all([
    safe(supabase.from('profiles').select('id, name, shop_name, seller_type, city, address, verified, id_verified, email_verified, created_at, avatar_url, last_seen, bio').eq('id', userId).single()),
    safe(supabase.from('bikes').select('id, brand, model, price, type, city, condition, year, size, color, warranty, is_active, created_at, bike_images(url, is_primary)').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false })),
    safe(supabase.from('bikes').select('brand, model, price, type, condition, year, city').eq('user_id', userId).eq('is_active', false).order('created_at', { ascending: false })),
    safe(supabase.from('reviews').select('*, reviewer:profiles(name, shop_name, seller_type)').eq('reviewed_user_id', userId).order('created_at', { ascending: false })),
  ]);
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000));
  const [r1, r2, r3, r4] = await Promise.race([dataPromise, timeoutPromise]);
  let messagesCount = 0;
  if (currentUser) {
    const { data: tradeMsg } = await safe(
      supabase.from('messages').select('id')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
        .ilike('content', '%accepteret%').limit(1)
    );
    messagesCount = tradeMsg?.length || 0;
  }
  return { profile: r1.data, activeBikes: r2.data, soldBikes: r3.data, reviews: r4.data || [], messagesCount };
}

async function fetchDealerProfileData(dealerId) {
  const safe = p => Promise.resolve(p).catch(e => ({ data: null, error: e }));
  const [r1, r2, r3] = await Promise.race([
    Promise.all([
      safe(supabase.from('profiles').select('id, shop_name, name, city, address, verified, id_verified, avatar_url, created_at, bio, last_seen').eq('id', dealerId).single()),
      safe(supabase.from('bikes').select('id, brand, model, price, type, city, condition, year, size, color, warranty, is_active, created_at, bike_images(url, is_primary)').eq('user_id', dealerId).eq('is_active', true).order('created_at', { ascending: false })),
      safe(supabase.from('reviews').select('*, reviewer:profiles(name, shop_name, seller_type)').eq('reviewed_user_id', dealerId).order('created_at', { ascending: false })),
    ]),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000)),
  ]);
  let messagesCount = 0;
  if (currentUser) {
    const { data: tradeMsg } = await safe(
      supabase.from('messages').select('id')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${dealerId}),and(sender_id.eq.${dealerId},receiver_id.eq.${currentUser.id})`)
        .ilike('content', '%accepteret%').limit(1)
    );
    messagesCount = tradeMsg?.length || 0;
  }
  return { dealer: r1.data, bikes: r2.data || [], reviews: r3.data || [], messagesCount };
}

function buildProfileBikeCards(bikes) {
  const conditionClass = c => {
    if (c === 'Ny')        return 'condition-tag--ny';
    if (c === 'Som ny')    return 'condition-tag--som-ny';
    if (c === 'God stand') return 'condition-tag--god';
    return 'condition-tag--brugt';
  };
  return bikes.map((b, i) => {
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy">`
      : '<span style="font-size:3.5rem">🚲</span>';
    return `
      <div class="bike-card" style="animation-delay:${i * 50}ms" onclick="navigateToBike('${b.id}')">
        <div class="bike-card-img">
          ${imgContent}
          <span class="condition-tag ${conditionClass(b.condition)}">${esc(b.condition)}</span>
          <button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${_userSavedSet.has(b.id) ? '❤️' : '🤍'}</button>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${esc(b.brand)} ${esc(b.model)}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${esc(b.type)}</span><span>${b.year || '–'}</span><span>Str. ${b.size || '–'}</span>
          </div>
          <div class="card-footer">
            <div class="card-location">📍 <span class="bike-city">${esc(b.city)}</span></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function starsHTML(n) {
  return [1,2,3,4,5].map(i => `<span class="star${i <= Math.round(n) ? ' filled' : ''}">★</span>`).join('');
}

function buildUserProfilePageHTML(data) {
  const { profile, activeBikes, soldBikes, reviews, messagesCount } = data;
  const displayName  = profile.seller_type === 'dealer' ? (profile.shop_name || profile.name) : profile.name;
  const initials     = (displayName || 'U').substring(0, 2).toUpperCase();
  const isDealer     = profile.seller_type === 'dealer';
  const memberSince  = profile.created_at ? new Date(profile.created_at).toLocaleDateString('da-DK', { year: 'numeric', month: 'long' }) : null;
  const isOwnProfile = currentUser && currentUser.id === profile.id;
  const lastSeenText = !isOwnProfile ? formatLastSeen(profile.last_seen) : null;
  const reviewList   = reviews || [];
  const avgRating    = reviewList.length ? (reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) : null;
  const hasReviewed  = currentUser && reviewList.some(r => r.reviewer_id === currentUser.id);
  const hasTraded    = currentUser && messagesCount > 0;
  const nActive      = (activeBikes || []).length;
  const nSold        = (soldBikes || []).length;
  const nReviews     = reviewList.length;

  const avatarContent = safeAvatarUrl(profile.avatar_url)
    ? `<img src="${safeAvatarUrl(profile.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  const bikeCards = nActive > 0 ? buildProfileBikeCards(activeBikes)
    : `<div class="pp-empty-state"><div class="pp-empty-icon">🚲</div><p>Ingen aktive annoncer lige nu.</p></div>`;

  const soldRows = (soldBikes || []).map(b => `
    <div class="up-sold-row">
      <div class="up-sold-info">
        <span class="up-sold-title">${esc(b.brand)} ${esc(b.model)}</span>
        <span class="up-sold-meta">${esc(b.type)} · ${esc(b.condition)}${b.year ? ' · ' + b.year : ''}</span>
      </div>
      <div class="up-sold-price">${b.price.toLocaleString('da-DK')} kr. <span class="sold-chip">Solgt</span></div>
    </div>`).join('') || `<div class="pp-empty-state"><p>Ingen solgte cykler endnu.</p></div>`;

  const reviewCards = reviewList.map(r => {
    const rName = r.reviewer?.seller_type === 'dealer' ? r.reviewer.shop_name : r.reviewer?.name;
    const rInit = (rName || 'U').substring(0, 2).toUpperCase();
    const date  = new Date(r.created_at).toLocaleDateString('da-DK', { year:'numeric', month:'short', day:'numeric' });
    return `
      <div class="up-review-card">
        <div class="up-review-top">
          <div class="up-review-avatar">${rInit}</div>
          <div>
            <div class="up-review-name">${esc(rName || 'Anonym')}</div>
            <div class="up-review-stars">${starsHTML(r.rating)}</div>
          </div>
          <div class="up-review-date">${date}</div>
        </div>
        ${r.comment ? `<p class="up-review-comment">${esc(r.comment)}</p>` : ''}
      </div>`;
  }).join('') || `<div class="pp-empty-state"><p>Ingen vurderinger endnu.</p></div>`;

  const writeReviewHtml = (!isOwnProfile && currentUser && !hasReviewed && hasTraded) ? `
    <div class="up-write-review" id="write-review-wrap">
      <h4 style="font-family:'Fraunces',serif;font-size:1.05rem;margin-bottom:12px;">Giv en vurdering</h4>
      <div class="up-star-picker" id="star-picker">
        ${[1,2,3,4,5].map(i => `<span class="star-pick" data-val="${i}" onclick="pickStar(${i})">★</span>`).join('')}
      </div>
      <textarea id="review-comment" class="up-review-textarea" placeholder="Fortæl om din handel med ${esc(displayName)}... (valgfrit)"></textarea>
      <button class="btn-submit-review" onclick="submitReview('${profile.id}')">Send vurdering</button>
    </div>` : '';

  const sendMsgHtml = (!isOwnProfile && currentUser && nActive > 0) ? `
    <div class="pp-cta-section">
      <button class="pp-cta-btn" onclick="toggleProfileContact()">Send besked</button>
      <div class="up-contact-form" id="up-contact-form" style="display:none;">
        ${nActive > 1 ? `
        <select class="up-contact-bike-select" id="up-contact-bike-select">
          ${(activeBikes || []).map(b => `<option value="${b.id}">${esc(b.brand)} ${esc(b.model)} – ${b.price.toLocaleString('da-DK')} kr.</option>`).join('')}
        </select>` : `<input type="hidden" id="up-contact-bike-select" value="${activeBikes[0].id}">`}
        <textarea id="up-contact-message" class="up-review-textarea" placeholder="Skriv en besked til ${esc(displayName)}..." rows="3"></textarea>
        <button class="up-contact-send-btn" onclick="sendProfileMessage('${profile.id}')">Send besked</button>
      </div>
    </div>` : '';

  const backAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";

  return `
    <div class="pp-wrap">
      <button class="pp-back-btn" onclick="${backAction}">← Tilbage</button>

      <div class="pp-header">
        <div class="pp-avatar">${avatarContent}</div>
        <div class="pp-info">
          <h1 class="pp-name">
            ${esc(displayName)}
            ${profile.verified ? '<span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}
            ${profile.email_verified ? '<span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}
          </h1>
          <div class="pp-badges">
            <span class="badge ${isDealer ? 'badge-dealer' : 'badge-private'}">${isDealer ? '🏪 Forhandler' : '👤 Privat sælger'}</span>
            ${memberSince ? `<span class="pp-member-since">Medlem siden ${memberSince}</span>` : ''}
          </div>
          ${isDealer && profile.address ? `<div class="pp-location">📍 ${esc(profile.address)}${profile.city ? ', ' + esc(profile.city) : ''}</div>` : profile.city ? `<div class="pp-location">📍 ${esc(profile.city)}</div>` : ''}
          ${lastSeenText ? `<div class="pp-last-seen">Sidst aktiv ${lastSeenText}</div>` : ''}
          ${profile.bio ? `<p class="pp-bio">${esc(profile.bio)}</p>` : ''}
          ${sendMsgHtml}
        </div>
      </div>

      <div class="pp-trust-bar">
        <div class="pp-trust-item" onclick="switchUserProfileTab('listings')">
          <div class="pp-trust-val">${nActive}</div>
          <div class="pp-trust-label">Til salg</div>
        </div>
        <div class="pp-trust-item" onclick="switchUserProfileTab('sold')">
          <div class="pp-trust-val">${nSold}</div>
          <div class="pp-trust-label">Solgt</div>
        </div>
        <div class="pp-trust-item" onclick="switchUserProfileTab('reviews')">
          <div class="pp-trust-val">${avgRating !== null ? avgRating.toFixed(1) + ' ★' : '–'}</div>
          <div class="pp-trust-label">${nReviews} ${nReviews === 1 ? 'vurdering' : 'vurderinger'}</div>
        </div>
      </div>

      <div class="pp-achievements" id="user-achievements"></div>

      <div class="up-tabs pp-tabs">
        <button class="up-tab active" data-tab="listings" onclick="switchUserProfileTab('listings')">Til salg (${nActive})</button>
        <button class="up-tab" data-tab="sold" onclick="switchUserProfileTab('sold')">Solgt (${nSold})</button>
        <button class="up-tab" data-tab="reviews" onclick="switchUserProfileTab('reviews')">Vurderinger${avgRating !== null ? ` ${avgRating.toFixed(1)} ★` : ` (${nReviews})`}</button>
      </div>

      <div id="up-tab-listings" class="up-tab-panel">
        <div class="pp-bikes-grid">${bikeCards}</div>
      </div>
      <div id="up-tab-sold" class="up-tab-panel" style="display:none;">
        <div class="up-sold-list">${soldRows}</div>
      </div>
      <div id="up-tab-reviews" class="up-tab-panel" style="display:none;">
        <div class="up-reviews-list">${reviewCards}</div>
        ${writeReviewHtml}
      </div>
    </div>`;
}

function buildDealerProfilePageHTML(data) {
  const { dealer, bikes, reviews, messagesCount } = data;
  const displayName  = dealer.shop_name || dealer.name || 'Forhandler';
  const initials     = displayName.substring(0, 2).toUpperCase();
  const memberSince  = dealer.created_at ? new Date(dealer.created_at).toLocaleDateString('da-DK', { year: 'numeric', month: 'long' }) : null;
  const isOwnProfile = currentUser && currentUser.id === dealer.id;
  const reviewList   = reviews || [];
  const avgRating    = reviewList.length ? (reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) : null;
  const hasReviewed  = currentUser && reviewList.some(r => r.reviewer_id === currentUser.id);
  const hasTraded    = currentUser && messagesCount > 0;
  const nActive      = bikes.length;
  const nReviews     = reviewList.length;

  const avatarContent = safeAvatarUrl(dealer.avatar_url)
    ? `<img src="${safeAvatarUrl(dealer.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  const bikeCards = nActive > 0 ? buildProfileBikeCards(bikes)
    : `<div class="pp-empty-state"><div class="pp-empty-icon">🚲</div><p>Ingen aktive annoncer fra denne forhandler.</p></div>`;

  const reviewCards = reviewList.map(r => {
    const rName = r.reviewer?.seller_type === 'dealer' ? r.reviewer.shop_name : r.reviewer?.name;
    const rInit = (rName || 'U').substring(0, 2).toUpperCase();
    const date  = new Date(r.created_at).toLocaleDateString('da-DK', { year:'numeric', month:'short', day:'numeric' });
    return `
      <div class="up-review-card">
        <div class="up-review-top">
          <div class="up-review-avatar">${rInit}</div>
          <div>
            <div class="up-review-name">${esc(rName || 'Anonym')}</div>
            <div class="up-review-stars">${starsHTML(r.rating)}</div>
          </div>
          <div class="up-review-date">${date}</div>
        </div>
        ${r.comment ? `<p class="up-review-comment">${esc(r.comment)}</p>` : ''}
      </div>`;
  }).join('') || `<div class="pp-empty-state"><p>Ingen vurderinger endnu.</p></div>`;

  const writeReviewHtml = (!isOwnProfile && currentUser && !hasReviewed && hasTraded) ? `
    <div class="up-write-review" id="write-review-wrap">
      <h4 style="font-family:'Fraunces',serif;font-size:1.05rem;margin-bottom:12px;">Giv en vurdering</h4>
      <div class="up-star-picker" id="star-picker">
        ${[1,2,3,4,5].map(i => `<span class="star-pick" data-val="${i}" onclick="pickStar(${i})">★</span>`).join('')}
      </div>
      <textarea id="review-comment" class="up-review-textarea" placeholder="Fortæl om din handel med ${esc(displayName)}... (valgfrit)"></textarea>
      <button class="btn-submit-review" onclick="submitReview('${dealer.id}')">Send vurdering</button>
    </div>` : '';

  const contactHtml = (!isOwnProfile && currentUser && nActive > 0) ? `
    <div class="pp-cta-section">
      <button class="pp-cta-btn" onclick="toggleProfileContact()">Kontakt forhandler</button>
      <div class="up-contact-form" id="up-contact-form" style="display:none;">
        ${nActive > 1 ? `
        <select class="up-contact-bike-select" id="up-contact-bike-select">
          ${bikes.map(b => `<option value="${b.id}">${esc(b.brand)} ${esc(b.model)} – ${b.price.toLocaleString('da-DK')} kr.</option>`).join('')}
        </select>` : `<input type="hidden" id="up-contact-bike-select" value="${bikes[0].id}">`}
        <textarea id="up-contact-message" class="up-review-textarea" placeholder="Skriv en besked til ${esc(displayName)}..." rows="3"></textarea>
        <button class="up-contact-send-btn" onclick="sendProfileMessage('${dealer.id}')">Send besked</button>
      </div>
    </div>` : '';

  const backAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";

  return `
    <div class="pp-wrap">
      <button class="pp-back-btn" onclick="${backAction}">← Tilbage</button>

      <div class="pp-header">
        <div class="pp-avatar">${avatarContent}</div>
        <div class="pp-info">
          <h1 class="pp-name">
            ${esc(displayName)}
            ${dealer.verified    ? '<span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}
            ${dealer.email_verified ? '<span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}
          </h1>
          <div class="pp-badges">
            <span class="badge badge-dealer">🏪 Forhandler</span>
            ${memberSince ? `<span class="pp-member-since">Medlem siden ${memberSince}</span>` : ''}
          </div>
          ${dealer.city ? `
            <div class="pp-location">
              📍 ${esc(dealer.address ? dealer.address + ', ' : '')}${esc(dealer.city)}
              <a class="pp-maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((dealer.address ? dealer.address + ', ' : '') + dealer.city)}" target="_blank" rel="noopener noreferrer" title="Åbn i Google Maps">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Åbn i Google Maps
              </a>
            </div>` : ''}
          ${dealer.bio ? `<p class="pp-bio">${esc(dealer.bio)}</p>` : ''}
          ${contactHtml}
        </div>
      </div>

      <div class="pp-trust-bar">
        <div class="pp-trust-item" onclick="switchDealerProfileTab('listings')">
          <div class="pp-trust-val">${nActive}</div>
          <div class="pp-trust-label">Til salg</div>
        </div>
        <div class="pp-trust-item" onclick="switchDealerProfileTab('reviews')">
          <div class="pp-trust-val">${avgRating !== null ? avgRating.toFixed(1) + ' ★' : '–'}</div>
          <div class="pp-trust-label">${nReviews} ${nReviews === 1 ? 'vurdering' : 'vurderinger'}</div>
        </div>
      </div>

      <div class="pp-achievements" id="dealer-achievements"></div>

      <div class="up-tabs pp-tabs">
        <button class="dp-tab up-tab active" data-tab="listings" onclick="switchDealerProfileTab('listings')">Til salg (${nActive})</button>
        <button class="dp-tab up-tab" data-tab="reviews" onclick="switchDealerProfileTab('reviews')">Vurderinger${avgRating !== null ? ` ${avgRating.toFixed(1)} ★` : ` (${nReviews})`}</button>
      </div>

      <div id="dp-tab-listings" class="up-tab-panel">
        <div class="pp-bikes-grid">${bikeCards}</div>
      </div>
      <div id="dp-tab-reviews" class="up-tab-panel" style="display:none;">
        <div class="up-reviews-list">${reviewCards}</div>
        ${writeReviewHtml}
      </div>
    </div>`;
}

async function renderUserProfilePage(userId) {
  showDetailView();
  const detailView = document.getElementById('detail-view');
  detailView.innerHTML = renderProfileSkeleton();

  let data;
  try {
    data = await fetchUserProfileData(userId);
  } catch (e) {
    const back = history.length > 1 ? 'history.back()' : "navigateTo('/')";
    detailView.innerHTML = `<div class="pp-wrap"><button class="pp-back-btn" onclick="${back}">← Tilbage</button><div class="pp-empty-state"><p style="color:var(--rust);">Kunne ikke hente profil.</p></div></div>`;
    return;
  }
  if (!data.profile) {
    const back = history.length > 1 ? 'history.back()' : "navigateTo('/')";
    detailView.innerHTML = `<div class="pp-wrap"><button class="pp-back-btn" onclick="${back}">← Tilbage</button><div class="pp-empty-state"><p>Profilen blev ikke fundet.</p></div></div>`;
    return;
  }

  const displayName = data.profile.seller_type === 'dealer' ? (data.profile.shop_name || data.profile.name) : data.profile.name;
  document.title = `${displayName} – Profil | Cykelbørsen`;
  updateSEOMeta(`Se ${displayName}s profil og cykler til salg på Cykelbørsen.`, `/profile/${userId}`);
  detailView.innerHTML = buildUserProfilePageHTML(data);

  // Aktivér stjerne-hover for anmeldelses-form
  document.querySelectorAll('.star-pick').forEach(s => {
    s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
    s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
  });
  window._pickedStar = 0;
  loadUserAchievements(userId, data.activeBikes, data.soldBikes, data.reviews, data.profile);
}

async function renderDealerProfilePage(dealerId) {
  showDetailView();
  const detailView = document.getElementById('detail-view');
  detailView.innerHTML = renderProfileSkeleton();

  let data;
  try {
    data = await fetchDealerProfileData(dealerId);
  } catch (e) {
    const back = history.length > 1 ? 'history.back()' : "navigateTo('/')";
    detailView.innerHTML = `<div class="pp-wrap"><button class="pp-back-btn" onclick="${back}">← Tilbage</button><div class="pp-empty-state"><p style="color:var(--rust);">Kunne ikke hente forhandler.</p></div></div>`;
    return;
  }
  if (!data.dealer) {
    const back = history.length > 1 ? 'history.back()' : "navigateTo('/')";
    detailView.innerHTML = `<div class="pp-wrap"><button class="pp-back-btn" onclick="${back}">← Tilbage</button><div class="pp-empty-state"><p>Forhandleren blev ikke fundet.</p></div></div>`;
    return;
  }

  const displayName = data.dealer.shop_name || data.dealer.name || 'Forhandler';
  document.title = `${displayName} – Forhandler | Cykelbørsen`;
  updateSEOMeta(`${displayName} – Autoriseret cykelforhandler på Cykelbørsen. Se udvalg og anmeldelser.`, `/dealer/${dealerId}`);
  detailView.innerHTML = buildDealerProfilePageHTML(data);

  // Star-hover for vurderingsform (samme som user profile)
  document.querySelectorAll('.star-pick').forEach(s => {
    s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
    s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
  });
  window._pickedStar = 0;
  loadUserAchievements(dealerId, data.bikes, [], data.reviews, data.dealer);
}

function navigateToProfile(userId) {
  navigateTo(`/profile/${userId}`);
}
function navigateToDealer(dealerId) {
  navigateTo(`/dealer/${dealerId}`);
}

/* ============================================================
   MIN PROFIL SIDE (#/me)
   ============================================================ */

function navigateToMyProfile() {
  navigateTo('/me');
}

async function renderMyProfilePage() {
  if (!currentUser || !currentProfile) {
    showListingView();
    openLoginModal();
    return;
  }

  showDetailView();
  const detailView = document.getElementById('detail-view');
  detailView.innerHTML     = renderProfileSkeleton();

  document.title = `Min profil | Cykelbørsen`;
  detailView.innerHTML = buildMyProfilePageHTML();
  loadMyListings('mp-listings-grid');
}

function buildMyProfilePageHTML() {
  const p           = currentProfile;
  const u           = currentUser;
  const isDealer    = p.seller_type === 'dealer';
  const displayName = isDealer ? (p.shop_name || p.name) : (p.name || 'Min profil');
  const initials    = (displayName || 'U').substring(0, 2).toUpperCase();
  const memberSince = p.created_at
    ? new Date(p.created_at).toLocaleDateString('da-DK', { year: 'numeric', month: 'long' })
    : null;

  const avatarContent = safeAvatarUrl(p.avatar_url)
    ? `<img src="${safeAvatarUrl(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  return `
    <div class="mp-wrap">

      <div class="mp-top">
        <button class="mp-back-btn" onclick="navigateTo('/')">← Forside</button>
        <h1 class="mp-title">Min konto</h1>
        <p class="mp-subtitle">Administrér dine annoncer, gemte søgninger og kontooplysninger</p>
      </div>

      <div class="mp-account-card">
        <div class="mp-avatar">${avatarContent}</div>
        <div class="mp-info">
          <h2 class="mp-name">
            ${esc(displayName)}
            ${p.verified    ? '<span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}
            ${p.email_verified ? '<span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}
          </h2>
          <div class="mp-meta">
            <span class="badge ${isDealer ? 'badge-dealer' : 'badge-private'}">${isDealer ? '🏪 Forhandler' : '👤 Privat sælger'}</span>
            ${memberSince ? `<span class="mp-member-since">Medlem siden ${memberSince}</span>` : ''}
          </div>
          ${p.city   ? `<div class="mp-location">📍 ${esc(p.city)}</div>` : ''}
          ${u?.email ? `<div class="mp-email">✉️ ${esc(u.email)}</div>` : ''}
        </div>
        <div class="mp-header-actions">
          <button class="mp-action-btn" onclick="openProfileModal()">✏️ Redigér profil</button>
          <button class="mp-action-btn mp-action-btn--secondary" onclick="navigateTo('/inbox')">✉️ Indbakke</button>
          <button class="mp-action-btn mp-action-btn--logout" onclick="logout()">Log ud</button>
        </div>
      </div>

      <div class="mp-stats-row">
        <div class="mp-stat-box" onclick="switchMyProfileTab('listings')" title="Mine annoncer">
          <span class="mp-stat-num" id="mp-stat-listings">–</span>
          <span class="mp-stat-label">Annoncer</span>
        </div>
        <div class="mp-stat-box" onclick="switchMyProfileTab('saved')" title="Gemte annoncer">
          <span class="mp-stat-num" id="mp-stat-saved">–</span>
          <span class="mp-stat-label">Gemte</span>
        </div>
        <div class="mp-stat-box" onclick="switchMyProfileTab('trades')" title="Handler">
          <span class="mp-stat-num" id="mp-stat-trades">–</span>
          <span class="mp-stat-label">Handler</span>
        </div>
      </div>

      ${!isDealer ? `<div class="mp-verify-card">
        <div class="mp-verify-title">Verificering</div>
        <div class="mp-verify-items">
          <div class="mp-verify-item ${u?.email_confirmed_at ? 'verified' : ''}">
            <span class="mp-verify-icon">✉️</span>
            <span class="mp-verify-label">E-mail</span>
            <span class="mp-verify-check">${u?.email_confirmed_at ? '✓' : '–'}</span>
          </div>
        </div>
        ${!u?.email_confirmed_at ? '<button class="mp-verify-cta" onclick="openProfileModal()">Bekræft e-mail →</button>' : ''}
      </div>` : ''}

      <div id="mp-achievements" class="mp-achievements"></div>

      <div class="mp-tabs">
        <button class="mp-tab active" data-tab="listings" onclick="switchMyProfileTab('listings')">Mine annoncer</button>
        <button class="mp-tab" data-tab="saved"    onclick="switchMyProfileTab('saved')">Gemte</button>
        <button class="mp-tab" data-tab="searches" onclick="switchMyProfileTab('searches')">Søgninger</button>
        <button class="mp-tab" data-tab="trades"   onclick="switchMyProfileTab('trades')">Handler</button>
      </div>

      <div id="mp-panel-listings" class="mp-tab-panel">
        <div id="mp-listings-grid"><p style="color:var(--muted)">Henter annoncer…</p></div>
      </div>
      <div id="mp-panel-saved" class="mp-tab-panel" style="display:none;">
        <div id="mp-saved-grid"><p style="color:var(--muted)">Henter gemte…</p></div>
      </div>
      <div id="mp-panel-searches" class="mp-tab-panel" style="display:none;">
        <div id="mp-searches-list"><p style="color:var(--muted)">Henter søgninger…</p></div>
      </div>
      <div id="mp-panel-trades" class="mp-tab-panel" style="display:none;">
        <div id="mp-trades-list"><p style="color:var(--muted)">Henter handler…</p></div>
      </div>
    </div>`;
}

function switchMyProfileTab(tab) {
  document.querySelectorAll('.mp-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));
  ['listings', 'saved', 'searches', 'trades'].forEach(t => {
    const panel = document.getElementById(`mp-panel-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'listings') loadMyListings('mp-listings-grid');
  if (tab === 'saved')    loadSavedListings('mp-saved-grid');
  if (tab === 'searches') loadSavedSearches('mp-searches-list');
  if (tab === 'trades')   loadTradeHistory('mp-trades-list');
}

// SPA navigation helper — pushState + route handling
function navigateTo(path) {
  document.body.classList.remove('on-sell-page');
  history.pushState({}, '', path);
  handleRoute();
}

function handleRoute() {
  const path = window.location.pathname;
  const bikeMatch    = path.match(/^\/bike\/([^/]+)$/);
  const profileMatch = path.match(/^\/profile\/([^/]+)$/);
  const dealerMatch  = path.match(/^\/dealer\/([^/]+)$/);
  const meMatch      = path === '/me';
  const sellMatch    = path === '/sell';
  const inboxMatch   = path === '/inbox';
  const dealerApply  = path === '/bliv-forhandler';
  const dealersMatch = path === '/forhandlere';
  const mapPageMatch = path === '/kort';
  const staticMatch  = { '/om-os': 'about', '/vilkaar': 'terms', '/privatlivspolitik': 'privacy', '/kontakt': 'contact', '/guide/tjek-brugt-cykel': 'guide-tjek' }[path];
  if (staticMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderStaticPage(staticMatch);
  } else if (dealerApply) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderBecomeDealerPage();
  } else if (dealersMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderDealersPage();
  } else if (mapPageMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderMapPage();
  } else if (inboxMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderInboxPage();
  } else if (meMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderMyProfilePage();
  } else if (sellMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderSellPage();
  } else if (bikeMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderBikePage(bikeMatch[1]);
  } else if (profileMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderUserProfilePage(profileMatch[1]);
  } else if (dealerMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderDealerProfilePage(dealerMatch[1]);
  } else {
    showListingView();
  }
}

window.addEventListener('popstate', handleRoute);

function navigateToBike(bikeId) {
  navigateTo(`/bike/${bikeId}`);
}

async function loadResponseTime(sellerId) {
  const badge = document.getElementById('response-time-badge');
  if (!badge) {
    return;
  }

  try {
    // Hent sælgers udgående beskeder (svar) og find gennemsnitlig responstid
    const { data, error: outErr } = await supabase
      .from('messages')
      .select('created_at, bike_id, sender_id, receiver_id')
      .eq('sender_id', sellerId)
      .order('created_at', { ascending: true })
      .limit(100);


    if (!data || data.length < 3) {
      badge.textContent = '';
      return;
    }

    // Find tråde hvor sælger svarede på en indgående besked
    const { data: received, error: inErr } = await supabase
      .from('messages')
      .select('created_at, bike_id, sender_id')
      .eq('receiver_id', sellerId)
      .order('created_at', { ascending: true })
      .limit(100);


    if (!received || received.length === 0) {
      badge.textContent = '';
      return;
    }

    // Beregn responstid per tråd
    const responseTimes = [];
    received.forEach(inMsg => {
      const reply = data.find(outMsg =>
        outMsg.bike_id === inMsg.bike_id &&
        new Date(outMsg.created_at) > new Date(inMsg.created_at)
      );
      if (reply) {
        const mins = (new Date(reply.created_at) - new Date(inMsg.created_at)) / 60000;
        if (mins > 0 && mins < 60 * 24 * 7) responseTimes.push(mins); // max 1 uge
      }
    });

    if (responseTimes.length < 2) {
      badge.textContent = '';
      return;
    }

    const avgMins = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    let label;
    if (avgMins < 60)        label = `Svarer typisk inden for en time`;
    else if (avgMins < 360)  label = `Svarer typisk inden for ${Math.round(avgMins / 60)} timer`;
    else if (avgMins < 1440) label = `Svarer typisk samme dag`;
    else                     label = `Svarer typisk inden for ${Math.round(avgMins / 1440)} dage`;

    badge.textContent = `⏱ ${label}`;
  } catch (e) {
    console.error('loadResponseTime error:', e.message);
    badge.textContent = '';
  }
}

/* ── Sælgerens andre annoncer ── */

async function loadSellerOtherListings(sellerId, currentBikeId) {
  const wrap = document.getElementById('seller-other-listings');
  if (!wrap || !sellerId) {
    return;
  }

  try {
    const { data, error: queryErr } = await supabase
      .from('bikes')
      .select('id, brand, model, price, type, condition, bike_images(url, is_primary)')
      .eq('user_id', sellerId)
      .eq('is_active', true)
      .neq('id', currentBikeId)
      .order('created_at', { ascending: false })
      .limit(6);


    if (!data || data.length === 0) {
      return;
    } // Ingen andre annoncer — skjul sektionen

    const cards = data.map(bike => {
      const img = bike.bike_images?.find(i => i.is_primary)?.url || bike.bike_images?.[0]?.url;
      return `
        <div class="related-card" onclick="navigateToBike('${bike.id}')">
          <div class="related-card-img">
            ${img ? `<img src="${img}" alt="${esc(bike.brand)} ${esc(bike.model)}" loading="lazy">` : '<span style="font-size:2rem">🚲</span>'}
          </div>
          <div class="related-card-info">
            <div class="related-card-title">${esc(bike.brand)} ${esc(bike.model)}</div>
            <div class="related-card-price">${bike.price.toLocaleString('da-DK')} kr.</div>
            <div class="related-card-meta">${esc(bike.condition || '')}</div>
          </div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <h3 class="related-section-title">Sælgerens andre annoncer</h3>
      <div class="related-grid">${cards}</div>`;
  } catch (e) {
    console.error('loadSellerOtherListings error:', e.message);
    console.error('loadSellerOtherListings fejl:', e);
  }
}

/* ── Lignende annoncer ── */

async function loadSimilarListings(bikeType, currentBikeId) {
  const wrap = document.getElementById('similar-listings');
  if (!wrap || !bikeType) {
    return;
  }

  try {
    const { data, error: queryErr } = await supabase
      .from('bikes')
      .select('id, brand, model, price, type, condition, bike_images(url, is_primary)')
      .eq('type', bikeType)
      .eq('is_active', true)
      .neq('id', currentBikeId)
      .order('created_at', { ascending: false })
      .limit(8);


    if (!data || data.length === 0) {
      return;
    }

    const cards = data.map(bike => {
      const img = bike.bike_images?.find(i => i.is_primary)?.url || bike.bike_images?.[0]?.url;
      return `
        <div class="related-card" onclick="navigateToBike('${bike.id}')">
          <div class="related-card-img">
            ${img ? `<img src="${img}" alt="${esc(bike.brand)} ${esc(bike.model)}" loading="lazy">` : '<span style="font-size:2rem">🚲</span>'}
          </div>
          <div class="related-card-info">
            <div class="related-card-title">${esc(bike.brand)} ${esc(bike.model)}</div>
            <div class="related-card-price">${bike.price.toLocaleString('da-DK')} kr.</div>
            <div class="related-card-meta">${esc(bike.condition || '')}</div>
          </div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <h3 class="related-section-title">Lignende annoncer</h3>
      <div class="related-grid">${cards}</div>`;
  } catch (e) {
    console.error('loadSimilarListings error:', e.message);
  }
}

/* ── Rapporter annonce ── */

let _reportBikeId    = null;
let _reportBikeTitle = null;

function openReportModal(bikeId, bikeTitle) {
  _reportBikeId    = bikeId;
  _reportBikeTitle = bikeTitle;
  document.getElementById('report-reason').value  = '';
  document.getElementById('report-details').value = '';
  const btn = document.getElementById('report-submit-btn');
  btn.disabled    = false;
  btn.textContent = 'Send rapport';
  document.getElementById('report-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeReportModal() {
  document.getElementById('report-modal').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitReport() {
  const reason  = document.getElementById('report-reason').value.trim();
  const details = document.getElementById('report-details').value.trim();
  if (!reason) { showToast('Vælg venligst en årsag'); return; }

  const btn = document.getElementById('report-submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Sender...';

  try {
    await supabase.functions.invoke('notify-message', {
      body: {
        type:           'report_listing',
        bike_id:        _reportBikeId,
        bike_title:     _reportBikeTitle,
        reason,
        details:        details || null,
        reporter_name:  currentProfile?.name  ?? null,
        reporter_email: currentUser?.email    ?? null,
      },
    });
    closeReportModal();
    showToast('Tak – din rapport er modtaget');
  } catch (err) {
    console.error('Rapport fejlede:', err);
    btn.disabled    = false;
    btn.textContent = 'Send rapport';
    showToast('Noget gik galt – prøv igen');
  }
}

function closeBikeModal() {
  const modal = document.getElementById('bike-modal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  if (typeof modal._restoreTitle === 'function') {
    modal._restoreTitle();
    modal._restoreTitle = null;
  }
}
document.getElementById('bike-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBikeModal();
});

/* ── Billedgalleri navigation ── */

function galleryGoto(index) {
  const images = window._galleryImages || [];
  if (!images.length) return;
  window._galleryIndex = (index + images.length) % images.length;
  const mainImg = document.getElementById('gallery-main-img');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = images[window._galleryIndex];
      mainImg.style.opacity = '1';
      const bg = document.getElementById('gallery-main-bg');
      if (bg) bg.style.backgroundImage = `url('${images[window._galleryIndex]}')`;
    }, 150);
  }
  const counter = document.getElementById('gallery-counter');
  if (counter) counter.textContent = `${window._galleryIndex + 1} / ${images.length}`;
  document.querySelectorAll('.gallery-thumb').forEach((btn, i) => {
    btn.classList.toggle('active', i === window._galleryIndex);
  });
}

function galleryNav(dir) {
  galleryGoto((window._galleryIndex || 0) + dir);
}

function attachGallerySwipe() {
  const mainEl = document.querySelector('.gallery-main');
  if (!mainEl || mainEl._swipeAttached) return;
  mainEl._swipeAttached = true;
  let startX = 0;
  mainEl.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });
  mainEl.addEventListener('touchend', (e) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) galleryNav(diff > 0 ? 1 : -1);
  }, { passive: true });
}

window.galleryNav  = galleryNav;
window.galleryGoto = galleryGoto;

/* ── Fuldskærms lightbox med pinch-zoom og swipe ── */

let _lb = {
  scale: 1, tx: 0, ty: 0,
  startDist: 0, startScale: 1,
  startX: 0, startY: 0, startTx: 0, startTy: 0,
  touchMode: null, // 'pan' | 'pinch' | 'swipe' | null
  lastTap: 0,
};

function openLightbox(index) {
  const images = window._galleryImages || [];
  if (!images.length) return;
  window._galleryIndex = ((index ?? window._galleryIndex ?? 0) + images.length) % images.length;
  const modal = document.getElementById('lightbox-modal');
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  lightboxShow(window._galleryIndex);
  const hint = document.getElementById('lightbox-hint');
  if (hint) {
    hint.classList.remove('fade');
    setTimeout(() => hint.classList.add('fade'), 2200);
  }
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  lightboxResetZoom();
  // Synkroniser galleri-visning med lightbox-index
  galleryGoto(window._galleryIndex || 0);
}

function lightboxShow(index) {
  const images = window._galleryImages || [];
  if (!images.length) return;
  window._galleryIndex = (index + images.length) % images.length;
  const img = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  if (img) img.src = images[window._galleryIndex];
  if (counter) counter.textContent = `${window._galleryIndex + 1} / ${images.length}`;
  lightboxResetZoom();
}

function lightboxNav(dir) {
  lightboxShow((window._galleryIndex || 0) + dir);
}

function lightboxResetZoom() {
  _lb.scale = 1; _lb.tx = 0; _lb.ty = 0;
  const img = document.getElementById('lightbox-img');
  if (img) img.style.transform = 'translate(0px, 0px) scale(1)';
}

function lightboxApplyTransform() {
  const img = document.getElementById('lightbox-img');
  if (!img) return;
  img.style.transform = `translate(${_lb.tx}px, ${_lb.ty}px) scale(${_lb.scale})`;
}

function lightboxClampPan() {
  const img = document.getElementById('lightbox-img');
  const stage = document.getElementById('lightbox-stage');
  if (!img || !stage) return;
  const rect = stage.getBoundingClientRect();
  const scaledW = img.clientWidth * _lb.scale;
  const scaledH = img.clientHeight * _lb.scale;
  const maxX = Math.max(0, (scaledW - rect.width) / 2);
  const maxY = Math.max(0, (scaledH - rect.height) / 2);
  _lb.tx = Math.max(-maxX, Math.min(maxX, _lb.tx));
  _lb.ty = Math.max(-maxY, Math.min(maxY, _lb.ty));
}

function initLightboxGestures() {
  const stage = document.getElementById('lightbox-stage');
  const img = document.getElementById('lightbox-img');
  const overlay = document.getElementById('lightbox-modal');
  if (!stage || !img || !overlay || stage._gesturesAttached) return;
  stage._gesturesAttached = true;

  // Luk på klik på baggrund (ikke på billede/knapper), når ikke zoomet
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === stage) {
      if (_lb.scale === 1) closeLightbox();
    }
  });

  // Dobbelt-klik (desktop) for zoom-toggle
  img.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (_lb.scale === 1) {
      const rect = stage.getBoundingClientRect();
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;
      _lb.scale = 2.5;
      _lb.tx = clickX * (1 - 2.5);
      _lb.ty = clickY * (1 - 2.5);
      lightboxClampPan();
    } else {
      lightboxResetZoom();
      return;
    }
    img.classList.add('dragging');
    lightboxApplyTransform();
    setTimeout(() => img.classList.remove('dragging'), 200);
  });

  // Mus-hjul til zoom mod cursor-position
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const oldScale = _lb.scale;
    const delta = -e.deltaY * 0.002;
    const newScale = Math.max(1, Math.min(5, oldScale + delta * oldScale));
    if (newScale === oldScale) return;
    const rect = stage.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;
    const factor = newScale / oldScale;
    _lb.tx = cursorX - factor * (cursorX - _lb.tx);
    _lb.ty = cursorY - factor * (cursorY - _lb.ty);
    _lb.scale = newScale;
    if (_lb.scale === 1) { _lb.tx = 0; _lb.ty = 0; }
    else lightboxClampPan();
    lightboxApplyTransform();
  }, { passive: false });

  // Mus-pan når zoomet
  let mouseDown = false;
  stage.addEventListener('mousedown', (e) => {
    if (_lb.scale <= 1) return;
    mouseDown = true;
    _lb.startX = e.clientX; _lb.startY = e.clientY;
    _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
    img.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    _lb.tx = _lb.startTx + (e.clientX - _lb.startX);
    _lb.ty = _lb.startTy + (e.clientY - _lb.startY);
    lightboxClampPan();
    lightboxApplyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    img.classList.remove('dragging');
  });

  // Touch: pinch + pan + swipe + double-tap
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      _lb.touchMode = 'pinch';
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      _lb.startDist = Math.hypot(dx, dy);
      _lb.startScale = _lb.scale;
      img.classList.add('dragging');
    } else if (e.touches.length === 1) {
      _lb.startX = e.touches[0].clientX;
      _lb.startY = e.touches[0].clientY;
      _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
      _lb.touchMode = _lb.scale > 1 ? 'pan' : 'swipe';
      // Double-tap detektion
      const now = Date.now();
      if (now - _lb.lastTap < 280) {
        if (_lb.scale === 1) { _lb.scale = 2.5; _lb.tx = 0; _lb.ty = 0; }
        else lightboxResetZoom();
        img.classList.add('dragging');
        lightboxApplyTransform();
        setTimeout(() => img.classList.remove('dragging'), 200);
        _lb.touchMode = null;
      }
      _lb.lastTap = now;
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (_lb.touchMode === 'pinch' && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / (_lb.startDist || 1);
      _lb.scale = Math.max(1, Math.min(5, _lb.startScale * ratio));
      if (_lb.scale === 1) { _lb.tx = 0; _lb.ty = 0; }
      else lightboxClampPan();
      lightboxApplyTransform();
      e.preventDefault();
    } else if (_lb.touchMode === 'pan' && e.touches.length === 1) {
      _lb.tx = _lb.startTx + (e.touches[0].clientX - _lb.startX);
      _lb.ty = _lb.startTy + (e.touches[0].clientY - _lb.startY);
      lightboxClampPan();
      lightboxApplyTransform();
      e.preventDefault();
    }
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    if (_lb.touchMode === 'swipe' && e.changedTouches.length === 1) {
      const diffX = _lb.startX - e.changedTouches[0].clientX;
      const diffY = _lb.startY - e.changedTouches[0].clientY;
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        lightboxNav(diffX > 0 ? 1 : -1);
      } else if (diffY < -80 && Math.abs(diffY) > Math.abs(diffX)) {
        // Træk ned → luk
        closeLightbox();
      }
    }
    img.classList.remove('dragging');
    _lb.touchMode = null;
  }, { passive: true });

  // Klik på billedet lukker hvis ikke zoomet
  img.addEventListener('click', (e) => {
    if (_lb.scale === 1) {
      e.stopPropagation();
    }
  });
}

document.addEventListener('DOMContentLoaded', initLightboxGestures);
if (document.readyState !== 'loading') initLightboxGestures();

// Escape lukker lightbox først (før andre modaler)
document.addEventListener('keydown', (e) => {
  const lb = document.getElementById('lightbox-modal');
  if (!lb || !lb.classList.contains('open')) return;
  if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
  else if (e.key === 'ArrowLeft') lightboxNav(-1);
  else if (e.key === 'ArrowRight') lightboxNav(1);
}, true);

window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.lightboxNav = lightboxNav;

function updateMeetMiddle(listingPrice) {
  const input = document.getElementById('bid-amount');
  const el    = document.getElementById('meet-middle');
  const priceEl = document.getElementById('meet-middle-price');
  if (!input || !el || !priceEl) return;
  const bid = parseInt(input.value);
  if (!bid || bid <= 0 || bid >= listingPrice) { el.style.display = 'none'; return; }
  const middle = Math.round((bid + listingPrice) / 2 / 50) * 50; // rund til nærmeste 50
  priceEl.textContent = middle.toLocaleString('da-DK') + ' kr.';
  el.style.display = 'flex';
}

function useMeetMiddle() {
  const priceEl = document.getElementById('meet-middle-price');
  const input   = document.getElementById('bid-amount');
  if (!priceEl || !input) return;
  const val = priceEl.textContent.replace(/[^\d]/g, '');
  input.value = val;
  document.getElementById('meet-middle').style.display = 'none';
}

function toggleBidBox() {
  if (!currentUser) { openLoginModal(); return; }
  const box = document.getElementById('bid-box');
  const msgBox = document.getElementById('message-box');
  if (msgBox) msgBox.style.display = 'none';
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
  if (box.style.display === 'block') document.getElementById('bid-amount').focus();
}

function toggleMessageBox() {
  if (!currentUser) { openLoginModal(); return; }
  const box = document.getElementById('message-box');
  const bidBox = document.getElementById('bid-box');
  if (bidBox) bidBox.style.display = 'none';
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
  if (box.style.display === 'block') document.getElementById('message-text').focus();
}

function stickyBarAction(kind) {
  if (!currentUser) { openLoginModal(); return; }
  const targetId = kind === 'bid' ? 'bid-box' : 'message-box';
  const target = document.getElementById(targetId);
  if (!target) return;
  if (kind === 'bid') {
    const box = document.getElementById('bid-box');
    const msgBox = document.getElementById('message-box');
    if (msgBox) msgBox.style.display = 'none';
    box.style.display = 'block';
  } else {
    const box = document.getElementById('message-box');
    const bidBox = document.getElementById('bid-box');
    if (bidBox) bidBox.style.display = 'none';
    box.style.display = 'block';
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    const focusId = kind === 'bid' ? 'bid-amount' : 'message-text';
    const el = document.getElementById(focusId);
    if (el) el.focus({ preventScroll: true });
  }, 320);
}
window.stickyBarAction = stickyBarAction;

async function sendMessage(bikeId, receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at sende beskeder'); return; }
  const content = document.getElementById('message-text').value.trim();
  if (!content) { showToast('⚠️ Skriv en besked først'); return; }

  const btn = document.querySelector('#message-box button');
  if (btn) { btn.disabled = true; btn.textContent = 'Sender...'; }
  try {
    const { data: inserted, error: insertError } = await supabase.from('messages').insert({
      bike_id:     bikeId,
      sender_id:   currentUser.id,
      receiver_id: receiverId,
      content,
    }).select('id').single();

    if (insertError) { showToast('❌ Kunne ikke sende besked'); console.error('Insert fejl:', insertError); return; }

    const textEl = document.getElementById('message-text');
    const boxEl  = document.getElementById('message-box');
    if (textEl) textEl.value = '';
    if (boxEl) {
      boxEl.innerHTML = `<div class="bid-sent-confirm">
        <div class="bid-sent-icon">✅</div>
        <p class="bid-sent-title">Besked sendt!</p>
        <p class="bid-sent-sub">Sælgeren modtager en e-mail. Se svar i din <a onclick="openInboxModal()" style="color:var(--forest);cursor:pointer;font-weight:600;">Indbakke →</a></p>
      </div>`;
    }

    if (inserted?.id) {
      supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } })
        .then(({ error: fnErr }) => {
          if (fnErr) console.error('Email notifikation fejlede:', fnErr);
        }).catch(err => console.error('Email notifikation fejlede:', err));
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send besked'; }
  }
}

async function sendBid(bikeId, receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at give bud'); return; }
  const amount = document.getElementById('bid-amount').value;
  if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) { showToast('⚠️ Indtast et gyldigt bud'); return; }

  const content = `💰 Bud: ${parseInt(amount).toLocaleString('da-DK')} kr.`;

  const btn = document.querySelector('#bid-box button');
  if (btn) { btn.disabled = true; btn.textContent = 'Sender...'; }
  try {
    const { data: msgData, error } = await supabase.from('messages').insert({
      bike_id:     bikeId,
      sender_id:   currentUser.id,
      receiver_id: receiverId,
      content,
    }).select('id').single();

    if (error) { showToast('❌ Kunne ikke sende bud'); return; }
    document.getElementById('bid-amount').value = '';
    const bidBox = document.getElementById('bid-box');
    if (bidBox) {
      bidBox.innerHTML = `<div class="bid-sent-confirm">
        <div class="bid-sent-icon">✅</div>
        <p class="bid-sent-title">Bud sendt!</p>
        <p class="bid-sent-sub">Sælgeren modtager en e-mail. Følg svaret i din <a onclick="openInboxModal()" style="color:var(--forest);cursor:pointer;font-weight:600;">Indbakke →</a></p>
      </div>`;
    }

    // Send email-notifikation til sælger via Edge Function
    if (msgData?.id) {
      supabase.functions.invoke('notify-message', {
        body: { message_id: msgData.id },
      }).then(({ error: fnErr }) => {
        if (fnErr) console.error('Email notifikation fejlede:', fnErr);
      }).catch(err => console.error('Email notifikation fejlede:', err));
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send bud'; }
  }
}

async function toggleSaveFromModal(btn, bikeId) {
  if (!currentUser) { showToast('⚠️ Log ind for at gemme'); return; }
  const isSaved = btn.textContent.includes('❤️');
  if (isSaved) {
    await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
    btn.textContent = '🤍 Gem annonce';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
    btn.textContent = '❤️ Gemt';

    // Send email notification to bike owner (fire-and-forget)
    const { data: bike } = await supabase.from('bikes').select('brand, model, user_id').eq('id', bikeId).single();
    if (bike) {
      supabase.functions.invoke('notify-message', {
        body: {
          type: 'listing_liked',
          bike_id: bikeId,
          bike_brand: bike.brand,
          bike_model: bike.model,
          bike_owner_id: bike.user_id,
          liker_id: currentUser.id,
          liker_name: currentProfile?.name || 'En bruger',
        },
      }).catch(() => {});
    }
  }
}


/* ============================================================
   INDBAKKE
   ============================================================ */

let activeThread = null; // { bikeId, otherUserId, otherName }

async function loadInbox() {
  if (!currentUser) return;
  const list = document.getElementById('inbox-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter beskeder...</p>';

  let data, error;
  try {
    ({ data, error } = await supabase
      .from('messages')
      .select(`
        *,
        bikes(brand, model),
        sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type),
        receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type)
      `)
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false }));
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInbox');
    return;
  }
  if (error) {
    list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInbox');
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state-box">
      <div class="empty-state-icon">✉️</div>
      <h3 class="empty-state-title">Ingen beskeder endnu</h3>
      <p class="empty-state-sub">Når du kontakter en sælger eller modtager et bud, dukker beskederne op her.</p>
    </div>`;
    return;
  }

  // Grupper beskeder i tråde per (bike_id + anden bruger)
  const threads = {};
  data.forEach(msg => {
    const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
    const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
    const key       = `${msg.bike_id}_${otherId}`;
    if (!threads[key]) {
      threads[key] = {
        bikeId:      msg.bike_id,
        bike:        msg.bikes,
        otherId,
        otherName:   otherProf?.seller_type === 'dealer' ? otherProf?.shop_name : otherProf?.name,
        messages:    [],
        hasUnread:   false,
      };
    }
    threads[key].messages.push(msg);
    if (!msg.read && msg.receiver_id === currentUser.id) threads[key].hasUnread = true;
  });

  const threadList = Object.values(threads);
  const unreadCount = threadList.filter(t => t.hasUnread).length;

  // Opdater badge
  const badge = document.getElementById('inbox-badge');
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }

  list.innerHTML = threadList.map(t => {
    const lastMsg   = t.messages[0];
    const initials  = (t.otherName || 'U').substring(0, 2).toUpperCase();
    const preview   = lastMsg.content.length > 50 ? lastMsg.content.substring(0, 50) + '...' : lastMsg.content;
    const time      = new Date(lastMsg.created_at).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
    const bikeName  = t.bike ? `${t.bike.brand} ${t.bike.model}` : 'Ukendt cykel';

    return `
      <div class="inbox-row ${t.hasUnread ? 'unread' : ''}"
           onclick="openThread('${t.bikeId}', '${t.otherId}', '${(t.otherName||'Ukendt').replace(/'/g,'')}')">
        <div class="inbox-avatar">${initials}</div>
        <div class="inbox-content">
          <div class="inbox-from">${t.otherName || 'Ukendt'}</div>
          <div class="inbox-bike">Re: ${bikeName}</div>
          <div class="inbox-preview">${preview}</div>
        </div>
        <div class="inbox-time">${time}</div>
      </div>`;
  }).join('');
}

// Fælles besked-renderer — bruges af openThread og openInboxThread
function renderMessages(messages, isSeller, bikeActive, isInbox) {
  return messages.map(msg => {
    const isSent     = msg.sender_id === currentUser.id;
    const isBid      = msg.content.startsWith('💰 Bud:') || msg.content.startsWith('💰');
    const isAccepted = msg.content.startsWith('✅ Bud på');
    const time       = new Date(msg.created_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const acceptBtn  = (isBid && !isSent && isSeller && bikeActive)
      ? `<button class="btn-accept-bid" onclick="acceptBid('${msg.content.replace(/'/g, "\\'")}', ${isInbox})">✅ Accepter bud</button>`
      : '';
    // Read receipts kun på sendte beskeder (ikke bud-accept-systembeskeder)
    const readReceipt = (isSent && !isAccepted)
      ? (msg.read
          ? '<span class="read-receipt read" title="Læst">✓✓</span>'
          : '<span class="read-receipt" title="Sendt">✓</span>')
      : '';
    return `<div class="message-bubble ${isSent ? 'sent' : 'received'}${isBid ? ' bid-bubble' : ''}${isAccepted ? ' accepted-bubble' : ''}">
      ${esc(msg.content)}${acceptBtn}<div class="msg-time">${time}${readReceipt}</div>
    </div>`;
  }).join('');
}

async function openThread(bikeId, otherId, otherName) {
  activeThread = { bikeId, otherId, otherName };

  document.getElementById('inbox-list').style.display     = 'none';
  document.getElementById('message-thread').style.display = 'block';
  document.getElementById('thread-header').innerHTML      =
    `<strong>${otherName}</strong> — <span style="color:var(--muted)">Henter...</span>`;

  // Hent beskeder og cykel-info parallelt
  const [{ data, error }, { data: bike }] = await Promise.all([
    supabase.from('messages')
      .select('*')
      .eq('bike_id', bikeId)
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true }),
    supabase.from('bikes')
      .select('user_id, is_active, brand, model')
      .eq('id', bikeId)
      .single()
  ]);

  const isSeller   = bike?.user_id === currentUser.id;
  const bikeActive = bike?.is_active === true;
  const bikeName   = bike ? `${bike.brand} ${bike.model}` : 'annonce';

  activeThread.isSeller   = isSeller;
  activeThread.bikeActive = bikeActive;

  document.getElementById('thread-header').innerHTML =
    `<strong>${otherName}</strong> — <span style="color:var(--muted)">${bikeName}</span>`;

  const threadEl = document.getElementById('thread-messages');
  if (error || !data) {
    threadEl.innerHTML = '<p style="color:var(--rust)">Kunne ikke hente beskeder.</p>';
    return;
  }

  threadEl.innerHTML = renderMessages(data, isSeller, bikeActive, false);

  threadEl.scrollTop = threadEl.scrollHeight;

  await supabase.from('messages')
    .update({ read: true })
    .eq('bike_id', bikeId)
    .eq('sender_id', otherId)
    .eq('receiver_id', currentUser.id);
}

async function acceptBid(content, isInbox = false) {
  const thread = isInbox ? activeInboxThread : activeThread;
  if (!thread?.isSeller || !thread?.bikeActive) return;

  const match  = content.match(/💰 Bud: (.+) kr\./);
  const amount = match ? match[1] + ' kr.' : 'buddet';

  if (!confirm(`Vil du acceptere ${amount}?\nAnnoncen markeres som solgt og køber får besked.`)) return;

  // Hent cykel-info for notifikation
  const { data: bikeData } = await supabase.from('bikes')
    .select('brand, model')
    .eq('id', thread.bikeId)
    .single();

  const { error: soldErr } = await supabase.from('bikes')
    .update({ is_active: false })
    .eq('id', thread.bikeId)
    .eq('user_id', currentUser.id);

  if (soldErr) { showToast('❌ Kunne ikke markere som solgt'); return; }

  const confirmContent = `✅ Bud på ${amount} accepteret! Kontakt hinanden for at aftale overdragelse.`;
  const { data: inserted } = await supabase.from('messages').insert({
    bike_id:     thread.bikeId,
    sender_id:   currentUser.id,
    receiver_id: thread.otherId,
    content:     confirmContent,
  }).select('id').single();

  if (inserted?.id) {
    // Send besked-notifikation
    supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } }).catch(() => {});

    // Send dedikeret "bud accepteret" email til budgiver
    const bidMatch = content.match(/💰 Bud: (.+) kr\./);
    const bidAmount = bidMatch ? bidMatch[1] + ' kr.' : 'buddet';
    supabase.functions.invoke('notify-message', {
      body: {
        type: 'bid_accepted',
        bike_id: thread.bikeId,
        bike_brand: bikeData?.brand,
        bike_model: bikeData?.model,
        bid_amount: bidAmount,
        bidder_id: thread.otherId,
        seller_name: currentProfile?.shop_name || currentProfile?.name,
      }
    }).catch(() => {});
  }

  thread.bikeActive = false;
  loadBikes();
  updateFilterCounts();
  // Open rating modal immediately after bid is accepted
  const bikeInfo = bikeData ? `${bikeData.brand} ${bikeData.model}` : 'annonce';
  openRateModal(thread.otherId, thread.otherName, bikeInfo);
}

function closeThread() {
  activeThread = null;
  document.getElementById('inbox-list').style.display     = 'flex';
  document.getElementById('inbox-list').style.flexDirection = 'column';
  document.getElementById('message-thread').style.display = 'none';
  document.getElementById('reply-text').value = '';
  loadInbox();
}


async function sendReply(isInbox = false) {
  const thread     = isInbox ? activeInboxThread : activeThread;
  const textId     = isInbox ? 'inbox-modal-reply-text' : 'reply-text';
  const btnId      = isInbox ? 'send-inbox-reply-btn'   : 'send-reply-btn';
  const reopenFn   = isInbox ? openInboxThread : openThread;

  if (!thread || !currentUser) return;
  const content = document.getElementById(textId).value.trim();
  if (!content) { showToast('⚠️ Skriv et svar først'); return; }

  const restore = btnLoading(btnId, 'Sender...');
  try {
    const { data: inserted, error } = await supabase.from('messages').insert({
      bike_id:     thread.bikeId,
      sender_id:   currentUser.id,
      receiver_id: thread.otherId,
      content,
    }).select('id').single();

    if (error) { showToast('❌ Kunne ikke sende svar'); return; }
    document.getElementById(textId).value = '';
    showToast('✅ Svar sendt!');
    if (inserted?.id) {
      supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } })
        .catch(e => console.error('Email notifikation fejlede:', e));
    }
    reopenFn(thread.bikeId, thread.otherId, thread.otherName);
  } finally { restore(); }
}


/* ============================================================
   SIDEBAR FILTRE
   ============================================================ */

function toggleSidebarSection(header) {
  const box = header.closest('.sidebar-box');
  const expanded = box.classList.toggle('collapsed');
  header.setAttribute('aria-expanded', !expanded);
}

function applyFilters() {
  // Sælgertype — hvis "alle" er checket, ignorer de andre
  const sellerAll     = document.querySelector('[data-filter="seller"][data-value="all"]');
  const sellerDealer  = document.querySelector('[data-filter="seller"][data-value="dealer"]');
  const sellerPrivate = document.querySelector('[data-filter="seller"][data-value="private"]');

  // Hvis "Alle sælgere" klikkes på, fjern de andre
  if (sellerAll?.checked) {
    if (sellerDealer)  sellerDealer.checked  = false;
    if (sellerPrivate) sellerPrivate.checked = false;
  }
  // Hvis en specifik sælger vælges, fjern "alle"
  if ((sellerDealer?.checked || sellerPrivate?.checked) && sellerAll?.checked) {
    sellerAll.checked = false;
  }

  // Saml valgte typer
  const types = [...document.querySelectorAll('[data-filter="type"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte stande
  const conditions = [...document.querySelectorAll('[data-filter="condition"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte hjulstørrelser
  const wheelSizes = [...document.querySelectorAll('[data-filter="wheel"]:checked')]
    .map(el => el.dataset.value);

  // Pris
  const minPrice = parseInt(document.querySelector('.price-range input:first-of-type')?.value) || null;
  const maxPrice = parseInt(document.querySelector('.price-range input:last-of-type')?.value) || null;

  // Sælgertype
  let sellerType = null;
  if (sellerDealer?.checked && !sellerPrivate?.checked) sellerType = 'dealer';
  if (sellerPrivate?.checked && !sellerDealer?.checked) sellerType = 'private';

  debouncedLoadFilters({ types, conditions, minPrice, maxPrice, sellerType, wheelSizes });
}

const debouncedLoadFilters = debounce(
  (args) => loadBikesWithFilters(args),
  300
);

let filterOffset       = 0;
let currentFilterArgs  = null;

async function loadBikesWithFilters({ types = [], conditions = [], minPrice, maxPrice, sellerType, dealerId, wheelSizes = [] } = {}, append = false) {
  const grid = document.getElementById('listings-grid');

  if (!append) {
    filterOffset      = 0;
    currentFilterArgs = { types, conditions, minPrice, maxPrice, sellerType, dealerId, wheelSizes };
    grid.innerHTML    = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';
    const old = document.getElementById('load-more-btn');
    if (old) old.remove();
  }

  let query = supabase
    .from('bikes')
    .select('id, brand, model, price, type, city, condition, year, size, color, warranty, is_active, created_at, user_id, profiles(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, address), bike_images(url, is_primary)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(filterOffset, filterOffset + BIKES_PAGE_SIZE - 1);

  if (types.length > 0)      query = query.in('type', types);
  if (conditions.length > 0) query = query.in('condition', conditions);
  if (minPrice)              query = query.gte('price', minPrice);
  if (maxPrice)              query = query.lte('price', maxPrice);
  if (dealerId)              query = query.eq('user_id', dealerId);
  if (wheelSizes.length > 0) query = query.in('wheel_size', wheelSizes);
  if (sellerType && !dealerId) query = query.eq('profiles.seller_type', sellerType);

  const { data, error } = await query;
  if (error) {
    grid.innerHTML = retryHTML('Kunne ikke hente annoncer.', 'applyFilters');
    return;
  }

  renderBikes(data || [], append);
  filterOffset += (data || []).length;

  // "Vis flere"-knap
  const existing = document.getElementById('load-more-btn');
  if (existing) existing.remove();

  if ((data || []).length === BIKES_PAGE_SIZE) {
    const btn = document.createElement('div');
    btn.id = 'load-more-btn';
    btn.innerHTML = `<button onclick="loadMoreFilteredBikes()" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Vis flere cykler</button>`;
    grid.after(btn);
  } else if (append && filterOffset > BIKES_PAGE_SIZE) {
    const msg = document.createElement('div');
    msg.id = 'load-more-btn';
    msg.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
    grid.after(msg);
  }
}


/* ============================================================
   MOBIL FILTER DRAWER
   ============================================================ */

function openMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.add('open');
  document.getElementById('mobile-filter-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.remove('open');
  document.getElementById('mobile-filter-overlay').classList.remove('open');
  document.body.style.overflow = '';
}


/* ============================================================
   NULSTIL ADGANGSKODE – håndter token fra email-link
   ============================================================ */

async function handleResetPassword() {
  const pw1 = document.getElementById('reset-pw1').value;
  const pw2 = document.getElementById('reset-pw2').value;

  if (!pw1 || pw1.length < 6) { showToast('⚠️ Adgangskode skal være mindst 6 tegn'); return; }
  if (pw1 !== pw2)             { showToast('⚠️ Adgangskoderne matcher ikke'); return; }

  const btn = document.querySelector('[onclick="handleResetPassword()"]');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Opdaterer...'; }

  try {
    // Luk modal omgående for at vise fraktion
    document.getElementById('reset-modal').classList.remove('open');
    document.body.style.overflow = '';

    // Opdater password med timeout (10 sec)
    const updatePromise = supabase.auth.updateUser({ password: pw1 });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 10000)
    );

    await Promise.race([updatePromise, timeoutPromise]);

    history.replaceState(null, '', window.location.pathname);
    showToast('✅ Adgangskode opdateret! Du er nu logget ind.');
  } catch (error) {
    // Åben modal igen hvis der var fejl
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
    showToast('❌ Kunne ikke opdatere adgangskode');
    console.error(error);
  }
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', window.location.pathname);
}

// Lyt efter PASSWORD_RECOVERY event fra Supabase
supabase.auth.onAuthStateChange((_event, session) => {
  if (_event === 'PASSWORD_RECOVERY') {
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
});


/* ============================================================
   REDIGER ANNONCE
   ============================================================ */

// Billede-state for redigér-modal (adskilt fra opret-modal)
let editNewFiles      = [];  // { file, url, isPrimary }
let editExistingImgs  = [];  // { id, url, is_primary, toDelete }
const normalizeImageId = (id) => String(id ?? '').trim();

async function openEditModal(id) {
  const { data: b, error } = await supabase
    .from('bikes')
    .select('*, bike_images(id, url, is_primary)')
    .eq('id', id).single();
  if (error || !b) { showToast('❌ Kunne ikke hente annonce'); return; }

  // Udfyld tekstfelterne
  document.getElementById('edit-bike-id').value       = b.id;
  document.getElementById('edit-brand').value         = b.brand || '';
  document.getElementById('edit-model').value         = b.model || '';
  document.getElementById('edit-price').value         = b.price || '';
  document.getElementById('edit-year').value          = b.year || '';
  document.getElementById('edit-city').value          = b.city || '';
  document.getElementById('edit-color').value         = b.color || '';
  document.getElementById('edit-description').value   = b.description || '';
  document.getElementById('edit-type').value          = b.type || '';
  document.getElementById('edit-size').value          = b.size || '';
  document.getElementById('edit-condition').value     = b.condition || '';
  document.getElementById('edit-is-active').checked   = b.is_active;

  // Vis garantifelt kun for forhandlere
  const warrantyGroup = document.getElementById('edit-warranty-group');
  if (warrantyGroup) warrantyGroup.style.display = currentProfile?.seller_type === 'dealer' ? '' : 'none';
  document.getElementById('edit-warranty').value = b.warranty || '';

  // Indlæs eksisterende billeder
  editNewFiles     = [];
  editExistingImgs = (b.bike_images || []).map(img => ({
    ...img,
    id: normalizeImageId(img.id),
    toDelete: false
  }));
  enforceSinglePrimaryImage();
  renderEditExistingImages();
  renderEditNewImages();

  document.getElementById('edit-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Enforcer altid præcis 0 eller 1 primært billede på tværs af existing + new
function enforceSinglePrimaryImage() {
  const existingPrimaries = editExistingImgs.filter(img => !img.toDelete && img.is_primary);
  const newPrimaries      = editNewFiles.filter(f => f.isPrimary);
  const total = existingPrimaries.length + newPrimaries.length;
  if (total > 1) {
    // Behold kun den første primære, nulstil alle andre
    let keptOne = false;
    editExistingImgs = editExistingImgs.map(img => {
      if (!img.toDelete && img.is_primary && !keptOne) { keptOne = true; return img; }
      return img.is_primary ? { ...img, is_primary: false } : img;
    });
    editNewFiles = editNewFiles.map((f, i) => {
      if (f.isPrimary && !keptOne) { keptOne = true; return f; }
      return f.isPrimary ? { ...f, isPrimary: false } : f;
    });
  } else if (total === 0) {
    // Intet primært — tildel til første synlige billede
    const firstExisting = editExistingImgs.find(img => !img.toDelete);
    if (firstExisting) {
      const firstExistingId = normalizeImageId(firstExisting.id);
      editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: normalizeImageId(img.id) === firstExistingId }));
    } else if (editNewFiles.length > 0) {
      editNewFiles = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === 0 }));
    }
  }
}

function renderEditExistingImages() {
  const grid = document.getElementById('edit-img-existing-grid');
  if (!grid) return;
  const visible = editExistingImgs.filter(img => !img.toDelete);
  grid.innerHTML = visible.map(img => {
    const idArg = JSON.stringify(String(img.id));
    return `
    <div class="img-preview-item ${img.is_primary ? 'primary' : ''}">
      <img src="${img.url}" alt="Billede">
      ${img.is_primary
        ? '<span class="primary-badge">Primær</span>'
        : `<button type="button" class="set-primary" onclick='editSetExistingPrimary(${idArg})'>★</button>`}
      <button type="button" class="remove-img" onclick='editRemoveExisting(${idArg})'>✕</button>
    </div>`;
  }).join('') || '';
}

function editSetExistingPrimary(imgId) {
  const normalizedId = normalizeImageId(imgId);
  const target = editExistingImgs.find(img => normalizeImageId(img.id) === normalizedId);
  if (!target || target.toDelete) return;
  editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: !img.toDelete && normalizeImageId(img.id) === normalizedId }));
  editNewFiles     = editNewFiles.map(f => ({ ...f, isPrimary: false }));
  renderEditExistingImages();
  renderEditNewImages();
}

function editRemoveExisting(imgId) {
  const normalizedId = normalizeImageId(imgId);
  const target = editExistingImgs.find(img => normalizeImageId(img.id) === normalizedId);
  if (!target || target.toDelete) return;
  const wasPrimary = target.is_primary;
  editExistingImgs = editExistingImgs.map(img => normalizeImageId(img.id) === normalizedId ? { ...img, toDelete: true, is_primary: false } : img);
  if (wasPrimary) {
    const firstRemaining = editExistingImgs.find(img => !img.toDelete);
    if (firstRemaining) {
      const firstRemainingId = normalizeImageId(firstRemaining.id);
      editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: !img.toDelete && normalizeImageId(img.id) === firstRemainingId }));
    } else if (editNewFiles.length > 0) {
      editNewFiles = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === 0 }));
    }
  }
  renderEditExistingImages();
  renderEditNewImages();
}

async function editPreviewImages(input) {
  const files = Array.from(input.files);
  const remaining = 8 - editExistingImgs.filter(img => !img.toDelete).length - editNewFiles.length;
  const toAdd = files.filter(validateImageFile).slice(0, remaining);

  const label = document.getElementById('edit-upload-label');
  if (label && toAdd.length > 0) label.textContent = 'Optimerer billeder...';

  const compressed = await Promise.all(toAdd.map(compressImage));

  compressed.forEach((file, i) => {
    const hasPrimary = editExistingImgs.some(img => !img.toDelete && img.is_primary) || editNewFiles.some(f => f.isPrimary);
    editNewFiles.push({ file, url: URL.createObjectURL(file), isPrimary: !hasPrimary && i === 0 });
  });
  renderEditNewImages();
}

function renderEditNewImages() {
  const grid = document.getElementById('edit-img-new-grid');
  if (!grid) return;
  grid.innerHTML = editNewFiles.map((item, i) => `
    <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
      <img src="${item.url}" alt="Nyt billede">
      ${item.isPrimary
        ? '<span class="primary-badge">Primær</span>'
        : `<button type="button" class="set-primary" onclick="editSetNewPrimary(${i})">★</button>`}
      <button type="button" class="remove-img" onclick="editRemoveNew(${i})">✕</button>
    </div>`).join('');
  const label = document.getElementById('edit-upload-label');
  if (label) label.textContent = editNewFiles.length > 0
    ? `${editNewFiles.length} nye billede${editNewFiles.length !== 1 ? 'r' : ''} klar til upload`
    : 'Klik for at tilføje billeder';
}

function editSetNewPrimary(index) {
  editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: false }));
  editNewFiles     = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === index }));
  renderEditExistingImages();
  renderEditNewImages();
}

function editRemoveNew(index) {
  URL.revokeObjectURL(editNewFiles[index].url);
  const wasPrimary = editNewFiles[index].isPrimary;
  editNewFiles.splice(index, 1);
  if (wasPrimary && editNewFiles.length > 0) editNewFiles[0].isPrimary = true;
  renderEditNewImages();
}

function closeEditModal() {
  editNewFiles.forEach(f => URL.revokeObjectURL(f.url));
  editNewFiles     = [];
  editExistingImgs = [];
  document.getElementById('edit-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveEditedListing() {
  const id = document.getElementById('edit-bike-id').value;
  enforceSinglePrimaryImage();

  const updates = {
    brand:       document.getElementById('edit-brand').value,
    model:       document.getElementById('edit-model').value,
    title:       document.getElementById('edit-brand').value + ' ' + document.getElementById('edit-model').value,
    price:       parseInt(document.getElementById('edit-price').value),
    year:        parseInt(document.getElementById('edit-year').value) || null,
    city:        document.getElementById('edit-city').value,
    color:       document.getElementById('edit-color').value.trim() || null,
    description: document.getElementById('edit-description').value,
    type:        document.getElementById('edit-type').value,
    size:        document.getElementById('edit-size').value,
    condition:   document.getElementById('edit-condition').value,
    is_active:   document.getElementById('edit-is-active').checked,
    warranty:    (currentProfile?.seller_type === 'dealer' ? document.getElementById('edit-warranty').value.trim() : null) || null,
  };

  if (!updates.brand || !updates.model || !updates.price || !updates.city) {
    showToast('⚠️ Udfyld alle påkrævede felter'); return;
  }

  const { error } = await supabase.from('bikes').update(updates).eq('id', id);
  if (error) { showToast('❌ Kunne ikke gemme ændringer'); console.error(error); return; }

  // Slet fjernede billeder
  const toDelete = editExistingImgs.filter(img => img.toDelete);
  const toKeep   = editExistingImgs.filter(img => !img.toDelete);
  for (const img of toDelete) {
    const { error: delErr } = await supabase.from('bike_images').delete().eq('id', img.id).eq('bike_id', id);
    if (delErr) {
      showToast('❌ Kunne ikke slette et eksisterende billede');
      console.error(delErr);
      return;
    }
    if (!delErr && img.url) {
      const match = img.url.match(/bike-images\/(.+)$/);
      if (match) {
        const storagePath = match[1];
        await supabase.storage.from('bike-images').remove([storagePath]);
      }
    }
  }

  // Nulstil primær-status på eksisterende billeder først (undgår unique-konflikter)
  for (const img of toKeep) {
    const { error: updErr } = await supabase.from('bike_images').update({ is_primary: false }).eq('id', img.id).eq('bike_id', id);
    if (updErr) {
      showToast('❌ Kunne ikke opdatere primærbillede');
      console.error(updErr);
      return;
    }
  }

  // Upload nye billeder
  let insertedPrimaryId = null;
  for (const item of editNewFiles) {
    const ext      = item.file.name.split('.').pop();
    const filename = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('bike-images').upload(filename, item.file, { contentType: item.file.type });
    if (uploadErr) { showToast('❌ Kunne ikke uploade et billede'); console.error(uploadErr); return; }
    const { data: { publicUrl } } = supabase.storage.from('bike-images').getPublicUrl(filename);
    const { data: insertedRow, error: insertErr } = await supabase
      .from('bike_images')
      .insert({ bike_id: id, url: publicUrl, is_primary: item.isPrimary })
      .select('id')
      .single();
    if (insertErr) {
      showToast('❌ Kunne ikke gemme uploadet billede');
      console.error(insertErr);
      return;
    }
    if (item.isPrimary) insertedPrimaryId = insertedRow?.id || null;
  }

  // Sæt primærbillede i to trin for at undgå unique-konflikter (kun ét primært pr. annonce)
  const intendedPrimaryExisting = toKeep.find(img => img.is_primary)?.id || null;
  const intendedPrimaryId = insertedPrimaryId || intendedPrimaryExisting;

  const { error: resetPrimaryErr } = await supabase.from('bike_images').update({ is_primary: false }).eq('bike_id', id);
  if (resetPrimaryErr) {
    showToast('❌ Kunne ikke nulstille primærbillede');
    console.error(resetPrimaryErr);
    return;
  }
  if (intendedPrimaryId) {
    const { error: setPrimaryErr } = await supabase.from('bike_images').update({ is_primary: true }).eq('id', intendedPrimaryId).eq('bike_id', id);
    if (setPrimaryErr) {
      showToast('❌ Kunne ikke gemme valgt primærbillede');
      console.error(setPrimaryErr);
      return;
    }
  } else {
    // Fallback: sæt første eksisterende billede som primær
    const { data: firstImg } = await supabase.from('bike_images').select('id').eq('bike_id', id).limit(1).single();
    if (firstImg) {
      await supabase.from('bike_images').update({ is_primary: true }).eq('id', firstImg.id).eq('bike_id', id);
    }
  }

  // Invalider bikeCache så næste åbning af annonce/modal henter friske data
  bikeCache.delete(id);
  bikeCache.delete(Number(id));

  closeEditModal();
  showToast('✅ Annonce opdateret!');
  reloadMyListings();
  loadBikes();
  updateFilterCounts();

  // Re-render det view brugeren faktisk ser efter save
  const currentPath    = window.location.pathname;
  const bikeModalOpen  = document.getElementById('bike-modal')?.classList.contains('open');
  const profileMatch   = currentPath.match(/^\/profile\/([^/]+)$/);
  const dealerMatch    = currentPath.match(/^\/dealer\/([^/]+)$/);
  const onBikePage     = currentPath === `/bike/${id}`;

  if (onBikePage) renderBikePage(id);
  if (bikeModalOpen) openBikeModal(id);
  if (profileMatch && profileMatch[1] === currentUser?.id) renderUserProfilePage(profileMatch[1]);
  if (dealerMatch && dealerMatch[1] === currentUser?.id) renderDealerProfilePage(dealerMatch[1]);
}


/* ============================================================
   BILLEDE UPLOAD
   ============================================================ */

let selectedFiles = []; // { file, url, isPrimary }

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE_MB   = 10;

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showToast(`⚠️ "${file.name}" er ikke et gyldigt billedformat (kun JPG, PNG, WebP, GIF)`);
    return false;
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    showToast(`⚠️ "${file.name}" er for stor (maks ${MAX_IMAGE_SIZE_MB} MB)`);
    return false;
  }
  return true;
}

// Komprimerer billede til WebP (max 1600px bred, kvalitet ~82%) med Canvas API
async function compressImage(file) {
  // GIF og WebP under 500KB komprimeres ikke
  if (file.type === 'image/gif') return file;
  if (file.type === 'image/webp' && file.size < 500 * 1024) return file;

  try {
    const bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

    const MAX_W = 1600;
    const MAX_H = 1600;
    let { width, height } = bitmap;
    if (width > MAX_W || height > MAX_H) {
      const ratio = Math.min(MAX_W / width, MAX_H / height);
      width  = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    URL.revokeObjectURL(bitmap.src);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) return file;

    // Kun brug komprimeret hvis den faktisk er mindre
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } catch (e) {
    console.warn('Billedkomprimering fejlede, bruger original:', e);
    return file;
  }
}

async function previewImages(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  // Maks 8 billeder i alt
  const remaining = 8 - selectedFiles.length;
  const toAdd = files.filter(validateImageFile).slice(0, remaining);

  const label = document.getElementById('upload-label');
  if (label && toAdd.length > 0) label.textContent = 'Optimerer billeder...';

  const compressed = await Promise.all(toAdd.map(compressImage));

  compressed.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    selectedFiles.push({
      file,
      url,
      isPrimary: selectedFiles.length === 0 && i === 0, // Første billede er primær
    });
  });

  renderImagePreviews();
  if (label) label.textContent =
    `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`;
}

function renderImagePreviews() {
  const grid = document.getElementById('img-preview-grid');
  if (!grid) return;

  grid.innerHTML = selectedFiles.map((item, i) => `
    <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
      <img src="${item.url}" alt="Billede ${i+1}">
      ${item.isPrimary ? '<span class="primary-badge">Primær</span>' : ''}
      ${!item.isPrimary ? `<button class="set-primary" onclick="setPrimary(${i})">★</button>` : ''}
      <button class="remove-img" onclick="removeImage(${i})">✕</button>
    </div>
  `).join('');
}

function setPrimary(index) {
  selectedFiles = selectedFiles.map((item, i) => ({ ...item, isPrimary: i === index }));
  renderImagePreviews();
}

function removeImage(index) {
  URL.revokeObjectURL(selectedFiles[index].url);
  selectedFiles.splice(index, 1);
  // Sæt første som primær hvis den primære blev fjernet
  if (selectedFiles.length > 0 && !selectedFiles.some(f => f.isPrimary)) {
    selectedFiles[0].isPrimary = true;
  }
  renderImagePreviews();
  const label = document.getElementById('upload-label');
  if (label) label.textContent = selectedFiles.length > 0
    ? `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`
    : 'Klik for at vælge billeder';
}

async function uploadImages(bikeId) {
  if (selectedFiles.length === 0) return;

  let failed = 0;
  for (const item of selectedFiles) {
    const ext      = item.file.name.split('.').pop();
    const filename = `${bikeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from('bike-images')
      .upload(filename, item.file, { contentType: item.file.type, upsert: false });

    if (error) { console.error('Upload fejl:', error); failed++; continue; }

    const { data: { publicUrl } } = supabase.storage
      .from('bike-images')
      .getPublicUrl(filename);

    await supabase.from('bike_images').insert({
      bike_id:    bikeId,
      url:        publicUrl,
      is_primary: item.isPrimary,
    });
  }

  if (failed > 0) {
    showToast(`⚠️ ${failed} billede${failed > 1 ? 'r' : ''} kunne ikke uploades`);
  }

  // Ryd valgte filer
  selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
  selectedFiles = [];
}

function resetImageUpload() {
  selectedFiles = [];
  const grid  = document.getElementById('img-preview-grid');
  const label = document.getElementById('upload-label');
  const input = document.getElementById('img-file-input');
  if (grid)  grid.innerHTML = '';
  if (label) label.textContent = 'Klik for at vælge billeder';
  if (input) input.value = '';
}



/* ============================================================
   REAL-TIME NOTIFIKATIONER
   ============================================================ */

let _realtimeChannel = null;

function stopRealtimeNotifications() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

function startRealtimeNotifications() {
  if (!currentUser) return;
  stopRealtimeNotifications();

  // Tjek badge med det samme ved opstart
  updateInboxBadge();

  _realtimeChannel = supabase
    .channel('new-messages-' + currentUser.id)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
    }, function(payload) {
      const msg = payload.new;
      // Kun hvis vi er modtageren
      if (msg.receiver_id !== currentUser.id) return;

      const isBid = msg.content && msg.content.indexOf('💰') === 0;
      showToast(isBid ? '💰 Nyt bud modtaget!' : '✉️ Ny besked modtaget!');
      updateInboxBadge();

      const btn = document.getElementById('nav-inbox-btn');
      if (btn) {
        btn.classList.add('inbox-pulse');
        setTimeout(function() { btn.classList.remove('inbox-pulse'); }, 2000);
      }
    });

  _realtimeChannel.subscribe();
}


/* ============================================================
   BLIV FORHANDLER MODAL
   ============================================================ */

function openBecomeDealerModal() {
  navigateTo('/bliv-forhandler');
}

function closeBecomeDealerModal() {
  // Noop — bruges ikke mere, men holdes for kompatibilitet
}

function selectDealerPlan(btn) {
  document.querySelectorAll('.dealer-plan-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

let _dealersPageData  = [];   // [{ dealer, bikeCount, avgRating, ratingCount, distKm }]
let _dealerGPSActive  = false;
let _dealerGPSCoords  = null;

async function renderDealersPage() {
  showDetailView();
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Forhandlere – Cykelbørsen';
  updateSEOMeta('Alle verificerede cykelforhandlere på Cykelbørsen. Køb med tryghed — garanti, servicehistorik og professionel rådgivning.', '/forhandlere');
  _dealersPageData = [];
  _dealerGPSActive = false;
  _dealerGPSCoords = null;

  document.getElementById('detail-view').innerHTML = `
    <div class="dealers-page">
      <div class="dealers-page-header">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
        <h1 class="dealers-page-title">Autoriserede forhandlere</h1>
        <p class="dealers-page-subtitle">Køb med tryghed fra verificerede cykelforhandlere — alle med garanti, servicehistorik og professionel rådgivning.</p>
        <button class="btn-become-dealer" onclick="navigateTo('/bliv-forhandler')">🏪 Bliv forhandler</button>
      </div>
      <div class="dealers-toolbar">
        <button class="dealers-gps-btn" id="dealers-gps-btn" onclick="toggleDealerGPS()">📍 Brug min position</button>
        <select class="dealers-sort-sel" id="dealers-sort" onchange="sortAndRenderDealers()">
          <option value="bikes">Flest cykler</option>
          <option value="nearest">Tættest</option>
          <option value="rating">Bedste rating</option>
        </select>
      </div>
      <div id="dealers-page-grid" class="dealer-cards">
        <p style="color:var(--muted);padding:40px 0;text-align:center;grid-column:1/-1;">Henter forhandlere...</p>
      </div>
    </div>`;

  const [dealerRes, bikeRes, reviewRes] = await Promise.all([
    supabase.from('profiles').select('id, shop_name, city, address, name, avatar_url').eq('seller_type', 'dealer').eq('verified', true).order('created_at', { ascending: true }),
    supabase.from('bikes').select('user_id').eq('is_active', true),
    supabase.from('reviews').select('reviewed_user_id, rating'),
  ]);

  const grid = document.getElementById('dealers-page-grid');
  if (!grid) return;

  const dealers  = dealerRes.data  || [];
  const bikeRows = bikeRes.data    || [];
  const reviews  = reviewRes.data  || [];

  if (dealerRes.error || dealers.length === 0) {
    grid.className = 'dealer-cards dealer-empty-state';
    grid.innerHTML = `
      <div class="dealer-empty-card">
        <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
        <h3>Ingen forhandlere endnu</h3>
        <p>Vær den første forhandler på Cykelbørsen og nå tusindvis af cykelkøbere.</p>
        <button class="btn-become-dealer-small" onclick="navigateTo('/bliv-forhandler')">Tilmeld din butik →</button>
      </div>`;
    return;
  }

  const dealerIdSet = new Set(dealers.map(d => d.id));

  const countMap = {};
  for (const b of bikeRows) {
    if (dealerIdSet.has(b.user_id)) countMap[b.user_id] = (countMap[b.user_id] || 0) + 1;
  }

  const ratingSum = {}, ratingCount = {};
  for (const r of reviews) {
    if (dealerIdSet.has(r.reviewed_user_id) && r.rating) {
      ratingSum[r.reviewed_user_id]   = (ratingSum[r.reviewed_user_id]   || 0) + r.rating;
      ratingCount[r.reviewed_user_id] = (ratingCount[r.reviewed_user_id] || 0) + 1;
    }
  }

  _dealersPageData = dealers.map(dealer => ({
    dealer,
    bikeCount:   countMap[dealer.id]   || 0,
    avgRating:   ratingCount[dealer.id] ? ratingSum[dealer.id] / ratingCount[dealer.id] : null,
    ratingCount: ratingCount[dealer.id] || 0,
    distKm:      null,
  }));

  window._allDealers     = dealers;
  window._dealerCountMap = countMap;

  sortAndRenderDealers();
}

async function toggleDealerGPS() {
  const btn = document.getElementById('dealers-gps-btn');
  if (_dealerGPSActive) {
    _dealerGPSActive = false;
    _dealerGPSCoords = null;
    _dealersPageData.forEach(d => d.distKm = null);
    if (btn) { btn.classList.remove('active'); btn.textContent = '📍 Brug min position'; }
    sortAndRenderDealers();
    return;
  }
  if (!navigator.geolocation) { showToast('⚠️ GPS er ikke tilgængeligt'); return; }
  if (btn) { btn.textContent = '📍 Henter position...'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(async pos => {
    _dealerGPSCoords = [pos.coords.latitude, pos.coords.longitude];
    _dealerGPSActive = true;
    if (btn) { btn.classList.add('active'); btn.textContent = '📍 Position aktiv'; btn.disabled = false; }
    showToast('📍 Beregner afstande...');
    // Geocode alle forhandlere
    await Promise.all(_dealersPageData.map(async d => {
      const { dealer } = d;
      let coords = null;
      if (dealer.address && dealer.city) coords = await geocodeAddress(dealer.address, dealer.city);
      if (!coords && dealer.city)        coords = await geocodeCity(dealer.city);
      d.distKm = coords ? haversineKm(_dealerGPSCoords, coords) : null;
    }));
    // Skift sortering til "Tættest" automatisk
    const sel = document.getElementById('dealers-sort');
    if (sel) sel.value = 'nearest';
    sortAndRenderDealers();
  }, () => {
    showToast('❌ Kunne ikke hente position — tjek tilladelser');
    if (btn) { btn.textContent = '📍 Brug min position'; btn.disabled = false; }
  });
}

function sortAndRenderDealers() {
  const sort = document.getElementById('dealers-sort')?.value || 'bikes';
  const data = [..._dealersPageData];

  if (sort === 'nearest') {
    const withDist  = data.filter(d => d.distKm !== null).sort((a, b) => a.distKm - b.distKm);
    const withoutDist = data.filter(d => d.distKm === null).sort((a, b) => b.bikeCount - a.bikeCount);
    _dealersPageData.splice(0, _dealersPageData.length, ...withDist, ...withoutDist);
  } else if (sort === 'rating') {
    data.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
    _dealersPageData.splice(0, _dealersPageData.length, ...data);
  } else {
    data.sort((a, b) => b.bikeCount - a.bikeCount);
    _dealersPageData.splice(0, _dealersPageData.length, ...data);
  }

  const grid = document.getElementById('dealers-page-grid');
  if (!grid) return;
  grid.className = 'dealer-cards';
  grid.innerHTML = _dealersPageData.map(({ dealer, bikeCount, avgRating, ratingCount, distKm }) =>
    buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm)
  ).join('');
}

function buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm) {
  const displayName  = dealer.shop_name || dealer.name || 'Forhandler';
  const initials     = displayName.substring(0, 2).toUpperCase();
  const locationText = dealer.address && dealer.city
    ? `${dealer.address}, ${dealer.city}`
    : dealer.city || '';

  const distHtml = distKm !== null
    ? `<span class="dealer-dist-badge">${formatDistance(distKm)}</span>`
    : '';

  const starsHtml = avgRating !== null
    ? `<div class="dealer-rating">
        <span class="dealer-stars">${renderStars(avgRating)}</span>
        <span class="dealer-rating-num">${avgRating.toFixed(1)} <span style="color:var(--muted);font-weight:400;">(${ratingCount})</span></span>
       </div>`
    : '';

  const mapsHtml = (dealer.address && dealer.city)
    ? `<a class="dealer-maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dealer.address + ', ' + dealer.city)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Åbn i Google Maps">
         <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         Google Maps
       </a>`
    : '';

  return `
    <div class="dealer-card" onclick="navigateToDealer('${dealer.id}')" style="cursor:pointer;" title="Se ${esc(displayName)}s profil">
      <div class="dealer-card-top">
        <div class="dealer-logo-circle">${initials}</div>
        ${distHtml}
      </div>
      <div class="dealer-name">${esc(displayName)} <span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></div>
      ${locationText ? `<div class="dealer-city">📍 ${esc(locationText)}</div>` : ''}
      ${starsHtml}
      <div class="dealer-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>
      ${mapsHtml}
    </div>`;
}

function renderStars(avg) {
  const full = Math.floor(avg);
  const half = avg - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function renderBecomeDealerPage() {
  showDetailView();
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Bliv forhandler – Cykelbørsen';
  updateSEOMeta('Bliv forhandler på Cykelbørsen. Nå cykellkøbere i hele Danmark. Helt gratis — ingen binding.', '/bliv-forhandler');

  document.getElementById('detail-view').innerHTML = `
    <div class="bd-page">
      <div class="bd-page-header">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
        <h1 class="bd-page-title">Bliv forhandler</h1>
        <p class="bd-page-subtitle">Få din cykelbutik på Danmarks dedikerede cykelmarkedsplads</p>
      </div>

      <div class="bd-trial-banner">
        🎉 <strong>Gratis for forhandlere</strong> — opret din butiksprofil uden binding eller betaling.
      </div>

      <div class="bd-perks">
        <div class="bd-perk">✅ <span>Ubegrænset antal annoncer</span></div>
        <div class="bd-perk">✅ <span>Verificeret forhandler-badge</span></div>
        <div class="bd-perk">✅ <span>Direkte beskeder fra købere</span></div>
        <div class="bd-perk">✅ <span>Prioriteret placering i søgning</span></div>
        <div class="bd-perk">✅ <span>100% gratis — ingen kreditkort</span></div>
      </div>

      <div class="bd-form">
        <h3 class="bd-form-title">Butiksinformation</h3>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>Butiksnavn *</label><input type="text" id="dealer-shop-name" placeholder="f.eks. VeloShop ApS" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>CVR-nummer *</label><input type="text" id="dealer-cvr" placeholder="f.eks. 12345678" maxlength="8" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Kontaktperson *</label><input type="text" id="dealer-contact" placeholder="Dit fulde navn" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Email *</label><input type="email" id="dealer-email" placeholder="din@butik.dk" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Telefon</label><input type="text" id="dealer-phone" placeholder="f.eks. 12 34 56 78" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Adresse</label><input type="text" id="dealer-address" placeholder="f.eks. Vesterbrogade 42" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group full"><label>By</label><input type="text" id="dealer-city" placeholder="f.eks. København" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
        </div>
        <button class="form-submit" id="dealer-submit-btn" onclick="submitDealerApplication()" style="margin-top:20px;">Opret forhandler-profil →</button>
        <p style="font-size:.75rem;color:var(--muted);text-align:center;margin-top:10px;">
          Gratis at oprette — ingen binding, ingen kreditkort.
        </p>
      </div>
    </div>`;
}

async function submitDealerApplication() {
  if (!currentUser) {
    openLoginModal();
    showToast('⚠️ Log ind for at blive forhandler');
    return;
  }

  const shopName = document.getElementById('dealer-shop-name').value.trim();
  const cvr      = document.getElementById('dealer-cvr').value.trim();
  const contact  = document.getElementById('dealer-contact').value.trim();
  const email    = document.getElementById('dealer-email').value.trim();
  const phone    = document.getElementById('dealer-phone').value.trim();
  const address  = document.getElementById('dealer-address').value.trim();
  const city     = document.getElementById('dealer-city').value.trim();

  if (!shopName || !cvr || !contact || !email) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }

  const restore = btnLoading('dealer-submit-btn', 'Opretter profil...');

  const { error } = await supabase.from('profiles').update({
    shop_name:   shopName,
    cvr:         cvr,
    phone:       phone,
    address:     address,
    city:        city,
    seller_type: 'dealer',
    verified:    true,
    name:        contact,
  }).eq('id', currentUser.id);

  restore();

  if (error) {
    showToast('❌ Noget gik galt – prøv igen');
    return;
  }

  // Opdater lokal profil-cache så UI opdaterer sig
  if (currentProfile) {
    currentProfile.seller_type = 'dealer';
    currentProfile.verified    = true;
    currentProfile.shop_name   = shopName;
    currentProfile.city        = city;
  }

  showToast('🎉 Velkommen som forhandler på CykelBørsen!');
  navigateTo('/');
}

async function openSubscriptionPortal() {
  if (!currentUser) return;
  const restore = btnLoading('btn-manage-subscription', 'Åbner portal...');
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {
      user_id:    currentUser.id,
      return_url: window.location.origin + window.location.pathname,
    },
  });
  restore();
  if (error || data?.error) {
    showToast('❌ ' + (data?.error || 'Kunne ikke åbne abonnements-portal'));
    return;
  }
  window.location.href = data.url;
}

/* ============================================================
   GØR FUNKTIONER GLOBALE
   ============================================================ */

window.openModal         = openModal;
window.closeModal        = closeModal;
window.selectType        = selectType;
window.submitListing     = submitListing;
window.openLoginModal    = openLoginModal;
window.signInWithGoogle  = signInWithGoogle;
window.closeLoginModal   = closeLoginModal;
window.switchTab         = switchTab;
window.handleLogin       = handleLogin;
window.handleRegister    = handleRegister;
window.handleForgotPassword = handleForgotPassword;
window.openProfileModal  = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.switchProfileTab     = switchProfileTab;
window.switchUserProfileTab  = switchUserProfileTab;
window.dismissOnboarding    = dismissOnboarding;
window.useQuickReply        = useQuickReply;
window.toggleNearMe         = toggleNearMe;
window.updateNearMeRadius   = updateNearMeRadius;
window.askIfAvailable       = askIfAvailable;
window.switchDealerProfileTab = switchDealerProfileTab;
window.saveProfile          = saveProfile;
window.onSellerTypeChange   = onSellerTypeChange;
window.uploadAvatar      = uploadAvatar;
window.deleteListing     = deleteListing;
window.togglePill        = togglePill;
window.toggleSave        = toggleSave;
window.removeSaved       = removeSaved;
window.saveCurrentSearch  = saveCurrentSearch;
window.applySavedSearch   = applySavedSearch;
window.deleteSavedSearch  = deleteSavedSearch;
window.loadTradeHistory   = loadTradeHistory;
window.showSection       = showSection;
window.logout                  = logout;
window.resendConfirmationEmail = resendConfirmationEmail;
window.dismissEmailBanner      = dismissEmailBanner;
window.deleteAccount          = deleteAccount;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.onDeleteConfirmInput   = onDeleteConfirmInput;
window.confirmDeleteAccount   = confirmDeleteAccount;
window.searchBikes       = searchBikes;
window.sortBikes         = sortBikes;
window.applyFilters           = applyFilters;
window.toggleSidebarSection   = toggleSidebarSection;
window.clearAllFilters        = clearAllFilters;
window.loadBikesWithFilters   = loadBikesWithFilters;
window.loadMoreFilteredBikes  = function() { loadBikesWithFilters(currentFilterArgs, true); };
window.openMobileFilter   = openMobileFilter;
window.closeMobileFilter  = closeMobileFilter;
window.closeResetModal    = closeResetModal;
window.handleResetPassword = handleResetPassword;
window.openEditModal          = openEditModal;
window.closeEditModal         = closeEditModal;
window.saveEditedListing      = saveEditedListing;
window.editPreviewImages      = editPreviewImages;
window.editSetExistingPrimary = editSetExistingPrimary;
window.editRemoveExisting     = editRemoveExisting;
window.editSetNewPrimary      = editSetNewPrimary;
window.editRemoveNew          = editRemoveNew;
window.previewImages      = previewImages;
window.setPrimary         = setPrimary;
window.removeImage        = removeImage;
window.renderSellPage            = renderSellPage;
window.submitSellPage            = submitSellPage;
window.previewSellImages         = previewSellImages;
window.setSellPrimary            = setSellPrimary;
window.removeSellImage           = removeSellImage;
window.suggestListingFromImages  = suggestListingFromImages;
window.setSellStep               = setSellStep;
window.advanceSell               = advanceSell;
window.backSell                  = backSell;
window.closeListingSuccessModal  = closeListingSuccessModal;
window.openBikeModal      = openBikeModal;
window.navigateTo         = navigateTo;
window.navigateToBike     = navigateToBike;
window.navigateToProfile  = navigateToProfile;
window.navigateToDealer   = navigateToDealer;
window.navigateToMyProfile = navigateToMyProfile;
window.renderMyProfilePage = renderMyProfilePage;
window.switchMyProfileTab  = switchMyProfileTab;
window.renderBikePage     = renderBikePage;
window.renderUserProfilePage  = renderUserProfilePage;
window.renderDealerProfilePage = renderDealerProfilePage;
window.renderDealersPage       = renderDealersPage;
window.renderMapPage           = renderMapPage;
window.toggleMapNearMe         = toggleMapNearMe;
window.resetMapFilters         = resetMapFilters;
window.toggleMapFilterPanel    = toggleMapFilterPanel;
window.splitCardClick          = splitCardClick;
window.toggleSplitList         = toggleSplitList;
window.toggleDealerGPS        = toggleDealerGPS;
window.sortAndRenderDealers   = sortAndRenderDealers;
window.showDetailView     = showDetailView;
window.showListingView    = showListingView;
window.closeBikeModal     = closeBikeModal;
window.openReportModal    = openReportModal;
window.closeReportModal   = closeReportModal;
window.submitReport       = submitReport;
window.toggleBidBox       = toggleBidBox;
window.updateMeetMiddle   = updateMeetMiddle;
window.useMeetMiddle      = useMeetMiddle;
window.toggleMessageBox   = toggleMessageBox;
window.sendMessage        = sendMessage;
window.sendBid            = sendBid;
window.toggleSaveFromModal= toggleSaveFromModal;
window.loadInbox          = loadInbox;
window.openThread         = openThread;
window.closeThread        = closeThread;
window.sendReply          = sendReply;
window.acceptBid          = acceptBid;
window.openInboxModal     = openInboxModal;
window.closeInboxModal    = closeInboxModal;
window.openInboxThread    = openInboxThread;
window.closeInboxThread   = closeInboxThread;
window.loadInboxModal     = loadInboxModal;
window.loadInboxPage      = loadInboxPage;
window.renderInboxPage    = renderInboxPage;

/* ============================================================
   START
   ============================================================ */

// Fang uventede promise-fejl globalt så siden ikke sidder fast
window.addEventListener('unhandledrejection', event => {
  console.error('[Uhandteret fejl]', event.reason);
});

init();

/* ============================================================
   INDBAKKE SIDE (#/inbox)
   ============================================================ */

let activeInboxThread = null;

function openInboxModal() {
  if (!currentUser) { openLoginModal(); return; }
  navigateTo('/inbox');
}

function closeInboxModal() {
  navigateTo('/');
}

async function renderInboxPage() {
  if (!currentUser || !currentProfile) {
    showListingView();
    openLoginModal();
    return;
  }

  showDetailView();
  document.title = 'Indbakke | Cykelbørsen';
  updateSEOMeta('Din indbakke på Cykelbørsen.', '/inbox');
  const detailView = document.getElementById('detail-view');

  detailView.innerHTML = `
    <div class="inbox-page">
      <div class="inbox-page-top">
        <button class="mp-back-btn" onclick="navigateTo('/')">← Forside</button>
        <h1 class="inbox-page-title">Indbakke</h1>
        <p class="inbox-page-subtitle">Dine samtaler med købere og sælgere</p>
      </div>

      <div class="inbox-page-layout">
        <div class="inbox-page-threads" id="inbox-page-threads">
          <div class="inbox-page-loading">
            <div class="inbox-skeleton"></div>
            <div class="inbox-skeleton"></div>
            <div class="inbox-skeleton"></div>
          </div>
        </div>
        <div class="inbox-page-chat" id="inbox-page-chat" style="display:none;">
          <div class="inbox-chat-header" id="inbox-page-chat-header"></div>
          <div class="inbox-chat-messages" id="inbox-page-chat-messages"></div>
          <div class="inbox-chat-reply">
            <div class="quick-replies">
              <button class="qr-btn" onclick="useQuickReply('inbox-modal-reply-text', this)">Stadig til salg 👍</button>
              <button class="qr-btn" onclick="useQuickReply('inbox-modal-reply-text', this)">Prisen er fast</button>
              <button class="qr-btn" onclick="useQuickReply('inbox-modal-reply-text', this)">Kan mødes i weekenden</button>
              <button class="qr-btn" onclick="useQuickReply('inbox-modal-reply-text', this)">Er du stadig interesseret?</button>
              <button class="qr-btn" onclick="useQuickReply('inbox-modal-reply-text', this)">Tak for interessen!</button>
            </div>
            <div class="inbox-chat-reply-row">
              <textarea id="inbox-modal-reply-text" placeholder="Skriv et svar..." rows="2"></textarea>
              <button id="send-inbox-reply-btn" onclick="sendReply(true)">Send</button>
            </div>
          </div>
        </div>
        <div class="inbox-page-empty-state" id="inbox-page-empty-chat">
          <div class="inbox-empty-icon">✉️</div>
          <p>Vælg en samtale for at læse beskeder</p>
        </div>
      </div>
    </div>`;

  await loadInboxPage();
}

async function loadInboxPage() {
  if (!currentUser) return;
  const list = document.getElementById('inbox-page-threads');
  if (!list) return;

  let data, error;
  try {
    ({ data, error } = await supabase
      .from('messages')
      .select('*, bikes(brand, model, bike_images(url, is_primary)), sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type, avatar_url), receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type, avatar_url)')
      .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
      .order('created_at', { ascending: false }));
  } catch (e) {
    error = e;
  }

  if (error) {
    list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInboxPage');
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `
      <div class="inbox-no-messages">
        <div class="inbox-empty-icon">📭</div>
        <h3>Ingen beskeder endnu</h3>
        <p>Når du sender eller modtager beskeder om en annonce, vises de her.</p>
        <button class="btn-primary" onclick="navigateTo('/')" style="margin-top:16px;">Udforsk cykler</button>
      </div>`;
    return;
  }

  const threads = {};
  data.forEach(function(msg) {
    const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
    const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
    const key       = msg.bike_id + '_' + otherId;
    if (!threads[key]) {
      threads[key] = {
        bikeId:     msg.bike_id,
        bike:       msg.bikes,
        otherId:    otherId,
        otherName:  otherProf && otherProf.seller_type === 'dealer' ? otherProf.shop_name : (otherProf ? otherProf.name : 'Ukendt'),
        otherAvatar: otherProf ? otherProf.avatar_url : null,
        messages:   [],
        hasUnread:  false,
        unreadCount: 0,
      };
    }
    threads[key].messages.push(msg);
    if (!msg.read && msg.receiver_id === currentUser.id) {
      threads[key].hasUnread = true;
      threads[key].unreadCount++;
    }
  });

  const threadList = Object.values(threads);

  list.innerHTML = threadList.map(function(t) {
    const lastMsg   = t.messages[0];
    const initials  = (t.otherName || 'U').substring(0, 2).toUpperCase();
    const preview   = esc(lastMsg.content.length > 60 ? lastMsg.content.substring(0, 60) + '...' : lastMsg.content);
    const time      = formatInboxTime(lastMsg.created_at);
    const bikeName  = t.bike ? esc(t.bike.brand + ' ' + t.bike.model) : 'Ukendt cykel';
    const bikeImg   = t.bike?.bike_images?.find(i => i.is_primary)?.url || t.bike?.bike_images?.[0]?.url;
    const isBid     = lastMsg.content.indexOf('💰') === 0;
    const safeName  = (t.otherName || 'Ukendt').replace(/'/g, '');
    const _av = safeAvatarUrl(t.otherAvatar);
    const avatarHTML = _av
      ? '<img src="' + _av + '" alt="" class="inbox-page-avatar-img">'
      : initials;

    return '<div class="inbox-page-row' + (t.hasUnread ? ' unread' : '') + '" onclick="openInboxThread(\'' + t.bikeId + '\', \'' + t.otherId + '\', \'' + safeName + '\')" data-thread="' + t.bikeId + '_' + t.otherId + '">'
      + '<div class="inbox-page-avatar">' + avatarHTML + '</div>'
      + '<div class="inbox-page-row-body">'
      + '<div class="inbox-page-row-top">'
      + '<span class="inbox-page-name">' + esc(t.otherName || 'Ukendt') + '</span>'
      + '<span class="inbox-page-time">' + time + '</span>'
      + '</div>'
      + '<div class="inbox-page-bike">' + (bikeImg ? '<img src="' + bikeImg + '" class="inbox-page-bike-thumb">' : '🚲') + ' ' + bikeName + '</div>'
      + '<div class="inbox-page-preview">'
      + (isBid ? '<span class="inbox-bid-tag">💰 Bud</span> ' : '')
      + preview
      + '</div>'
      + '</div>'
      + (t.hasUnread ? '<span class="inbox-page-unread-dot">' + t.unreadCount + '</span>' : '')
      + '</div>';
  }).join('');
}

function formatInboxTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Lige nu';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' t';
  if (diff < 604800000) return d.toLocaleDateString('da-DK', { weekday: 'short' });
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

async function openInboxThread(bikeId, otherId, otherName) {
  activeInboxThread = { bikeId: bikeId, otherId: otherId, otherName: otherName };

  const chatPanel    = document.getElementById('inbox-page-chat');
  const emptyState   = document.getElementById('inbox-page-empty-chat');
  const headerEl     = document.getElementById('inbox-page-chat-header');
  const messagesEl   = document.getElementById('inbox-page-chat-messages');

  if (chatPanel)  chatPanel.style.display = 'flex';
  if (emptyState) emptyState.style.display = 'none';

  // Markér aktiv tråd i listen
  document.querySelectorAll('.inbox-page-row').forEach(r => r.classList.remove('active'));
  const activeRow = document.querySelector('[data-thread="' + bikeId + '_' + otherId + '"]');
  if (activeRow) activeRow.classList.add('active');

  // Hent cykel-info
  const { data: bikeData } = await supabase
    .from('bikes')
    .select('user_id, is_active, brand, model')
    .eq('id', bikeId)
    .single();

  const isSeller   = bikeData && bikeData.user_id === currentUser.id;
  const bikeActive = bikeData && bikeData.is_active;
  activeInboxThread.isSeller   = isSeller;
  activeInboxThread.bikeActive = bikeActive;

  const bikeName = bikeData ? esc(bikeData.brand + ' ' + bikeData.model) : 'Ukendt cykel';
  if (headerEl) {
    headerEl.innerHTML = `
      <div class="inbox-chat-header-info">
        <button class="inbox-chat-back" onclick="closeInboxThread()" aria-label="Tilbage">←</button>
        <strong>${esc(otherName)}</strong>
        <span class="inbox-chat-bike-link" onclick="navigateTo('/bike/${bikeId}')">🚲 ${bikeName}</span>
      </div>`;
  }

  if (messagesEl) messagesEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Henter beskeder...</p>';

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('bike_id', bikeId)
    .or('and(sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + otherId + '),and(sender_id.eq.' + otherId + ',receiver_id.eq.' + currentUser.id + ')')
    .order('created_at', { ascending: true });

  if (error || !data) {
    if (messagesEl) messagesEl.innerHTML = '<p style="color:var(--rust);text-align:center;">Kunne ikke hente beskeder.</p>';
    return;
  }

  if (messagesEl) {
    messagesEl.innerHTML = renderMessages(data, isSeller, bikeActive, true);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  await supabase.from('messages')
    .update({ read: true })
    .eq('bike_id', bikeId)
    .eq('sender_id', otherId)
    .eq('receiver_id', currentUser.id);

  // Fjern unread-dot fra listen
  if (activeRow) {
    activeRow.classList.remove('unread');
    const dot = activeRow.querySelector('.inbox-page-unread-dot');
    if (dot) dot.remove();
  }

  updateInboxBadge();
}

function closeInboxThread() {
  activeInboxThread = null;
  const chatPanel  = document.getElementById('inbox-page-chat');
  const emptyState = document.getElementById('inbox-page-empty-chat');
  if (chatPanel)  chatPanel.style.display = 'none';
  if (emptyState) emptyState.style.display = '';
  document.querySelectorAll('.inbox-page-row').forEach(r => r.classList.remove('active'));
  const replyText = document.getElementById('inbox-modal-reply-text');
  if (replyText) replyText.value = '';
  loadInboxPage();
}

// Alias for loadInboxModal references elsewhere
async function loadInboxModal() { await loadInboxPage(); }

// sendInboxReply er slået sammen med sendReply(isInbox=true)

async function updateInboxBadge() {
  if (!currentUser) return;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', currentUser.id)
    .eq('read', false);

  const badge    = document.getElementById('nav-inbox-badge');
  const mbnBadge = document.getElementById('mbn-badge');
  if (count > 0) {
    if (badge)    { badge.textContent = count; badge.style.display = 'flex'; }
    if (mbnBadge) { mbnBadge.textContent = count; mbnBadge.style.display = 'flex'; }
  } else {
    if (badge)    badge.style.display = 'none';
    if (mbnBadge) mbnBadge.style.display = 'none';
  }
}

window.startRealtimeNotifications = startRealtimeNotifications;
window.updateInboxBadge        = updateInboxBadge;
window.openBecomeDealerModal   = openBecomeDealerModal;
window.openFooterModal         = openFooterModal;
window.closeFooterModal        = closeFooterModal;
window.submitContactForm       = submitContactForm;
window.closeBecomeDealerModal  = closeBecomeDealerModal;
window.submitDealerApplication = submitDealerApplication;
window.selectDealerPlan        = selectDealerPlan;
window.openSubscriptionPortal  = openSubscriptionPortal;

/* ============================================================
   FOOTER MODALER
   ============================================================ */

var footerContent = {
  'guide-tjek': {
    title: 'Sådan tjekker du en brugt cykel inden køb',
    metaDesc: 'Komplet guide til at tjekke en brugt cykel inden køb: ramme, hjul, drivlinje, bremser og prøvekørsel. Undgå dårlige handler — læs guiden her.',
    body: `
      <p style="margin-bottom:8px;color:var(--muted);font-size:0.82rem;">Af Cykelbørsen · Opdateret april 2026 · 4 min. læsning</p>
      <p style="margin-bottom:24px;font-size:1.05rem;line-height:1.7;">At købe en brugt cykel kan være en god investering — men kun hvis du ved hvad du kigger efter. Denne guide viser dig trin for trin, hvad du skal tjekke, inden du åbner lommebogen.</p>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">1. Rammen — det vigtigste punkt</h2>
      <p style="margin-bottom:8px;">Rammen er cykelens hjerte. En beskadiget ramme kan sjældent repareres sikkert, og den bør få dig til at gå væk fra handlen uanset prisen.</p>
      <ul style="margin-bottom:20px;padding-left:20px;line-height:2;">
        <li><strong>Revner og buler:</strong> Undersøg alle rør — overrøret, underrøret, kæderørene og sadelrøret. Kig især ved svejsningerne samt ved bundbeslag og styrhoved.</li>
        <li><strong>Stålrammer:</strong> Overfladerust er normalt og kan behandles. Rust inde i rørene er et advarselstegn — bank let på rørene og lyt efter en dump eller ujævn lyd.</li>
        <li><strong>Aluminiumsrammer:</strong> Revner er kritiske og kan være svære at opdage. Kig efter hvide pletter (oxidering), især ved svejsningerne.</li>
        <li><strong>Kulfiber:</strong> Hold rammen op mod en lyskilde og se efter sprækker eller misfarvninger. Køb ikke kulfiber uden en grundig inspektion.</li>
        <li><strong>Bøjede rør:</strong> Selv små bøjninger indikerer et hårdt stød, fx et styrt. Gå væk fra handlen.</li>
      </ul>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">2. Hjulene</h2>
      <p style="margin-bottom:8px;">Tag fat i hjulet og snurr det langsomt. Se det fra enden af cyklen:</p>
      <ul style="margin-bottom:20px;padding-left:20px;line-height:2;">
        <li><strong>Skæv fælg (lateral):</strong> Fælgen bevæger sig fra side til side. Kan ofte rettes, men er tegn på slid eller slag.</li>
        <li><strong>Oval fælg (radial):</strong> Hjulet hopper op og ned. Kræver ofte ny fælg.</li>
        <li><strong>Fælgslid:</strong> V-bremsefælge har slidindikatorer (en lille rille). Hvis rillen er væk, er fælgen slidt.</li>
        <li><strong>Egerne:</strong> Niv på alle eger — løse eger giver skæve hjul og kan knække.</li>
        <li><strong>Dækkene:</strong> Kig efter revner i slidbanen og siderne. Fladt mønster eller alder over 5 år → bør skiftes snart.</li>
        <li><strong>Navene:</strong> Hold hjulet fast i aksen og vip det sideværts. Intet slør er godt — slør tyder på slidte lejer.</li>
      </ul>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">3. Drivlinjen (kæde, tandhjul, kranksæt)</h2>
      <p style="margin-bottom:8px;">Drivlinjen er en af de dyreste dele at udskifte. Et slidt sæt (kæde + kassette + klinger) kan koste 500–1500 kr.</p>
      <ul style="margin-bottom:20px;padding-left:20px;line-height:2;">
        <li><strong>Kæden:</strong> Løft kæden fra den forreste klinge. Kan du løfte den mere end ca. ½ cm, er den slidt.</li>
        <li><strong>Kassetten (bageste tandhjul):</strong> Kig på tænderne — de skal være symmetriske. "Hajtænder" (skæve tænder) tyder på slid.</li>
        <li><strong>Klingerne:</strong> Samme princip som kassetten — hajtænder = slid.</li>
        <li><strong>Bundbeslaget:</strong> Hold pedalerne og vip dem sideværts. Intet slør er godt — slør tyder på slidte lejer.</li>
        <li><strong>Klik og støj:</strong> Drej pedalerne. Klik eller støj indikerer typisk slid i drivlinjen.</li>
      </ul>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">4. Bremserne</h2>
      <p style="margin-bottom:8px;"><strong>Skivebremser (hydrauliske):</strong><br>Tjek for olielækage ved kalibre og langs slangen. Kig, om bremseskiven er lige. Hvis bremsehåndtaget skal trykkes langt ind, kan der være luft i systemet.</p>
      <p style="margin-bottom:8px;"><strong>Skivebremser (mekaniske):</strong><br>Tjek tykkelsen på bremseklodserne — de fleste har slidindikator.</p>
      <p style="margin-bottom:8px;"><strong>Fælgbremser:</strong><br>Klem bremsehåndtaget. Der bør være mindst ca. 2 cm til styret. Sørg for, at bremseklodserne rammer fælgen korrekt og ikke dækket.</p>
      <p style="margin-bottom:20px;"><strong>Prøv bremserne:</strong><br>Tag cyklen ud og brems hårdt. Cyklen skal stoppe kontrolleret uden at vibrere eller trække til siden.</p>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">5. Styr, gaffel og saddel</h2>
      <ul style="margin-bottom:20px;padding-left:20px;line-height:2;">
        <li><strong>Gaflen:</strong> Kig forfra efter revner ved kronrøret. Hold forbremsen inde og pres cyklen frem og tilbage — der må ikke være slør i styrfittingen.</li>
        <li><strong>Styret:</strong> Hold forhjulet fast mellem benene og prøv at dreje styret. Ingen slør — bevægelsen skal være jævn.</li>
        <li><strong>Sadelstolpen:</strong> Tjek om sadelrøret er ridset (tegn på forkert brug). Sørg for, at sadlen sidder fast.</li>
        <li><strong>Affjedring (MTB/elcykel):</strong> Tryk på gaflen. Den skal bevæge sig jævnt og returnere kontrolleret. Olie på standrørene tyder på slidte pakninger.</li>
      </ul>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">6. Prøvekørsel — obligatorisk</h2>
      <p style="margin-bottom:8px;">Afvis aldrig en prøvetur. En sælger, der nægter, er et advarselstegn.</p>
      <ul style="margin-bottom:8px;padding-left:20px;line-height:2;">
        <li><strong>Skift gennem alle gear</strong> — det skal ske glat uden hop</li>
        <li><strong>Brems hårdt</strong> fra 15–20 km/t</li>
        <li><strong>Lyt efter lyde:</strong>
          <ul style="padding-left:20px;">
            <li>Klik → slid i drivlinje eller bundbeslag</li>
            <li>Knirk → løse dele</li>
            <li>Slag → fx løse eger eller slidte lejer</li>
          </ul>
        </li>
      </ul>
      <p style="margin-bottom:20px;"><strong>Stelnummer:</strong> Findes typisk under krankboksen eller på underrøret. Tag et billede og tjek det på <a href="https://politi.dk" target="_blank" rel="noopener" style="color:var(--rust);">politi.dk</a>.</p>

      <h2 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:12px;color:var(--charcoal);">7. Dokumentation og pris</h2>
      <ul style="margin-bottom:20px;padding-left:20px;line-height:2;">
        <li><strong>Kvittering:</strong> Ikke et krav, men et godt tegn. Mangler den, er stelnummer-tjek ekstra vigtigt.</li>
        <li><strong>Servicehistorik:</strong> Regelmæssig service tyder på en velholdt cykel.</li>
        <li><strong>Sammenlign priser:</strong> Kig på lignende annoncer for at vurdere niveauet.</li>
        <li><strong>Forhandling:</strong> Finder du slid eller fejl, er det helt fair at forhandle.</li>
        <li><strong>Elcykler:</strong> Bed om at se batteriets kapacitet i appen. Under ca. 70 % bør give et prisnedslag på 1.000–3.000 kr.</li>
      </ul>

      <div style="background:var(--sand);border-radius:12px;padding:20px 24px;margin-top:28px;border:1px solid var(--border);">
        <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Klar til at købe?</h3>
        <p style="margin-bottom:12px;font-size:0.95rem;">Find din næste cykel på Cykelbørsen — Danmarks dedikerede markedsplads for brugte cykler.</p>
        <button onclick="navigateTo('/')" style="background:var(--rust);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Se alle cykler</button>
      </div>
    `
  },
  about: {
    title: 'Om Cykelbørsen',
    body: `
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Hvad er Cykelbørsen?</h3>
      <p style="margin-bottom:16px;">Cykelbørsen er Danmarks dedikerede markedsplads for køb og salg af brugte cykler. Vi forbinder private sælgere og autoriserede forhandlere med cykelkøbere over hele landet — hurtigt, nemt og gratis.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Vores mission</h3>
      <p style="margin-bottom:16px;">Vi tror på, at en god brugt cykel fortjener en ny ejer. Ved at gøre det nemt at købe og sælge brugte cykler hjælper vi med at forlænge cyklernes levetid og reducere unødvendigt affald.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">For private sælgere</h3>
      <p style="margin-bottom:16px;">Det er helt gratis at oprette en annonce som privat sælger. Upload billeder, sæt din pris, og kom i kontakt med interesserede købere direkte via vores beskedsystem.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">For forhandlere</h3>
      <p style="margin-bottom:16px;">Verificerede cykelforhandlere kan oprette ubegrænsede annoncer med et abonnement. Forhandlere fremhæves med et verificeret badge, som øger tilliden hos potentielle købere.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Kontakt os</h3>
      <p style="margin-bottom:16px;">Har du spørgsmål eller brug for hjælp? Skriv til os via <a onclick="closeFooterModal();openFooterModal('contact')" style="color:var(--rust);cursor:pointer;text-decoration:underline;">kontaktformularen</a> — vi vender tilbage hurtigst muligt.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Virksomhedsoplysninger</h3>
      <p style="font-size:0.88rem;">Cykelbørsen v/ Benjamin Vojdeman<br>CVR: 46403568<br>Bentzonsvej 46, 2. tv, 2000 Frederiksberg<br>E-mail: kontakt@cykelborsen.dk</p>
    `
  },
  terms: {
    title: 'Vilkår og betingelser',
    body: `
      <p style="margin-bottom:16px;color:var(--muted);font-size:0.82rem;">Senest opdateret: 16. april 2026</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">1. Introduktion og tjenesteyder</h3>
      <p style="margin-bottom:8px;">Cykelbørsen (i det følgende "vi", "os" eller "platformen") er en online markedsplads der formidler kontakt mellem private sælgere, forhandlere og købere af brugte cykler i Danmark. Platformen er tilgængelig via <strong>cykelbørsen.dk</strong>. Ved at oprette en konto eller benytte platformen accepterer du disse vilkår i deres helhed.</p>
      <p style="margin-bottom:16px;font-size:0.88rem;"><strong>Virksomhedsoplysninger:</strong><br>Cykelbørsen v/ Benjamin Vojdeman<br>CVR: 46403568<br>Bentzonsvej 46, 2. tv, 2000 Frederiksberg<br>E-mail: kontakt@cykelborsen.dk</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">2. Brugeroprettelse og konto</h3>
      <p style="margin-bottom:8px;">For at oprette annoncer eller kontakte sælgere skal du oprette en konto med en gyldig e-mailadresse. Du er ansvarlig for:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li>At de oplysninger du angiver er korrekte og opdaterede.</li>
        <li>At holde dine loginoplysninger fortrolige.</li>
        <li>Al aktivitet der foregår under din konto.</li>
      </ul>
      <p style="margin-bottom:16px;">Du skal være mindst 18 år for at oprette en konto. Hver person må kun have én aktiv konto.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">3. Platformens rolle</h3>
      <p style="margin-bottom:16px;">Cykelbørsen er udelukkende en formidlingsplatform. Vi er <strong>ikke part</strong> i handler mellem køber og sælger og påtager os intet ansvar for selve transaktionen, herunder betaling, levering, stand eller ægtheden af de annoncerede varer. Enhver aftale indgås direkte mellem køber og sælger.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">4. Oprettelse af annoncer</h3>
      <p style="margin-bottom:8px;">Som sælger er det gratis at oprette annoncer (for private). Du indestår for at:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li>Annoncen er retvisende og ikke vildledende mht. stand, pris, billeder og beskrivelse.</li>
        <li>Du har lovlig ret til at sælge den annoncerede vare.</li>
        <li>Annonceindholdet ikke krænker tredjemands rettigheder (ophavsret, varemærker mv.).</li>
        <li>Annoncen overholder gældende dansk lovgivning, herunder markedsføringsloven og købeloven.</li>
      </ul>
      <p style="margin-bottom:16px;">Vi forbeholder os ret til uden varsel at fjerne annoncer der overtræder disse vilkår, er ulovlige, vildledende eller på anden vis upassende.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">5. Forhandlerkonto</h3>
      <p style="margin-bottom:16px;">Professionelle cykelforhandlere kan oprette en gratis forhandlerkonto. Forhandlere skal oplyse gyldigt CVR-nummer, butiksnavn, kontaktperson og adresse. Forhandlerkonti verificeres med et badge der vises på annoncer og profil. Vi forbeholder os retten til at afvise eller fjerne forhandlerkonti der ikke opfylder kravene, herunder at CVR-nummeret er aktivt og tilhører en reel cykelvirksomhed.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">6. Forbudt indhold og adfærd</h3>
      <p style="margin-bottom:8px;">Det er ikke tilladt at:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li>Oprette annoncer for stjålne varer eller varer du ikke ejer.</li>
        <li>Anvende platformen til svindel, spam, phishing eller chikane.</li>
        <li>Uploade stødende, ulovligt eller krænkende indhold.</li>
        <li>Manipulere priser, anmeldelser eller andre brugeres data.</li>
        <li>Systematisk indsamle data fra platformen (scraping).</li>
      </ul>
      <p style="margin-bottom:16px;">Overtrædelse kan medføre øjeblikkelig sletning af konto og annoncer samt eventuelt politianmeldelse.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">7. Immaterielle rettigheder</h3>
      <p style="margin-bottom:16px;">Alt indhold på platformen (design, kode, logo, tekster) tilhører Cykelbørsen. Ved at uploade billeder og tekst til en annonce giver du os en ikke-eksklusiv, vederlagsfri ret til at vise indholdet på platformen. Du bevarer selv ophavsretten til dit indhold.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">8. Ansvarsfraskrivelse</h3>
      <p style="margin-bottom:8px;">Cykelbørsen:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li>Garanterer ikke for rigtigheden, fuldstændigheden eller kvaliteten af annoncer.</li>
        <li>Er ikke ansvarlig for direkte eller indirekte tab som følge af handler indgået via platformen.</li>
        <li>Garanterer ikke for brugeres identitet, selv om ID-verificering tilbydes.</li>
        <li>Er ikke ansvarlig for nedetid, tekniske fejl eller tab af data.</li>
      </ul>
      <p style="margin-bottom:16px;">Platformen stilles til rådighed "som den er" uden garantier af nogen art, i det omfang gældende lovgivning tillader det.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">9. Sletning af konto</h3>
      <p style="margin-bottom:16px;">Du kan til enhver tid slette din konto via profilindstillingerne. Ved sletning fjernes dine personoplysninger, annoncer og beskeder permanent. Eventuelle aktive forhandlerabonnementer skal opsiges separat via Stripe.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">10. Fortrydelsesret</h3>
      <p style="margin-bottom:16px;">Da Cykelbørsen er en gratis formidlingsplatform, gælder der ingen fortrydelsesret for oprettelse af brugerkonti eller annoncer — disse kan til enhver tid slettes via profilindstillingerne. Køb og salg af cykler sker direkte mellem køber og sælger, og er underlagt købelovens almindelige regler om fortrydelsesret ved fjernsalg mellem forbruger og erhvervsdrivende (14 dages fortrydelsesret jf. forbrugeraftalelovens kap. 4). Ved private handler mellem to privatpersoner gælder fortrydelsesretten ikke.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">11. AI-chatassistent</h3>
      <p style="margin-bottom:16px;">Platformen tilbyder en AI-baseret chatassistent til generel hjælp og support. Svar fra AI-assistenten er udelukkende vejledende og udgør ikke juridisk, økonomisk eller professionel rådgivning. Vi garanterer ikke for rigtigheden eller fuldstændigheden af AI-assistentens svar. Ved tvivl bør du altid kontakte os direkte eller søge professionel rådgivning.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">12. Ændringer af vilkår</h3>
      <p style="margin-bottom:16px;">Vi kan opdatere disse vilkår fra tid til anden. Væsentlige ændringer vil blive meddelt via e-mail eller en meddelelse på platformen. Fortsat brug af platformen efter ændringer udgør accept af de opdaterede vilkår.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">13. Lovvalg og tvistløsning</h3>
      <p style="margin-bottom:16px;">Disse vilkår er underlagt dansk ret. Eventuelle tvister skal forsøges løst i mindelighed. Hvis dette ikke er muligt, afgøres tvisten ved de danske domstole. Som forbruger kan du også klage til <a href="https://naevneneshus.dk" target="_blank" rel="noopener" style="color:var(--rust);text-decoration:underline;">Nævnenes Hus</a> eller <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener" style="color:var(--rust);text-decoration:underline;">EU's online klageportal</a>.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">14. Kontakt</h3>
      <p>Ved spørgsmål til disse vilkår kan du kontakte os på <strong>kontakt@cykelborsen.dk</strong>. Se virksomhedsoplysninger i sektion 1.</p>
    `
  },
  privacy: {
    title: 'Privatlivspolitik',
    body: `
      <p style="margin-bottom:16px;color:var(--muted);font-size:0.82rem;">Senest opdateret: 16. april 2026</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">1. Dataansvarlig</h3>
      <p style="margin-bottom:8px;">Dataansvarlig for behandlingen af dine personoplysninger er:</p>
      <p style="margin-bottom:16px;font-size:0.88rem;"><strong>Cykelbørsen v/ Benjamin Vojdeman</strong><br>CVR: 46403568<br>Bentzonsvej 46, 2. tv, 2000 Frederiksberg<br>E-mail: kontakt@cykelborsen.dk</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">2. Hvilke personoplysninger indsamler vi?</h3>
      <p style="margin-bottom:8px;">Vi indsamler følgende kategorier af personoplysninger:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li><strong>Kontooplysninger:</strong> Navn, e-mailadresse, adgangskode (krypteret), profilbillede (valgfrit).</li>
        <li><strong>Profiloplysninger:</strong> By, biografi, sælgertype (privat/forhandler), butiksnavn og CVR (kun forhandlere).</li>
        <li><strong>Annoncedata:</strong> Cykelbeskrivelser, billeder, priser, kontaktoplysninger i annoncer.</li>
        <li><strong>Kommunikation:</strong> Beskeder sendt via platformens beskedsystem.</li>
        <li><strong>Tekniske data:</strong> IP-adresse, browsertype, besøgstidspunkt (logges af hosting-infrastrukturen).</li>
        <li><strong>Betalingsdata:</strong> Forhandlerabonnementer håndteres af Stripe — vi gemmer ikke kortnumre eller betalingsoplysninger.</li>
        <li><strong>ID-verificering:</strong> Hvis du vælger at ID-verificere, uploades et billede af dit ID, som slettes efter godkendelse/afvisning.</li>
      </ul>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">3. Formål og retsgrundlag</h3>
      <p style="margin-bottom:8px;">Vi behandler dine personoplysninger til følgende formål:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:0.88rem;">
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;font-weight:600;">Formål</td>
          <td style="padding:8px 0;">Retsgrundlag (GDPR)</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">Oprettelse og drift af din konto</td>
          <td style="padding:8px 0;">Art. 6(1)(b) — kontraktopfyldelse</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">Visning af dine annoncer</td>
          <td style="padding:8px 0;">Art. 6(1)(b) — kontraktopfyldelse</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">Beskedsystem mellem brugere</td>
          <td style="padding:8px 0;">Art. 6(1)(b) — kontraktopfyldelse</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">E-mail-notifikationer (beskeder, bud, likes)</td>
          <td style="padding:8px 0;">Art. 6(1)(f) — legitim interesse</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">Håndtering af forhandlerabonnement</td>
          <td style="padding:8px 0;">Art. 6(1)(b) — kontraktopfyldelse</td>
        </tr>
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 8px 8px 0;">Forebyggelse af misbrug og svindel</td>
          <td style="padding:8px 0;">Art. 6(1)(f) — legitim interesse</td>
        </tr>
        <tr>
          <td style="padding:8px 8px 8px 0;">Henvendelser via kontaktformular</td>
          <td style="padding:8px 0;">Art. 6(1)(f) — legitim interesse</td>
        </tr>
      </table>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">4. Databehandlere og tredjeparter</h3>
      <p style="margin-bottom:8px;">Vi deler dine data med følgende tredjeparter, udelukkende med henblik på at levere vores tjeneste:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li><strong>Supabase (USA)</strong> — Database, autentificering og fil-hosting. Data overføres til USA under EU-US Data Privacy Framework.</li>
        <li><strong>Stripe (USA)</strong> — Betalingshåndtering for forhandlerabonnementer. Stripe er selvstændig dataansvarlig for betalingsdata. <a href="https://stripe.com/dk/privacy" target="_blank" rel="noopener" style="color:var(--rust);text-decoration:underline;">Stripes privatlivspolitik</a>.</li>
        <li><strong>Resend (USA)</strong> — Afsendelse af transaktionelle e-mails (notifikationer). Data overføres under EU-US Data Privacy Framework.</li>
        <li><strong>GitHub Pages (USA)</strong> — Hosting af hjemmesiden (statisk). Ingen persondata lagres her.</li>
        <li><strong>Anthropic (USA)</strong> — AI-chatassistent (support). Chatbeskeder sendes til Anthropic's API for at generere svar. Beskeder logges ikke permanent af os, men behandles af Anthropic jf. deres <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener" style="color:var(--rust);text-decoration:underline;">privatlivspolitik</a>. Del ikke følsomme personoplysninger i chatten.</li>
      </ul>
      <p style="margin-bottom:16px;">Vi sælger eller videregiver <strong>aldrig</strong> dine personoplysninger til tredjepart med henblik på markedsføring.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">5. Overførsel til tredjelande</h3>
      <p style="margin-bottom:16px;">Dine data kan overføres til USA via vores databehandlere (Supabase, Stripe, Resend). Overførslen sker på baggrund af EU-US Data Privacy Framework eller EU-Kommissionens standardkontraktbestemmelser (SCC'er), jf. GDPR art. 46(2)(c).</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">6. Opbevaringsperiode</h3>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li><strong>Kontodata:</strong> Opbevares så længe din konto er aktiv. Ved sletning af konto fjernes data permanent.</li>
        <li><strong>Annoncer:</strong> Aktive annoncer vises på platformen. Solgte/slettede annoncer fjernes fra databasen.</li>
        <li><strong>Beskeder:</strong> Opbevares så længe kontoen eksisterer og slettes ved kontosletning.</li>
        <li><strong>ID-dokumenter:</strong> Slettes efter verificeringsprocessen er afsluttet.</li>
        <li><strong>Kontakthenvendelser:</strong> Opbevares i op til 12 måneder.</li>
      </ul>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">7. Cookies</h3>
      <p style="margin-bottom:16px;">Vi bruger udelukkende <strong>teknisk nødvendige cookies</strong> og lokal lagring (localStorage) til autentificering og sessionshåndtering. Vi anvender <strong>ikke</strong> tracking-cookies, analyse-cookies eller tredjeparts markedsføringscookies. Da vi kun bruger nødvendige cookies, kræves der ikke samtykke jf. cookiebekendtgørelsen § 4, stk. 2.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">8. Dine rettigheder</h3>
      <p style="margin-bottom:8px;">I henhold til GDPR har du følgende rettigheder:</p>
      <ul style="margin-bottom:16px;padding-left:20px;line-height:1.8;">
        <li><strong>Ret til indsigt</strong> (art. 15) — Du kan anmode om at se hvilke data vi har om dig.</li>
        <li><strong>Ret til berigtigelse</strong> (art. 16) — Du kan rette forkerte oplysninger i din profil.</li>
        <li><strong>Ret til sletning</strong> (art. 17) — Du kan slette din konto og alle tilknyttede data via profilindstillingerne eller ved at kontakte os.</li>
        <li><strong>Ret til begrænsning</strong> (art. 18) — Du kan anmode om begrænsning af behandlingen.</li>
        <li><strong>Ret til dataportabilitet</strong> (art. 20) — Du kan anmode om at modtage dine data i et struktureret, maskinlæsbart format.</li>
        <li><strong>Ret til indsigelse</strong> (art. 21) — Du kan gøre indsigelse mod behandling baseret på legitim interesse.</li>
      </ul>
      <p style="margin-bottom:16px;">For at udøve dine rettigheder, kontakt os på <strong>kontakt@cykelborsen.dk</strong>. Vi svarer inden for 30 dage.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">9. Klage til tilsynsmyndighed</h3>
      <p style="margin-bottom:16px;">Hvis du mener at vi behandler dine personoplysninger i strid med GDPR, har du ret til at klage til <a href="https://www.datatilsynet.dk" target="_blank" rel="noopener" style="color:var(--rust);text-decoration:underline;">Datatilsynet</a> (datatilsynet.dk), Carl Jacobsens Vej 35, 2500 Valby, tlf. 33 19 32 00.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">10. Ændringer</h3>
      <p style="margin-bottom:16px;">Vi kan opdatere denne privatlivspolitik. Væsentlige ændringer meddeles via e-mail til registrerede brugere. Den gældende version er altid tilgængelig her på platformen.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">11. Kontakt</h3>
      <p>Spørgsmål om persondata rettes til <strong>kontakt@cykelborsen.dk</strong>. Se fulde virksomhedsoplysninger i sektion 1.</p>
    `
  },
  contact: {
    title: 'Kontakt os',
    body: `
      <p style="margin-bottom:22px;color:#8A8578;">Har du spørgsmål, oplever du problemer eller vil du rapportere en annonce? Vi svarer inden for 1-2 hverdage.</p>

      <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--sand);border-radius:10px;border:1px solid var(--border);">
          <span style="font-size:1.4rem;">📧</span>
          <div>
            <div style="font-weight:600;font-size:0.88rem;">E-mail</div>
            <div style="color:var(--muted);font-size:0.85rem;">kontakt@cykelborsen.dk</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--sand);border-radius:10px;border:1px solid var(--border);">
          <span style="font-size:1.4rem;">⏱️</span>
          <div>
            <div style="font-weight:600;font-size:0.88rem;">Svartid</div>
            <div style="color:var(--muted);font-size:0.85rem;">Hverdage kl. 9–17</div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">Dit navn</label>
          <input type="text" id="contact-name" placeholder="Dit fulde navn" onkeydown="if(event.key==='Enter')submitContactForm()" style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">E-mail</label>
          <input type="email" id="contact-email" placeholder="din@email.dk" onkeydown="if(event.key==='Enter')submitContactForm()" style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">Besked</label>
          <textarea id="contact-message" placeholder="Beskriv dit spørgsmål eller problem..." style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;resize:vertical;min-height:100px;"></textarea>
        </div>
        <button onclick="submitContactForm()" style="background:var(--rust);color:#fff;border:none;padding:14px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:4px;">Send besked</button>
      </div>
    `
  }
};

const staticPageRoutes = { about: '/om-os', terms: '/vilkaar', privacy: '/privatlivspolitik', contact: '/kontakt', 'guide-tjek': '/guide/tjek-brugt-cykel' };

function renderStaticPage(type) {
  const data = footerContent[type];
  if (!data) { showListingView(); return; }
  showDetailView();
  document.title = `${data.title} – Cykelbørsen`;
  const metaDesc = data.metaDesc || `${data.title} – Cykelbørsen. Danmarks markedsplads for brugte cykler.`;
  updateSEOMeta(metaDesc, staticPageRoutes[type] || '/');
  const backAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";
  // Fix internal link from Om os → Kontakt
  const body = data.body.replace(/closeFooterModal\(\);openFooterModal\('contact'\)/g, "navigateTo('/kontakt')");
  document.getElementById('detail-view').innerHTML = `
    <div class="static-page">
      <button class="sell-back-btn" onclick="${backAction}">← Tilbage</button>
      <h1 class="static-page-title">${data.title}</h1>
      <div class="static-page-body">${body}</div>
    </div>`;
}

function openFooterModal(type) {
  const routes = { about: '/om-os', terms: '/vilkaar', privacy: '/privatlivspolitik', contact: '/kontakt' };
  if (routes[type]) navigateTo(routes[type]);
}

function closeFooterModal() {
  // Noop — bruges ikke mere, holdes for kompatibilitet
}

async function submitContactForm() {
  var name    = document.getElementById('contact-name').value.trim();
  var email   = document.getElementById('contact-email').value.trim();
  var message = document.getElementById('contact-message').value.trim();
  if (!name || !email || !message) { showToast('⚠️ Udfyld alle felter'); return; }

  const { error } = await supabase.from('contact_messages').insert({ name, email, message });
  if (error) { showToast('❌ Noget gik galt – prøv igen'); return; }

  supabase.functions.invoke('notify-message', {
    body: { type: 'contact_form', name, email, message },
  }).catch(() => {});

  document.getElementById('contact-name').value    = '';
  document.getElementById('contact-email').value   = '';
  document.getElementById('contact-message').value = '';
  showToast('✅ Tak! Vi vender tilbage inden for 1-2 hverdage.');
}


/* ============================================================
   ADMIN PANEL
   ============================================================ */

async function openAdminPanel() {
  document.getElementById('admin-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAdminTab('applications');
}

function closeAdminPanel() {
  document.getElementById('admin-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function switchAdminTab(tab) {
  document.getElementById('admin-applications').style.display = tab === 'applications' ? 'block' : 'none';
  document.getElementById('admin-users').style.display        = tab === 'users'        ? 'block' : 'none';
  document.getElementById('admin-id').style.display           = tab === 'id'           ? 'block' : 'none';
  document.getElementById('atab-applications').classList.toggle('active', tab === 'applications');
  document.getElementById('atab-users').classList.toggle('active', tab === 'users');
  document.getElementById('atab-id').classList.toggle('active', tab === 'id');
  if (tab === 'applications') loadDealerApplications();
  if (tab === 'users')        loadAllUsers();
  if (tab === 'id')           loadIdApplications();
}

async function loadDealerApplications() {
  var list = document.getElementById('admin-applications-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .eq('seller_type', 'dealer')
      .eq('verified', false)
      .order('created_at', { ascending: false });
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente ansøgninger.', 'loadDealerApplications');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.shop_name || p.name) + '</div>'
      + '<div class="admin-row-meta">'
      + (p.name ? p.name + ' · ' : '')
      + (p.email || '') + (p.cvr ? ' · CVR: ' + p.cvr : '')
      + (p.city ? ' · ' + p.city : '') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Godkend</button>'
      + '<button class="btn-reject" onclick="rejectDealer(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function loadAllUsers() {
  var list = document.getElementById('admin-users-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter brugere...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente brugere.', 'loadAllUsers');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen brugere fundet.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    var isVerified = p.verified;
    var isDealer   = p.seller_type === 'dealer';
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">'
      + (p.name || 'Ukendt')
      + (isVerified ? ' <span class="verified-badge">✓</span>' : '')
      + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (isDealer ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + (isDealer && !isVerified ? '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Verificer</button>' : '')
      + (isVerified ? '<button class="btn-reject" onclick="revokeDealer(\'' + p.id + '\')">Fjern verificering</button>' : '')
      + '</div></div>';
  }).join('');
}

async function approveDealer(userId) {
  var err = (await supabase.from('profiles').update({ verified: true }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke godkende forhandler'); return; }
  showToast('✅ Forhandler godkendt og verificeret!');
  loadDealerApplications();
  loadAllUsers();
}

async function rejectDealer(userId) {
  if (!confirm('Afvis denne ansøgning og fjern forhandlerstatus?')) return;
  var err = (await supabase.from('profiles').update({ seller_type: 'private', verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke afvise'); return; }
  showToast('🗑️ Ansøgning afvist');
  loadDealerApplications();
}

async function revokeDealer(userId) {
  if (!confirm('Fjern verificering fra denne forhandler?')) return;
  var err = (await supabase.from('profiles').update({ verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('Verificering fjernet');
  loadAllUsers();
}

window.openAdminPanel       = openAdminPanel;
window.closeAdminPanel      = closeAdminPanel;
window.switchAdminTab       = switchAdminTab;
window.approveDealer        = approveDealer;
window.rejectDealer         = rejectDealer;
window.revokeDealer         = revokeDealer;

/* ============================================================
   AUTOCOMPLETE SØGNING
   ============================================================ */

var autocompleteTimeout = null;
var autocompleteIndex   = -1;

async function searchAutocomplete(query) {
  clearTimeout(autocompleteTimeout);
  var list = document.getElementById('autocomplete-list');

  if (!query || query.length < 2) { list.style.display = 'none'; return; }

  autocompleteTimeout = setTimeout(async function() { // 300ms debounce
    var result = await supabase
      .from('bikes')
      .select('brand, model, type, price')
      .eq('is_active', true)
      .or('brand.ilike.%' + query.replace(/[%_\\,.()"']/g, '') + '%,model.ilike.%' + query.replace(/[%_\\,.()"']/g, '') + '%')
      .limit(8);

    if (!result.data || result.data.length === 0) {
      list.innerHTML = '<div class="autocomplete-no-results">Ingen resultater for "<strong>' + esc(query) + '</strong>"</div>';
      list.style.display = 'block';
      return;
    }

    // Deduplikér brand+model kombinationer
    var seen = {};
    var items = result.data.filter(function(b) {
      var key = b.brand + ' ' + b.model;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    autocompleteIndex = -1;
    // Escape query til regex og HTML — forhindrer XSS via søgefeltet
    var safeQueryRegex = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var safeQueryHtml  = esc(query);
    list.innerHTML = items.map(function(b, i) {
      var display     = esc(b.brand + ' ' + b.model);
      var highlighted = display.replace(new RegExp('(' + safeQueryRegex + ')', 'gi'), '<strong>$1</strong>');
      var selectVal   = (b.brand + ' ' + b.model).replace(/'/g, '');
      return '<div class="autocomplete-item" data-index="' + i + '" onclick="selectAutocomplete(\'' + selectVal + '\')">'
        + '🚲 ' + highlighted
        + '<span class="autocomplete-meta">' + esc(b.type) + ' · ' + b.price.toLocaleString('da-DK') + ' kr.</span>'
        + '</div>';
    }).join('');

    list.style.display = 'block';
  }, 300);
}

function selectAutocomplete(value) {
  document.getElementById('search-input').value = value;
  document.getElementById('autocomplete-list').style.display = 'none';
  searchBikes();
}

function handleSearchKey(e) {
  var list  = document.getElementById('autocomplete-list');
  var items = list.querySelectorAll('.autocomplete-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
  } else if (e.key === 'Enter') {
    if (autocompleteIndex >= 0) {
      items[autocompleteIndex].click();
    } else {
      list.style.display = 'none';
      searchBikes();
    }
    return;
  } else if (e.key === 'Escape') {
    list.style.display = 'none'; return;
  }

  items.forEach(function(el, i) {
    el.classList.toggle('active', i === autocompleteIndex);
  });
}

// Luk autocomplete ved klik udenfor
document.addEventListener('click', function(e) {
  const editOpen = document.getElementById('edit-modal')?.classList.contains('open');
  if (editOpen) {
    // Skip autocomplete handling when edit modal is open
  }
  if (!e.target.closest('#search-input') && !e.target.closest('#autocomplete-list')) {
    var list = document.getElementById('autocomplete-list');
    if (list) list.style.display = 'none';
  }
});

/* ============================================================
   SÆT SOM SOLGT
   ============================================================ */

async function toggleSold(bikeId, currentlySold) {
  if (currentlySold) {
    // Genaktiver
    const err = (await supabase.from('bikes').update({ is_active: true }).eq('id', bikeId)).error;
    if (err) { showToast('❌ Kunne ikke opdatere status'); return; }
    showToast('✅ Annonce aktiv igen');
    reloadMyListings(); loadBikes(); updateFilterCounts();
    return;
  }

  // Hent brugere der har skrevet om denne cykel
  const { data: threads } = await supabase.from('messages')
    .select('sender_id, sender:profiles!messages_sender_id_fkey(name, shop_name, seller_type)')
    .eq('bike_id', bikeId)
    .eq('receiver_id', currentUser.id)
    .neq('sender_id', currentUser.id);

  // Deduplikér på sender_id
  const seen = new Set();
  const buyers = (threads || []).filter(m => {
    if (seen.has(m.sender_id)) return false;
    seen.add(m.sender_id);
    return true;
  });

  if (buyers.length > 0) {
    showBuyerPickerModal(bikeId, buyers);
  } else {
    await markBikeSold(bikeId, null, null);
  }
}

function showBuyerPickerModal(bikeId, buyers) {
  const existing = document.getElementById('buyer-picker-modal');
  if (existing) existing.remove();

  const options = buyers.map(m => {
    const name = m.sender?.seller_type === 'dealer' ? (m.sender?.shop_name || m.sender?.name) : m.sender?.name;
    const safe = (name || 'Ukendt').replace(/'/g, "\\'");
    return `<button class="buyer-pick-btn" onclick="confirmBuyerSelection('${bikeId}','${m.sender_id}','${safe}')">
      <span style="font-weight:600;">${name || 'Ukendt'}</span>
    </button>`;
  }).join('');

  const el = document.createElement('div');
  el.id = 'buyer-picker-modal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  el.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:100%;font-family:'DM Sans',sans-serif;box-shadow:0 8px 40px rgba(0,0,0,0.18);">
      <h3 style="font-family:'Fraunces',serif;margin:0 0 6px;">Hvem købte cyklen?</h3>
      <p style="color:var(--muted);font-size:0.88rem;margin:0 0 16px;">Vælg køber, så I begge kan vurdere hinanden.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${options}
        <button class="buyer-pick-btn" style="color:var(--muted);border-color:var(--border);" onclick="confirmBuyerSelection('${bikeId}',null,null)">
          Ingen af disse / ekstern handel
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
}

async function confirmBuyerSelection(bikeId, buyerId, buyerName) {
  const modal = document.getElementById('buyer-picker-modal');
  if (modal) modal.remove();
  document.body.style.overflow = '';
  await markBikeSold(bikeId, buyerId, buyerName);
}

async function markBikeSold(bikeId, buyerId, buyerName) {
  const err = (await supabase.from('bikes').update({ is_active: false }).eq('id', bikeId)).error;
  if (err) { showToast('❌ Kunne ikke markere som solgt'); return; }

  if (buyerId) {
    // Send handelsbekræftelse i tråden — bruges som bevis for handel ved vurdering
    await supabase.from('messages').insert({
      bike_id:     bikeId,
      sender_id:   currentUser.id,
      receiver_id: buyerId,
      content:     '✅ Handel bekræftet og accepteret! Tak for handlen – I kan nu vurdere hinanden.',
    });
    reloadMyListings(); loadBikes(); updateFilterCounts();
    // Åbn købers profil direkte med vurderingsformular
    openUserProfileWithReview(buyerId);
  } else {
    showToast('🏷️ Annonce markeret som solgt');
    reloadMyListings(); loadBikes(); updateFilterCounts();
  }
}

/* ============================================================
   DEL ANNONCE
   ============================================================ */

var currentShareBikeId = null;

function openShareModal(bikeId, title) {
  currentShareBikeId = bikeId;
  var url  = 'https://cykelbørsen.dk/bike/' + bikeId;
  var text = 'Tjek denne cykel på Cykelbørsen: ' + title;

  document.getElementById('share-link-input').value = url;
  document.getElementById('share-modal').dataset.title = title;
  document.getElementById('share-whatsapp-btn').href  = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
  document.getElementById('share-facebook-btn').href  = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);

  document.getElementById('share-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function copyShareLink() {
  var input = document.getElementById('share-link-input');
  navigator.clipboard.writeText(input.value).then(function() {
    showToast('✅ Link kopieret!');
  }).catch(function() {
    input.select();
    document.execCommand('copy');
    showToast('✅ Link kopieret!');
  });
}

function shareViaSMS() {
  var url  = document.getElementById('share-link-input').value;
  var text = 'Tjek denne cykel på Cykelbørsen: ' + url;
  window.location.href = 'sms:?body=' + encodeURIComponent(text);
}

function openNativeShare() {
  var url   = document.getElementById('share-link-input').value;
  var title = document.getElementById('share-modal').dataset.title || 'Cykel til salg';
  var text  = 'Tjek denne cykel på Cykelbørsen: ' + title;

  // Brug Web Share API hvis tilgængelig (mobil)
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url })
      .then(function() { showToast('✅ Delt!'); })
      .catch(function() {});
  } else {
    // Fallback: åbn en side der lader brugeren vælge
    window.open('https://www.addtoany.com/share?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text), '_blank', 'width=600,height=400');
  }
}

window.searchAutocomplete = searchAutocomplete;
window.selectAutocomplete = selectAutocomplete;
window.handleSearchKey    = handleSearchKey;
window.toggleSold             = toggleSold;
window.confirmBuyerSelection  = confirmBuyerSelection;
window.openShareModal     = openShareModal;
window.closeShareModal    = closeShareModal;
window.copyShareLink      = copyShareLink;
window.shareViaSMS        = shareViaSMS;
window.openNativeShare     = openNativeShare;

/* ============================================================
   KORTVISNING MED LEAFLET
   ============================================================ */

var mapInstance        = null;
window._getMap = function() { return mapInstance; };
var mapMarkers         = [];
var currentView        = 'list';
var userLocationMarker = null;

// Split-kortvisning
var splitMapInstance   = null;
var splitClusterGroup  = null;
var splitMarkerMap     = {}; // bikeId → { marker, lat, lng }
var _splitListVisible  = true;
var _mapUserMarker     = null; // "Du er her"-markør

/* ── Geocoding cache ── */
var _geocodeCache = (function() {
  try {
    var stored = localStorage.getItem('_geocodeCache');
    return stored ? JSON.parse(stored) : {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache', JSON.stringify(_geocodeCache)); } catch (e) {}
}

// Slå præcis dansk adresse op via DAWA (Danmarks Adressers Web API)
function geocodeAddress(address, city) {
  var query = address.trim() + ', ' + city.trim();
  var key = 'dawa3:' + query.toLowerCase();
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  var datavaskUrl = 'https://api.dataforsyningen.dk/datavask/adresser?betegnelse='
    + encodeURIComponent(query);

  return fetch(datavaskUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.resultater || data.resultater.length === 0) return null;
      var id = data.resultater[0].adresse.id;
      return fetch('https://api.dataforsyningen.dk/adresser/' + id)
        .then(function(r) { return r.json(); })
        .then(function(adresse) {
          var koord = adresse.adgangsadresse.adgangspunkt.koordinater; // [lng, lat]
          var coords = [koord[1], koord[0]];
          _geocodeCache[key] = coords;
          _saveGeocodeCache();
          return coords;
        });
    })
    .catch(function() { return null; });
}

// Slå dansk by op via DAWA (Danmarks Adressers Web API) — ingen rate limit
function geocodeCity(city) {
  var key = city.toLowerCase().trim();
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  return fetch('https://api.dataforsyningen.dk/steder?q='
    + encodeURIComponent(city) + '&hovedtype=Bebyggelse&per_side=1&format=json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.length > 0 && data[0].visueltcenter) {
        var coords = [data[0].visueltcenter[1], data[0].visueltcenter[0]]; // [lat, lng]
        _geocodeCache[key] = coords;
        _saveGeocodeCache();
        return coords;
      }
      _geocodeCache[key] = null;
      return null;
    })
    .catch(function() { return null; });
}

function setView(view) {
  currentView = view;
  var listGrid   = document.getElementById('listings-grid');
  var mapDiv     = document.getElementById('listings-map');
  var btnList    = document.getElementById('btn-list-view');

  if (btnList) btnList.classList.remove('active');

  if (view === 'map') {
    if (listGrid) listGrid.style.display = 'none';
    if (mapDiv)   mapDiv.style.display   = 'block';
    initMap();
  } else {
    if (mapDiv)   mapDiv.style.display   = 'none';
    if (listGrid) listGrid.style.display = '';
    if (btnList)  btnList.classList.add('active');
  }
}

/* ─────────────────────────────────────────────────────────
   KORTVISNING (/kort)
   ───────────────────────────────────────────────────────── */

// State for /kort-siden
var _mapPageBikes         = [];   // Rå annoncer fra DB (op til MAP_PAGE_LIMIT)
var _mapPageGeocoded      = null; // Map<bikeId, { coords, precise }>
var _mapNearMeCoords      = null;
var _mapFilterDebounce    = null;
const MAP_PAGE_LIMIT      = 500;

async function renderMapPage() {
  showDetailView();
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Kortvisning – Cykelbørsen';
  updateSEOMeta('Find brugte cykler på kort. Se afstand til forhandlere og private sælgere i hele Danmark.', '/kort');

  // Nulstil kort-state (DOM genoprettes)
  splitMapInstance  = null;
  splitClusterGroup = null;
  splitMarkerMap    = {};
  _splitListVisible = window.innerWidth > 700;
  _mapPageBikes     = [];
  _mapPageGeocoded  = null;
  _mapNearMeCoords  = null;
  _mapUserMarker    = null;

  document.getElementById('detail-view').innerHTML = `
    <div class="map-page">
      <div class="map-page-header">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
        <h1 class="map-page-title">Kortvisning</h1>
        <p class="map-page-subtitle">Forhandlere har præcis placering · private er ca. by-center</p>
      </div>

      <!-- Filterpanel: row1 altid synlig, row2 kun synlig på desktop og mobil-udfoldet -->
      <div class="map-filters-bar" role="search">
        <div class="map-filters-row1">
          <input type="search" id="map-search" placeholder="Søg mærke, model..." class="map-filter-input map-filter-input--search" aria-label="Søg">
          <button class="map-near-btn" id="map-near-btn" onclick="toggleMapNearMe()" aria-pressed="false">📍 Nær mig</button>
          <button class="map-filter-expand-btn" id="map-filter-expand-btn" onclick="toggleMapFilterPanel()">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            Filtre
            <span class="map-filter-badge" id="map-filter-badge" style="display:none;">0</span>
          </button>
          <button class="map-reset-btn" onclick="resetMapFilters()" title="Nulstil filtre">✕ Nulstil</button>
        </div>
        <div class="map-filters-row2" id="map-filters-row2">
          <select id="map-seller-type" class="map-filter-sel" aria-label="Sælgertype">
            <option value="all">Alle sælgere</option>
            <option value="dealer">🏪 Forhandlere</option>
            <option value="private">👤 Private</option>
          </select>
          <select id="map-bike-type" class="map-filter-sel" aria-label="Cykeltype">
            <option value="">Alle typer</option>
            <option>Racercykel</option>
            <option>Mountainbike</option>
            <option>El-cykel</option>
            <option>Citybike</option>
            <option>Ladcykel</option>
            <option>Børnecykel</option>
            <option>Gravel</option>
          </select>
          <select id="map-condition" class="map-filter-sel" aria-label="Stand">
            <option value="">Alle stande</option>
            <option>Ny</option>
            <option>Som ny</option>
            <option>God stand</option>
            <option>Brugt</option>
          </select>
          <div class="map-filter-price">
            <input type="number" id="map-price-min" placeholder="Min kr." min="0" class="map-filter-input map-filter-input--sm" aria-label="Min pris">
            <span class="map-filter-sep">–</span>
            <input type="number" id="map-price-max" placeholder="Max kr." min="0" class="map-filter-input map-filter-input--sm" aria-label="Max pris">
          </div>
          <select id="map-radius" class="map-filter-sel" aria-label="Radius" disabled>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="25" selected>25 km</option>
            <option value="50">50 km</option>
            <option value="100">100 km</option>
            <option value="">Hele landet</option>
          </select>
        </div>
      </div>

      <div id="browse-split" class="map-page-split${_splitListVisible ? ' list-open' : ''}">
        <div id="split-list-panel"${!_splitListVisible ? ' class="collapsed"' : ''}>
          <div class="split-list-header">
            <span id="split-count" class="split-count-label">Henter annoncer…</span>
            <button class="split-list-close-btn" onclick="toggleSplitList()" aria-label="Luk liste">Luk ✕</button>
          </div>
          <div id="split-cards-container"></div>
        </div>
        <div id="split-map-panel">
          <button class="split-list-toggle-float" id="split-toggle-btn" onclick="toggleSplitList()">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="7 4 14 10 7 16"/></svg>
            Vis liste
          </button>
        </div>
      </div>
    </div>`;

  // Filter-events (debounced)
  const debounced = debounce(() => { applyMapFilters(); updateMapFilterBadge(); }, 220);
  ['map-search', 'map-price-min', 'map-price-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debounced);
  });
  ['map-seller-type', 'map-bike-type', 'map-condition', 'map-radius'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { applyMapFilters(); updateMapFilterBadge(); });
  });

  await loadMapPageBikes();
  await initSplitMap();
}

async function loadMapPageBikes() {
  const { data, error } = await supabase
    .from('bikes')
    .select('id, brand, model, price, type, condition, city, year, created_at, user_id, profiles(name, seller_type, shop_name, verified, address, avatar_url), bike_images(url, is_primary)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(MAP_PAGE_LIMIT);
  _mapPageBikes = (!error && data) ? data : [];
}

function getMapFilters() {
  return {
    q:         (document.getElementById('map-search')?.value || '').trim().toLowerCase(),
    seller:    document.getElementById('map-seller-type')?.value || 'all',
    type:      document.getElementById('map-bike-type')?.value || '',
    condition: document.getElementById('map-condition')?.value || '',
    priceMin:  parseInt(document.getElementById('map-price-min')?.value, 10) || null,
    priceMax:  parseInt(document.getElementById('map-price-max')?.value, 10) || null,
    radius:    _mapNearMeCoords ? (parseInt(document.getElementById('map-radius')?.value, 10) || null) : null,
    nearCoords: _mapNearMeCoords,
  };
}

function filterMapBikes() {
  const f = getMapFilters();
  return _mapPageBikes.filter(b => {
    if (f.q) {
      const hay = ((b.brand || '') + ' ' + (b.model || '') + ' ' + (b.type || '') + ' ' + (b.city || '')).toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    if (f.seller !== 'all') {
      const st = (b.profiles && b.profiles.seller_type) || 'private';
      if (f.seller !== st) return false;
    }
    if (f.type && b.type !== f.type) return false;
    if (f.condition && b.condition !== f.condition) return false;
    if (f.priceMin != null && b.price < f.priceMin) return false;
    if (f.priceMax != null && b.price > f.priceMax) return false;
    if (f.nearCoords && f.radius && _mapPageGeocoded) {
      const g = _mapPageGeocoded.get(b.id);
      if (!g) return false;
      const dist = haversineKm(f.nearCoords, g.coords);
      if (dist > f.radius) return false;
    }
    return true;
  });
}

function updateMapFilterBadge() {
  const f = getMapFilters();
  let n = 0;
  if (f.seller !== 'all') n++;
  if (f.type) n++;
  if (f.condition) n++;
  if (f.priceMin != null) n++;
  if (f.priceMax != null) n++;
  if (_mapNearMeCoords) n++;
  const badge = document.getElementById('map-filter-badge');
  if (!badge) return;
  if (n > 0) { badge.style.display = ''; badge.textContent = n; }
  else { badge.style.display = 'none'; }
}

function toggleMapFilterPanel() {
  const row2 = document.getElementById('map-filters-row2');
  const btn  = document.getElementById('map-filter-expand-btn');
  if (!row2) return;
  const isOpen = row2.classList.toggle('open');
  if (btn) btn.classList.toggle('active', isOpen);
}

function applyMapFilters() {
  if (!splitMapInstance) return;
  const filtered = filterMapBikes();
  const cardsContainer = document.getElementById('split-cards-container');
  const countEl        = document.getElementById('split-count');

  const countText = filtered.length + (filtered.length === 1 ? ' annonce' : ' annoncer');
  if (countEl) countEl.textContent = countText;
  // Hold floating toggle-knap synkroniseret med aktuel tæller
  if (!_splitListVisible) {
    const btn = document.getElementById('split-toggle-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="7 4 14 10 7 16"/></svg> ' + countText;
  }

  if (filtered.length === 0) {
    cardsContainer.innerHTML = '<p style="padding:24px 16px;color:var(--muted);font-size:0.88rem;">Ingen annoncer matcher filtrene.</p>';
  } else {
    const f = getMapFilters();
    let list = filtered;
    if (f.nearCoords && _mapPageGeocoded) {
      list = [...filtered].sort((a, b) => {
        const ga = _mapPageGeocoded.get(a.id), gb = _mapPageGeocoded.get(b.id);
        if (!ga) return 1;
        if (!gb) return -1;
        return haversineKm(f.nearCoords, ga.coords) - haversineKm(f.nearCoords, gb.coords);
      });
    }
    renderSplitCards(list, cardsContainer);
  }

  // Vis kun filtrerede markører
  const visibleIds = new Set(filtered.map(b => b.id));
  splitClusterGroup.clearLayers();
  Object.keys(splitMarkerMap).forEach(id => {
    if (visibleIds.has(id)) splitClusterGroup.addLayer(splitMarkerMap[id].marker);
  });

  if (visibleIds.size > 0) {
    try { splitMapInstance.fitBounds(splitClusterGroup.getBounds().pad(0.1)); } catch (e) {}
  }
}

function resetMapFilters() {
  ['map-search', 'map-price-min', 'map-price-max'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const st = document.getElementById('map-seller-type'); if (st) st.value = 'all';
  const bt = document.getElementById('map-bike-type');   if (bt) bt.value = '';
  const co = document.getElementById('map-condition');   if (co) co.value = '';
  const rd = document.getElementById('map-radius');      if (rd) { rd.value = '25'; rd.disabled = true; }
  _mapNearMeCoords = null;
  if (_mapUserMarker && splitMapInstance) { splitMapInstance.removeLayer(_mapUserMarker); _mapUserMarker = null; }
  const nb = document.getElementById('map-near-btn');
  if (nb) { nb.classList.remove('active'); nb.setAttribute('aria-pressed', 'false'); nb.textContent = '📍 Nær mig'; }
  // Luk filterpanel på mobil
  const row2 = document.getElementById('map-filters-row2');
  if (row2) row2.classList.remove('open');
  const expBtn = document.getElementById('map-filter-expand-btn');
  if (expBtn) expBtn.classList.remove('active');
  applyMapFilters();
  updateMapFilterBadge();
}

async function toggleMapNearMe() {
  const btn = document.getElementById('map-near-btn');
  const radiusSel = document.getElementById('map-radius');
  if (_mapNearMeCoords) {
    _mapNearMeCoords = null;
    if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); btn.textContent = '📍 Nær mig'; }
    if (radiusSel) radiusSel.disabled = true;
    if (_mapUserMarker && splitMapInstance) { splitMapInstance.removeLayer(_mapUserMarker); _mapUserMarker = null; }
    applyMapFilters(); updateMapFilterBadge();
    return;
  }
  if (!navigator.geolocation) {
    showToast('Din browser understøtter ikke GPS'); return;
  }
  if (btn) btn.textContent = '📍 Henter...';
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true }));
    _mapNearMeCoords = [pos.coords.latitude, pos.coords.longitude];
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); btn.textContent = '📍 Min position'; }
    if (radiusSel) radiusSel.disabled = false;
    if (splitMapInstance) {
      // Fjern evt. gammel markør
      if (_mapUserMarker) splitMapInstance.removeLayer(_mapUserMarker);
      const userIcon = L.divIcon({
        html: '<div class="map-user-dot"><div class="map-user-pulse"></div></div>',
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      _mapUserMarker = L.marker(_mapNearMeCoords, { icon: userIcon, zIndexOffset: 1000 })
        .bindPopup('<div style="font-family:\'DM Sans\',sans-serif;font-size:0.82rem;padding:4px 2px;">📍 <strong>Du er her</strong></div>', { closeButton: false })
        .addTo(splitMapInstance);
      splitMapInstance.setView(_mapNearMeCoords, 11);
    }
    applyMapFilters(); updateMapFilterBadge();
  } catch (e) {
    if (btn) btn.textContent = '📍 Nær mig';
    showToast('Kunne ikke hente din position');
  }
}

async function initSplitMap() {
  const cardsContainer = document.getElementById('split-cards-container');
  const mapPanel       = document.getElementById('split-map-panel');
  if (!cardsContainer || !mapPanel) return;

  const bikes = _mapPageBikes;

  if (!bikes || bikes.length === 0) {
    cardsContainer.innerHTML = '<p style="padding:24px 16px;color:var(--muted);">Ingen annoncer fundet.</p>';
    const countEl = document.getElementById('split-count');
    if (countEl) countEl.textContent = '0 annoncer';
    return;
  }

  // Init Leaflet-kort på den nye DOM-node
  splitMapInstance = L.map('split-map-panel', { zoomControl: true }).setView([56.0, 10.2], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(splitMapInstance);

  splitClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    iconCreateFunction: function(cluster) {
      return L.divIcon({
        html: '<div class="split-cluster">' + cluster.getChildCount() + '</div>',
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    },
  });
  splitMapInstance.addLayer(splitClusterGroup);
  splitMarkerMap = {};
  _mapPageGeocoded = new Map();

  splitMapInstance.on('popupopen', function(e) {
    const closeBtn = e.popup.getElement()?.querySelector('.split-popup-close');
    if (closeBtn) closeBtn.addEventListener('click', () => splitMapInstance.closePopup(e.popup));
  });

  // Initial render før geocoding (brugeren får noget at kigge på med det samme)
  renderSplitCards(bikes, cardsContainer);
  const countEl = document.getElementById('split-count');
  if (countEl) countEl.textContent = bikes.length + ' annoncer';

  // Geokod i batches for at undgå at oversvømme DAWA-API'et
  const GEO_BATCH = 10;
  const toGeocode = bikes.filter(b => b.city);
  for (let i = 0; i < toGeocode.length; i += GEO_BATCH) {
    const batch = toGeocode.slice(i, i + GEO_BATCH);
    await Promise.all(batch.map(async b => {
      const profile  = b.profiles || {};
      const isDealer = profile.seller_type === 'dealer';
      const hasAddr  = isDealer && profile.address && profile.address.trim();

      let coords = null;
      let precise = false;
      if (hasAddr) {
        coords = await geocodeAddress(profile.address, b.city);
        if (coords) precise = true;
      }
      if (!coords) coords = await geocodeCity(b.city);
      if (!coords) return;

      const jitter = precise ? 0.0001 : 0.003;
      const lat = coords[0] + stableOffset(b.id, 0) * jitter;
      const lng = coords[1] + stableOffset(b.id, 1) * jitter;

      _mapPageGeocoded.set(b.id, { coords: [lat, lng], precise });

      const icon = L.divIcon({
        html: '<div class="split-marker ' + (isDealer ? 'split-marker--dealer' : 'split-marker--private') + '">'
          + (isDealer ? '🏪' : '🚲') + '</div>',
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const primaryImg = (b.bike_images || []).find(i => i.is_primary)?.url || (b.bike_images || [])[0]?.url || null;
      const sellerName = isDealer ? profile.shop_name : profile.name;
      const sellerLabel = isDealer ? 'Forhandler' : 'Privatperson';
      const imgCount = (b.bike_images || []).length || 0;
      const imgCounter = imgCount > 0
        ? '<span class="split-popup-img-counter"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>1/' + imgCount + '</span>'
        : '';

      const dealerBadge = isDealer
        ? '<span class="split-popup-badge split-popup-badge--dealer">Forhandler</span>'
        : '<span class="split-popup-badge split-popup-badge--private">Privat</span>';

      const postalMatch = (profile.address || '').match(/\b(\d{4})\b/);
      const postalCode = postalMatch ? postalMatch[1] : '';
      const approxSuffix = precise ? '' : ' <span class="split-popup-approx">(ca.)</span>';

      const popupHtml = '<div class="split-popup">'
        + '<div class="split-popup-media">'
        + (primaryImg
            ? '<img src="' + primaryImg + '" alt="" class="split-popup-img">'
            : '<div class="split-popup-img-placeholder">🚲</div>')
        + '<button class="split-popup-close" aria-label="Luk">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        + '</button>'
        + imgCounter
        + '</div>'
        + '<div class="split-popup-body">'
        + '<div class="split-popup-top">'
        + '<span class="split-popup-price">' + b.price.toLocaleString('da-DK') + ' kr.</span>'
        + dealerBadge
        + '</div>'
        + '<div class="split-popup-title">' + esc(b.brand) + ' ' + esc(b.model) + '</div>'
        + '<div class="split-popup-meta">' + esc(b.type || '') + (b.condition ? ' · ' + esc(b.condition) : '') + (b.year ? ' · ' + b.year : '') + '</div>'
        + '<div class="split-popup-divider"></div>'
        + '<div class="split-popup-info">'
        + '<div class="split-popup-info-col">'
        + '<div class="split-popup-info-icon">' + (isDealer ? '🏪' : '👤') + '</div>'
        + '<div class="split-popup-info-text">'
        + '<div class="split-popup-info-main">' + esc(sellerName || 'Ukendt') + '</div>'
        + '<div class="split-popup-info-sub">' + sellerLabel + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="split-popup-info-col">'
        + '<div class="split-popup-info-icon">📍</div>'
        + '<div class="split-popup-info-text">'
        + '<div class="split-popup-info-main">' + esc(b.city) + approxSuffix + '</div>'
        + (postalCode ? '<div class="split-popup-info-sub">' + postalCode + '</div>' : '<div class="split-popup-info-sub">Danmark</div>')
        + '</div>'
        + '</div>'
        + '</div>'
        + '<button class="split-popup-btn" onclick="navigateToBike(\'' + b.id + '\')">Se annonce →</button>'
        + '</div>'
        + '</div>';

      const marker = L.marker([lat, lng], { icon });
      marker.bindPopup(popupHtml, { maxWidth: 300, minWidth: 280, closeButton: false });
      marker.on('click', function() {
        marker.openPopup();
        splitHighlightCard(b.id);
      });

      splitMarkerMap[b.id] = { marker, lat, lng };
      splitClusterGroup.addLayer(marker);
    }));
  }

  // Zoom til alle markører
  if (Object.keys(splitMarkerMap).length > 0) {
    try { splitMapInstance.fitBounds(splitClusterGroup.getBounds().pad(0.08)); } catch(e) {}
  }

  setTimeout(() => splitMapInstance && splitMapInstance.invalidateSize(), 150);
  applyMapFilters();
}

function renderSplitCards(bikes, container) {
  container.innerHTML = bikes.map(b => {
    const profile    = b.profiles || {};
    const isDealer   = profile.seller_type === 'dealer';
    const sellerName = isDealer ? profile.shop_name : profile.name;
    const primaryImg = (b.bike_images || []).find(i => i.is_primary)?.url || (b.bike_images || [])[0]?.url || null;
    const timeAgo    = formatLastSeen ? formatLastSeen(b.created_at) : '';
    const badge      = isDealer
      ? '<span style="background:var(--forest);color:#fff;border-radius:4px;padding:1px 5px;font-size:0.65rem;font-weight:600;">Forhandler</span>'
      : '<span style="background:var(--sand);color:var(--muted);border-radius:4px;padding:1px 5px;font-size:0.65rem;">Privat</span>';
    return '<div class="split-card" data-bike-id="' + b.id + '" onclick="splitCardClick(\'' + b.id + '\')">'
      + '<div class="split-card-img">'
      + (primaryImg ? '<img src="' + primaryImg + '" alt="" loading="lazy">' : '<div class="split-card-img-placeholder">🚲</div>')
      + '</div>'
      + '<div class="split-card-body">'
      + '<div class="split-card-price">' + b.price.toLocaleString('da-DK') + ' kr.</div>'
      + '<div class="split-card-title">' + esc(b.brand) + ' ' + esc(b.model) + '</div>'
      + '<div class="split-card-meta">' + esc(b.type || '') + (b.year ? ' · ' + b.year : '') + '</div>'
      + '<div class="split-card-footer">'
      + '<span class="split-card-location">📍 ' + esc(b.city || '–') + '</span>'
      + badge
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function splitCardClick(bikeId) {
  const m = splitMarkerMap[bikeId];
  // Highlight kort i liste
  splitHighlightCard(bikeId);
  if (!m) return;
  // Åbn markørens cluster og fly til den
  splitClusterGroup.zoomToShowLayer(m.marker, function() {
    m.marker.openPopup();
  });
}

function splitHighlightCard(bikeId) {
  document.querySelectorAll('.split-card.highlighted').forEach(c => c.classList.remove('highlighted'));
  // Fjern highlight fra pins
  document.querySelectorAll('.split-marker.highlighted-pin').forEach(el => el.classList.remove('highlighted-pin'));

  const card = document.querySelector('.split-card[data-bike-id="' + bikeId + '"]');
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Highlight pin
  const m = splitMarkerMap[bikeId];
  if (m) {
    const el = m.marker.getElement();
    if (el) {
      const pin = el.querySelector('.split-marker');
      if (pin) pin.classList.add('highlighted-pin');
    }
  }
}

function toggleSplitList() {
  const panel     = document.getElementById('split-list-panel');
  const btn       = document.getElementById('split-toggle-btn');
  const splitWrap = document.getElementById('browse-split');
  const countEl   = document.getElementById('split-count');
  if (!panel) return;
  _splitListVisible = !_splitListVisible;
  panel.classList.toggle('collapsed', !_splitListVisible);
  if (splitWrap) splitWrap.classList.toggle('list-open', _splitListVisible);
  if (btn) {
    if (_splitListVisible) {
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="13 4 6 10 13 16"/></svg> Skjul liste';
    } else {
      const count = countEl ? countEl.textContent : 'liste';
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="7 4 14 10 7 16"/></svg> ' + count;
    }
  }
  setTimeout(() => splitMapInstance && splitMapInstance.invalidateSize(), 280);
}

async function initMap() {
  // Initialiser kort første gang
  if (!mapInstance) {
    mapInstance = L.map('listings-map', { zoomControl: true }).setView([56.0, 10.0], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(mapInstance);

    // Tilføj "Find mig" knap
    var locateBtn = document.createElement('button');
    locateBtn.className   = 'locate-btn';
    locateBtn.textContent = '📍 Find mig';
    locateBtn.onclick     = locateUser;
    document.getElementById('listings-map').appendChild(locateBtn);
  }

  // Ryd gamle markører
  mapMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
  mapMarkers = [];

  // Hent annoncer med by
  var result = await supabase
    .from('bikes')
    .select('*, profiles(name, seller_type, shop_name, verified, address)')
    .eq('is_active', true);

  if (!result.data || result.data.length === 0) return;

  // Spor forhandler-IDs der allerede har en markør fra deres annoncer
  var dealersWithMarkers = new Set();

  // Funktion til at tilføje en markør på kortet
  function addBikeMarker(b, coords, isPrecise) {
    // Forhandlere med præcis adresse: ingen offset
    // Private sælgere: lille offset så markører på samme by ikke stacker
    var jitter = isPrecise ? 0.0002 : 0.002;
    var lat = coords[0] + stableOffset(b.id, 0) * jitter;
    var lng = coords[1] + stableOffset(b.id, 1) * jitter;

    var profile    = b.profiles || {};
    var sellerType = profile.seller_type || 'private';
    var sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    var isVerified = profile.verified;
    var isDealer   = sellerType === 'dealer';

    if (isDealer) dealersWithMarkers.add(b.user_id);

    var color = isDealer ? '#2A3D2E' : '#C8502A';
    var icon = L.divIcon({
      html: '<div style="background:' + color + ';color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">'
          + (isDealer ? '🏪' : '🚲') + '</div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    var marker = L.marker([lat, lng], { icon: icon }).addTo(mapInstance);

    var popupHtml = '<div class="map-popup">'
      + '<div class="map-popup-title">' + b.brand + ' ' + b.model
      + (isVerified ? ' <span style="background:#2A7D4F;color:white;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:0.55rem;margin-left:4px;">✓</span>' : '')
      + '</div>'
      + '<div class="map-popup-price">' + b.price.toLocaleString('da-DK') + ' kr.</div>'
      + '<div class="map-popup-meta">' + b.type + ' · ' + b.condition + ' · ' + (sellerName || 'Ukendt')
      + ' <span style="background:' + (isDealer ? '#E8F0E8' : '#FBF0E8') + ';color:' + (isDealer ? '#2A3D2E' : '#8A4A20') + ';padding:2px 7px;border-radius:100px;font-size:.7rem;">'
      + (isDealer ? '🏪 Forhandler' : '👤 Privat') + '</span></div>'
      + '<button class="map-popup-btn" onclick="openFromMap(&quot;' + b.id + '&quot;)">Se annonce →</button>'
      + '</div>';

    marker.bindPopup(popupHtml, { maxWidth: 280, closeButton: false });
    marker.on('click', function() { marker.openPopup(); });
    mapMarkers.push(marker);
  }

  // Geokod og tilføj markører
  // Forhandlere: brug butiks-adresse fra profil (præcis geocoding via DAWA)
  // Private sælgere: vis på by-centrum (ingen privatadresse)
  var geocodePromises = result.data
    .filter(function(b) { return !!b.city; })
    .map(function(b) {
      var profile = b.profiles || {};
      var isDealer = profile.seller_type === 'dealer';
      var dealerAddress = isDealer && profile.address && profile.address.trim();

      var lookup = dealerAddress
        ? geocodeAddress(profile.address, b.city).then(function(coords) {
            return coords || geocodeCity(b.city); // Fallback til by hvis adresse fejler
          })
        : geocodeCity(b.city);

      return lookup.then(function(coords) {
        if (coords) addBikeMarker(b, coords, isDealer && !!dealerAddress);
      });
    });

  await Promise.all(geocodePromises);

  // Tilføj markører for verificerede forhandlere med adresse der IKKE allerede har en annonce-markør
  var dealerProfileResult = await supabase
    .from('profiles')
    .select('id, shop_name, name, city, address')
    .eq('seller_type', 'dealer')
    .eq('verified', true)
    .not('address', 'is', null)
    .not('address', 'eq', '');

  if (dealerProfileResult.data) {
    var dealerOnlyPromises = dealerProfileResult.data
      .filter(function(d) { return !dealersWithMarkers.has(d.id) && d.address && d.city; })
      .map(function(d) {
        return geocodeAddress(d.address, d.city)
          .then(function(coords) { return coords || geocodeCity(d.city); })
          .then(function(coords) {
            if (!coords) return;
            var displayName = d.shop_name || d.name || 'Forhandler';
            var lat = coords[0] + stableOffset(d.id, 0) * 0.0002;
            var lng = coords[1] + stableOffset(d.id, 1) * 0.0002;
            var icon = L.divIcon({
              html: '<div style="background:#2A3D2E;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏪</div>',
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });
            var marker = L.marker([lat, lng], { icon: icon }).addTo(mapInstance);
            var popupHtml = '<div class="map-popup">'
              + '<div class="map-popup-title">' + esc(displayName)
              + ' <span style="background:#2A7D4F;color:white;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:0.55rem;margin-left:4px;">✓</span></div>'
              + '<div class="map-popup-meta" style="color:#8A8578;">Ingen aktive annoncer</div>'
              + '<button class="map-popup-btn" onclick="navigateToDealer(\'' + d.id + '\')">Se forhandler →</button>'
              + '</div>';
            marker.bindPopup(popupHtml, { maxWidth: 280, closeButton: false });
            marker.on('click', function() { marker.openPopup(); });
            mapMarkers.push(marker);
          });
      });
    await Promise.all(dealerOnlyPromises);
  }

  // Zoom til markørerne hvis der er nogen
  if (mapMarkers.length > 0) {
    var group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.1));
  }

  // Tilføj legende
  if (!document.getElementById('map-legend')) {
    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function() {
      var div = L.DomUtil.create('div');
      div.id  = 'map-legend';
      div.style.cssText = 'background:white;padding:10px 14px;border-radius:8px;font-family:DM Sans,sans-serif;font-size:.78rem;box-shadow:0 2px 8px rgba(0,0,0,.1);';
      div.innerHTML = '<div style="margin-bottom:6px;font-weight:600;">Forklaring</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div style="background:#C8502A;border-radius:50%;width:16px;height:16px;border:2px solid white;"></div> Privat sælger</div>'
        + '<div style="display:flex;align-items:center;gap:8px;"><div style="background:#2A3D2E;border-radius:50%;width:16px;height:16px;border:2px solid white;"></div> Forhandler</div>';
      return div;
    };
    legend.addTo(mapInstance);
  }

  // Trigger resize så kortet fylder korrekt
  setTimeout(function() { mapInstance.invalidateSize(); }, 100);
}

function locateUser() {
  if (!navigator.geolocation) { showToast('⚠️ Din browser understøtter ikke lokation'); return; }

  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;

    if (userLocationMarker) mapInstance.removeLayer(userLocationMarker);

    var userIcon = L.divIcon({
      html: '<div style="background:#1877F2;border-radius:50%;width:16px;height:16px;border:3px solid white;box-shadow:0 0 0 3px rgba(24,119,242,0.3);"></div>',
      className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    });

    userLocationMarker = L.marker([lat, lng], { icon: userIcon })
      .addTo(mapInstance)
      .bindPopup('<div style="padding:8px;font-family:DM Sans,sans-serif;font-size:.85rem;font-weight:600;">📍 Din placering</div>')
      .openPopup();

    mapInstance.setView([lat, lng], 12);
    showToast('📍 Viser cykler nær dig');
  }, function() {
    showToast('⚠️ Kunne ikke hente din lokation');
  });
}

function openFromMap(bikeId) {
  navigateTo(`/bike/${bikeId}`);
}
window.openFromMap = openFromMap;

function _openFromMap(bikeId) {
  // Luk kortpopup
  if (mapInstance) mapInstance.closePopup();
  // Skift til listevisning bag ved
  // Åbn bike modal direkte uden at skifte visning
  setTimeout(function() { openBikeModal(bikeId); }, 100);
}
window._openFromMap = _openFromMap;

window.setView    = setView;
window.locateUser = locateUser;

/* ============================================================
   VERIFICERING – E-MAIL
   ============================================================ */

function updateVerifyUI() {
  const u = currentUser;
  const p = currentProfile || {};

  // Skjul for forhandlere
  const verifyBox = document.getElementById('verify-box');
  if (verifyBox) verifyBox.style.display = p.seller_type === 'dealer' ? 'none' : 'block';

  // E-mail status
  const emailValue  = document.getElementById('verify-email-value');
  const emailStatus = document.getElementById('verify-email-status');
  if (emailValue && u?.email) emailValue.textContent = u.email;
  if (emailStatus) {
    if (u?.email_confirmed_at) {
      emailStatus.textContent = 'Verificeret';
      emailStatus.className   = 'verify-row-status verify-status-ok';
    } else {
      emailStatus.innerHTML   = '<button class="verify-action-btn" onclick="resendConfirmationEmail()">Bekræft</button>';
      emailStatus.className   = 'verify-row-status';
    }
  }
}

/* ── ADMIN: ID ANSØGNINGER ── */

async function loadIdApplications() {
  var list = document.getElementById('admin-id-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .eq('id_pending', true)
      .eq('id_verified', false);
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente ID-ansøgninger.', 'loadIdApplications');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ID-ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<img class="admin-id-img" src="' + (p.id_doc_url || '') + '" onclick="window.open(\'' + (p.id_doc_url || '') + '\',\'_blank\')" title="Klik for at se fuldt billede">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.name || 'Ukendt') + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (p.seller_type === 'dealer' ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveId(\'' + p.id + '\')">✓ Godkend ID</button>'
      + '<button class="btn-reject" onclick="rejectId(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function approveId(userId) {
  var err = (await supabase.from('profiles').update({
    id_verified: true,
    id_pending:  false,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('✅ ID godkendt — bruger har nu et blåt badge');
  loadIdApplications();
  supabase.functions.invoke('notify-message', {
    body: { type: 'id_approved', user_id: userId },
  }).catch(() => {});
  // Hvis den godkendte bruger er den indloggede, opdater cache
  if (currentUser && currentUser.id === userId) {
    currentProfile = { ...currentProfile, id_verified: true, id_pending: false };
    updateVerifyUI();
    loadBikes();
  }
}

async function rejectId(userId) {
  if (!confirm('Afvis denne ID-ansøgning?')) return;
  var err = (await supabase.from('profiles').update({
    id_pending:  false,
    id_doc_url:  null,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('ID-ansøgning afvist');
  loadIdApplications();
  supabase.functions.invoke('notify-message', {
    body: { type: 'id_rejected', user_id: userId },
  }).catch(() => {});
}

window.updateVerifyUI       = updateVerifyUI;
window.approveId          = approveId;
window.rejectId           = rejectId;
window.openUserProfile       = openUserProfile;
window.closeUserProfileModal = closeUserProfileModal;
window.pickStar              = pickStar;
window.submitReview          = submitReview;
window.openRateModal         = openRateModal;
window.closeRateModal        = closeRateModal;
window.submitRatingFromModal = submitRatingFromModal;
window.toggleProfileContact  = toggleProfileContact;
window.sendProfileMessage    = sendProfileMessage;
window.toggleRestDealers     = toggleRestDealers;
window.closeAllDealersModal  = closeAllDealersModal;
window.closeDealerProfileModal = closeDealerProfileModal;
window.openAllDealersModal   = openAllDealersModal;
window.openDealerProfile     = openDealerProfile;
window.filterByDealerCard    = filterByDealerCard;

/* ============================================================
   AI SUPPORT CHAT WIDGET
   ============================================================ */

const CHAT_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat-support`;

let chatHistory = [];   // { role: 'user'|'assistant', content: string }[]
let chatOpen    = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const win  = document.getElementById('chat-window');
  const iconOpen  = document.getElementById('chat-icon-open');
  const iconClose = document.getElementById('chat-icon-close');
  win.classList.toggle('open', chatOpen);
  iconOpen.style.display  = chatOpen ? 'none'  : '';
  iconClose.style.display = chatOpen ? ''      : 'none';
  if (chatOpen) {
    setTimeout(() => document.getElementById('chat-input')?.focus(), 250);
  }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function appendChatMsg(role, text) {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg--${role === 'user' ? 'user' : 'bot'}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg--bot chat-typing';
  wrap.id = 'chat-typing-indicator';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = 'Skriver…';
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById('chat-typing-indicator')?.remove();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '';
  appendChatMsg('user', text);

  chatHistory.push({ role: 'user', content: text });

  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(CHAT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });

    const data = await res.json();

    removeTyping();

    if (!res.ok || data.error) {
      appendChatMsg('bot', 'Beklager, noget gik galt. Prøv igen om lidt.');
      chatHistory.pop(); // fjern det fejlede brugerspørgsmål fra historik
    } else {
      appendChatMsg('bot', data.reply);
      chatHistory.push({ role: 'assistant', content: data.reply });
    }
  } catch {
    removeTyping();
    appendChatMsg('bot', 'Ingen forbindelse – tjek din internet-forbindelse og prøv igen.');
    chatHistory.pop();
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

window.toggleChat      = toggleChat;
window.sendChatMessage = sendChatMessage;
window.handleChatKey   = handleChatKey;
