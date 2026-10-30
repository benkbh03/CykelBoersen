/* ============================================================
   UDLEJNING — forhandler-administration
   ------------------------------------------------------------
   /udlejning/opret        – opret nyt udlejnings-item
   /udlejning/rediger/:id  – rediger eksisterende
   /udlejning/mine         – forhandlerens egne udlejningscykler

   Selvstændig billede-upload (validér + komprimér + upload til
   bike-images-bucket + insert i rental_item_images) — afkoblet fra
   salgs-flowets delte upload-komponent for at holde udlejning isoleret.
   ============================================================ */

import { RENTAL_TYPES, RENTAL_MIN_DAYS, RENTAL_MAX_DAYS } from './rental-data.js';
import { rentalCardHTML, rentalTermsHTML } from './rental-card.js';
import { iconBike } from './utils.js';

export function createRentalManage({
  supabase,
  esc,
  showToast,
  compressImage,
  validateImageFile,
  getCurrentUser,
  getCurrentProfile,
  showDetailView,
  showListingView,
  navigateTo,
  attachAddressAutocomplete,
  attachCityAutocomplete,
  BASE_URL,
}) {

  // Lokal upload-state: [{ file, url, isPrimary }] (nye) + [{ id, url, is_primary, toDelete }] (eksisterende ved edit)
  let _files = [];
  let _existing = [];
  let _editId = null;
  let _dealerName = 'Forhandler';
  // Adressen skal være valgt fra opslaget (som på forhandlerprofilen), så
  // kunden kan finde afhentningsstedet. Den gemte værdi tæller som valgt.
  let _addressConfirmed = '';

  /* ---------- Guard: kun forhandlere ---------- */
  async function _requireDealer(dv) {
    const user = getCurrentUser();
    if (!user) {
      dv.innerHTML = shell('<p>Log ind som forhandler for at administrere udlejning.</p><button class="rental-onb-btn" onclick="openLoginModal()">Log ind</button>');
      return null;
    }
    const { data: p } = await supabase
      .from('profiles')
      .select('seller_type, stripe_account_status, shop_name, name, city, address')
      .eq('id', user.id)
      .single();
    if (!p || p.seller_type !== 'dealer') {
      dv.innerHTML = shell('<p>Udlejning er kun for forhandlere.</p><button class="rental-onb-btn" onclick="navigateTo(\'/bliv-forhandler\')">Bliv forhandler</button>');
      return null;
    }
    return { user, profile: p };
  }

  function shell(inner) {
    return `<div class="rental-manage"><button class="sell-back-btn" onclick="navigateTo('/udlejning/mine')">← Tilbage</button><div class="rental-onb-card" style="text-align:center;">${inner}</div></div>`;
  }

  function connectBanner(status) {
    if (status === 'enabled') return '';
    return `<div class="rental-connect-warn">Du kan først modtage bookinger, når din opsætning hos Stripe er færdig. <a href="/bliv-udlejer/" onclick="event.preventDefault();navigateTo('/bliv-udlejer')">Færdiggør opsætningen</a></div>`;
  }

  /* ---------- "Mine udlejningscykler" ---------- */
  async function renderRentalMine() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = 'Mine udlejningscykler | Cykelbørsen';
    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="min-height:40vh;display:flex;align-items:center;justify-content:center;color:var(--muted);">Henter…</div>';

    const auth = await _requireDealer(dv);
    if (!auth) return;

    const { data: items } = await supabase
      .from('rental_items')
      .select('id, title, type, daily_rate, is_active, quantity, rental_item_images(url, is_primary)')
      .eq('dealer_id', auth.user.id)
      .order('created_at', { ascending: false });

    const list = (items || []).map(it => {
      const img = (it.rental_item_images || []).find(i => i.is_primary) || (it.rental_item_images || [])[0];
      return `
        <div class="rental-mine-row">
          <div class="rental-mine-thumb">${img ? `<img src="${esc(img.url)}" alt="">` : iconBike(24)}</div>
          <div class="rental-mine-info">
            <div class="rental-mine-title">${esc(it.title)}${it.is_active ? '' : ' <span class="rental-inactive-tag">skjult</span>'}</div>
            <div class="rental-mine-sub">${esc(it.type || '')} · ${(it.daily_rate || 0).toLocaleString('da-DK')} kr./dag · ${it.quantity} stk.</div>
          </div>
          <div class="rental-mine-actions">
            <button onclick="navigateTo('/udlejning/rediger/${it.id}')">Rediger</button>
            <button onclick="toggleRentalActive('${it.id}', ${it.is_active})">${it.is_active ? 'Skjul' : 'Vis'}</button>
          </div>
        </div>`;
    }).join('');

    dv.innerHTML = `
      <div class="rental-manage">
        <button class="sell-back-btn" onclick="navigateTo('/me')">← Tilbage</button>
        ${connectBanner(auth.profile.stripe_account_status)}
        <div class="rental-mine-head">
          <h1>Mine udlejningscykler</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="rental-secondary-btn" onclick="navigateTo('/udlejning/bookinger')">Bookinger</button>
            <button class="rental-secondary-btn" onclick="navigateTo('/udlejning/opret')">Ny udlejningscykel</button>
          </div>
        </div>
        <div class="rental-mine-list">
          ${list || '<p style="color:var(--muted);padding:24px;text-align:center;">Du har endnu ingen udlejningscykler. Opret din første ovenfor.</p>'}
        </div>
      </div>`;
  }

  /* ---------- Opret / rediger ---------- */
  async function renderRentalCreate() { await _renderForm(null); }
  async function renderRentalEdit(id) { await _renderForm(id); }

  async function _renderForm(editId) {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.title = editId ? 'Rediger udlejningscykel' : 'Opret udlejningscykel';
    const dv = document.getElementById('detail-view');
    if (!dv) return;
    dv.innerHTML = '<div style="min-height:40vh;display:flex;align-items:center;justify-content:center;color:var(--muted);">Henter…</div>';

    const auth = await _requireDealer(dv);
    if (!auth) return;

    _files = [];
    _existing = [];
    _editId = editId;
    let it = {};

    if (editId) {
      const { data } = await supabase
        .from('rental_items')
        .select('*, rental_item_images(id, url, is_primary)')
        .eq('id', editId)
        .eq('dealer_id', auth.user.id)
        .single();
      if (!data) { dv.innerHTML = shell('<p>Udlejningscyklen findes ikke.</p>'); return; }
      it = data;
      _existing = (data.rental_item_images || []).map(i => ({ id: i.id, url: i.url, is_primary: i.is_primary, toDelete: false }));
    }

    // En ny udlejningscykel starter med butikkens egen adresse.
    if (!editId) it = { city: auth.profile.city || '', address: auth.profile.address || '' };
    _dealerName = auth.profile.shop_name || auth.profile.name || 'Forhandler';
    _addressConfirmed = it.address || '';
    const v = (x, d = '') => (it[x] != null ? it[x] : d);

    dv.innerHTML = `
      <div class="rental-manage">
        <button class="sell-back-btn" onclick="navigateTo('/udlejning/mine')">← Tilbage</button>
        ${connectBanner(auth.profile.stripe_account_status)}
        <h1 class="rental-form-title">${editId ? 'Rediger udlejningscykel' : 'Ny udlejningscykel'}</h1>
        <div class="rental-form-layout">
        <form class="rental-form" oninput="updateRentalFormPreview()" onchange="updateRentalFormPreview()" onsubmit="event.preventDefault();submitRentalItem();">
          <label>Titel *<input type="text" id="rf-title" required maxlength="100" value="${esc(v('title'))}" placeholder="Fx Trek FX 2 – citybike"></label>
          <label>Type
            <select id="rf-type">
              <option value="">Vælg type</option>
              ${RENTAL_TYPES.map(t => `<option value="${esc(t)}" ${v('type') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </label>
          <label>Beskrivelse<textarea id="rf-desc" rows="4" maxlength="2000" placeholder="Stand, udstyr, størrelse, evt. hjelm inkluderet…">${esc(v('description'))}</textarea></label>

          <div class="rental-form-row">
            <label>Pris pr. dag (kr.) *<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-daily" required min="1" value="${esc(v('daily_rate'))}"></label>
            <label>Pris pr. uge (kr.)<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-weekly" min="0" value="${esc(v('weekly_rate'))}"></label>
          </div>
          <div class="rental-form-row">
            <label>Depositum (kr.)<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-deposit" min="0" value="${v('deposit_amount', 0)}"></label>
            <label>Antal enheder<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-qty" min="1" value="${v('quantity', 1)}"></label>
          </div>
          <div class="rental-form-row">
            <label>Min. dage<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-min" min="${RENTAL_MIN_DAYS}" value="${v('min_days', 1)}"></label>
            <label>Maks. dage<input type="text" inputmode="numeric" pattern="[0-9]*" id="rf-max" min="1" max="${RENTAL_MAX_DAYS}" value="${v('max_days', 14)}"></label>
          </div>
          <div class="rental-form-row">
            <label>Adresse (afhentning)<input type="text" id="rf-address" value="${esc(v('address'))}" placeholder="Begynd at skrive og vælg fra listen"></label>
            <label>By<input type="text" id="rf-city" value="${esc(v('city'))}" placeholder="Udfyldes fra adressen"></label>
          </div>

          <div class="rental-img-section">
            <label class="rental-img-label">Billeder</label>
            <div id="rental-preview-grid" class="rental-thumbs"></div>
            <button type="button" class="rental-add-img" onclick="document.getElementById('rental-file-input').click()">Vælg billeder</button>
            <input type="file" id="rental-file-input" accept="image/*" multiple hidden onchange="selectRentalImages(this)">
          </div>

          <button type="submit" class="rental-onb-btn rental-submit" id="rf-submit">${editId ? 'Gem ændringer' : 'Opret udlejningscykel'}</button>
          ${editId ? `<button type="button" class="rental-delete-btn" onclick="deleteRentalItem('${editId}')">Slet udlejningscykel</button>` : ''}
        </form>
        <aside class="rental-form-preview" aria-label="Forhåndsvisning">
          <p class="rental-preview-label">Sådan ser den ud for kunderne</p>
          <div id="rental-form-preview"></div>
        </aside>
        </div>
      </div>`;

    const addr = document.getElementById('rf-address');
    const city = document.getElementById('rf-city');
    if (attachAddressAutocomplete && addr) {
      attachAddressAutocomplete(addr, (picked) => {
        _addressConfirmed = addr.value;
        if (city && picked.city) city.value = picked.city;
        updateRentalFormPreview();
      });
    }
    if (attachCityAutocomplete && city) attachCityAutocomplete(city);

    renderRentalPreviews();
  }

  /* ---------- Forhåndsvisning (samme kort som /udlejning) ---------- */
  function _formValues() {
    const g = id => document.getElementById(id)?.value ?? '';
    return {
      title: g('rf-title').trim(), type: g('rf-type'), city: g('rf-city').trim(), address: g('rf-address').trim(),
      daily_rate: parseInt(g('rf-daily'), 10) || 0, weekly_rate: parseInt(g('rf-weekly'), 10) || null,
      deposit_amount: parseInt(g('rf-deposit'), 10) || 0,
      min_days: parseInt(g('rf-min'), 10) || 1, max_days: parseInt(g('rf-max'), 10) || 14,
    };
  }

  function _primaryUrl() {
    const ex = _existing.filter(e => !e.toDelete);
    const p = _files.find(f => f.isPrimary) || ex.find(e => e.is_primary) || _files[0] || ex[0];
    return p ? p.url : '';
  }

  function updateRentalFormPreview() {
    const el = document.getElementById('rental-form-preview');
    if (!el) return;
    const it = _formValues();
    el.innerHTML = rentalCardHTML(it, { imgUrl: _primaryUrl(), dealerName: _dealerName, preview: true })
      + rentalTermsHTML(it);
  }

  /* ---------- Billede-håndtering ---------- */
  async function selectRentalImages(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    for (const file of files) {
      /* validateImageFile returnerer en BOOLEAN (true = gyldig) og viser selv
         sin egen toast ved afvisning. Koden her læste returværdien som en
         fejlbesked og sprang derfor over netop de gyldige billeder, mens de
         ugyldige gik videre — MIME- og størrelsestjekket var reelt vendt om. */
      if (validateImageFile && !validateImageFile(file)) continue;
      // Faldt tidligere tilbage til originalfilen hvis komprimeringen
      // fejlede. Det er netop det gennemløb der fjerner EXIF, så en
      // fallback til originalen uploadede GPS-koordinaterne. Nu springes
      // billedet over i stedet.
      let f;
      try {
        f = await compressImage(file);
      } catch (e) {
        console.warn('Kunne ikke behandle billede, springes over:', file.name, e);
        showToast(`"${file.name}" kunne ikke behandles og blev ikke tilføjet`, 'advarsel');
        continue;
      }
      const url = URL.createObjectURL(f);
      _files.push({ file: f, url, isPrimary: false });
    }
    _ensurePrimary();
    renderRentalPreviews();
  }

  function _ensurePrimary() {
    const active = [..._existing.filter(e => !e.toDelete), ..._files];
    if (active.length && !active.some(a => a.is_primary || a.isPrimary)) {
      const first = active[0];
      if ('isPrimary' in first) first.isPrimary = true; else first.is_primary = true;
    }
  }

  function renderRentalPreviews() {
    const grid = document.getElementById('rental-preview-grid');
    if (!grid) return;
    const thumb = (url, primary, kind, i) => `
      <div class="rental-thumb${primary ? ' is-primary' : ''}">
        <img src="${esc(url)}" alt="">
        <div class="rental-thumb-actions">
          ${primary ? '<span class="rental-thumb-primary">Forsidebillede</span>'
                    : `<button type="button" onclick="setRentalPrimary('${kind}',${i})">Brug som forsidebillede</button>`}
          <button type="button" onclick="removeRentalImage('${kind}',${i})">Fjern</button>
        </div>
      </div>`;
    grid.innerHTML = _existing.filter(e => !e.toDelete).map((e, i) => thumb(e.url, e.is_primary, 'ex', i)).join('')
                   + _files.map((f, i) => thumb(f.url, f.isPrimary, 'new', i)).join('');
    updateRentalFormPreview();
  }

  function setRentalPrimary(kind, idx) {
    _existing.forEach(e => e.is_primary = false);
    _files.forEach(f => f.isPrimary = false);
    if (kind === 'ex') { const e = _existing.filter(x => !x.toDelete)[idx]; if (e) e.is_primary = true; }
    else { if (_files[idx]) _files[idx].isPrimary = true; }
    renderRentalPreviews();
  }

  function removeRentalImage(kind, idx) {
    if (kind === 'ex') { const e = _existing.filter(x => !x.toDelete)[idx]; if (e) e.toDelete = true; }
    else { const f = _files[idx]; if (f) { URL.revokeObjectURL(f.url); _files.splice(idx, 1); } }
    _ensurePrimary();
    renderRentalPreviews();
  }

  /* ---------- Upload + submit ---------- */
  async function _uploadFiles(userId) {
    const urls = [];
    for (const item of _files) {
      const ext = (item.file.name.split('.').pop() || 'jpg').toLowerCase();
      // Bruger-id'et skal ligge FØRST i stien, ellers er første mappeled
      // strengen "rental" og storage-politikken kan ikke se hvem der ejer
      // filen. Se harden_bike_images_bucket.sql.
      const filename = `${userId}/rental/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('bike-images')
        .upload(filename, item.file, { contentType: item.file.type, upsert: false, cacheControl: '2592000' });
      if (error) { console.error('Rental upload fejl:', error); continue; }
      const { data: { publicUrl } } = supabase.storage.from('bike-images').getPublicUrl(filename);
      urls.push({ url: publicUrl, is_primary: item.isPrimary });
    }
    return urls;
  }

  async function submitRentalItem() {
    const user = getCurrentUser();
    if (!user) { showToast('Log ind igen'); return; }
    const btn = document.getElementById('rf-submit');
    const get = id => document.getElementById(id);
    const title = get('rf-title')?.value.trim();
    const daily = parseInt(get('rf-daily')?.value, 10);
    if (!title) { showToast('Titel mangler'); return; }
    if (!daily || daily < 1) { showToast('Angiv en dagspris'); return; }
    const addrVal = get('rf-address')?.value.trim() || '';
    if (!addrVal) { showToast('Angiv adressen hvor cyklen hentes'); return; }
    if (addrVal !== _addressConfirmed) { showToast('Vælg adressen fra listen, så kunden kan finde den'); get('rf-address')?.focus(); return; }

    const payload = {
      dealer_id:      user.id,
      title,
      type:           get('rf-type')?.value || null,
      description:    get('rf-desc')?.value.trim() || null,
      daily_rate:     daily,
      weekly_rate:    parseInt(get('rf-weekly')?.value, 10) || null,
      deposit_amount: parseInt(get('rf-deposit')?.value, 10) || 0,
      quantity:       Math.max(1, parseInt(get('rf-qty')?.value, 10) || 1),
      min_days:       Math.max(1, parseInt(get('rf-min')?.value, 10) || 1),
      max_days:       Math.max(1, parseInt(get('rf-max')?.value, 10) || 14),
      city:           get('rf-city')?.value.trim() || null,
      address:        get('rf-address')?.value.trim() || null,
    };

    if (btn) { btn.disabled = true; btn.textContent = 'Gemmer…'; }
    try {
      let itemId = _editId;
      if (_editId) {
        const { error } = await supabase.from('rental_items').update(payload).eq('id', _editId).eq('dealer_id', user.id);
        if (error) throw error;
        // Slet fravalgte eksisterende billeder
        const toDelete = _existing.filter(e => e.toDelete).map(e => e.id);
        if (toDelete.length) await supabase.from('rental_item_images').delete().in('id', toDelete);
        // Opdatér primær-flag på tilbageværende eksisterende
        for (const e of _existing.filter(e => !e.toDelete)) {
          await supabase.from('rental_item_images').update({ is_primary: !!e.is_primary }).eq('id', e.id);
        }
      } else {
        const { data, error } = await supabase.from('rental_items').insert(payload).select('id').single();
        if (error) throw error;
        itemId = data.id;
      }

      // Upload nye billeder
      const uploaded = await _uploadFiles(user.id);
      if (uploaded.length) {
        const rows = uploaded.map(u => ({ item_id: itemId, url: u.url, is_primary: u.is_primary }));
        await supabase.from('rental_item_images').insert(rows);
      }

      showToast(_editId ? 'Ændringer gemt' : 'Udlejningscykel oprettet', 'ok');
      navigateTo('/udlejning/mine');
    } catch (e) {
      console.error('submitRentalItem fejl:', e);
      showToast('Kunne ikke gemme. Prøv igen.');
      if (btn) { btn.disabled = false; btn.textContent = _editId ? 'Gem ændringer' : 'Opret udlejningscykel'; }
    }
  }

  async function toggleRentalActive(id, isActive) {
    const user = getCurrentUser();
    if (!user) return;
    await supabase.from('rental_items').update({ is_active: !isActive }).eq('id', id).eq('dealer_id', user.id);
    renderRentalMine();
  }

  async function deleteRentalItem(id) {
    if (!confirm('Slet denne udlejningscykel permanent?')) return;
    const user = getCurrentUser();
    if (!user) return;
    const { error } = await supabase.from('rental_items').delete().eq('id', id).eq('dealer_id', user.id);
    if (error) { showToast('Kunne ikke slette'); return; }
    showToast('Udlejningscykel slettet');
    navigateTo('/udlejning/mine');
  }

  return {
    renderRentalMine,
    renderRentalCreate,
    renderRentalEdit,
    selectRentalImages,
    setRentalPrimary,
    removeRentalImage,
    submitRentalItem,
    toggleRentalActive,
    deleteRentalItem,
    updateRentalFormPreview,
  };
}
