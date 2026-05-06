/* ============================================================
   COLOR SWATCHES — multi-select chips med farveplette
   Bruges i opret/rediger-formular og sidebar-filter.
   ============================================================ */

import { BIKE_COLORS } from './config.js';

/**
 * Render swatches ind i et grid-element. Hvert swatch er en label med checkbox.
 * @param {HTMLElement} container — grid-elementet
 * @param {object} opts
 * @param {string[]} [opts.selected]   — valgte farver fra start
 * @param {string}   [opts.filterAttr] — sæt data-filter="<value>" på checkbox (sidebar-filter)
 * @param {Function} [opts.onChange]   — callback ved ændring
 * @param {string}   [opts.variant]    — 'chip' (sidebar-dot) eller 'tile' (fuld farve, form)
 * @param {number}   [opts.max]        — maks antal valgte (kun tile-variant)
 */
export function renderColorSwatches(container, { selected = [], filterAttr = null, onChange = null, variant = 'chip', max = null } = {}) {
  if (!container) return;
  const sel = new Set(selected);
  container.innerHTML = BIKE_COLORS.map(c => {
    const isOn = sel.has(c.name);
    const filterAttrHtml = filterAttr ? `data-filter="${filterAttr}" data-value="${c.name}"` : '';
    if (variant === 'tile') {
      return `
        <label class="color-swatch color-tile ${isOn ? 'is-on' : ''}" data-color="${c.name}" data-dark="${c.dark}" style="background:${c.hex};">
          <input type="checkbox" ${filterAttrHtml} value="${c.name}" ${isOn ? 'checked' : ''}>
          <span class="color-tile-label">${c.name}</span>
          <span class="color-tile-check" aria-hidden="true">✓</span>
        </label>
      `;
    }
    return `
      <label class="color-swatch ${isOn ? 'is-on' : ''}" data-color="${c.name}">
        <input type="checkbox" ${filterAttrHtml} value="${c.name}" ${isOn ? 'checked' : ''}>
        <span class="color-swatch-dot" style="background:${c.hex};"></span>
        <span class="color-swatch-label">${c.name}</span>
        <span class="filter-count">–</span>
      </label>
    `;
  }).join('');

  if (max !== null) _updateDisabled(container, max);

  container.addEventListener('change', (e) => {
    if (!e.target.matches('input[type="checkbox"]')) return;
    const cb = e.target;
    const checked = getSelectedColors(container);

    if (cb.checked && max !== null && checked.length > max) {
      cb.checked = false;
      cb.closest('.color-swatch')?.classList.remove('is-on');
      _flashMax(container, max);
      return;
    }

    cb.closest('.color-swatch')?.classList.toggle('is-on', cb.checked);
    if (max !== null) _updateDisabled(container, max);
    if (onChange) onChange(getSelectedColors(container));
  });
}

function _updateDisabled(container, max) {
  const checked = getSelectedColors(container);
  const atMax = checked.length >= max;
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (!cb.checked) {
      cb.closest('.color-swatch')?.classList.toggle('is-maxed', atMax);
    } else {
      cb.closest('.color-swatch')?.classList.remove('is-maxed');
    }
  });
  let hint = container.parentElement?.querySelector('.color-max-hint');
  if (atMax) {
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'color-max-hint';
      container.insertAdjacentElement('afterend', hint);
    }
    hint.textContent = `Maks ${max} farver valgt`;
  } else if (hint) {
    hint.remove();
  }
}

function _flashMax(container, max) {
  let hint = container.parentElement?.querySelector('.color-max-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'color-max-hint';
    container.insertAdjacentElement('afterend', hint);
  }
  hint.textContent = `Maks ${max} farver valgt`;
  hint.classList.add('is-flash');
  setTimeout(() => hint?.classList.remove('is-flash'), 600);
}

export function getSelectedColors(container) {
  if (!container) return [];
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

export function setSelectedColors(container, colors = []) {
  if (!container) return;
  const sel = new Set(colors);
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = sel.has(cb.value);
    cb.closest('.color-swatch')?.classList.toggle('is-on', cb.checked);
  });
}
