/* ============================================================
   SAMMENLIGNINGSVÆRKTØJ — vælg 2-3 cykler, se specs side-by-side
   ============================================================
   - Brugeren tjekker "Sammenlign" på 2-3 bike-cards
   - En flydende bar i bunden viser valgte cykler + "Sammenlign"-knap
   - /sammenlign?ids=A,B,C viser specs i en kolonne-tabel
   - State i sessionStorage (slettes når browseren lukkes)
   ============================================================ */

import { esc } from './utils.js';

const STORAGE_KEY = 'cb_compare_ids';
const MAX_COMPARE = 3;

/* ---------- State helpers ---------- */

export function getCompareIds() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function _writeCompareIds(list) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_COMPARE)));
  } catch {}
}

export function clearCompareIds() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  renderCompareBar();
  syncCompareCheckboxes();
}

/* Toggle bike i sammenligning. Returnerer true hvis tilføjet, false hvis fjernet
   eller blokeret af MAX_COMPARE-grænsen. */
export function toggleCompareBike(checkbox, bikeId) {
  if (checkbox && checkbox.tagName === 'INPUT') {
    // Fired by checkbox click — stop event propagation til kortet
    if (checkbox._stopProp !== true) {
      // hvis vi er i et inline onclick, propagation er allerede stoppet
    }
  }
  const ids = getCompareIds();
  const isInList = ids.includes(bikeId);
  if (isInList) {
    const newIds = ids.filter(id => id !== bikeId);
    _writeCompareIds(newIds);
    renderCompareBar();
    syncCompareCheckboxes();
    return false;
  }
  if (ids.length >= MAX_COMPARE) {
    if (checkbox) checkbox.checked = false;
    if (window.showToast) window.showToast(`⚠️ Du kan kun sammenligne op til ${MAX_COMPARE} cykler ad gangen`);
    return false;
  }
  ids.push(bikeId);
  _writeCompareIds(ids);
  renderCompareBar();
  syncCompareCheckboxes();
  return true;
}

/* Synkronisér alle .compare-checkbox-elementer i DOM med state.
   Bruges efter add/remove så den modsatte checkbox også opdaterer. */
export function syncCompareCheckboxes() {
  const ids = new Set(getCompareIds());
  document.querySelectorAll('.compare-checkbox').forEach(cb => {
    const id = cb.dataset.bikeId;
    if (id) cb.checked = ids.has(id);
  });
}

/* ---------- Floating compare bar ---------- */

export function renderCompareBar() {
  const existing = document.getElementById('compare-bar');
  const ids = getCompareIds();

  // Vises ikke på selve sammenlignings-siden
  if (window.location.pathname === '/sammenlign') {
    if (existing) existing.remove();
    return;
  }

  if (ids.length === 0) {
    if (existing) existing.remove();
    return;
  }

  const html = `
    <div class="compare-bar-inner">
      <div class="compare-bar-info">
        <strong>${ids.length} ${ids.length === 1 ? 'cykel' : 'cykler'}</strong> valgt til sammenligning
        ${ids.length === 1 ? '<span class="compare-bar-hint">Vælg mindst én til</span>' : ''}
      </div>
      <div class="compare-bar-actions">
        <button type="button" class="compare-bar-clear" onclick="clearCompareIds()">Ryd</button>
        <button type="button" class="compare-bar-go" ${ids.length < 2 ? 'disabled' : ''} onclick="navigateTo('/sammenlign?ids=${ids.join(',')}')">
          Sammenlign ${ids.length} cykler →
        </button>
      </div>
    </div>
  `;

  if (existing) {
    existing.innerHTML = html;
    return;
  }
  const bar = document.createElement('div');
  bar.id = 'compare-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Sammenligning af cykler');
  bar.innerHTML = html;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('compare-bar-visible'));
}

/* ---------- Comparison page ---------- */

