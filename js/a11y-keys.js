/* Tastaturadgang til elementer der opfører sig som knapper uden at være det.

   Filteroverskrifterne i sidebaren (og andre steder) er <div role="button"
   tabindex="0" onclick=…>. De kan få fokus med Tab, men en <div> reagerer ikke
   på Enter eller mellemrum, så en tastaturbruger kunne ikke folde et lukket
   filter ud (WCAG 2.1.1). Én lytter her dækker dem alle, også dem der
   tegnes senere af JS. */

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;          // fx filterpillerne har deres egen
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.getAttribute('role') !== 'button') return;
  // Rigtige knapper, links og felter klarer det selv
  if (el.matches('button, a[href], input, select, textarea, summary')) return;
  e.preventDefault();   // mellemrum må ikke rulle siden
  el.click();
});

/* "Spring til indhold"-linket øverst. Forsiden og undersiderne har hver sin
   indholdsbeholder; kun den synlige kan få fokus. */
export function skipToContent() {
  const target = [...document.querySelectorAll('#landing-layout, #page-layout')]
    .find(el => el.offsetParent !== null || getComputedStyle(el).display !== 'none');
  if (!target) return;
  target.setAttribute('tabindex', '-1');
  target.focus();
}
