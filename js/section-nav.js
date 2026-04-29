export function showSectionNavigation(section, { navigateTo }) {
  const onDetailPage = document.getElementById('page-layout')?.style.display !== 'none';
  if (onDetailPage) {
    navigateTo('/');
    return;
  }
  document.querySelector('.main')?.scrollIntoView({ behavior: 'smooth' });
}
