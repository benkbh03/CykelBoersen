/* Mobil hamburger-menu — genskaber adgang til de top-nav-links der skjules
   på ≤768px (Mærker/Forhandlere/Cykelagenter). Selvstændigt modul uden
   afhængigheder; wires i main.js' init(). */

function getEls() {
  return {
    panel: document.getElementById('mobile-menu-panel'),
    btn: document.getElementById('nav-hamburger'),
  };
}

export function openMobileMenu() {
  const { panel, btn } = getEls();
  if (panel) panel.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

export function closeMobileMenu() {
  const { panel, btn } = getEls();
  if (panel) panel.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

export function toggleMobileMenu() {
  const { panel } = getEls();
  if (!panel) return;
  if (panel.hidden) openMobileMenu();
  else closeMobileMenu();
}

export function initMobileMenu() {
  // Luk ved klik udenfor panel + hamburger
  document.addEventListener('click', (e) => {
    const { panel, btn } = getEls();
    if (!panel || panel.hidden) return;
    if (!panel.contains(e.target) && !(btn && btn.contains(e.target))) closeMobileMenu();
  });
  // Luk på Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });
}

/* Mobil: nav er position:fixed (overflow-x:clip bryder sticky på iOS). Skjul
   ved scroll ned, vis ved scroll op, så man kan navigere uden at scrolle helt
   til toppen. Sætter body padding-top = nav-højde så indhold ikke gemmes bag. */
export function initMobileNavScroll() {
  const nav = document.querySelector('nav');
  if (!nav) return;
  const mq = window.matchMedia('(max-width: 768px)');
  let lastY = window.scrollY || 0;
  let ticking = false;

  function syncPadding() {
    if (mq.matches) {
      document.body.style.paddingTop = nav.offsetHeight + 'px';
    } else {
      document.body.style.paddingTop = '';
      nav.classList.remove('nav--hidden');
    }
  }

  function onScroll() {
    ticking = false;
    if (!mq.matches) return;
    const y = window.scrollY || 0;
    const panel = document.getElementById('mobile-menu-panel');
    const menuOpen = panel && !panel.hidden;
    if (!menuOpen && y > lastY && y > nav.offsetHeight + 30) {
      nav.classList.add('nav--hidden');      // scroll ned → skjul
    } else if (y < lastY || y <= nav.offsetHeight) {
      nav.classList.remove('nav--hidden');   // scroll op / nær top → vis
    }
    lastY = y;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(syncPadding);
  window.addEventListener('resize', syncPadding);
  syncPadding();
  requestAnimationFrame(syncPadding);
}
