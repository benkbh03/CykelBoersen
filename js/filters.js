export function createFilters({
  supabase,
  showToast,
  esc,
  haversineKm,
  formatDistanceKm,
  geocodeAddress,
  geocodeCity,
  loadBikes,
  applyFilters,
  // State accessors (shared with main.js)
  getCurrentFilters,
  setCurrentFilters,
  getCurrentFilterArgs,
  setCurrentFilterArgs,
  getUserGeoCoords,
  setUserGeoCoords,
  getActiveRadius,
  setActiveRadius,
}) {
  function hasActiveFilters() {
    const cf = getCurrentFilters();
    const args = getCurrentFilterArgs();
    const filtersSet = cf && Object.keys(cf).some(k => {
      const v = cf[k];
      return v !== null && v !== undefined && v !== '' && v !== false;
    });
    const filterArgsSet = args && (
      (args.types && args.types.length > 0) ||
      (args.conditions && args.conditions.length > 0) ||
      (args.wheelSizes && args.wheelSizes.length > 0) ||
      (args.colors && args.colors.length > 0) ||
      (args.brands && args.brands.length > 0) ||
      args.minPrice ||
      args.maxPrice ||
      args.maxWeight ||
      args.sellerType
    );
    return !!(filtersSet || filterArgsSet);
  }

  function describeActiveFilters() {
    const cf = getCurrentFilters();
    const args = getCurrentFilterArgs();
    const parts = [];
    if (cf?.search)    parts.push(`"${cf.search}"`);
    if (cf?.type)      parts.push(cf.type);
    if (cf?.city)      parts.push(cf.city);
    if (cf?.maxPrice)  parts.push(`under ${cf.maxPrice.toLocaleString('da-DK')} kr.`);
    if (cf?.warranty)  parts.push('med garanti');
    if (cf?.newOnly)   parts.push('nye annoncer');
    if (cf?.sellerType === 'dealer')  parts.push('forhandlere');
    if (cf?.sellerType === 'private') parts.push('private');

    if (args?.brands?.length)     parts.push(args.brands.join(', '));
    if (args?.types?.length)      parts.push(args.types.join(', '));
    if (args?.conditions?.length) parts.push(args.conditions.join(', '));
    if (args?.wheelSizes?.length) parts.push(args.wheelSizes.join(', '));
    if (args?.sizes?.length)      parts.push(args.sizes.map(s => s.split(' ')[0]).join(', '));
    if (args?.colors?.length)     parts.push(args.colors.join(', '));
    if (args?.frameMaterials?.length) parts.push(args.frameMaterials.join(', '));
    if (args?.brakeTypes?.length)     parts.push(args.brakeTypes.join(', '));
    if (args?.groupsets?.length)      parts.push(args.groupsets.join(', '));
    if (args?.electronicShifting === true)  parts.push('elektronisk gear');
    if (args?.electronicShifting === false) parts.push('mekanisk gear');
    if (args?.minPrice && args?.maxPrice) {
      parts.push(`${args.minPrice.toLocaleString('da-DK')}–${args.maxPrice.toLocaleString('da-DK')} kr.`);
    } else if (args?.minPrice) {
      parts.push(`fra ${args.minPrice.toLocaleString('da-DK')} kr.`);
    } else if (args?.maxPrice) {
      parts.push(`under ${args.maxPrice.toLocaleString('da-DK')} kr.`);
    }
    if (args?.maxWeight) parts.push(`under ${String(args.maxWeight).replace('.', ',')} kg`);
    if (args?.sellerType === 'dealer')  parts.push('forhandlere');
    if (args?.sellerType === 'private') parts.push('private');

    return parts;
  }

  function clearAllFilters() {
    const s = document.getElementById('search-input'); if (s) s.value = '';
    const t = document.getElementById('search-type');  if (t) t.value = '';
    const c = document.getElementById('search-city');  if (c) c.value = '';

    document.querySelectorAll('.filters-row .pill').forEach(p => {
      const isAlle = (p.textContent || '').trim() === 'Alle';
      p.classList.toggle('active', isAlle);
      p.setAttribute('aria-pressed', isAlle ? 'true' : 'false');
    });

    document.querySelectorAll('.sidebar-box input[type="checkbox"]').forEach(cb => {
      cb.checked = cb.dataset.value === 'all';
      cb.closest('.color-swatch')?.classList.remove('is-on');
    });

    document.querySelectorAll('.price-range input[type="number"]').forEach(inp => inp.value = '');
    { const el = document.getElementById('sidebar-max-weight'); if (el) el.value = ''; }

    setCurrentFilters({});
    setCurrentFilterArgs(null);
    loadBikes();
    showToast('Filtre nulstillet');
  }

  function updateActiveFiltersBar() {
    const bar = document.getElementById('active-filters-bar');
    if (!bar) return;
    if (!hasActiveFilters()) { bar.style.display = 'none'; updateMobileFilterCount(0); return; }

    const cf = getCurrentFilters();
    const args = getCurrentFilterArgs();
    const pills = [];

    if (cf?.search)    pills.push({ label: `"${cf.search}"`, type: 'search' });
    if (cf?.city)      pills.push({ label: cf.city, type: 'city' });
    if (cf?.type)      pills.push({ label: cf.type, type: 'quick-type' });
    if (cf?.maxPrice)  pills.push({ label: `Under ${cf.maxPrice.toLocaleString('da-DK')} kr.`, type: 'quick-price' });
    if (cf?.warranty)  pills.push({ label: 'Med garanti', type: 'quick-warranty' });
    if (cf?.newOnly)   pills.push({ label: 'Ny annonce', type: 'quick-newonly' });
    if (cf?.sellerType === 'dealer')  pills.push({ label: 'Kun forhandlere', type: 'quick-seller' });
    if (cf?.sellerType === 'private') pills.push({ label: 'Kun private', type: 'quick-seller' });

    for (const t of (args?.types || []))      pills.push({ label: t, type: 'type', value: t });
    for (const c of (args?.conditions || [])) pills.push({ label: c, type: 'condition', value: c });
    for (const w of (args?.wheelSizes || [])) pills.push({ label: w, type: 'wheel', value: w });
    for (const c of (args?.colors || []))     pills.push({ label: c, type: 'color', value: c });
    for (const m of (args?.frameMaterials || [])) pills.push({ label: m, type: 'frame_material', value: m });
    for (const b of (args?.brakeTypes || []))     pills.push({ label: b, type: 'brake_type', value: b });
    for (const g of (args?.groupsets || []))      pills.push({ label: g, type: 'groupset', value: g });
    if (args?.electronicShifting === true)        pills.push({ label: 'Elektronisk gear', type: 'electronic_shifting', value: 'true' });
    if (args?.electronicShifting === false)       pills.push({ label: 'Mekanisk gear', type: 'electronic_shifting', value: 'false' });
    if (args?.minPrice && args?.maxPrice) {
      pills.push({ label: `${args.minPrice.toLocaleString('da-DK')}–${args.maxPrice.toLocaleString('da-DK')} kr.`, type: 'price' });
    } else if (args?.minPrice) {
      pills.push({ label: `Fra ${args.minPrice.toLocaleString('da-DK')} kr.`, type: 'price' });
    } else if (args?.maxPrice) {
      pills.push({ label: `Under ${args.maxPrice.toLocaleString('da-DK')} kr.`, type: 'price' });
    }
    if (args?.maxWeight) pills.push({ label: `Under ${String(args.maxWeight).replace('.', ',')} kg`, type: 'weight' });
    if (args?.sellerType === 'dealer')  pills.push({ label: 'Forhandlere', type: 'seller', value: 'dealer' });
    if (args?.sellerType === 'private') pills.push({ label: 'Private', type: 'seller', value: 'private' });

    bar.style.display = 'flex';
    bar.innerHTML = `
      <div class="afb-pills">
        ${pills.map(p => `<span class="afb-pill">${esc(p.label)}<button class="afb-pill-remove" onclick="removeFilterPill('${p.type}','${(p.value || '').replace(/'/g, "\\'")}')">✕</button></span>`).join('')}
      </div>
      <button class="afb-clear-all" onclick="clearAllFilters()">↺ Nulstil alle</button>
    `;
    updateMobileFilterCount(pills.length);
  }

  function updateMobileFilterCount(count) {
    const badge = document.getElementById('mobile-filter-count');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function removeFilterPill(type, value) {
    const resetQuickPills = () => {
      document.querySelectorAll('.filters-row .pill').forEach(p => {
        const isAlle = p.textContent.trim() === 'Alle';
        p.classList.toggle('active', isAlle);
        p.setAttribute('aria-pressed', isAlle ? 'true' : 'false');
      });
    };

    const cf = getCurrentFilters();
    switch (type) {
      case 'search':
        { const el = document.getElementById('search-input'); if (el) el.value = ''; }
        setCurrentFilters({ ...cf, search: '' });
        loadBikes(getCurrentFilters());
        break;
      case 'city':
        { const el = document.getElementById('search-city'); if (el) el.value = ''; }
        setCurrentFilters({ ...cf, city: '' });
        loadBikes(getCurrentFilters());
        break;
      case 'quick-type':
        setCurrentFilters({ ...cf, type: '' });
        resetQuickPills();
        loadBikes(getCurrentFilters());
        break;
      case 'quick-price':
        setCurrentFilters({ ...cf, maxPrice: null });
        resetQuickPills();
        loadBikes(getCurrentFilters());
        break;
      case 'quick-warranty':
        setCurrentFilters({ ...cf, warranty: false });
        resetQuickPills();
        loadBikes(getCurrentFilters());
        break;
      case 'quick-newonly':
        setCurrentFilters({ ...cf, newOnly: false });
        resetQuickPills();
        loadBikes(getCurrentFilters());
        break;
      case 'quick-seller':
        setCurrentFilters({ ...cf, sellerType: null });
        resetQuickPills();
        loadBikes(getCurrentFilters());
        break;
      case 'type':
        document.querySelectorAll(`[data-filter="type"][data-value="${value}"]`).forEach(cb => cb.checked = false);
        applyFilters();
        break;
      case 'condition':
        document.querySelectorAll(`[data-filter="condition"][data-value="${value}"]`).forEach(cb => cb.checked = false);
        applyFilters();
        break;
      case 'wheel':
        document.querySelectorAll(`[data-filter="wheel"][data-value="${value}"]`).forEach(cb => cb.checked = false);
        applyFilters();
        break;
      case 'color':
        document.querySelectorAll(`[data-filter="color"][data-value="${value}"]`).forEach(cb => {
          cb.checked = false;
          cb.closest('.color-swatch')?.classList.remove('is-on');
        });
        applyFilters();
        break;
      case 'price':
        document.querySelectorAll('.price-range input[type="number"]').forEach(inp => inp.value = '');
        applyFilters();
        break;
      case 'weight':
        { const el = document.getElementById('sidebar-max-weight'); if (el) el.value = ''; }
        applyFilters();
        break;
      case 'seller':
        document.querySelectorAll('[data-filter="seller"][data-value="all"]').forEach(cb => cb.checked = true);
        document.querySelectorAll('[data-filter="seller"]:not([data-value="all"])').forEach(cb => cb.checked = false);
        applyFilters();
        break;
      case 'frame_material':
      case 'brake_type':
      case 'groupset':
      case 'electronic_shifting':
        document.querySelectorAll(`[data-filter="${type}"][data-value="${value}"]`).forEach(cb => cb.checked = false);
        applyFilters();
        break;
    }
  }

  function toggleNearMe(pill) {
    const isActive = pill.classList.contains('active');
    const radiusSel = document.getElementById('nearme-radius');
    if (isActive) {
      pill.classList.remove('active');
      if (radiusSel) radiusSel.style.display = 'none';
      setUserGeoCoords(null);
      setActiveRadius(null);
      document.querySelectorAll('.nearme-dist').forEach(el => el.remove());
      loadBikes(getCurrentFilters());
      return;
    }
    if (!navigator.geolocation) { showToast('⚠️ GPS er ikke tilgængeligt i din browser'); return; }
    showToast('📍 Henter din position...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserGeoCoords([pos.coords.latitude, pos.coords.longitude]);
        setActiveRadius(parseInt(document.getElementById('nearme-radius').value || 20));
        pill.classList.add('active');
        if (radiusSel) radiusSel.style.display = 'inline-block';
        document.querySelectorAll('.filters-row .pill.active:not(#pill-nearme)').forEach(p => p.classList.remove('active'));
        applyNearMeFilter();
      },
      () => showToast('❌ Kunne ikke hente din position — tjek GPS-tilladelser')
    );
  }

  function updateNearMeRadius(val) {
    setActiveRadius(parseInt(val));
    if (getUserGeoCoords()) applyNearMeFilter();
  }

  async function applyNearMeFilter() {
    const userCoords = getUserGeoCoords();
    const radius = getActiveRadius();
    if (!userCoords || !radius) return;
    const grid = document.getElementById('listings-grid');
    const cards = [...grid.querySelectorAll('.bike-card:not(.skeleton-card)')];
    grid.querySelector('.nearme-empty')?.remove();

    cards.forEach(c => c.style.opacity = '0.4');
    showToast('📍 Filtrerer efter afstand...');

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
      const km = haversineKm(userCoords, coords);
      return { card, km, precise };
    }));

    const within = resolved
      .filter(r => r.km !== null && r.km <= radius)
      .sort((a, b) => a.km - b.km);
    const outside = resolved.filter(r => r.km === null || r.km > radius);

    outside.forEach(({ card }) => { card.style.display = 'none'; });

    within.forEach(({ card, km, precise }) => {
      card.style.display = '';
      card.style.opacity = '';
      let distTag = card.querySelector('.nearme-dist');
      if (!distTag) {
        distTag = document.createElement('span');
        distTag.className = 'nearme-dist';
        card.querySelector('.bike-card-img')?.appendChild(distTag);
      }
      distTag.textContent = (precise ? '' : '~') + formatDistanceKm(km);
      distTag.title = precise ? 'Præcis afstand (forhandler-adresse)' : 'Ca. afstand (by-center)';
    });

    within.forEach(({ card }) => grid.appendChild(card));

    if (within.length === 0) {
      const el = document.createElement('div');
      el.className = 'nearme-empty empty-state-box';
      el.innerHTML = `<div class="empty-state-icon">📍</div><h3 class="empty-state-title">Ingen cykler inden for ${radius} km</h3><p class="empty-state-sub">Prøv en større radius</p>`;
      grid.appendChild(el);
    }
    showToast(`📍 ${within.length} ${within.length === 1 ? 'cykel' : 'cykler'} inden for ${radius} km`);
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

  async function updateFilterCounts(data, dealerCount) {
    if (!data) {
      const [bikesRes, dealerRes] = await Promise.all([
        supabase.from('bikes').select('type, condition, size, wheel_size, colors, profiles!user_id(seller_type)').eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('seller_type', 'dealer').eq('verified', true)
      ]);
      if (bikesRes.error || !bikesRes.data) {
        const { data: fallback } = await supabase.from('bikes').select('type, condition, size, profiles!user_id(seller_type)').eq('is_active', true);
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
    setCount('size', 'XS (44–48 cm)', data.filter(b => b.size === 'XS (44–48 cm)').length);
    setCount('size', 'S (49–52 cm)',  data.filter(b => b.size === 'S (49–52 cm)').length);
    setCount('size', 'M (53–56 cm)',  data.filter(b => b.size === 'M (53–56 cm)').length);
    setCount('size', 'L (57–60 cm)',  data.filter(b => b.size === 'L (57–60 cm)').length);
    setCount('size', 'XL (61+ cm)',   data.filter(b => b.size === 'XL (61+ cm)').length);
    setCount('wheel',  '26"',           data.filter(b => b.wheel_size === '26"').length);
    setCount('wheel',  '27.5" / 650b',  data.filter(b => b.wheel_size === '27.5" / 650b').length);
    setCount('wheel',  '28"',           data.filter(b => b.wheel_size === '28"').length);
    setCount('wheel',  '29"',           data.filter(b => b.wheel_size === '29"').length);

    // Farve-counts: tæl hvor mange annoncer der har hver farve i deres colors-array
    const colorCounts = {};
    for (const b of data) {
      const cols = Array.isArray(b.colors) ? b.colors : [];
      for (const c of cols) colorCounts[c] = (colorCounts[c] || 0) + 1;
    }
    document.querySelectorAll('[data-filter="color"]').forEach(cb => {
      const v = cb.dataset.value;
      setCount('color', v, colorCounts[v] || 0);
    });

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

  return {
    hasActiveFilters,
    describeActiveFilters,
    clearAllFilters,
    updateActiveFiltersBar,
    removeFilterPill,
    toggleNearMe,
    updateNearMeRadius,
    applyNearMeFilter,
    sortBikes,
    updateFilterCounts,
    setCount,
    togglePill,
  };
}
