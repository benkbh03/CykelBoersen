export function createProfileModals({
  supabase,
  esc,
  safeAvatarUrl,
  getInitials,
  formatLastSeen,
  retryHTML,
  showToast,
  // State
  getCurrentUser,
  userSavedSet, // Set reference (read)
  // Collaborators
  closeAllDealersModal,
  closeAllModals,
  highlightStars,
}) {
  let userProfileToken = 0;
  let dealerProfileToken = 0;

  function filterByDealerCard(dealerId) {
    openDealerProfile(dealerId);
  }

  async function openDealerProfile(dealerId) {
    const myToken = ++dealerProfileToken;
    closeAllDealersModal();
    const modal = document.getElementById('dealer-profile-modal');
    const header = document.getElementById('dealer-profile-header');
    const bikesGrid = document.getElementById('dealer-profile-bikes');
    if (!modal) return;

    header.innerHTML = '<p style="color:var(--muted);padding:20px 0">Henter forhandler...</p>';
    bikesGrid.innerHTML = '';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

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

    if (myToken !== dealerProfileToken) return;

    if (!dealer) {
      header.innerHTML = retryHTML('Kunne ikke hente forhandler.', `() => openDealerProfile('${dealerId}')`);
      return;
    }

    const displayName = dealer.shop_name || dealer.name || 'Forhandler';
    const initials    = getInitials(displayName);
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

    if (myToken !== dealerProfileToken) return;

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
      const sellerName = profile.shop_name || profile.name || displayName;
      const avatarInit = getInitials(sellerName);
      const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
      const imgContent = primaryImg
        ? `<img src="${primaryImg}" alt="${b.brand} ${b.model}" loading="lazy" width="400" height="300" style="width:100%;height:100%;object-fit:cover;">`
        : '<span style="font-size:4rem">🚲</span>';
      return `
        <div class="bike-card" style="animation-delay:${i * 50}ms" onclick="navigateToBike('${b.id}')">
          <div class="bike-card-img">
            ${imgContent}
            <div class="bike-card-badges">
              <span class="condition-tag">${b.condition}</span>
            </div>
            <button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${userSavedSet.has(b.id) ? '❤️' : '🤍'}</button>
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

  async function openUserProfileWithReview(userId) {
    await openUserProfile(userId);
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
    const myToken = ++userProfileToken;
    closeAllModals();
    const modal   = document.getElementById('user-profile-modal');
    const content = document.getElementById('user-profile-content');
    if (!modal || !content) { console.error('user-profile-modal eller user-profile-content ikke fundet i DOM'); return; }
    content.innerHTML = '<p style="color:var(--muted);padding:60px 0;text-align:center;">Henter profil...</p>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const currentUser = getCurrentUser();
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
        const { data: tradeMsg } = await safe(
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

    if (myToken !== userProfileToken) return;

    if (!profile) {
      content.innerHTML = retryHTML('Kunne ikke hente profil.', `() => openUserProfile('${userId}')`);
      return;
    }

    const displayName  = profile.seller_type === 'dealer' ? (profile.shop_name || profile.name) : profile.name;
    const initials     = getInitials(displayName);
    const isDealer     = profile.seller_type === 'dealer';
    const memberYear   = profile.created_at ? new Date(profile.created_at).getFullYear() : null;
    const isOwnProfile = currentUser && currentUser.id === userId;
    const lastSeenText = !isOwnProfile ? formatLastSeen(profile.last_seen) : null;

    const reviewList   = reviews || [];
    const avgRating    = reviewList.length ? (reviewList.reduce((s, r) => s + r.rating, 0) / reviewList.length) : null;
    const hasReviewed  = currentUser && reviewList.some(r => r.reviewer_id === currentUser.id);
    const hasTraded    = currentUser && messagesCount > 0;

    function stars(n) {
      return [1,2,3,4,5].map(i => `<span class="star${i <= Math.round(n) ? ' filled' : ''}">★</span>`).join('');
    }

    const activeBikeCards = (activeBikes || []).map((b, i) => {
      const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
      const imgContent = primaryImg
        ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" width="400" height="300" style="width:100%;height:100%;object-fit:cover;">`
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

    const soldRows = (soldBikes || []).map(b => `
      <div class="up-sold-row">
        <div class="up-sold-info">
          <span class="up-sold-title">${esc(b.brand)} ${esc(b.model)}</span>
          <span class="up-sold-meta">${esc(b.type)} · ${esc(b.condition)}${b.year ? ' · ' + b.year : ''}</span>
        </div>
        <div class="up-sold-price">${b.price.toLocaleString('da-DK')} kr. <span class="sold-chip">Solgt</span></div>
      </div>`).join('') || `<p class="up-empty">Ingen solgte cykler endnu.</p>`;

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
              <div class="up-review-stars">${stars(r.rating)}</div>
            </div>
            <div class="up-review-date">${date}</div>
          </div>
          ${r.comment ? `<p class="up-review-comment">${esc(r.comment)}</p>` : ''}
        </div>`;
    }).join('') || `<p class="up-empty">Ingen vurderinger endnu.</p>`;

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

      <div class="up-tabs">
        <button class="up-tab active" data-tab="listings" onclick="switchUserProfileTab('listings')">Til salg (${nActive})</button>
        <button class="up-tab" data-tab="sold" onclick="switchUserProfileTab('sold')">Solgt (${nSold})</button>
        <button class="up-tab" data-tab="reviews" onclick="switchUserProfileTab('reviews')">Vurderinger${avgRating !== null ? ` ${avgRating.toFixed(1)} ★` : ` (${nReviews})`}</button>
      </div>

      <div id="up-tab-listings" class="up-tab-panel">
        <div class="up-bikes-grid">${activeBikeCards}</div>
      </div>

      <div id="up-tab-sold" class="up-tab-panel" style="display:none;">
        <div class="up-sold-list">${soldRows}</div>
      </div>

      <div id="up-tab-reviews" class="up-tab-panel" style="display:none;">
        <div class="up-reviews-list">${reviewCards}</div>
        ${writeReviewHtml}
      </div>
    `;

    document.querySelectorAll('.star-pick').forEach(s => {
      s.addEventListener('mouseover', () => highlightStars(+s.dataset.val));
      s.addEventListener('mouseout',  () => highlightStars(window._pickedStar || 0));
    });
    window._pickedStar = 0;

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
    const currentUser = getCurrentUser();
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

      if (numActive >= 3) badges.push({ icon: '📦', label: 'Uploader ofte', title: '3+ aktive annoncer' });

      if (numSold >= 5) badges.push({ icon: '🏆', label: 'Erfaren sælger', title: '5+ solgte cykler' });
      else if (numSold >= 1) badges.push({ icon: '🤝', label: 'Har solgt', title: `${numSold} gennemført${numSold === 1 ? '' : 'e'} salg` });

      if (reviewList.length >= 3 && avgRating >= 4.5) badges.push({ icon: '⭐', label: 'Topvurderet', title: `${avgRating.toFixed(1)} gns. fra ${reviewList.length} vurderinger` });

      if (profile.email_verified) badges.push({ icon: '✉️', label: 'E-mail verificeret', title: 'Har verificeret sin e-mail' });

      if (profile.created_at) {
        const ageMonths = (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (ageMonths >= 12) badges.push({ icon: '🎖️', label: 'Veteranmedlem', title: 'Medlem i 1+ år' });
      }

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

  function closeUserProfileModal() {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    window._pickedStar = 0;
  }

  return {
    filterByDealerCard,
    openDealerProfile,
    closeDealerProfileModal,
    openUserProfileWithReview,
    openUserProfile,
    switchUserProfileTab,
    switchDealerProfileTab,
    toggleProfileContact,
    sendProfileMessage,
    loadUserAchievements,
    closeUserProfileModal,
  };
}
