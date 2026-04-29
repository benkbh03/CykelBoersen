export function showOnboardingBanner() {
  const existing = document.getElementById('onboarding-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'onboarding-banner';
  banner.innerHTML = `
    <div class="onboarding-content">
      <button class="onboarding-close" onclick="dismissOnboarding()">✕</button>
      <div class="onboarding-icon">🚲</div>
      <h3 class="onboarding-title">Velkommen til Cykelbørsen!</h3>
      <p class="onboarding-sub">Hvad vil du gøre?</p>
      <div class="onboarding-actions">
        <button class="onboarding-btn onboarding-btn--primary" onclick="dismissOnboarding();openModal()">+ Sæt cykel til salg</button>
        <button class="onboarding-btn" onclick="dismissOnboarding();document.getElementById('search-input')?.focus();">Søg efter cykler</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('onboarding-visible'));
}

export function dismissOnboarding() {
  localStorage.setItem('onboarded', '1');
  const banner = document.getElementById('onboarding-banner');
  if (!banner) return;
  banner.classList.remove('onboarding-visible');
  setTimeout(() => banner.remove(), 300);
}
