/* ============================================================
   CYKELBØRSEN – js/geocode.js
   Danske by-koordinater + DAWA-fallback med localStorage-cache.
   ============================================================ */

/* Hardcoded by-centre for kendte danske byer. Bruges som første lookup
   før DAWA — fordi DAWA's polygon-baserede 'visueltcenter' kan lande i
   havet for kystbyer hvor postnummeret eller bebyggelses-polygonen
   strækker sig ud i vand (eks. 2670 Greve, 2650 Hvidovre, 2300 KBH S).
   Hardcoded centre er taget fra Wikipedia/Geonames og peger på selve
   byens centrum/torv — ikke postnummer-polygonens midtpunkt.
   Nøgler er lowercase + trimmed.
   Værdier er [lat, lng] (WGS84). */
const KNOWN_CITY_CENTERS = {
  // ── Storkøbenhavn ───────────────────────────────────
  'københavn':       [55.6761, 12.5683],
  'kobenhavn':       [55.6761, 12.5683],
  'københavn k':     [55.6797, 12.5832],
  'københavn s':     [55.6584, 12.6097],
  'københavn n':     [55.6928, 12.5440],
  'københavn v':     [55.6669, 12.5446],
  'københavn ø':     [55.7066, 12.5680],
  'københavn nv':    [55.7008, 12.5119],
  'københavn sv':    [55.6520, 12.5170],
  'frederiksberg':   [55.6788, 12.5359],
  'valby':           [55.6628, 12.4969],
  'vanløse':         [55.6889, 12.4878],
  'brønshøj':        [55.7008, 12.4924],
  'nørrebro':        [55.6928, 12.5440],
  'vesterbro':       [55.6669, 12.5446],
  'østerbro':        [55.7066, 12.5680],
  'amager':          [55.6584, 12.6097],
  'sydhavn':         [55.6520, 12.5470],
  'sydhavnen':       [55.6520, 12.5470],
  // ── Vestegnen + Sydsjælland ─────────────────────────
  'hvidovre':        [55.6498, 12.4736],
  'rødovre':         [55.6859, 12.4585],
  'brøndby':         [55.6481, 12.4172],
  'brøndby strand':  [55.6166, 12.4022],
  'glostrup':        [55.6663, 12.4036],
  'albertslund':     [55.6917, 12.3622],
  'vallensbæk':      [55.6256, 12.3839],
  'ishøj':           [55.6147, 12.3528],
  'taastrup':        [55.6500, 12.3000],
  'høje-taastrup':   [55.6500, 12.3000],
  'høje taastrup':   [55.6500, 12.3000],
  'greve':           [55.5859, 12.2997],
  'greve strand':    [55.5859, 12.2997],
  'solrød':          [55.5350, 12.2056],
  'solrød strand':   [55.5325, 12.2056],
  'køge':            [55.4584, 12.1820],
  'hundige':         [55.6024, 12.2940],
  // ── Nordsjælland + Vest ─────────────────────────────
  'ballerup':        [55.7308, 12.3622],
  'herlev':          [55.7271, 12.4391],
  'gladsaxe':        [55.7269, 12.4889],
  'søborg':          [55.7261, 12.5031],
  'bagsværd':        [55.7619, 12.4625],
  'værløse':         [55.7846, 12.3686],
  'farum':           [55.8095, 12.3711],
  'smørum':          [55.7350, 12.2911],
  'lyngby':          [55.7705, 12.5046],
  'kongens lyngby':  [55.7705, 12.5046],
  'hellerup':        [55.7286, 12.5734],
  'gentofte':        [55.7569, 12.5567],
  'charlottenlund':  [55.7505, 12.5778],
  'klampenborg':     [55.7693, 12.5944],
  'kastrup':         [55.6306, 12.6394],
  'dragør':          [55.5933, 12.6750],
  'tårnby':          [55.6306, 12.6217],
  'nivå':            [55.9295, 12.4878],
  'allerød':         [55.8682, 12.3667],
  'birkerød':        [55.8389, 12.4308],
  'hørsholm':        [55.8810, 12.5095],
  'hillerød':        [55.9285, 12.3001],
  'helsingør':       [56.0361, 12.6136],
  'fredensborg':     [55.9742, 12.4042],
  'frederikssund':   [55.8398, 12.0658],
  // ── Roskilde + Vestsjælland ─────────────────────────
  'roskilde':        [55.6418, 12.0876],
  'holbæk':          [55.7177, 11.7193],
  'kalundborg':      [55.6814, 11.0900],
  'slagelse':        [55.4032, 11.3556],
  'sorø':            [55.4338, 11.5567],
  'ringsted':        [55.4435, 11.7906],
  'næstved':         [55.2280, 11.7616],
  'vordingborg':     [55.0083, 11.9105],
  'maribo':          [54.7745, 11.5006],
  'nakskov':         [54.8331, 11.1397],
  'nykøbing falster':[54.7686, 11.8744],
  'nykøbing f':      [54.7686, 11.8744],
  'nykøbing sjælland':[55.9268, 11.6692],
  // ── Fyn ─────────────────────────────────────────────
  'odense':          [55.3959, 10.3883],
  'svendborg':       [55.0584, 10.6076],
  'faaborg':         [55.1003, 10.2418],
  'nyborg':          [55.3127, 10.7867],
  'middelfart':      [55.5006, 9.7438],
  'bogense':         [55.5642, 10.0853],
  // ── Jylland Nord ────────────────────────────────────
  'aalborg':         [57.0488, 9.9217],
  'aalborg ø':       [57.0488, 9.9520],
  'aalborg sø':      [57.0337, 9.9300],
  'nørresundby':     [57.0610, 9.9230],
  'hjørring':        [57.4631, 9.9826],
  'frederikshavn':   [57.4385, 10.5439],
  'skagen':          [57.7237, 10.5826],
  'hobro':           [56.6422, 9.7944],
  'thisted':         [56.9550, 8.6939],
  'brønderslev':     [57.2691, 9.9510],
  // ── Jylland Midt ────────────────────────────────────
  'aarhus':          [56.1572, 10.2107],
  'århus':           [56.1572, 10.2107],
  'randers':         [56.4607, 10.0369],
  'silkeborg':       [56.1816, 9.5663],
  'skanderborg':     [56.0354, 9.9285],
  'viborg':          [56.4530, 9.4023],
  'horsens':         [55.8607, 9.8503],
  'herning':         [56.1395, 8.9748],
  'holstebro':       [56.3603, 8.6160],
  'skive':           [56.5664, 9.0271],
  'struer':          [56.4912, 8.5907],
  'lemvig':          [56.5499, 8.3097],
  'ringkøbing':      [56.0904, 8.2418],
  'ikast':           [56.1387, 9.1568],
  'mariager':        [56.6504, 9.9826],
  'odder':           [55.9742, 10.1538],
  'ebeltoft':        [56.1939, 10.6815],
  'grenaa':          [56.4156, 10.8807],
  'grenå':           [56.4156, 10.8807],
  // ── Jylland Syd ─────────────────────────────────────
  'esbjerg':         [55.4661, 8.4519],
  'kolding':         [55.4904, 9.4720],
  'vejle':           [55.7090, 9.5365],
  'fredericia':      [55.5657, 9.7530],
  'aabenraa':        [55.0440, 9.4180],
  'sønderborg':      [54.9135, 9.7900],
  'tønder':          [54.9335, 8.8636],
  'haderslev':       [55.2496, 9.4904],
  'ribe':            [55.3242, 8.7654],
  'varde':           [55.6228, 8.4801],
  'grindsted':       [55.7572, 8.9279],
  'billund':         [55.7333, 9.1144],
  'vejen':           [55.4807, 9.1428],
  'brørup':          [55.4811, 9.0119],
  'bramming':        [55.4694, 8.6981],
  // ── Bornholm ────────────────────────────────────────
  'rønne':           [55.1009, 14.7065],
  'nexø':            [55.0626, 15.1306],
  'aakirkeby':       [55.0700, 14.9214],
  'allinge':         [55.2697, 14.8000],
};

