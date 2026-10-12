/* Forslag under søgefeltet på forsiden.

   Forslagene er filtre, ikke enkelte annoncer. Den gamle liste viste én
   række pr. annonce ("Centurion Helium isblå · 4.299 kr."), og på en telefon
   fyldte otte af dem skærmen uden at føre nogen vegne: man ville se alle
   Centurion, ikke vælge én annonce i blinde. Nu er rækkefølgen:

     Mærke    → sætter mærkefiltret i sidebaren (samme som at krydse af)
     Cykeltype → sætter typefiltret
     Model    → fritekstsøgning på "mærke model", grupperet med antal
     Søg efter »…« → den fritekstsøgning man ville have fået med Enter

   Mærke og type går gennem applyFilters(), så resultatet er et rigtigt
   filter: det vises som pille, kan gemmes som cykelagent og fjernes igen. */

// Ord folk skriver, som ikke står i typens navn.
const TYPE_SYNONYMS = {
  'Racercykel':   ['racer', 'landevej', 'road'],
  'Mountainbike': ['mtb', 'mountain'],
  'El-cykel':     ['el', 'elcykel', 'ebike', 'e-bike', 'elektrisk'],
  'Ladcykel':     ['lad', 'cargo', 'christiania', 'bakfiets'],
  'Børnecykel':   ['børn', 'barn', 'junior'],
  'Citybike':     ['city', 'by'],
  'Gravel':       ['grus'],
};

const MAX_BRANDS = 3;
const MAX_TYPES  = 2;
const MAX_MODELS = 4;

