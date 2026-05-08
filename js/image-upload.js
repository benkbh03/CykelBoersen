/* ============================================================
   BILLEDE UPLOAD + BESKÆRING (Cropper.js)
   ============================================================ */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE_MB   = 10;

export function createImageUpload({
  supabase,
  showToast,
  getEditNewFiles,
  renderSellImagePreviews,
  renderEditNewImages,
}) {
  let selectedFiles = []; // { file, url, isPrimary }

  let _cropperInstance = null;
  let _cropContext     = null; // { mode: 'sell' | 'edit', index, originalUrl }

  // ── Crop ──────────────────────────────────────────────────

  async function openCropModal(mode, index) {
    const list = mode === 'sell' ? selectedFiles : getEditNewFiles();
    const item = list?.[index];
    if (!item || !item.url) { showToast('❌ Kunne ikke åbne beskæring'); return; }

    if (typeof Cropper === 'undefined') {
      try {
        const { ensureCropper } = await import('./asset-loader.js');
        await ensureCropper();
      } catch {
        showToast('❌ Kunne ikke loade Cropper-biblioteket');
        return;
      }
    }

    _cropContext = { mode, index, originalUrl: item.url };

    const modal = document.getElementById('crop-modal');
    const img   = document.getElementById('crop-target');
    img.src = item.url;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    document.querySelectorAll('#crop-modal .crop-ratio-btn').forEach(b => b.classList.remove('active'));
    const def = document.querySelector('#crop-modal .crop-ratio-btn[data-ratio="1.3333"]');
    if (def) def.classList.add('active');

    if (_cropperInstance) { try { _cropperInstance.destroy(); } catch (_) {} _cropperInstance = null; }

    _cropperInstance = new Cropper(img, {
      aspectRatio: 4 / 3,
      viewMode:    1,
      autoCropArea: 1,
      background:  false,
      responsive:  true,
      dragMode:    'move',
      guides:      true,
      movable:     true,
      zoomable:    true,
      rotatable:   false,
      scalable:    false,
    });
  }

  function setCropRatio(ratio, btn) {
    if (!_cropperInstance) return;
    _cropperInstance.setAspectRatio(ratio);
    document.querySelectorAll('#crop-modal .crop-ratio-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  async function applyCrop() {
    if (!_cropperInstance || !_cropContext) return;
    const canvas = _cropperInstance.getCroppedCanvas({
      maxWidth:  2000,
      maxHeight: 2000,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    if (!canvas) { showToast('❌ Kunne ikke beskære billedet'); return; }

    const { mode, index } = _cropContext;
    const list   = mode === 'sell' ? selectedFiles : getEditNewFiles();
    const target = list?.[index];
    if (!target) { closeCropModal(); return; }

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) { showToast('❌ Kunne ikke gemme beskæring'); return; }

    const newName = (target.file?.name || 'billede.jpg').replace(/\.(heic|heif|png|webp|gif)$/i, '.jpg');
    const newFile = new File([blob], newName, { type: 'image/jpeg' });
    const newUrl  = URL.createObjectURL(newFile);

    try { URL.revokeObjectURL(target.url); } catch (_) {}
    target.file = newFile;
    target.url  = newUrl;

    if (mode === 'sell') renderSellImagePreviews();
    else                 renderEditNewImages();

    closeCropModal();
    showToast('✂️ Beskæring gemt');
  }

  function closeCropModal() {
    if (_cropperInstance) { try { _cropperInstance.destroy(); } catch (_) {} _cropperInstance = null; }
    _cropContext = null;
    const modal = document.getElementById('crop-modal');
    if (modal) modal.style.display = 'none';
    const img = document.getElementById('crop-target');
    if (img) img.src = '';
    document.body.style.overflow = '';
  }

  // ── Validering + komprimering ──────────────────────────────

  function validateImageFile(file) {
    const nameLower = (file.name || '').toLowerCase();
    if (file.type === 'image/heic' || file.type === 'image/heif' ||
        nameLower.endsWith('.heic') || nameLower.endsWith('.heif')) {
      showToast('⚠️ HEIC-billeder understøttes ikke. Skift til "Mest kompatibel" under iPhone kamera-indstillinger, eller konvertér til JPG.');
      return false;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast(`⚠️ "${file.name}" er ikke et gyldigt billedformat (kun JPG, PNG, WebP, GIF)`);
      return false;
    }
    if (file.size === 0) {
      showToast(`⚠️ "${file.name}" er tom eller korrupt`);
      return false;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      showToast(`⚠️ "${file.name}" er for stor (maks ${MAX_IMAGE_SIZE_MB} MB)`);
      return false;
    }
    return true;
  }

  // Komprimerer billede til WebP (max 1600px bred, kvalitet ~82%) med Canvas API
  async function compressImage(file) {
    if (file.type === 'image/gif') return file;
    if (file.type === 'image/webp' && file.size < 500 * 1024) return file;

    let objectUrl = null;
    try {
      // createImageBitmap respekterer EXIF-orientering (iPhone portræt-billeder)
      let source;
      if (typeof createImageBitmap === 'function') {
        try {
          source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (e) {
          source = null;
        }
      }

      if (!source) {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const img = new Image();
          const timeout = setTimeout(() => reject(new Error('Billede timeout')), 15000);
          img.onload  = () => { clearTimeout(timeout); resolve(img); };
          img.onerror = () => { clearTimeout(timeout); reject(new Error('Kunne ikke læse billede')); };
          img.src = objectUrl;
        });
      }

      const MAX_W = 1600;
      const MAX_H = 1600;
      let width  = source.width  || source.naturalWidth;
      let height = source.height || source.naturalHeight;
      if (!width || !height) throw new Error('Billede har ingen dimensioner');

      if (width > MAX_W || height > MAX_H) {
        const ratio = Math.min(MAX_W / width, MAX_H / height);
        width  = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas ikke tilgængelig');
      ctx.drawImage(source, 0, 0, width, height);
      if (source.close) source.close();

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob || blob.size === 0) return file;
      if (blob.size >= file.size) return file;

      const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
    } catch (e) {
      console.warn('Billedkomprimering fejlede, bruger original:', e);
      return file;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  // ── selectedFiles management ───────────────────────────────

  async function previewImages(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const remaining = 8 - selectedFiles.length;
    const toAdd = files.filter(validateImageFile).slice(0, remaining);

    const label = document.getElementById('upload-label');
    if (label && toAdd.length > 0) label.textContent = 'Optimerer billeder...';

    const compressed = await Promise.all(toAdd.map(compressImage));

    compressed.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      selectedFiles.push({
        file,
        url,
        isPrimary: selectedFiles.length === 0 && i === 0,
      });
    });

    renderImagePreviews();
    if (label) label.textContent =
      `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`;
  }

  function renderImagePreviews() {
    const grid = document.getElementById('img-preview-grid');
    if (!grid) return;
    grid.innerHTML = selectedFiles.map((item, i) => `
      <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
        <img src="${item.url}" alt="Billede ${i+1}">
        ${item.isPrimary ? '<span class="primary-badge">Primær</span>' : ''}
        ${!item.isPrimary ? `<button class="set-primary" onclick="setPrimary(${i})">★</button>` : ''}
        <button class="remove-img" onclick="removeImage(${i})">✕</button>
      </div>
    `).join('');
  }

  function setPrimary(index) {
    selectedFiles = selectedFiles.map((item, i) => ({ ...item, isPrimary: i === index }));
    renderImagePreviews();
  }

  function removeImage(index) {
    URL.revokeObjectURL(selectedFiles[index].url);
    selectedFiles.splice(index, 1);
    if (selectedFiles.length > 0 && !selectedFiles.some(f => f.isPrimary)) {
      selectedFiles[0].isPrimary = true;
    }
    renderImagePreviews();
    const label = document.getElementById('upload-label');
    if (label) label.textContent = selectedFiles.length > 0
      ? `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`
      : 'Klik for at vælge billeder';
  }

  async function uploadImages(bikeId) {
    if (selectedFiles.length === 0) return;

    let failed = 0;
    for (const item of selectedFiles) {
      const ext      = item.file.name.split('.').pop();
      const filename = `${bikeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from('bike-images')
        .upload(filename, item.file, { contentType: item.file.type, upsert: false, cacheControl: '2592000' });

      if (error) { console.error('Upload fejl:', error); failed++; continue; }

      const { data: { publicUrl } } = supabase.storage
        .from('bike-images')
        .getPublicUrl(filename);

      await supabase.from('bike_images').insert({
        bike_id:    bikeId,
        url:        publicUrl,
        is_primary: item.isPrimary,
      });
    }

    if (failed > 0) showToast(`⚠️ ${failed} billede${failed > 1 ? 'r' : ''} kunne ikke uploades`);

    selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
    selectedFiles = [];
  }

  function resetImageUpload() {
    selectedFiles = [];
    const grid  = document.getElementById('img-preview-grid');
    const label = document.getElementById('upload-label');
    const input = document.getElementById('img-file-input');
    if (grid)  grid.innerHTML = '';
    if (label) label.textContent = 'Klik for at vælge billeder';
    if (input) input.value = '';
  }

  return {
    validateImageFile,
    compressImage,
    previewImages,
    renderImagePreviews,
    setPrimary,
    removeImage,
    uploadImages,
    resetImageUpload,
    openCropModal,
    setCropRatio,
    applyCrop,
    closeCropModal,
    getSelectedFiles: () => selectedFiles,
  };
}
