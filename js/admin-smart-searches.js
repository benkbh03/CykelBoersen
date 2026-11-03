/* ────────────────────────────────────────────────────────────────
   admin-smart-searches.js — smart søgnings log i admin → Statistik

   Viser de seneste søgninger fra smart_search_logs: hvad folk skrev,
   hvilke filtre smart søgning satte, og hvor mange cykler der kom frem.
   Læses gennem admin_smart_searches() (add_admin_smart_searches.sql),
   som kun svarer for admin; tabellen selv er lukket for browseren.

   To slags fund:
   - Forkerte filtre: smart søgning skal rettes. Læg søgningen i
     scripts/smart-filter-cases.json med det rigtige svar.
   - Rigtige filtre, 0 cykler: det er lageret der mangler noget.

   Indlæses dynamisk med ?v= fra main.js. Ny fil med vilje.
──────────────────────────────────────────────────────────────── */

// Feltnavne fra smart-filter → det admin genkender fra filterpanelet.
const LABELS = {
  types: 'Type', conditions: 'Stand', sizes: 'Stelstørrelse', wheelSizes: 'Hjul',
  frameMaterials: 'Stel', brakeTypes: 'Bremser', groupsets: 'Gear', motors: 'Motor',
  motorPositions: 'Motorplacering', suspensions: 'Affjedring', geartypes: 'Geartype',
  stepTypes: 'Indstigning', colors: 'Farve', brands: 'Mærke', minPrice: 'Fra',
  maxPrice: 'Til', maxWeight: 'Maks. vægt', batteryMin: 'Batteri fra',
  sellerType: 'Sælger', electronicShifting: 'Elektronisk gear', city: 'By', search: 'Model',
};

function describeFilters(filters, esc) {
  const parts = [];
  for (const [k, v] of Object.entries(filters || {})) {
    let val = Array.isArray(v) ? v.join(', ') : v;
    if (k === 'minPrice' || k === 'maxPrice') val = `${Number(v).toLocaleString('da-DK')} kr.`;
    if (k === 'maxWeight') val = `${v} kg`;
    if (k === 'batteryMin') val = `${v} Wh`;
    if (k === 'sellerType') val = v === 'dealer' ? 'Forhandler' : 'Privat';
    if (k === 'electronicShifting') val = 'ja';
    parts.push(`<span class="ass-filter">${esc(LABELS[k] || k)}: ${esc(String(val))}</span>`);
  }
  return parts.length ? parts.join(' ') : '<span class="ass-muted">Ingen filtre</span>';
}

function when(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) + ' ' +
         d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

export function createAdminSmartSearches({ supabase, esc, retryHTML }) {
  let onlyZero = false;

  async function renderSmartSearches(containerId = 'admin-smart-searches') {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<p class="ass-muted">Henter smart søgning…</p>';

    const { data, error } = await supabase.rpc('admin_smart_searches', { p_only_zero: onlyZero, p_limit: 50 });
    if (error) {
      const missing = /admin_smart_searches|function/i.test(error.message || '');
      el.innerHTML = missing
        ? '<p class="ass-note">Loggen kan ikke læses endnu. Kør <strong>supabase/sql/add_admin_smart_searches.sql</strong> i SQL Editor.</p>'
        : retryHTML('Kunne ikke hente smart søgning.', 'loadAdminStats');
      return;
    }

    const rows = data || [];
    const zero = rows.filter(r => r.result_count === 0).length;
    const body = rows.length ? rows.map(r => {
      const n = r.result_count;
      const count = n == null ? '<span class="ass-muted">–</span>'
        : n === 0 ? '<span class="ass-zero">0</span>' : String(n);
      const words = (r.keywords || []).length
        ? `<div class="ass-words">Står først: ${esc(r.keywords.join(', '))}</div>` : '';
      return `<tr class="${n === 0 ? 'is-zero' : ''}">
        <td class="ass-when">${esc(when(r.created_at))}</td>
        <td><div class="ass-query">${esc(r.query)}</div>${words}</td>
        <td>${describeFilters(r.filters, esc)}</td>
        <td class="ass-count">${count}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="4" class="ass-muted">${onlyZero ? 'Ingen søgninger med 0 cykler.' : 'Ingen smarte søgninger endnu.'}</td></tr>`;

    el.innerHTML = `
      <div class="ass-head">
        <h3 class="ass-title">Smart søgning</h3>
        <label class="ass-toggle"><input type="checkbox" id="ass-only-zero" ${onlyZero ? 'checked' : ''}> Kun 0 cykler</label>
      </div>
      <p class="ass-help">De seneste ${rows.length} søgninger${onlyZero ? ' med 0 cykler' : `, heraf ${zero} med 0 cykler`}.
        Forkerte filtre: smart søgning skal rettes. Rigtige filtre og 0 cykler: lageret mangler noget.</p>
      <div class="ass-scroll">
        <table class="ass-table">
          <thead><tr><th>Tid</th><th>Skrev</th><th>Filtre</th><th>Cykler</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;

    document.getElementById('ass-only-zero')?.addEventListener('change', (e) => {
      onlyZero = e.target.checked;
      renderSmartSearches(containerId);
    });
  }

  return { renderSmartSearches };
}