export function createSearchAutocompleteHandlers({ supabase, esc, onSearchSubmit, getBrowseCategory }) {
  let autocompleteTimeout = null;
  let autocompleteIndex = -1;
  let requestSeq = 0;

  const cleanText = s => String(s || '').replace(/[%_\\,.()"']/g, '').trim();
  const norm      = s => String(s || '').toLocaleLowerCase('da-DK');
  const plural    = n => n === 1 ? '1 annonce' : n.toLocaleString('da-DK') + ' annoncer';

  function highlight(text, query) {
    const safe = esc(text);
    const q = esc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!q) return safe;
    return safe.replace(new RegExp('(' + q + ')', 'gi'), '<strong>$1</strong>');
  }

  function filterInput(attr, value) {
    return [...document.querySelectorAll(`[data-filter="${attr}"]`)]
      .find(el => el.dataset.value === value) || null;
  }

  function countFromSidebar(input) {
    const raw = input?.closest('.filter-option')?.querySelector('.filter-count')?.textContent ?? '';
    const n = parseInt(raw.replace(/\./g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  // Typerne læses fra sidebaren, så Tilbehør-fanen foreslår tilbehørstyper.
  function matchTypes(query) {
    const q = norm(query);
    const out = [];
    document.querySelectorAll('[data-filter="type"]').forEach(input => {
      const value = input.dataset.value;
      if (!value) return;
      const hit = norm(value).includes(q)
        || (TYPE_SYNONYMS[value] || []).some(s => s.startsWith(q) || (q.length >= 3 && q.startsWith(s)));
      if (!hit) return;
      const count = countFromSidebar(input);
      if (count === 0) return;  // en type uden annoncer er en blindgyde
      out.push({ value, count });
    });
    return out.slice(0, MAX_TYPES);
  }

  function row(kind, value, label, meta) {
    return '<div class="autocomplete-item" role="option" data-kind="' + kind + '" data-value="' + esc(value) + '">'
      + '<span class="autocomplete-name">' + label + '</span>'
      + (meta ? '<span class="autocomplete-meta">' + meta + '</span>' : '')
      + '</div>';
  }

  const heading = text => '<div class="autocomplete-heading">' + text + '</div>';

  async function searchAutocomplete(query) {
    clearTimeout(autocompleteTimeout);
    const list = document.getElementById('autocomplete-list');
    const trimmed = String(query || '').trim();

    if (trimmed.length < 2) { list.style.display = 'none'; return; }

    autocompleteTimeout = setTimeout(async function() { // 250ms debounce
      const seq = ++requestSeq;
      const tokens = cleanText(trimmed).split(/\s+/).filter(Boolean);
      if (!tokens.length) { list.style.display = 'none'; return; }
      const first = tokens[0];
      const category = getBrowseCategory ? getBrowseCategory() : 'cykel';

      const result = await supabase
        .from('bikes')
        .select('brand, model')
        .eq('is_active', true)
        // Forslag matcher den aktive fane (Cykler | Tilbehør) — aldrig på tværs
        .eq('category', category)
        .or('brand.ilike.%' + first + '%,model.ilike.%' + first + '%')
        .limit(500);

      if (seq !== requestSeq) return;  // et nyere tastetryk er på vej

      const rows = result.data || [];
      const q = norm(tokens.join(' '));

      // Mærker: tal hvor mange annoncer hvert mærke har blandt træfferne.
      const brandCounts = new Map();
      rows.forEach(b => {
        const brand = (b.brand || '').trim();
        if (!brand) return;
        const nb = norm(brand);
        if (nb.includes(q) || q.startsWith(nb + ' ')) brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
      });
      const brands = [...brandCounts]
        .sort((a, b) => (norm(b[0]).startsWith(q) - norm(a[0]).startsWith(q)) || (b[1] - a[1]))
        .slice(0, MAX_BRANDS);

      // Modeller: mærke + model skal indeholde alle ord, grupperet med antal.
      const modelCounts = new Map();
      rows.forEach(b => {
        const name = ((b.brand || '') + ' ' + (b.model || '')).replace(/\s+/g, ' ').trim();
        const n = norm(name);
        if (!tokens.every(t => n.includes(norm(t)))) return;
        // Et rent mærketræf står allerede under Mærke.
        if (!norm(b.model).includes(norm(first)) && tokens.length === 1) return;
        modelCounts.set(name, (modelCounts.get(name) || 0) + 1);
      });
      const models = [...modelCounts].sort((a, b) => b[1] - a[1]).slice(0, MAX_MODELS);

      const types = matchTypes(trimmed);

      let html = '';
      if (brands.length) {
        html += heading('Mærke');
        html += brands.map(([brand, n]) => row('brand', brand, highlight(brand, trimmed), plural(n))).join('');
      }
      if (types.length) {
        html += heading('Type');
        html += types.map(t => row('type', t.value, highlight(t.value, trimmed), t.count ? plural(t.count) : '')).join('');
      }
      if (models.length) {
        html += heading('Model');
        html += models.map(([name, n]) => row('text', name, highlight(name, trimmed), plural(n))).join('');
      }
      html += row('text', trimmed, 'Søg efter »' + esc(trimmed) + '«', '');

      autocompleteIndex = -1;
      list.innerHTML = html;
      list.style.display = 'block';
    }, 250);
  }

  function closeList() {
    const list = document.getElementById('autocomplete-list');
    if (list) list.style.display = 'none';
  }

  // Lukker tastaturet på telefonen, så resultaterne kan ses.
  function blurSearch() {
    document.getElementById('search-input')?.blur();
  }

  function applyFilterChoice(attr, value) {
    const input = filterInput(attr, value);
    if (!input || typeof window.applyFilters !== 'function') return false;
    // Ét valg ad gangen: man skrev ét mærke og forventer at se netop det.
    document.querySelectorAll(`[data-filter="${attr}"]`).forEach(cb => { cb.checked = false; });
    input.checked = true;
    const search = document.getElementById('search-input');
    if (search) search.value = '';
    closeList();
    blurSearch();
    window.applyFilters();
    document.getElementById('listings-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function selectAutocomplete(value) {
    document.getElementById('search-input').value = value;
    closeList();
    blurSearch();
    onSearchSubmit();
  }

  function chooseItem(el) {
    const kind  = el.dataset.kind;
    const value = el.dataset.value || '';
    if (kind === 'brand' && applyFilterChoice('brand', value)) return;
    if (kind === 'type'  && applyFilterChoice('type', value))  return;
    // Mærke uden afkrydsningsfelt (fx under "Andre") falder tilbage til fritekst.
    selectAutocomplete(value);
  }

  function handleSearchKey(e) {
    const list  = document.getElementById('autocomplete-list');
    const items = list.querySelectorAll('.autocomplete-item');

    if (e.key === 'Enter') {
      if (items.length && autocompleteIndex >= 0 && list.style.display !== 'none') {
        chooseItem(items[autocompleteIndex]);
      } else {
        clearTimeout(autocompleteTimeout);
        requestSeq++;
        closeList();
        blurSearch();
        onSearchSubmit();
      }
      return;
    }
    if (e.key === 'Escape') { closeList(); return; }
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
    } else {
      return;
    }

    items.forEach(function(el, i) {
      el.classList.toggle('active', i === autocompleteIndex);
    });
  }

  function bindOutsideClickClose() {
    document.getElementById('autocomplete-list')?.addEventListener('click', function(e) {
      const item = e.target.closest('.autocomplete-item');
      if (item) chooseItem(item);
    });
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#search-input') && !e.target.closest('#autocomplete-list')) closeList();
    });
  }

  return { searchAutocomplete, selectAutocomplete, handleSearchKey, bindOutsideClickClose };
}
