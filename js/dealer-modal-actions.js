export function openBecomeDealerPage(navigateTo) {
  navigateTo('/bliv-forhandler');
}

export function closeBecomeDealerModalCompat() {
  // Noop — bruges ikke mere, men holdes for kompatibilitet
}

export function selectDealerPlanButton(btn) {
  document.querySelectorAll('.dealer-plan-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