var _geocodeCache = (function() {
  try {
    // v8: tilføjer hardcoded by-centre som primær kilde — rydder stale entries
    var stored = localStorage.getItem('_geocodeCache_v8');
    if (stored) return JSON.parse(stored);
    try {
      localStorage.removeItem('_geocodeCache');
      localStorage.removeItem('_geocodeCache_v2');
      localStorage.removeItem('_geocodeCache_v3');
      localStorage.removeItem('_geocodeCache_v4');
      localStorage.removeItem('_geocodeCache_v5');
      localStorage.removeItem('_geocodeCache_v6');
      localStorage.removeItem('_geocodeCache_v7');
    } catch (e) {}
    return {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache_v8', JSON.stringify(_geocodeCache)); } catch (e) {}
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

/* Normaliserer by-input til match mod KNOWN_CITY_CENTERS:
   - lowercase + trim
   - fjerner postnummer-prefix ("2670 Greve" → "greve")
   - fjerner kommune-suffix ("Greve, Greve Kommune" → "greve") */
function _normalizeCity(city) {
  return city
    .toLowerCase()
    .trim()
    .replace(/^\d{4}\s+/, '')
    .replace(/,.*$/, '')
    .trim();
}

// Slå dansk by op — hardcoded liste først, derefter DAWA /steder, så /postnumre
export function geocodeCity(city) {
  var nameLower = _normalizeCity(city);
  var key = nameLower;
  if (_geocodeCache[key] !== undefined) return Promise.resolve(_geocodeCache[key]);

  // 1) Hardcoded lookup — kendte byer med pålidelige centre
  if (KNOWN_CITY_CENTERS[nameLower]) {
    var coords = KNOWN_CITY_CENTERS[nameLower];
    _geocodeCache[key] = coords;
    _saveGeocodeCache();
    return Promise.resolve(coords);
  }

  // 2) DAWA /steder Bebyggelse — bebyggelses-center er på land
  //    Foretrækker undertype 'By' eller 'Bydel' over andre typer (Strandby,
  //    Sommerhusområde osv. kan have polygon-centre i kystvand).
  return fetch('https://api.dataforsyningen.dk/steder?q='
    + encodeURIComponent(city) + '&hovedtype=Bebyggelse&per_side=30&format=json')
    .then(function(r) { return r.json(); })
    .then(function(sdata) {
      var candidates = Array.isArray(sdata) ? sdata.filter(function(p) { return p.visueltcenter; }) : [];
      if (candidates.length > 0) {
        var coords = _pickBestSted(candidates, nameLower);
        if (coords) {
          _geocodeCache[key] = coords;
          _saveGeocodeCache();
          return coords;
        }
      }
      // 3) Fallback: /postnumre
      return fetch('https://api.dataforsyningen.dk/postnumre?q='
        + encodeURIComponent(city) + '&per_side=10&format=json')
        .then(function(r) { return r.json(); })
        .then(function(pdata) {
          if (!Array.isArray(pdata) || pdata.length === 0) return null;
          var withCenter = pdata.filter(function(p) { return p.visueltcenter; });
          if (withCenter.length === 0) return null;
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

/* Vælg det bedste /steder-resultat efter trinvis filtrering:
   1. Eksakt navn + undertype 'By' (rigtig by)
   2. Eksakt navn + undertype 'Bydel' (bydel som Valby)
   3. Eksakt navn + anden Bebyggelse-undertype
   4. Højeste indbyggerantal blandt resterende kandidater
   Hver gruppe sorteres efter indbyggerantal faldende. */
function _pickBestSted(candidates, nameLower) {
  function name(p) { return (p.primærtnavn || p.navn || '').toLowerCase(); }
  function byPop(a, b) { return (b.indbyggerantal || 0) - (a.indbyggerantal || 0); }

  var exactBy     = candidates.filter(function(p) { return name(p) === nameLower && p.undertype === 'By'; }).sort(byPop);
  var exactBydel  = candidates.filter(function(p) { return name(p) === nameLower && p.undertype === 'Bydel'; }).sort(byPop);
  var exactOther  = candidates.filter(function(p) { return name(p) === nameLower && p.undertype !== 'By' && p.undertype !== 'Bydel'; }).sort(byPop);
  var anyByOrBydel= candidates.filter(function(p) { return p.undertype === 'By' || p.undertype === 'Bydel'; }).sort(byPop);
  var all         = candidates.slice().sort(byPop);

  var best = exactBy[0] || exactBydel[0] || exactOther[0] || anyByOrBydel[0] || all[0];
  return best ? [best.visueltcenter[1], best.visueltcenter[0]] : null;
}
