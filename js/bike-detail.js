/* ============================================================
   BIKE DETAIL — ES module factory
   Extracted from main.js (lines 1105–1622 and 3365–4142).
   ============================================================ */

import { brandToSlug } from './brand-data-v2.js';
import { maybeShowScamWarning } from './scam-warning.js';

export function createBikeDetail({
  supabase,
  showToast,
  esc,
  safeAvatarUrl,
  getInitials,
  formatLastSeen,
  formatRelativeAge,
  haversineKm,
  BASE_URL,
  removeBikeJsonLd,
  updateSEOMeta,
  retryHTML,
  stableOffset,
  bikeCache,
  getUserSavedSet,
  getUserGeoCoords,
  setUserGeoCoords,
  getCurrentUser,
  getCurrentProfile,
  navigateTo,
  openLoginModal,
  openUserProfile,
  openDealerProfile,
  openShareModal,
  updateInboxBadge,
  loadBikes,
  closeAllModals,
  geocodeAddress,
  geocodeCity,
  setPendingInboxThread,
  transformImageUrl = (u) => u,
}) {

  /* ── Module-local state ── */
  let _bikeModalToken   = 0;
  let _bikeDetailMap    = null;
  let _bikeDetailMapData = null; // { sellerCoords, sellerType, profile }

  // Report modal state
  let _reportBikeId    = null;
  let _reportBikeTitle = null;

  // Lightbox gesture state
  const _lb = {
    scale: 1, tx: 0, ty: 0,
    startDist: 0, startScale: 1,
    startX: 0, startY: 0, startTx: 0, startTy: 0,
    touchMode: null, // 'pan' | 'pinch' | 'swipe' | null
    lastTap: 0,
  };

  /* ============================================================
     ANNONCE DETALJE — FÆLLES FETCH + HTML BUILDER
     ============================================================ */

  async function fetchBikeById(bikeId) {
    let result;
    if (bikeCache.has(bikeId)) {
      result = { data: bikeCache.get(bikeId), error: null };
    } else {
      const fetchPromise = supabase
        .from('bikes')
        .select('*, profiles(id, name, seller_type, shop_name, phone, city, address, verified, id_verified, email_verified, offers_financing, offers_tradein, avatar_url, last_seen, bio, created_at), bike_images(url, is_primary)')
        .eq('id', bikeId)
        .single();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: annonceforespørgsel tog for lang tid')), 15000));
      result = await Promise.race([fetchPromise, timeoutPromise]);
      if (result.data && !result.error) {
        bikeCache.set(bikeId, result.data);
      }
    }
    // Track som "sidst set" hver gang — fire-and-forget
    if (result.data && !result.error) {
      import('./recently-viewed.js').then(m => m.addRecentlyViewed(result.data)).catch(() => {});
    }
    return result;
  }

  function buildBikeBodyHTML(b) {
    const profile    = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    const isDemo     = profile.shop_name === 'Cykelbørsen Demo';
    const initials   = getInitials(sellerName);
    const currentUser = getCurrentUser();
    const isOwner    = currentUser && currentUser.id === profile.id;
    const avatarUrl  = safeAvatarUrl(profile.avatar_url);
    const avatarContent = avatarUrl
      ? `<img src="${avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : initials;

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
      ${isDemo ? `
      <div class="demo-banner" role="note">
        <span class="demo-banner-icon">📝</span>
        <div class="demo-banner-text">
          <strong>Dette er en eksempel-annonce</strong>
          <span>Den er oprettet til at vise hvordan annoncer ser ud på Cykelbørsen. Cyklen er ikke til salg, og du kan ikke kontakte sælgeren.</span>
        </div>
      </div>` : ''}
      <div class="bike-detail-grid">
        <div>
          ${galleryHtml}
          ${(profile.city || profile.address) ? `
          <a class="bike-location-card" id="bike-location-card" href="/" onclick="showBikeOnMap('${b.id}');return false;">
            <div class="bike-location-header">
              <div class="bike-location-title">
                <span class="bike-location-pin">📍</span>
                <div>
                  <div class="bike-location-label">Sælgers placering</div>
                  <div class="bike-location-place">${esc(profile.city || '')}</div>
                  ${profile.address ? `<div class="bike-location-address">${esc(profile.address)}</div>` : ''}
                </div>
              </div>
              <span class="bike-location-chevron">→</span>
            </div>
          </a>` : ''}
        </div>
        <div class="bike-detail-info">
          <div class="bike-detail-price">${b.price.toLocaleString('da-DK')} kr.</div>
          ${b.original_price && b.original_price > b.price ? `
          <div class="price-reduced-badge" title="Sælger har sat prisen ned">
            <span class="price-reduced-old">${b.original_price.toLocaleString('da-DK')} kr.</span>
            <span class="price-reduced-arrow">↓</span>
            <span class="price-reduced-save">Spar ${(b.original_price - b.price).toLocaleString('da-DK')} kr.</span>
          </div>` : ''}
          <div class="bike-detail-tags">
            <span class="detail-tag">${b.type}</span>
            ${b.year ? `<span class="detail-tag">${b.year}</span>` : ''}
            ${(b.size || b.size_cm) ? `<span class="detail-tag">Str. ${b.size_cm ? b.size_cm + ' cm' : esc(b.size)}${b.size_cm && b.size ? ` <span style="color:var(--muted);font-weight:400;">(${esc(b.size)})</span>` : ''}</span>` : ''}
            ${b.condition ? `<span class="detail-tag">${b.condition}</span>` : ''}
            ${(Array.isArray(b.colors) && b.colors.length) ? b.colors.map(c => `<span class="detail-tag">🎨 ${esc(c)}</span>`).join('') : (b.color ? `<span class="detail-tag">🎨 ${esc(b.color)}</span>` : '')}
            ${b.city ? `<span class="detail-tag">📍 ${b.city}</span>` : ''}
            ${b.warranty ? `<span class="detail-tag" style="background:#e8f5e9;color:#2e7d32;">🛡️ ${esc(b.warranty)}</span>` : ''}
          </div>
          ${b.description ? `<p style="font-size:0.85rem;color:var(--muted);margin:10px 0 0;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(b.description)}</p>` : ''}
          <div class="bike-detail-seller" onclick="navigateToProfile('${profile.id}')" style="cursor:pointer;" title="Se sælgers profil">
            <div class="seller-avatar-large">${avatarContent}</div>
            <div style="flex:1">
              <div class="seller-detail-name">${sellerName || 'Ukendt'}${profile.verified ? ' <span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}${profile.email_verified ? ' <span class="email-badge" title="E-mail verificeret">✉️</span>' : ''}</div>
              <div class="seller-detail-city">${profile.city || ''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">
                <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                  ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
                </span>
                <span id="seller-sold-count" style="font-size:0.75rem;color:var(--muted);"></span>
                <span id="response-time-badge" style="font-size:0.75rem;color:var(--muted);">⏱ Henter responstid...</span>
              </div>
            </div>
            <div style="color:var(--muted);font-size:0.8rem;align-self:center;">Se profil →</div>
          </div>
          ${isDemo && !isOwner ? `
          <div class="action-buttons">
            <div class="demo-detail-notice">
              Cyklen er ikke til salg — det er en eksempel-annonce der viser hvordan rigtige annoncer fungerer på Cykelbørsen.
            </div>
            <button class="btn-save-listing" onclick="event.stopPropagation();openShareModal('${b.id}', '${b.brand} ${b.model}')">🔗 Del annonce</button>
          </div>
          ` : !isOwner ? `
          ${sellerType === 'dealer' ? (() => {
            const perks = [];
            if (profile.verified) perks.push('Verificeret virksomhed');
            if (b.warranty) perks.push(`Garanti: ${esc(b.warranty)}`);
            else perks.push('Service & faglig rådgivning');
            if (profile.offers_tradein)   perks.push('Byttetilbud muligt');
            if (profile.offers_financing) perks.push('Finansiering muligt');
            return `
          <div class="dealer-perks">
            <div class="dealer-perks-header">
              <span class="dealer-perks-icon">🏪</span>
              <span class="dealer-perks-title">Køb hos forhandler</span>
            </div>
            <ul class="dealer-perks-list">
              ${perks.map(p => `<li><span class="dp-check">✓</span>${p}</li>`).join('')}
            </ul>
          </div>`;
          })() : ''}
          <div class="action-buttons">
            ${b.external_url ? `
            <a href="${esc(b.external_url)}" target="_blank" rel="noopener noreferrer" class="btn-external-cta">
              🛒 Se hos ${esc(profile.shop_name || profile.name || 'forhandler')}
              <span class="btn-external-cta-sub">Bestil direkte hos forhandleren</span>
            </a>` : `
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
            </div>`}
            <button class="btn-contact" onclick="toggleMessageBox()">✉️ Kontakt sælger</button>
            <div class="message-box" id="message-box">
              <div class="msg-presets">
                <button class="msg-preset-chip" onclick="insertPresetMsg('Er den stadig til salg?')">Er den stadig til salg?</button>
                <button class="msg-preset-chip" onclick="insertPresetMsg('Hvad er laveste pris?')">Hvad er laveste pris?</button>
                <button class="msg-preset-chip" onclick="insertPresetMsg('Kan jeg komme og se den?')">Kan jeg se den?</button>
              </div>
              <textarea id="message-text" placeholder="Skriv en besked til sælgeren..."></textarea>
              <button onclick="sendMessage('${b.id}', '${profile.id}')">Send besked</button>
            </div>
            <div class="antiscam-tip">🔒 Mød op personligt og betal ved levering. Del aldrig kontooplysninger.</div>
            <button class="btn-save-listing" onclick="toggleSaveFromModal(this, '${b.id}')">🤍 Gem annonce</button>
            <button class="btn-save-listing" id="price-drop-btn-${b.id}" onclick="togglePriceDropWatch(this, '${b.id}', ${b.price})">🔔 Få besked ved prisfald</button>
            <button class="btn-save-listing" onclick="event.stopPropagation();openShareModal('${b.id}', '${b.brand} ${b.model}')">🔗 Del annonce</button>
            <button class="btn-report-listing" onclick="openReportModal('${b.id}', '${b.brand} ${b.model}')">🚩 Rapporter annonce</button>
          </div>
          ` : `
          <div class="owner-panel">
            <div class="owner-panel-header">
              <span class="owner-panel-title">Din annonce</span>
            </div>
            <div id="interested-users-section" class="interested-section">
              <p class="interested-loading">Henter interesserede…</p>
            </div>
          </div>`}
        </div>
      </div>
      ${b.description ? `
      <div style="margin-top:20px;">
        <h3 style="font-family:'Fraunces',serif;font-size:1rem;margin-bottom:10px;">Beskrivelse</h3>
        <div class="desc-wrap is-clamped" id="bike-desc-wrap">
          <div class="bike-detail-description" id="bike-desc-text">${esc(b.description).replace(/\n/g, '<br>')}</div>
        </div>
        <button class="desc-expand-btn" id="bike-desc-btn" onclick="expandBikeDesc()">+ Vis fuld beskrivelse</button>
      </div>` : ''}
      ${(b.size || b.size_cm || b.wheel_size) ? (() => {
        const heightMap = {
          'XS (44–48 cm)': '148–162 cm',
          'S (49–52 cm)':  '163–170 cm',
          'M (53–56 cm)':  '171–178 cm',
          'L (57–60 cm)':  '179–188 cm',
          'XL (61+ cm)':   '189+ cm',
        };
        const heightRange = b.size ? (heightMap[b.size] || null) : null;
        return `
        <div class="fit-section">
          <h3 class="fit-section-title">Størrelse og pasform <button class="fit-info-btn" onclick="toggleSizeFitInfo()" aria-label="Hvad betyder anbefalet højde?" type="button">?</button></h3>
          <div class="fit-cards">
            ${heightRange ? `
            <div class="fit-card">
              <div class="fit-card-label">Anbefalet højde</div>
              <div class="fit-card-value">${heightRange}</div>
            </div>` : ''}
            ${(b.size || b.size_cm) ? `
            <div class="fit-card">
              <div class="fit-card-label">Rammestørrelse</div>
              <div class="fit-card-value">${b.size_cm ? `${b.size_cm} cm` : esc(b.size)}${b.size_cm && b.size ? ` <span style="color:var(--muted);font-weight:400;font-size:0.85em;">(${esc(b.size)})</span>` : ''}</div>
            </div>` : ''}
            ${b.wheel_size ? `
            <div class="fit-card">
              <div class="fit-card-label">Hjulstørrelse</div>
              <div class="fit-card-value">${esc(b.wheel_size)}</div>
            </div>` : ''}
          </div>
          <p class="fit-disclaimer">Vejledende — den faktiske pasform afhænger også af benlængde, kropsbygning og cykeltype. Tag altid en prøvetur inden køb.</p>
          <div class="fit-info-popup" id="fit-info-popup" style="display:none;">
            <p><strong>Hvorfor er det kun vejledende?</strong></p>
            <p>Højde er det første, men ikke det eneste, der bestemmer pasform:</p>
            <ul>
              <li><strong>Benlængde (inseam):</strong> To personer på 175 cm kan have benlængde der varierer 5-10 cm — det påvirker sadelhøjde</li>
              <li><strong>Cykeltype:</strong> Racere kræver mere strakt position end citybikes — så samme rammestørrelse passer forskelligt</li>
              <li><strong>Personlig præference:</strong> Nogle foretrækker oprejst position, andre aerodynamisk</li>
              <li><strong>Stelfabrikantens mål:</strong> En "M" hos Trek er ikke nødvendigvis præcis "M" hos Specialized</li>
            </ul>
            <p><strong>Vores anbefaling:</strong> Tag altid en prøvetur. Justér sadelhøjden så benet er næsten strakt i nederste pedalposition. Tjek at du kan stå over rammen med begge fødder fladt på jorden.</p>
          </div>
        </div>`;
      })() : ''}
      ${(() => {
        // Teknisk specifikation — vis kun hvis mindst ét struktureret felt er udfyldt
        const techRows = [];
        if (b.frame_material)              techRows.push(['Stelmaterial', esc(b.frame_material)]);
        if (b.groupset)                    techRows.push(['Komponentgruppe', esc(b.groupset)]);
        if (b.brake_type)                  techRows.push(['Bremser', esc(b.brake_type)]);
        if (b.electronic_shifting === true)  techRows.push(['Gear-skifte', 'Elektronisk (Di2/eTap/AXS)']);
        if (b.electronic_shifting === false) techRows.push(['Gear-skifte', 'Mekanisk']);
        if (b.weight_kg != null)           techRows.push(['Vægt', `${Number(b.weight_kg).toFixed(2).replace('.', ',')} kg`]);
        if (techRows.length === 0) return '';
        return `
        <div class="fit-section" style="margin-top:24px;">
          <h3 class="fit-section-title">Teknisk specifikation</h3>
          <div class="fit-cards">
            ${techRows.map(([label, value]) => `
              <div class="fit-card">
                <div class="fit-card-label">${label}</div>
                <div class="fit-card-value">${value}</div>
              </div>
            `).join('')}
          </div>
        </div>`;
      })()}
      <a href="https://politi.dk/cykler-og-koeretoejer/tjek-om-en-cykel-eller-et-koeretoej-er-efterlyst/tjek-om-en-cykel-er-efterlyst" target="_blank" rel="noopener" class="theft-check-tip">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <div>
          <strong>Tjek stelnummeret</strong>
          <span>Politiet har et gratis register over stjålne cykler — tjek inden du køber</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <div id="seller-other-listings" style="margin-top:28px;"></div>
      <div id="similar-listings" style="margin-top:24px;"></div>
      <div class="listing-meta">
        <span>Annonce-ID: ${b.id}</span>
        <span title="${new Date(b.created_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })}">Oprettet ${formatRelativeAge(b.created_at)}</span>
        ${b.updated_at && new Date(b.updated_at) - new Date(b.created_at) > 60000 ? `<span title="${new Date(b.updated_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })}">Sidst redigeret ${formatRelativeAge(b.updated_at)}</span>` : ''}
      </div>
      ${!isOwner ? `
      <div class="bike-sticky-bar" id="bike-sticky-bar">
        <div class="bike-sticky-price">${b.price.toLocaleString('da-DK')} kr.</div>
        <div class="bike-sticky-actions">
          <button class="bike-sticky-contact" onclick="stickyBarAction('msg')" aria-label="Kontakt sælger">✉️ Kontakt</button>
          ${b.external_url
            ? `<a href="${esc(b.external_url)}" target="_blank" rel="noopener noreferrer" class="bike-sticky-bid" aria-label="Se hos forhandler">🛒 Webshop</a>`
            : `<button class="bike-sticky-bid" onclick="stickyBarAction('bid')" aria-label="Giv bud">💰 Giv bud</button>`}
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

    const currentUser = getCurrentUser();

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
        _setMeta('og:title', 'Cykelbørsen – Køb & Sælg Nye og Brugte Cykler i Danmark');
        _setMeta('og:description', 'Danmarks dedikerede markedsplads for nye og brugte cykler. Køb og sælg racercykler, mountainbikes, el-cykler og meget mere. Gratis at oprette annonce.');
      };

      document.getElementById('bike-modal-body').innerHTML = html;
      attachGallerySwipe();
      _initDescExpand();
      loadResponseTime(profile.id);
      loadSellerSoldCount(profile.id);
      loadSellerOtherListings(profile.id, b.id);
      loadSimilarListings(b.type, b.id);
      initPriceDropButton(b.id);
      initBikeDetailMap(b);
      if (currentUser && currentUser.id === b.user_id) loadInterestedUsers(b.id);
    } catch (renderErr) {
      console.error('openBikeModal render error:', renderErr.message);
      document.getElementById('bike-modal-body').innerHTML = retryHTML('Kunne ikke vise annonce.', `() => openBikeModal('${bikeId}')`);
    }
  }

  /* ============================================================
     BIKE LOCATION MAP — vises under galleriet på annonce-siden
     ============================================================ */

  async function initBikeDetailMap(b) {
    const mapEl = document.getElementById('bike-location-map');
    if (!mapEl || typeof L === 'undefined') return;

    // Tear down previous instance hvis nogen
    if (_bikeDetailMap) {
      try { _bikeDetailMap.remove(); } catch (e) {}
      _bikeDetailMap = null;
    }
    _bikeDetailMapData = null;

    const profile = b.profiles || {};
    const isDealer = profile.seller_type === 'dealer';

    // Geokod sælgers placering — adresse hvis tilgængelig, ellers by
    let coords = null;
    if (profile.address && (profile.city || b.city)) {
      coords = await geocodeAddress(profile.address, profile.city || b.city);
    }
    if (!coords && (profile.city || b.city)) {
      coords = await geocodeCity(profile.city || b.city);
    }
    if (!coords) {
      mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.85rem;">Kunne ikke vise kort for denne placering</div>';
      return;
    }

    _bikeDetailMap = L.map(mapEl, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    }).setView(coords, 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(_bikeDetailMap);

    // Sælger-marker — rust for privat, forest for forhandler
    const markerColor = isDealer ? '#2A3D2E' : '#C8502A';
    const sellerLabel = isDealer ? '🏪 Forhandler' : '👤 Privat sælger';
    const sellerIcon = L.divIcon({
      html: `<div style="background:${markerColor};border-radius:50% 50% 50% 0;width:30px;height:30px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:13px;">${isDealer ? '🏪' : '🚲'}</span></div>`,
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30],
    });

    L.marker(coords, { icon: sellerIcon })
      .addTo(_bikeDetailMap)
      .bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:0.85rem;"><strong>${esc(isDealer ? (profile.shop_name || profile.name || '') : (profile.name || ''))}</strong><br>${esc(profile.city || '')}<br><span style="color:var(--muted);font-size:0.78rem;">${sellerLabel}</span></div>`);

    _bikeDetailMapData = { sellerCoords: coords, profile, isDealer };

    // Hvis vi allerede har brugerens GPS, vis straks
    if (getUserGeoCoords()) {
      _drawUserPositionOnBikeMap();
    }

    setTimeout(() => { try { _bikeDetailMap.invalidateSize(); } catch (e) {} }, 120);
  }

  function _drawUserPositionOnBikeMap() {
    const userGeoCoords = getUserGeoCoords();
    if (!_bikeDetailMap || !_bikeDetailMapData || !userGeoCoords) return;
    const { sellerCoords } = _bikeDetailMapData;

    // Bruger-marker
    const userIcon = L.divIcon({
      html: '<div style="background:#1877F2;border-radius:50%;width:16px;height:16px;border:3px solid white;box-shadow:0 0 0 4px rgba(24,119,242,0.25);"></div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker(userGeoCoords, { icon: userIcon })
      .addTo(_bikeDetailMap)
      .bindPopup('<div style="font-family:\'DM Sans\',sans-serif;font-size:0.85rem;font-weight:600;">📍 Din placering</div>');

    // Linje mellem bruger og sælger
    L.polyline([userGeoCoords, sellerCoords], {
      color: '#C8502A',
      weight: 3,
      opacity: 0.7,
      dashArray: '8, 6',
    }).addTo(_bikeDetailMap);

    // Zoom så begge er synlige
    const bounds = L.latLngBounds([userGeoCoords, sellerCoords]).pad(0.25);
    _bikeDetailMap.fitBounds(bounds);

    // Distance-badge
    const km = haversineKm(userGeoCoords, sellerCoords);
    const distEl = document.getElementById('bike-location-dist');
    if (distEl) {
      distEl.textContent = `${km < 10 ? km.toFixed(1) : Math.round(km)} km væk`;
      distEl.style.display = '';
    }
    // Skjul "Vis min afstand"-knappen
    const btn = document.getElementById('bike-location-locate-btn');
    if (btn) btn.style.display = 'none';
  }

  function showMyDistanceOnBikeMap() {
    if (!navigator.geolocation) {
      showToast('⚠️ Din browser understøtter ikke lokation');
      return;
    }
    const btn = document.getElementById('bike-location-locate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Henter…'; }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeoCoords([pos.coords.latitude, pos.coords.longitude]);
        _drawUserPositionOnBikeMap();
      },
      () => {
        showToast('⚠️ Kunne ikke hente din lokation');
        if (btn) { btn.disabled = false; btn.textContent = '📍 Vis min afstand'; }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
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

    const currentUser = getCurrentUser();
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
        <h1 style="font-family:'Fraunces',serif;font-size:1.8rem;font-weight:700;margin-bottom:6px;color:var(--charcoal);">${esc(b.brand)} ${esc(b.model)}</h1>
        ${b.brand ? `<a href="/cykler/${brandToSlug(b.brand)}" onclick="event.preventDefault();navigateTo('/cykler/${brandToSlug(b.brand)}')" style="display:inline-block;margin-bottom:18px;font-family:'DM Sans',sans-serif;font-size:0.85rem;color:var(--rust);text-decoration:none;">Se alle ${esc(b.brand)}-cykler →</a>` : ''}
        ${html}
      </div>`;

    attachGallerySwipe();
    _initDescExpand();
    loadResponseTime(profile.id);
    loadSellerSoldCount(profile.id);
    loadSellerOtherListings(profile.id, b.id);
    loadSimilarListings(b.type, b.id);
    initBikeDetailMap(b);
    initPriceDropButton(b.id);
    if (currentUser && currentUser.id === b.user_id) loadInterestedUsers(b.id);
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
    document.body.classList.remove('is-mp-mobile');
    document.title = 'Cykelbørsen – Køb & Sælg Brugte Cykler i Danmark';
    updateSEOMeta(null, '/');
    removeBikeJsonLd();
  }

  /* ============================================================
     SÆLGER-CREDIBILITY: solgte cykler-tæller
     ============================================================
     Viser "📦 X solgt" ved siden af forhandler/privat-badgen for
     at give køberen et hurtigt signal om sælgers track record.
     Kun "solgt" = bikes med is_active=false (vores soft-delete).
     Tæller IKKE den nuværende annonce. */
  async function loadSellerSoldCount(sellerId) {
    const badge = document.getElementById('seller-sold-count');
    if (!badge || !sellerId) return;
    try {
      const { count, error } = await supabase
        .from('bikes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sellerId)
        .eq('is_active', false);
      if (error || !count) { badge.textContent = ''; return; }
      if (count >= 5) {
        badge.innerHTML = `🏆 ${count} solgte cykler`;
        badge.style.color = '#2e7d32';
        badge.style.fontWeight = '600';
      } else {
        badge.innerHTML = `📦 ${count} solgt${count === 1 ? '' : 'e'} cykler`;
      }
    } catch (e) {
      badge.textContent = '';
    }
  }

  /* ============================================================
     RESPONSTID + SÆLGERS ANDRE ANNONCER + LIGNENDE ANNONCER
     ============================================================ */

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

  /* ── Beskrivelses-expand ── */

  function _initDescExpand() {
    const wrap = document.getElementById('bike-desc-wrap');
    const el   = document.getElementById('bike-desc-text');
    const btn  = document.getElementById('bike-desc-btn');
    if (!wrap || !el || !btn) return;
    requestAnimationFrame(() => {
      if (el.scrollHeight <= el.clientHeight + 4) {
        wrap.classList.remove('is-clamped');
        btn.style.display = 'none';
      }
    });
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
        const rawImg = bike.bike_images?.find(i => i.is_primary)?.url || bike.bike_images?.[0]?.url;
        const img = rawImg ? transformImageUrl(rawImg, { width: 300, quality: 75 }) : '';
        return `
          <div class="related-card" onclick="navigateToBike('${bike.id}')">
            <div class="related-card-img">
              ${rawImg ? `<img src="${img}" alt="${esc(bike.brand)} ${esc(bike.model)}" loading="lazy" decoding="async">` : '<span style="font-size:2rem">🚲</span>'}
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
        const rawImg = bike.bike_images?.find(i => i.is_primary)?.url || bike.bike_images?.[0]?.url;
        const img = rawImg ? transformImageUrl(rawImg, { width: 300, quality: 75 }) : '';
        return `
          <div class="related-card" onclick="navigateToBike('${bike.id}')">
            <div class="related-card-img">
              ${rawImg ? `<img src="${img}" alt="${esc(bike.brand)} ${esc(bike.model)}" loading="lazy" decoding="async">` : '<span style="font-size:2rem">🚲</span>'}
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

  /* ── Interesserede brugere (sælger-view) ── */

  async function loadInterestedUsers(bikeId) {
    const el = document.getElementById('interested-users-section');
    if (!el) return;

    const { data, error } = await supabase
      .from('saved_bikes')
      .select('user_id, created_at, profiles:user_id(id, name, avatar_url, city)')
      .eq('bike_id', bikeId)
      .order('created_at', { ascending: false });

    if (error) {
      el.innerHTML = '<p class="interested-empty">Kunne ikke hente interesserede.</p>';
      return;
    }
    if (!data || data.length === 0) {
      el.innerHTML = '<p class="interested-empty">Ingen har gemt denne annonce endnu.</p>';
      return;
    }

    el.innerHTML = `
      <p class="interested-count">${data.length} interesseret${data.length !== 1 ? 'e' : ''}</p>
      <div class="interested-list">
        ${data.map(row => {
          const p         = row.profiles || {};
          const name      = esc(p.name || 'Bruger');
          const safeName  = (p.name || 'Bruger').replace(/'/g, '');
          const initials  = getInitials(p.name);
          const avUrl     = safeAvatarUrl(p.avatar_url);
          const avContent = avUrl
            ? `<img src="${avUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : initials;
          const timeAgo   = formatLastSeen(row.created_at);
          return `
            <div class="interested-user-row">
              <div class="interested-avatar">${avContent}</div>
              <div class="interested-info">
                <span class="interested-name">${name}</span>
                <span class="interested-time">${timeAgo}</span>
              </div>
              <button class="interested-msg-btn" onclick="startConversationWithLiker('${bikeId}','${p.id}','${safeName}')">Send besked</button>
            </div>`;
        }).join('')}
      </div>`;
  }

  function startConversationWithLiker(bikeId, likerId, likerName) {
    // Luk bike-modal hvis åben
    const bikeModal = document.getElementById('bike-modal');
    if (bikeModal && bikeModal.classList.contains('open')) {
      bikeModal.classList.remove('open');
      document.body.style.overflow = '';
    }
    setPendingInboxThread({ bikeId, likerId, likerName });
    navigateTo('/inbox');
  }

  /* ── Rapporter annonce ── */

  function openReportModal(bikeId, bikeTitle) {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser) {
      showToast('⚠️ Du skal være logget ind for at rapportere en annonce');
      openLoginModal();
      return;
    }
    if (!currentUser.email_confirmed_at && !currentProfile?.email_verified) {
      showToast('⚠️ Bekræft din e-mail for at kunne rapportere annoncer');
      return;
    }
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
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser) {
      showToast('⚠️ Du skal være logget ind for at rapportere');
      closeReportModal();
      openLoginModal();
      return;
    }
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
    if (_bikeDetailMap) {
      try { _bikeDetailMap.remove(); } catch (e) {}
      _bikeDetailMap = null;
      _bikeDetailMapData = null;
    }
  }

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

  /* ── Fuldskærms lightbox med pinch-zoom og swipe ── */

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

  /* ── Meet-middle + bud/besked bokse ── */

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
    const currentUser = getCurrentUser();
    if (!currentUser) { openLoginModal(); return; }
    const box = document.getElementById('bid-box');
    const msgBox = document.getElementById('message-box');
    if (msgBox) msgBox.style.display = 'none';
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
    if (box.style.display === 'block') document.getElementById('bid-amount').focus();
  }

  function insertPresetMsg(text) {
    const box = document.getElementById('message-box');
    if (box && box.style.display !== 'block') toggleMessageBox();
    const ta = document.getElementById('message-text');
    if (ta) { ta.value = text; ta.focus(); ta.setSelectionRange(text.length, text.length); }
  }

  function toggleMessageBox() {
    const currentUser = getCurrentUser();
    if (!currentUser) { openLoginModal(); return; }
    const box = document.getElementById('message-box');
    const bidBox = document.getElementById('bid-box');
    if (bidBox) bidBox.style.display = 'none';
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
    if (box.style.display === 'block') document.getElementById('message-text').focus();
  }

  function stickyBarAction(kind) {
    const currentUser = getCurrentUser();
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

  async function sendMessage(bikeId, receiverId) {
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at sende beskeder'); return; }
    const content = document.getElementById('message-text').value.trim();
    if (!content) { showToast('⚠️ Skriv en besked først'); return; }

    // Vis anti-scam-advarsel første gang en bruger sender besked til en sælger
    const ack = await maybeShowScamWarning();
    if (!ack) return;

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
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at give bud'); return; }
    const amount = document.getElementById('bid-amount').value;
    if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) { showToast('⚠️ Indtast et gyldigt bud'); return; }

    // Vis anti-scam-advarsel første gang en bruger sender bud til en sælger
    const ack = await maybeShowScamWarning();
    if (!ack) return;

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
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser) { showToast('⚠️ Log ind for at gemme'); return; }
    const isSaved = btn.textContent.includes('❤️');
    if (isSaved) {
      await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
      btn.textContent = '🤍 Gem annonce';
    } else {
      const { data: bike } = await supabase.from('bikes').select('brand, model, user_id').eq('id', bikeId).single();
      if (bike && bike.user_id === currentUser.id) { showToast('⚠️ Du kan ikke gemme din egen annonce'); return; }
      await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
      btn.textContent = '❤️ Gemt';

      // Send email notification to bike owner (fire-and-forget)
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
     PRIS-DROP-ALERT — "Få besked ved prisfald"
     ============================================================
     Bruger watcher en specifik bike ved nuværende pris. Når
     sælgeren senere reducerer prisen, sender en edge function
     en email-notifikation til alle watchere.
     Unique-constraint på (user_id, bike_id) gør at insert/delete
     er en toggle. Knappens tilstand opdateres synkront. */
  async function togglePriceDropWatch(btn, bikeId, currentPrice) {
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at få prisfaldsbeskeder'); return; }
    const isWatching = btn.dataset.watching === '1';
    btn.disabled = true;
    try {
      if (isWatching) {
        const { error } = await supabase
          .from('price_drop_watches')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('bike_id', bikeId);
        if (error) { showToast('❌ Kunne ikke fjerne prisalarm'); return; }
        btn.dataset.watching = '0';
        btn.textContent = '🔔 Få besked ved prisfald';
        showToast('🔕 Prisalarm fjernet');
      } else {
        // Tjek at brugeren ikke watcher sin egen annonce
        const { data: bike } = await supabase.from('bikes').select('user_id').eq('id', bikeId).single();
        if (bike && bike.user_id === currentUser.id) { showToast('⚠️ Du kan ikke watche din egen annonce'); return; }
        const { error } = await supabase
          .from('price_drop_watches')
          .insert({
            user_id: currentUser.id,
            bike_id: bikeId,
            watched_at_price: currentPrice,
          });
        if (error) {
          if (error.code === '23505') {
            // Allerede watcher (race condition) — sæt knap til watching-state
            btn.dataset.watching = '1';
            btn.textContent = '🔔 Prisalarm aktiv';
          } else {
            showToast('❌ Kunne ikke oprette prisalarm');
          }
          return;
        }
        btn.dataset.watching = '1';
        btn.textContent = '🔔 Prisalarm aktiv';
        showToast(`🔔 Du får besked hvis prisen falder under ${currentPrice.toLocaleString('da-DK')} kr.`);
      }
    } finally {
      btn.disabled = false;
    }
  }

  /* Initialiser pris-drop-knap tilstand når bike-detail loader.
     Tjekker om brugeren allerede watcher denne bike og opdaterer knappens
     tekst + dataset.watching tilsvarende. */
  async function initPriceDropButton(bikeId) {
    const btn = document.getElementById(`price-drop-btn-${bikeId}`);
    if (!btn) return;
    const currentUser = getCurrentUser();
    if (!currentUser) {
      btn.dataset.watching = '0';
      return;
    }
    try {
      const { data } = await supabase
        .from('price_drop_watches')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('bike_id', bikeId)
        .maybeSingle();
      if (data) {
        btn.dataset.watching = '1';
        btn.textContent = '🔔 Prisalarm aktiv';
      } else {
        btn.dataset.watching = '0';
      }
    } catch (e) {
      btn.dataset.watching = '0';
    }
  }

  /* ============================================================
     INITIALISER LIGHTBOX GESTURES + KEYBOARD EVENTS
     Skal kaldes efter DOM er klar — eksporteret så main.js kan
     kalde det (eller kald initLightboxGestures() direkte herfra
     via DOMContentLoaded).
     ============================================================ */

  function setupLightboxEvents() {
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

    // Luk bike-modal ved klik på overlay
    const bikeModalEl = document.getElementById('bike-modal');
    if (bikeModalEl) {
      bikeModalEl.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeBikeModal();
      });
    }
  }

  /* ── Eksporter window-globals (kaldt fra HTML onclick) ── */
  function registerWindowExports() {
    window.showMyDistanceOnBikeMap    = showMyDistanceOnBikeMap;
    window.galleryNav                 = galleryNav;
    window.galleryGoto                = galleryGoto;
    window.openLightbox               = openLightbox;
    window.closeLightbox              = closeLightbox;
    window.lightboxNav                = lightboxNav;
    window.lightboxResetZoom          = lightboxResetZoom;
    window.stickyBarAction            = stickyBarAction;
    window.openBikeModal              = openBikeModal;
    window.renderBikePage             = renderBikePage;
    window.showDetailView             = showDetailView;
    window.showListingView            = showListingView;
    window.closeBikeModal             = closeBikeModal;
    window.openReportModal            = openReportModal;
    window.closeReportModal           = closeReportModal;
    window.submitReport               = submitReport;
    window.toggleBidBox               = toggleBidBox;
    window.updateMeetMiddle           = updateMeetMiddle;
    window.useMeetMiddle              = useMeetMiddle;
    window.toggleMessageBox           = toggleMessageBox;
    window.insertPresetMsg            = insertPresetMsg;
    window.sendMessage                = sendMessage;
    window.sendBid                    = sendBid;
    window.toggleSaveFromModal        = toggleSaveFromModal;
    window.togglePriceDropWatch       = togglePriceDropWatch;
    window.startConversationWithLiker = startConversationWithLiker;
  }

  return {
    // Core fetch + render
    fetchBikeById,
    buildBikeBodyHTML,
    // Modal
    openBikeModal,
    closeBikeModal,
    // Page routing
    renderBikePage,
    renderBikeSkeleton,
    // Layout switches (called by router and many other parts)
    showDetailView,
    showListingView,
    // Map
    initBikeDetailMap,
    _drawUserPositionOnBikeMap,
    showMyDistanceOnBikeMap,
    // Async loaders
    loadResponseTime,
    loadSellerOtherListings,
    loadSimilarListings,
    loadInterestedUsers,
    // Conversation starter
    startConversationWithLiker,
    // Report
    openReportModal,
    closeReportModal,
    submitReport,
    // Gallery
    galleryGoto,
    galleryNav,
    attachGallerySwipe,
    // Lightbox
    openLightbox,
    closeLightbox,
    lightboxShow,
    lightboxNav,
    lightboxResetZoom,
    lightboxApplyTransform,
    lightboxClampPan,
    initLightboxGestures,
    // Bid/message interaction
    updateMeetMiddle,
    useMeetMiddle,
    toggleBidBox,
    insertPresetMsg,
    toggleMessageBox,
    stickyBarAction,
    sendMessage,
    sendBid,
    toggleSaveFromModal,
    // Setup helpers (call once at boot)
    setupLightboxEvents,
    registerWindowExports,
  };
}
