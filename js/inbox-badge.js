export function createInboxBadgeActions({ supabase, getCurrentUser }) {
  async function checkUnreadMessages() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', currentUser.id)
      .eq('read', false);

    const badge = document.getElementById('inbox-badge');
    if (badge) {
      if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
      else { badge.style.display = 'none'; }
    }
    const navBadge = document.getElementById('nav-inbox-badge');
    if (navBadge) {
      if (count > 0) { navBadge.textContent = count; navBadge.style.display = 'flex'; }
      else { navBadge.style.display = 'none'; }
    }
  }

  return { checkUnreadMessages };
}
