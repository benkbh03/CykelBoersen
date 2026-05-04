/* ============================================================
   CYKELBØRSEN – js/geocode.js
   DAWA geocoding helpers with localStorage cache.
   ============================================================ */

var _geocodeCache = (function() {
  try {
    // v3: rydder stale v2-koordinater (fx Valby geocodede til Jutland i stedet for København)
    var stored = localStorage.getItem('_geocodeCache_v3');
    if (stored) return JSON.parse(stored);
    try { localStorage.removeItem('_geocodeCache'); localStorage.removeItem('_geocodeCache_v2'); } catch (e) {}
    return {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache_v3', JSON.stringify(_geocodeCache)); } catch (e) {}
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

// Slå dansk by op via DAWA — vælger den største match via bbox-areal
export function geocodeCity(city) {
  var key = city.toLowerCase().trim();
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  // Hent flere resultater og vælg den største — løser tvetydigheder som
  // "Valby" der både findes som lille bebyggelse v. Støvring og som stor
  // bydel i København. Vi bruger bbox-arealet som proxy for størrelse.
  return fetch('https://api.dataforsyningen.dk/steder?q='
    + encodeURIComponent(city) + '&hovedtype=Bebyggelse&per_side=10&format=json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) {
        _geocodeCache[key] = null;
        return null;
      }
      var candidates = data.filter(function(p) { return p.visueltcenter; });
      if (candidates.length === 0) {
        _geocodeCache[key] = null;
        return null;
      }
      function bboxArea(p) {
        if (!p.bbox || p.bbox.length < 4) return 0;
        return Math.abs((p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]));
      }
      candidates.sort(function(a, b) { return bboxArea(b) - bboxArea(a); });
      var best = candidates[0];
      var coords = [best.visueltcenter[1], best.visueltcenter[0]]; // [lat, lng]
      _geocodeCache[key] = coords;
      _saveGeocodeCache();
      return coords;
    })
    .catch(function() { return null; });
}
