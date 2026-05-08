export function createAuthActions({ supabase, showToast, btnLoading, enableFocusTrap, disableFocusTrap }) {
  function openLoginModal() {
    document.getElementById('login-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    enableFocusTrap('login-modal');
  }

  function closeLoginModal() {
    document.getElementById('login-modal').classList.remove('open');
    document.body.style.overflow = '';
    disableFocusTrap('login-modal');
  }

  function switchTab(tab) {
    document.getElementById('tab-login').classList.toggle('selected', tab === 'login');
    document.getElementById('tab-register').classList.toggle('selected', tab === 'register');

    document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('form-forgot').style.display   = tab === 'forgot'   ? 'block' : 'none';

    const titles = { login: 'Log ind', register: 'Opret konto', forgot: 'Glemt adgangskode' };
    document.querySelector('#login-modal .modal-header h2').textContent = titles[tab] || 'Log ind';
  }

  async function handleForgotPassword() {
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) { showToast('⚠️ Indtast din email'); return; }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://xn--cykelbrsen-5cb.dk/',
    });

    if (error) {
      showToast('❌ Kunne ikke sende link – tjek emailen');
    } else {
      closeLoginModal();
      showToast('✅ Tjek din email for nulstillingslinket');
    }
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://xn--cykelbrsen-5cb.dk/' },
    });
  }

  async function handleLogin() {
    const email    = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showToast('⚠️ Udfyld email og adgangskode'); return; }
    const restore = btnLoading('login-btn', 'Logger ind...');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast('❌ Forkert email eller adgangskode');
      else { closeLoginModal(); showToast('✅ Du er nu logget ind'); }
    } finally { restore(); }
  }

  async function handleRegister() {
    const name     = document.getElementById('register-name').value;
    const email    = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    if (!name || !email || !password) { showToast('⚠️ Udfyld alle felter'); return; }
    if (password.length < 8) { showToast('⚠️ Adgangskoden skal være mindst 8 tegn'); return; }
    const restore = btnLoading('register-btn', 'Opretter konto...');
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) showToast('❌ ' + error.message);
      else { closeLoginModal(); showToast('✅ Tjek din email for at bekræfte kontoen'); }
    } finally { restore(); }
  }

  return {
    openLoginModal,
    closeLoginModal,
    switchTab,
    handleForgotPassword,
    signInWithGoogle,
    handleLogin,
    handleRegister,
  };
}
