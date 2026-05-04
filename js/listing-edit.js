/* ============================================================
   REDIGER ANNONCE
   ============================================================ */

const normalizeImageId = (id) => String(id ?? '').trim();

export function createListingEdit({
  supabase,
  showToast,
  bikeCache,
  validateImageFile,
  compressImage,
  openCropModal,
  getCurrentUser,
  getCurrentProfile,
  loadBikes,
  updateFilterCounts,
  reloadMyListings,
  openBikeModal,
  renderBikePage,
  renderUserProfilePage,
  renderDealerProfilePage,
  attachCityAutocomplete,
}) {
  let editNewFiles     = [];  // { file, url, isPrimary }
  let editExistingImgs = [];  // { id, url, is_primary, toDelete }

  // ── State accessors ────────────────────────────────────────

  function getEditNewFiles()     { return editNewFiles; }
  function getEditExistingImgs() { return editExistingImgs; }

  // ── Primary enforcement ────────────────────────────────────

  function enforceSinglePrimaryImage() {
    const existingPrimaries = editExistingImgs.filter(img => !img.toDelete && img.is_primary);
    const newPrimaries      = editNewFiles.filter(f => f.isPrimary);
    const total = existingPrimaries.length + newPrimaries.length;
    if (total > 1) {
      let keptOne = false;
      editExistingImgs = editExistingImgs.map(img => {
        if (!img.toDelete && img.is_primary && !keptOne) { keptOne = true; return img; }
        return img.is_primary ? { ...img, is_primary: false } : img;
      });
      editNewFiles = editNewFiles.map(f => {
        if (f.isPrimary && !keptOne) { keptOne = true; return f; }
        return f.isPrimary ? { ...f, isPrimary: false } : f;
      });
    } else if (total === 0) {
      const firstExisting = editExistingImgs.find(img => !img.toDelete);
      if (firstExisting) {
        const firstId = normalizeImageId(firstExisting.id);
        editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: !img.toDelete && normalizeImageId(img.id) === firstId }));
      } else if (editNewFiles.length > 0) {
        editNewFiles = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === 0 }));
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────

  function renderEditExistingImages() {
    const grid = document.getElementById('edit-img-existing-grid');
    if (!grid) return;
    const visible = editExistingImgs.filter(img => !img.toDelete);
    grid.innerHTML = visible.map(img => {
      const idArg = JSON.stringify(String(img.id));
      return `
      <div class="img-preview-item ${img.is_primary ? 'primary' : ''}">
        <img src="${img.url}" alt="Billede">
        ${img.is_primary
          ? '<span class="primary-badge">Primær</span>'
          : `<button type="button" class="set-primary" onclick='editSetExistingPrimary(${idArg})'>★</button>`}
        <button type="button" class="remove-img" onclick='editRemoveExisting(${idArg})'>✕</button>
      </div>`;
    }).join('') || '';
  }

  function renderEditNewImages() {
    const grid = document.getElementById('edit-img-new-grid');
    if (!grid) return;
    grid.innerHTML = editNewFiles.map((item, i) => `
      <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
        <img src="${item.url}" alt="Nyt billede">
        ${item.isPrimary
          ? '<span class="primary-badge">Primær</span>'
          : `<button type="button" class="set-primary" onclick="editSetNewPrimary(${i})">★</button>`}
        <button type="button" class="crop-img" title="Beskær billede" onclick="openCropModal('edit', ${i})">✂️</button>
        <button type="button" class="remove-img" onclick="editRemoveNew(${i})">✕</button>
      </div>`).join('');
    const label = document.getElementById('edit-upload-label');
    if (label) label.textContent = editNewFiles.length > 0
      ? `${editNewFiles.length} nye billede${editNewFiles.length !== 1 ? 'r' : ''} klar til upload`
      : 'Klik for at tilføje billeder';
  }

  // ── Image actions ──────────────────────────────────────────

  function editSetExistingPrimary(imgId) {
    const normalizedId = normalizeImageId(imgId);
    const target = editExistingImgs.find(img => normalizeImageId(img.id) === normalizedId);
    if (!target || target.toDelete) return;
    editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: !img.toDelete && normalizeImageId(img.id) === normalizedId }));
    editNewFiles     = editNewFiles.map(f => ({ ...f, isPrimary: false }));
    renderEditExistingImages();
    renderEditNewImages();
  }

  function editRemoveExisting(imgId) {
    const normalizedId = normalizeImageId(imgId);
    const target = editExistingImgs.find(img => normalizeImageId(img.id) === normalizedId);
    if (!target || target.toDelete) return;
    const wasPrimary = target.is_primary;
    editExistingImgs = editExistingImgs.map(img => normalizeImageId(img.id) === normalizedId ? { ...img, toDelete: true, is_primary: false } : img);
    if (wasPrimary) {
      const firstRemaining = editExistingImgs.find(img => !img.toDelete);
      if (firstRemaining) {
        const firstRemainingId = normalizeImageId(firstRemaining.id);
        editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: !img.toDelete && normalizeImageId(img.id) === firstRemainingId }));
      } else if (editNewFiles.length > 0) {
        editNewFiles = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === 0 }));
      }
    }
    renderEditExistingImages();
    renderEditNewImages();
  }

  async function editPreviewImages(input) {
    const files = Array.from(input.files);
    const remaining = 8 - editExistingImgs.filter(img => !img.toDelete).length - editNewFiles.length;
    const toAdd = files.filter(validateImageFile).slice(0, remaining);

    const label = document.getElementById('edit-upload-label');
    if (label && toAdd.length > 0) label.textContent = 'Optimerer billeder...';

    const compressed = await Promise.all(toAdd.map(compressImage));

    compressed.forEach((file, i) => {
      const hasPrimary = editExistingImgs.some(img => !img.toDelete && img.is_primary) || editNewFiles.some(f => f.isPrimary);
      editNewFiles.push({ file, url: URL.createObjectURL(file), isPrimary: !hasPrimary && i === 0 });
    });
    renderEditNewImages();
  }

  function editSetNewPrimary(index) {
    editExistingImgs = editExistingImgs.map(img => ({ ...img, is_primary: false }));
    editNewFiles     = editNewFiles.map((f, i) => ({ ...f, isPrimary: i === index }));
    renderEditExistingImages();
    renderEditNewImages();
  }

  function editRemoveNew(index) {
    URL.revokeObjectURL(editNewFiles[index].url);
    const wasPrimary = editNewFiles[index].isPrimary;
    editNewFiles.splice(index, 1);
    if (wasPrimary && editNewFiles.length > 0) editNewFiles[0].isPrimary = true;
    renderEditNewImages();
  }

  // ── Modal open/close ───────────────────────────────────────

  async function openEditModal(id) {
    const editModal = document.getElementById('edit-modal');
    const $e = (fieldId) => editModal?.querySelector(`#${fieldId}`) || document.getElementById(fieldId);

    const { data: b, error } = await supabase
      .from('bikes')
      .select('*, bike_images(id, url, is_primary)')
      .eq('id', id).single();
    if (error || !b) { showToast('❌ Kunne ikke hente annonce'); return; }

    document.getElementById('edit-bike-id').value       = b.id;
    document.getElementById('edit-brand').value         = b.brand || '';
    document.getElementById('edit-model').value         = b.model || '';
    document.getElementById('edit-price').value         = b.price || '';
    document.getElementById('edit-year').value          = b.year || '';
    $e('edit-city').value                               = b.city || '';
    document.getElementById('edit-color').value         = b.color || '';
    document.getElementById('edit-description').value   = b.description || '';
    document.getElementById('edit-type').value          = b.type || '';
    document.getElementById('edit-size').value          = b.size || '';
    document.getElementById('edit-condition').value     = b.condition || '';
    document.getElementById('edit-is-active').checked   = b.is_active;

    const warrantyGroup = document.getElementById('edit-warranty-group');
    if (warrantyGroup) warrantyGroup.style.display = getCurrentProfile()?.seller_type === 'dealer' ? '' : 'none';
    document.getElementById('edit-warranty').value = b.warranty || '';

    editNewFiles     = [];
    editExistingImgs = (b.bike_images || []).map(img => ({
      ...img,
      id: normalizeImageId(img.id),
      toDelete: false,
    }));
    enforceSinglePrimaryImage();
    renderEditExistingImages();
    renderEditNewImages();

    const editCityInput = $e('edit-city');
    if (editCityInput) attachCityAutocomplete(editCityInput);

    document.getElementById('edit-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeEditModal() {
    editNewFiles.forEach(f => URL.revokeObjectURL(f.url));
    editNewFiles     = [];
    editExistingImgs = [];
    document.getElementById('edit-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Save ───────────────────────────────────────────────────

  async function saveEditedListing() {
    const id = document.getElementById('edit-bike-id').value;
    enforceSinglePrimaryImage();

    const updates = {
      brand:       document.getElementById('edit-brand').value,
      model:       document.getElementById('edit-model').value,
      title:       document.getElementById('edit-brand').value + ' ' + document.getElementById('edit-model').value,
      price:       parseInt(document.getElementById('edit-price').value),
      year:        parseInt(document.getElementById('edit-year').value) || null,
      city:        document.getElementById('edit-city').value,
      color:       document.getElementById('edit-color').value.trim() || null,
      description: document.getElementById('edit-description').value,
      type:        document.getElementById('edit-type').value,
      size:        document.getElementById('edit-size').value,
      condition:   document.getElementById('edit-condition').value,
      is_active:   document.getElementById('edit-is-active').checked,
      warranty:    (getCurrentProfile()?.seller_type === 'dealer' ? document.getElementById('edit-warranty').value.trim() : null) || null,
    };

    if (!updates.brand || !updates.model || !updates.price || !updates.city) {
      showToast('⚠️ Udfyld alle påkrævede felter'); return;
    }

    const { error } = await supabase.from('bikes').update(updates).eq('id', id);
    if (error) { showToast('❌ Kunne ikke gemme ændringer'); console.error(error); return; }

    const toDelete = editExistingImgs.filter(img => img.toDelete);
    const toKeep   = editExistingImgs.filter(img => !img.toDelete);
    for (const img of toDelete) {
      const { error: delErr } = await supabase.from('bike_images').delete().eq('id', img.id).eq('bike_id', id);
      if (delErr) { showToast('❌ Kunne ikke slette et eksisterende billede'); console.error(delErr); return; }
      if (!delErr && img.url) {
        const match = img.url.match(/bike-images\/(.+)$/);
        if (match) await supabase.storage.from('bike-images').remove([match[1]]);
      }
    }

    for (const img of toKeep) {
      const { error: updErr } = await supabase.from('bike_images').update({ is_primary: false }).eq('id', img.id).eq('bike_id', id);
      if (updErr) { showToast('❌ Kunne ikke opdatere primærbillede'); console.error(updErr); return; }
    }

    let insertedPrimaryId = null;
    for (const item of editNewFiles) {
      const ext      = item.file.name.split('.').pop();
      const filename = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('bike-images').upload(filename, item.file, { contentType: item.file.type });
      if (uploadErr) { showToast('❌ Kunne ikke uploade et billede'); console.error(uploadErr); return; }
      const { data: { publicUrl } } = supabase.storage.from('bike-images').getPublicUrl(filename);
      const { data: insertedRow, error: insertErr } = await supabase
        .from('bike_images')
        .insert({ bike_id: id, url: publicUrl, is_primary: item.isPrimary })
        .select('id')
        .single();
      if (insertErr) { showToast('❌ Kunne ikke gemme uploadet billede'); console.error(insertErr); return; }
      if (item.isPrimary) insertedPrimaryId = insertedRow?.id || null;
    }

    const intendedPrimaryExisting = toKeep.find(img => img.is_primary)?.id || null;
    const intendedPrimaryId = insertedPrimaryId || intendedPrimaryExisting;

    const { error: resetPrimaryErr } = await supabase.from('bike_images').update({ is_primary: false }).eq('bike_id', id);
    if (resetPrimaryErr) { showToast('❌ Kunne ikke nulstille primærbillede'); console.error(resetPrimaryErr); return; }

    if (intendedPrimaryId) {
      const { error: setPrimaryErr } = await supabase.from('bike_images').update({ is_primary: true }).eq('id', intendedPrimaryId).eq('bike_id', id);
      if (setPrimaryErr) { showToast('❌ Kunne ikke gemme valgt primærbillede'); console.error(setPrimaryErr); return; }
    } else {
      const { data: firstImg } = await supabase.from('bike_images').select('id').eq('bike_id', id).limit(1).single();
      if (firstImg) await supabase.from('bike_images').update({ is_primary: true }).eq('id', firstImg.id).eq('bike_id', id);
    }

    bikeCache.delete(id);
    bikeCache.delete(Number(id));

    closeEditModal();
    showToast('✅ Annonce opdateret!');
    reloadMyListings();
    loadBikes();
    updateFilterCounts();

    const currentPath   = window.location.pathname;
    const bikeModalOpen = document.getElementById('bike-modal')?.classList.contains('open');
    const profileMatch  = currentPath.match(/^\/profile\/([^/]+)$/);
    const dealerMatch   = currentPath.match(/^\/dealer\/([^/]+)$/);
    const onBikePage    = currentPath === `/bike/${id}`;

    if (onBikePage) renderBikePage(id);
    if (bikeModalOpen) openBikeModal(id);
    if (profileMatch && profileMatch[1] === getCurrentUser()?.id) renderUserProfilePage(profileMatch[1]);
    if (dealerMatch  && dealerMatch[1]  === getCurrentUser()?.id) renderDealerProfilePage(dealerMatch[1]);
  }

  return {
    getEditNewFiles,
    getEditExistingImgs,
    openEditModal,
    closeEditModal,
    renderEditExistingImages,
    renderEditNewImages,
    editSetExistingPrimary,
    editRemoveExisting,
    editPreviewImages,
    editSetNewPrimary,
    editRemoveNew,
    saveEditedListing,
  };
}
