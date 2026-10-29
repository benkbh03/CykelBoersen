// Inviterede forhandlere har ingen adgangskode, før de selv vælger en.
// admin-invite-dealer sætter user_metadata.must_set_password = true, og flaget
// ryddes i SAMME updateUser-kald som gemmer adgangskoden. Så længe flaget står,
// åbnes "Vælg adgangskode" ved hvert besøg og kan ikke lukkes, heller ikke ved
// navigation eller genindlæsning. Invitationslinket virker kun én gang; uden
// dette kunne man springe over og stå uden adgangskode, når sessionen udløb.

export const MUST_SET_PASSWORD = 'must_set_password';

export function needsPassword(user) {
  return user?.user_metadata?.[MUST_SET_PASSWORD] === true;
}

function modal() {
  return document.getElementById('reset-modal');
}

export function isPasswordRequired() {
  return modal()?.dataset.required === '1';
}

export function openRequiredPasswordModal() {
  const el = modal();
  if (!el) return;
  el.dataset.required = '1';
  const title = el.querySelector('.modal-header h2');
  if (title) title.textContent = 'Vælg din adgangskode';
  const intro = el.querySelector('.modal-body > p');
  if (intro) intro.textContent = 'Din konto er oprettet. Vælg en adgangskode, så du kan logge ind igen senere. Linket i invitationen virker kun én gang.';
  const close = el.querySelector('.modal-close');
  if (close) close.style.display = 'none';
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function clearPasswordRequired() {
  const el = modal();
  if (!el) return;
  delete el.dataset.required;
  const close = el.querySelector('.modal-close');
  if (close) close.style.display = '';
}

// Linket i en mail er brugt eller udløbet. Er man stadig logget ind, sker der
// intet galt; ellers åbnes login, med vejen til "Glemt adgangskode" i teksten.
export function showExpiredLinkHelp({ currentUser, openLoginModal, showToast }) {
  if (currentUser) {
    showToast('Linket er allerede brugt, men du er logget ind.', 'ok');
    return;
  }
  showToast('Linket er allerede brugt eller udløbet. Log ind, eller vælg "Glemt adgangskode" for at få et nyt link.', 'advarsel');
  openLoginModal();
}
