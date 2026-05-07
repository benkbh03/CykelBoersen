/* ============================================================
   SELL PAGE MODULE
   Factory for OPRET ANNONCE MODAL + OPRET ANNONCE SIDE (#/sell)
   ============================================================ */

import { BIKE_COLORS } from './config.js';
import { renderColorSwatches, getSelectedColors, setSelectedColors } from './color-swatches.js';

/**
 * @param {object} deps
 * @param {object}   deps.supabase
 * @param {Function} deps.showToast
 * @param {Function} deps.esc
 * @param {Function} deps.debounce
 * @param {Function} deps.btnLoading
 * @param {Function} deps.enableFocusTrap
 * @param {Function} deps.disableFocusTrap
 * @param {Function} deps.updateSEOMeta
 * @param {Function} deps.attachCityAutocomplete
 * @param {Function} deps.blockIfPendingDealer       - () => boolean
 * @param {Function} deps.openLoginModal             - () => void
 * @param {Function} deps.navigateTo                 - (...args) => void
 * @param {Function} deps.showDetailView             - () => void
 * @param {Function} deps.showListingView            - () => void
 * @param {Function} deps.loadBikes                  - (...args) => void
 * @param {Function} deps.updateFilterCounts         - (...args) => void
 * @param {Function} deps.notifySavedSearches        - (...args) => void
 * @param {Function} deps.getSelectedFiles           - () => Array
 * @param {Function} deps.validateImageFile          - (file) => boolean
 * @param {Function} deps.uploadImages               - (...args) => Promise
 * @param {Function} deps.resetImageUpload           - () => void
 * @param {Function} deps.openCropModal              - (...args) => void
 * @param {Function} deps.getCurrentUser             - () => object|null
 * @param {Function} deps.getCurrentProfile          - () => object|null
 */
