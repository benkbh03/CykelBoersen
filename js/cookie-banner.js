/* ============================================================
   COOKIE CONSENT BANNER
   EU/ePrivacy + GDPR-compliant: brugeren skal selv vælge.
   Persisterer i localStorage ('cb_cookie_consent' = 'accepted'|'minimal').
   ============================================================ */

const STORAGE_KEY = 'cb_cookie_consent';
const VERSION     = 'v1';

export function initCookieBanner() {
  // Tjek om brugeren allerede har valgt
  const consent = localStorage.getItem(STORAGE_KEY);
  if (consent) return;

  // Render banner
  showBanner();
}

function showBanner() {
  // Hvis banneret allerede er i DOM, gør intet
  if (document.getElementById('cookie-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie samtykke');
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <div class="cookie-banner-content">
        <div class="cookie-banner-icon">🍪</div>
        <div class="cookie-banner-text">
          <strong>Cookies på Cykelbørsen</strong>
          <p>Vi bruger nødvendige cookies for at sitet virker (login, gemte annoncer, indstillinger). Vi vil gerne bruge ekstra cookies til at forstå hvordan sitet bruges, så vi kan forbedre det.</p>
        </div>
      </div>
      <div class="cookie-banner-actions">
        <a href="/cookiepolitik" onclick="event.preventDefault();window.navigateTo('/cookiepolitik')" class="cookie-banner-link">Læs cookiepolitik</a>
        <button class="cookie-banner-btn cookie-banner-btn-minimal" onclick="window.handleCookieChoice('minimal')">Kun nødvendige</button>
        <button class="cookie-banner-btn cookie-banner-btn-accept" onclick="window.handleCookieChoice('accepted')">Accepter alle</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // Slide-in animation
  requestAnimationFrame(() => banner.classList.add('cookie-banner-visible'));
}

export function handleCookieChoice(choice) {
  if (choice !== 'accepted' && choice !== 'minimal') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, version: VERSION, ts: Date.now() }));

  const banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.classList.remove('cookie-banner-visible');
    setTimeout(() => banner.remove(), 300);
  }

  // Hvis brugeren accepter alle → trigger analytics/marketing scripts her senere
  if (choice === 'accepted') {
    window.dispatchEvent(new CustomEvent('cookie-consent-accepted'));
  }
}

// Brug fra footer-side hvis brugeren vil ændre valg
export function showCookieBannerAgain() {
  localStorage.removeItem(STORAGE_KEY);
  showBanner();
}
