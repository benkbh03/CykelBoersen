export function createAdminPanelUI({ loadDealerApplications, loadAllUsers, loadBulkImport, loadFeedImport, initInviteForm, loadAdminStats, loadDealerTraction }) {
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
    const panels = ['applications', 'users', 'bulk-import', 'feed-import', 'invite', 'traction', 'stats'];

    /* Ukendt fane -> fald tilbage til den første i stedet for at skjule ALT.

       Uden det her bliver panelet helt tomt hvis markup og JS er ude af trit:
       partials/modals.html hentes på en ?v=-URL, men query-strengen afgør kun
       om BROWSEREN genbruger sin kopi — GitHub Pages leverer altid den nyeste
       fil. Efter et deploy kan man derfor sidde med ny markup (en fane der
       findes) og cachet JS (en panels-liste der ikke kender den). Klik på
       fanen satte så samtlige paneler til display:none.

       En tom admin-side ligner et nedbrud. Det her gør at man i værste fald
       lander på en anden fane end den man klikkede. */
    if (!panels.includes(tab)) tab = panels[0];
    for (const t of panels) {
      const panel = document.getElementById('admin-' + t);
      const tabBtn = document.getElementById('atab-' + t);
      if (panel) panel.style.display = tab === t ? 'block' : 'none';
      if (tabBtn) tabBtn.classList.toggle('active', tab === t);
    }

    if (tab === 'applications') loadDealerApplications();
    if (tab === 'users') loadAllUsers();
    if (tab === 'bulk-import' && loadBulkImport) loadBulkImport();
    if (tab === 'feed-import' && loadFeedImport) loadFeedImport();
    if (tab === 'invite' && initInviteForm) initInviteForm();
    if (tab === 'traction' && loadDealerTraction) loadDealerTraction();
    if (tab === 'stats' && loadAdminStats) loadAdminStats();
  }

  return { openAdminPanel, closeAdminPanel, switchAdminTab };
}
