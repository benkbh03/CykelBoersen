/* ============================================================
   BIKE-DETAIL LIGHTBOX — ES module factory
   Selvstændig billede-lightbox med zoom/pan/swipe-gestures.
   Extraheret fra bike-detail.js for at holde det modul under 1500 linjer.

   Bruger window._galleryImages og window._galleryIndex som delt state med
   bike-detail.js's galleri (samme billeder, samme index — lightbox er bare
   en fullscreen-visning af det aktuelle galleri-billede).
   ============================================================ */

export function createBikeDetailLightbox({ galleryGoto }) {
  // Gesture-state — privat for dette modul, ikke delt
  const _lb = {
    scale: 1, tx: 0, ty: 0,
    startDist: 0, startScale: 1,
    startX: 0, startY: 0, startTx: 0, startTy: 0,
    touchMode: null, // 'pan' | 'pinch' | 'swipe' | null
    lastTap: 0,
  };

  function openLightbox(index) {
    const images = window._galleryImages || [];
    if (!images.length) return;
    window._galleryIndex = ((index ?? window._galleryIndex ?? 0) + images.length) % images.length;
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    lightboxShow(window._galleryIndex);
    const hint = document.getElementById('lightbox-hint');
    if (hint) {
      hint.classList.remove('fade');
      setTimeout(() => hint.classList.add('fade'), 2200);
    }
  }

  function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    lightboxResetZoom();
    // Synkroniser galleri-visning med lightbox-index
    galleryGoto(window._galleryIndex || 0);
  }

  function lightboxShow(index) {
    const images = window._galleryImages || [];
    if (!images.length) return;
    window._galleryIndex = (index + images.length) % images.length;
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    if (img) img.src = images[window._galleryIndex];
    if (counter) counter.textContent = `${window._galleryIndex + 1} / ${images.length}`;
    lightboxResetZoom();
  }

  function lightboxNav(dir) {
    lightboxShow((window._galleryIndex || 0) + dir);
  }

  function lightboxResetZoom() {
    _lb.scale = 1; _lb.tx = 0; _lb.ty = 0;
    const img = document.getElementById('lightbox-img');
    if (img) img.style.transform = 'translate(0px, 0px) scale(1)';
  }

  function lightboxApplyTransform() {
    const img = document.getElementById('lightbox-img');
    if (!img) return;
    img.style.transform = `translate(${_lb.tx}px, ${_lb.ty}px) scale(${_lb.scale})`;
  }

  /* Begræns panorering til billedets FAKTISKE kanter.

     Fejlen var at der blev målt på <img>-elementet i stedet for på billedet i
     det. CSS'en giver elementet width/height 100% af scenen plus
     object-fit: contain, så elementet fylder hele skærmen mens selve fotoet
     ligger letterboxet inde i det med sorte bjælker om.

     img.clientWidth var derfor scenens bredde, ikke fotoets. På et
     portrætbillede i et landskabsvindue troede grænsen at billedet var dobbelt
     så bredt som det er, og man kunne trække fotoet helt ud af syne og sidde
     tilbage med sort. Det var derfor zoom føltes i stykker.

     Her regnes den viste størrelse ud efter samme regel som object-fit:
     contain bruger — mindste skaleringsfaktor der får billedet til at passe —
     og grænsen sættes efter den. */
  function lightboxClampPan() {
    const img = document.getElementById('lightbox-img');
    const stage = document.getElementById('lightbox-stage');
    if (!img || !stage) return;
    const rect = stage.getBoundingClientRect();

    const nw = img.naturalWidth, nh = img.naturalHeight;
    // Falder tilbage til elementmålene hvis billedet ikke er indlæst endnu.
    const fit = (nw && nh) ? Math.min(rect.width / nw, rect.height / nh) : 0;
    const baseW = fit ? nw * fit : img.clientWidth;
    const baseH = fit ? nh * fit : img.clientHeight;

    const maxX = Math.max(0, (baseW * _lb.scale - rect.width) / 2);
    const maxY = Math.max(0, (baseH * _lb.scale - rect.height) / 2);
    _lb.tx = Math.max(-maxX, Math.min(maxX, _lb.tx));
    _lb.ty = Math.max(-maxY, Math.min(maxY, _lb.ty));
  }

  function initLightboxGestures() {
    const stage = document.getElementById('lightbox-stage');
    const img = document.getElementById('lightbox-img');
    const overlay = document.getElementById('lightbox-modal');
    if (!stage || !img || !overlay || stage._gesturesAttached) return;
    stage._gesturesAttached = true;

    // Luk på klik på baggrund (ikke på billede/knapper), når ikke zoomet
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === stage) {
        if (_lb.scale === 1) closeLightbox();
      }
    });

    // Dobbelt-klik (desktop) for zoom-toggle
    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (_lb.scale === 1) {
        const rect = stage.getBoundingClientRect();
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        _lb.scale = 2.5;
        _lb.tx = clickX * (1 - 2.5);
        _lb.ty = clickY * (1 - 2.5);
        lightboxClampPan();
      } else {
        lightboxResetZoom();
        return;
      }
      img.classList.add('dragging');
      lightboxApplyTransform();
      setTimeout(() => img.classList.remove('dragging'), 200);
    });

    /* Mus-hjul til zoom mod cursor-position.

       To ting gjorde zoomen langsom:

       1. CSS'en har transition: transform 0.18s på billedet. Den er god ved
          dobbeltklik, men under hjulzoom starter hvert eneste hjul-tik en ny
          180 ms-animation, så billedet altid haler efter fingeren. Derfor
          slås den fra mens hjulet drejer og sættes til igen bagefter.

       2. deltaY blev brugt råt. Chrome rapporterer i PIXELS (ca. 100 pr. tik),
          Firefox i LINJER (ca. 3 pr. tik). Den gamle udregning gav derfor
          omkring 20 % zoom pr. tik i Chrome og under 1 % i Firefox — samme
          kode, helt forskellig oplevelse. deltaMode omregnes nu til pixels.

       Zoomen er også gjort multiplikativ (exp) frem for additiv. Additiv
       zoom føles langsom når man er zoomet ind, fordi det samme tillæg fylder
       relativt mindre jo større billedet er. */
    let wheelIdle = null;
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();

      img.classList.add('dragging');            // slå transition fra
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => img.classList.remove('dragging'), 140);

      const unit = e.deltaMode === 1 ? 16            // linjer -> px
                 : e.deltaMode === 2 ? stage.clientHeight   // sider -> px
                 : 1;                                       // allerede px
      const oldScale = _lb.scale;
      const newScale = Math.max(1, Math.min(5, oldScale * Math.exp(-e.deltaY * unit * 0.002)));
      if (newScale === oldScale) return;
      const rect = stage.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;
      const factor = newScale / oldScale;
      _lb.tx = cursorX - factor * (cursorX - _lb.tx);
      _lb.ty = cursorY - factor * (cursorY - _lb.ty);
      _lb.scale = newScale;
      if (_lb.scale === 1) { _lb.tx = 0; _lb.ty = 0; }
      else lightboxClampPan();
      lightboxApplyTransform();
    }, { passive: false });

    // Mus-pan når zoomet
    let mouseDown = false;
    stage.addEventListener('mousedown', (e) => {
      if (_lb.scale <= 1) return;
      mouseDown = true;
      _lb.startX = e.clientX; _lb.startY = e.clientY;
      _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
      img.classList.add('dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      _lb.tx = _lb.startTx + (e.clientX - _lb.startX);
      _lb.ty = _lb.startTy + (e.clientY - _lb.startY);
      lightboxClampPan();
      lightboxApplyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      img.classList.remove('dragging');
    });

    // Touch: pinch + pan + swipe + double-tap
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        _lb.touchMode = 'pinch';
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _lb.startDist = Math.hypot(dx, dy);
        _lb.startScale = _lb.scale;
        img.classList.add('dragging');
      } else if (e.touches.length === 1) {
        _lb.startX = e.touches[0].clientX;
        _lb.startY = e.touches[0].clientY;
        _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
        _lb.touchMode = _lb.scale > 1 ? 'pan' : 'swipe';
        // Double-tap detektion
        const now = Date.now();
        if (now - _lb.lastTap < 280) {
          if (_lb.scale === 1) { _lb.scale = 2.5; _lb.tx = 0; _lb.ty = 0; }
          else lightboxResetZoom();
          img.classList.add('dragging');
          lightboxApplyTransform();
          setTimeout(() => img.classList.remove('dragging'), 200);
          _lb.touchMode = null;
        }
        _lb.lastTap = now;
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (_lb.touchMode === 'pinch' && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / (_lb.startDist || 1);
        _lb.scale = Math.max(1, Math.min(5, _lb.startScale * ratio));
        if (_lb.scale === 1) { _lb.tx = 0; _lb.ty = 0; }
        else lightboxClampPan();
        lightboxApplyTransform();
        e.preventDefault();
      } else if (_lb.touchMode === 'pan' && e.touches.length === 1) {
        _lb.tx = _lb.startTx + (e.touches[0].clientX - _lb.startX);
        _lb.ty = _lb.startTy + (e.touches[0].clientY - _lb.startY);
        lightboxClampPan();
        lightboxApplyTransform();
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('touchend', (e) => {
      if (_lb.touchMode === 'swipe' && e.changedTouches.length === 1) {
        const diffX = _lb.startX - e.changedTouches[0].clientX;
        const diffY = _lb.startY - e.changedTouches[0].clientY;
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
          lightboxNav(diffX > 0 ? 1 : -1);
        } else if (diffY < -80 && Math.abs(diffY) > Math.abs(diffX)) {
          // Træk ned → luk
          closeLightbox();
        }
      }
      img.classList.remove('dragging');
      _lb.touchMode = null;
    }, { passive: true });

    // Klik på billedet lukker hvis ikke zoomet
    img.addEventListener('click', (e) => {
      if (_lb.scale === 1) {
        e.stopPropagation();
      }
    });
  }

  return {
    openLightbox,
    closeLightbox,
    lightboxShow,
    lightboxNav,
    lightboxResetZoom,
    initLightboxGestures,
  };
}
