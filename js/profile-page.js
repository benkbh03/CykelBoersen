/* ============================================================
   PROFIL MODAL + LOGOUT + SLET KONTO
   ============================================================ */

export function createProfilePage({
  supabase,
  showToast,
  btnLoading,
  enableFocusTrap,
  disableFocusTrap,
  safeAvatarUrl,
  getInitials,
  invalidateGeocodeEntry,
  attachAddressAutocomplete,
  attachCityAutocomplete,
  readDawaData,
  navigateTo,
  updateNavAvatar,
  updateVerifyUI,
  loadMyListings,
  loadSavedListings,
  loadSavedSearches,
  loadTradeHistory,
  loadInbox,
  updateNav,
  getCurrentUser,
  getCurrentProfile,
  setCurrentProfile,
  setCurrentUser,
}) {
  // Backdrop click → luk modal
  document.getElementById('profile-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProfileModal();
  });

  function openProfileModal() {
    if (!getCurrentUser()) return;
    document.getElementById('profile-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    showProfileData();
    switchProfileTab('info');
    enableFocusTrap('profile-modal');
  }

  function closeProfileModal() {
    document.getElementById('profile-modal').classList.remove('open');
    document.body.style.overflow = '';
    disableFocusTrap('profile-modal');
  }

  function onSellerTypeChange(select) {
    const currentProfile = getCurrentProfile();
    if (select.value === 'dealer' && currentProfile?.seller_type !== 'dealer') {
      // Nulstil dropdown — forhandleransøgning sker via det officielle flow
      select.value = currentProfile?.seller_type || 'private';
      closeProfileModal();
      navigateTo('/bliv-forhandler');
    }
  }

  function showProfileData() {
    // Brug den cachede profil — ingen ekstra netværkskald
    const profile = getCurrentProfile() || {};
    const currentUser = getCurrentUser();
    const name    = profile.name || currentUser?.email?.split('@')[0] || 'Ukendt';
    const initials = getInitials(name);

    const avatarEl = document.getElementById('profile-big-avatar');
    const _safeAv = safeAvatarUrl(profile.avatar_url);
    if (_safeAv) {
      avatarEl.innerHTML = `<img src="${_safeAv}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avatarEl.textContent = initials;
    }
    document.getElementById('profile-display-name').textContent  = name;
    document.getElementById('profile-display-email').textContent = currentUser?.email || '';

    const badge = document.getElementById('profile-type-badge');
    if (profile.seller_type === 'dealer') {
      badge.textContent = '🏪 Forhandler';
      badge.className   = 'badge badge-dealer';
    } else {
      badge.textContent = '👤 Privat';
      badge.className   = 'badge badge-private';
    }

    const profileModal = document.getElementById('profile-modal');
    const $p = (id) => profileModal?.querySelector(`#${id}`) || document.getElementById(id);

    $p('edit-name').value        = profile.name || '';
    $p('edit-phone').value       = profile.phone || '';
    $p('edit-city').value        = profile.city || '';
    document.getElementById('edit-seller-type').value = profile.seller_type || 'private';
    $p('edit-shop-name').value   = profile.shop_name || '';
    $p('edit-address').value     = profile.address || '';
    const bioEl = $p('edit-bio');
    if (bioEl) bioEl.value = profile.bio || '';

    const shopGroup    = document.getElementById('edit-shop-group');
    const addressGroup = document.getElementById('edit-address-group');
    const offersGroup  = document.getElementById('edit-dealer-offers-group');
    const isDealer = profile.seller_type === 'dealer';
    shopGroup.style.display    = isDealer ? 'flex' : 'none';
    addressGroup.style.display = isDealer ? 'flex' : 'none';
    if (offersGroup) offersGroup.style.display = isDealer ? 'flex' : 'none';

    const finCb = document.getElementById('edit-offers-financing');
    const triCb = document.getElementById('edit-offers-tradein');
    if (finCb) finCb.checked = !!profile.offers_financing;
    if (triCb) triCb.checked = !!profile.offers_tradein;

    // Vis sælgertype som tekst (ikke redigerbar dropdown)
    const sellerDisplay = document.getElementById('edit-seller-type-display');
    if (sellerDisplay) sellerDisplay.textContent = isDealer ? '🏪 Forhandler' : '👤 Privatperson';

    // Kobl DAWA-autocomplete: forhandlere → præcis adresse, private → by
    const cityInput    = $p('edit-city');
    const addressInput = $p('edit-address');
    if (isDealer) {
      attachAddressAutocomplete(addressInput, (picked) => {
        // Adresse valgt → udfyld by automatisk
        if (cityInput && picked.city) cityInput.value = picked.city;
      });
      attachCityAutocomplete(cityInput);
    } else {
      attachCityAutocomplete(cityInput);
    }

    // Vis abonnementsboks kun for forhandlere med aktiv Stripe-kunde
    const subBox = document.getElementById('subscription-box');
    if (subBox) {
      const hasSubscription = isDealer && profile.stripe_customer_id && profile.stripe_subscription_status !== 'canceled';
      subBox.style.display = hasSubscription ? 'block' : 'none';
      if (hasSubscription) {
        const badge  = document.getElementById('subscription-status-badge');
        const status = profile.stripe_subscription_status || 'active';
        const labels = {
          active:     { text: 'Aktivt',    cls: 'sub-status-active'  },
          trialing:   { text: '3 mdr. fri',cls: 'sub-status-trial'   },
          past_due:   { text: 'Forfaldent',cls: 'sub-status-past-due'},
          canceled:   { text: 'Annulleret',cls: 'sub-status-canceled'},
        };
        const { text, cls } = labels[status] || { text: status, cls: 'sub-status-active' };
        if (badge) { badge.textContent = text; badge.className = cls; }
      }
    }

    document.getElementById('edit-seller-type').onchange = function () {
      const dealer = this.value === 'dealer';
      shopGroup.style.display    = dealer ? 'flex' : 'none';
      addressGroup.style.display = dealer ? 'flex' : 'none';
    };
    updateVerifyUI();
  }

  function switchProfileTab(tab) {
    ['info', 'listings', 'saved', 'searches', 'trades', 'inbox'].forEach(t => {
      document.getElementById(`profile-${t}`).style.display = t === tab ? 'block' : 'none';
      document.getElementById(`ptab-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'listings') loadMyListings();
    if (tab === 'saved')    loadSavedListings();
    if (tab === 'searches') loadSavedSearches();
    if (tab === 'trades')   loadTradeHistory();
    if (tab === 'inbox')    loadInbox();
  }

  async function saveProfile() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const currentProfile = getCurrentProfile();
    const isDealer      = currentProfile?.seller_type === 'dealer';
    const addressInput  = document.getElementById('edit-address');
    const cityInput     = document.getElementById('edit-city');
    const addressData   = readDawaData(addressInput);
    const cityData      = readDawaData(cityInput);

    const updates = {
      name:        document.getElementById('edit-name').value,
      phone:       document.getElementById('edit-phone').value,
      city:        cityInput.value,
      seller_type: currentProfile?.seller_type || 'private',
      shop_name:   document.getElementById('edit-shop-name').value,
      address:     addressInput.value,
      bio:         (document.getElementById('edit-bio')?.value || '').trim(),
    };

    if (isDealer) {
      updates.offers_financing = !!document.getElementById('edit-offers-financing')?.checked;
      updates.offers_tradein   = !!document.getElementById('edit-offers-tradein')?.checked;
    }

    // Lokationsdata: forhandler har præcis adresse, privat har kun by
    if (isDealer && addressData.lat && addressData.lng) {
      updates.lat = addressData.lat;
      updates.lng = addressData.lng;
      updates.postcode = addressData.postcode;
      updates.location_precision = 'exact';
      if (addressData.city) updates.city = addressData.city;
    } else if (!isDealer && cityData.lat && cityData.lng) {
      updates.lat = cityData.lat;
      updates.lng = cityData.lng;
      updates.postcode = null;
      updates.location_precision = 'city';
      updates.address = null;
    } else if (!isDealer) {
      updates.address = null;
    }

    const restore = btnLoading('save-profile-btn', 'Gemmer...');
    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
      if (error) { showToast('❌ Kunne ikke gemme profil'); return; }

      if (updates.city && updates.city !== (currentProfile && currentProfile.city)) {
        await supabase.from('bikes').update({ city: updates.city }).eq('user_id', currentUser.id);
      }
      var oldAddr = (currentProfile && currentProfile.address || '').toLowerCase().trim();
      var oldCity = (currentProfile && currentProfile.city || '').toLowerCase().trim();
      if (oldAddr && oldCity) {
        var oldDawaKey = 'dawa3:' + oldAddr + ', ' + oldCity;
        invalidateGeocodeEntry(oldDawaKey);
      }

      setCurrentProfile({ ...currentProfile, ...updates });
      showProfileData();
      updateNavAvatar(updates.name, getCurrentProfile().avatar_url);
      showToast('✅ Profil opdateret!');
    } finally { restore(); }
  }

  async function uploadAvatar(file) {
    const currentUser = getCurrentUser();
    if (!file || !currentUser) return;
    if (file.size > 5 * 1024 * 1024) { showToast('❌ Billedet må maks være 5 MB'); return; }

    const ext  = file.name.split('.').pop();
    const path = `${currentUser.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) { showToast('❌ Kunne ikke uploade billede'); console.error(uploadError); return; }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    // Tilføj cache-busting så browseren henter det nye billede
    const avatarUrl = publicUrl + '?t=' + Date.now();

    const { error: updateError } = await supabase
      .from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);

    if (updateError) { showToast('❌ Kunne ikke gemme profilbillede'); return; }

    setCurrentProfile({ ...getCurrentProfile(), avatar_url: avatarUrl });
    showProfileData();
    updateNavAvatar(getCurrentProfile()?.name, avatarUrl);
    showToast('✅ Profilbillede opdateret!');
  }


  /* ============================================================
     LOGOUT
     ============================================================ */

  async function logout() {
    // Forsøg signOut men vent max 3 sekunder
    await Promise.race([
      supabase.auth.signOut().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    // Ryd al Supabase session-data uanset hvad
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter(k => k.startsWith('sb-')).forEach(k => sessionStorage.removeItem(k));
    window.location.href = window.location.pathname;
  }

  function deleteAccount() {
    if (!getCurrentUser()) return;
    const modal = document.getElementById('delete-account-modal');
    const input = document.getElementById('delete-confirm-input');
    input.value = '';
    onDeleteConfirmInput();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 100);
  }

  function closeDeleteAccountModal() {
    document.getElementById('delete-account-modal').style.display = 'none';
    document.body.style.overflow = '';
  }

  function onDeleteConfirmInput() {
    const val = document.getElementById('delete-confirm-input').value.trim().toLowerCase();
    const btn = document.getElementById('delete-account-confirm-btn');
    const active = val === 'slet';
    btn.disabled = !active;
    btn.style.background = active ? '#c0392b' : '#e0e0e0';
    btn.style.color       = active ? '#fff'    : '#aaa';
    btn.style.cursor      = active ? 'pointer' : 'not-allowed';
  }

  async function confirmDeleteAccount() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const btn = document.getElementById('delete-account-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Sletter...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Ikke logget ind');
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { user_id: currentUser.id },
      });
      if (error) throw error;

      setCurrentUser(null);
      setCurrentProfile(null);
      closeDeleteAccountModal();
      closeProfileModal();
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = 'none';
      updateNav(false);
      showToast('Din konto er slettet');
    } catch (err) {
      console.error('Sletning fejlede:', err);
      btn.disabled = false;
      btn.textContent = 'Slet konto';
      showToast('Noget gik galt – prøv igen');
    }
  }

  return {
    openProfileModal,
    closeProfileModal,
    showProfileData,
    switchProfileTab,
    saveProfile,
    uploadAvatar,
    logout,
    deleteAccount,
    closeDeleteAccountModal,
    onDeleteConfirmInput,
    confirmDeleteAccount,
    onSellerTypeChange,
  };
}
