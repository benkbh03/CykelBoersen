import { supabase } from './supabase-client.js';
import { STATIC_PAGE_ROUTES } from './config.js';

export function openFooterModal(type, navigateTo) {
  const route = STATIC_PAGE_ROUTES[type];
  if (route) navigateTo(route);
}

export function closeFooterModal() {
  // Noop — bruges ikke mere, holdes for kompatibilitet
}

export async function submitContactForm(showToast) {
  var name    = document.getElementById('contact-name').value.trim();
  var email   = document.getElementById('contact-email').value.trim();
  var message = document.getElementById('contact-message').value.trim();
  if (!name || !email || !message) { showToast('⚠️ Udfyld alle felter'); return; }

  const { error } = await supabase.from('contact_messages').insert({ name, email, message });
  if (error) { showToast('❌ Noget gik galt – prøv igen'); return; }

  supabase.functions.invoke('notify-message', {
    body: { type: 'contact_form', name, email, message },
  }).catch(() => {});

  document.getElementById('contact-name').value    = '';
  document.getElementById('contact-email').value   = '';
  document.getElementById('contact-message').value = '';
  showToast('✅ Tak! Vi vender tilbage inden for 1-2 hverdage.');
}
