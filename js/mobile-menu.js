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
