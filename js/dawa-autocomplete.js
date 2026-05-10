import { esc } from './utils.js';

const _dawaDebounce = new WeakMap();
let _dawaActive = null; // { input, dropdown }

function _closeDawaDropdown() {
  if (_dawaActive && _dawaActive.dropdown?.parentNode) {
    _dawaActive.dropdown.remove();
  }
  _dawaActive = null;
}

document.addEventListener('click', (e) => {
  if (_dawaActive && !_dawaActive.input.contains(e.target) && !_dawaActive.dropdown.contains(e.target)) {
    _closeDawaDropdown();
  }
});
document.addEventListener('scroll', (e) => {
  if (_dawaActive && !_dawaActive.dropdown.contains(e.target)) {
    _positionDawaDropdown(_dawaActive.input, _dawaActive.dropdown);
  }
}, true);
window.addEventListener('resize', () => {
  if (_dawaActive) _positionDawaDropdown(_dawaActive.input, _dawaActive.dropdown);
  document.body.classList.toggle('is-mp-mobile', window.innerWidth <= 768);
});
// iOS Safari fyrer kun 'resize' på window når layout-viewport ændres,
// ikke når tastatur-popup ændrer den synlige viewport. visualViewport
// fanger tastatur-events korrekt så dropdown kan flippe over input.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (_dawaActive) _positionDawaDropdown(_dawaActive.input, _dawaActive.dropdown);
  });
  window.visualViewport.addEventListener('scroll', () => {
    if (_dawaActive) _positionDawaDropdown(_dawaActive.input, _dawaActive.dropdown);
  });
}

function _positionDawaDropdown(input, dropdown) {
  const rect = input.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewportTop    = vv ? vv.offsetTop : 0;
  const viewportHeight = vv ? vv.height    : window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;

  // Estimer dropdown-højde — brug målt højde hvis renderet, ellers max-height fra CSS (280px)
  const measured = dropdown.offsetHeight;
  const dropdownHeight = (measured > 0 ? measured : 280);
  const SPACING = 4;

  const spaceBelow = viewportBottom - rect.bottom;
  const spaceAbove = rect.top - viewportTop;

  // Hvis tastatur (eller bunden af viewport) skjuler dropdown under input,
  // og der er mere plads over input, så vend dropdown'en op.
  if (spaceBelow < dropdownHeight + SPACING && spaceAbove > spaceBelow) {
    dropdown.style.top = (rect.top - dropdownHeight - SPACING) + 'px';
  } else {
    dropdown.style.top = (rect.bottom + SPACING) + 'px';
  }
  dropdown.style.left  = rect.left + 'px';
  dropdown.style.width = rect.width + 'px';
}

function _renderDawaDropdown(input, items, onPick, emptyMsg) {
  if (_dawaActive && _dawaActive.input !== input) _closeDawaDropdown();

  let dropdown = _dawaActive?.dropdown;
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'dawa-autocomplete-dropdown';
    document.body.appendChild(dropdown);
    _dawaActive = { input, dropdown, index: -1, items };
  }
  _dawaActive.items = items;
  _dawaActive.index = -1;

  if (!items || items.length === 0) {
    dropdown.innerHTML = `<div class="dawa-autocomplete-empty">${emptyMsg || 'Ingen resultater'}</div>`;
  } else {
    dropdown.innerHTML = items.map((item, i) =>
      `<div class="dawa-autocomplete-item" data-index="${i}">${esc(item.label)}</div>`
    ).join('');
    dropdown.querySelectorAll('.dawa-autocomplete-item').forEach((el) => {
      let handled = false;
      const handlePick = (e) => {
        if (handled) return;
        handled = true;
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(el.dataset.index, 10);
        const picked = _dawaActive?.items?.[idx];
        if (picked) { onPick(picked); _closeDawaDropdown(); }
      };
      el.addEventListener('mousedown', handlePick);
      el.addEventListener('click', handlePick);
      el.addEventListener('touchend', handlePick);
    });
  }
  _positionDawaDropdown(input, dropdown);
}

function _setDawaLoading(input) {
  if (_dawaActive && _dawaActive.input !== input) _closeDawaDropdown();
  let dropdown = _dawaActive?.dropdown;
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'dawa-autocomplete-dropdown';
    document.body.appendChild(dropdown);
    _dawaActive = { input, dropdown, index: -1, items: [] };
  }
  dropdown.innerHTML = `<div class="dawa-autocomplete-loading">Søger…</div>`;
  _positionDawaDropdown(input, dropdown);
}

