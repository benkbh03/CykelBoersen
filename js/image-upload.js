/* ============================================================
   BILLEDE UPLOAD + BESKÆRING (Cropper.js)
   ============================================================ */

import { toStrippedBlob, isGif } from './image-strip.js';

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

    if (_cropperInstance) { try { _cropperInstance.destroy(); } catch (_) {} _cropperInstance = null; }

    _cropperInstance = new Cropper(img, {
      aspectRatio: 3 / 2,
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

  /* Højere opløsning og kvalitet end display-versionen, så små detaljer
     som et CUBE-logo overlever til AI'en kan læse dem.

     Havde tidligere en "returnér original hvis under 4 MB"-genvej, hvilket
     dækkede stort set alle telefonbilleder. Resultatet var at originalen
     med GPS intakt blev base64-kodet og sendt til Anthropic ved hvert
     forslag. Genvejen er væk. */
  async function compressForAI(file) {
    if (!file) return file;
    if (isGif(file)) return file;
    const blob = await toStrippedBlob(file, 2000, 'image/jpeg', 0.92);
    return new File([blob], (file.name || 'image') + '.jpg', { type: 'image/jpeg' });
  }

  /* Display-versionen der uploades til Storage.

     Havde tidligere to genveje der returnerede originalfilen med EXIF
     intakt: WebP under 500 KB, og "hvis den komprimerede blev større end
     originalen". Sidstnævnte rammer netop de allerede-optimerede billeder,
     så en lille WebP fra en telefon slap uændret igennem. Vi accepterer nu
     hellere en fil der er nogle kB større end en fil med GPS i. */
  async function compressImage(file) {
    if (isGif(file)) return file;
    const blob = await toStrippedBlob(file, 1200, 'image/webp', 0.78);
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  }

  // Generér en mindre thumbnail (max 800px, WebP ~0.78) til kort-visninger.
  // Returnerer en Blob, eller null hvis det fejler (kalder falder pænt tilbage
  // til fuld-størrelse-billedet). Egress-besparelse: ~3× mindre end fuld.
  async function makeThumbnail(file) {
    if (!file || isGif(file)) return null;
    try {
      return await toStrippedBlob(file, 800, 'image/webp', 0.78);
    } catch (e) {
      // Null er sikkert her: kalderen falder tilbage til fuld-størrelses-
      // billedet, som selv er gået gennem toStrippedBlob.
      console.warn('Thumbnail-generering fejlede, bruger fuld størrelse:', e);
      return null;
    }
  }

  // ── selectedFiles management ───────────────────────────────

  async function previewImages(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const remaining = 8 - selectedFiles.length;
    const toAdd = files.filter(validateImageFile).slice(0, remaining);

    const label = document.getElementById('upload-label');
    const total = toAdd.length;
    let done = 0;
    if (label && total > 0) label.textContent = `Optimerer 0 af ${total}…`;

    // Et billede der ikke kan afkodes, kan ikke få EXIF fjernet, og så
    // springes det over i stedet for at blive uploadet råt. Resten af
    // udvalget går uhindret igennem.
    const processed = (await Promise.all(toAdd.map(async f => {
      try {
        const compressed = await compressImage(f);
        return { compressed, original: f };
      } catch (e) {
        console.warn('Kunne ikke behandle billede, springes over:', f.name, e);
        showToast(`⚠️ "${f.name}" kunne ikke behandles og blev ikke tilføjet`);
        return null;
      } finally {
        done++;
        if (label) label.textContent = `Optimerer ${done} af ${total}…`;
      }
    }))).filter(Boolean);

    processed.forEach(({ compressed, original }, i) => {
      const url = URL.createObjectURL(compressed);
      selectedFiles.push({
        file: compressed,
        originalFile: original,
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

  async function uploadImages(bikeId, onProgress) {
    if (selectedFiles.length === 0) return;

    const total = selectedFiles.length;
    let failed = 0;
    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      if (typeof onProgress === 'function') onProgress(i + 1, total);

      const ext      = item.file.name.split('.').pop();
      const base     = `${bikeId}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filename = `${base}.${ext}`;

      // Generér thumbnail parallelt med fuld-upload (bruger mærker ikke dobbelt-tid)
      const thumbBlobPromise = makeThumbnail(item.file);

      const { error } = await supabase.storage
        .from('bike-images')
        .upload(filename, item.file, { contentType: item.file.type, upsert: false, cacheControl: '2592000' });

      if (error) { console.error('Upload fejl:', error); failed++; continue; }

      const { data: { publicUrl } } = supabase.storage
        .from('bike-images')
        .getPublicUrl(filename);

      // Upload thumbnail (best-effort — fejl her dropper bare thumb, ikke annoncen)
      let thumbUrl = null;
      try {
        const thumbBlob = await thumbBlobPromise;
        if (thumbBlob && thumbBlob.size > 0 && thumbBlob.size < item.file.size) {
          const thumbName = `${base}-thumb.webp`;
          const { error: thumbErr } = await supabase.storage
            .from('bike-images')
            .upload(thumbName, thumbBlob, { contentType: 'image/webp', upsert: false, cacheControl: '2592000' });
          if (!thumbErr) {
            thumbUrl = supabase.storage.from('bike-images').getPublicUrl(thumbName).data.publicUrl;
          }
        }
      } catch (e) { console.warn('Thumb-upload sprang over:', e); }

      await supabase.from('bike_images').insert({
        bike_id:    bikeId,
        url:        publicUrl,
        thumb_url:  thumbUrl,
        is_primary: item.isPrimary,
      });
    }

    if (failed > 0) showToast(`⚠️ ${failed} billede${failed > 1 ? 'r' : ''} kunne ikke uploades`);

    selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
    selectedFiles = [];
  }

  /* Variant til admin-on-behalf-of: uploader til storage men indsætter IKKE
     i bike_images-tabellen. Returnerer array af { url, is_primary } som så
     sendes til admin-create-bike edge function der laver insertet med
     service-role (forhandler ejer bike, admin er ikke owner, så direct
     insert fra admin ville blive blokeret af RLS).
     Storage-path er admin-id-scoped så vi kan spore hvem der uploadede. */
  async function uploadImagesNoInsert(adminUserId, onProgress) {
    if (selectedFiles.length === 0) return [];
    const total = selectedFiles.length;
    const urls = [];
    let failed = 0;
    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      if (typeof onProgress === 'function') onProgress(i + 1, total);

      const ext      = item.file.name.split('.').pop();
      // Admin-id'et først, af samme grund som i rental-create: politikken
      // læser første mappeled som ejeren. Se harden_bike_images_bucket.sql.
      const filename = `${adminUserId}/admin-onbehalf/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from('bike-images')
        .upload(filename, item.file, { contentType: item.file.type, upsert: false, cacheControl: '2592000' });

      if (error) { console.error('Upload fejl:', error); failed++; continue; }

      const { data: { publicUrl } } = supabase.storage
        .from('bike-images')
        .getPublicUrl(filename);

      urls.push({ url: publicUrl, is_primary: item.isPrimary });
    }
    if (failed > 0) showToast(`⚠️ ${failed} billede${failed > 1 ? 'r' : ''} kunne ikke uploades`);
    selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
    selectedFiles = [];
    return urls;
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
    compressForAI,
    previewImages,
    renderImagePreviews,
    setPrimary,
    removeImage,
    uploadImages,
    uploadImagesNoInsert,
    resetImageUpload,
    openCropModal,
    setCropRatio,
    applyCrop,
    closeCropModal,
    getSelectedFiles: () => selectedFiles,
  };
}
