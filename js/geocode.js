/* ============================================================
   CYKELBØRSEN – js/geocode.js
   DAWA geocoding helpers with localStorage cache.
   ============================================================ */

var _geocodeCache = (function() {
  try {
    // v4: rydder stale null-entries fra v3 (null blev cachet permanent ved fejl)
    var stored = localStorage.getItem('_geocodeCache_v4');
    if (stored) return JSON.parse(stored);
    try {
      localStorage.removeItem('_geocodeCache');
      localStorage.removeItem('_geocodeCache_v2');
      localStorage.removeItem('_geocodeCache_v3');
    } catch (e) {}
    return {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache_v4', JSON.stringify(_geocodeCache)); } catch (e) {}
}

export function invalidateGeocodeEntry(key) {
  delete _geocodeCache[key];
  _saveGeocodeCache();
}

// Slå præcis dansk adresse op via DAWA (Danmarks Adressers Web API)
export function geocodeAddress(address, city) {
  var query = address.trim() + ', ' + city.trim();
  var key = 'dawa3:' + query.toLowerCase();
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  var datavaskUrl = 'https://api.dataforsyningen.dk/datavask/adresser?betegnelse='
    + encodeURIComponent(query);

  return fetch(datavaskUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.resultater || data.resultater.length === 0) return null;
      var id = data.resultater[0].adresse.id;
      return fetch('https://api.dataforsyningen.dk/adresser/' + id)
        .then(function(r) { return r.json(); })
        .then(function(adresse) {
          var koord = adresse.adgangsadresse.adgangspunkt.koordinater; // [lng, lat]
          var coords = [koord[1], koord[0]];
          _geocodeCache[key] = coords;
          _saveGeocodeCache();
          return coords;
        });
    })
    .catch(function() { return null; });
}

// Slå dansk by op via DAWA — vælger den største match via bbox-areal,
// falder tilbage på /postnumre hvis /steder ikke returnerer koordinater
export function geocodeCity(city) {
  var key = city.toLowerCase().trim();
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  return fetch('https://api.dataforsyningen.dk/steder?q='
    + encodeURIComponent(city) + '&hovedtype=Bebyggelse&per_side=10&format=json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var candidates = Array.isArray(data) ? data.filter(function(p) { return p.visueltcenter; }) : [];
      if (candidates.length > 0) {
        function bboxArea(p) {
          if (!p.bbox || p.bbox.length < 4) return 0;
          return Math.abs((p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]));
        }
        candidates.sort(function(a, b) { return bboxArea(b) - bboxArea(a); });
        var best = candidates[0];
        var coords = [best.visueltcenter[1], best.visueltcenter[0]];
        _geocodeCache[key] = coords;
        _saveGeocodeCache();
        return coords;
      }
      // Fallback: /postnumre endpoint
      return fetch('https://api.dataforsyningen.dk/postnumre?q='
        + encodeURIComponent(city) + '&per_side=5&format=json')
        .then(function(r) { return r.json(); })
        .then(function(pdata) {
          if (!Array.isArray(pdata) || pdata.length === 0) return null;
          var hit = pdata.find(function(p) { return p.visueltcenter; });
          if (!hit) return null;
          var coords = [hit.visueltcenter[1], hit.visueltcenter[0]];
          _geocodeCache[key] = coords;
          _saveGeocodeCache();
          return coords;
        });
    })
    .catch(function() { return null; });
}
