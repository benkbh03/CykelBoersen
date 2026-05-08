export function showOnboardingBanner() {
  if (document.getElementById('welcome-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'welcome-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(26,26,24,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';

  overlay.innerHTML = `
    <div style="background:#F5F0E8;border-radius:18px;max-width:420px;width:100%;padding:32px 28px 24px;position:relative;box-shadow:0 12px 40px rgba(26,26,24,0.22);">
      <div style="font-size:2.2rem;text-align:center;margin-bottom:12px;">🚲</div>
      <h2 style="font-family:'Fraunces',serif;font-size:1.5rem;text-align:center;margin:0 0 6px;color:#1A1A18;">Velkommen til Cykelbørsen</h2>
      <p style="text-align:center;color:#6B6760;font-size:0.88rem;margin:0 0 24px;">Danmarks markedsplads for brugte cykler</p>

      <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:28px;">
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <span style="font-size:1.3rem;line-height:1;margin-top:1px;">🔍</span>
          <div>
            <div style="font-weight:600;font-size:0.9rem;color:#1A1A18;margin-bottom:2px;">Find din næste cykel</div>
            <div style="font-size:0.84rem;color:#6B6760;">Browse annoncer fra private og forhandlere over hele Danmark. Kontakt sælger direkte via beskeder.</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <span style="font-size:1.3rem;line-height:1;margin-top:1px;">🤝</span>
          <div>
            <div style="font-weight:600;font-size:0.9rem;color:#1A1A18;margin-bottom:2px;">Mød op og betal ved overlevering</div>
            <div style="font-size:0.84rem;color:#6B6760;">Alt betaling foregår uden for platformen. Aftal et mødested med sælger, tjek cyklen og betal kontant eller via MobilePay.</div>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <span style="font-size:1.3rem;line-height:1;margin-top:1px;">🛡️</span>
          <div>
            <div style="font-weight:600;font-size:0.9rem;color:#1A1A18;margin-bottom:2px;">Del aldrig kortoplysninger</div>
            <div style="font-size:0.84rem;color:#6B6760;">Vi beder aldrig om betalingsoplysninger. Vær opmærksom på svindlere der vil have betaling via link eller overførsel på forhånd.</div>
          </div>
        </div>
      </div>

      <button onclick="dismissOnboarding()" style="width:100%;padding:14px;background:#2A3D2E;color:#F5F0E8;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:0.95rem;font-weight:600;cursor:pointer;letter-spacing:0.01em;">
        Kom i gang
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.style.opacity = '1');
}

export function dismissOnboarding() {
  localStorage.setItem('onboarded', '1');
  const overlay = document.getElementById('welcome-modal-overlay');
  if (!overlay) return;
  overlay.style.transition = 'opacity 0.25s';
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.remove();
    document.body.style.overflow = '';
  }, 250);
}
