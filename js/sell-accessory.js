/* ============================================================
   SÆLG-FLOW: kategori-vælger + LET tilbehørs-flow
   ------------------------------------------------------------
   /sell starter nu med "Hvad vil du sælge?" (Cykel | Tilbehør).
   - Cykel    → det eksisterende cykel-wizard-flow (renderSellPage), UÆNDRET.
   - Tilbehør → et separat, let ét-trins-flow her (INGEN cykel-spec-felter).

   Genbruger byggeklodser frem for at duplikere:
   - billed-upload: window.previewSellImages + getSelectedFiles + uploadImages
     (samme element-id'er `sell-file-input` / `sell-preview-grid` som cykel-flowet)
   - DAWA by-autocomplete: attachCityAutocomplete
   - success-modal: showListingSuccessModal (fra sell-page.js)

   Opretter i `bikes` med category='tilbehoer', type=underkategori.
   Cykel-flowet i sell-page.js røres IKKE.
   ============================================================ */
export function createSellAccessory({
  supabase,
  showToast,
  esc,
  btnLoading,
  updateSEOMeta,
  attachCityAutocomplete,
  blockIfPendingDealer,
  openLoginModal,
  navigateTo,
  showDetailView,
  getSelectedFiles,
  uploadImages,
  getCurrentUser,
  getCurrentProfile,
  accessoryTypes,
  showListingSuccessModal,
}) {
  let _submitting = false;

  // Samme stand-liste som cykel-flowet (js/sell-page.js) — hold identisk.
  const CONDITIONS = ['Ny', 'Som ny', 'God stand', 'Brugt'];

  /* ---- delte SVG'er (kopieret fra sell-page.js så shell'en er identisk) ---- */
  const BACK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const LOGO_SVG = `
    <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
      <circle cx="11" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
      <circle cx="29" cy="27" r="9" stroke="var(--forest)" stroke-width="2.5"/>
      <path d="M11 27l7-13h7l5 13M18 14h-3M23 14l-5 13" stroke="var(--rust)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const UPLOAD_SVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHEV_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const BIKE_ICON = `<svg width="26" height="26" viewBox="0 0 40 40" fill="none"><circle cx="11" cy="27" r="8" stroke="currentColor" stroke-width="2.4"/><circle cx="29" cy="27" r="8" stroke="currentColor" stroke-width="2.4"/><path d="M11 27l7-13h7l5 13M18 14h-3M23 14l-5 13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ACC_ICON = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2 1 3.5 2.2 4.8.7.8 1.3 1.5 1.5 2.7l.3 1.5h6l.3-1.5c.2-1.2.8-1.9 1.5-2.7C18 12.5 19 11 19 9a7 7 0 0 0-7-7Z"/><path d="M9.5 21h5"/></svg>`;

  /* ---- inline styling (scoped) — resten genbruger .sell-wizard/.sell-field ---- */
  const CSS = `
    .acc-chooser{display:flex;flex-direction:column;gap:14px;margin-top:8px;}
    .acc-choice{display:flex;align-items:center;gap:16px;width:100%;text-align:left;
      background:var(--cream);border:1.5px solid var(--border);border-radius:16px;
      padding:20px 18px;cursor:pointer;font-family:'DM Sans',sans-serif;
      transition:border-color .15s,box-shadow .15s,transform .05s;}
    .acc-choice:hover{border-color:var(--forest);box-shadow:0 6px 18px rgba(26,26,24,0.10);}
    .acc-choice:active{transform:scale(0.99);}
    .acc-choice-ic{width:52px;height:52px;flex-shrink:0;border-radius:13px;
      display:flex;align-items:center;justify-content:center;
      background:var(--sand);color:var(--forest);}
    .acc-choice-txt{flex:1;min-width:0;}
    .acc-choice-title{font-family:'Fraunces',serif;font-size:1.15rem;font-weight:600;color:var(--charcoal);}
    .acc-choice-sub{font-size:0.83rem;color:var(--muted);margin-top:2px;}
    .acc-choice-arrow{color:var(--muted);flex-shrink:0;}
    .acc-price-wrap{position:relative;display:flex;align-items:center;}
    .acc-price-wrap input{flex:1;padding-right:38px;}
    .acc-price-unit{position:absolute;right:14px;color:var(--muted);font-size:0.9rem;pointer-events:none;}
    .acc-publish-btn{width:100%;margin-top:20px;padding:15px;border:none;border-radius:14px;
      background:var(--forest);color:var(--sand);font-family:'DM Sans',sans-serif;
      font-size:0.98rem;font-weight:600;cursor:pointer;transition:opacity .15s,background .15s;}
    .acc-publish-btn:disabled{opacity:0.45;cursor:not-allowed;}
    .acc-publish-btn:not(:disabled):hover{background:#24331f;}
    .acc-legal{font-size:0.72rem;color:var(--muted);text-align:center;margin-top:10px;line-height:1.5;}
  `;

  function _guardAuth() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      openLoginModal();
      showToast('⚠️ Log ind for at oprette en annonce');
      navigateTo('/');
      return false;
    }
    if (blockIfPendingDealer()) return false;
    return true;
  }

  function _topBar(backHandler) {
    return `
      <div class="sell-wizard-top">
        <button class="sell-wizard-back-btn" onclick="${backHandler}" aria-label="Tilbage">${BACK_SVG}</button>
        <div class="sell-wizard-logo">${LOGO_SVG}<span>Cykelbørsen</span></div>
        <div style="width:40px"></div>
      </div>`;
  }

  /* ========================================================
     TRIN 0 — "Hvad vil du sælge?"
     ======================================================== */
  function renderSellChooser() {
    if (!_guardAuth()) return;
    showDetailView();
    document.body.classList.add('on-sell-page');
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Opret annonce – Cykelbørsen';
    updateSEOMeta('Sælg din cykel eller cykeltilbehør gratis på Cykelbørsen. Opret en annonce på under 2 minutter.', '/sell');
    getSelectedFiles().splice(0);

    document.getElementById('detail-view').innerHTML = `
      <style>${CSS}</style>
      <div class="sell-wizard">
        ${_topBar("navigateTo('/')")}
        <div class="sell-wizard-body">
          <h1 class="sell-step-heading">Hvad vil du <em>sælge?</em></h1>
          <p class="sell-step-subtitle">Vælg kategori — så tilpasser vi formularen.</p>
          <div class="acc-chooser">
            <button class="acc-choice" onclick="renderSellPage()">
              <div class="acc-choice-ic">${BIKE_ICON}</div>
              <div class="acc-choice-txt">
                <div class="acc-choice-title">Cykel</div>
                <div class="acc-choice-sub">Racer, mountainbike, el-cykel, citybike m.m.</div>
              </div>
              <div class="acc-choice-arrow">${CHEV_SVG}</div>
            </button>
            <button class="acc-choice" onclick="renderSellAccessoryPage()">
              <div class="acc-choice-ic">${ACC_ICON}</div>
              <div class="acc-choice-txt">
                <div class="acc-choice-title">Tilbehør &amp; udstyr</div>
                <div class="acc-choice-sub">Hjelm, lygter, lås, computer, tasker m.m.</div>
              </div>
              <div class="acc-choice-arrow">${CHEV_SVG}</div>
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ========================================================
     TILBEHØRS-FLOW — ét enkelt trin
     ======================================================== */
  function renderSellAccessoryPage() {
    if (!_guardAuth()) return;
    showDetailView();
    document.body.classList.add('on-sell-page');
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Sælg tilbehør – Cykelbørsen';
    updateSEOMeta('Sælg brugt cykeltilbehør og -udstyr gratis på Cykelbørsen.', '/sell');
    getSelectedFiles().splice(0);

    const profile = getCurrentProfile();
    const cityVal = profile?.city ? esc(profile.city) : '';

    const typeOpts = ['<option value="">Vælg kategori</option>']
      .concat(accessoryTypes.map(t => `<option>${esc(t)}</option>`)).join('');
    const condOpts = ['<option value="">Vælg stand</option>']
      .concat(CONDITIONS.map(c => `<option>${esc(c)}</option>`)).join('');

    document.getElementById('detail-view').innerHTML = `
      <style>${CSS}</style>
      <div class="sell-wizard">
        ${_topBar('renderSellChooser()')}
        <div class="sell-wizard-body">
          <h1 class="sell-step-heading">Sælg <em>tilbehør</em></h1>
          <p class="sell-step-subtitle">Kort og enkelt — udfyld felterne og udgiv.</p>

          <div class="sell-drop-zone" onclick="document.getElementById('sell-file-input').click()"
            ondragover="event.preventDefault();this.classList.add('dragover')"
            ondragleave="this.classList.remove('dragover')"
            ondrop="event.preventDefault();this.classList.remove('dragover');previewSellImages({files:event.dataTransfer.files});checkAccessoryForm()">
            <div class="sell-drop-icon">${UPLOAD_SVG}</div>
            <div class="sell-drop-title">Træk billeder hertil</div>
            <div class="sell-drop-sub">eller tryk for at vælge fra bibliotek</div>
            <div class="sell-drop-badge">JPG, PNG, WEBP · op til 10 MB</div>
          </div>
          <input type="file" id="sell-file-input" accept="image/*" multiple style="display:none" onchange="previewSellImages(this);checkAccessoryForm()">
          <div id="sell-preview-grid" class="img-preview-grid sell-preview-grid-new"></div>

          <div class="sell-field">
            <label>Titel <span class="req">*</span></label>
            <input type="text" id="acc-title" maxlength="80" placeholder="f.eks. Giro Aether MIPS cykelhjelm, str. M" oninput="checkAccessoryForm()">
          </div>

          <div class="sell-form-grid-2">
            <div class="sell-field">
              <label>Kategori <span class="req">*</span></label>
              <select id="acc-type" onchange="checkAccessoryForm()">${typeOpts}</select>
            </div>
            <div class="sell-field">
              <label>Mærke <span class="optional-hint">(valgfrit)</span></label>
              <input type="text" id="acc-brand" maxlength="60" placeholder="f.eks. Giro">
            </div>
          </div>

          <div class="sell-form-grid-2">
            <div class="sell-field">
              <label>Stand <span class="req">*</span></label>
              <select id="acc-condition" onchange="checkAccessoryForm()">${condOpts}</select>
            </div>
            <div class="sell-field">
              <label>Pris <span class="req">*</span></label>
              <div class="acc-price-wrap">
                <input type="number" id="acc-price" min="1" max="9999999" placeholder="0" onwheel="this.blur()" oninput="checkAccessoryForm()">
                <span class="acc-price-unit">kr.</span>
              </div>
            </div>
          </div>

          <div class="sell-field">
            <label>Beskrivelse <span class="optional-hint">(anbefales)</span></label>
            <textarea id="acc-desc" rows="4" maxlength="2000" placeholder="Stand, størrelse, alder, evt. fejl — jo mere præcist, jo bedre."></textarea>
          </div>

          <div class="sell-field">
            <label>By <span class="req">*</span></label>
            <input type="text" id="acc-city" placeholder="København" value="${cityVal}" oninput="checkAccessoryForm()" autocomplete="off">
          </div>

          <button id="acc-submit-btn" class="acc-publish-btn" onclick="submitAccessoryListing()" disabled>Udgiv annonce</button>
          <p class="acc-legal">Ved at udgive accepterer du Cykelbørsens vilkår. Du indestår for at annoncen er retvisende og lovlig.</p>
        </div>
      </div>`;

    const cityEl = document.getElementById('acc-city');
    if (cityEl) attachCityAutocomplete(cityEl);
    checkAccessoryForm();
  }

  // Aktivér/deaktivér "Udgiv"-knappen ud fra påkrævede tekstfelter.
  // (Billeder valideres i submit — de reused image-fns kalder ikke tilbage hertil.)
  function checkAccessoryForm() {
    const title = document.getElementById('acc-title')?.value.trim();
    const type  = document.getElementById('acc-type')?.value;
    const cond  = document.getElementById('acc-condition')?.value;
    const price = document.getElementById('acc-price')?.value;
    const city  = document.getElementById('acc-city')?.value.trim();
    const ok = !!(title && type && cond && price && city);
    const btn = document.getElementById('acc-submit-btn');
    if (btn) btn.disabled = !ok;
    return ok;
  }

  async function submitAccessoryListing() {
    if (_submitting) return;
    const currentUser = getCurrentUser();
    if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }
    if (blockIfPendingDealer()) return;

    const title = document.getElementById('acc-title')?.value.trim() || '';
    const type  = document.getElementById('acc-type')?.value || '';
    const brand = document.getElementById('acc-brand')?.value.trim() || '';
    const cond  = document.getElementById('acc-condition')?.value || '';
    const price = parseInt(document.getElementById('acc-price')?.value);
    const desc  = document.getElementById('acc-desc')?.value.trim() || '';
    const city  = document.getElementById('acc-city')?.value.trim() || '';

    if (!title || !type || !cond || !city) {
      showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
    }
    if (!Number.isFinite(price) || price < 1 || price > 9999999) {
      showToast('⚠️ Angiv en gyldig pris mellem 1 og 9.999.999 kr.'); return;
    }
    if (getSelectedFiles().length === 0) {
      showToast('⚠️ Tilføj mindst ét billede'); return;
    }

    _submitting = true;
    const restore = btnLoading('acc-submit-btn', 'Udgiver…');
    try {
      const fullTitle = ((brand ? brand + ' ' : '') + title).trim();
      // Genbruger bikes-tabellen: category adskiller hårdt fra cykler.
      // Kun generiske felter sættes — alle cykel-spec-kolonner står NULL.
      const bikeData = {
        user_id: currentUser.id,
        category: 'tilbehoer',
        type,                       // underkategori (Hjelm, Lygter, …)
        brand: brand || '',
        model: title,               // titel/navn — kort-visning bruger bikeTitle(brand, model)
        title: fullTitle,
        price,
        original_price: price,      // ingen falsk rabat for private
        condition: cond,
        city,
        description: desc || null,
        is_active: true,
      };

      const res = await supabase.from('bikes').insert(bikeData).select().single();
      if (res.error) {
        showToast('❌ Noget gik galt – prøv igen');
        console.error('Tilbehør-insert fejl:', res.error);
        restore();
        _submitting = false;
        return;
      }
      const newBike = res.data;

      await uploadImages(newBike.id, (cur, tot) => {
        const btn = document.getElementById('acc-submit-btn');
        if (btn) btn.textContent = `Uploader ${cur}/${tot}…`;
      });

      getSelectedFiles().splice(0);
      // Genbruger success-modalen. brand=fullTitle/model='' → ren titel-visning.
      showListingSuccessModal({ id: newBike.id, brand: fullTitle, model: '', price });
    } finally {
      restore();
      _submitting = false;
    }
  }

  return {
    renderSellChooser,
    renderSellAccessoryPage,
    checkAccessoryForm,
    submitAccessoryListing,
  };
}
