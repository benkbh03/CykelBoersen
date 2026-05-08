/* ============================================================
   ASSET LOADER — lazy injection af CSS og scripts
   ============================================================ */

const _cssLoaded = new Map();
const _jsLoaded = new Map();

/* Inject en stylesheet (idempotent). Returnerer Promise der resolve'r
   når CSS er loaded (eller med det samme hvis allerede loaded). */
export function loadCss(href) {
  if (_cssLoaded.has(href)) return _cssLoaded.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload  = () => resolve();
    link.onerror = () => reject(new Error('Kunne ikke loade CSS: ' + href));
    document.head.appendChild(link);
  });
  _cssLoaded.set(href, promise);
  return promise;
}

/* Load et script via dynamic <script> tag (til CDN-globals som Leaflet/Cropper).
   For ES-modules brug `import()` direkte. */
export function loadScript(src) {
  if (_jsLoaded.has(src)) return _jsLoaded.get(src);
  const promise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('Kunne ikke loade script: ' + src));
    document.body.appendChild(s);
  });
  _jsLoaded.set(src, promise);
  return promise;
}

/* Forudsigelige asset-bundles */
export function ensureLeaflet() {
  return Promise.all([
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
    loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'),
    loadCss('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'),
  ]).then(() => loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'))
    .then(() => loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'));
}

export function ensureCropper() {
  return Promise.all([
    loadCss('https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css'),
    loadScript('https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js'),
  ]);
}

/* Route-specifik CSS */
export function ensureProfilePageCss() { return loadCss('css/06-profile-page.css'); }
export function ensureMapCss()         { return loadCss('css/07-map.css'); }
