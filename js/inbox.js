/* ============================================================
   INDBAKKE (modal + side)
   ============================================================ */

export function createInbox({
  supabase,
  showToast,
  esc,
  safeAvatarUrl,
  getInitials,
  retryHTML,
  btnLoading,
  updateSEOMeta,
  renderQuickRepliesHTML,
  getCurrentUser,
  getCurrentProfile,
  showDetailView,
  showListingView,
  navigateTo,
  openLoginModal,
  openRateModal,
  loadBikes,
  updateFilterCounts,
  getPendingInboxThread,
  clearPendingInboxThread,
}) {
  let activeThread      = null; // { bikeId, otherUserId, otherName }
  let activeInboxThread = null;

  // ── Hjælper ───────────────────────────────────────────────

  function formatInboxTime(dateStr) {
    const d   = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000)    return 'Lige nu';
    if (diff < 3600000)  return Math.floor(diff / 60000) + ' min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' t';
    if (diff < 604800000) return d.toLocaleDateString('da-DK', { weekday: 'short' });
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  }

  // ── Fælles besked-renderer ────────────────────────────────

  function renderMessages(messages, isSeller, bikeActive, isInbox) {
    const currentUser = getCurrentUser();
    return messages.map(msg => {
      const isSent     = msg.sender_id === currentUser.id;
      const isBid      = msg.content.startsWith('💰 Bud:') || msg.content.startsWith('💰');
      const isAccepted = msg.content.startsWith('✅ Bud på');
      const time       = new Date(msg.created_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const acceptBtn  = (isBid && !isSent && isSeller && bikeActive)
        ? `<button class="btn-accept-bid" onclick="acceptBid('${msg.content.replace(/'/g, "\\'")}', ${isInbox})">✅ Accepter bud</button>`
        : '';
      const readReceipt = (isSent && !isAccepted)
        ? (msg.read
            ? '<span class="read-receipt read" title="Læst">✓✓</span>'
            : '<span class="read-receipt" title="Sendt">✓</span>')
        : '';
      return `<div class="message-bubble ${isSent ? 'sent' : 'received'}${isBid ? ' bid-bubble' : ''}${isAccepted ? ' accepted-bubble' : ''}">
      ${esc(msg.content)}${acceptBtn}<div class="msg-time">${time}${readReceipt}</div>
    </div>`;
    }).join('');
  }

  // ── INDBAKKE MODAL (legacy / lille) ──────────────────────

  async function loadInbox() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const list = document.getElementById('inbox-list');
    list.innerHTML = '<p style="color:var(--muted)">Henter beskeder...</p>';

    let data, error;
    try {
      ({ data, error } = await supabase
        .from('messages')
        .select(`
          *,
          bikes(brand, model),
          sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type),
          receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type)
        `)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false }));
    } catch (e) {
      list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInbox');
      return;
    }
    if (error) {
      list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInbox');
      return;
    }

    if (!data || data.length === 0) {
      list.innerHTML = `<div class="empty-state-box">
      <div class="empty-state-icon">✉️</div>
      <h3 class="empty-state-title">Ingen beskeder endnu</h3>
      <p class="empty-state-sub">Når du kontakter en sælger eller modtager et bud, dukker beskederne op her.</p>
    </div>`;
      return;
    }

    const threads = {};
    data.forEach(msg => {
      const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
      const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
      const key       = `${msg.bike_id}_${otherId}`;
      if (!threads[key]) {
        threads[key] = {
          bikeId:    msg.bike_id,
          bike:      msg.bikes,
          otherId,
          otherName: otherProf?.seller_type === 'dealer' ? otherProf?.shop_name : otherProf?.name,
          messages:  [],
          hasUnread: false,
        };
      }
      threads[key].messages.push(msg);
      if (!msg.read && msg.receiver_id === currentUser.id) threads[key].hasUnread = true;
    });

    const threadList  = Object.values(threads);
    const unreadCount = threadList.filter(t => t.hasUnread).length;

    const badge = document.getElementById('inbox-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }

    list.innerHTML = threadList.map(t => {
      const lastMsg  = t.messages[0];
      const initials = getInitials(t.otherName);
      const preview  = lastMsg.content.length > 50 ? lastMsg.content.substring(0, 50) + '...' : lastMsg.content;
      const time     = new Date(lastMsg.created_at).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
      const bikeName = t.bike ? `${t.bike.brand} ${t.bike.model}` : 'Ukendt cykel';
      return `
      <div class="inbox-row ${t.hasUnread ? 'unread' : ''}"
           onclick="openThread('${t.bikeId}', '${t.otherId}', '${(t.otherName||'Ukendt').replace(/'/g,'')}')">
        <div class="inbox-avatar">${initials}</div>
        <div class="inbox-content">
          <div class="inbox-from">${t.otherName || 'Ukendt'}</div>
          <div class="inbox-bike">Re: ${bikeName}</div>
          <div class="inbox-preview">${preview}</div>
        </div>
        <div class="inbox-time">${time}</div>
      </div>`;
    }).join('');
  }

  async function openThread(bikeId, otherId, otherName) {
    const currentUser = getCurrentUser();
    activeThread = { bikeId, otherId, otherName };

    document.getElementById('inbox-list').style.display     = 'none';
    document.getElementById('message-thread').style.display = 'block';
    document.getElementById('thread-header').innerHTML      =
      `<strong>${otherName}</strong> — <span style="color:var(--muted)">Henter...</span>`;

    const [{ data, error }, { data: bike }] = await Promise.all([
      supabase.from('messages')
        .select('*')
        .eq('bike_id', bikeId)
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true }),
      supabase.from('bikes')
        .select('user_id, is_active, brand, model')
        .eq('id', bikeId)
        .single()
    ]);

    const isSeller   = bike?.user_id === currentUser.id;
    const bikeActive = bike?.is_active === true;
    const bikeName   = bike ? `${bike.brand} ${bike.model}` : 'annonce';

    activeThread.isSeller   = isSeller;
    activeThread.bikeActive = bikeActive;

    document.getElementById('thread-header').innerHTML =
      `<strong>${otherName}</strong> — <span style="color:var(--muted)">${bikeName}</span>`;

    const threadEl = document.getElementById('thread-messages');
    if (error || !data) {
      threadEl.innerHTML = '<p style="color:var(--rust)">Kunne ikke hente beskeder.</p>';
      return;
    }

    threadEl.innerHTML = renderMessages(data, isSeller, bikeActive, false);
    threadEl.scrollTop = threadEl.scrollHeight;

    await supabase.from('messages')
      .update({ read: true })
      .eq('bike_id', bikeId)
      .eq('sender_id', otherId)
      .eq('receiver_id', currentUser.id);
  }

  async function acceptBid(content, isInbox = false) {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    const thread = isInbox ? activeInboxThread : activeThread;
    if (!thread?.isSeller || !thread?.bikeActive) return;

    const match  = content.match(/💰 Bud: (.+) kr\./);
    const amount = match ? match[1] + ' kr.' : 'buddet';

    if (!confirm(`Vil du acceptere ${amount}?\nAnnoncen markeres som solgt og køber får besked.`)) return;

    const { data: bikeData } = await supabase.from('bikes')
      .select('brand, model')
      .eq('id', thread.bikeId)
      .single();

    const { error: soldErr } = await supabase.from('bikes')
      .update({ is_active: false })
      .eq('id', thread.bikeId)
      .eq('user_id', currentUser.id);

    if (soldErr) { showToast('❌ Kunne ikke markere som solgt'); return; }

    const confirmContent = `✅ Bud på ${amount} accepteret! Kontakt hinanden for at aftale overdragelse.`;
    const { data: inserted } = await supabase.from('messages').insert({
      bike_id:     thread.bikeId,
      sender_id:   currentUser.id,
      receiver_id: thread.otherId,
      content:     confirmContent,
    }).select('id').single();

    if (inserted?.id) {
      supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } }).catch(() => {});
      const bidMatch  = content.match(/💰 Bud: (.+) kr\./);
      const bidAmount = bidMatch ? bidMatch[1] + ' kr.' : 'buddet';
      supabase.functions.invoke('notify-message', {
        body: {
          type:        'bid_accepted',
          bike_id:     thread.bikeId,
          bike_brand:  bikeData?.brand,
          bike_model:  bikeData?.model,
          bid_amount:  bidAmount,
          bidder_id:   thread.otherId,
          seller_name: currentProfile?.shop_name || currentProfile?.name,
        }
      }).catch(() => {});
    }

    thread.bikeActive = false;
    loadBikes();
    updateFilterCounts();
    const bikeInfo = bikeData ? `${bikeData.brand} ${bikeData.model}` : 'annonce';
    openRateModal(thread.otherId, thread.otherName, bikeInfo);
  }

  function closeThread() {
    activeThread = null;
    document.getElementById('inbox-list').style.display      = 'flex';
    document.getElementById('inbox-list').style.flexDirection = 'column';
    document.getElementById('message-thread').style.display  = 'none';
    document.getElementById('reply-text').value = '';
    loadInbox();
  }

  async function sendReply(isInbox = false) {
    const currentUser = getCurrentUser();
    const thread    = isInbox ? activeInboxThread : activeThread;
    const textId    = isInbox ? 'inbox-modal-reply-text' : 'reply-text';
    const btnId     = isInbox ? 'send-inbox-reply-btn'   : 'send-reply-btn';
    const reopenFn  = isInbox ? openInboxThread : openThread;

    if (!thread || !currentUser) return;
    const content = document.getElementById(textId).value.trim();
    if (!content) { showToast('⚠️ Skriv et svar først'); return; }

    const restore = btnLoading(btnId, 'Sender...');
    try {
      const { data: inserted, error } = await supabase.from('messages').insert({
        bike_id:     thread.bikeId,
        sender_id:   currentUser.id,
        receiver_id: thread.otherId,
        content,
      }).select('id').single();

      if (error) { showToast('❌ Kunne ikke sende svar'); return; }
      document.getElementById(textId).value = '';
      showToast('✅ Svar sendt!');
      if (inserted?.id) {
        supabase.functions.invoke('notify-message', { body: { message_id: inserted.id } })
          .catch(e => console.error('Email notifikation fejlede:', e));
      }
      reopenFn(thread.bikeId, thread.otherId, thread.otherName);
    } finally { restore(); }
  }

  // ── INDBAKKE SIDE (#/inbox) ───────────────────────────────

  function openInboxModal() {
    if (!getCurrentUser()) { openLoginModal(); return; }
    navigateTo('/inbox');
  }

  function closeInboxModal() {
    navigateTo('/');
  }

  async function renderInboxPage() {
    const currentUser    = getCurrentUser();
    const currentProfile = getCurrentProfile();
    if (!currentUser || !currentProfile) {
      showListingView();
      openLoginModal();
      return;
    }

    showDetailView();
    document.title = 'Indbakke | Cykelbørsen';
    updateSEOMeta('Din indbakke på Cykelbørsen.', '/inbox');
    const detailView = document.getElementById('detail-view');

    detailView.innerHTML = `
    <div class="inbox-page">
      <div class="inbox-page-top">
        <button class="mp-back-btn" onclick="navigateTo('/')">← Forside</button>
        <h1 class="inbox-page-title">Indbakke</h1>
        <p class="inbox-page-subtitle">Dine samtaler med købere og sælgere</p>
      </div>

      <div class="inbox-page-layout">
        <div class="inbox-page-threads" id="inbox-page-threads">
          <div class="inbox-page-loading">
            <div class="inbox-skeleton"></div>
            <div class="inbox-skeleton"></div>
            <div class="inbox-skeleton"></div>
          </div>
        </div>
        <div class="inbox-page-chat" id="inbox-page-chat" style="display:none;">
          <div class="inbox-chat-header" id="inbox-page-chat-header"></div>
          <div class="inbox-chat-messages" id="inbox-page-chat-messages"></div>
          <div class="inbox-chat-reply">
            <div class="quick-replies">${renderQuickRepliesHTML('inbox-modal-reply-text')}</div>
            <div class="inbox-chat-reply-row">
              <textarea id="inbox-modal-reply-text" placeholder="Skriv et svar..." rows="2"></textarea>
              <button id="send-inbox-reply-btn" onclick="sendReply(true)">Send</button>
            </div>
          </div>
        </div>
        <div class="inbox-page-empty-state" id="inbox-page-empty-chat">
          <div class="inbox-empty-icon">✉️</div>
          <p>Vælg en samtale for at læse beskeder</p>
        </div>
      </div>
    </div>`;

    await loadInboxPage();

    const pending = getPendingInboxThread();
    if (pending) {
      const { bikeId, likerId, likerName } = pending;
      clearPendingInboxThread();
      await openInboxThread(bikeId, likerId, likerName);
      const messagesEl = document.getElementById('inbox-page-chat-messages');
      if (messagesEl && messagesEl.children.length === 0) {
        const ta = document.getElementById('inbox-modal-reply-text');
        if (ta) {
          ta.value = `Hej ${likerName.split(' ')[0]}! Jeg kan se, at du har gemt min annonce. Er du stadig interesseret? Spørg endelig, hvis du har spørgsmål 😊`;
          ta.focus();
        }
      }
    }
  }

  async function loadInboxPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const list = document.getElementById('inbox-page-threads');
    if (!list) return;

    let msgRes, saveRes;
    try {
      [msgRes, saveRes] = await Promise.all([
        supabase
          .from('messages')
          .select('*, bikes(brand, model, bike_images(url, is_primary)), sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type, avatar_url), receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type, avatar_url)')
          .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('saved_bikes')
          .select('user_id, bike_id, created_at, bikes!inner(id, user_id, brand, model, bike_images(url, is_primary)), profiles:user_id(id, name, shop_name, seller_type, avatar_url)')
          .eq('bikes.user_id', currentUser.id)
          .order('created_at', { ascending: false })
      ]);
    } catch (e) {
      list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInboxPage');
      return;
    }

    if (msgRes.error) {
      list.innerHTML = retryHTML('Kunne ikke hente beskeder.', 'loadInboxPage');
      return;
    }

    const data  = msgRes.data || [];
    const saves = (saveRes && !saveRes.error && saveRes.data) ? saveRes.data : [];

    const threads = {};
    data.forEach(function(msg) {
      const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
      const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
      const key       = msg.bike_id + '_' + otherId;
      if (!threads[key]) {
        threads[key] = {
          bikeId:      msg.bike_id,
          bike:        msg.bikes,
          otherId,
          otherName:   otherProf && otherProf.seller_type === 'dealer' ? otherProf.shop_name : (otherProf ? otherProf.name : 'Ukendt'),
          otherAvatar: otherProf ? otherProf.avatar_url : null,
          messages:    [],
          hasUnread:   false,
          unreadCount: 0,
          sortTime:    msg.created_at,
        };
      }
      threads[key].messages.push(msg);
      if (!msg.read && msg.receiver_id === currentUser.id) {
        threads[key].hasUnread = true;
        threads[key].unreadCount++;
      }
    });

    const interests = saves.filter(s => !threads[s.bike_id + '_' + s.user_id]);

    if (data.length === 0 && interests.length === 0) {
      list.innerHTML = `
      <div class="inbox-no-messages">
        <div class="inbox-empty-icon">📭</div>
        <h3>Ingen beskeder endnu</h3>
        <p>Når du sender eller modtager beskeder om en annonce, vises de her.</p>
        <button class="btn-primary" onclick="navigateTo('/')" style="margin-top:16px;">Udforsk cykler</button>
      </div>`;
      return;
    }

    const threadList = Object.values(threads);

    const interestHTML = interests.map(function(s) {
      const p        = s.profiles || {};
      const liker    = p.seller_type === 'dealer' ? p.shop_name : p.name;
      const likerName = liker || 'Bruger';
      const safeName  = likerName.replace(/'/g, '');
      const initials  = getInitials(likerName);
      const avUrl     = safeAvatarUrl(p.avatar_url);
      const avatarHTML = avUrl
        ? '<img src="' + avUrl + '" alt="" class="inbox-page-avatar-img">'
        : initials;
      const bikeName = s.bikes ? esc(s.bikes.brand + ' ' + s.bikes.model) : 'Din annonce';
      const bikeImg  = s.bikes?.bike_images?.find(i => i.is_primary)?.url || s.bikes?.bike_images?.[0]?.url;
      const time     = formatInboxTime(s.created_at);
      return '<div class="inbox-page-row inbox-page-row--interest unread" onclick="startConversationWithLiker(\'' + s.bike_id + '\', \'' + s.user_id + '\', \'' + safeName + '\')">'
        + '<div class="inbox-page-avatar">' + avatarHTML + '</div>'
        + '<div class="inbox-page-row-body">'
        + '<div class="inbox-page-row-top">'
        + '<span class="inbox-page-name">' + esc(likerName) + '</span>'
        + '<span class="inbox-page-time">' + time + '</span>'
        + '</div>'
        + '<div class="inbox-page-bike">' + (bikeImg ? '<img src="' + bikeImg + '" class="inbox-page-bike-thumb">' : '🚲') + ' ' + bikeName + '</div>'
        + '<div class="inbox-page-preview">'
        + '<span class="inbox-interest-tag">❤️ Har gemt din annonce</span> Klik for at starte samtale'
        + '</div>'
        + '</div>'
        + '<span class="inbox-page-unread-dot">!</span>'
        + '</div>';
    }).join('');

    const threadHTML = threadList.map(function(t) {
      const lastMsg  = t.messages[0];
      const initials = getInitials(t.otherName);
      const preview  = esc(lastMsg.content.length > 60 ? lastMsg.content.substring(0, 60) + '...' : lastMsg.content);
      const time     = formatInboxTime(lastMsg.created_at);
      const bikeName = t.bike ? esc(t.bike.brand + ' ' + t.bike.model) : 'Ukendt cykel';
      const bikeImg  = t.bike?.bike_images?.find(i => i.is_primary)?.url || t.bike?.bike_images?.[0]?.url;
      const isBid    = lastMsg.content.indexOf('💰') === 0;
      const safeName = (t.otherName || 'Ukendt').replace(/'/g, '');
      const _av      = safeAvatarUrl(t.otherAvatar);
      const avatarHTML = _av
        ? '<img src="' + _av + '" alt="" class="inbox-page-avatar-img">'
        : initials;
      return '<div class="inbox-page-row' + (t.hasUnread ? ' unread' : '') + '" onclick="openInboxThread(\'' + t.bikeId + '\', \'' + t.otherId + '\', \'' + safeName + '\')" data-thread="' + t.bikeId + '_' + t.otherId + '">'
        + '<div class="inbox-page-avatar">' + avatarHTML + '</div>'
        + '<div class="inbox-page-row-body">'
        + '<div class="inbox-page-row-top">'
        + '<span class="inbox-page-name">' + esc(t.otherName || 'Ukendt') + '</span>'
        + '<span class="inbox-page-time">' + time + '</span>'
        + '</div>'
        + '<div class="inbox-page-bike">' + (bikeImg ? '<img src="' + bikeImg + '" class="inbox-page-bike-thumb">' : '🚲') + ' ' + bikeName + '</div>'
        + '<div class="inbox-page-preview">'
        + (isBid ? '<span class="inbox-bid-tag">💰 Bud</span> ' : '')
        + preview
        + '</div>'
        + '</div>'
        + (t.hasUnread ? '<span class="inbox-page-unread-dot">' + t.unreadCount + '</span>' : '')
        + '</div>';
    }).join('');

    list.innerHTML = interestHTML + threadHTML;
  }

  async function openInboxThread(bikeId, otherId, otherName) {
    const currentUser = getCurrentUser();
    activeInboxThread = { bikeId, otherId, otherName };

    const chatPanel  = document.getElementById('inbox-page-chat');
    const emptyState = document.getElementById('inbox-page-empty-chat');
    const headerEl   = document.getElementById('inbox-page-chat-header');
    const messagesEl = document.getElementById('inbox-page-chat-messages');

    if (chatPanel)  chatPanel.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';

    document.querySelectorAll('.inbox-page-row').forEach(r => r.classList.remove('active'));
    const activeRow = document.querySelector('[data-thread="' + bikeId + '_' + otherId + '"]');
    if (activeRow) activeRow.classList.add('active');

    const { data: bikeData } = await supabase
      .from('bikes')
      .select('user_id, is_active, brand, model, price, bike_images(url, is_primary)')
      .eq('id', bikeId)
      .single();

    const isSeller   = bikeData && bikeData.user_id === currentUser.id;
    const bikeActive = bikeData && bikeData.is_active;
    activeInboxThread.isSeller   = isSeller;
    activeInboxThread.bikeActive = bikeActive;

    const bikeName  = bikeData ? esc(bikeData.brand + ' ' + bikeData.model) : 'Ukendt cykel';
    const bikePrice = bikeData ? bikeData.price.toLocaleString('da-DK') + ' kr.' : '';
    const bikeThumb = bikeData?.bike_images?.find(i => i.is_primary)?.url || bikeData?.bike_images?.[0]?.url || '';
    const isActive  = bikeData?.is_active;

    if (headerEl) {
      headerEl.innerHTML = `
      <div class="inbox-chat-header-info">
        <button class="inbox-chat-back" onclick="closeInboxThread()" aria-label="Tilbage">←</button>
        <strong>${esc(otherName)}</strong>
      </div>
      <div class="inbox-chat-bike-preview" onclick="navigateTo('/bike/${bikeId}')" role="button" tabindex="0">
        ${bikeThumb ? `<img src="${bikeThumb}" alt="" class="inbox-chat-bike-thumb">` : '<span class="inbox-chat-bike-icon">🚲</span>'}
        <div class="inbox-chat-bike-info">
          <span class="inbox-chat-bike-name">${bikeName}</span>
          <span class="inbox-chat-bike-price">${bikePrice}</span>
        </div>
        ${!isActive ? '<span class="inbox-chat-bike-sold">Solgt</span>' : ''}
      </div>`;
    }

    if (messagesEl) messagesEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Henter beskeder...</p>';

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('bike_id', bikeId)
      .or('and(sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + otherId + '),and(sender_id.eq.' + otherId + ',receiver_id.eq.' + currentUser.id + ')')
      .order('created_at', { ascending: true });

    if (error || !data) {
      if (messagesEl) messagesEl.innerHTML = '<p style="color:var(--rust);text-align:center;">Kunne ikke hente beskeder.</p>';
      return;
    }

    if (messagesEl) {
      messagesEl.innerHTML = renderMessages(data, isSeller, bikeActive, true);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    await supabase.from('messages')
      .update({ read: true })
      .eq('bike_id', bikeId)
      .eq('sender_id', otherId)
      .eq('receiver_id', currentUser.id);

    if (activeRow) {
      activeRow.classList.remove('unread');
      const dot = activeRow.querySelector('.inbox-page-unread-dot');
      if (dot) dot.remove();
    }

    updateInboxBadge();
  }

  function closeInboxThread() {
    activeInboxThread = null;
    const chatPanel  = document.getElementById('inbox-page-chat');
    const emptyState = document.getElementById('inbox-page-empty-chat');
    if (chatPanel)  chatPanel.style.display = 'none';
    if (emptyState) emptyState.style.display = '';
    document.querySelectorAll('.inbox-page-row').forEach(r => r.classList.remove('active'));
    const replyText = document.getElementById('inbox-modal-reply-text');
    if (replyText) replyText.value = '';
    loadInboxPage();
  }

  async function loadInboxModal() { await loadInboxPage(); }

  async function updateInboxBadge() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const [msgRes, savesRes, threadMsgsRes] = await Promise.all([
      supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', currentUser.id).eq('read', false),
      supabase.from('saved_bikes')
        .select('user_id, bike_id, bikes!inner(user_id)')
        .eq('bikes.user_id', currentUser.id),
      supabase.from('messages')
        .select('bike_id, sender_id, receiver_id')
        .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id),
    ]);

    const unreadMsgs = msgRes.count || 0;

    const threadKeys = new Set();
    (threadMsgsRes.data || []).forEach(m => {
      const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
      threadKeys.add(m.bike_id + '_' + otherId);
    });
    const pending = (savesRes.data || []).filter(s => !threadKeys.has(s.bike_id + '_' + s.user_id)).length;

    const total    = unreadMsgs + pending;
    const badge    = document.getElementById('nav-inbox-badge');
    const mbnBadge = document.getElementById('mbn-badge');
    if (total > 0) {
      if (badge)    { badge.textContent = total; badge.style.display = 'flex'; }
      if (mbnBadge) { mbnBadge.textContent = total; mbnBadge.style.display = 'flex'; }
    } else {
      if (badge)    badge.style.display = 'none';
      if (mbnBadge) mbnBadge.style.display = 'none';
    }
  }

  return {
    renderMessages,
    loadInbox,
    openThread,
    closeThread,
    acceptBid,
    sendReply,
    openInboxModal,
    closeInboxModal,
    renderInboxPage,
    loadInboxPage,
    loadInboxModal,
    openInboxThread,
    closeInboxThread,
    updateInboxBadge,
  };
}
