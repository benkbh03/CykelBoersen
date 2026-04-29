export function isPendingDealerProfile(currentProfile) {
  return currentProfile?.seller_type === 'dealer' && currentProfile?.verified === false;
}

export function blockIfPendingDealerProfile({ currentProfile, showToast, navigateTo }) {
  if (isPendingDealerProfile(currentProfile)) {
    showToast('⏳ Din forhandlerprofil afventer godkendelse — du kan oprette annoncer når en admin har godkendt dig');
    navigateTo('/min-profil');
    return true;
  }
  return false;
}
