/* ============================================================
   MIN PROFIL SIDE (#/me)
   ============================================================ */

export function createMyProfilePage({
  supabase,
  esc,
  safeAvatarUrl,
  getInitials,
  renderProfileSkeleton,
  showDetailView,
  showListingView,
  openLoginModal,
  openProfileModal,
  openEditModal,
  loadMyListings,
  loadSavedListings,
  loadSavedSearches,
  loadTradeHistory,
  checkUnreadMessages,
  navigateTo,
  getCurrentUser,
  getCurrentProfile,
  setCurrentProfile,
}) {
  function navigateToMyProfile() {
    navigateTo('/me');
  }

  async function renderMyProfilePage() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser || !currentProfile) {
      showListingView();
      openLoginModal();
      return;
    }

    showDetailView();
    document.body.classList.toggle('is-mp-mobile', window.innerWidth <= 768);
    const detailView = document.getElementById('detail-view');
    detailView.innerHTML = renderProfileSkeleton();

    // Session-cachen (PROFILE_SESSION_FIELDS) er slank og mangler bio, phone,
    // created_at, åbningstider, services, sociale links mm. som komplethedskortet
    // bruger. Hent den fulde profil og opdatér cachen FØR vi bygger siden, så
    // checklisten ikke fejlagtigt viser udfyldte felter som "ikke udfyldt" efter
    // et page-reload (kun den cachede, slanke profil var i hukommelsen).
    if (typeof setCurrentProfile === 'function') {
      try {
        const { data: full } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (full) setCurrentProfile({ ...(getCurrentProfile() || {}), ...full });
      } catch { /* behold cache-render ved fejl */ }
    }

    document.title = `Min konto | Cykelbørsen`;
    detailView.innerHTML = buildMyProfilePageHTML();
    loadMyListings('mp-listings-grid');
    loadProfileStats();
    checkUnreadMessages();
  }

  function buildMyProfilePageHTML() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    const p           = currentProfile;
    const u           = currentUser;
    const isDealer    = p.seller_type === 'dealer';
    const displayName = isDealer ? (p.shop_name || p.name) : (p.name || 'Min profil');
    const initials    = getInitials(displayName);
    const memberSince = p.created_at
      ? new Date(p.created_at).toLocaleDateString('da-DK', { year: 'numeric', month: 'long' })
      : null;

    const avatarUrl = safeAvatarUrl(p.avatar_url);
    const avatarContent = avatarUrl
      ? `<img src="${avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : initials;

    // Completion-checklisten. For forhandlere udvides med 4 ekstra items
    // hvor opt-out ('vi tilbyder ikke dette') tæller som 'done' — så
    // butikker uden fx finansiering kan stadig nå 100% ved aktivt at
    // markere det.
    const hasOpeningHours = p.opening_hours && Object.values(p.opening_hours).some(
      d => d && !d.closed && d.open && d.close
    );
    const hasOffers       = !!p.offers_financing || !!p.offers_tradein;
    const hasServices     = Array.isArray(p.services) && p.services.length > 0;
    const hasSocialLinks  = !!p.website || !!p.facebook || !!p.instagram;

    const completionItems = [
      { label: 'E-mail verificeret', done: !!u?.email_confirmed_at, action: 'email' },
      { label: 'Profilbillede',      done: !!p.avatar_url,          action: 'avatar' },
      { label: 'By tilføjet',        done: !!p.city,                action: 'city' },
      { label: 'Om mig udfyldt',     done: !!p.bio,                 action: 'bio' },
      ...(isDealer ? [
        { label: 'Telefon tilføjet',  done: !!p.phone,                                action: 'phone' },
        { label: 'Åbningstider',      done: hasOpeningHours || !!p.hours_optout,      action: 'hours' },
        { label: 'Tilbud markeret',   done: hasOffers       || !!p.offers_optout,     action: 'offers' },
        { label: 'Services valgt',    done: hasServices     || !!p.services_optout,   action: 'services' },
        { label: 'Online tilstedeværelse', done: hasSocialLinks || !!p.social_optout, action: 'social' },
      ] : []),
    ];
    const doneCount = completionItems.filter(i => i.done).length;
    const pct       = Math.round((doneCount / completionItems.length) * 100);
    const hasSidebarContent = pct < 100 || (isDealer && !p.verified);

    const svgBike    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M6 17l4-8h6l2 8m-8-8h-2m4 0l-2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const svgEye     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S6 4.5 12 4.5 22.5 12 22.5 12 18 19.5 12 19.5 1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;
    const svgHeart   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 20.8s-7.5-4.6-7.5-11A4.5 4.5 0 0112 6a4.5 4.5 0 017.5 3.8c0 6.4-7.5 11-7.5 11z" stroke="currentColor" stroke-width="1.8"/></svg>`;
    const svgShake   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 13l5-5 3 3-5 5-3-3zM9 11l4-4 3 3-4 4-3-3zM13 7l3-3 4 4-3 3M5 16l3 3M13 17l2 2 2-1 1-2-3-3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const svgPlus    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    const svgEdit    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 4l6 6-11 11H3v-6L14 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    const svgLogout  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const svgBack    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

    return `
    <div class="mp-wrap">
     <div class="mp-inner${hasSidebarContent ? '' : ' mp-no-sidebar'}">
      <div class="mp-top">
        <button class="mp-back-btn" onclick="navigateTo('/')">${svgBack} Forside</button>
        <h1 class="mp-title">Min konto</h1>
        <p class="mp-subtitle">Administrér dine annoncer, cykelagenter og kontooplysninger</p>
      </div>

      <div class="mp-layout${hasSidebarContent ? '' : ' mp-no-sidebar'}">
        <!-- Hoved-kolonne -->
        <div class="mp-main">

          <!-- Profil-kort -->
          <div class="mp-account-card">
            <div class="mp-avatar-decor"></div>
            <div class="mp-identity">
              <div class="mp-avatar">${avatarContent}</div>
              <div class="mp-info">
                <div class="mp-name-row">
                  <h2 class="mp-name">${esc(displayName)}</h2>
                  ${p.verified ? `<span class="mp-verified-icon" style="color:var(--forest)" title="Verificeret"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}
                </div>
                <div class="mp-meta">
                  <span class="mp-type-pill">
                    ${isDealer ? svgBike : ''} ${isDealer ? 'Forhandler' : 'Privat sælger'}
                  </span>
                </div>
                <div class="mp-contact-row">
                  <div class="mp-contact-top">
                    ${p.city ? `<span class="mp-contact-item" style="color:var(--rust)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg> ${esc(p.city)}</span>` : ''}
                    ${memberSince ? `<span class="mp-member-since">Medlem siden ${memberSince}</span>` : ''}
                  </div>
                  ${u?.email ? `<span class="mp-contact-item mp-contact-email-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 7l9 7 9-7" stroke="currentColor" stroke-width="1.6"/></svg> <span class="mp-email-text">${esc(u.email)}</span></span>` : ''}
                </div>
              </div>
            </div>
            <div class="mp-header-actions">
              <button class="mp-action-primary" onclick="navigateTo('/sell')">${svgPlus} <span>Opret annonce</span></button>
              <div class="mp-action-secondary-row">
                <button class="mp-action-secondary" onclick="openProfileModal()" aria-label="Redigér profil">${svgEdit} <span class="mp-action-label">Redigér</span></button>
                <button class="mp-action-secondary mp-action-logout" onclick="logout()" aria-label="Log ud">${svgLogout} <span class="mp-action-label">Log ud</span></button>
              </div>
            </div>
          </div>

          <!-- Stats-grid -->
          <div class="mp-stats-grid">
            <div class="mp-stat-card" onclick="switchMyProfileTab('listings')" title="Mine annoncer">
              <div class="mp-stat-icon" style="color:var(--forest)">${svgBike}</div>
              <div class="mp-stat-num" id="mp-stat-active">–</div>
              <div class="mp-stat-label">Aktive annoncer</div>
              <div class="mp-stat-delta" style="color:var(--forest)" id="mp-stat-active-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" title="Visninger">
              <div class="mp-stat-icon" style="color:var(--rust)">${svgEye}</div>
              <div class="mp-stat-num" id="mp-stat-views">–</div>
              <div class="mp-stat-label">Visninger i alt</div>
              <div class="mp-stat-delta" style="color:var(--rust)" id="mp-stat-views-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" onclick="switchMyProfileTab('saved')" title="Gemte annoncer">
              <div class="mp-stat-icon" style="color:var(--forest)">${svgHeart}</div>
              <div class="mp-stat-num" id="mp-stat-saved">–</div>
              <div class="mp-stat-label">Gemte cykler</div>
              <div class="mp-stat-delta" style="color:var(--forest)" id="mp-stat-saved-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" onclick="switchMyProfileTab('trades')" title="Handler">
              <div class="mp-stat-icon" style="color:var(--forest-light)">${svgShake}</div>
              <div class="mp-stat-num" id="mp-stat-trades">–</div>
              <div class="mp-stat-label">Handler afsluttet</div>
              <div class="mp-stat-delta" style="color:var(--forest-light)" id="mp-stat-trades-delta">Henter…</div>
            </div>
          </div>

          <!-- Forhandler leads-banner (vises kun for dealers) -->
          ${isDealer ? `
          <div class="mp-dealer-banner" id="mp-dealer-banner">
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-leads">–</div>
              <div class="mp-dealer-banner-label">Nye leads (7 dage)</div>
            </div>
            <div class="mp-dealer-banner-divider"></div>
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-topviews">–</div>
              <div class="mp-dealer-banner-label">Visninger på topcykel</div>
            </div>
            <div class="mp-dealer-banner-divider"></div>
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-respond">–</div>
              <div class="mp-dealer-banner-label">Ubesvarede tråde</div>
            </div>
          </div>` : ''}

          <!-- Insight-banner (vises kun når vi har data) -->
          <div class="mp-insight" id="mp-insight" style="display:none"></div>

          <!-- Forhandler attention-banner (stale bikes der trænger handling) -->
          ${isDealer ? `<div class="mp-attention" id="mp-attention" style="display:none"></div>` : ''}

          <!-- Tabs + indhold -->
          <div class="mp-tabs-panel">
            <div class="mp-tabs">
              <button class="mp-tab active" data-tab="listings" onclick="switchMyProfileTab('listings')">
                Mine annoncer <span class="mp-tab-count active" id="mp-count-listings">–</span>
              </button>
              <button class="mp-tab" data-tab="saved" onclick="switchMyProfileTab('saved')">
                Gemte <span class="mp-tab-count" id="mp-count-saved">–</span>
              </button>
              <button class="mp-tab" data-tab="searches" onclick="switchMyProfileTab('searches')">
                Cykelagenter <span class="mp-tab-count" id="mp-count-searches">–</span>
              </button>
              <button class="mp-tab" data-tab="trades" onclick="switchMyProfileTab('trades')">
                Handler <span class="mp-tab-count" id="mp-count-trades">–</span>
              </button>
              ${isDealer ? `<button class="mp-tab" data-tab="insights" onclick="switchMyProfileTab('insights')">
                📊 Indsigt
              </button>` : ''}
            </div>
            <div id="mp-panel-listings" class="mp-tab-panel">
              <div id="mp-listings-grid"><p style="color:var(--muted);padding:20px 0">Henter annoncer…</p></div>
            </div>
            <div id="mp-panel-saved" class="mp-tab-panel" style="display:none;">
              <div id="mp-saved-grid"><p style="color:var(--muted);padding:20px 0">Henter gemte…</p></div>
            </div>
            <div id="mp-panel-searches" class="mp-tab-panel" style="display:none;">
              <button onclick="navigateTo('/cykelagenter')" style="display:flex;align-items:center;gap:8px;background:var(--rust);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:0.9rem;font-weight:600;cursor:pointer;margin-bottom:16px;">
                🔔 Opret ny Cykelagent
              </button>
              <div id="mp-searches-list"><p style="color:var(--muted);padding:20px 0">Henter Cykelagenter…</p></div>
            </div>
            <div id="mp-panel-trades" class="mp-tab-panel" style="display:none;">
              <div id="mp-trades-list"><p style="color:var(--muted);padding:20px 0">Henter handler…</p></div>
            </div>
            ${isDealer ? `<div id="mp-panel-insights" class="mp-tab-panel" style="display:none;">
              <div id="mp-insights-content"><p style="color:var(--muted);padding:20px 0">Henter indsigt…</p></div>
            </div>` : ''}
          </div>
        </div>

        <!-- Sidebar (kun desktop, kun hvis indhold) -->
        <aside class="mp-sidebar"${!hasSidebarContent ? ' style="display:none"' : ''}>
          <!-- Profil-komplethed (kun hvis ikke 100%) -->
          ${pct < 100 ? `
          <div class="mp-completion-card">
            <div class="mp-completion-title">Profil ${pct}% komplet</div>
            <div class="mp-completion-sub">Tilføj de sidste detaljer for flere henvendelser.</div>
            <div class="mp-completion-bar">
              <div class="mp-completion-fill" style="width:${pct}%"></div>
            </div>
            ${completionItems.map(x => x.done ? `
              <div class="mp-completion-item mp-completion-item--done">
                <span class="mp-completion-check done">✓</span>
                <span class="mp-completion-label-done">${x.label}</span>
              </div>` : `
              <button class="mp-completion-item mp-completion-item--clickable" onclick="openProfileCompletion('${x.action}')">
                <span class="mp-completion-check"></span>
                <span class="mp-completion-label">${x.label}</span>
                <span class="mp-completion-arrow">→</span>
              </button>`).join('')}
          </div>` : ''}

          ${isDealer && !p.verified ? `
          <div class="mp-pending-card">
            <div class="mp-pending-icon">⏳</div>
            <div class="mp-pending-body">
              <div class="mp-pending-title">Ansøgning afventer godkendelse</div>
              <div class="mp-pending-sub">Vi gennemgår din ansøgning og vender tilbage hurtigst muligt.</div>
            </div>
          </div>` : ''}

        </aside>
      </div>
     </div>
    </div>`;
  }

  function switchMyProfileTab(tab) {
    document.querySelectorAll('.mp-tab').forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('active', on);
      const count = btn.querySelector('.mp-tab-count');
      if (count) count.classList.toggle('active', on);
    });
    ['listings', 'saved', 'searches', 'trades', 'insights'].forEach(t => {
      const panel = document.getElementById(`mp-panel-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
    });
    if (tab === 'listings') loadMyListings('mp-listings-grid');
    if (tab === 'saved')    loadSavedListings('mp-saved-grid');
    if (tab === 'searches') loadSavedSearches('mp-searches-list');
    if (tab === 'trades')   loadTradeHistory('mp-trades-list');
    if (tab === 'insights') loadDealerInsights('mp-insights-content');
  }

  async function loadProfileStats() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser) return;
    const svgTrend = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const svgBulb  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5V15a1 1 0 001 1h6a1 1 0 001-1v-1.5A6 6 0 0012 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const svgChev  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

    try {
      const [bikesRes, savedRes, searchesRes, tradesRes] = await Promise.all([
        supabase.from('bikes').select('id, brand, model, views, is_active, created_at, bike_images(id)').eq('user_id', currentUser.id),
        supabase.from('saved_bikes').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
        supabase.from('saved_searches').select('id, name, filters, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
        supabase.from('messages').select('bike_id').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).ilike('content', '%accepteret%'),
      ]);

      const bikes       = bikesRes.data || [];
      const activeBikes = bikes.filter(b => b.is_active);
      const totalViews  = bikes.reduce((s, b) => s + (b.views || 0), 0);
      const savedCount  = savedRes.count || 0;
      const searches    = searchesRes.data || [];
      const tradesCount = new Set((tradesRes.data || []).map(m => m.bike_id)).size;

      const activeEl = document.getElementById('mp-stat-active');
      if (activeEl) activeEl.textContent = activeBikes.length;
      const viewsEl = document.getElementById('mp-stat-views');
      if (viewsEl) viewsEl.textContent = totalViews.toLocaleString('da-DK');
      const savedEl = document.getElementById('mp-stat-saved');
      if (savedEl) savedEl.textContent = savedCount;
      const tradesEl = document.getElementById('mp-stat-trades');
      if (tradesEl) tradesEl.textContent = tradesCount;

      const activeDelta = document.getElementById('mp-stat-active-delta');
      if (activeDelta) activeDelta.textContent = activeBikes.length === 1 ? '1 live nu' : `${activeBikes.length} live nu`;
      const viewsDelta = document.getElementById('mp-stat-views-delta');
      if (viewsDelta) viewsDelta.textContent = totalViews > 0 ? `${totalViews.toLocaleString('da-DK')} totalt` : 'Ingen endnu';
      const savedDelta = document.getElementById('mp-stat-saved-delta');
      if (savedDelta) savedDelta.textContent = savedCount > 0 ? `${savedCount} favoritter` : 'Ingen endnu';

      const countListings = document.getElementById('mp-count-listings');
      if (countListings) countListings.textContent = bikes.length;
      const countSaved = document.getElementById('mp-count-saved');
      if (countSaved) countSaved.textContent = savedCount;
      const countSearches = document.getElementById('mp-count-searches');
      if (countSearches) countSearches.textContent = searches.length;
      const countTrades = document.getElementById('mp-count-trades');
      if (countTrades) countTrades.textContent = tradesCount;

      const tradesDelta = document.getElementById('mp-stat-trades-delta');
      if (tradesDelta) tradesDelta.textContent = tradesCount > 0 ? (tradesCount === 1 ? '1 gennemført' : `${tradesCount} gennemførte`) : 'Ingen endnu';

      if (currentProfile?.seller_type === 'dealer') {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          const [recentMsgsRes, allReceivedRes, allSentRes] = await Promise.all([
            supabase.from('messages').select('id', { count: 'exact', head: true })
              .eq('receiver_id', currentUser.id).gte('created_at', sevenDaysAgo),
            supabase.from('messages').select('id, bike_id, sender_id, created_at')
              .eq('receiver_id', currentUser.id).order('created_at', { ascending: false }).limit(200),
            supabase.from('messages').select('bike_id, sender_id, created_at')
              .eq('sender_id', currentUser.id).order('created_at', { ascending: false }).limit(200),
          ]);

          const leadsEl = document.getElementById('mp-dealer-leads');
          if (leadsEl) leadsEl.textContent = (recentMsgsRes.count || 0).toString();

          const topViewedBike = [...activeBikes].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
          const topViewsEl = document.getElementById('mp-dealer-topviews');
          if (topViewsEl) topViewsEl.textContent = (topViewedBike?.views || 0).toLocaleString('da-DK');

          const received = allReceivedRes.data || [];
          const sent     = allSentRes.data || [];
          const unanswered = received.filter(rm => {
            return !sent.some(sm =>
              sm.bike_id === rm.bike_id &&
              new Date(sm.created_at) > new Date(rm.created_at)
            );
          });
          const unansweredKeys = new Set(unanswered.map(m => `${m.bike_id}|${m.sender_id}`));
          const respondEl = document.getElementById('mp-dealer-respond');
          if (respondEl) respondEl.textContent = unansweredKeys.size.toString();
        } catch (e) {
          console.error('Dealer banner stats fejl:', e);
        }
      }

      const topBike = [...activeBikes].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
      const insightEl = document.getElementById('mp-insight');
      if (insightEl && topBike && (topBike.views || 0) > 0) {
        const imgCount = (topBike.bike_images || []).length;
        const MAX_IMGS = 8;
        const daysOld  = topBike.created_at ? Math.floor((Date.now() - new Date(topBike.created_at)) / 86400000) : 0;

        let tip;
        if (imgCount < MAX_IMGS) {
          const missing = MAX_IMGS - imgCount;
          tip = `Tilføj ${missing} ${missing === 1 ? 'billede mere' : 'billeder mere'} for at øge synligheden`;
        } else if (daysOld >= 21) {
          tip = `Annoncen er ${daysOld} dage gammel — overvej at justere prisen`;
        } else {
          tip = `Del annoncen med venner for at nå flere potentielle købers`;
        }

        insightEl.innerHTML = `
        <div class="mp-insight-icon">${svgTrend}</div>
        <div class="mp-insight-body">
          <div class="mp-insight-title">
            ${esc(topBike.brand)} ${esc(topBike.model)} har fået
            <span style="color:var(--rust-light)">${(topBike.views || 0).toLocaleString('da-DK')} visninger</span>
          </div>
          <div class="mp-insight-sub">${svgBulb} ${tip}</div>
        </div>
        <button class="mp-insight-cta" onclick="openEditModal('${topBike.id}')">Redigér ${svgChev}</button>
      `;
        insightEl.style.display = '';
      }

    } catch (e) {
      console.error('loadProfileStats fejl:', e);
    }

    // Forhandler-eksklusiv: Attention-items (stale bikes etc.)
    if (currentProfile?.seller_type === 'dealer') {
      loadAttentionItems().catch(() => {});
    }
  }

  // ── Attention-card: stale bikes der trænger handling ──
  async function loadAttentionItems() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const el = document.getElementById('mp-attention');
    if (!el) return;

    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: bikes } = await supabase
      .from('bikes')
      .select('id, brand, model, views, created_at, updated_at, bike_images(url, is_primary)')
      .eq('user_id', currentUser.id)
      .eq('is_active', true);

    if (!bikes || bikes.length === 0) { el.style.display = 'none'; return; }

    const stale = bikes.filter(b => {
      const isOld = (b.updated_at || b.created_at || '') < fourteenDaysAgo;
      const lowViews = (b.views || 0) < 5;
      return isOld && lowViews;
    });
    const noImages = bikes.filter(b => !(b.bike_images || []).length);

    if (stale.length === 0 && noImages.length === 0) {
      el.style.display = 'none';
      return;
    }

    const issues = [];
    if (stale.length > 0) {
      issues.push(`<strong>${stale.length}</strong> ${stale.length === 1 ? 'cykel har' : 'cykler har'} fået under 5 visninger på 14+ dage`);
    }
    if (noImages.length > 0) {
      issues.push(`<strong>${noImages.length}</strong> ${noImages.length === 1 ? 'cykel mangler' : 'cykler mangler'} billeder`);
    }

    el.innerHTML = `
      <div class="mp-attention-icon">⚠️</div>
      <div class="mp-attention-body">
        <div class="mp-attention-title">Brug for opmærksomhed</div>
        <ul class="mp-attention-list">
          ${issues.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
      <button class="mp-attention-cta" onclick="switchMyProfileTab('insights')">Se detaljer →</button>
    `;
    el.style.display = '';
  }

  // ── Indsigt-tab: per-cykel performance + highlights ──
  async function loadDealerInsights(containerId) {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<p style="color:var(--muted);padding:20px 0">Henter indsigt…</p>`;

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [bikesRes, savedRes, msgsRes] = await Promise.all([
        supabase.from('bikes')
          .select('id, brand, model, type, price, views, created_at, updated_at, is_active, bike_images(url, is_primary)')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false }),
        supabase.from('saved_bikes')
          .select('bike_id, bikes!inner(user_id)')
          .eq('bikes.user_id', currentUser.id),
        supabase.from('messages')
          .select('bike_id, created_at')
          .eq('receiver_id', currentUser.id),
      ]);

      const bikes = bikesRes.data || [];
      if (bikes.length === 0) {
        el.innerHTML = `<div class="mp-insight-empty">
          <p style="color:var(--muted);padding:32px 0;text-align:center;">
            Når du har annoncer, vises dybtgående indsigt her — visninger per cykel, sammenligninger, og forslag til hvad du kan optimere.
          </p>
        </div>`;
        return;
      }

      const savedByBike = {};
      (savedRes.data || []).forEach(r => { savedByBike[r.bike_id] = (savedByBike[r.bike_id] || 0) + 1; });
      const msgsByBike = {};
      const recentMsgsByBike = {};
      (msgsRes.data || []).forEach(m => {
        msgsByBike[m.bike_id] = (msgsByBike[m.bike_id] || 0) + 1;
        if (m.created_at >= sevenDaysAgo) recentMsgsByBike[m.bike_id] = (recentMsgsByBike[m.bike_id] || 0) + 1;
      });

      const active = bikes.filter(b => b.is_active);
      const totalViews = active.reduce((s, b) => s + (b.views || 0), 0);
      const totalSaved = active.reduce((s, b) => s + (savedByBike[b.id] || 0), 0);
      const totalMsgs  = active.reduce((s, b) => s + (msgsByBike[b.id] || 0), 0);

      // Highlights
      const topByViews = [...active].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
      const topBySaves = [...active].sort((a, b) => (savedByBike[b.id] || 0) - (savedByBike[a.id] || 0))[0];
      const fourteenDays = new Date(Date.now() - 14 * 86400000).toISOString();
      const stale = active.filter(b => (b.updated_at || b.created_at || '') < fourteenDays && (b.views || 0) < 5);
      const noPics = active.filter(b => !(b.bike_images || []).length);
      const fewPics = active.filter(b => (b.bike_images || []).length > 0 && (b.bike_images || []).length < 3);

      const conversionViews   = totalViews;
      const conversionSaves   = totalSaved;
      const conversionMsgs    = totalMsgs;
      const savePct = conversionViews > 0 ? Math.round((conversionSaves / conversionViews) * 100) : 0;
      const msgPct  = conversionViews > 0 ? Math.round((conversionMsgs / conversionViews) * 100) : 0;

      const tableRows = active
        .map(b => {
          const views = b.views || 0;
          const saves = savedByBike[b.id] || 0;
          const msgs  = msgsByBike[b.id] || 0;
          const daysActive = b.created_at ? Math.floor((Date.now() - new Date(b.created_at)) / 86400000) : 0;
          const updatedDays = b.updated_at ? Math.floor((Date.now() - new Date(b.updated_at)) / 86400000) : daysActive;
          let status = '<span class="bike-status-ok">📊 OK</span>';
          if (views >= 50 && msgs >= 2) status = '<span class="bike-status-hot">🔥 Hot</span>';
          else if (updatedDays >= 14 && views < 5) status = '<span class="bike-status-stale">⚠️ Stille</span>';
          else if (views > 30 && msgs === 0) status = '<span class="bike-status-prislejet">💰 Pris-tjek</span>';
          return `
            <tr onclick="openEditModal('${b.id}')" style="cursor:pointer;">
              <td>${esc(b.brand)} ${esc(b.model || '')}</td>
              <td>${daysActive}d</td>
              <td>${views}</td>
              <td>${saves}</td>
              <td>${msgs}</td>
              <td>${status}</td>
            </tr>`;
        })
        .sort((a, b) => b.localeCompare(a))
        .join('');

      el.innerHTML = `
        <div class="insights-grid">
          <div class="insight-card insight-card--accent">
            <div class="insight-card-label">🔥 Top cykel (visninger)</div>
            <div class="insight-card-value">${topByViews ? esc(topByViews.brand + ' ' + (topByViews.model || '')) : '—'}</div>
            <div class="insight-card-sub">${topByViews ? (topByViews.views || 0).toLocaleString('da-DK') + ' visninger' : 'Ingen data endnu'}</div>
          </div>
          <div class="insight-card">
            <div class="insight-card-label">❤️ Mest gemt</div>
            <div class="insight-card-value">${topBySaves && savedByBike[topBySaves.id] ? esc(topBySaves.brand + ' ' + (topBySaves.model || '')) : '—'}</div>
            <div class="insight-card-sub">${topBySaves && savedByBike[topBySaves.id] ? savedByBike[topBySaves.id] + ' personer' : 'Ingen gemte endnu'}</div>
          </div>
          <div class="insight-card ${stale.length > 0 ? 'insight-card--warn' : ''}">
            <div class="insight-card-label">⚠️ Stille cykler</div>
            <div class="insight-card-value">${stale.length}</div>
            <div class="insight-card-sub">${stale.length > 0 ? 'Under 5 visninger på 14+ dage' : 'Ingen — flot!'}</div>
          </div>
          <div class="insight-card ${noPics.length > 0 ? 'insight-card--warn' : ''}">
            <div class="insight-card-label">📷 Mangler billeder</div>
            <div class="insight-card-value">${noPics.length + fewPics.length}</div>
            <div class="insight-card-sub">${(noPics.length + fewPics.length) > 0 ? 'Cykler med under 3 billeder' : 'Alle har gode billeder'}</div>
          </div>
        </div>

        <h3 class="insights-h3">Konverteringstragt</h3>
        <div class="conversion-funnel">
          <div class="funnel-step">
            <div class="funnel-label">👁 Visninger</div>
            <div class="funnel-bar" style="width:100%"><span>${conversionViews.toLocaleString('da-DK')}</span></div>
          </div>
          <div class="funnel-step">
            <div class="funnel-label">❤️ Gemte</div>
            <div class="funnel-bar" style="width:${Math.max(savePct, 5)}%;background:#e8a4c4"><span>${conversionSaves} (${savePct}%)</span></div>
          </div>
          <div class="funnel-step">
            <div class="funnel-label">💬 Beskeder</div>
            <div class="funnel-bar" style="width:${Math.max(msgPct, 3)}%;background:var(--rust)"><span>${conversionMsgs} (${msgPct}%)</span></div>
          </div>
        </div>

        <h3 class="insights-h3">Per cykel</h3>
        <div class="insights-table-wrap">
          <table class="insights-table">
            <thead>
              <tr>
                <th>Cykel</th>
                <th>Online</th>
                <th>👁 Visninger</th>
                <th>❤️ Gemt</th>
                <th>💬 Beskeder</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>

        ${stale.length > 0 || noPics.length > 0 ? `
          <h3 class="insights-h3">Forslag til handling</h3>
          <div class="insight-actions">
            ${stale.length > 0 ? `
              <div class="action-card">
                <div class="action-card-icon">🔄</div>
                <div class="action-card-body">
                  <div class="action-card-title">${stale.length} ${stale.length === 1 ? 'cykel' : 'cykler'} trænger til opmærksomhed</div>
                  <div class="action-card-sub">De har fået under 5 visninger på 14+ dage. Overvej at sænke prisen eller tilføje flere billeder.</div>
                </div>
              </div>` : ''}
            ${(noPics.length + fewPics.length) > 0 ? `
              <div class="action-card">
                <div class="action-card-icon">📷</div>
                <div class="action-card-body">
                  <div class="action-card-title">Tilføj flere billeder</div>
                  <div class="action-card-sub">Annoncer med 5+ billeder får i gennemsnit 3× flere beskeder. Du har ${noPics.length + fewPics.length} med under 3 billeder.</div>
                </div>
              </div>` : ''}
          </div>` : ''}
      `;
    } catch (e) {
      console.error('loadDealerInsights fejl:', e);
      el.innerHTML = `<p style="color:var(--rust);padding:20px 0">Kunne ikke hente indsigt — prøv igen.</p>`;
    }
  }

  return {
    navigateToMyProfile,
    renderMyProfilePage,
    buildMyProfilePageHTML,
    switchMyProfileTab,
    loadProfileStats,
    loadDealerInsights,
    loadAttentionItems,
  };
}
