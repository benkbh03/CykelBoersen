export function createRealtimeNotifications({ supabase, getCurrentUser, updateInboxBadge, showToast, loadInboxPage }) {
  let realtimeChannel = null;

  function stopRealtimeNotifications() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function startRealtimeNotifications() {
    const user = getCurrentUser();
    if (!user) return;
    stopRealtimeNotifications();

    updateInboxBadge();

    realtimeChannel = supabase
      .channel('new-messages-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, function(payload) {
        const msg = payload.new;
        const currentUser = getCurrentUser();
        if (!currentUser || msg.receiver_id !== currentUser.id) return;

        const isBid = msg.content && msg.content.indexOf('💰') === 0;
        showToast(isBid ? '💰 Nyt bud modtaget!' : '✉️ Ny besked modtaget!');
        updateInboxBadge();

        const btn = document.getElementById('nav-inbox-btn');
        if (btn) {
          btn.classList.add('inbox-pulse');
          setTimeout(function() { btn.classList.remove('inbox-pulse'); }, 2000);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'saved_bikes',
      }, async function(payload) {
        const save = payload.new;
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        const { data: bike } = await supabase
          .from('bikes').select('user_id').eq('id', save.bike_id).single();
        if (!bike || bike.user_id !== currentUser.id) return;

        showToast('❤️ En bruger har gemt din annonce!');
        updateInboxBadge();
        if (window.location.pathname === '/inbox') loadInboxPage();
      });

    realtimeChannel.subscribe();
  }

  return { startRealtimeNotifications, stopRealtimeNotifications };
}
