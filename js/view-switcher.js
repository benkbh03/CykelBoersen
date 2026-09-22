export function setMainView(view, deps) {
  const { initMap, setCurrentView } = deps;
  setCurrentView(view);

  var listGrid = document.getElementById('listings-grid');
  var mapDiv   = document.getElementById('listings-map');
  var btnList  = document.getElementById('btn-list-view');

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

export function showDetailView() {
  const landingLayout = document.getElementById('landing-layout');
  const pageLayout    = document.getElementById('page-layout');
  if (landingLayout) landingLayout.style.display = 'none';
  if (pageLayout)    pageLayout.style.display    = 'block';
  // Sikr at mobil-filter-drawer er lukket når man navigerer til detail-side
  const sidebar = document.getElementById('sidebar-filters');
  const overlay = document.getElementById('mobile-filter-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('open');
  if (document.body.classList.contains('mobile-filters-open')) {
    document.body.classList.remove('mobile-filters-open');
  }
}

/**
 * Viser forsiden. Returnerer et løfte der er indfriet når forsidens markup
 * står i DOM — på prerendrede undersider sendes den ikke med, så den skal
 * hentes først (se js/landing-hydrate.js). Kald der rører forside-elementer
 * bagefter, fx setBrowseCategory, skal vente på løftet.
 *
 * @param {Function} [sikrForside] () => Promise — henter og indsætter markup'en
 * @returns {Promise<void>}
 */
export function showListingView({ updateSEOMeta, removeBikeJsonLd, sikrForside } = {}) {
  const landingLayout = document.getElementById('landing-layout');
  const pageLayout    = document.getElementById('page-layout');
  document.body.classList.remove('is-mp-mobile');
  document.title = 'Cykelbørsen – Køb & Sælg Brugte Cykler i Danmark';
  if (updateSEOMeta) updateSEOMeta(null, '/');
  if (removeBikeJsonLd) removeBikeJsonLd();

  const vis = () => {
    if (pageLayout)    pageLayout.style.display    = 'none';
    if (landingLayout) landingLayout.style.display = '';
  };

  // Er forsiden allerede i dokumentet, skal der ikke ventes på noget — så
  // ville hvert logo-klik på selve forsiden koste en tom frame.
  if (!sikrForside || (landingLayout && landingLayout.children.length > 0)) {
    vis();
    return Promise.resolve();
  }

  // Byt først når markup'en er der. Den gamle side bliver stående et øjeblik,
  // hvilket er pænere end et tomt felt der fyldes bagefter.
  return Promise.resolve(sikrForside()).then(vis, vis);
}
