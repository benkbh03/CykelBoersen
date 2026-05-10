export function renderStaticPageView(type, deps) {
  const {
    footerContent,
    showListingView,
    showDetailView,
    updateSEOMeta,
    staticPageRoutes,
    navigateTo,
  } = deps;

  const data = footerContent[type];
  if (!data) { showListingView(); return; }
  showDetailView();
  document.title = `${data.title} – Cykelbørsen`;
  const metaDesc = data.metaDesc || `${data.title} – Cykelbørsen. Danmarks dedikerede markedsplads for nye og brugte cykler.`;
  updateSEOMeta(metaDesc, staticPageRoutes[type] || '/');
  const backAction = history.length > 1 ? 'history.back()' : "navigateTo('/')";
  const body = data.body.replace(/closeFooterModal\(\);openFooterModal\('contact'\)/g, "navigateTo('/kontakt')");
  document.getElementById('detail-view').innerHTML = `
    <div class="static-page">
      <button class="sell-back-btn" onclick="${backAction}">← Tilbage</button>
      <h1 class="static-page-title">${data.title}</h1>
      <div class="static-page-body">${body}</div>
    </div>`;
}
