/* ============================================================
   FORHANDLERE SIDE + BLIV FORHANDLER
   ============================================================ */

import { SERVICES, openStatus, buildServicesDisplay } from './dealer-extras.js';

export function createDealersPage({
  supabase,
  showToast,
  esc,
  getInitials,
  formatDistanceKm,
  haversineKm,
  updateSEOMeta,
  btnLoading,
  geocodeAddress,
  geocodeCity,
  showDetailView,
  attachAddressAutocomplete,
  readDawaData,
  navigateTo,
  navigateToDealer,
  openBecomeDealerPage,
  closeBecomeDealerModalCompat,
  selectDealerPlanButton,
  getCurrentUser,
  getCurrentProfile,
  updateCurrentProfile,
}) {
  let _dealersPageData = [];
  let _dealerGPSActive = false;
  let _dealerGPSCoords = null;
  let _dealerActiveServices = new Set();

  // ── Thin wrappers for legacy compat ──────────────────────

  function openBecomeDealerModal() {
    return openBecomeDealerPage(navigateTo);
  }

  function closeBecomeDealerModal() {
    return closeBecomeDealerModalCompat();
  }

  function selectDealerPlan(btn) {
    return selectDealerPlanButton(btn);
  }

  // ── Forhandlere side ──────────────────────────────────────

  async function renderDealersPage() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Forhandlere – Cykelbørsen';
    updateSEOMeta('Alle verificerede cykelforhandlere på Cykelbørsen. Køb med tryghed — garanti, servicehistorik og professionel rådgivning.', '/forhandlere');
    _dealersPageData = [];
    _dealerGPSActive = false;
    _dealerGPSCoords = null;

    _dealerActiveServices = new Set();

    const serviceChipsHtml = SERVICES.map(s => `
      <button class="dealer-service-filter" data-svc="${s.key}" onclick="toggleDealerServiceFilter('${s.key}', this)">
        ${s.icon} ${s.label}
      </button>
    `).join('');

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
      <div class="dealer-service-filters" id="dealer-service-filters">
        ${serviceChipsHtml}
      </div>
      <div id="dealers-page-grid" class="dealer-cards">
        <p style="color:var(--muted);padding:40px 0;text-align:center;grid-column:1/-1;">Henter forhandlere...</p>
      </div>
    </div>`;

    const [dealerRes, bikeRes, reviewRes] = await Promise.all([
      supabase.from('profiles').select('id, shop_name, city, address, name, avatar_url, lat, lng, location_precision, services, opening_hours').eq('seller_type', 'dealer').eq('verified', true).order('created_at', { ascending: true }),
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
        <p>Bliv en af de første forhandlere på Cykelbørsen.
Vær med fra starten og nå ud til tusindvis af cykelkøbere.</p>
        <button class="btn-become-dealer-small" onclick="navigateTo('/bliv-forhandler')">Tilmeld din butik →</button>
      </div>`;
      return;
    }

    const dealerIdSet = new Set(dealers.map(d => d.id));

    const countMap = {};
    for (const b of bikeRows) {
      if (dealerIdSet.has(b.user_id)) countMap[b.user_id] = (countMap[b.user_id] || 0) + 1;
    }

    const ratingSum = {}, ratingCnt = {};
    for (const r of reviews) {
      if (dealerIdSet.has(r.reviewed_user_id) && r.rating) {
        ratingSum[r.reviewed_user_id]  = (ratingSum[r.reviewed_user_id]  || 0) + r.rating;
        ratingCnt[r.reviewed_user_id]  = (ratingCnt[r.reviewed_user_id]  || 0) + 1;
      }
    }

    _dealersPageData = dealers.map(dealer => ({
      dealer,
      bikeCount:   countMap[dealer.id]   || 0,
      avgRating:   ratingCnt[dealer.id] ? ratingSum[dealer.id] / ratingCnt[dealer.id] : null,
      ratingCount: ratingCnt[dealer.id]  || 0,
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
      await Promise.all(_dealersPageData.map(async d => {
        const { dealer } = d;
        let coords = null;
        if (dealer.lat && dealer.lng)           coords = [dealer.lat, dealer.lng];
        else if (dealer.address && dealer.city) coords = await geocodeAddress(dealer.address, dealer.city);
        if (!coords && dealer.city)             coords = await geocodeCity(dealer.city);
        d.distKm = coords ? haversineKm(_dealerGPSCoords, coords) : null;
      }));
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
      const withDist    = data.filter(d => d.distKm !== null).sort((a, b) => a.distKm - b.distKm);
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
    const filtered = _dealerActiveServices.size === 0
      ? _dealersPageData
      : _dealersPageData.filter(({ dealer }) =>
          Array.isArray(dealer.services) &&
          [..._dealerActiveServices].every(s => dealer.services.includes(s))
        );

    grid.className = 'dealer-cards';
    if (filtered.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted);padding:40px 0;text-align:center;grid-column:1/-1;">Ingen forhandlere matcher de valgte services.</p>';
      return;
    }
    grid.innerHTML = filtered.map(({ dealer, bikeCount, avgRating, ratingCount, distKm }) =>
      buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm)
    ).join('');
  }

  function toggleDealerServiceFilter(serviceKey, btn) {
    if (_dealerActiveServices.has(serviceKey)) {
      _dealerActiveServices.delete(serviceKey);
      btn?.classList.remove('on');
    } else {
      _dealerActiveServices.add(serviceKey);
      btn?.classList.add('on');
    }
    sortAndRenderDealers();
  }

  function buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm) {
    const displayName  = dealer.shop_name || dealer.name || 'Forhandler';
    const initials     = getInitials(displayName);
    const locationText = dealer.address && dealer.city
      ? `${dealer.address}, ${dealer.city}`
      : dealer.city || '';

    const distHtml = distKm !== null
      ? `<span class="dealer-dist-badge">${formatDistanceKm(distKm)}</span>`
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

    const status = openStatus(dealer.opening_hours);
    const openHtml = status
      ? `<div class="dealer-open-status ${status.isOpen ? 'is-open' : 'is-closed'}">
          <span class="dealer-open-dot"></span>${esc(status.label)}
         </div>`
      : '';

    const servicesHtml = (Array.isArray(dealer.services) && dealer.services.length)
      ? `<div class="dealer-card-services">${dealer.services.slice(0, 3).map(key => {
          const s = SERVICES.find(x => x.key === key);
          return s ? `<span class="dealer-card-service" title="${esc(s.label)}">${s.icon}</span>` : '';
        }).join('')}${dealer.services.length > 3 ? `<span class="dealer-card-service-more">+${dealer.services.length - 3}</span>` : ''}</div>`
      : '';

    return `
    <div class="dealer-card" onclick="navigateToDealer('${dealer.id}')" style="cursor:pointer;" title="Se ${esc(displayName)}s profil">
      <div class="dealer-card-top">
        <div class="dealer-logo-circle">${initials}</div>
        ${distHtml}
      </div>
      <div class="dealer-name">${esc(displayName)} <span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></div>
      ${locationText ? `<div class="dealer-city">📍 ${esc(locationText)}</div>` : ''}
      ${openHtml}
      ${starsHtml}
      <div class="dealer-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>
      ${servicesHtml}
      ${mapsHtml}
    </div>`;
  }

  function renderStars(avg) {
    const full  = Math.floor(avg);
    const half  = avg - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  // ── Bliv forhandler side ──────────────────────────────────

  function renderBecomeDealerPage() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Bliv forhandler – Cykelbørsen';
    updateSEOMeta('Bliv forhandler på Cykelbørsen. Nå cykellkøbere i hele Danmark. Helt gratis — ingen binding.', '/bliv-forhandler');

    const isLoggedIn      = !!currentUser;
    const isAlreadyDealer = isLoggedIn && currentProfile?.seller_type === 'dealer';
    const isPrivateUser   = isLoggedIn && currentProfile?.seller_type !== 'dealer';

    if (isPrivateUser) {
      const name = esc(currentProfile?.name || currentUser?.email || 'dig');
      document.getElementById('detail-view').innerHTML = `
      <div class="bd-page">
        <div class="bd-page-header">
          <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
          <h1 class="bd-page-title">Bliv forhandler</h1>
          <p class="bd-page-subtitle">Få din cykelbutik på Danmarks dedikerede cykelmarkedsplads</p>
        </div>

        <div class="bd-perks">
          <div class="bd-perk">✅ <span>Ubegrænset antal annoncer</span></div>
          <div class="bd-perk">✅ <span>Verificeret forhandler-badge</span></div>
          <div class="bd-perk">✅ <span>Direkte beskeder fra købere</span></div>
          <div class="bd-perk">✅ <span>Prioriteret placering i søgning</span></div>
          <div class="bd-perk">✅ <span>100% gratis — ingen kreditkort</span></div>
        </div>

        <div class="bd-form" style="text-align:center;">
          <div style="font-size:2.8rem;margin-bottom:16px;">🏪</div>
          <h3 class="bd-form-title" style="margin-bottom:10px;">Opret dig som forhandler</h3>
          <p style="font-size:0.92rem;color:var(--muted);line-height:1.6;max-width:420px;margin:0 auto 28px;">
            Du er logget ind som <strong>${name}</strong> (privat bruger).
            Forhandlerkonti oprettes som en separat konto — log ud og opret en ny konto med din butiks e-mailadresse.
          </p>
          <button class="form-submit" onclick="logout().then(()=>navigateTo('/bliv-forhandler'))" style="width:auto;padding:14px 32px;margin-bottom:12px;">
            Log ud og opret forhandlerkonto →
          </button>
          <div>
            <button onclick="navigateTo('/')" style="background:none;border:none;color:var(--muted);font-size:0.85rem;cursor:pointer;text-decoration:underline;font-family:'DM Sans',sans-serif;">
              Fortsæt som privat bruger
            </button>
          </div>
        </div>
      </div>`;
      return;
    }

    if (isAlreadyDealer) {
      document.getElementById('detail-view').innerHTML = `
      <div class="bd-page">
        <div class="bd-page-header">
          <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
          <h1 class="bd-page-title">Du er allerede forhandler</h1>
          <p class="bd-page-subtitle">Din butiksprofil er aktiv på Cykelbørsen</p>
        </div>
        <div style="text-align:center;padding:32px 0;">
          <button class="form-submit" onclick="navigateTo('/min-profil')" style="width:auto;padding:14px 32px;">Se min profil →</button>
        </div>
      </div>`;
      return;
    }

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
          <div class="form-group"><label>Telefon</label><input type="text" id="dealer-phone" placeholder="f.eks. 12 34 56 78" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Adresse *</label><input type="text" id="dealer-address" placeholder="Start med at skrive gadenavn…" autocomplete="off"></div>
          <div class="form-group"><label>By</label><input type="text" id="dealer-city" placeholder="Udfyldes automatisk" autocomplete="off"></div>
        </div>
        <p class="bd-auth-note" style="margin:-4px 0 0;">📍 Vælg din præcise butiks-adresse fra listen — så vises butikken korrekt på kortet.</p>

        ${!isLoggedIn ? `
        <div class="bd-form-divider">
          <span>Din forhandlerkonto</span>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>Email *</label><input type="email" id="dealer-email" placeholder="din@butik.dk" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Adgangskode *</label><input type="password" id="dealer-password" placeholder="Min. 6 tegn" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
        </div>
        <p class="bd-auth-note">Vi opretter automatisk en forhandlerkonto med din email. Tjek din indbakke for at bekræfte.</p>
        ` : `
        <div class="bd-form-divider"><span>Logget ind som ${esc(currentProfile?.name || currentUser?.email || '')}</span></div>
        <input type="hidden" id="dealer-email" value="${esc(currentUser?.email || '')}">
        `}

        <button class="form-submit" id="dealer-submit-btn" onclick="submitDealerApplication()" style="margin-top:20px;">Opret forhandler-profil →</button>
        <p style="font-size:.75rem;color:var(--muted);text-align:center;margin-top:10px;">
          Gratis at oprette — ingen binding, ingen kreditkort.
        </p>
      </div>
    </div>`;

    const dealerAddressInput = document.getElementById('dealer-address');
    const dealerCityInput    = document.getElementById('dealer-city');
    if (dealerAddressInput) {
      attachAddressAutocomplete(dealerAddressInput, (picked) => {
        if (dealerCityInput && picked.city) {
          dealerCityInput.value = picked.city;
          dealerCityInput.dataset.dawaLat = String(picked.lat);
          dealerCityInput.dataset.dawaLng = String(picked.lng);
        }
      });
    }
  }

  async function submitDealerApplication() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    const shopName = (document.getElementById('dealer-shop-name')?.value || '').trim();
    const cvr      = (document.getElementById('dealer-cvr')?.value || '').trim();
    const contact  = (document.getElementById('dealer-contact')?.value || '').trim();
    const phone    = (document.getElementById('dealer-phone')?.value || '').trim();
    const addressInput = document.getElementById('dealer-address');
    const cityInput    = document.getElementById('dealer-city');
    const address  = (addressInput?.value || '').trim();
    const city     = (cityInput?.value || '').trim();
    const addrData = readDawaData(addressInput);
    const email    = (document.getElementById('dealer-email')?.value || '').trim();
    const password = (document.getElementById('dealer-password')?.value || '').trim();

    if (!shopName || !cvr || !contact) {
      showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
    }
    if (!address || !addrData.lat || !addrData.lng) {
      showToast('⚠️ Vælg din butiks-adresse fra listen så kortet viser jer korrekt'); return;
    }

    const restore = btnLoading('dealer-submit-btn', 'Opretter profil...');
    let userId = currentUser?.id;

    if (!currentUser) {
      if (!email || !password) {
        restore();
        showToast('⚠️ Udfyld email og adgangskode'); return;
      }
      if (password.length < 6) {
        restore();
        showToast('⚠️ Adgangskoden skal være mindst 6 tegn'); return;
      }

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name:           contact,
            pending_dealer: true,
            shop_name:      shopName,
            cvr:            cvr,
            phone:          phone,
            address:        address,
            city:           city,
            lat:            addrData.lat,
            lng:            addrData.lng,
            postcode:       addrData.postcode,
          },
        },
      });

      if (signUpErr) {
        restore();
        if (signUpErr.message?.includes('already registered')) {
          showToast('⚠️ E-mailen er allerede i brug — log ind i stedet');
        } else {
          showToast('❌ ' + (signUpErr.message || 'Kunne ikke oprette konto'));
        }
        return;
      }

      userId = signUpData.user?.id;
      if (!userId) { restore(); showToast('❌ Noget gik galt – prøv igen'); return; }

      // Send admin-notifikation om ny forhandleransøgning (fire-and-forget)
      supabase.functions.invoke('notify-message', {
        body: {
          type:      'dealer_application',
          shop_name: shopName,
          cvr:       cvr,
          contact:   contact,
          phone:     phone,
          address:   address,
          city:      city,
          email:     email,
          user_id:   userId,
        },
      }).catch(() => {});

      restore();
      document.getElementById('detail-view').innerHTML = `
      <div class="bd-page">
        <div class="bd-page-header">
          <h1 class="bd-page-title">Tjek din indbakke</h1>
          <p class="bd-page-subtitle">Vi har sendt en bekræftelsesmail til <strong>${esc(email)}</strong>.<br>Klik på linket i mailen for at aktivere din forhandlerkonto.</p>
        </div>
        <div style="text-align:center;padding:32px 0;font-size:3rem;">📬</div>
      </div>`;
      return;
    }

    const { error } = await supabase.from('profiles').update({
      shop_name:          shopName,
      cvr:                cvr,
      phone:              phone,
      address:            address,
      city:               city,
      lat:                addrData.lat,
      lng:                addrData.lng,
      postcode:           addrData.postcode,
      location_precision: 'exact',
      seller_type:        'dealer',
      verified:           false,
      name:               contact,
    }).eq('id', userId);

    restore();

    if (error) {
      showToast('❌ Noget gik galt – prøv igen');
      return;
    }

    if (currentProfile) {
      updateCurrentProfile({
        seller_type: 'dealer',
        verified:    false,
        shop_name:   shopName,
        city:        city,
      });
    }

    supabase.functions.invoke('notify-message', {
      body: {
        type:      'dealer_application',
        shop_name: shopName,
        cvr:       cvr,
        contact:   contact,
        phone:     phone,
        address:   address,
        city:      city,
        email:     currentUser.email,
        user_id:   currentUser.id,
      },
    }).catch(() => {});

    showToast('✅ Ansøgning modtaget – vi vender tilbage hurtigst muligt!');
    navigateTo('/min-profil');
  }

  async function openSubscriptionPortal() {
    const currentUser = getCurrentUser();
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

  return {
    openBecomeDealerModal,
    closeBecomeDealerModal,
    selectDealerPlan,
    renderDealersPage,
    toggleDealerGPS,
    sortAndRenderDealers,
    toggleDealerServiceFilter,
    buildDealerCardFull,
    renderStars,
    renderBecomeDealerPage,
    submitDealerApplication,
    openSubscriptionPortal,
  };
}
