/* ============================================================
   PROFIL SIDER — Factory: renderUserProfilePage, renderDealerProfilePage
   ============================================================ */

import {
  buildOpeningHoursDisplay, buildSocialLinksDisplay, buildServicesDisplay,
} from './dealer-extras.js';

export function createProfilePages({
  supabase,
  esc,
  safeAvatarUrl,
  getInitials,
  formatLastSeen,
  getUserSavedSet,
  getCurrentUser,
  updateSEOMeta,
  showDetailView,
  navigateTo,
  highlightStars,
  loadUserAchievements,
  followDealer,
}) {

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
    const currentUser = getCurrentUser();
    const safe = p => Promise.resolve(p).catch(e => ({ data: null, error: e }));
    const dataPromise = Promise.all([
      safe(supabase.from('profiles').select('id, name, shop_name, seller_type, city, address, verified, id_verified, email_verified, created_at, avatar_url, last_seen, bio, opening_hours, website, facebook, instagram, services').eq('id', userId).single()),
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
    const currentUser = getCurrentUser();
    const safe = p => Promise.resolve(p).catch(e => ({ data: null, error: e }));
    const [r1, r2, r3] = await Promise.race([
      Promise.all([
        safe(supabase.from('profiles').select('id, shop_name, name, city, address, verified, id_verified, email_verified, avatar_url, created_at, bio, last_seen, opening_hours, website, facebook, instagram, services').eq('id', dealerId).single()),
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

    let followerCount = 0;
    let isFollowing   = false;
    try {
      const { count } = await supabase
        .from('dealer_followers')
        .select('dealer_id', { count: 'exact', head: true })
        .eq('dealer_id', dealerId);
      followerCount = count || 0;
      if (currentUser) {
        const { data: f } = await supabase
          .from('dealer_followers')
          .select('dealer_id')
          .eq('user_id', currentUser.id)
          .eq('dealer_id', dealerId)
          .maybeSingle();
        isFollowing = !!f;
      }
    } catch { /* tabel kan mangle hvis SQL-migration ikke er kørt endnu */ }

    return { dealer: r1.data, bikes: r2.data || [], reviews: r3.data || [], messagesCount, followerCount, isFollowing };
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
        ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" width="400" height="300">`
        : '<span style="font-size:3.5rem">🚲</span>';
      return `
        <div class="bike-card" style="animation-delay:${i * 50}ms" onclick="navigateToBike('${b.id}')">
          <div class="bike-card-img">
            ${imgContent}
            <div class="bike-card-badges">
              <span class="condition-tag ${conditionClass(b.condition)}">${esc(b.condition)}</span>
            </div>
            <button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${getUserSavedSet().has(b.id) ? '❤️' : '🤍'}</button>
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
    const currentUser = getCurrentUser();
    const { profile, activeBikes, soldBikes, reviews, messagesCount } = data;
    const displayName  = profile.seller_type === 'dealer' ? (profile.shop_name || profile.name) : profile.name;
    const initials     = getInitials(displayName);
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
      const rInit = getInitials(rName);
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
    const currentUser = getCurrentUser();
    const { dealer, bikes, reviews, messagesCount, followerCount = 0, isFollowing = false } = data;
    const displayName  = dealer.shop_name || dealer.name || 'Forhandler';
    const initials     = getInitials(displayName);
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
      const rInit = getInitials(rName);
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

    const followBtnHtml = (!isOwnProfile && followDealer)
      ? followDealer.buildFollowButton(dealer.id, isFollowing)
      : '';

    const contactHtml = (!isOwnProfile && currentUser && nActive > 0) ? `
      <div class="pp-cta-section">
        <div class="pp-cta-row">
          <button class="pp-cta-btn" onclick="toggleProfileContact()">Kontakt forhandler</button>
          ${followBtnHtml}
        </div>
        <div class="up-contact-form" id="up-contact-form" style="display:none;">
          ${nActive > 1 ? `
          <select class="up-contact-bike-select" id="up-contact-bike-select">
            ${bikes.map(b => `<option value="${b.id}">${esc(b.brand)} ${esc(b.model)} – ${b.price.toLocaleString('da-DK')} kr.</option>`).join('')}
          </select>` : `<input type="hidden" id="up-contact-bike-select" value="${bikes[0].id}">`}
          <textarea id="up-contact-message" class="up-review-textarea" placeholder="Skriv en besked til ${esc(displayName)}..." rows="3"></textarea>
          <button class="up-contact-send-btn" onclick="sendProfileMessage('${dealer.id}')">Send besked</button>
        </div>
      </div>` : (!isOwnProfile && followBtnHtml) ? `<div class="pp-cta-section"><div class="pp-cta-row">${followBtnHtml}</div></div>` : '';

    const openingHtml = buildOpeningHoursDisplay(dealer.opening_hours);
    const socialHtml  = buildSocialLinksDisplay({
      website:   dealer.website,
      facebook:  dealer.facebook,
      instagram: dealer.instagram,
    });
    const servicesHtml = buildServicesDisplay(dealer.services);
    const followerHtml = followerCount > 0
      ? `<span class="pp-follower-count">${followerCount} ${followerCount === 1 ? 'følger' : 'følgere'}</span>`
      : '';

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
              ${followerHtml}
            </div>
            ${dealer.city ? `
              <div class="pp-location">
                📍 ${esc(dealer.address ? dealer.address + ', ' : '')}${esc(dealer.city)}
                <a class="pp-maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((dealer.address ? dealer.address + ', ' : '') + dealer.city)}" target="_blank" rel="noopener noreferrer" title="Åbn i Google Maps">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Åbn i Google Maps
                </a>
              </div>` : ''}
            ${openingHtml}
            ${dealer.bio ? `<p class="pp-bio">${esc(dealer.bio)}</p>` : ''}
            ${servicesHtml}
            ${socialHtml}
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

  return {
    renderProfileSkeleton,
    fetchUserProfileData,
    fetchDealerProfileData,
    buildProfileBikeCards,
    starsHTML,
    buildUserProfilePageHTML,
    buildDealerProfilePageHTML,
    renderUserProfilePage,
    renderDealerProfilePage,
    navigateToProfile,
    navigateToDealer,
  };
}