export function attachAddressAutocomplete(input, onSelect) {
  if (!input || input._dawaAttached) return;
  input._dawaAttached = true;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');

  const handleInput = () => {
    // Nye taster → ryd gemte koordinater indtil bruger vælger fra dropdown
    delete input.dataset.dawaLat;
    delete input.dataset.dawaLng;
    delete input.dataset.dawaPostcode;
    delete input.dataset.dawaCity;
    delete input.dataset.dawaFull;

    const q = (input.value || '').trim();
    if (q.length < 2) { _closeDawaDropdown(); return; }

    clearTimeout(_dawaDebounce.get(input));
    _setDawaLoading(input);
    _dawaDebounce.set(input, setTimeout(async () => {
      try {
        const res = await fetch('https://api.dataforsyningen.dk/autocomplete?type=adresse&per_side=8&q=' + encodeURIComponent(q));
        const data = await res.json();
        if (!Array.isArray(data)) { _renderDawaDropdown(input, [], () => {}, 'Ingen adresser fundet'); return; }
        const items = data.map(r => {
          const a = r.data || {};
          return {
            label:       r.tekst || '',
            street:      a.vejnavn || '',
            houseNumber: [a.husnr, a.etage, a.dør].filter(Boolean).join(' ').trim() || a.husnr || '',
            postcode:    a.postnr  || '',
            city:        a.postnrnavn || '',
            lat:         typeof a.y === 'number' ? a.y : null,
            lng:         typeof a.x === 'number' ? a.x : null,
            adresseId:   a.id || '',
            fullAddress: (a.vejnavn && a.husnr ? `${a.vejnavn} ${a.husnr}` : r.tekst || '').trim(),
          };
        }).filter(it => it.fullAddress);

        _renderDawaDropdown(input, items, async (picked) => {
          input.value = picked.fullAddress;
          // If autocomplete didn't include coords, fetch from full adresse endpoint
          if ((!picked.lat || !picked.lng) && picked.adresseId) {
            try {
              const r2 = await fetch('https://api.dataforsyningen.dk/adresser/' + picked.adresseId);
              const full = await r2.json();
              if (full && full.adgangspunkt && full.adgangspunkt.koordinater) {
                picked.lng = full.adgangspunkt.koordinater[0];
                picked.lat = full.adgangspunkt.koordinater[1];
              }
            } catch (_) {}
          }
          if (picked.lat)      input.dataset.dawaLat      = String(picked.lat);
          if (picked.lng)      input.dataset.dawaLng      = String(picked.lng);
          if (picked.postcode) input.dataset.dawaPostcode = picked.postcode;
          if (picked.city)     input.dataset.dawaCity     = picked.city;
          input.dataset.dawaFull = picked.label;
          if (typeof onSelect === 'function') onSelect(picked);
        }, 'Ingen adresser fundet');
      } catch (e) {
        _renderDawaDropdown(input, [], () => {}, 'Kunne ikke hente adresser');
      }
    }, 220));
  };

  input.addEventListener('input', handleInput);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) handleInput(); });
  input.addEventListener('keydown', _dawaKeyHandler);
}

export function attachCityAutocomplete(input, onSelect) {
  if (!input || input._dawaAttached) return;
  input._dawaAttached = true;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');

  const handleInput = () => {
    if (input._dawaPicking) return;
    delete input.dataset.dawaLat;
    delete input.dataset.dawaLng;
    delete input.dataset.dawaPostcode;

    const q = (input.value || '').trim();
    if (q.length < 2) { _closeDawaDropdown(); return; }

    clearTimeout(_dawaDebounce.get(input));
    _setDawaLoading(input);
    _dawaDebounce.set(input, setTimeout(async () => {
      try {
        const url = `https://api.dataforsyningen.dk/postnumre?q=${encodeURIComponent(q)}&per_side=12&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data)) { _renderDawaDropdown(input, [], () => {}, 'Ingen byer fundet'); return; }

        const seen = new Set();
        const items = [];
        for (const r of data) {
          const cityName = (r.navn || '').trim();
          const postnr   = String(r.nr || '').trim();
          if (!cityName || !postnr) continue;
          const key = postnr + '|' + cityName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const vc  = r.visueltcenter; // [lng, lat]
          const lat = Array.isArray(vc) ? vc[1] : null;
          const lng = Array.isArray(vc) ? vc[0] : null;
          items.push({ label: `${postnr} ${cityName}`, city: cityName, postcode: postnr, lat, lng });
        }

        _renderDawaDropdown(input, items, (picked) => {
          input._dawaPicking = true;
          input.value = picked.city;
          if (picked.lat)      input.dataset.dawaLat      = String(picked.lat);
          if (picked.lng)      input.dataset.dawaLng      = String(picked.lng);
          if (picked.postcode) input.dataset.dawaPostcode = picked.postcode;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input._dawaPicking = false;
          if (typeof onSelect === 'function') onSelect(picked);
        }, 'Ingen byer fundet');
      } catch (e) {
        _renderDawaDropdown(input, [], () => {}, 'Ingen byer fundet');
      }
    }, 220));
  };

  input.addEventListener('input', handleInput);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) handleInput(); });
  input.addEventListener('keydown', _dawaKeyHandler);
}

function _dawaKeyHandler(e) {
  if (!_dawaActive || _dawaActive.input !== e.target) return;
  const items = _dawaActive.items || [];
  if (e.key === 'Escape') { _closeDawaDropdown(); return; }
  if (!items.length) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    _dawaActive.index = e.key === 'ArrowDown'
      ? Math.min(items.length - 1, _dawaActive.index + 1)
      : Math.max(0, _dawaActive.index - 1);
    _dawaActive.dropdown.querySelectorAll('.dawa-autocomplete-item').forEach((el, i) => {
      el.classList.toggle('active', i === _dawaActive.index);
    });
  } else if (e.key === 'Enter' && _dawaActive.index >= 0) {
    e.preventDefault();
    const el = _dawaActive.dropdown.querySelector(`.dawa-autocomplete-item[data-index="${_dawaActive.index}"]`);
    if (el) el.dispatchEvent(new MouseEvent('mousedown'));
  }
}

// Udtræk lat/lng/postcode/city fra input efter bruger har valgt fra autocomplete
export function readDawaData(input) {
  if (!input) return {};
  return {
    lat:      input.dataset.dawaLat ? parseFloat(input.dataset.dawaLat) : null,
    lng:      input.dataset.dawaLng ? parseFloat(input.dataset.dawaLng) : null,
    postcode: input.dataset.dawaPostcode || null,
    city:     input.dataset.dawaCity || null,
  };
}
