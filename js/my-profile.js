export function createMyProfile({
  supabase,
  esc,
  retryHTML,
  showToast,
  // State
  getCurrentUser,
  getCurrentFilters,
  getCurrentFilterArgs,
  // Collaborators
  loadBikes,
  updateFilterCounts,
  searchBikes,
  closeProfileModal,
}) {
  function reloadMyListings() {
    if (document.getElementById('mp-listings-grid')) loadMyListings('mp-listings-grid');
    else loadMyListings();
  }

  async function loadMyListings(containerId = 'my-listings-grid') {
    const currentUser = getCurrentUser();
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

    const statEl = document.getElementById('mp-stat-active');
    if (statEl) statEl.textContent = data ? data.filter(b => b.is_active).length : 0;
    const countEl = document.getElementById('mp-count-listings');
    if (countEl) countEl.textContent = data ? data.length : 0;

    if (error || !data || data.length === 0) {
      grid.innerHTML = `<div class="empty-state-box">
        <div class="empty-state-icon">🚲</div>
        <h3 class="empty-state-title">Ingen annoncer endnu</h3>
        <p class="empty-state-sub">Sæt din første cykel til salg — det tager under 2 minutter.</p>
        <button class="empty-state-cta" onclick="openModal()">+ Sæt til salg</button>
      </div>`;
      return;
    }

    const isPage = containerId === 'mp-listings-grid';

    try {
      grid.innerHTML = data.map(b => {
        const isSold = !b.is_active;
        const views  = b.views || 0;
        const daysOld = b.created_at ? Math.floor((Date.now() - new Date(b.created_at)) / 86400000) : 0;
        const isOld  = !isSold && daysOld >= 30;

        if (isPage) {
          const imgUrl = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url || '';
          const statusLabel = isSold ? 'Solgt' : isOld ? `${daysOld}d gammel` : 'Aktiv';
          const statusClass = isSold ? 'mp-status--sold' : isOld ? 'mp-status--old' : 'mp-status--active';
          const priceStr = (b.price || 0).toLocaleString('da-DK') + ' kr.';
          const svgEye    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S6 4.5 12 4.5 22.5 12 22.5 12 18 19.5 12 19.5 1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;
          const svgEditSm = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14 4l6 6-11 11H3v-6L14 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
          return `
            <div class="mp-listing-card${isSold ? ' mp-listing-card--sold' : ''}">
              <div class="mp-listing-img-wrap" onclick="navigateTo('/bike/${b.id}')" title="Se annonce">
                ${imgUrl
                  ? `<img src="${imgUrl}" alt="" class="mp-listing-thumb" loading="lazy">`
                  : `<div class="mp-listing-thumb--empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M6 17l4-8h6l2 8m-8-8h-2m4 0l-2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
                <span class="mp-status-badge ${statusClass}">${statusLabel}</span>
              </div>
              <div class="mp-listing-body" onclick="navigateTo('/bike/${b.id}')" title="Se annonce">
                <div class="mp-listing-title">${esc(b.brand)} ${esc(b.model)}</div>
                <div class="mp-listing-meta">${esc(b.type)} · ${esc(b.city)} · ${esc(b.condition)}</div>
                <div class="mp-listing-stats-row">
                  <span class="mp-listing-stat">${svgEye} ${views.toLocaleString('da-DK')} visninger</span>
                </div>
                <div class="mp-listing-price mp-price-mobile">${priceStr}</div>
              </div>
              <div class="mp-listing-aside">
                <div class="mp-listing-price">${priceStr}</div>
                <div class="mp-listing-actions">
                  <button class="mp-btn-view"   onclick="navigateTo('/bike/${b.id}')">${svgEye} Se</button>
                  <button class="mp-btn-edit"   onclick="openEditModal('${b.id}')">${svgEditSm} Redigér</button>
                  ${!isSold
                    ? `<button class="mp-btn-sold"   onclick="toggleSold('${b.id}', false)">Sæt solgt</button>`
                    : `<button class="mp-btn-unsold" onclick="toggleSold('${b.id}', true)">Genaktiver</button>`}
                  <button class="mp-btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
                </div>
              </div>
              <div class="mp-listing-actions-mobile">
                <button class="mp-btn-view"   onclick="navigateTo('/bike/${b.id}')">${svgEye} Se</button>
                <button class="mp-btn-edit"   onclick="openEditModal('${b.id}')">${svgEditSm} Redigér</button>
                ${!isSold
                  ? `<button class="mp-btn-sold" onclick="toggleSold('${b.id}', false)">Solgt</button>`
                  : `<button class="mp-btn-unsold" onclick="toggleSold('${b.id}', true)">Genaktiver</button>`}
              </div>
            </div>`;
        }

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
    const currentUser = getCurrentUser();
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
    const savedCount = document.getElementById('mp-count-saved');
    if (savedCount) savedCount.textContent = data ? data.length : 0;

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
    const currentUser = getCurrentUser();
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

  async function notifySavedSearches(newBike) {
    try {
      const { data: full } = await supabase
        .from('bikes')
        .select('id, brand, model, type, city, price, condition, wheel_size, warranty, year, size, colors, profiles(seller_type), bike_images(url, is_primary)')
        .eq('id', newBike.id)
        .single();
      if (!full) return;
      const primaryImage = full.bike_images?.find(i => i.is_primary)?.url || full.bike_images?.[0]?.url || null;
      supabase.functions.invoke('notify-saved-searches', {
        body: {
          bike: {
            id:          full.id,
            user_id:     newBike.user_id || null,
            brand:       full.brand,
            model:       full.model,
            type:        full.type,
            city:        full.city,
            price:       full.price,
            condition:   full.condition,
            wheel_size:  full.wheel_size,
            warranty:    full.warranty,
            year:        full.year,
            size:        full.size,
            colors:      full.colors,
            seller_type: full.profiles?.seller_type || 'private',
            image:       primaryImage,
          },
        },
      }).catch(() => {});
    } catch (_) { /* silent */ }
  }

  async function saveCurrentSearch() {
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at oprette en Cykelagent'); return; }

    const search = document.getElementById('search-input').value.trim();
    const type   = document.getElementById('search-type').value;
    const city   = document.getElementById('search-city').value;

    const fa       = getCurrentFilterArgs() || {};
    const cf       = getCurrentFilters() || {};
    const warranty = !!cf.warranty;
    const hasFilters = search || type || city
      || (fa.types?.length > 0)
      || (fa.conditions?.length > 0)
      || fa.minPrice || fa.maxPrice
      || fa.sellerType
      || (fa.wheelSizes?.length > 0)
      || (fa.sizes?.length > 0)
      || (fa.colors?.length > 0)
      || warranty;

    if (!hasFilters) { showToast('⚠️ Ingen aktive filtre at gemme'); return; }

    const parts = [];
    if (search)                    parts.push(search);
    if (type)                      parts.push(type);
    if (fa.types?.length)          parts.push(...fa.types);
    if (fa.sellerType === 'dealer')  parts.push('Forhandlere');
    if (fa.sellerType === 'private') parts.push('Private');
    if (fa.conditions?.length)     parts.push(...fa.conditions);
    if (fa.wheelSizes?.length)     parts.push(...fa.wheelSizes.map(w => 'Hjul ' + w));
    if (fa.sizes?.length)          parts.push(...fa.sizes.map(s => 'Str. ' + s.split(' ')[0]));
    if (fa.colors?.length)         parts.push(...fa.colors);
    if (warranty)                  parts.push('Med garanti');
    if (fa.minPrice)               parts.push(`over ${fa.minPrice.toLocaleString('da-DK')} kr.`);
    if (fa.maxPrice)               parts.push(`under ${fa.maxPrice.toLocaleString('da-DK')} kr.`);
    if (city)                      parts.push(city);
    const name = parts.join(' · ') || 'Min søgning';

    const { error } = await supabase.from('saved_searches').insert({
      user_id: currentUser.id,
      name,
      filters: { search, type, city, warranty, ...fa },
    });

    if (error) { showToast('❌ Kunne ikke oprette Cykelagent'); return; }
    showToast('🔔 Cykelagent oprettet! Du får besked på e-mail når nye cykler matcher.');

    const btn = document.getElementById('save-search-btn');
    if (btn) { btn.style.color = 'var(--rust)'; btn.style.borderColor = 'var(--rust)'; setTimeout(() => { btn.style.color = ''; btn.style.borderColor = ''; }, 2000); }
  }

  async function loadSavedSearches(containerId = 'my-searches-list') {
    const currentUser = getCurrentUser();
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
      list.innerHTML = retryHTML('Kunne ikke hente Cykelagenter.', 'loadSavedSearches');
      return;
    }

    if (error) { list.innerHTML = retryHTML('Kunne ikke hente Cykelagenter.', 'loadSavedSearches'); return; }
    const searchCountEl = document.getElementById('mp-count-searches');
    if (searchCountEl) searchCountEl.textContent = data ? data.length : 0;
    if (!data || data.length === 0) {
      list.innerHTML = `<p style="color:var(--muted)">Ingen Cykelagenter endnu. Brug knappen ovenfor for at oprette din første.</p>`;
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

    const inp  = document.getElementById('search-input');
    const type = document.getElementById('search-type');
    const city = document.getElementById('search-city');
    if (inp)  inp.value  = f.search || '';
    if (type) type.value = f.type   || '';
    if (city) city.value = f.city   || '';

    closeProfileModal();
    searchBikes();
    showToast('🔍 Søgning genaktiveret');
  }

  async function deleteSavedSearch(id, btn) {
    const currentUser = getCurrentUser();
    const { error } = await supabase.from('saved_searches').delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) { showToast('❌ Kunne ikke slette søgning'); return; }
    btn.closest('.my-listing-row').remove();
    showToast('Søgning slettet');
    const list = document.getElementById('my-searches-list');
    if (list && !list.querySelector('.my-listing-row')) {
      list.innerHTML = `<p style="color:var(--muted)">Ingen Cykelagenter endnu.</p>`;
    }
  }

  async function loadTradeHistory(containerId = 'trade-history-list') {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const list = document.getElementById(containerId);

    try {
      const { data: tradeMessages, error } = await supabase
        .from('messages')
        .select('id, bike_id, sender_id, receiver_id, content, created_at')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .ilike('content', '%accepteret%')
        .order('created_at', { ascending: false });

      if (error) { list.innerHTML = retryHTML('Kunne ikke hente handelshistorik.', 'loadTradeHistory'); return; }
      const tradesStat = document.getElementById('mp-stat-trades');
      const tradesCount = new Set(tradeMessages ? tradeMessages.map(m => m.bike_id) : []).size;
      if (tradesStat) tradesStat.textContent = tradesCount;
      const tradesCountEl = document.getElementById('mp-count-trades');
      if (tradesCountEl) tradesCountEl.textContent = tradesCount;
      if (!tradeMessages || tradeMessages.length === 0) {
        list.innerHTML = '<p style="color:var(--muted)">Ingen gennemførte handler endnu.</p>';
        return;
      }

      const seen = new Set();
      const uniqueTrades = tradeMessages.filter(m => {
        if (seen.has(m.bike_id)) return false;
        seen.add(m.bike_id);
        return true;
      });

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

  return {
    reloadMyListings,
    loadMyListings,
    deleteListing,
    loadSavedListings,
    removeSaved,
    notifySavedSearches,
    saveCurrentSearch,
    loadSavedSearches,
    applySavedSearch,
    deleteSavedSearch,
    loadTradeHistory,
  };
}