export function createComparePage({ supabase, navigateTo, showToast }) {
  async function renderComparePage() {
    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    // Læs ids fra URL (?ids=A,B,C) — fald tilbage til sessionStorage
    let ids;
    try {
      const urlIds = new URLSearchParams(window.location.search).get('ids');
      ids = urlIds ? urlIds.split(',').filter(Boolean) : getCompareIds();
    } catch {
      ids = getCompareIds();
    }
    if (ids.length < 2) {
      detailView.innerHTML = `
        <div style="max-width:720px;margin:60px auto;padding:24px;text-align:center;">
          <div style="font-size:3.5rem;margin-bottom:16px;">⚖️</div>
          <h1 style="font-family:'Fraunces',serif;font-size:1.6rem;margin-bottom:10px;">Vælg cykler at sammenligne</h1>
          <p style="color:var(--muted);margin-bottom:24px;">Klik "Sammenlign"-checkboksen på 2-3 cykler i søgeresultaterne, så viser vi dem her side-om-side.</p>
          <button onclick="navigateTo('/')" style="background:var(--forest);color:#fff;border:none;padding:12px 28px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Find cykler →</button>
        </div>
      `;
      return;
    }

    detailView.innerHTML = `<div style="padding:60px 24px;text-align:center;color:var(--muted);">Henter cykler…</div>`;

    const { data: bikes, error } = await supabase
      .from('bikes')
      .select('id, brand, model, price, original_price, type, city, condition, year, size, size_cm, color, warranty, frame_material, brake_type, groupset, electronic_shifting, weight_kg, wheel_size, is_active, profiles(name, shop_name, seller_type, verified, avatar_url, city), bike_images(url, is_primary)')
      .in('id', ids);

    if (error || !bikes || bikes.length === 0) {
      detailView.innerHTML = `<div style="padding:60px 24px;text-align:center;color:var(--rust);">Kunne ikke hente cykler — prøv igen.</div>`;
      return;
    }

    // Sortér i samme rækkefølge som ids-arrayet
    const ordered = ids.map(id => bikes.find(b => b.id === id)).filter(Boolean);

    detailView.innerHTML = renderCompareTable(ordered, navigateTo);
  }

  return { renderComparePage };
}

