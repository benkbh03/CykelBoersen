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
