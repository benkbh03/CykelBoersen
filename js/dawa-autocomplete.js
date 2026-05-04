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

function _positionDawaDropdown(input, dropdown) {
  const rect = input.getBoundingClientRect();
  dropdown.style.top   = (rect.bottom + 4) + 'px';
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
    delete input.dataset.dawaLat;
    delete input.dataset.dawaLng;
    delete input.dataset.dawaPostcode;

    const q = (input.value || '').trim();
    if (q.length < 2) { _closeDawaDropdown(); return; }

    clearTimeout(_dawaDebounce.get(input));
    _setDawaLoading(input);
    _dawaDebounce.set(input, setTimeout(async () => {
      try {
        const res = await fetch('https://api.dataforsyningen.dk/steder?q='
          + encodeURIComponent(q) + '&hovedtype=Bebyggelse&per_side=20&format=json');
        if (!res.ok) { _renderDawaDropdown(input, [], () => {}, 'Ingen byer fundet'); return; }
        const data = await res.json();
        if (!Array.isArray(data)) { _renderDawaDropdown(input, [], () => {}, 'Ingen byer fundet'); return; }
        function bboxArea(p) {
          if (!p.bbox || p.bbox.length < 4) return 0;
          return Math.abs((p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]));
        }
        const seen = new Set();
        const items = [];
        const sorted = data.slice().sort((a, b) => bboxArea(b) - bboxArea(a));
        for (const p of sorted) {
          const name = (p.primærtnavn || (typeof p.navn === 'string' ? p.navn : '')).trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const vc = p.visueltcenter;
          if (!vc || vc.length < 2) continue;
          items.push({
            label: name,
            city:  name,
            lat:   vc[1],
            lng:   vc[0],
          });
          if (items.length >= 12) break;
        }
        _renderDawaDropdown(input, items, (picked) => {
          input.value = picked.city;
          input.dataset.dawaLat = String(picked.lat);
          input.dataset.dawaLng = String(picked.lng);
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

