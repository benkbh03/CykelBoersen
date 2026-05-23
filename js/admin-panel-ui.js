export function createAdminPanelUI({ loadDealerApplications, loadAllUsers, loadIdApplications, loadBulkImport, initInviteForm, loadAdminStats }) {
  function openAdminPanel() {
    document.getElementById('admin-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    switchAdminTab('applications');
  }

  function closeAdminPanel() {
    document.getElementById('admin-modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function switchAdminTab(tab) {
    const panels = ['applications', 'users', 'id', 'bulk-import', 'invite', 'stats'];
    for (const t of panels) {
      const panel = document.getElementById('admin-' + t);
      const tabBtn = document.getElementById('atab-' + t);
      if (panel) panel.style.display = tab === t ? 'block' : 'none';
      if (tabBtn) tabBtn.classList.toggle('active', tab === t);
    }

    if (tab === 'applications') loadDealerApplications();
    if (tab === 'users') loadAllUsers();
    if (tab === 'id') loadIdApplications();
    if (tab === 'bulk-import' && loadBulkImport) loadBulkImport();
    if (tab === 'invite' && initInviteForm) initInviteForm();
    if (tab === 'stats' && loadAdminStats) loadAdminStats();
  }

  return { openAdminPanel, closeAdminPanel, switchAdminTab };
}
