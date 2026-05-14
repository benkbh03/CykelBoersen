/* ============================================================
   CYKELBØRSEN – js/geocode.js
   DAWA geocoding helpers with localStorage cache.
   ============================================================ */

var _geocodeCache = (function() {
  try {
    // v7: skifter primær lookup fra /postnumre → /steder Bebyggelse for at
    // undgå at postnummer-polygoner med marine/industri-udvidelser (eks.
    // 2650 Hvidovre → Avedøre Holme + Køge Bugt) trækker centeret ud i havet.
    var stored = localStorage.getItem('_geocodeCache_v7');
    if (stored) return JSON.parse(stored);
    try {
      localStorage.removeItem('_geocodeCache');
      localStorage.removeItem('_geocodeCache_v2');
      localStorage.removeItem('_geocodeCache_v3');
      localStorage.removeItem('_geocodeCache_v4');
      localStorage.removeItem('_geocodeCache_v5');
      localStorage.removeItem('_geocodeCache_v6');
    } catch (e) {}
    return {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache_v7', JSON.stringify(_geocodeCache)); } catch (e) {}
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

// Slå dansk by op via DAWA — prøver /steder Bebyggelse først (bebyggelses-
// center = hvor folk bor), falder tilbage på /postnumre hvis stedet ikke
// findes som registreret bebyggelse.
//
// Hvorfor /steder først? Postnummer-polygoner kan strække sig ind i havet
// eller industri-områder (eks. 2650 Hvidovre dækker både Hvidovre by og
// Avedøre Holme + et stykke ud i Køge Bugt — polygonens visuelle center
// lander i bugten, ikke i byen). /steder?hovedtype=Bebyggelse returnerer
// derimod centeret for selve bebyggelsen, som per definition er på land.
export function geocodeCity(city) {
  var nameLower = city.toLowerCase().trim();
  var key = nameLower;
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  // Primær: /steder Bebyggelse — bebyggelses-center, altid på land
  return fetch('https://api.dataforsyningen.dk/steder?q='
    + encodeURIComponent(city) + '&hovedtype=Bebyggelse&per_side=20&format=json')
    .then(function(r) { return r.json(); })
    .then(function(sdata) {
      var candidates = Array.isArray(sdata) ? sdata.filter(function(p) { return p.visueltcenter; }) : [];
      if (candidates.length > 0) {
        // Foretræk eksakt navne-match — undgår partial matches som "Hvidovregade"
        var exact = candidates.filter(function(p) {
          return (p.primærtnavn || p.navn || '').toLowerCase() === nameLower;
        });
        var pool = exact.length > 0 ? exact : candidates;
        // Sorter efter indbyggerantal (største først) — håndterer fx flere
        // bebyggelser ved navn "Hvidovre" hvis de findes
        pool.sort(function(a, b) {
          return (b.indbyggerantal || 0) - (a.indbyggerantal || 0);
        });
        var best = pool[0];
        var coords = [best.visueltcenter[1], best.visueltcenter[0]];
        _geocodeCache[key] = coords;
        _saveGeocodeCache();
        return coords;
      }
      // Fallback: /postnumre — for ting der ikke er registreret som bebyggelse
      return fetch('https://api.dataforsyningen.dk/postnumre?q='
        + encodeURIComponent(city) + '&per_side=10&format=json')
        .then(function(r) { return r.json(); })
        .then(function(pdata) {
          if (!Array.isArray(pdata) || pdata.length === 0) return null;
          var withCenter = pdata.filter(function(p) { return p.visueltcenter; });
          if (withCenter.length === 0) return null;
          // Foretræk eksakt navne-match for postnumre også
          var exact = withCenter.filter(function(p) {
            return (p.navn || '').toLowerCase() === nameLower;
          });
          var hit = exact.length > 0 ? exact[0] : withCenter[0];
          var coords = [hit.visueltcenter[1], hit.visueltcenter[0]];
          _geocodeCache[key] = coords;
          _saveGeocodeCache();
          return coords;
        });
    })
    .catch(function() { return null; });
}
