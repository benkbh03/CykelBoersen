/* ============================================================
   BIKE-DETAIL LIGHTBOX — ES module factory
   Selvstændig billede-lightbox med zoom/pan/swipe-gestures.
   Extraheret fra bike-detail.js for at holde det modul under 1500 linjer.

   Bruger window._galleryImages og window._galleryIndex som delt state med
   bike-detail.js's galleri (samme billeder, samme index — lightbox er bare
   en fullscreen-visning af det aktuelle galleri-billede).

   v2 (10. nov.): knib-zoom følger fingrene 1:1 som i en fotoapp. Filen har
   nyt navn fordi bike-detail.js importerer den statisk (uden ?v=), så en
   rettelse i den gamle fil ville ligge i besøgendes cache i timevis. Den
   gamle bike-detail-lightbox.js kan slettes efter et par uger.
   ============================================================ */

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function createBikeDetailLightbox({ galleryGoto }) {
  // Gesture-state — privat for dette modul, ikke delt
  const _lb = {
    scale: 1, tx: 0, ty: 0,
    startDist: 0, startScale: 1,
    startMidX: 0, startMidY: 0,
    startX: 0, startY: 0, startTx: 0, startTy: 0,
    touchMode: null, // 'pan' | 'pinch' | 'swipe' | null
    multiTouch: false, // har denne berøring haft to fingre? (så er det ikke et tryk)
    tapStart: 0,
    lastTapEnd: 0, lastTapX: 0, lastTapY: 0,
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
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      hint.textContent = touch
        ? 'Knib med to fingre for at zoome'
        : 'Knib på pegefeltet eller rul for at zoome';
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
    // Telefoner sender også dblclick efter et dobbelt-tryk. Det er allerede
    // håndteret i touchend, så det ville ellers zoome ind og straks ud igen.
    let lastTouchAt = 0;
    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (Date.now() - lastTouchAt < 1000) return;
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
      // Knib på pegefeltet kommer som hjul-hændelser med ctrlKey. Chrome og
      // Edge sætter deltaY = -100 · ln(skala), så 0,01 giver præcis 1:1 med
      // fingrene. Med 0,002 (musehjulets fart) gik knib fem gange for langsomt.
      const speed = e.ctrlKey ? 0.01 : 0.002;
      const oldScale = _lb.scale;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * Math.exp(-e.deltaY * unit * speed)));
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

    /* Safari på Mac sender knib som gesture-hændelser, ikke som ctrl+hjul.
       På iPhone kommer de OGSÅ sammen med touch-hændelserne, så de ignoreres
       når en berøring allerede styrer zoomen. */
    let gStartScale = 1, gLastX = 0, gLastY = 0;
    stage.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      if (_lb.touchMode) return;
      gStartScale = _lb.scale;
      img.classList.add('dragging');
    });
    stage.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (_lb.touchMode) return;
      const rect = stage.getBoundingClientRect();
      gLastX = (e.clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
      gLastY = (e.clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
      const oldScale = _lb.scale;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, gStartScale * e.scale));
      const f = newScale / oldScale;
      _lb.tx = gLastX - f * (gLastX - _lb.tx);
      _lb.ty = gLastY - f * (gLastY - _lb.ty);
      _lb.scale = newScale;
      if (_lb.scale === 1) { _lb.tx = 0; _lb.ty = 0; } else lightboxClampPan();
      lightboxApplyTransform();
    });
    stage.addEventListener('gestureend', (e) => {
      e.preventDefault();
      if (_lb.touchMode) return;
      img.classList.remove('dragging');
    });

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

    /* Touch: knib + træk + swipe.

       Den gamle knib-zoom skalerede om billedets midte og så bort fra hvor
       fingrene var, så billedet gled væk under dem, og man kunne ikke flytte
       billedet mens man knibede. Nu holdes punktet under fingrene fast:
       det sted på fotoet man knibede om, følger fingrenes midtpunkt, præcis
       som i Fotos-appen. Løfter man én finger, fortsætter den anden med at
       trække uden hop; sætter man en finger mere ned, går den over i knib.

       Dobbelt-tryk virker stadig, men tæller kun rigtige tryk (kort, uden
       bevægelse, én finger). Før kunne to hurtige knib i træk blive læst som
       et dobbelt-tryk og nulstille zoomen midt i bevægelsen. */
    const stageCenter = () => {
      const r = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    function beginPinch(touches) {
      const c = stageCenter();
      _lb.touchMode = 'pinch';
      _lb.multiTouch = true;
      _lb.startDist = Math.hypot(touches[0].clientX - touches[1].clientX,
                                 touches[0].clientY - touches[1].clientY) || 1;
      _lb.startScale = _lb.scale;
      _lb.startMidX = (touches[0].clientX + touches[1].clientX) / 2 - c.x;
      _lb.startMidY = (touches[0].clientY + touches[1].clientY) / 2 - c.y;
      _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
      img.classList.add('dragging');
    }

    function beginOneFinger(t) {
      _lb.startX = t.clientX; _lb.startY = t.clientY;
      _lb.startTx = _lb.tx; _lb.startTy = _lb.ty;
      _lb.touchMode = _lb.scale > 1 ? 'pan' : 'swipe';
      img.classList.add('dragging');
    }

    stage.addEventListener('touchstart', (e) => {
      lastTouchAt = Date.now();
      if (e.touches.length >= 2) {
        beginPinch(e.touches);
      } else if (e.touches.length === 1) {
        _lb.multiTouch = false;
        _lb.tapStart = Date.now();
        beginOneFinger(e.touches[0]);
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (_lb.touchMode === 'pinch' && e.touches.length >= 2) {
        const c = stageCenter();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                e.touches[0].clientY - e.touches[1].clientY);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - c.x;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - c.y;
        // Lidt under 1 er tilladt mens fingrene er nede (fjedrer tilbage ved slip).
        const scale = Math.max(MIN_SCALE * 0.8, Math.min(MAX_SCALE, _lb.startScale * dist / _lb.startDist));
        const k = scale / _lb.startScale;
        _lb.scale = scale;
        _lb.tx = midX - k * (_lb.startMidX - _lb.startTx);
        _lb.ty = midY - k * (_lb.startMidY - _lb.startTy);
        if (_lb.scale > 1) lightboxClampPan();
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

    function settleZoom() {
      // Under 1: fjedr tilbage med animation. Tæt på 1: nulstil helt.
      if (_lb.scale < 1.03) {
        img.classList.remove('dragging');
        lightboxResetZoom();
      } else {
        lightboxClampPan();
        lightboxApplyTransform();
      }
    }

    function onTouchEnd(e) {
      // Én finger løftet under knib: den anden fortsætter som træk.
      if (e.touches.length === 1 && _lb.touchMode === 'pinch') {
        if (_lb.scale < 1.03) settleZoom();
        beginOneFinger(e.touches[0]);
        _lb.touchMode = _lb.scale > 1 ? 'pan' : null; // ingen swipe lige efter knib
        return;
      }
      if (e.touches.length > 0) return;

      const t = e.changedTouches[0];
      if (_lb.touchMode === 'pinch') {
        settleZoom();
      } else if (_lb.touchMode === 'swipe' && t) {
        const diffX = _lb.startX - t.clientX;
        const diffY = _lb.startY - t.clientY;
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
          lightboxNav(diffX > 0 ? 1 : -1);
        } else if (diffY < -80 && Math.abs(diffY) > Math.abs(diffX)) {
          closeLightbox(); // træk ned → luk
        }
      }

      // Dobbelt-tryk: kun rigtige tryk tæller.
      if (t && !_lb.multiTouch) {
        const now = Date.now();
        const moved = Math.hypot(t.clientX - _lb.startX, t.clientY - _lb.startY);
        const isTap = moved < 10 && now - _lb.tapStart < 250;
        if (isTap && now - _lb.lastTapEnd < 300 &&
            Math.hypot(t.clientX - _lb.lastTapX, t.clientY - _lb.lastTapY) < 30) {
          img.classList.remove('dragging');
          if (_lb.scale > 1) {
            lightboxResetZoom();
          } else {
            const c = stageCenter();
            const px = t.clientX - c.x, py = t.clientY - c.y;
            _lb.scale = 2.5;
            _lb.tx = px * (1 - 2.5);
            _lb.ty = py * (1 - 2.5);
            lightboxClampPan();
            lightboxApplyTransform();
          }
          _lb.lastTapEnd = 0;
        } else if (isTap) {
          _lb.lastTapEnd = now; _lb.lastTapX = t.clientX; _lb.lastTapY = t.clientY;
        } else {
          _lb.lastTapEnd = 0;
        }
      }

      img.classList.remove('dragging');
      _lb.touchMode = null;
    }
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });

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
