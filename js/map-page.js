/* ============================================================
   KORTVISNING MED LEAFLET — factory module
   ============================================================ */

export function createMapPage({
  supabase,
  showToast,
  esc,
  haversineKm,
  formatDistanceKm,
  geocodeCity,
  geocodeAddress,
  stableOffset,
  debounce,
  MAP_PAGE_LIMIT,
  updateSEOMeta,
  setMainView,
  navigateTo,
  showDetailView,
  openBikeModal,
  navigateToBike,
  navigateToDealer,
  getUserSavedSet,
}) {

  /* ── Module-local state ─────────────────────────────────── */

  let mapInstance        = null;
  window._getMap = function() { return mapInstance; };
  let mapMarkers         = [];
  let currentView        = 'list';
  let userLocationMarker = null;

  // Split-kortvisning
  let splitMapInstance   = null;
  let splitClusterGroup  = null;
  let splitMarkerMap     = {}; // bikeId → { marker, lat, lng }
  let _splitListVisible  = true;
  let _mapUserMarker     = null; // "Du er her"-markør

  // State for /kort-siden
  let _mapPageBikes      = [];   // Rå annoncer fra DB (op til MAP_PAGE_LIMIT)
  let _mapPageGeocoded   = null; // Map<bikeId, { coords, precise }>
  let _mapNearMeCoords   = null;
  let _mapFilterDebounce = null;
  let _mapBoundsActive   = false; // "Søg når jeg flytter kortet" aktiveret
  let _mapBoundsDebounced = null; // debounced applyMapFilters til moveend

  /* ── setView ────────────────────────────────────────────── */

  function setView(view) {
    return setMainView(view, {
      initMap,
      setCurrentView: (val) => { currentView = val; },
    });
  }

  /* ── renderMapPage (/kort) ───────────────────────────────── */

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
    _mapBoundsActive  = false;

    document.getElementById('detail-view').innerHTML = `
    <div class="map-page">
      <!-- Mobil sub-header: back + titel + antal + filter chips (kun mobil) -->
      <div class="map-mobile-subheader">
        <button class="map-mobile-back" onclick="navigateTo('/')" aria-label="Tilbage">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          Tilbage
        </button>
        <div class="map-mobile-title-row">
          <h1 class="map-mobile-title">Kortvisning</h1>
          <span id="map-mobile-count" class="map-mobile-count">Henter…</span>
        </div>
      </div>

      <!-- Filterbar: desktop = alle felter inline, mobil = chips + bundfilter-sheet -->
      <div class="map-filters-bar" role="search">
        <!-- Desktop: enkelt filter-row med alle kontroller -->
        <div class="map-filters-row map-filters-desktop">
          <div class="map-pill map-pill--search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5" stroke-linecap="round"/></svg>
            <input type="search" id="map-search" placeholder="Søg mærke, model..." aria-label="Søg">
          </div>
          <button class="map-pill map-pill--near" id="map-near-btn" onclick="toggleMapNearMe()" aria-pressed="false">
            <svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
            <span>Nær mig</span>
          </button>
          <div class="map-pill map-pill--dd" id="dd-radius" data-val="25" data-disabled="true">
            <button class="map-dd-btn" type="button" onclick="toggleMapDd(event,'dd-radius')">
              <span class="map-dd-label">25 km</span>
              <svg class="map-pill-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="map-dd-menu" role="listbox" aria-label="Radius">
              <button class="map-dd-item" type="button" role="option" data-val="5" onclick="pickMapDd(event,'dd-radius','5','5 km')">5 km</button>
              <button class="map-dd-item" type="button" role="option" data-val="10" onclick="pickMapDd(event,'dd-radius','10','10 km')">10 km</button>
              <button class="map-dd-item is-sel" type="button" role="option" data-val="25" onclick="pickMapDd(event,'dd-radius','25','25 km')">25 km</button>
              <button class="map-dd-item" type="button" role="option" data-val="50" onclick="pickMapDd(event,'dd-radius','50','50 km')">50 km</button>
              <button class="map-dd-item" type="button" role="option" data-val="100" onclick="pickMapDd(event,'dd-radius','100','100 km')">100 km</button>
              <button class="map-dd-item" type="button" role="option" data-val="" onclick="pickMapDd(event,'dd-radius','','Hele landet')">Hele landet</button>
            </div>
          </div>
          <div class="map-pill map-pill--dd map-pill--icon" id="dd-bike-type" data-val="">
            <svg class="map-pill-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M6 17l4-8h6l2 8m-8-8h-2m4 0l-2 8" stroke-linejoin="round" stroke-linecap="round"/></svg>
            <button class="map-dd-btn" type="button" onclick="toggleMapDd(event,'dd-bike-type')">
              <span class="map-dd-label">Alle typer</span>
              <svg class="map-pill-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="map-dd-menu" role="listbox" aria-label="Cykeltype">
              <button class="map-dd-item is-sel" type="button" role="option" data-val="" onclick="pickMapDd(event,'dd-bike-type','','Alle typer')">Alle typer</button>
              <button class="map-dd-item" type="button" role="option" data-val="Racercykel" onclick="pickMapDd(event,'dd-bike-type','Racercykel','Racercykel')">Racercykel</button>
              <button class="map-dd-item" type="button" role="option" data-val="Mountainbike" onclick="pickMapDd(event,'dd-bike-type','Mountainbike','Mountainbike')">Mountainbike</button>
              <button class="map-dd-item" type="button" role="option" data-val="El-cykel" onclick="pickMapDd(event,'dd-bike-type','El-cykel','El-cykel')">El-cykel</button>
              <button class="map-dd-item" type="button" role="option" data-val="Citybike" onclick="pickMapDd(event,'dd-bike-type','Citybike','Citybike')">Citybike</button>
              <button class="map-dd-item" type="button" role="option" data-val="Ladcykel" onclick="pickMapDd(event,'dd-bike-type','Ladcykel','Ladcykel')">Ladcykel</button>
              <button class="map-dd-item" type="button" role="option" data-val="Børnecykel" onclick="pickMapDd(event,'dd-bike-type','Børnecykel','Børnecykel')">Børnecykel</button>
              <button class="map-dd-item" type="button" role="option" data-val="Gravel" onclick="pickMapDd(event,'dd-bike-type','Gravel','Gravel')">Gravel</button>
            </div>
          </div>
          <div class="map-pill map-pill--dd map-pill--icon" id="dd-seller-type" data-val="all">
            <svg class="map-pill-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>
            <button class="map-dd-btn" type="button" onclick="toggleMapDd(event,'dd-seller-type')">
              <span class="map-dd-label">Alle sælgere</span>
              <svg class="map-pill-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="map-dd-menu" role="listbox" aria-label="Sælgertype">
              <button class="map-dd-item is-sel" type="button" role="option" data-val="all" onclick="pickMapDd(event,'dd-seller-type','all','Alle sælgere')">Alle sælgere</button>
              <button class="map-dd-item" type="button" role="option" data-val="dealer" onclick="pickMapDd(event,'dd-seller-type','dealer','Forhandler')">Forhandler</button>
              <button class="map-dd-item" type="button" role="option" data-val="private" onclick="pickMapDd(event,'dd-seller-type','private','Privat')">Privat</button>
            </div>
          </div>
          <div class="map-pill map-pill--dd map-pill--icon" id="dd-condition" data-val="">
            <svg class="map-pill-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <button class="map-dd-btn" type="button" onclick="toggleMapDd(event,'dd-condition')">
              <span class="map-dd-label">Alle stande</span>
              <svg class="map-pill-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="map-dd-menu" role="listbox" aria-label="Stand">
              <button class="map-dd-item is-sel" type="button" role="option" data-val="" onclick="pickMapDd(event,'dd-condition','','Alle stande')">Alle stande</button>
              <button class="map-dd-item" type="button" role="option" data-val="Ny" onclick="pickMapDd(event,'dd-condition','Ny','Ny')">Ny</button>
              <button class="map-dd-item" type="button" role="option" data-val="Som ny" onclick="pickMapDd(event,'dd-condition','Som ny','Som ny')">Som ny</button>
              <button class="map-dd-item" type="button" role="option" data-val="God stand" onclick="pickMapDd(event,'dd-condition','God stand','God stand')">God stand</button>
              <button class="map-dd-item" type="button" role="option" data-val="Brugt" onclick="pickMapDd(event,'dd-condition','Brugt','Brugt')">Brugt</button>
            </div>
          </div>
          <div class="map-pill map-pill--price">
            <input type="number" id="map-price-min" placeholder="Min. pris" min="0" aria-label="Min pris">
            <span class="map-pill-sep">—</span>
            <input type="number" id="map-price-max" placeholder="Max. pris" min="0" aria-label="Max pris">
            <span class="map-pill-unit">kr.</span>
          </div>
          <button class="map-reset-btn" onclick="resetMapFilters()" title="Nulstil filtre">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/></svg>
            Nulstil
          </button>
        </div>

        <!-- Mobil: scrollable filter chips -->
        <div class="map-filters-mobile">
          <div class="map-pill map-pill--search map-chip-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5" stroke-linecap="round"/></svg>
            <input type="search" id="map-search-mobile" placeholder="Søg mærke, model..." aria-label="Søg">
          </div>
          <button class="map-chip map-chip--filters" onclick="openMapFiltersSheet()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6h11M4 18h7M15 6a2 2 0 114 0 2 2 0 01-4 0zM11 18a2 2 0 114 0 2 2 0 01-4 0zM4 12h5m10 0h-5M9 12a2 2 0 104 0 2 2 0 00-4 0z"/></svg>
            Filtre
            <span class="map-chip-badge" id="map-filter-badge" style="display:none;">0</span>
          </button>
          <button class="map-chip map-chip--near" id="map-near-btn-mobile" onclick="toggleMapNearMe()" aria-pressed="false">
            <svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>
            Nær mig
          </button>
        </div>
      </div>

      <div id="browse-split" class="map-page-split${_splitListVisible ? ' list-open' : ''}">
        <div id="split-list-panel"${!_splitListVisible ? ' class="collapsed"' : ''}>
          <!-- Grab-handle (kun mobil) -->
          <button class="split-sheet-handle" onclick="toggleSplitList()" aria-label="Toggle liste">
            <div class="split-sheet-handle-bar"></div>
          </button>
          <div class="split-list-header">
            <div class="split-list-header-text">
              <div class="split-list-count-big" id="split-count-big">–</div>
              <div class="split-list-count-label" id="split-count">Henter annoncer…</div>
            </div>
            <div class="split-list-header-actions">
              <div class="map-pill map-pill--dd map-pill--sort" id="dd-sort" data-val="newest">
                <button class="map-dd-btn" type="button" onclick="toggleMapDd(event,'dd-sort')">
                  <span class="map-dd-label">Nyeste</span>
                  <svg class="map-pill-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="map-dd-menu map-dd-menu--right" role="listbox" aria-label="Sortering">
                  <button class="map-dd-item is-sel" type="button" role="option" data-val="newest" onclick="pickMapDd(event,'dd-sort','newest','Nyeste')">Nyeste</button>
                  <button class="map-dd-item" type="button" role="option" data-val="price_asc" onclick="pickMapDd(event,'dd-sort','price_asc','Pris ↑')">Pris ↑</button>
                  <button class="map-dd-item" type="button" role="option" data-val="price_desc" onclick="pickMapDd(event,'dd-sort','price_desc','Pris ↓')">Pris ↓</button>
                  <button class="map-dd-item" type="button" role="option" data-val="distance" onclick="pickMapDd(event,'dd-sort','distance','Afstand')">Afstand</button>
                </div>
              </div>
              <button class="split-list-close-btn" onclick="toggleSplitList()" aria-label="Skjul liste">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
          </div>
          <div id="split-cards-container"></div>
        </div>
        <div id="split-map-panel">
          <button class="map-search-area-btn" id="map-search-area-btn" onclick="applyMapBoundsSearch()" type="button" style="display:none;">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><line x1="13.5" y1="13.5" x2="18" y2="18"/></svg>
            <span id="map-search-area-label">Søg dette område</span>
          </button>
          <button class="split-list-toggle-float" id="split-toggle-btn" onclick="toggleSplitList()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            <span>Vis liste</span>
          </button>
          <button class="map-locate-float" id="map-locate-float-btn" onclick="toggleMapNearMe()" aria-label="Find min placering" title="Find min placering">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8" stroke-width="1.2" stroke-dasharray="2 2"/></svg>
          </button>
        </div>
      </div>

      <!-- Mobil tab bar: Liste ⇄ Kort -->
      <div class="map-tab-bar" id="map-tab-bar">
        <button class="map-tab-btn active" id="map-tab-map" onclick="mapTabSwitch('map')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2m0-14l6 2m-6-2v14m6-12l6-2v14l-6 2m0-14v14"/></svg>
          Kort
        </button>
        <button class="map-tab-btn" id="map-tab-list" onclick="mapTabSwitch('list')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          Liste
        </button>
      </div>

      <!-- Mobil filter-sheet -->
      <div class="map-filter-sheet-overlay" id="map-filter-sheet" onclick="if(event.target===this)closeMapFiltersSheet()">
        <div class="map-filter-sheet">
          <div class="map-filter-sheet-handle"></div>
          <div class="map-filter-sheet-head">
            <div class="map-filter-sheet-title">Filtre</div>
            <button class="map-filter-sheet-close" onclick="closeMapFiltersSheet()" aria-label="Luk">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
          <div class="map-filter-sheet-body" id="map-filter-sheet-body"></div>
          <div class="map-filter-sheet-footer">
            <button class="map-filter-reset" onclick="resetMapFilters()">Nulstil</button>
            <button class="map-filter-apply" onclick="closeMapFiltersSheet()" id="map-filter-apply-btn">Vis annoncer</button>
          </div>
        </div>
      </div>
    </div>`;

    // Filter-events (debounced). Sync desktop<->mobile søgeinput.
    const debounced = debounce(() => { applyMapFilters(); updateMapFilterBadge(); }, 220);
    const searchDesk = document.getElementById('map-search');
    const searchMob  = document.getElementById('map-search-mobile');
    const syncSearch = (src, dst) => { if (dst && dst.value !== src.value) dst.value = src.value; };
    if (searchDesk) searchDesk.addEventListener('input', () => { syncSearch(searchDesk, searchMob); debounced(); });
    if (searchMob)  searchMob.addEventListener('input',  () => { syncSearch(searchMob, searchDesk); debounced(); });
    ['map-price-min', 'map-price-max'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', debounced);
    });
    // Custom dropdown close-on-outside-click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.map-pill--dd')) {
        document.querySelectorAll('.map-pill--dd.dd-open').forEach(d => d.classList.remove('dd-open'));
      }
    });

    await loadMapPageBikes();
    await initSplitMap();
  }

  /* ── loadMapPageBikes ───────────────────────────────────── */

  async function loadMapPageBikes() {
    const { data, error } = await supabase
      .from('bikes')
      .select('id, brand, model, price, type, condition, city, year, created_at, user_id, profiles(name, seller_type, shop_name, verified, address, avatar_url, lat, lng, location_precision, postcode), bike_images(url, is_primary)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(MAP_PAGE_LIMIT);
    _mapPageBikes = (!error && data) ? data : [];
  }

  /* ── getMapFilters ──────────────────────────────────────── */

  function getMapFilters() {
    const qDesk = (document.getElementById('map-search')?.value || '').trim();
    const qMob  = (document.getElementById('map-search-mobile')?.value || '').trim();
    return {
      q:         (qDesk || qMob).toLowerCase(),
      seller:    document.getElementById('dd-seller-type')?.dataset.val || 'all',
      type:      document.getElementById('dd-bike-type')?.dataset.val || '',
      condition: document.getElementById('dd-condition')?.dataset.val || '',
      priceMin:  parseInt(document.getElementById('map-price-min')?.value, 10) || null,
      priceMax:  parseInt(document.getElementById('map-price-max')?.value, 10) || null,
      radius:    _mapNearMeCoords ? (parseInt(document.getElementById('dd-radius')?.dataset.val, 10) || null) : null,
      nearCoords: _mapNearMeCoords,
      sort:      document.getElementById('dd-sort')?.dataset.val || 'newest',
      bounds:    (_mapBoundsActive && splitMapInstance) ? splitMapInstance.getBounds() : null,
    };
  }

  /* ── filterMapBikes ─────────────────────────────────────── */

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
      if (f.bounds && _mapPageGeocoded) {
        const g = _mapPageGeocoded.get(b.id);
        if (!g) return false;
        if (!f.bounds.contains(g.coords)) return false;
      }
      return true;
    });
  }

  /* ── updateMapFilterBadge ───────────────────────────────── */

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
    if (_mapBoundsActive) n++;
    if (n > 0) { badge.style.display = ''; badge.textContent = n; }
    else { badge.style.display = 'none'; }
  }

  /* ── toggleMapFilterPanel ───────────────────────────────── */

  function toggleMapFilterPanel() {
    // Bagud-kompatibilitet: den nye mobil-UX bruger fuld-sheet
    openMapFiltersSheet();
  }

  /* ── applyMapFilters ────────────────────────────────────── */

  function applyMapFilters() {
    if (!splitMapInstance) return;
    const filtered = filterMapBikes();
    const cardsContainer = document.getElementById('split-cards-container');
    const countEl        = document.getElementById('split-count');
    const countBigEl     = document.getElementById('split-count-big');
    const countMobEl     = document.getElementById('map-mobile-count');

    const noun = filtered.length === 1 ? 'annonce' : 'annoncer';
    const countText = filtered.length + ' ' + noun;
    if (countEl)    countEl.textContent = 'Cykler fundet';
    if (countBigEl) countBigEl.textContent = filtered.length.toLocaleString('da-DK');
    if (countMobEl) countMobEl.textContent = filtered.length + ' cykler';
    const applyBtn = document.getElementById('map-filter-apply-btn');
    if (applyBtn) applyBtn.textContent = 'Vis ' + countText;
    // Hold floating toggle-knap synkroniseret med aktuel tæller
    const tgl = document.getElementById('split-toggle-btn');
    if (tgl) {
      tgl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Vis liste (' + filtered.length + ')</span>';
    }

    if (filtered.length === 0) {
      cardsContainer.innerHTML = '<div class="split-empty">Ingen annoncer matcher filtrene.</div>';
    } else {
      const f = getMapFilters();
      let list = [...filtered];
      // Sort primært efter valgt sortering; "distance" kræver nearCoords
      if (f.sort === 'price_asc')  list.sort((a, b) => a.price - b.price);
      else if (f.sort === 'price_desc') list.sort((a, b) => b.price - a.price);
      else if (f.sort === 'distance' && f.nearCoords && _mapPageGeocoded) {
        list.sort((a, b) => {
          const ga = _mapPageGeocoded.get(a.id), gb = _mapPageGeocoded.get(b.id);
          if (!ga) return 1; if (!gb) return -1;
          return haversineKm(f.nearCoords, ga.coords) - haversineKm(f.nearCoords, gb.coords);
        });
      } else if (f.nearCoords && _mapPageGeocoded && f.sort === 'newest') {
        // Hvis Nær mig er aktiv men sort er default, sortér alligevel efter afstand først
        list.sort((a, b) => {
          const ga = _mapPageGeocoded.get(a.id), gb = _mapPageGeocoded.get(b.id);
          if (!ga) return 1; if (!gb) return -1;
          return haversineKm(f.nearCoords, ga.coords) - haversineKm(f.nearCoords, gb.coords);
        });
      } else {
        // newest (default)
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      renderSplitCards(list, cardsContainer);
    }

    // Vis kun filtrerede markører
    const visibleIds = new Set(filtered.map(b => b.id));
    splitClusterGroup.clearLayers();
    Object.keys(splitMarkerMap).forEach(id => {
      if (visibleIds.has(id)) splitClusterGroup.addLayer(splitMarkerMap[id].marker);
    });

    if (visibleIds.size > 0 && !_mapBoundsActive) {
      try { splitMapInstance.fitBounds(splitClusterGroup.getBounds().pad(0.1)); } catch (e) {}
    }
  }

  /* ── resetMapFilters ────────────────────────────────────── */

  function resetMapFilters() {
    ['map-search', 'map-search-mobile', 'map-price-min', 'map-price-max'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    resetMapDd('dd-seller-type', 'all', 'Alle sælgere');
    resetMapDd('dd-bike-type',   '',    'Alle typer');
    resetMapDd('dd-condition',   '',    'Alle stande');
    resetMapDd('dd-radius',      '25',  '25 km');
    resetMapDd('dd-sort',        'newest', 'Nyeste');
    const rd = document.getElementById('dd-radius'); if (rd) rd.dataset.disabled = 'true';
    _mapNearMeCoords = null;
    _mapBoundsActive = false;
    const boundsBtn = document.getElementById('map-bounds-toggle-btn');
    if (boundsBtn) {
      boundsBtn.classList.remove('active');
      boundsBtn.setAttribute('aria-pressed', 'false');
    }
    if (_mapUserMarker && splitMapInstance) { splitMapInstance.removeLayer(_mapUserMarker); _mapUserMarker = null; }
    [document.getElementById('map-near-btn'), document.getElementById('map-near-btn-mobile')].forEach(b => {
      if (!b) return;
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
      const span = b.querySelector('span');
      if (span) span.textContent = 'Nær mig';
      else {
        const svg = b.querySelector('svg');
        b.innerHTML = '';
        if (svg) b.appendChild(svg);
        b.appendChild(document.createTextNode(' Nær mig'));
      }
    });
    // Populer sheet igen hvis åben, så den afspejler nulstillede felter
    const sheet = document.getElementById('map-filter-sheet');
    if (sheet && sheet.classList.contains('open')) openMapFiltersSheet();
    applyMapFilters();
    updateMapFilterBadge();
  }

  /* ── toggleMapNearMe ────────────────────────────────────── */

  async function toggleMapNearMe() {
    const btn    = document.getElementById('map-near-btn');
    const btnMob = document.getElementById('map-near-btn-mobile');
    const radiusSel = document.getElementById('dd-radius');
    const locateFloatBtn = document.getElementById('map-locate-float-btn');
    const setBtn = (active, label) => {
      [btn, btnMob].forEach(b => {
        if (!b) return;
        b.classList.toggle('active', !!active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
        const span = b.querySelector('span');
        if (span) span.textContent = label;
        else {
          // Mobilchip har ikke <span>-wrapper — bevar ikonet og opdater trailing tekst
          const svg = b.querySelector('svg');
          b.innerHTML = '';
          if (svg) b.appendChild(svg);
          b.appendChild(document.createTextNode(' ' + label));
        }
      });
      if (locateFloatBtn) locateFloatBtn.classList.toggle('active', !!active);
    };
    if (_mapNearMeCoords) {
      _mapNearMeCoords = null;
      setBtn(false, 'Nær mig');
      if (radiusSel) radiusSel.dataset.disabled = 'true';
      if (_mapUserMarker && splitMapInstance) { splitMapInstance.removeLayer(_mapUserMarker); _mapUserMarker = null; }
      applyMapFilters(); updateMapFilterBadge();
      return;
    }
    if (!navigator.geolocation) {
      showToast('Din browser understøtter ikke GPS'); return;
    }
    setBtn(false, 'Henter…');
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, enableHighAccuracy: true }));
      _mapNearMeCoords = [pos.coords.latitude, pos.coords.longitude];
      setBtn(true, 'Min position');
      if (radiusSel) radiusSel.dataset.disabled = 'false';
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

  /* ── applyMapBoundsSearch / clearMapBoundsSearch ────────── */
  // Airbnb-style: én knap der toggler mellem "Søg dette område" og "Vis alle"

  function applyMapBoundsSearch() {
    const btn = document.getElementById('map-search-area-btn');
    const label = document.getElementById('map-search-area-label');
    if (_mapBoundsActive) {
      // Allerede aktivt → klik betyder "vis alle"
      _mapBoundsActive = false;
      if (btn) {
        btn.classList.remove('is-active');
        btn.style.display = 'none';
      }
    } else {
      // Aktivér bounds-filter til synligt område
      _mapBoundsActive = true;
      if (btn) {
        btn.classList.add('is-active');
        if (label) label.textContent = 'Vis alle annoncer';
      }
    }
    applyMapFilters();
    updateMapFilterBadge();
    // Opdater knap-tekst med antal efter filter
    if (_mapBoundsActive && btn && label) {
      const count = filterMapBikes().length;
      label.textContent = `Vis alle annoncer`;
      btn.style.display = 'inline-flex';
    }
  }

  function toggleMapBoundsFilter() { applyMapBoundsSearch(); } // bevar legacy-navn til window-eksport

  /* ── initSplitMap ───────────────────────────────────────── */

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

    // Init Leaflet-kort på den nye DOM-node (zoom top-left per design)
    splitMapInstance = L.map('split-map-panel', { zoomControl: false }).setView([56.0, 10.2], 7);
    L.control.zoom({ position: 'topleft' }).addTo(splitMapInstance);
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
    splitMapInstance.on('zoomend', function() {
      if (splitMapInstance.getZoom() < 11) splitMapInstance.closePopup();
    });
    // Auto-vis "Søg her"-knap når brugeren panorerer/zoomer kortet
    let _initialMoveDone = false;
    const _showSearchAreaBtn = () => {
      if (!_initialMoveDone) { _initialMoveDone = true; return; } // skip initial fitBounds
      const btn = document.getElementById('map-search-area-btn');
      if (!btn) return;
      // Hvis filter allerede er aktivt: re-apply automatisk + skjul knap
      if (_mapBoundsActive) {
        applyMapFilters();
        updateMapFilterBadge();
        btn.style.display = 'none';
      } else {
        // Ingen filter aktiv → vis "Søg dette område"-knap
        const label = document.getElementById('map-search-area-label');
        if (label) label.textContent = 'Søg dette område';
        btn.classList.remove('is-active');
        btn.style.display = 'inline-flex';
      }
    };
    _mapBoundsDebounced = debounce(_showSearchAreaBtn, 280);
    splitMapInstance.on('moveend', _mapBoundsDebounced);
    splitMarkerMap = {};
    _mapPageGeocoded = new Map();

    window._closeMapPopup = () => splitMapInstance && splitMapInstance.closePopup();

    // Initial render før geocoding (brugeren får noget at kigge på med det samme)
    renderSplitCards(bikes, cardsContainer);
    const countEl = document.getElementById('split-count');
    if (countEl) countEl.textContent = bikes.length + ' annoncer';

    // Geokod i batches for at undgå at oversvømme DAWA-API'et
    const GEO_BATCH = 10;
    const toGeocode = bikes.filter(b => b.city || (b.profiles && b.profiles.lat));
    const geocodedBikes = [];

    for (let i = 0; i < toGeocode.length; i += GEO_BATCH) {
      const batch = toGeocode.slice(i, i + GEO_BATCH);
      await Promise.all(batch.map(async b => {
        const profile  = b.profiles || {};
        const isDealer = profile.seller_type === 'dealer';
        const hasAddr  = isDealer && profile.address && profile.address.trim();

        let coords = null;
        let precise = false;

        if (profile.lat && profile.lng) {
          coords = [profile.lat, profile.lng];
          precise = profile.location_precision === 'exact';
        } else if (hasAddr) {
          coords = await geocodeAddress(profile.address, b.city);
          if (coords) precise = true;
        }
        if (!coords && b.city) coords = await geocodeCity(b.city);
        if (!coords) return;

        _mapPageGeocoded.set(b.id, { coords: [coords[0], coords[1]], precise });
        geocodedBikes.push({ bike: b, profile, isDealer, coords, precise });
      }));
    }

    // Gruppér cykler efter placering: samme bruger eller samme præcise adresse
    // får ét pin med tæller — i stedet for 20 overlappende markører
    const groups = new Map();
    for (const item of geocodedBikes) {
      const key = item.isDealer
        ? `dealer-${item.bike.user_id}`
        : `coord-${Math.round(item.coords[0] * 1000)}-${Math.round(item.coords[1] * 1000)}-${item.bike.user_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    // Lav én markør pr. gruppe
    for (const [, items] of groups) {
      const isMulti = items.length > 1;
      const first = items[0];
      const { isDealer, profile, coords, precise } = first;

      // Singles: lille jitter for at undgå overlap mellem forskellige brugere
      // Grupper: ingen jitter, alle bikes vises i én popup
      let lat = coords[0], lng = coords[1];
      if (!isMulti) {
        const jitter = precise ? 0.0001 : 0.003;
        lat += stableOffset(first.bike.id, 0) * jitter;
        lng += stableOffset(first.bike.id, 1) * jitter;
      }

      const iconHtml = isMulti
        ? '<div class="split-marker ' + (isDealer ? 'split-marker--dealer' : 'split-marker--private') + '">'
          + (isDealer ? '🏪' : '🚲') + '<span class="split-marker-count">' + items.length + '</span></div>'
        : '<div class="split-marker ' + (isDealer ? 'split-marker--dealer' : 'split-marker--private') + '">'
          + (isDealer ? '🏪' : '🚲') + '</div>';

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      let popupHtml;
      if (isMulti) {
        // Gruppe-popup: vis alle cykler på samme sted som scrollbar liste
        const sellerName = isDealer ? profile.shop_name : profile.name;
        const sellerLabel = isDealer ? 'Forhandler' : 'Privatperson';
        const cardsHtml = items.map(it => {
          const b = it.bike;
          const primaryImg = (b.bike_images || []).find(i => i.is_primary)?.url || (b.bike_images || [])[0]?.url || null;
          return '<button class="split-popup-list-item" onclick="navigateToBike(\'' + b.id + '\')">'
            + (primaryImg
                ? '<img src="' + primaryImg + '" alt="" class="split-popup-list-img">'
                : '<div class="split-popup-list-img-placeholder">🚲</div>')
            + '<div class="split-popup-list-info">'
            + '<div class="split-popup-list-title">' + esc(b.brand) + ' ' + esc(b.model) + '</div>'
            + '<div class="split-popup-list-meta">' + esc(b.type || '') + (b.year ? ' · ' + b.year : '') + '</div>'
            + '<div class="split-popup-list-price">' + b.price.toLocaleString('da-DK') + ' kr.</div>'
            + '</div>'
            + '</button>';
        }).join('');

        popupHtml = '<div class="split-popup split-popup--group">'
          + '<div class="split-popup-group-header">'
          + '<div class="split-popup-group-icon">' + (isDealer ? '🏪' : '👤') + '</div>'
          + '<div class="split-popup-group-meta">'
          + '<div class="split-popup-group-name">' + esc(sellerName || 'Ukendt') + '</div>'
          + '<div class="split-popup-group-sub">' + items.length + ' cykler · ' + sellerLabel + '</div>'
          + '</div>'
          + '<button class="split-popup-close" aria-label="Luk" onclick="event.stopPropagation();_closeMapPopup()">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
          + '</button>'
          + '</div>'
          + '<div class="split-popup-list">' + cardsHtml + '</div>'
          + (isDealer ? '<button class="split-popup-btn" onclick="navigateToDealer(\'' + first.bike.user_id + '\')">Se forhandlerens profil →</button>' : '')
          + '</div>';
      } else {
        // Single-popup: som før
        const b = first.bike;
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

        popupHtml = '<div class="split-popup">'
          + '<div class="split-popup-media">'
          + (primaryImg
              ? '<img src="' + primaryImg + '" alt="" class="split-popup-img">'
              : '<div class="split-popup-img-placeholder">🚲</div>')
          + '<button class="split-popup-close" aria-label="Luk" onclick="event.stopPropagation();_closeMapPopup()">'
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
      }

      const marker = L.marker([lat, lng], { icon });
      marker.bindPopup(popupHtml, { maxWidth: 340, minWidth: 280, closeButton: false });
      marker.on('click', function() {
        marker.openPopup();
        if (!isMulti) splitHighlightCard(first.bike.id);
      });

      // Track marker for each bike i gruppen (så filter-toggle stadig virker)
      for (const it of items) {
        splitMarkerMap[it.bike.id] = { marker, lat, lng };
      }
      splitClusterGroup.addLayer(marker);
    }

    // Zoom til alle markører
    if (Object.keys(splitMarkerMap).length > 0) {
      try { splitMapInstance.fitBounds(splitClusterGroup.getBounds().pad(0.08)); } catch(e) {}
    }

    setTimeout(() => splitMapInstance && splitMapInstance.invalidateSize(), 150);
    applyMapFilters();

    if (window._pendingMapBikeId) {
      const pendingId = window._pendingMapBikeId;
      window._pendingMapBikeId = null;
      setTimeout(() => splitCardClick(pendingId), 300);
    }
  }

  /* ── renderSplitCards ───────────────────────────────────── */

  function renderSplitCards(bikes, container) {
    const f = getMapFilters();
    const _userSavedSet = getUserSavedSet();
    container.innerHTML = bikes.map(b => {
      const profile    = b.profiles || {};
      const isDealer   = profile.seller_type === 'dealer';
      const primaryImg = (b.bike_images || []).find(i => i.is_primary)?.url || (b.bike_images || [])[0]?.url || null;
      const sellerBadge = isDealer
        ? '<span class="split-card-badge split-card-badge--dealer">Forhandler</span>'
        : '<span class="split-card-badge split-card-badge--private">Privat</span>';

      // Afstand hvis Nær mig er aktiv
      let distStr = '';
      if (f.nearCoords && _mapPageGeocoded) {
        const g = _mapPageGeocoded.get(b.id);
        if (g) {
          const d = haversineKm(f.nearCoords, g.coords);
          distStr = (d < 1 ? d.toFixed(1) : Math.round(d)) + ' km';
        }
      }

      // Tag chips: type + år + stand (eller str. hvis intet)
      const chips = [];
      if (b.condition) chips.push(esc(b.condition));
      if (b.year)      chips.push(String(b.year));
      if (b.size)      chips.push('Str. ' + esc(b.size));

      return '<div class="split-card" data-bike-id="' + b.id + '" onclick="splitCardClick(\'' + b.id + '\')">'
        + '<div class="split-card-img">'
        + (primaryImg ? '<img src="' + primaryImg + '" alt="" loading="lazy">' : '<div class="split-card-img-placeholder">🚲</div>')
        + sellerBadge
        + '<button class="split-card-heart" onclick="event.stopPropagation();toggleSave(this,\'' + b.id + '\')" aria-label="Gem annonce">'
        + (_userSavedSet && _userSavedSet.has(b.id) ? '❤️' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.8s-7.5-4.6-7.5-11A4.5 4.5 0 0112 6a4.5 4.5 0 017.5 3.8c0 6.4-7.5 11-7.5 11z"/></svg>')
        + '</button>'
        + '</div>'
        + '<div class="split-card-body">'
        + '<div class="split-card-price">' + b.price.toLocaleString('da-DK') + ' kr.</div>'
        + '<div class="split-card-title">' + esc(b.brand || '') + ' ' + esc(b.model || '') + '</div>'
        + '<div class="split-card-meta">' + esc(b.type || '') + (b.year ? ' · ' + b.year : '') + '</div>'
        + '<div class="split-card-loc">'
        + '<span class="split-card-loc-city"><svg width="10" height="10" viewBox="0 0 24 24"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="currentColor"/></svg>' + esc(b.city || '–') + '</span>'
        + (distStr ? '<span class="split-card-loc-dist"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>' + distStr + '</span>' : '')
        + '</div>'
        + (chips.length ? '<div class="split-card-chips">' + chips.map(c => '<span class="split-card-chip">' + c + '</span>').join('') + '</div>' : '')
        + '<div class="split-card-cta">Se annonce →</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── splitCardClick ─────────────────────────────────────── */

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

  /* ── splitHighlightCard ─────────────────────────────────── */

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

  /* ── toggleSplitList ────────────────────────────────────── */

  function toggleSplitList() {
    const panel     = document.getElementById('split-list-panel');
    const splitWrap = document.getElementById('browse-split');
    if (!panel) return;
    _splitListVisible = !_splitListVisible;
    panel.classList.toggle('collapsed', !_splitListVisible);
    if (splitWrap) splitWrap.classList.toggle('list-open', _splitListVisible);
    // Mobil tab-state synkroniseres med sheet
    const tabMap  = document.getElementById('map-tab-map');
    const tabList = document.getElementById('map-tab-list');
    if (tabMap && tabList) {
      tabMap.classList.toggle('active', !_splitListVisible);
      tabList.classList.toggle('active', _splitListVisible);
    }
    // Genopfrisk toggle-tekst
    applyMapFilters();
    setTimeout(() => splitMapInstance && splitMapInstance.invalidateSize(), 280);
  }

  /* ── mapTabSwitch ───────────────────────────────────────── */

  // Mobil tab bar: Kort/Liste. Styrer sheet-åbning.
  function mapTabSwitch(target) {
    const wantList = target === 'list';
    if (wantList !== _splitListVisible) toggleSplitList();
  }

  /* ── openMapFiltersSheet ────────────────────────────────── */

  // Mobil filter-sheet: populeret dynamisk ud fra eksisterende filter-state
  function openMapFiltersSheet() {
    const sheet = document.getElementById('map-filter-sheet');
    const body  = document.getElementById('map-filter-sheet-body');
    if (!sheet || !body) return;

    const cur = {
      type:      document.getElementById('dd-bike-type')?.dataset.val || '',
      seller:    document.getElementById('dd-seller-type')?.dataset.val || 'all',
      condition: document.getElementById('dd-condition')?.dataset.val || '',
      radius:    document.getElementById('dd-radius')?.dataset.val || '25',
      priceMin:  document.getElementById('map-price-min')?.value || '',
      priceMax:  document.getElementById('map-price-max')?.value || '',
    };

    const groups = [
      { key:'type',      title:'Cykeltype',  opts:[['','Alle'],['Racercykel','Racercykel'],['Mountainbike','Mountainbike'],['Citybike','Citybike'],['El-cykel','El-cykel'],['Gravel','Gravel'],['Ladcykel','Ladcykel'],['Børnecykel','Børnecykel']] },
      { key:'seller',    title:'Sælger',     opts:[['all','Alle'],['private','Privat'],['dealer','Forhandler']] },
      { key:'condition', title:'Stand',      opts:[['','Alle'],['Ny','Ny'],['Som ny','Som ny'],['God stand','God stand'],['Brugt','Brugt']] },
      { key:'radius',    title:'Afstand',    opts:[['5','5 km'],['10','10 km'],['25','25 km'],['50','50 km'],['100','100 km'],['','Hele landet']] },
    ];

    body.innerHTML = groups.map(g => {
      const current = cur[g.key];
      return '<div class="msf-group">'
        + '<div class="msf-group-title">' + g.title.toUpperCase() + '</div>'
        + '<div class="msf-opts">'
        + g.opts.map(([val,label]) => {
            const selected = String(current) === String(val);
            return '<button type="button" class="msf-opt' + (selected ? ' active' : '') + '" data-g="' + g.key + '" data-v="' + esc(val) + '">' + esc(label) + '</button>';
          }).join('')
        + '</div>'
        + '</div>';
    }).join('')
    + '<div class="msf-group">'
    + '<div class="msf-group-title">PRIS</div>'
    + '<div class="msf-price">'
    + '<input type="number" id="msf-price-min" placeholder="Min kr" value="' + esc(cur.priceMin) + '">'
    + '<span>—</span>'
    + '<input type="number" id="msf-price-max" placeholder="Max kr" value="' + esc(cur.priceMax) + '">'
    + '</div>'
    + '</div>';

    body.querySelectorAll('.msf-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.g;
        const v = btn.dataset.v;
        body.querySelectorAll('.msf-opt[data-g="' + g + '"]').forEach(o => o.classList.remove('active'));
        btn.classList.add('active');
        const ddId = ({ type:'dd-bike-type', seller:'dd-seller-type', condition:'dd-condition', radius:'dd-radius' })[g];
        const labelMap = { type: body.querySelector('.msf-opt[data-g="type"][data-v="'+v+'"]')?.textContent, seller: body.querySelector('.msf-opt[data-g="seller"][data-v="'+v+'"]')?.textContent, condition: body.querySelector('.msf-opt[data-g="condition"][data-v="'+v+'"]')?.textContent, radius: body.querySelector('.msf-opt[data-g="radius"][data-v="'+v+'"]')?.textContent };
        if (ddId) resetMapDd(ddId, v, labelMap[g] || v);
        applyMapFilters(); updateMapFilterBadge();
      });
    });
    const syncPrice = (src, dst) => {
      if (!dst) return;
      dst.value = src.value;
      applyMapFilters(); updateMapFilterBadge();
    };
    const msfMin = document.getElementById('msf-price-min');
    const msfMax = document.getElementById('msf-price-max');
    if (msfMin) msfMin.addEventListener('input', () => syncPrice(msfMin, document.getElementById('map-price-min')));
    if (msfMax) msfMax.addEventListener('input', () => syncPrice(msfMax, document.getElementById('map-price-max')));

    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  /* ── closeMapFiltersSheet ───────────────────────────────── */

  function closeMapFiltersSheet() {
    const sheet = document.getElementById('map-filter-sheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ── initMap (legacy Leaflet map for list view) ─────────── */

  async function initMap() {
    // Initialiser kort første gang
    if (!mapInstance) {
      mapInstance = L.map('listings-map', { zoomControl: true }).setView([56.0, 10.0], 7);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(mapInstance);

      mapInstance.on('zoomend', function() {
        if (mapInstance.getZoom() < 11) mapInstance.closePopup();
      });

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
      .select('*, profiles(name, seller_type, shop_name, verified, address, lat, lng, location_precision)')
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
      .filter(function(b) { return !!b.city || (b.profiles && b.profiles.lat); })
      .map(function(b) {
        var profile = b.profiles || {};
        var isDealer = profile.seller_type === 'dealer';
        var dealerAddress = isDealer && profile.address && profile.address.trim();

        // Foretræk gemte koordinater fra profil (fra DAWA-autocomplete)
        var lookup;
        if (profile.lat && profile.lng) {
          lookup = Promise.resolve([profile.lat, profile.lng]);
        } else if (dealerAddress) {
          lookup = geocodeAddress(profile.address, b.city).then(function(coords) {
            return coords || geocodeCity(b.city);
          });
        } else {
          lookup = geocodeCity(b.city);
        }

        return lookup.then(function(coords) {
          var isPrecise = (profile.location_precision === 'exact') || (isDealer && !!dealerAddress);
          if (coords) addBikeMarker(b, coords, isPrecise);
        });
      });

    await Promise.all(geocodePromises);

    // Tilføj markører for verificerede forhandlere med adresse der IKKE allerede har en annonce-markør
    var dealerProfileResult = await supabase
      .from('profiles')
      .select('id, shop_name, name, city, address, lat, lng, location_precision')
      .eq('seller_type', 'dealer')
      .eq('verified', true);

    if (dealerProfileResult.data) {
      var dealerOnlyPromises = dealerProfileResult.data
        .filter(function(d) { return !dealersWithMarkers.has(d.id) && (d.lat || (d.address && d.city)); })
        .map(function(d) {
          var lookup = (d.lat && d.lng)
            ? Promise.resolve([d.lat, d.lng])
            : geocodeAddress(d.address, d.city).then(function(coords) { return coords || geocodeCity(d.city); });
          return lookup
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

  /* ── locateUser ─────────────────────────────────────────── */

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

  /* ── openFromMap / _openFromMap ─────────────────────────── */

  function openFromMap(bikeId) {
    navigateTo(`/bike/${bikeId}`);
  }

  function _openFromMap(bikeId) {
    // Luk kortpopup
    if (mapInstance) mapInstance.closePopup();
    // Åbn bike modal direkte uden at skifte visning
    setTimeout(function() { openBikeModal(bikeId); }, 100);
  }

  /* ── Custom dropdown helpers ────────────────────────────── */

  function toggleMapDd(event, id) {
    event.stopPropagation();
    const el = document.getElementById(id);
    if (!el || el.dataset.disabled === 'true') return;
    const isOpen = el.classList.contains('dd-open');
    document.querySelectorAll('.map-pill--dd.dd-open').forEach(d => d.classList.remove('dd-open'));
    if (!isOpen) el.classList.add('dd-open');
  }

  function pickMapDd(event, id, val, label) {
    event.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.val = val;
    const labelEl = el.querySelector('.map-dd-label');
    if (labelEl) labelEl.textContent = label;
    el.querySelectorAll('.map-dd-item').forEach(i => {
      i.classList.toggle('is-sel', i.dataset.val === val);
      i.setAttribute('aria-selected', i.dataset.val === val ? 'true' : 'false');
    });
    el.classList.remove('dd-open');
    applyMapFilters();
    updateMapFilterBadge();
  }

  function resetMapDd(id, val, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.val = val;
    const labelEl = el.querySelector('.map-dd-label');
    if (labelEl) labelEl.textContent = label;
    el.querySelectorAll('.map-dd-item').forEach(i => {
      i.classList.toggle('is-sel', i.dataset.val === val);
    });
    el.classList.remove('dd-open');
  }

  /* ── Public API ─────────────────────────────────────────── */

  return {
    toggleMapDd,
    pickMapDd,
    setView,
    renderMapPage,
    toggleMapNearMe,
    toggleMapBoundsFilter,
    applyMapBoundsSearch,
    resetMapFilters,
    toggleMapFilterPanel,
    splitCardClick,
    toggleSplitList,
    applyMapFilters,
    openMapFiltersSheet,
    closeMapFiltersSheet,
    mapTabSwitch,
    locateUser,
    openFromMap,
    _openFromMap,
  };
}
