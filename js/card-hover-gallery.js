/* Hover-galleri på annonce-kort: krydsfader gennem de første 4 billeder
   når musen hviler på et kort. Touch-enheder springes over (de har ikke
   hover, og preload ville koste egress).

   Bruger to <img>-lag (.bcimg--front + .bcimg--back) med opacity-transition.
   Sekundære billeder preloades på første hover; cyklen starter når musen
   kommer ind, og resetter til primary-billedet når musen forlader kortet.

   Event-delegation på document gør at det også virker for kort der
   re-renderes (loadBikes, filtrering, pagination). */

const SWAP_MS = 1200; // hvor lang tid hvert billede vises (inkl. fade)

let active = null;

function readImgs(wrap) {
  try {
    const raw = wrap.dataset.imgs;
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length >= 2 ? arr : null;
  } catch { return null; }
}

function stop() {
  if (!active) return;
  clearInterval(active.interval);
  // Snap tilbage så næste hover starter rent fra primary
  const [front, back] = active.layers;
  if (front) {
    front.src = active.imgs[0];
    front.style.opacity = '1';
  }
  if (back) back.style.opacity = '0';
  active = null;
}

function tick() {
  if (!active) return;
  if (!document.contains(active.wrap)) { stop(); return; }
  active.pos = (active.pos + 1) % active.imgs.length;
  const nextUrl = active.imgs[active.pos];
  const otherIdx = 1 - active.visible;
  const other = active.layers[otherIdx];
  other.src = nextUrl;
  other.style.opacity = '1';
  active.layers[active.visible].style.opacity = '0';
  active.visible = otherIdx;
}

function start(wrap) {
  const imgs = readImgs(wrap);
  if (!imgs) return;
  const front = wrap.querySelector('.bcimg--front');
  const back  = wrap.querySelector('.bcimg--back');
  if (!front || !back) return;

  // Preload sekundære billeder så første swap er smooth (uden flicker)
  imgs.slice(1).forEach(url => { const i = new Image(); i.src = url; });

  active = {
    wrap,
    imgs,
    layers: [front, back],
    visible: 0, // 0 = front synlig, 1 = back synlig
    pos: 0,
    interval: setInterval(tick, SWAP_MS),
  };
}

function onEnter(e) {
  // Spring touch over — ingen hover, og preload ville koste egress
  if (e.pointerType === 'touch') return;
  const target = e.target;
  if (!target || !target.closest) return;
  const wrap = target.closest('.bike-card-img');
  if (!wrap || !wrap.dataset.imgs) return;
  if (active && active.wrap === wrap) return;
  stop();
  start(wrap);
}

function onLeave(e) {
  if (!active) return;
  // Pointer kan flytte til et child-element (badge, save-btn) — det er stadig "inde i" kortet
  const rel = e.relatedTarget;
  if (rel && active.wrap.contains(rel)) return;
  stop();
}

export function initCardHoverGallery() {
  document.addEventListener('pointerover', onEnter, { passive: true });
  document.addEventListener('pointerout',  onLeave, { passive: true });
}
