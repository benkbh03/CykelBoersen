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
    document.body.style.top = '';
  }
}

export function showListingView({ updateSEOMeta, removeBikeJsonLd } = {}) {
  const landingLayout = document.getElementById('landing-layout');
  const pageLayout    = document.getElementById('page-layout');
  if (pageLayout)    pageLayout.style.display    = 'none';
  if (landingLayout) landingLayout.style.display = '';
  document.body.classList.remove('is-mp-mobile');
  document.title = 'Cykelbørsen – Køb & Sælg Brugte Cykler i Danmark';
  if (updateSEOMeta) updateSEOMeta(null, '/');
  if (removeBikeJsonLd) removeBikeJsonLd();
}