export function createSellPage({
  supabase,
  showToast,
  esc,
  debounce,
  btnLoading,
  enableFocusTrap,
  disableFocusTrap,
  updateSEOMeta,
  attachCityAutocomplete,
  blockIfPendingDealer,
  openLoginModal,
  navigateTo,
  showDetailView,
  showListingView,
  loadBikes,
  updateFilterCounts,
  notifySavedSearches,
  getSelectedFiles,
  validateImageFile,
  uploadImages,
  resetImageUpload,
  openCropModal,
  getCurrentUser,
  getCurrentProfile,
}) {
  /* ----------------------------------------------------------
     Module-local state
  ---------------------------------------------------------- */
  let _sellStep = 1;
  let _aiSuggestionPending = null;
  let _aiApplied = false;
  let _sellFormCache = {};

  const SELL_DRAFT_KEY = 'cb_sell_draft_v1';
  const SELL_DRAFT_FIELDS = [
    'sell-brand', 'sell-model', 'sell-type', 'sell-size', 'sell-size-cm', 'sell-wheel-size',
    'sell-year', 'sell-condition', 'sell-city', 'sell-colors', 'sell-desc',
    'sell-price', 'sell-warranty',
  ];

  /* ----------------------------------------------------------
     OPRET ANNONCE MODAL
  ---------------------------------------------------------- */

  function openModal() {
    const currentUser = getCurrentUser();
    if (!currentUser) { openLoginModal(); showToast('⚠️ Log ind for at oprette en annonce'); return; }
    if (blockIfPendingDealer()) return;
    navigateTo('/sell');
  }

  function _openModalLegacy() {
    const currentProfile = getCurrentProfile();
    const isDealer = currentProfile?.seller_type === 'dealer';

    // Vis kun den relevante selger-type knap baseret på brugerens profil
    document.getElementById('type-private').style.display = !isDealer ? '' : 'none';
    document.getElementById('type-dealer').style.display  = isDealer  ? '' : 'none';

    // Skjul "Hvem sælger du som?"-toggle helt for privatpersoner (kun én mulighed)
    const sellerToggleLabel = document.querySelector('.modal-seller-label');
    const sellerToggle      = document.querySelector('.seller-toggle');
    if (sellerToggleLabel) sellerToggleLabel.style.display = isDealer ? '' : 'none';
    if (sellerToggle)      sellerToggle.style.display      = isDealer ? '' : 'none';

    selectType(isDealer ? 'dealer' : 'private');
    document.getElementById('modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    enableFocusTrap('modal');

    // Tilknyt prisforslag-listener til type-select
    const modalEl = document.getElementById('modal');
    const typeSelect = modalEl.querySelectorAll('select')[0];
    if (typeSelect && !typeSelect._priceSuggestBound) {
      typeSelect._priceSuggestBound = true;
      typeSelect.addEventListener('change', () => updatePriceSuggestion(typeSelect.value));
    }
  }

  async function updatePriceSuggestion(bikeType) {
    const wrap = document.getElementById('price-suggestion');
    if (!wrap || !bikeType) { if (wrap) wrap.style.display = 'none'; return; }

    const { data } = await supabase
      .from('bikes')
      .select('price')
      .eq('type', bikeType)
      .eq('is_active', true)
      .limit(50);

    if (!data || data.length < 3) { wrap.style.display = 'none'; return; }

    const prices = data.map(b => b.price).sort((a, b) => a - b);
    const avg    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const low    = prices[Math.floor(prices.length * 0.25)];
    const high   = prices[Math.floor(prices.length * 0.75)];

    wrap.innerHTML = `💡 Andre ${esc(bikeType).toLowerCase()}er sælges typisk for <strong>${low.toLocaleString('da-DK')}–${high.toLocaleString('da-DK')} kr.</strong> (gns. ${avg.toLocaleString('da-DK')} kr.)`;
    wrap.style.display = 'block';
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.body.style.overflow = '';
    disableFocusTrap('modal');
  }

  function selectType(type) {
    const isDealer = type === 'dealer';
    document.getElementById('type-private').classList.toggle('selected', !isDealer);
    document.getElementById('type-dealer').classList.toggle('selected', isDealer);
    document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
  }

  async function submitListing() {
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }
    if (blockIfPendingDealer()) return;
    const restore = btnLoading('submit-listing-btn', 'Opretter...');
    try {

    // Hent felter specifikt fra opret-annonce modalen (#modal)
    const modalEl = document.getElementById('modal');
    const brand   = modalEl.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value.trim();
    const model   = modalEl.querySelector('[placeholder="f.eks. FX 3 Disc"]').value.trim();
    const price   = parseInt(modalEl.querySelector('[placeholder="f.eks. 4500"]').value);
    const year    = parseInt(modalEl.querySelector('[placeholder="f.eks. 2021"]').value) || null;
    const city    = modalEl.querySelector('[placeholder="f.eks. København"]').value.trim();
    const desc    = modalEl.querySelector('textarea').value.trim();
    const selects = modalEl.querySelectorAll('select');
    const type      = selects[0].value;
    const size      = selects[1].value;
    const condition = selects[3].value;

    const wheelSize = document.getElementById('modal-wheel-size')?.value || null;
    const warranty  = document.getElementById('modal-warranty')?.value.trim() || null;

    const bikeData = {
      user_id:     currentUser.id,
      brand, model, price, year, city,
      description: desc,
      type, size, condition,
      wheel_size:  wheelSize || null,
      warranty:    warranty || null,
      title:       `${brand} ${model}`,
      is_active:   true,
    };

    if (!bikeData.brand || !bikeData.model || !bikeData.price || !bikeData.city) {
      showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
    }

    const { data: newBike, error } = await supabase.from('bikes').insert(bikeData).select().single();
    if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); restore(); return; }

    // Upload billeder hvis der er valgt nogle
    if (getSelectedFiles().length > 0) {
      showToast('⏳ Uploader billeder...');
      await uploadImages(newBike.id);
    }

    closeModal();
    resetImageUpload();
    showToast('✅ Din annonce er oprettet!');
    loadBikes();
    updateFilterCounts();

    // Notificér brugere med matchende gemte søgninger (fire-and-forget)
    notifySavedSearches(newBike);
    } finally { restore(); }
  }

  async function submitSellPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }
    if (blockIfPendingDealer()) return;
    const restore = btnLoading('sell-submit-btn', 'Opretter...');
    try {
      // Read from DOM first, fall back to _sellFormCache (step 2 fields are gone when on step 3)
      const getVal = (id) => {
        const dom = document.getElementById(id)?.value;
        const trimmed = dom != null ? String(dom).trim() : '';
        if (trimmed) return trimmed;
        return String(_sellFormCache[id] ?? '').trim();
      };
      const brand     = getVal('sell-brand');
      const model     = getVal('sell-model');
      const price     = parseInt(getVal('sell-price'));
      const year      = parseInt(getVal('sell-year')) || null;
      const city      = getVal('sell-city');
      const desc      = getVal('sell-desc');
      const type      = getVal('sell-type');
      const size      = getVal('sell-size') || null;
      const sizeCm    = parseInt(getVal('sell-size-cm')) || null;
      const condition = getVal('sell-condition');
      const wheelSize = getVal('sell-wheel-size') || null;
      const warranty  = getVal('sell-warranty') || null;
      const colors    = Array.isArray(_sellFormCache['sell-colors']) ? _sellFormCache['sell-colors'] : [];

      if (!brand || !model || !price || !city || !type || !condition) {
        showToast('⚠️ Udfyld alle påkrævede felter (*)'); restore(); return;
      }

      const bikeData = {
        user_id: currentUser.id,
        brand, model, price, year, city,
        description: desc || null,
        type, size: size || null, size_cm: sizeCm, condition,
        wheel_size: wheelSize || null,
        warranty: warranty || null,
        color: colors.length ? colors.join(', ') : null,
        colors: colors.length ? colors : null,
        title: `${brand} ${model}`,
        is_active: true,
      };

      const { data: newBike, error } = await supabase.from('bikes').insert(bikeData).select().single();
      if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); restore(); return; }

      if (getSelectedFiles().length > 0) {
        showToast('⏳ Uploader billeder...');
        await uploadImages(newBike.id);
      }

      loadBikes();
      updateFilterCounts();

      notifySavedSearches(newBike);

      clearSellDraft();
      showListingSuccessModal(newBike);
    } finally {
      restore();
    }
  }

  /* ----------------------------------------------------------
     OPRET ANNONCE SIDE (#/sell)
  ---------------------------------------------------------- */

  function renderSellPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      openLoginModal();
      showToast('⚠️ Log ind for at oprette en annonce');
      navigateTo('/');
      return;
    }
    if (blockIfPendingDealer()) return;
    showDetailView();
    document.body.classList.add('on-sell-page');
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Opret annonce – Cykelbørsen';
    updateSEOMeta('Sælg din brugte cykel gratis på Cykelbørsen. Opret en annonce på under 2 minutter og nå tusindvis af cykellkøbere i Danmark.', '/sell');
    getSelectedFiles().splice(0);
    _sellStep = 1;
    _aiApplied = false;
    _aiSuggestionPending = null;
    _sellFormCache = {};

    document.getElementById('detail-view').innerHTML = `
      <div class="sell-wizard">
        <div class="sell-wizard-top">
          <button class="sell-wizard-back-btn" onclick="backSell()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="sell-wizard-logo">
            <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
              <circle cx="11" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
              <circle cx="29" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
              <path d="M11 27l7-13h7l5 13M18 14h-3M23 14l-5 13" stroke="var(--rust)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Cykelbørsen</span>
          </div>
          <div style="width:40px"></div>
        </div>

        <div class="sell-wizard-desktop-header">
          <div id="sell-desktop-step-label" class="sell-wizard-step-label">Trin 1 af 3</div>
          <h1 class="sell-wizard-page-title">Sæt din cykel <em>til salg</em></h1>
        </div>

        <div class="sell-wizard-layout">
          <aside id="sell-desktop-stepper" class="sell-wizard-desktop-stepper"></aside>

          <div class="sell-wizard-main">
            <div id="sell-wizard-progress" class="sell-wizard-progress"></div>
            <div id="sell-step-body" class="sell-wizard-body"></div>
            <div id="sell-desktop-footer" class="sell-wizard-desktop-footer"></div>
          </div>

          <aside id="sell-desktop-preview" class="sell-wizard-desktop-preview"></aside>
        </div>

        <div id="sell-wizard-footer" class="sell-wizard-footer"></div>
      </div>
    `;

    setSellStep(1);
  }

  function renderSellProgressHTML(step) {
    const steps = [
      { n: 1, label: 'Billeder' },
      { n: 2, label: 'Om cyklen' },
      { n: 3, label: 'Publicer' },
    ];
    return `<div class="sell-progress-row">${steps.map((s, i) => {
      const done = step > s.n;
      const active = step === s.n;
      const dotClass = active ? 'active' : done ? 'done' : 'pending';
      const labelClass = active ? 'active' : done ? '' : 'pending';
      const connector = i < steps.length - 1
        ? `<div class="sell-progress-line" style="background:${done ? 'var(--forest)' : 'var(--border)'}"></div>`
        : '';
      return `
        <button class="sell-progress-step" onclick="step > ${s.n} ? setSellStep(${s.n}) : null" style="cursor:${step > s.n ? 'pointer' : 'default'}">
          <div class="sell-progress-dot ${dotClass}">${done ? '✓' : s.n}</div>
          <span class="sell-progress-label ${labelClass}">${s.label}</span>
        </button>${connector}`;
    }).join('')}</div>`;
  }

  function renderSellStep1HTML() {
    const aiDone = _aiApplied;
    return `
      <h1 class="sell-step-heading">Start med <em>billeder</em></h1>
      <p class="sell-step-subtitle">Gode billeder sælger bedre. Tilføj mindst ét — gerne fra flere vinkler.</p>

      <div class="sell-drop-zone" id="sell-drop-zone" onclick="document.getElementById('sell-file-input').click()"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="event.preventDefault();this.classList.remove('dragover');previewSellImages({files:event.dataTransfer.files})">
        <div class="sell-drop-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="sell-drop-title">Træk billeder hertil</div>
        <div class="sell-drop-sub">eller tryk for at vælge fra bibliotek</div>
        <div class="sell-drop-badge">JPG, PNG, WEBP · op til 10 MB</div>
      </div>
      <input type="file" id="sell-file-input" accept="image/*" multiple style="display:none" onchange="previewSellImages(this)">

      <div id="ai-suggest-wrap" style="display:${getSelectedFiles().length > 0 ? 'block' : 'none'}">
        ${aiDone ? `
          <div class="sell-ai-applied">
            <div class="sell-ai-applied-icon">✓</div>
            <div><b>AI-forslag anvendt.</b> Gennemse i næste trin.</div>
          </div>` : `
          <button type="button" id="ai-suggest-btn" class="sell-ai-btn" onclick="suggestListingFromImages()">
            <div class="sell-ai-btn-icon">✨</div>
            <div>
              <div class="sell-ai-btn-title">Få AI-forslag</div>
              <div class="sell-ai-btn-sub">AI udfylder felterne ud fra billederne. Tjek altid, at oplysningerne er korrekte.</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg);opacity:.6"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div id="ai-suggest-status" class="ai-suggest-status"></div>`}
      </div>

      ${getSelectedFiles().length > 0 ? `
        <div class="sell-photo-grid-header">
          <div class="sell-photo-grid-title">Dine billeder <span class="sell-photo-count">· ${getSelectedFiles().length}/8</span></div>
          <div class="sell-photo-hint">Tryk ★ for primær</div>
        </div>` : ''}
      <div id="sell-preview-grid" class="img-preview-grid sell-preview-grid-new"></div>
      <p class="img-upload-hint" id="sell-img-hint" style="display:none"></p>
    `;
  }

  function renderSellStep2HTML() {
    const currentProfile = getCurrentProfile();
    const isDealer = currentProfile?.seller_type === 'dealer';
    const ai = _aiApplied;
    const c = _sellFormCache;
    const aiClass = ai ? ' ai-field' : '';

    const opt = (val, list) => list.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('');

    return `
      <h1 class="sell-step-heading">Om <em>cyklen</em></h1>
      <p class="sell-step-subtitle">${ai ? 'Vi har udfyldt det vi kunne — gennemgå og ret hvis nødvendigt.' : 'Jo mere præcist, jo bedre bud.'}</p>

      <div class="sell-form-grid-2">
        <div class="sell-field">
          <label>Mærke <span class="req">*</span></label>
          <div class="brand-autocomplete-wrap">
            <input type="text" id="sell-brand" placeholder="Trek" value="${esc(c['sell-brand'] || '')}" class="${aiClass}" oninput="brandAutocomplete(this, 'sell-brand-list')" autocomplete="off">
            <div id="sell-brand-list" class="brand-autocomplete-list" style="display:none"></div>
          </div>
        </div>
        <div class="sell-field">
          <label>Model <span class="req">*</span></label>
          <input type="text" id="sell-model" placeholder="FX 3 Disc" value="${esc(c['sell-model'] || '')}" class="${aiClass}">
        </div>
      </div>

      <div class="sell-field">
        <label>Cykeltype <span class="req">*</span></label>
        <select id="sell-type">
          <option value="">Vælg type</option>
          ${opt(c['sell-type'] || '', ['Racercykel','Mountainbike','Citybike','El-cykel','Ladcykel','Børnecykel','Gravel'])}
        </select>
      </div>

      <div class="sell-form-grid-2">
        <div class="sell-field">
          <label>Stelstørrelse</label>
          <select id="sell-size">
            <option value="">Vælg</option>
            ${opt(c['sell-size'] || '', ['XS (44–48 cm)','S (49–52 cm)','M (53–56 cm)','L (57–60 cm)','XL (61+ cm)'])}
          </select>
          <div class="size-cm-row">
            <input type="number" id="sell-size-cm" placeholder="f.eks. 54" min="30" max="85" value="${c['sell-size-cm'] || ''}">
            <span class="size-cm-unit">cm <span class="size-cm-hint">– valgfri præcis størrelse</span></span>
          </div>
        </div>
        <div class="sell-field">
          <label>Hjulstørrelse</label>
          <select id="sell-wheel-size">
            <option value="">Vælg</option>
            ${opt(c['sell-wheel-size'] || '', ['26"','27.5" / 650b','28"','29"'])}
          </select>
        </div>
        <div class="sell-field">
          <label>Årgang</label>
          <input type="number" id="sell-year" placeholder="2021" min="1950" max="2030" value="${c['sell-year'] || ''}">
        </div>
        <div class="sell-field">
          <label>Stand <span class="req">*</span></label>
          <select id="sell-condition" class="${aiClass}">
            <option value="">Vælg stand</option>
            ${opt(c['sell-condition'] || '', ['Ny','Som ny','God stand','Brugt'])}
          </select>
        </div>
      </div>

      <div class="sell-field">
        <label>Farve(r) <span class="hint">(vælg én eller flere)</span></label>
        <div class="color-swatch-grid" id="sell-color-grid"></div>
      </div>

      <div class="sell-field">
        <label>Pris <span class="req">*</span> <span class="hint">inkl. moms</span></label>
        <div class="suffix-wrap">
          <input type="number" id="sell-price" placeholder="4.500" min="0" value="${c['sell-price'] || ''}">
          <span class="suffix">DKK</span>
        </div>
        <div id="sell-price-suggestion" class="price-suggestion" style="display:none;"></div>
      </div>

      ${isDealer ? `
      <div class="sell-field">
        <label>Garanti <span class="hint">(valgfrit)</span></label>
        <input type="text" id="sell-warranty" placeholder="f.eks. 2 års garanti" value="${esc(c['sell-warranty'] || '')}">
      </div>` : ''}
    `;
  }

  function renderSellStep3HTML() {
    const c = _sellFormCache;
    const brand = c['sell-brand'] || '';
    const model = c['sell-model'] || '';
    const type  = c['sell-type'] || '';
    const size  = c['sell-size'] || '';
    const wheel = c['sell-wheel-size'] || '';
    const year  = c['sell-year'] || '';
    const cond  = c['sell-condition'] || '';
    const colors = Array.isArray(c['sell-colors']) ? c['sell-colors'] : [];
    const price = c['sell-price'] || '';

    const _sf = getSelectedFiles();
    const primaryImg = _sf.find(f => f.isPrimary) || _sf[0];
    const thumbHTML = primaryImg
      ? `<img src="${primaryImg.url}" alt="" class="sell-summary-thumb-img">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:.3">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none"><circle cx="11" cy="27" r="9" stroke="currentColor" stroke-width="2"/><circle cx="29" cy="27" r="9" stroke="currentColor" stroke-width="2"/><path d="M11 27l7-13h7l5 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>`;

    const rows = [
      ['Mærke & model', [brand, model].filter(Boolean).join(' ') || '—'],
      ['Type', type || '—'],
      ['Størrelse', [size, wheel].filter(Boolean).join(' · ') || '—'],
      ['Årgang · Stand', [year, cond].filter(Boolean).join(' · ') || '—'],
      ['Farve', colors.length ? colors.join(', ') : '—'],
      ['Pris', price ? `${Number(price).toLocaleString('da-DK')} DKK` : '—'],
      ['Billeder', `${_sf.length} uploadet`],
    ];

    return `
      <h1 class="sell-step-heading">Sidste <em>finish</em></h1>
      <p class="sell-step-subtitle">Beskriv cyklen med dine egne ord og tjek oversigten.</p>

      <div class="sell-field">
        <label>Beskrivelse <span class="req">*</span> <span class="hint">min. 40 tegn</span></label>
        <textarea id="sell-desc" placeholder="Fortæl om cyklens stand, udstyr, historik, hvorfor du sælger…" rows="5">${esc(c['sell-desc'] || '')}</textarea>
      </div>

      <div class="sell-field">
        <label>By <span class="req">*</span></label>
        <div class="suffix-wrap">
          <span class="suffix" style="left:12px;right:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="1.6"/></svg>
          </span>
          <input type="text" id="sell-city" placeholder="København" value="${esc(c['sell-city'] || '')}" style="padding-left:34px">
        </div>
      </div>

      <div class="sell-summary-card">
        <div class="sell-summary-label">Oversigt</div>
        <div class="sell-summary-top">
          <div class="sell-summary-thumb">${thumbHTML}</div>
          <div>
            <div class="sell-summary-title">${esc([brand, model].filter(Boolean).join(' ') || 'Din cykel')}</div>
            <div class="sell-summary-sub">${esc(type || 'Type')} · ${esc(c['sell-city'] || 'By')}</div>
            <div class="sell-summary-price">${price ? Number(price).toLocaleString('da-DK') + ' DKK' : '— DKK'}</div>
          </div>
        </div>
        <div class="sell-summary-rows">
          ${rows.map(([k, v]) => `
            <div class="sell-summary-row">
              <span class="sell-summary-row-key">${k}</span>
              <span class="sell-summary-row-val">${esc(String(v))}</span>
            </div>`).join('')}
        </div>
      </div>

      <p class="sell-disclaimer" style="margin-top:16px;text-align:center">
        Ved oprettelse accepterer du vores <span onclick="showSellTermsModal()" class="sell-terms-link">vilkår og betingelser</span>.
      </p>
      <button id="sell-submit-btn" style="display:none"></button>
    `;
  }

  function renderSellFooterHTML(step, canContinue) {
    const labels = { 1: 'Fortsæt til om cyklen', 2: 'Fortsæt til publicer', 3: 'Opret annonce' };
    const cls = canContinue ? 'enabled' : 'disabled';
    const dis = canContinue ? '' : 'disabled';
    return `<button class="sell-wizard-cta ${cls}" onclick="advanceSell()" ${dis}>
      ${labels[step]}
      ${step < 3 ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg)"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
    </button>`;
  }

  function renderSellDesktopStepperHTML(step) {
    const steps = [
      { n: 1, label: 'Billeder',  desc: 'Upload fotos af din cykel' },
      { n: 2, label: 'Om cyklen', desc: 'Mærke, model, pris' },
      { n: 3, label: 'Publicer',  desc: 'Beskrivelse & oversigt' },
    ];
    return `
      <div class="sell-desktop-stepper-title">Opret annonce</div>
      ${steps.map(s => {
        const done = step > s.n;
        const active = step === s.n;
        const dotClass = active ? 'active' : done ? 'done' : 'pending';
        const rowClass = active ? 'active' : '';
        const clickable = step > s.n ? `onclick="setSellStep(${s.n})" style="cursor:pointer"` : 'style="cursor:default"';
        return `
          <button class="sell-desktop-step-row ${rowClass}" ${clickable}>
            <div class="sell-progress-dot ${dotClass}">${done ? '✓' : s.n}</div>
            <div class="sell-desktop-step-text">
              <div class="sell-desktop-step-label ${active || done ? '' : 'muted'}">${s.label}</div>
              <div class="sell-desktop-step-desc">${s.desc}</div>
            </div>
          </button>`;
      }).join('')}
      <div class="sell-desktop-stepper-footer">
        Alle felter med <span style="color:var(--rust)">*</span> skal udfyldes.<br>
        Annoncer er aktive i 60 dage.
      </div>
    `;
  }

  function renderSellDesktopPreviewHTML() {
    const currentProfile = getCurrentProfile();
    const c = _sellFormCache;
    const brand = c['sell-brand'] || '';
    const model = c['sell-model'] || '';
    const type  = c['sell-type'] || '';
    const size  = c['sell-size'] || '';
    const year  = c['sell-year'] || '';
    const cond  = c['sell-condition'] || '';
    const price = c['sell-price'] || '';
    const city  = c['sell-city'] || '';

    const _sf2 = getSelectedFiles();
    const primaryImg = _sf2.find(f => f.isPrimary) || _sf2[0];
    const heroHTML = primaryImg
      ? `<img src="${primaryImg.url}" alt="" class="sell-desktop-preview-img">`
      : `<div class="sell-desktop-preview-placeholder">Billede vises her</div>`;

    const condBadge = cond
      ? `<div class="sell-desktop-preview-badge">${esc(cond)}</div>`
      : '';

    const title = [brand, model].filter(Boolean).join(' ') || 'Din cykel';
    const meta  = [type, size, year].filter(Boolean).join(' · ') || 'Type · Størrelse · Årgang';

    const thumbs = _sf2.length > 1
      ? `<div class="sell-desktop-preview-thumbs">
          ${_sf2.slice(0, 4).map(f => `
            <div class="sell-desktop-preview-thumb ${f.isPrimary ? 'primary' : ''}">
              <img src="${f.url}" alt="">
            </div>`).join('')}
         </div>`
      : '';

    const ownerName = currentProfile?.shop_name || currentProfile?.name || 'Sælger';

    return `
      <div class="sell-desktop-preview-label">Sådan ser annoncen ud</div>
      <div class="sell-desktop-preview-card">
        <div class="sell-desktop-preview-hero">
          ${heroHTML}
          ${condBadge}
        </div>
        <div class="sell-desktop-preview-body">
          <div class="sell-desktop-preview-topline">
            <div class="sell-desktop-preview-title">${esc(title)}</div>
            <div class="sell-desktop-preview-price">${price ? Number(price).toLocaleString('da-DK') + ' kr' : '— kr'}</div>
          </div>
          <div class="sell-desktop-preview-meta">${esc(meta)}</div>
          <div class="sell-desktop-preview-foot">
            <span class="sell-desktop-preview-owner">${esc(ownerName)}</span>
            <span class="sell-desktop-preview-city">${esc(city || 'By')}</span>
          </div>
        </div>
      </div>
      ${thumbs}
    `;
  }

  function renderSellDesktopFooterHTML(step, canContinue) {
    const labels = { 1: 'Fortsæt til om cyklen', 2: 'Fortsæt til publicer', 3: 'Opret annonce' };
    const cls = canContinue ? 'enabled' : 'disabled';
    const dis = canContinue ? '' : 'disabled';
    const backDisabled = step === 1;
    return `
      <button class="sell-desktop-back ${backDisabled ? 'disabled' : ''}" ${backDisabled ? 'disabled' : ''} onclick="backSell()">Tilbage</button>
      <button class="sell-desktop-cta ${cls}" onclick="advanceSell()" ${dis}>
        ${labels[step]}
        ${step < 3 ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(-90deg)"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
      </button>
    `;
  }

  function canAdvanceSell() {
    if (_sellStep === 1) return getSelectedFiles().length > 0;
    if (_sellStep === 2) {
      const brand = document.getElementById('sell-brand')?.value.trim();
      const model = document.getElementById('sell-model')?.value.trim();
      const type  = document.getElementById('sell-type')?.value;
      const cond  = document.getElementById('sell-condition')?.value;
      const price = document.getElementById('sell-price')?.value;
      return !!(brand && model && type && cond && price);
    }
    if (_sellStep === 3) {
      const desc = document.getElementById('sell-desc')?.value.trim();
      const city = document.getElementById('sell-city')?.value.trim();
      return !!(desc && desc.length >= 10 && city);
    }
    return false;
  }

  function updateSellFooter() {
    const can = canAdvanceSell();

    const el = document.getElementById('sell-wizard-footer');
    if (el) el.innerHTML = renderSellFooterHTML(_sellStep, can);

    const elDesk = document.getElementById('sell-desktop-footer');
    if (elDesk) {
      elDesk.innerHTML = renderSellDesktopFooterHTML(_sellStep, can);
    }
  }

  function updateSellDesktopPreview() {
    const el = document.getElementById('sell-desktop-preview');
    if (el) el.innerHTML = renderSellDesktopPreviewHTML();
  }

  function captureSellFormCache() {
    if (_sellStep === 2) {
      ['sell-brand','sell-model','sell-type','sell-size','sell-size-cm','sell-wheel-size',
       'sell-year','sell-condition','sell-price','sell-warranty'].forEach(id => {
        const el = document.getElementById(id);
        if (el) _sellFormCache[id] = el.value;
      });
    }
    if (_sellStep === 3) {
      ['sell-desc','sell-city'].forEach(id => {
        const el = document.getElementById(id);
        if (el) _sellFormCache[id] = el.value;
      });
    }
  }

  function setSellStep(n) {
    captureSellFormCache();

    _sellStep = n;

    const stepLabel = document.getElementById('sell-desktop-step-label');
    if (stepLabel) stepLabel.textContent = `Trin ${n} af 3`;

    const stepper = document.getElementById('sell-desktop-stepper');
    if (stepper) stepper.innerHTML = renderSellDesktopStepperHTML(n);

    const progress = document.getElementById('sell-wizard-progress');
    if (progress) progress.innerHTML = renderSellProgressHTML(n);

    const body = document.getElementById('sell-step-body');
    if (body) {
      body.innerHTML = n === 1 ? renderSellStep1HTML()
                     : n === 2 ? renderSellStep2HTML()
                     : renderSellStep3HTML();
    }

    updateSellFooter();
    updateSellDesktopPreview();

    if (n === 1) {
      renderSellImagePreviews();
      updateAiSuggestVisibility();
    }

    const refreshOnChange = () => { updateSellFooter(); updateSellDesktopPreview(); };

    if (n === 2) {
      const typeEl = document.getElementById('sell-type');
      if (typeEl) typeEl.addEventListener('change', () => updateSellPriceSuggestion(typeEl.value));
      initSellDraft();
      if (_aiSuggestionPending) {
        setTimeout(() => { applyAiSuggestion(_aiSuggestionPending); _aiSuggestionPending = null; }, 50);
      }
      // Color swatches
      const colorGrid = document.getElementById('sell-color-grid');
      const initialColors = Array.isArray(_sellFormCache['sell-colors']) ? _sellFormCache['sell-colors'] : [];
      renderColorSwatches(colorGrid, {
        selected: initialColors,
        variant: 'tile',
        max: 3,
        onChange: (sel) => { _sellFormCache['sell-colors'] = sel; refreshOnChange(); },
      });
      // Live footer + preview updates
      ['sell-brand','sell-model','sell-type','sell-size','sell-size-cm','sell-wheel-size',
       'sell-year','sell-condition','sell-price'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { captureSellFormCache(); refreshOnChange(); });
        el.addEventListener('change', () => { captureSellFormCache(); refreshOnChange(); });
      });
    }

    if (n === 3) {
      ['sell-desc','sell-city'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => { captureSellFormCache(); refreshOnChange(); });
      });
      // By-autocomplete for private sælgere (grov bymidte, ikke præcis adresse)
      const sellCity = document.getElementById('sell-city');
      if (sellCity) attachCityAutocomplete(sellCity);
      // Re-init draft listeners for step 3 fields
      const debouncedSave = debounce(() => saveSellDraft(), 600);
      ['sell-desc','sell-city'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', debouncedSave);
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function advanceSell() {
    if (!canAdvanceSell()) {
      showToast('⚠️ Udfyld alle påkrævede felter');
      return;
    }
    if (_sellStep < 3) {
      setSellStep(_sellStep + 1);
    } else {
      captureSellFormCache(); // ensure step 3 fields are saved before submit
      submitSellPage();
    }
  }

  function backSell() {
    if (_sellStep > 1) setSellStep(_sellStep - 1);
    else navigateTo('/');
  }

  /* ------ Draft ------------------------------------------------ */

  function saveSellDraft() {
    try {
      const draft = {};
      let hasAny = false;
      SELL_DRAFT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value != null && el.value !== '') {
          draft[id] = el.value;
          hasAny = true;
        }
      });
      if (hasAny) {
        draft._savedAt = Date.now();
        localStorage.setItem(SELL_DRAFT_KEY, JSON.stringify(draft));
      } else {
        localStorage.removeItem(SELL_DRAFT_KEY);
      }
    } catch (_) {}
  }

  function clearSellDraft() {
    try { localStorage.removeItem(SELL_DRAFT_KEY); } catch (_) {}
    const banner = document.getElementById('sell-draft-banner');
    if (banner) banner.remove();
  }

  function applySellDraft(draft) {
    SELL_DRAFT_FIELDS.forEach(id => {
      if (draft[id] != null) {
        const el = document.getElementById(id);
        if (el) el.value = draft[id];
      }
    });
    const typeSelect = document.getElementById('sell-type');
    if (typeSelect && typeSelect.value) updateSellPriceSuggestion(typeSelect.value);
    showDraftSavedIndicator('Kladde gendannet');
  }

  function showDraftSavedIndicator(text) {
    const ind = document.getElementById('sell-draft-indicator');
    if (!ind) return;
    ind.textContent = text || '✓ Kladde gemt';
    ind.classList.add('show');
    clearTimeout(ind._hideTimer);
    ind._hideTimer = setTimeout(() => ind.classList.remove('show'), 1600);
  }

  function initSellDraft() {
    let existing = null;
    try {
      const raw = localStorage.getItem(SELL_DRAFT_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch (_) {}

    // Tilføj kladde-indikator
    const actions = document.querySelector('.sell-page-actions');
    if (actions && !document.getElementById('sell-draft-indicator')) {
      const ind = document.createElement('div');
      ind.id = 'sell-draft-indicator';
      ind.className = 'sell-draft-indicator';
      ind.textContent = '✓ Kladde gemt';
      actions.prepend(ind);
    }

    // Vis "gendan kladde"-banner hvis der er en gemt kladde
    if (existing && existing._savedAt) {
      const body = document.querySelector('.sell-page-body');
      if (body && !document.getElementById('sell-draft-banner')) {
        const minsAgo = Math.max(1, Math.round((Date.now() - existing._savedAt) / 60000));
        const banner = document.createElement('div');
        banner.id = 'sell-draft-banner';
        banner.className = 'sell-draft-banner';
        banner.innerHTML = `
          <span>💾 Du har en gemt kladde fra ${minsAgo} min. siden.</span>
          <div class="sell-draft-banner-actions">
            <button type="button" class="sell-draft-restore">Gendan</button>
            <button type="button" class="sell-draft-discard">Kassér</button>
          </div>`;
        body.prepend(banner);
        banner.querySelector('.sell-draft-restore').onclick = () => {
          applySellDraft(existing);
          banner.remove();
        };
        banner.querySelector('.sell-draft-discard').onclick = () => {
          clearSellDraft();
        };
      }
    }

    // Lyt på ændringer → debounce-gem
    const debouncedSave = debounce(() => {
      saveSellDraft();
      showDraftSavedIndicator('✓ Kladde gemt');
    }, 600);
    SELL_DRAFT_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', debouncedSave);
      el.addEventListener('change', debouncedSave);
    });
  }

  /* ------ Price suggestion ------------------------------------- */

  async function updateSellPriceSuggestion(bikeType) {
    const wrap = document.getElementById('sell-price-suggestion');
    if (!wrap || !bikeType) { if (wrap) wrap.style.display = 'none'; return; }

    const { data } = await supabase
      .from('bikes')
      .select('price')
      .eq('type', bikeType)
      .eq('is_active', true)
      .limit(50);

    if (!data || data.length < 3) { wrap.style.display = 'none'; return; }

    const prices = data.map(b => b.price).sort((a, b) => a - b);
    const avg    = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const low    = prices[Math.floor(prices.length * 0.25)];
    const high   = prices[Math.floor(prices.length * 0.75)];

    wrap.innerHTML = `💡 Andre ${esc(bikeType).toLowerCase()}er sælges typisk for <strong>${low.toLocaleString('da-DK')}–${high.toLocaleString('da-DK')} kr.</strong> (gns. ${avg.toLocaleString('da-DK')} kr.)`;
    wrap.style.display = 'block';
  }

  /* ------ Image handling -------------------------------------- */

  function previewSellImages(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const sf = getSelectedFiles();
    const remaining = 8 - sf.length;
    const toAdd = files.filter(validateImageFile).slice(0, remaining);

    toAdd.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      sf.push({ file, url, isPrimary: sf.length === 0 && i === 0 });
    });

    renderSellImagePreviews();
    updateAiSuggestVisibility();
    const label = document.getElementById('sell-upload-label');
    if (label) label.textContent = `${sf.length} billede${sf.length !== 1 ? 'r' : ''} valgt`;
  }

  function renderSellImagePreviews() {
    const grid = document.getElementById('sell-preview-grid');
    if (!grid) return;
    const sf = getSelectedFiles();
    grid.innerHTML = sf.map((item, i) => `
      <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
        <img src="${item.url}" alt="Billede ${i + 1}">
        ${item.isPrimary
          ? '<span class="primary-badge">⭐ Forsidebillede</span>'
          : `<button class="set-primary" title="Sæt som forsidebillede" onclick="setSellPrimary(${i})">★</button>`}
        <button class="crop-img" title="Beskær billede" onclick="openCropModal('sell', ${i})">✂️</button>
        <button class="remove-img" onclick="removeSellImage(${i})">✕</button>
      </div>`).join('');
    const hint = document.getElementById('sell-img-hint');
    if (hint) hint.style.display = sf.length > 1 ? 'block' : 'none';
    updateSellDesktopPreview();
    updateSellFooter();
  }

  function updateAiSuggestVisibility() {
    const wrap = document.getElementById('ai-suggest-wrap');
    if (!wrap) return;
    wrap.style.display = getSelectedFiles().length > 0 ? 'block' : 'none';
  }

  function setSellPrimary(index) {
    getSelectedFiles().forEach((item, i) => { item.isPrimary = i === index; });
    renderSellImagePreviews();
  }

  function removeSellImage(index) {
    const sf = getSelectedFiles();
    URL.revokeObjectURL(sf[index].url);
    sf.splice(index, 1);
    if (sf.length > 0 && !sf.some(f => f.isPrimary)) sf[0].isPrimary = true;
    renderSellImagePreviews();
    updateAiSuggestVisibility();
    const label = document.getElementById('sell-upload-label');
    if (label) label.textContent = sf.length > 0
      ? `${sf.length} billede${sf.length !== 1 ? 'r' : ''} valgt`
      : 'Klik for at vælge billeder';
  }

  /* ------ AI suggestion --------------------------------------- */

  async function suggestListingFromImages() {
    const currentUser = getCurrentUser();
    const sf = getSelectedFiles();
    if (!sf.length) {
      showToast('⚠️ Upload mindst ét billede først');
      return;
    }
    if (!currentUser) {
      openLoginModal();
      return;
    }

    const btn = document.getElementById('ai-suggest-btn');
    const status = document.getElementById('ai-suggest-status');
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('loading');
    const labelEl = btn.querySelector('.sell-ai-btn-title') || btn.querySelector('.ai-suggest-label');
    const originalLabel = labelEl ? labelEl.textContent : '';
    if (labelEl) labelEl.textContent = 'Analyserer billeder...';
    if (status) { status.textContent = ''; status.className = 'ai-suggest-status'; }

    try {
      // Brug op til 4 billeder, prioriter forsidebilledet først
      const ordered = sf.slice().sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
      const picks = ordered.slice(0, 4);

      const images = await Promise.all(picks.map(async (item) => {
        const { mediaType, base64 } = await fileToBase64(item.file);
        return { media_type: mediaType, data: base64 };
      }));

      // Brug evt. eksisterende tekst som hint (hvis brugeren allerede har skrevet noget)
      const hint = [
        document.getElementById('sell-brand')?.value,
        document.getElementById('sell-model')?.value,
      ].filter(Boolean).join(' ').trim();

      const { data, error } = await supabase.functions.invoke('suggest-listing', {
        body: { images, hint: hint || undefined },
      });

      if (error || !data?.suggestion) {
        console.error('suggest-listing fejl:', error || data);
        if (status) { status.textContent = '❌ Kunne ikke hente forslag. Prøv igen.'; status.className = 'ai-suggest-status error'; }
        return;
      }

      applyAiSuggestion(data.suggestion);
      if (status) { status.textContent = '✓ Felter udfyldt med AI-forslag. Tjek og ret inden du opretter.'; status.className = 'ai-suggest-status success'; }
    } catch (err) {
      console.error('suggestListingFromImages fejl:', err);
      if (status) { status.textContent = '❌ Noget gik galt. Prøv igen.'; status.className = 'ai-suggest-status error'; }
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      if (labelEl) labelEl.textContent = originalLabel;
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        // result format: "data:image/jpeg;base64,XXXXX"
        const match = result.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) { reject(new Error('Ugyldig fil')); return; }
        resolve({ mediaType: match[1], base64: match[2] });
      };
      reader.onerror = () => reject(new Error('Kunne ikke læse fil'));
      reader.readAsDataURL(file);
    });
  }

  function applyAiSuggestion(s) {
    if (!s || typeof s !== 'object') return;
    _aiApplied = true;
    // If step 2 fields don't exist yet, store for when step 2 renders
    if (!document.getElementById('sell-brand')) {
      _aiSuggestionPending = s;
      // Re-render step 1 to show "AI applied" state
      const body = document.getElementById('sell-step-body');
      if (body && _sellStep === 1) body.innerHTML = renderSellStep1HTML();
      return;
    }

    const setField = (id, value) => {
      if (value == null || value === '') return;
      const el = document.getElementById(id);
      if (!el) return;
      // Skriv ikke over hvis brugeren allerede har udfyldt feltet
      if (el.value && el.value.trim() !== '') return;
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setField('sell-brand', s.brand);
    setField('sell-model', s.model);
    setField('sell-type', s.type);
    setField('sell-size', s.size);
    setField('sell-wheel-size', s.wheel_size);
    setField('sell-year', s.year);
    setField('sell-condition', s.condition);
    if (s.color) {
      const colorList = BIKE_COLORS.map(c => c.name);
      const matched = colorList.filter(name => s.color.toLowerCase().includes(name.toLowerCase()));
      _sellFormCache['sell-colors'] = matched;
      const grid = document.getElementById('sell-color-grid');
      if (grid) setSelectedColors(grid, matched);
    }
    setField('sell-desc', s.description);

    // Pris: brug midten af intervallet hvis både min og max er givet
    if (s.price_min != null && s.price_max != null) {
      const mid = Math.round((Number(s.price_min) + Number(s.price_max)) / 2);
      if (!isNaN(mid)) setField('sell-price', mid);
    } else if (s.price_min != null) {
      setField('sell-price', s.price_min);
    }

    // Trigger draft-save så AI-forslag også persisteres
    saveSellDraft();
  }

  /* ------ Success modal --------------------------------------- */

  function showListingSuccessModal(bike) {
    const modal = document.getElementById('listing-success-modal');
    if (!modal) return;
    const titleEl = document.getElementById('success-bike-title');
    const priceEl = document.getElementById('success-bike-price');
    const viewBtn = document.getElementById('success-view-btn');
    const newBtn  = document.getElementById('success-new-btn');
    if (titleEl) titleEl.textContent = `${bike.brand} ${bike.model}`;
    if (priceEl) priceEl.textContent = bike.price ? `${bike.price.toLocaleString('da-DK')} kr.` : '';
    if (viewBtn) viewBtn.onclick = () => { closeListingSuccessModal(); navigateTo(`/bike/${bike.id}`); };
    if (newBtn)  newBtn.onclick  = () => { closeListingSuccessModal(); renderSellPage(); };
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeListingSuccessModal() {
    const modal = document.getElementById('listing-success-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  /* ----------------------------------------------------------
     Public API
  ---------------------------------------------------------- */
  function showSellTermsModal() {
    const existing = document.getElementById('sell-terms-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'sell-terms-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(26,26,24,0.55);z-index:9000;display:flex;align-items:flex-end;justify-content:center';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const TERMS_BODY = `
      <p style="margin-bottom:16px;color:var(--muted);font-size:0.82rem;">Senest opdateret: 16. april 2026</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">1. Introduktion og tjenesteyder</h3>
      <p style="margin-bottom:8px;">Cykelbørsen er en online markedsplads der formidler kontakt mellem private sælgere, forhandlere og købere af brugte cykler i Danmark. Platformen er tilgængelig via <strong>cykelbørsen.dk</strong>. Ved at oprette en konto eller benytte platformen accepterer du disse vilkår i deres helhed.</p>
      <p style="margin-bottom:16px;font-size:0.85rem;"><strong>Virksomhedsoplysninger:</strong><br>Cykelbørsen v/ Benjamin Vojdeman · CVR: 46403568<br>Bentzonsvej 46, 2. tv, 2000 Frederiksberg · hej@cykelbørsen.dk</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">2. Brugeroprettelse og konto</h3>
      <p style="margin-bottom:8px;">For at oprette annoncer eller kontakte sælgere skal du oprette en konto med en gyldig e-mailadresse. Du er ansvarlig for at de oplysninger du angiver er korrekte, at holde dine loginoplysninger fortrolige og al aktivitet under din konto. Du skal være mindst 18 år.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;margin-top:16px;">3. Platformens rolle</h3>
      <p style="margin-bottom:16px;">Cykelbørsen er udelukkende en formidlingsplatform. Vi er <strong>ikke part</strong> i handler mellem køber og sælger og påtager os intet ansvar for selve transaktionen.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">4. Oprettelse af annoncer</h3>
      <p style="margin-bottom:8px;">Som sælger indestår du for at annoncen er retvisende, at du har lovlig ret til at sælge varen, og at indholdet ikke krænker tredjemands rettigheder. Vi kan uden varsel fjerne annoncer der overtræder disse vilkår.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;margin-top:16px;">5. Forhandlerkonto</h3>
      <p style="margin-bottom:16px;">Professionelle cykelforhandlere kan oprette en gratis forhandlerkonto med gyldigt CVR-nummer. Vi forbeholder os retten til at afvise eller fjerne forhandlerkonti der ikke opfylder kravene.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">6. Forbudt indhold og adfærd</h3>
      <p style="margin-bottom:16px;">Det er ikke tilladt at oprette annoncer for stjålne varer, anvende platformen til svindel eller spam, uploade ulovligt indhold, eller manipulere priser eller anmeldelser. Overtrædelse kan medføre øjeblikkelig kontosletning.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">7. Ansvarsfraskrivelse</h3>
      <p style="margin-bottom:16px;">Platformen stilles til rådighed "som den er". Vi garanterer ikke for rigtigheden af annoncer og er ikke ansvarlig for tab som følge af handler indgået via platformen.</p>
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">8. Ændringer og kontakt</h3>
      <p style="margin-bottom:8px;">Vi kan opdatere disse vilkår fra tid til anden. Væsentlige ændringer meddeles via e-mail. Fortsat brug udgør accept af opdaterede vilkår.</p>
      <p>Ved spørgsmål: <strong>hej@cykelbørsen.dk</strong></p>
    `;

    overlay.innerHTML = `
      <div style="background:var(--cream);width:100%;max-width:680px;max-height:88vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 32px rgba(0,0,0,0.18)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
          <div>
            <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.08em;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Juridisk</div>
            <h2 style="font-family:'Fraunces',serif;font-size:1.3rem;font-weight:700;color:var(--charcoal);margin:0">Vilkår og betingelser</h2>
          </div>
          <button onclick="document.getElementById('sell-terms-overlay').remove()" style="width:36px;height:36px;border-radius:50%;background:var(--sand);border:none;color:var(--charcoal);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">×</button>
        </div>
        <div style="overflow-y:auto;padding:24px;flex:1;font-family:'DM Sans',sans-serif;font-size:0.88rem;line-height:1.7;color:var(--charcoal)">
          ${TERMS_BODY}
        </div>
        <div style="padding:16px 24px;border-top:1px solid var(--border);flex-shrink:0;background:var(--cream)">
          <button onclick="document.getElementById('sell-terms-overlay').remove()" style="width:100%;padding:14px;background:var(--forest);color:var(--sand);border:none;border-radius:12px;font-family:'DM Sans',sans-serif;font-size:0.92rem;font-weight:600;cursor:pointer">
            Forstået — fortsæt
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    });
  }

  return {
    // OPRET ANNONCE MODAL
    openModal,
    _openModalLegacy,
    closeModal,
    selectType,
    submitListing,
    // OPRET ANNONCE SIDE
    renderSellPage,
    submitSellPage,
    previewSellImages,
    setSellPrimary,
    removeSellImage,
    suggestListingFromImages,
    applyAiSuggestion,
    fileToBase64,
    setSellStep,
    advanceSell,
    backSell,
    saveSellDraft,
    clearSellDraft,
    initSellDraft,
    updateSellPriceSuggestion,
    showListingSuccessModal,
    closeListingSuccessModal,
    renderSellImagePreviews,
    showSellTermsModal,
  };
}
