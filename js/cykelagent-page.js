/* ============================================================
   CYKELAGENT-SIDE (/cykelagenter)
   Dedikeret side til at oprette, redigere og slette Cykelagenter.
   Bygger på samme saved_searches-tabel som den eksisterende
   "klik 🔔 i hero"-flow, men giver brugeren et fuldt overblik over
   alle deres agenter på én skærm med alle filtre tilgængelige.
   ============================================================ */

import { BIKE_COLORS } from './config.js';

const BIKE_TYPES = ['Racercykel', 'Mountainbike', 'El-cykel', 'Citybike', 'Ladcykel', 'Børnecykel', 'Gravel'];
const CONDITIONS = ['Ny', 'Som ny', 'God stand', 'Brugt'];
const SIZES      = ['XS (44–48 cm)', 'S (49–52 cm)', 'M (53–56 cm)', 'L (57–60 cm)', 'XL (61+ cm)'];
const WHEELS     = ['26"', '27.5" / 650b', '28"', '29"'];

export function createCykelagentPage({
  supabase,
  esc,
  showToast,
  updateSEOMeta,
  showDetailView,
  navigateTo,
  getCurrentUser,
  openLoginModal,
}) {

  // State: hvilken agent er aktivt i edit-mode (id eller 'new' eller null)
  let _editingId = null;
  // Form-state: bygges op i editor og persisteres ved Gem
  let _form = _emptyForm();

  function _emptyForm() {
    return {
      name: '',
      types: [],
      brand: '',          // singular pga. brand-filter er enkelt-værdi
      conditions: [],
      sizes: [],
      wheelSizes: [],
      colors: [],
      sellerType: '',     // 'all' | 'dealer' | 'private'
      minPrice: null,
      maxPrice: null,
      warranty: false,
    };
  }

  async function renderCykelagentPage() {
    const currentUser = getCurrentUser();
    const isLoggedIn  = !!currentUser;

    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = isLoggedIn ? 'Mine Cykelagenter – Cykelbørsen' : 'Opret Cykelagent – Cykelbørsen';
    updateSEOMeta(
      isLoggedIn
        ? 'Opret og administrer dine Cykelagenter — få besked på e-mail når nye cykler matcher dine kriterier.'
        : 'Opret en Cykelagent og få besked når den perfekte cykel dukker op. Du behøver ikke have en konto for at komme i gang.',
      '/cykelagenter'
    );

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    // For ikke-logged-in: åbn editoren med det samme så de kan udfylde uden konto-friktion.
    // Først efter de klikker "Opret" beder vi om login/signup. Det er højere konvertering
    // end at gate'e siden med et login-prompt.
    const showEditor = !isLoggedIn || _editingId !== null;
    if (!isLoggedIn) _editingId = 'new';

    detailView.innerHTML = `
      <div class="cykelagent-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>

        <header class="cykelagent-hero">
          <h1 class="cykelagent-title">${isLoggedIn ? 'Mine Cykelagenter' : 'Opret en Cykelagent'}</h1>
          <p class="cykelagent-sub">${isLoggedIn
            ? 'En Cykelagent holder øje med nye cykler der matcher dine kriterier og sender dem til din e-mail.'
            : 'Få besked på e-mail når en cykel der matcher dine ønsker dukker op. Udfyld dine kriterier først — vi opretter din konto når du er færdig.'}</p>
        </header>

        ${isLoggedIn ? `
          <div class="cykelagent-actions">
            <button class="cykelagent-new-btn" onclick="openCykelagentEditor('new')">
              <span class="cykelagent-new-icon">+</span> Ny Cykelagent
            </button>
          </div>
        ` : ''}

        <div id="cykelagent-editor-mount">${showEditor && !isLoggedIn ? _buildEditorHTML(true) : ''}</div>

        ${isLoggedIn ? `
          <div id="cykelagent-list" class="cykelagent-list">
            <p style="color:var(--muted);padding:20px 0;">Henter dine Cykelagenter…</p>
          </div>
        ` : ''}
      </div>
    `;

    if (isLoggedIn) await _loadAndRenderList();
  }

  async function _loadAndRenderList() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const list = document.getElementById('cykelagent-list');
    if (!list) return;

    const { data, error } = await supabase
      .from('saved_searches')
      .select('id, name, filters, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = '<p style="color:var(--muted);padding:20px 0;">Kunne ikke hente dine Cykelagenter — prøv at genindlæse siden.</p>';
      return;
    }
    if (!data || data.length === 0) {
      list.innerHTML = `
        <div class="cykelagent-empty">
          <div class="cykelagent-empty-icon">🔔</div>
          <h2 class="cykelagent-empty-title">Ingen Cykelagenter endnu</h2>
          <p class="cykelagent-empty-sub">Opret din første agent med knappen ovenfor. Du får besked på e-mail når nye cykler matcher dine kriterier — du behøver ikke tjekke sitet hver dag.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = data.map(agent => _buildAgentCard(agent)).join('');
  }

  function _buildAgentCard(agent) {
    const f = agent.filters || {};
    const chips = [];
    if (f.search)                     chips.push(`🔍 ${esc(f.search)}`);
    if (f.type)                       chips.push(esc(f.type));
    if (Array.isArray(f.types))       f.types.forEach(t => chips.push(esc(t)));
    if (f.brand)                      chips.push(`🏷️ ${esc(f.brand)}`);
    if (Array.isArray(f.conditions))  f.conditions.forEach(c => chips.push(esc(c)));
    if (Array.isArray(f.sizes))       f.sizes.forEach(s => chips.push('Str. ' + esc(s.split(' ')[0])));
    if (Array.isArray(f.wheelSizes))  f.wheelSizes.forEach(w => chips.push('Hjul ' + esc(w)));
    if (Array.isArray(f.colors))      f.colors.forEach(c => chips.push('🎨 ' + esc(c)));
    if (f.sellerType === 'dealer')    chips.push('🏪 Forhandlere');
    if (f.sellerType === 'private')   chips.push('👤 Private');
    if (f.minPrice)                   chips.push(`Fra ${Number(f.minPrice).toLocaleString('da-DK')} kr.`);
    if (f.maxPrice)                   chips.push(`Op til ${Number(f.maxPrice).toLocaleString('da-DK')} kr.`);
    if (f.warranty)                   chips.push('🛡️ Med garanti');
    if (f.city)                       chips.push('📍 ' + esc(f.city));

    const dateStr = new Date(agent.created_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <div class="cykelagent-card" onclick="openCykelagentEditor('${agent.id}')">
        <div class="cykelagent-card-top">
          <span class="cykelagent-card-status">● Aktiv</span>
          <span class="cykelagent-card-date">Oprettet ${dateStr}</span>
        </div>
        <div class="cykelagent-card-name">${esc(agent.name) || 'Min Cykelagent'}</div>
        ${chips.length ? `<div class="cykelagent-card-chips">${chips.map(c => `<span class="cykelagent-chip">${c}</span>`).join('')}</div>` : ''}
        <div class="cykelagent-card-cta">Rediger →</div>
      </div>
    `;
  }

  async function openCykelagentEditor(idOrNew) {
    const mount = document.getElementById('cykelagent-editor-mount');
    if (!mount) return;

    // Toggle: hvis allerede åben for samme id → luk
    if (_editingId === idOrNew) {
      _editingId = null;
      mount.innerHTML = '';
      return;
    }

    _editingId = idOrNew;
    _form = _emptyForm();

    if (idOrNew !== 'new') {
      const { data } = await supabase
        .from('saved_searches').select('id, name, filters').eq('id', idOrNew).single();
      if (data) {
        const f = data.filters || {};
        _form = {
          name:       data.name || '',
          types:      Array.isArray(f.types)      ? f.types      : (f.type ? [f.type] : []),
          brand:      f.brand || f.search || '',
          conditions: Array.isArray(f.conditions) ? f.conditions : [],
          sizes:      Array.isArray(f.sizes)      ? f.sizes      : [],
          wheelSizes: Array.isArray(f.wheelSizes) ? f.wheelSizes : [],
          colors:     Array.isArray(f.colors)     ? f.colors     : [],
          sellerType: f.sellerType || '',
          minPrice:   f.minPrice || null,
          maxPrice:   f.maxPrice || null,
          warranty:   !!f.warranty,
        };
      }
    }

    mount.innerHTML = _buildEditorHTML(idOrNew === 'new');
    window.scrollTo({ top: mount.offsetTop - 20, behavior: 'smooth' });
  }

  function _buildEditorHTML(isNew) {
    return `
      <div class="cykelagent-editor">
        <div class="cykelagent-editor-header">
          <h2 class="cykelagent-editor-title">${isNew ? 'Ny Cykelagent' : 'Rediger Cykelagent'}</h2>
          <button class="cykelagent-editor-close" onclick="closeCykelagentEditor()" aria-label="Luk">✕</button>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Navn på agent</label>
          <input type="text" class="cykelagent-input" id="cyk-name" placeholder="fx 'Brugte racere i KBH under 10.000'" value="${esc(_form.name)}" oninput="updateCykelagentField('name', this.value)">
          <div class="cykelagent-hint">Valgfrit — vi laver et automatisk hvis du springer over.</div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Mærke eller model (søgeord)</label>
          <input type="text" class="cykelagent-input" id="cyk-brand" placeholder="fx 'Cube' eller 'Trek Domane'" value="${esc(_form.brand)}" oninput="updateCykelagentField('brand', this.value)">
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Cykeltype</label>
          <div class="cykelagent-chips-row">
            ${BIKE_TYPES.map(t => `
              <button type="button" class="cykelagent-chip-btn${_form.types.includes(t) ? ' active' : ''}" onclick="toggleCykelagentArray('types', '${esc(t)}')">${esc(t)}</button>
            `).join('')}
          </div>
        </div>

        <div class="cykelagent-field-row">
          <div class="cykelagent-field">
            <label class="cykelagent-label">Min. pris (kr.)</label>
            <input type="number" min="0" class="cykelagent-input" id="cyk-min-price" placeholder="fx 0" value="${_form.minPrice ?? ''}" oninput="updateCykelagentField('minPrice', this.value ? parseInt(this.value) : null)">
          </div>
          <div class="cykelagent-field">
            <label class="cykelagent-label">Maks. pris (kr.)</label>
            <input type="number" min="0" class="cykelagent-input" id="cyk-max-price" placeholder="fx 10.000" value="${_form.maxPrice ?? ''}" oninput="updateCykelagentField('maxPrice', this.value ? parseInt(this.value) : null)">
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Stelstørrelse</label>
          <div class="cykelagent-chips-row">
            ${SIZES.map(s => `
              <button type="button" class="cykelagent-chip-btn${_form.sizes.includes(s) ? ' active' : ''}" onclick="toggleCykelagentArray('sizes', '${esc(s)}')">${esc(s.split(' ')[0])} <span style="color:var(--muted);font-size:0.78rem;">${esc(s.match(/\(([^)]+)\)/)?.[1] || '')}</span></button>
            `).join('')}
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Stand</label>
          <div class="cykelagent-chips-row">
            ${CONDITIONS.map(c => `
              <button type="button" class="cykelagent-chip-btn${_form.conditions.includes(c) ? ' active' : ''}" onclick="toggleCykelagentArray('conditions', '${esc(c)}')">${esc(c)}</button>
            `).join('')}
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Farve</label>
          <div class="cykelagent-chips-row">
            ${BIKE_COLORS.map(c => `
              <button type="button" class="cykelagent-chip-btn cykelagent-color-chip${_form.colors.includes(c.name) ? ' active' : ''}" onclick="toggleCykelagentArray('colors', '${esc(c.name)}')">
                <span class="cykelagent-color-swatch" style="background:${c.hex};${c.dark ? '' : 'border:1px solid var(--border);'}"></span>
                ${esc(c.name)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Hjulstørrelse</label>
          <div class="cykelagent-chips-row">
            ${WHEELS.map(w => `
              <button type="button" class="cykelagent-chip-btn${_form.wheelSizes.includes(w) ? ' active' : ''}" onclick="toggleCykelagentArray('wheelSizes', '${esc(w)}')">${esc(w)}</button>
            `).join('')}
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-label">Sælgertype</label>
          <div class="cykelagent-chips-row">
            <button type="button" class="cykelagent-chip-btn${_form.sellerType === '' || _form.sellerType === 'all' ? ' active' : ''}" onclick="setCykelagentSellerType('')">Alle</button>
            <button type="button" class="cykelagent-chip-btn${_form.sellerType === 'dealer' ? ' active' : ''}" onclick="setCykelagentSellerType('dealer')">🏪 Forhandlere</button>
            <button type="button" class="cykelagent-chip-btn${_form.sellerType === 'private' ? ' active' : ''}" onclick="setCykelagentSellerType('private')">👤 Private</button>
          </div>
        </div>

        <div class="cykelagent-field">
          <label class="cykelagent-toggle">
            <input type="checkbox" ${_form.warranty ? 'checked' : ''} onchange="updateCykelagentField('warranty', this.checked)">
            <span>🛡️ Kun cykler med garanti</span>
          </label>
        </div>

        <div class="cykelagent-editor-actions">
          <button class="cykelagent-save-btn" onclick="saveCykelagentForm()">${isNew ? 'Opret Cykelagent' : 'Gem ændringer'}</button>
          <button class="cykelagent-cancel-btn" onclick="closeCykelagentEditor()">Annuller</button>
          ${!isNew ? `<button class="cykelagent-delete-btn" onclick="deleteCykelagentFromEditor('${_editingId}')">🗑️ Slet agent</button>` : ''}
        </div>
      </div>
    `;
  }

  function closeCykelagentEditor() {
    _editingId = null;
    const mount = document.getElementById('cykelagent-editor-mount');
    if (mount) mount.innerHTML = '';
  }

  function updateCykelagentField(field, value) {
    _form[field] = value;
  }

  function toggleCykelagentArray(field, value) {
    const arr = _form[field] || [];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    _form[field] = arr;
    // Re-render kun den knap, der blev klikket: simplificering = re-render hele editor
    if (_editingId !== null) {
      const mount = document.getElementById('cykelagent-editor-mount');
      if (mount) mount.innerHTML = _buildEditorHTML(_editingId === 'new');
    }
  }

  function setCykelagentSellerType(type) {
    _form.sellerType = type;
    if (_editingId !== null) {
      const mount = document.getElementById('cykelagent-editor-mount');
      if (mount) mount.innerHTML = _buildEditorHTML(_editingId === 'new');
    }
  }

  async function saveCykelagentForm() {
    // Validering: mindst ét meningsfuldt filter
    const hasFilter = _form.brand || _form.types.length || _form.conditions.length
      || _form.sizes.length || _form.wheelSizes.length || _form.colors.length
      || _form.sellerType || _form.minPrice || _form.maxPrice || _form.warranty;
    if (!hasFilter) {
      showToast('⚠️ Tilføj mindst ét filter til din Cykelagent');
      return;
    }

    const name = _form.name?.trim() || _autoName();
    const filters = {
      search: _form.brand || '',
      brand:  _form.brand || '',
      types:  _form.types,
      conditions: _form.conditions,
      sizes: _form.sizes,
      wheelSizes: _form.wheelSizes,
      colors: _form.colors,
      sellerType: _form.sellerType || '',
      minPrice: _form.minPrice,
      maxPrice: _form.maxPrice,
      warranty: _form.warranty,
    };

    const currentUser = getCurrentUser();
    if (!currentUser) {
      // Ikke logget ind: gem agent-data i localStorage og bed brugeren oprette konto.
      // main.js har en post-login-hook der tjekker for pending agent og indsætter den.
      try {
        localStorage.setItem('_pendingCykelagent', JSON.stringify({ name, filters, savedAt: Date.now() }));
      } catch {}
      showToast('Næsten færdig — opret en gratis konto for at aktivere din Cykelagent');
      openLoginModal();
      return;
    }

    if (_editingId === 'new') {
      const { error } = await supabase.from('saved_searches').insert({
        user_id: currentUser.id, name, filters,
      });
      if (error) { showToast('❌ Kunne ikke oprette — prøv igen'); return; }
      showToast('🔔 Cykelagent oprettet');
    } else {
      const { error } = await supabase.from('saved_searches')
        .update({ name, filters })
        .eq('id', _editingId).eq('user_id', currentUser.id);
      if (error) { showToast('❌ Kunne ikke gemme — prøv igen'); return; }
      showToast('✓ Cykelagent opdateret');
    }

    closeCykelagentEditor();
    await _loadAndRenderList();
  }

  /* Kaldes fra main.js efter auth-events (SIGNED_IN) — hvis brugeren havde
     en pending Cykelagent i localStorage før login, oprettes den nu. */
  async function flushPendingCykelagent() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    let pending;
    try {
      const raw = localStorage.getItem('_pendingCykelagent');
      if (!raw) return;
      pending = JSON.parse(raw);
    } catch { return; }
    if (!pending?.filters) return;
    const { error } = await supabase.from('saved_searches').insert({
      user_id: currentUser.id,
      name: pending.name || 'Min Cykelagent',
      filters: pending.filters,
    });
    if (error) {
      console.error('flushPendingCykelagent fejl:', error);
      return;
    }
    try { localStorage.removeItem('_pendingCykelagent'); } catch {}
    showToast('🔔 Din Cykelagent er nu aktiveret');
    // Re-render hvis bruger er på /cykelagenter siden
    if (location.pathname === '/cykelagenter' || location.pathname === '/cykelagent') {
      _editingId = null;
      _form = _emptyForm();
      await renderCykelagentPage();
    }
  }

  function _autoName() {
    const parts = [];
    if (_form.brand) parts.push(_form.brand);
    if (_form.types.length) parts.push(_form.types.join('+'));
    if (_form.sellerType === 'dealer') parts.push('Forhandlere');
    if (_form.sellerType === 'private') parts.push('Private');
    if (_form.maxPrice) parts.push(`under ${Number(_form.maxPrice).toLocaleString('da-DK')} kr.`);
    return parts.join(' · ') || 'Min Cykelagent';
  }

  async function deleteCykelagentFromEditor(id) {
    if (!confirm('Slet denne Cykelagent? Du modtager ikke flere notifikationer fra den.')) return;
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const { error } = await supabase.from('saved_searches')
      .delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) { showToast('❌ Kunne ikke slette — prøv igen'); return; }
    showToast('🗑️ Cykelagent slettet');
    closeCykelagentEditor();
    await _loadAndRenderList();
  }

  return {
    renderCykelagentPage,
    openCykelagentEditor,
    closeCykelagentEditor,
    updateCykelagentField,
    toggleCykelagentArray,
    setCykelagentSellerType,
    saveCykelagentForm,
    deleteCykelagentFromEditor,
    flushPendingCykelagent,
  };
}
