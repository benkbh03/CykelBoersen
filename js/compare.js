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

  // Definér rækker — { label, key, format(b) }
  const rows = [
    { label: 'Pris', fn: b => `<strong style="color:var(--rust);font-size:1.1rem;">${b.price.toLocaleString('da-DK')} kr.</strong>${b.original_price && b.original_price > b.price ? `<br><span style="text-decoration:line-through;color:var(--muted);font-size:0.82rem;">${b.original_price.toLocaleString('da-DK')} kr.</span>` : ''}` },
    { label: 'Type', fn: b => esc(b.type || '–') },
    { label: 'Stand', fn: b => esc(b.condition || '–') },
    { label: 'Årgang', fn: b => b.year || '–' },
    { label: 'Stelstørrelse', fn: b => b.size_cm ? `${b.size_cm} cm` : (esc(b.size) || '–') },
    { label: 'Hjulstørrelse', fn: b => esc(b.wheel_size || '–') },
    { label: 'Vægt', fn: b => b.weight_kg ? `${b.weight_kg} kg` : '–' },
    { label: 'Stelmateriale', fn: b => esc(b.frame_material || '–') },
    { label: 'Bremser', fn: b => esc(b.brake_type || '–') },
    { label: 'Gear', fn: b => esc(b.groupset || '–') + (b.electronic_shifting ? ' (elektronisk)' : '') },
    { label: 'Farve', fn: b => esc(b.color || '–') },
    { label: 'Garanti', fn: b => b.warranty ? `🛡️ ${esc(b.warranty)}` : '–' },
    { label: 'By', fn: b => esc(b.city || '–') },
    { label: 'Sælger', fn: b => {
      const p = b.profiles || {};
      const name = p.seller_type === 'dealer' ? p.shop_name : p.name;
      const badge = p.seller_type === 'dealer' ? '🏪' : '👤';
      const verified = p.verified ? ' ✓' : '';
      return `${badge} ${esc(name || 'Ukendt')}${verified}`;
    }},
  ];

  // Fremhæv forskelle: tjek om alle bikes har samme værdi for en række
  const isDifferent = (row) => {
    const values = bikes.map(b => row.fn(b));
    return new Set(values).size > 1;
  };

  return `
    <div style="max-width:1100px;margin:0 auto;padding:20px 16px;">
      <button onclick="history.back()" style="margin-bottom:18px;background:none;border:1px solid var(--border);padding:8px 18px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:0.9rem;color:var(--charcoal);">← Tilbage</button>
      <h1 style="font-family:'Fraunces',serif;font-size:1.9rem;margin-bottom:6px;">Sammenlign ${cols} cykler</h1>
      <p style="color:var(--muted);font-size:0.9rem;margin-bottom:24px;">Forskelle er fremhævet med <span style="background:#fff3e0;padding:1px 6px;border-radius:4px;">orange</span>.</p>

      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="compare-th-spec"></th>
              ${bikes.map(b => {
                const img = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url;
                return `
                <th class="compare-th-bike">
                  <div class="compare-bike-card">
                    ${img ? `<img src="${esc(img)}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy">` : '<div class="compare-bike-noimg">🚲</div>'}
                    <div class="compare-bike-name">${esc(b.brand)} ${esc(b.model)}</div>
                    <div class="compare-bike-actions">
                      <button onclick="navigateTo('/bike/${b.id}')" class="compare-action-go">Se annonce →</button>
                      <button onclick="toggleCompareBike(null, '${b.id}')" class="compare-action-remove" title="Fjern fra sammenligning">✕</button>
                    </div>
                  </div>
                </th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr class="${isDifferent(row) ? 'compare-row-diff' : ''}">
                <td class="compare-td-label">${row.label}</td>
                ${bikes.map(b => `<td class="compare-td-value">${row.fn(b)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top:28px;display:flex;gap:12px;justify-content:center;">
        <button onclick="clearCompareIds();navigateTo('/')" style="background:none;border:1px solid var(--border);padding:11px 22px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;color:var(--charcoal);">Ryd og find flere</button>
        <button onclick="navigateTo('/')" style="background:var(--forest);color:#fff;border:none;padding:11px 22px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;">Tilbage til søgning</button>
      </div>
    </div>
  `;
}
