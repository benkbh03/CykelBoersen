// Byer der dækker flere kommuner/distrikter under samme søgeord
const CITY_GROUPS = {
  'København': [
    'København', 'Frederiksberg', 'Gentofte', 'Hellerup', 'Charlottenlund',
    'Klampenborg', 'Gladsaxe', 'Søborg', 'Lyngby', 'Herlev', 'Rødovre',
    'Hvidovre', 'Brøndby', 'Glostrup', 'Albertslund', 'Tårnby', 'Kastrup',
    'Dragør', 'Vallensbæk', 'Ishøj', 'Taastrup', 'Ballerup', 'Birkerød',
  ],
  'Aarhus': [
    'Aarhus', 'Brabrand', 'Viby', 'Højbjerg', 'Risskov', 'Lystrup',
    'Tilst', 'Skejby', 'Tranbjerg', 'Malling', 'Beder', 'Egå',
  ],
  'Odense': [
    'Odense', 'Bellinge', 'Tarup', 'Hjallese', 'Dalum', 'Sanderum', 'Seden',
  ],
  'Aalborg': [
    'Aalborg', 'Nørresundby', 'Svenstrup', 'Vejgaard', 'Frejlev', 'Gistrup',
  ],
};

export function createBikesList({
  supabase,
  BIKES_PAGE_SIZE,
  esc,
  safeAvatarUrl,
  getInitials,
  formatLastSeen,
  retryHTML,
  // Collaborator functions
  updateActiveFiltersBar,
  updateCykelagentCta,
  applyNearMeFilter,
  hasActiveFilters,
  describeActiveFilters,
  // State accessors
  getBikesOffset,
  setBikesOffset,
  getFilterOffset,
  setFilterOffset,
  getCurrentFilters,
  setCurrentFilters,
  setCurrentFilterArgs,
  getCurrentUser,
  getUserGeoCoords,
  getActiveRadius,
  userSavedSet,        // Set reference (mutated)
  askedAvailableSet,   // Set reference (read)
}) {
  async function loadBikes(filters = {}, append = false) {
    const grid = document.getElementById('listings-grid');

    if (!append) {
      setBikesOffset(0);
      setCurrentFilters(filters);
      grid.innerHTML = Array(6).fill(`
        <div class="bike-card skeleton-card">
          <div class="skeleton-img"></div>
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-line--title"></div>
            <div class="skeleton-line skeleton-line--sub"></div>
            <div class="skeleton-line skeleton-line--price"></div>
          </div>
        </div>`).join('');
      const old = document.getElementById('load-more-btn');
      if (old) old.remove();
    }

    const offset = getBikesOffset();
    let query = supabase
      .from('bikes')
      .select('id, brand, model, price, type, city, condition, year, size, size_cm, color, colors, warranty, is_active, created_at, user_id, profiles(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, address, last_seen), bike_images(url, is_primary)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + BIKES_PAGE_SIZE - 1);

    if (filters.type)       query = query.eq('type', filters.type);
    if (filters.city) {
      const group = CITY_GROUPS[filters.city];
      if (group) {
        query = query.or(group.map(c => `city.ilike.%${c}%`).join(','));
      } else {
        query = query.ilike('city', `%${filters.city}%`);
      }
    }
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

    const data = filters.sellerType
      ? rawData.filter(b => b.profiles?.seller_type === filters.sellerType)
      : rawData;

    const bikeIds = data.map(b => b.id);
    let saveCounts = {};
    let localUserSavedSet = new Set();
    if (bikeIds.length > 0) {
      const { data: countData } = await supabase
        .from('saved_bikes')
        .select('bike_id, user_id')
        .in('bike_id', bikeIds);
      if (countData) {
        const currentUser = getCurrentUser();
        countData.forEach(row => {
          saveCounts[row.bike_id] = (saveCounts[row.bike_id] || 0) + 1;
          if (currentUser && row.user_id === currentUser.id) {
            localUserSavedSet.add(row.bike_id);
            userSavedSet.add(row.bike_id);
          }
        });
      }
    }

    renderBikes(data, append, saveCounts, localUserSavedSet);
    updateActiveFiltersBar();
    updateCykelagentCta();

    setBikesOffset(getBikesOffset() + data.length);

    const existing = document.getElementById('load-more-btn');
    if (existing) existing.remove();

    const footer = document.createElement('div');
    footer.id = 'load-more-btn';
    if (data.length === BIKES_PAGE_SIZE) {
      footer.innerHTML = `<button onclick="loadBikes(currentFilters, true)" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Vis flere cykler</button>`;
    } else if (append && getBikesOffset() > BIKES_PAGE_SIZE) {
      footer.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
    } else {
      return;
    }
    grid.after(footer);
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

  function renderBikes(bikes, append = false, saveCounts = {}, localUserSavedSet = new Set()) {
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

    const currentUser = getCurrentUser();

    const html = bikes.map((b, i) => {
      const profile    = b.profiles || {};
      const sellerType = profile.seller_type || 'private';
      const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
      const initials   = getInitials(sellerName);
      const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
      const imgContent = primaryImg
        ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" width="400" height="300">`
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
      const lastSeenCard = formatLastSeen(profile.last_seen);
      return `
        <div class="bike-card"${cityAttr}${addrAttr}${sellerAttr} style="animation-delay:${(startIndex + i) * 50}ms;${isSold ? 'opacity:0.7' : ''}" onclick="${isSold ? '' : "navigateToBike('" + b.id + "')"}">
          <div class="bike-card-img">
            ${imgContent}
            ${isSold ? '<div class="sold-tag"><span>SOLGT</span></div>' : ''}
            <div class="bike-card-badges">
              <span class="condition-tag ${conditionClass(b.condition)}">${esc(b.condition)}</span>
              ${b.warranty && !isSold ? '<span class="warranty-card-badge">🛡️ Garanti</span>' : ''}
            </div>
            ${saveCount > 0 ? `<span class="fav-count-badge">❤ ${saveCount}</span>` : ''}
            ${!isSold ? `<button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">${localUserSavedSet.has(b.id) ? '❤️' : '🤍'}</button>` : ''}
            ${!isSold && b.profiles?.id !== currentUser?.id ? `<button class="ask-available-btn${askedAvailableSet.has(b.id) ? ' asked' : ''}" onclick="event.stopPropagation();askIfAvailable('${b.id}','${b.user_id}',this)" title="Er den stadig til salg?">${askedAvailableSet.has(b.id) ? '✅' : '💬'}</button>` : ''}
          </div>
          <div class="bike-card-body">
            <div class="card-top">
              <div class="bike-title">${esc(b.brand)} ${esc(b.model)}</div>
              <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
            </div>
            <div class="bike-meta">
              <span>${esc(b.type)}</span><span>${b.year || '–'}</span>${b.size || b.size_cm ? `<span>Str. ${b.size_cm ? b.size_cm + ' cm' : esc(b.size)}</span>` : ''}
            </div>
            <div class="card-footer">
              <div class="seller-avatar">${avatarHtml}</div>
              <div class="card-seller-details">
                <div class="card-seller-top">
                  <span class="seller-name">${esc(sellerName) || 'Ukendt'}${profile.verified ? ' <span class="verified-badge" title="Verificeret forhandler">✓</span>' : ''}</span>
                  <span class="badge ${sellerType === 'dealer' ? (profile.verified ? 'badge-dealer badge-dealer-verified' : 'badge-dealer') : 'badge-private'}">${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}</span>
                  ${profile.id_verified ? '<span class="trust-chip">✓ ID</span>' : ''}
                </div>
                <div class="card-seller-bottom">
                  <span class="card-location">📍 <span class="bike-city">${esc(b.city)}</span></span>
                  ${lastSeenCard ? `<span class="card-last-seen">${lastSeenCard}</span>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    if (append) {
      grid.insertAdjacentHTML('beforeend', html);
    } else {
      grid.innerHTML = html;
    }

    if (getUserGeoCoords() && getActiveRadius()) applyNearMeFilter();
  }

  function searchBikes() {
    const search = document.getElementById('search-input').value;
    const type   = document.getElementById('search-type').value;
    const city   = document.getElementById('search-city').value;
    loadBikes({ search, type, city });
  }

  async function loadBikesWithFilters({ types = [], conditions = [], minPrice, maxPrice, sellerType, dealerId, wheelSizes = [], sizes = [], colors = [], brands = [] } = {}, append = false) {
    const grid = document.getElementById('listings-grid');

    if (!append) {
      setFilterOffset(0);
      setCurrentFilterArgs({ types, conditions, minPrice, maxPrice, sellerType, dealerId, wheelSizes, sizes, colors, brands });
      grid.innerHTML    = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';
      const old = document.getElementById('load-more-btn');
      if (old) old.remove();
    }

    const offset = getFilterOffset();
    let query = supabase
      .from('bikes')
      .select('id, brand, model, price, type, city, condition, year, size, size_cm, color, colors, warranty, is_active, created_at, user_id, profiles(name, seller_type, shop_name, verified, id_verified, email_verified, avatar_url, address, last_seen), bike_images(url, is_primary)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + BIKES_PAGE_SIZE - 1);

    if (types.length > 0)      query = query.in('type', types);
    if (conditions.length > 0) query = query.in('condition', conditions);
    if (sizes.length > 0)      query = query.in('size', sizes);
    if (colors.length > 0)     query = query.overlaps('colors', colors);
    if (minPrice)              query = query.gte('price', minPrice);
    if (maxPrice)              query = query.lte('price', maxPrice);
    if (dealerId)              query = query.eq('user_id', dealerId);
    if (wheelSizes.length > 0) query = query.in('wheel_size', wheelSizes);
    if (sellerType && !dealerId) query = query.eq('profiles.seller_type', sellerType);
    if (brands.length > 0) {
      const hasAndre = brands.includes('Andre');
      const specificBrands = brands.filter(b => b !== 'Andre');
      if (hasAndre && specificBrands.length > 0) {
        const knownBrands = ['Avenue','Batavus','Bergamont','Bianchi','Bike by Gubi','BMC','Cannondale','Carqon','Centurion','Cervélo','Cube','Diverse','E-Fly','Everton','FACTOR','Focus','Frogbikes','Gazelle','Giant','Kalkhoff','Kildemoes','Koga','Kreidler','Lapierre','LOOK','MBK','Momentum','Motobecane','Moustache','Nishiki','Norden','Pinarello','Principia','Puky','Qio','Raleigh','Ridley','Scott','Silverback','Sparta','Specialized','Superior','Trek','uVelo','Winther','Woom','YWS'];
        query = query.or(`brand.in.(${specificBrands.map(b=>`"${b}"`).join(',')}),brand.not.in.(${knownBrands.map(b=>`"${b}"`).join(',')})`);
      } else if (hasAndre) {
        const knownBrands = ['Avenue','Batavus','Bergamont','Bianchi','Bike by Gubi','BMC','Cannondale','Carqon','Centurion','Cervélo','Cube','Diverse','E-Fly','Everton','FACTOR','Focus','Frogbikes','Gazelle','Giant','Kalkhoff','Kildemoes','Koga','Kreidler','Lapierre','LOOK','MBK','Momentum','Motobecane','Moustache','Nishiki','Norden','Pinarello','Principia','Puky','Qio','Raleigh','Ridley','Scott','Silverback','Sparta','Specialized','Superior','Trek','uVelo','Winther','Woom','YWS'];
        query = query.not('brand', 'in', `(${knownBrands.map(b=>`"${b}"`).join(',')})`);
      } else {
        query = query.in('brand', specificBrands);
      }
    }

    const { data, error } = await query;
    if (error) {
      grid.innerHTML = retryHTML('Kunne ikke hente annoncer.', 'applyFilters');
      return;
    }

    renderBikes(data || [], append);
    updateActiveFiltersBar();
    updateCykelagentCta();
    setFilterOffset(getFilterOffset() + (data || []).length);

    const existing = document.getElementById('load-more-btn');
    if (existing) existing.remove();

    if ((data || []).length === BIKES_PAGE_SIZE) {
      const btn = document.createElement('div');
      btn.id = 'load-more-btn';
      btn.innerHTML = `<button onclick="loadMoreFilteredBikes()" style="display:block;margin:24px auto;padding:12px 32px;background:var(--forest);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Vis flere cykler</button>`;
      grid.after(btn);
    } else if (append && getFilterOffset() > BIKES_PAGE_SIZE) {
      const msg = document.createElement('div');
      msg.id = 'load-more-btn';
      msg.innerHTML = `<p style="text-align:center;color:var(--muted);padding:16px 0 24px;font-size:0.9rem;">Ingen flere cykler at vise</p>`;
      grid.after(msg);
    }
  }

  return {
    loadBikes,
    renderBikes,
    renderListingsEmptyState,
    searchBikes,
    loadBikesWithFilters,
  };
}
