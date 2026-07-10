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
  BASE_URL,
}) {

  // Lokal upload-state: [{ file, url, isPrimary }] (nye) + [{ id, url, is_primary, toDelete }] (eksisterende ved edit)
  let _files = [];
  let _existing = [];
  let _editId = null;

  /* ---------- Guard: kun forhandlere ---------- */
  async function _requireDealer(dv) {
    const user = getCurrentUser();
    if (!user) {
      dv.innerHTML = shell('<p>Log ind som forhandler for at administrere udlejning.</p><button class="rental-onb-btn" onclick="openLoginModal()">Log ind</button>');
      return null;
    }
    const { data: p } = await supabase
      .from('profiles')
      .select('seller_type, stripe_account_status')
      .eq('id', user.id)
      .single();
    if (!p || p.seller_type !== 'dealer') {
      dv.innerHTML = shell('<p>Udlejning er kun for forhandlere.</p><button class="rental-onb-btn" onclick="navigateTo(\'/bliv-forhandler\')">Bliv forhandler</button>');
      return null;
    }
    return { user, profile: p };
  }

  function shell(inner) {
    return `<div class="rental-manage"><button class="sell-back-btn" onclick="navigateTo('/udlejning/mine')">← Mine udlejningscykler</button><div class="rental-onb-card" style="text-align:center;">${inner}</div></div>`;
  }

  function connectBanner(status) {
    if (status === 'enabled') return '';
    return `<div class="rental-connect-warn">⚠️ Færdiggør din udlejnings-opsætning hos Stripe for at kunne modtage bookinger. <a href="/bliv-udlejer" onclick="event.preventDefault();navigateTo('/bliv-udlejer')">Færdiggør nu →</a></div>`;
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
          <div class="rental-mine-thumb">${img ? `<img src="${esc(img.url)}" alt="">` : '🚲'}</div>
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
        <button class="sell-back-btn" onclick="navigateTo('/me')">← Min profil</button>
        ${connectBanner(auth.profile.stripe_account_status)}
        <div class="rental-mine-head">
          <h1>Mine udlejningscykler</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="rental-onb-btn" onclick="navigateTo('/udlejning/bookinger')" style="background:var(--forest,#2a3d2e);">Bookinger</button>
            <button class="rental-onb-btn" onclick="navigateTo('/udlejning/opret')">+ Ny udlejningscykel</button>
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

    const v = (x, d = '') => (it[x] != null ? it[x] : d);

    dv.innerHTML = `
      <div class="rental-manage">
        <button class="sell-back-btn" onclick="navigateTo('/udlejning/mine')">← Mine udlejningscykler</button>
        ${connectBanner(auth.profile.stripe_account_status)}
        <h1 class="rental-form-title">${editId ? 'Rediger udlejningscykel' : 'Ny udlejningscykel'}</h1>
        <form class="rental-form" onsubmit="event.preventDefault();submitRentalItem();">
          <label>Titel *<input type="text" id="rf-title" required maxlength="100" value="${esc(v('title'))}" placeholder="Fx Trek FX 2 – citybike"></label>
          <label>Type
            <select id="rf-type">
              <option value="">Vælg type</option>
              ${RENTAL_TYPES.map(t => `<option value="${esc(t)}" ${v('type') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </label>
          <label>Beskrivelse<textarea id="rf-desc" rows="4" maxlength="2000" placeholder="Stand, udstyr, størrelse, evt. hjelm inkluderet…">${esc(v('description'))}</textarea></label>

          <div class="rental-form-row">
            <label>Pris pr. dag (kr.) *<input type="number" id="rf-daily" required min="1" value="${esc(v('daily_rate'))}"></label>
            <label>Pris pr. uge (kr.)<input type="number" id="rf-weekly" min="0" value="${esc(v('weekly_rate'))}"></label>
          </div>
          <div class="rental-form-row">
            <label>Depositum (kr.)<input type="number" id="rf-deposit" min="0" value="${v('deposit_amount', 0)}"></label>
            <label>Antal enheder<input type="number" id="rf-qty" min="1" value="${v('quantity', 1)}"></label>
          </div>
          <div class="rental-form-row">
            <label>Min. dage<input type="number" id="rf-min" min="${RENTAL_MIN_DAYS}" value="${v('min_days', 1)}"></label>
            <label>Maks. dage<input type="number" id="rf-max" min="1" max="${RENTAL_MAX_DAYS}" value="${v('max_days', 14)}"></label>
          </div>
          <div class="rental-form-row">
            <label>By<input type="text" id="rf-city" value="${esc(v('city'))}" placeholder="Fx København"></label>
            <label>Adresse (afhentning)<input type="text" id="rf-address" value="${esc(v('address'))}" placeholder="Fx Nørrebrogade 1"></label>
          </div>

          <div class="rental-img-section">
            <label class="rental-img-label">Billeder</label>
            <div class="img-upload" onclick="document.getElementById('rental-file-input').click()">
              <p>Klik for at vælge billeder</p>
            </div>
            <input type="file" id="rental-file-input" accept="image/*" multiple style="display:none" onchange="selectRentalImages(this)">
            <div id="rental-preview-grid" class="img-preview-grid"></div>
          </div>

          <button type="submit" class="rental-onb-btn" id="rf-submit" style="margin-top:16px;">${editId ? 'Gem ændringer' : 'Opret udlejningscykel'}</button>
          ${editId ? `<button type="button" class="rental-delete-btn" onclick="deleteRentalItem('${editId}')">Slet udlejningscykel</button>` : ''}
        </form>
      </div>`;

    renderRentalPreviews();
  }

  /* ---------- Billede-håndtering ---------- */
  async function selectRentalImages(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    for (const file of files) {
      const err = validateImageFile ? validateImageFile(file) : null;
      if (err) { showToast(err); continue; }
      let f = file;
      try { f = await compressImage(file); } catch { /* brug original hvis komprimering fejler */ }
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
    const ex = _existing.filter(e => !e.toDelete).map((e, i) =>
      `<div class="img-preview ${e.is_primary ? 'is-primary' : ''}">
        <img src="${esc(e.url)}" alt="">
        <button type="button" class="img-primary-btn" onclick="setRentalPrimary('ex',${i})">${e.is_primary ? '★ Primær' : 'Sæt primær'}</button>
        <button type="button" class="img-remove-btn" onclick="removeRentalImage('ex',${i})">✕</button>
      </div>`).join('');
    const nw = _files.map((f, i) =>
      `<div class="img-preview ${f.isPrimary ? 'is-primary' : ''}">
        <img src="${esc(f.url)}" alt="">
        <button type="button" class="img-primary-btn" onclick="setRentalPrimary('new',${i})">${f.isPrimary ? '★ Primær' : 'Sæt primær'}</button>
        <button type="button" class="img-remove-btn" onclick="removeRentalImage('new',${i})">✕</button>
      </div>`).join('');
    grid.innerHTML = ex + nw;
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
      const filename = `rental/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
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

      showToast(_editId ? '✅ Ændringer gemt' : '✅ Udlejningscykel oprettet');
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
  };
}