function renderCompareTable(bikes, _navigateTo) {
  const cols = bikes.length; // 2 eller 3

  // Hjælpere
  const emptyVal = '<span class="cmp-empty">Ikke angivet</span>';
  const priceFn = b => `<div class="cmp-price">${b.price.toLocaleString('da-DK')} kr.</div>${b.original_price && b.original_price > b.price ? `<div class="cmp-price-orig">var ${b.original_price.toLocaleString('da-DK')} kr.<span class="cmp-price-save">Spar ${(b.original_price - b.price).toLocaleString('da-DK')} kr.</span></div>` : ''}`;
  const sellerFn = b => {
    const p = b.profiles || {};
    const name = p.seller_type === 'dealer' ? p.shop_name : p.name;
    const badge = p.seller_type === 'dealer' ? '🏪 Forhandler' : '👤 Privat';
    const verified = p.verified ? '<span class="cmp-verified" title="Verificeret">✓</span>' : '';
    return `<div class="cmp-seller-cell"><span class="cmp-seller-name">${esc(name || 'Ukendt')}${verified}</span><span class="cmp-seller-type">${badge}</span></div>`;
  };

  // Grupperede sektioner
  const sections = [
    {
      title: 'Pris og overblik',
      rows: [
        { label: 'Pris', fn: priceFn },
        { label: 'Type', fn: b => esc(b.type) || emptyVal },
        { label: 'Stand', fn: b => esc(b.condition) || emptyVal },
        { label: 'Årgang', fn: b => b.year || emptyVal },
      ],
    },
    {
      title: 'Mål og vægt',
      rows: [
        { label: 'Stelstørrelse', fn: b => b.size_cm ? `${b.size_cm} cm` : (esc(b.size) || emptyVal) },
        { label: 'Hjulstørrelse', fn: b => esc(b.wheel_size) || emptyVal },
        { label: 'Vægt', fn: b => b.weight_kg ? `${b.weight_kg} kg` : emptyVal },
      ],
    },
    {
      title: 'Tekniske specs',
      rows: [
        { label: 'Stelmateriale', fn: b => esc(b.frame_material) || emptyVal },
        { label: 'Bremser', fn: b => esc(b.brake_type) || emptyVal },
        { label: 'Gear', fn: b => {
          const gs = esc(b.groupset);
          if (!gs && !b.electronic_shifting) return emptyVal;
          return (gs || '–') + (b.electronic_shifting ? ' <span class="cmp-tag-mini">elektronisk</span>' : '');
        }},
        { label: 'Farve', fn: b => esc(b.color) || emptyVal },
      ],
    },
    {
      title: 'Køb og sælger',
      rows: [
        { label: 'Garanti', fn: b => b.warranty ? `🛡️ ${esc(b.warranty)}` : emptyVal },
        { label: 'By', fn: b => esc(b.city) || emptyVal },
        { label: 'Sælger', fn: sellerFn },
      ],
    },
  ];

  // Fremhæv forskelle: rå strenge for diff-detection (ikke HTML)
  const rawValue = (b, label) => {
    switch (label) {
      case 'Pris': return String(b.price);
      case 'Type': return b.type || '';
      case 'Stand': return b.condition || '';
      case 'Årgang': return String(b.year || '');
      case 'Stelstørrelse': return b.size_cm ? `${b.size_cm}cm` : (b.size || '');
      case 'Hjulstørrelse': return b.wheel_size || '';
      case 'Vægt': return String(b.weight_kg || '');
      case 'Stelmateriale': return b.frame_material || '';
      case 'Bremser': return b.brake_type || '';
      case 'Gear': return (b.groupset || '') + (b.electronic_shifting ? 'e' : '');
      case 'Farve': return b.color || '';
      case 'Garanti': return b.warranty || '';
      case 'By': return b.city || '';
      case 'Sælger': return (b.profiles?.shop_name || b.profiles?.name || '');
      default: return '';
    }
  };
  const isDifferent = (label) => new Set(bikes.map(b => rawValue(b, label))).size > 1;

  const headerCells = bikes.map(b => {
    const img = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url;
    return `
      <div class="cmp-bike-header">
        <div class="cmp-bike-image-wrap">
          ${img ? `<img src="${esc(img)}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy">` : '<div class="cmp-bike-noimg">🚲</div>'}
          <button onclick="event.stopPropagation();toggleCompareBike(null, '${b.id}');navigateTo('/sammenlign')" class="cmp-bike-remove" title="Fjern fra sammenligning" aria-label="Fjern">✕</button>
        </div>
        <h2 class="cmp-bike-title">${esc(b.brand)} ${esc(b.model)}</h2>
        <div class="cmp-bike-subtitle">${esc(b.type || '')}${b.year ? ` · ${b.year}` : ''}</div>
        <button onclick="navigateTo('/bike/${b.id}')" class="cmp-bike-cta">Se annonce →</button>
      </div>`;
  }).join('');

  return `
    <div class="cmp-page">
      <div class="cmp-page-inner">
        <button onclick="history.back()" class="cmp-back-btn">← Tilbage</button>

        <header class="cmp-hero">
          <h1 class="cmp-hero-title">Sammenlign ${cols} cykler</h1>
          <p class="cmp-hero-lead">Specifikationer side-om-side. Felter med <span class="cmp-diff-marker"></span> forskelle har en orange streg.</p>
        </header>

        <div class="cmp-shell" style="--cmp-cols:${cols};">
          <div class="cmp-header-row">
            <div class="cmp-header-spacer"></div>
            ${headerCells}
          </div>

          ${sections.map(section => `
            <section class="cmp-section">
              <h3 class="cmp-section-title">${section.title}</h3>
              ${section.rows.map(row => {
                const diff = isDifferent(row.label);
                return `
                <div class="cmp-row ${diff ? 'cmp-row--diff' : ''}">
                  <div class="cmp-row-label">${row.label}</div>
                  ${bikes.map(b => `<div class="cmp-row-value">${row.fn(b)}</div>`).join('')}
                </div>`;
              }).join('')}
            </section>
          `).join('')}
        </div>

        <footer class="cmp-footer">
          <button onclick="clearCompareIds();navigateTo('/')" class="cmp-footer-secondary">Ryd og find flere</button>
          <button onclick="navigateTo('/')" class="cmp-footer-primary">Tilbage til søgning</button>
        </footer>
      </div>
    </div>
  `;
}
