export function createAdminPanelUI({ loadDealerApplications, loadAllUsers, loadIdApplications }) {
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
    document.getElementById('admin-applications').style.display = tab === 'applications' ? 'block' : 'none';
    document.getElementById('admin-users').style.display        = tab === 'users' ? 'block' : 'none';
    document.getElementById('admin-id').style.display           = tab === 'id' ? 'block' : 'none';
    document.getElementById('atab-applications').classList.toggle('active', tab === 'applications');
    document.getElementById('atab-users').classList.toggle('active', tab === 'users');
    document.getElementById('atab-id').classList.toggle('active', tab === 'id');

    if (tab === 'applications') loadDealerApplications();
    if (tab === 'users') loadAllUsers();
    if (tab === 'id') loadIdApplications();
  }

  return { openAdminPanel, closeAdminPanel, switchAdminTab };
}
