export function createSearchAutocompleteHandlers({ supabase, esc, onSearchSubmit }) {
  let autocompleteTimeout = null;
  let autocompleteIndex = -1;

  async function searchAutocomplete(query) {
    clearTimeout(autocompleteTimeout);
    var list = document.getElementById('autocomplete-list');

    if (!query || query.length < 2) { list.style.display = 'none'; return; }

    autocompleteTimeout = setTimeout(async function() { // 300ms debounce
      var cleanQuery = query.replace(/[%_\\,.()"']/g, '');
      var result = await supabase
        .from('bikes')
        .select('brand, model, type, price')
        .eq('is_active', true)
        .or('brand.ilike.%' + cleanQuery + '%,model.ilike.%' + cleanQuery + '%')
        .limit(8);

      if (!result.data || result.data.length === 0) {
        list.innerHTML = '<div class="autocomplete-no-results">Ingen resultater for "<strong>' + esc(query) + '</strong>"</div>';
        list.style.display = 'block';
        return;
      }

      var seen = {};
      var items = result.data.filter(function(b) {
        var key = b.brand + ' ' + b.model;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });

      autocompleteIndex = -1;
      var safeQueryRegex = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      list.innerHTML = items.map(function(b, i) {
        var display     = esc(b.brand + ' ' + b.model);
        var highlighted = display.replace(new RegExp('(' + safeQueryRegex + ')', 'gi'), '<strong>$1</strong>');
        var selectVal   = (b.brand + ' ' + b.model).replace(/'/g, '');
        return '<div class="autocomplete-item" data-index="' + i + '" onclick="selectAutocomplete(\'' + selectVal + '\')">'
          + '🚲 ' + highlighted
          + '<span class="autocomplete-meta">' + esc(b.type) + ' · ' + b.price.toLocaleString('da-DK') + ' kr.</span>'
          + '</div>';
      }).join('');

      list.style.display = 'block';
    }, 300);
  }

  function selectAutocomplete(value) {
    document.getElementById('search-input').value = value;
    document.getElementById('autocomplete-list').style.display = 'none';
    onSearchSubmit();
  }

  function handleSearchKey(e) {
    var list  = document.getElementById('autocomplete-list');
    var items = list.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
    } else if (e.key === 'Enter') {
      if (autocompleteIndex >= 0) {
        items[autocompleteIndex].click();
      } else {
        list.style.display = 'none';
        onSearchSubmit();
      }
      return;
    } else if (e.key === 'Escape') {
      list.style.display = 'none'; return;
    }

    items.forEach(function(el, i) {
      el.classList.toggle('active', i === autocompleteIndex);
    });
  }

  function bindOutsideClickClose() {
    document.addEventListener('click', function(e) {
      const editOpen = document.getElementById('edit-modal')?.classList.contains('open');
      if (editOpen) {
        // Skip autocomplete handling when edit modal is open
      }
      if (!e.target.closest('#search-input') && !e.target.closest('#autocomplete-list')) {
        var list = document.getElementById('autocomplete-list');
        if (list) list.style.display = 'none';
      }
    });
  }

  return { searchAutocomplete, selectAutocomplete, handleSearchKey, bindOutsideClickClose };
}
