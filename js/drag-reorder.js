/* ────────────────────────────────────────────────────────────────
   drag-reorder.js — træk elementer i et grid for at ændre rækkefølgen

   Bygget på Pointer Events, ikke HTML5 drag-and-drop. Det er ikke en
   smagssag: HTML5-API'et (dragstart/dragover/drop) virker slet ikke på
   touch. Havde vi brugt det, ville funktionen kun eksistere på computer,
   og annoncer oprettes primært på telefon.

   MOBIL-DETALJEN DER AFGØR OM DET FØLES RIGTIGT
   På touch starter træk først efter et kort tryk-og-hold. Uden det ville
   en finger der begynder på et billede og bevæger sig opad blive tolket
   som et træk i stedet for som scroll, og så kunne man ikke scrolle forbi
   billedrækken. Bevæger fingeren sig mere end nogle få pixels inden
   holdet er udløbet, opgives trækket og siden scroller som normalt.

   Med mus starter trækket derimod med det samme efter få pixels — der er
   ingen scroll-konflikt, og et påkrævet hold ville føles træget.

   Rækkefølgen aflæses af DOM'en til sidst: hvert element bærer sit
   oprindelige indeks i data-idx, og callbacket får en liste over de
   gamle indekser i deres nye rækkefølge.
──────────────────────────────────────────────────────────────── */

const HOLD_MS         = 180;   // tryk-og-hold før træk starter (touch)
const CANCEL_SLOP_PX  = 10;    // bevægelse inden da = brugeren ville scrolle
const MOUSE_START_PX  = 5;     // mus: så meget før det tæller som et træk

/**
 * @param {HTMLElement} container   Grid'et. Lytteren er delegeret, så den
 *                                  overlever at container.innerHTML sættes igen.
 * @param {object}   opts
 * @param {string}   opts.itemSelector  Fx '.img-preview-item'
 * @param {(order:number[]) => void} opts.onReorder  Gamle indekser i ny rækkefølge.
 * @param {string}  [opts.handleIgnore] Elementer der IKKE må starte et træk.
 * @returns {() => void} Oprydningsfunktion.
 */
export function enableDragReorder(container, {
  itemSelector,
  onReorder,
  handleIgnore = 'button, a, input, select, textarea, label',
}) {
  if (!container || container.dataset.dragReorder === 'on') return () => {};
  container.dataset.dragReorder = 'on';

  let el = null;          // elementet der trækkes
  let startX = 0, startY = 0;
  let dx = 0, dy = 0;
  let holdTimer = null;
  let dragging = false;
  let pointerId = null;

  const items = () => Array.from(container.querySelectorAll(itemSelector));

  function beginDrag() {
    if (!el) return;
    dragging = true;
    el.classList.add('is-dragging');
    container.classList.add('is-reordering');
    // Kort vibration som kvittering for at trækket er grebet. Findes ikke
    // på iOS Safari, og det er fint — det er en bonus, ikke en forudsætning.
    try { navigator.vibrate?.(10); } catch {}
  }

  function moveTo(clientX, clientY) {
    dx = clientX - startX;
    dy = clientY - startY;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;

    /* Find det element markøren er over, og flyt det trukne element hen
       foran eller bagved det. DOM'en omarrangeres løbende, så brugeren ser
       den nye rækkefølge mens hun trækker, ikke først når hun slipper. */
    const over = items().find((other) => {
      if (other === el) return false;
      const r = other.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
    if (!over) return;

    const rect = over.getBoundingClientRect();
    const after = clientX > rect.left + rect.width / 2;
    over.parentNode.insertBefore(el, after ? over.nextSibling : over);

    // Elementet er flyttet i DOM'en, så dets nye udgangspunkt er der hvor
    // markøren er nu. Uden dette ville det hoppe.
    startX = clientX;
    startY = clientY;
    el.style.transform = 'scale(1.04)';
  }

  function finish() {
    clearTimeout(holdTimer);
    if (el) {
      el.style.transform = '';
      el.classList.remove('is-dragging');
      if (pointerId !== null) { try { el.releasePointerCapture(pointerId); } catch {} }
    }
    container.classList.remove('is-reordering');

    if (dragging) {
      const order = items().map((n) => Number(n.dataset.idx));
      // Kun meld tilbage hvis rækkefølgen faktisk ændrede sig.
      if (order.some((v, i) => v !== i)) onReorder(order);
    }

    el = null; dragging = false; pointerId = null;
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;         // kun venstre museknap
    const target = e.target.closest(itemSelector);
    if (!target || !container.contains(target)) return;
    if (e.target.closest(handleIgnore)) return;             // slet/beskær/stjerne
    if (items().length < 2) return;

    el = target;
    pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY;
    dx = dy = 0;
    dragging = false;

    try { el.setPointerCapture(pointerId); } catch {}

    if (e.pointerType === 'mouse') {
      // Musen venter ikke; den starter ved første reelle bevægelse.
      holdTimer = null;
    } else {
      holdTimer = setTimeout(beginDrag, HOLD_MS);
    }
  }

  function onPointerMove(e) {
    if (!el || e.pointerId !== pointerId) return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);

    if (!dragging) {
      if (el && holdTimer === null && moved > MOUSE_START_PX) {
        beginDrag();                                        // mus
      } else if (holdTimer !== null && moved > CANCEL_SLOP_PX) {
        // Fingeren bevægede sig inden holdet var udløbet: brugeren ville
        // scrolle. Slip den helt, så siden opfører sig normalt.
        clearTimeout(holdTimer);
        el = null; pointerId = null;
        return;
      } else {
        return;
      }
    }

    e.preventDefault();                                     // stop scroll under træk
    moveTo(e.clientX, e.clientY);
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', finish);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', finish);
    container.removeEventListener('pointercancel', finish);
    delete container.dataset.dragReorder;
  };
}
