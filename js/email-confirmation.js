export function createEmailConfirmationActions({ supabase, getCurrentUser, getCurrentProfile, setCurrentProfile, showToast }) {
  function checkEmailConfirmed() {
    var banner = document.getElementById('email-confirm-banner');
    const currentUser = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!banner || !currentUser) return;

    if (currentUser.email_confirmed_at) {
      banner.style.display = 'none';
      // email_verified synkroniseres automatisk fra auth.users via DB-trigger.
      // Vi opdaterer kun lokal cache her, ingen direkte profile-update.
      if (currentProfile && !currentProfile.email_verified) {
        const p = getCurrentProfile();
        if (p) {
          p.email_verified = true;
          setCurrentProfile(p);
        }
      }
    } else {
      banner.style.display = 'block';
    }
  }

  function dismissEmailBanner() {
    var banner = document.getElementById('email-confirm-banner');
    if (banner) banner.style.display = 'none';
  }

  async function resendConfirmationEmail() {
    const currentUser = getCurrentUser();
    if (!currentUser?.email) return;
    var { error } = await supabase.auth.resend({ type: 'signup', email: currentUser.email });
    if (error) showToast('Kunne ikke sende bekræftelsesmail – prøv igen senere');
    else showToast('Bekræftelsesmail sendt! Tjek din indbakke');
  }

  return { checkEmailConfirmed, dismissEmailBanner, resendConfirmationEmail };
}
