/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

import { esc, debounce, formatLastSeen, removeBikeJsonLd, updateSEOMeta, safeAvatarUrl, trapFocus, enableFocusTrap, disableFocusTrap, haversineKm, stableOffset, BASE_URL, btnLoading, getInitials, formatDistanceKm } from './js/utils.js';
import { geocodeAddress, geocodeCity, invalidateGeocodeEntry } from './js/geocode.js';
import './js/support-chat.js';
import { supabase } from './js/supabase-client.js';
import { BIKES_PAGE_SIZE, MAP_PAGE_LIMIT, STATIC_PAGE_ROUTES } from './js/config.js';
import { openFooterModal as _openFooterModal, closeFooterModal as _closeFooterModal, submitContactForm as _submitContactForm } from './js/footer-actions.js';
import { attachAddressAutocomplete, attachCityAutocomplete, readDawaData } from './js/dawa-autocomplete.js';
import { footerContent } from './js/static-pages-content.js';
import { renderStaticPageView } from './js/static-pages.js';
import { createSearchAutocompleteHandlers } from './js/search-autocomplete.js';
import { createRealtimeNotifications } from './js/realtime-notifications.js';
import { createShareActions } from './js/share-actions.js';
import { setMainView } from './js/view-switcher.js';
import { createSoldActions } from './js/sold-actions.js';
import { createAdminPanelUI } from './js/admin-panel-ui.js';
import { createQuickReplies } from './js/quick-replies.js';
import { createEmailConfirmationActions } from './js/email-confirmation.js';
import { createInboxBadgeActions } from './js/inbox-badge.js';
import { updateNavAvatarUI } from './js/nav-avatar.js';
import { retryHTML, showToast } from './js/ui-feedback.js';
import { showOnboardingBanner, dismissOnboarding } from './js/onboarding.js';
import { showSectionNavigation } from './js/section-nav.js';
import { openBecomeDealerPage, closeBecomeDealerModalCompat, selectDealerPlanButton } from './js/dealer-modal-actions.js';
import { isPendingDealerProfile, blockIfPendingDealerProfile } from './js/dealer-guards.js';
import { createAuthActions } from './js/auth.js';
import { createFilters } from './js/filters.js';
import { createBikesList } from './js/bikes-list.js';
import { createMyProfile } from './js/my-profile.js';
import { createReviews } from './js/reviews.js';
import { createProfileModals } from './js/profile-modals.js';
import { createProfilePage } from './js/profile-page.js';
import { createImageUpload } from './js/image-upload.js';
import { createListingEdit } from './js/listing-edit.js';
import { createMapPage } from './js/map-page.js';
import { createSellPage } from './js/sell-page.js';
import { createBikeDetail } from './js/bike-detail.js';
import { createProfilePages } from './js/profile-pages.js';
import { createInbox } from './js/inbox.js';

// Global bruger-cache — hentes én gang ved init
let currentUser    = null;
let currentProfile = null;

// Brugerens gemte bike-IDs — opdateres ved loadBikes og toggleSave
let _userSavedSet = new Set();

// In-memory cache til bike-data — forhindrer dobbelt-fetch ved tilbage-navigation
const bikeCache = new Map();

// Stale-request guards: hvert modal-open incrementerer sit token.
// Async responses tjekker om tokenet stadig matcher — ellers ignoreres response.
let _bikeModalToken = 0;

// Pending inbox-tråd-oprettelse: sættes af bike-detail, læses af indbakke-siden
let _pendingInboxThread = null;

// Forhandler afventer admin-godkendelse — blokér adgang til listing-features
function isPendingDealer() {
  return isPendingDealerProfile(currentProfile);
}

function blockIfPendingDealer() {
  return blockIfPendingDealerProfile({ currentProfile, showToast, navigateTo });
}

// Pagination
let bikesOffset       = 0;
let currentFilters    = {};
let userGeoCoords     = null; // [lat, lng] fra GPS
let activeRadius      = null; // km radius filter
const askedAvailableSet = new Set(); // Track sent "er den stadig til salg?" per bike

// Filter actions (createFilters bruger getter/setter for cross-module state).
// currentFilterArgs deklareres længere nede men er hoistet via let-binding;
// closures over for-getterne læser bindingen lazy ved kald (efter init).
const {
  hasActiveFilters,
  describeActiveFilters,
  clearAllFilters,
  updateActiveFiltersBar,
  removeFilterPill,
  toggleNearMe,
  updateNearMeRadius,
  applyNearMeFilter,
  sortBikes,
  updateFilterCounts,
  setCount,
  togglePill,
} = createFilters({
  supabase, showToast, esc,
  haversineKm, formatDistanceKm,
  geocodeAddress, geocodeCity,
  loadBikes:    (...args) => loadBikes(...args),
  applyFilters: (...args) => applyFilters(...args),
  getCurrentFilters:    () => currentFilters,
  setCurrentFilters:    v => { currentFilters = v; },
  getCurrentFilterArgs: () => currentFilterArgs,
  setCurrentFilterArgs: v => { currentFilterArgs = v; },
  getUserGeoCoords:     () => userGeoCoords,
  setUserGeoCoords:     v => { userGeoCoords = v; },
  getActiveRadius:      () => activeRadius,
  setActiveRadius:      v => { activeRadius = v; },
});

// Bike list (loadBikes/renderBikes/searchBikes/loadBikesWithFilters).
// filterOffset deklareres længere nede; closures over for-getterne læser
// bindingen lazy ved kald.
const {
  loadBikes,
  renderBikes,
  renderListingsEmptyState,
  searchBikes,
  loadBikesWithFilters,
} = createBikesList({
  supabase, BIKES_PAGE_SIZE,
  esc, safeAvatarUrl, getInitials, formatLastSeen, retryHTML,
  updateActiveFiltersBar, applyNearMeFilter, hasActiveFilters, describeActiveFilters,
  getBikesOffset:       () => bikesOffset,
  setBikesOffset:       v => { bikesOffset = v; },
  getFilterOffset:      () => filterOffset,
  setFilterOffset:      v => { filterOffset = v; },
  getCurrentFilters:    () => currentFilters,
  setCurrentFilters:    v => { currentFilters = v; },
  setCurrentFilterArgs: v => { currentFilterArgs = v; },
  getCurrentUser:       () => currentUser,
  getUserGeoCoords:     () => userGeoCoords,
  getActiveRadius:      () => activeRadius,
  userSavedSet:         _userSavedSet,
  askedAvailableSet,
});

// My-profile actions (loadMyListings, savedListings, savedSearches, tradeHistory).
const {
  reloadMyListings,
  loadMyListings,
  deleteListing,
  loadSavedListings,
  removeSaved,
  notifySavedSearches,
  saveCurrentSearch,
  loadSavedSearches,
  applySavedSearch,
  deleteSavedSearch,
  loadTradeHistory,
} = createMyProfile({
  supabase, esc, retryHTML, showToast,
  getCurrentUser:       () => currentUser,
  getCurrentFilters:    () => currentFilters,
  getCurrentFilterArgs: () => currentFilterArgs,
  loadBikes:           (...args) => loadBikes(...args),
  updateFilterCounts:  (...args) => updateFilterCounts(...args),
  searchBikes:         (...args) => searchBikes(...args),
  closeProfileModal:   (...args) => closeProfileModal(...args),
});

// Reviews (rating modal + submit-flow).
const {
  pickStar,
  highlightStars,
  submitReview,
  openRateModal,
  closeRateModal,
  submitRatingFromModal,
} = createReviews({
  supabase, esc, showToast, enableFocusTrap,
  getCurrentUser:  () => currentUser,
  openUserProfile: (...args) => openUserProfile(...args),
});

// Profile modals (user/dealer profile views, tabs, contact, achievements).
const {
  filterByDealerCard,
  openDealerProfile,
  closeDealerProfileModal,
  openUserProfileWithReview,
  openUserProfile,
  switchUserProfileTab,
  switchDealerProfileTab,
  toggleProfileContact,
  sendProfileMessage,
  loadUserAchievements,
  closeUserProfileModal,
} = createProfileModals({
  supabase, esc, safeAvatarUrl, getInitials, formatLastSeen, retryHTML, showToast,
  getCurrentUser:       () => currentUser,
  userSavedSet:         _userSavedSet,
  closeAllDealersModal: (...args) => closeAllDealersModal(...args),
  closeAllModals:       (...args) => closeAllModals(...args),
  highlightStars,
});

// Profile page (profile modal, settings, logout, delete account).
const {
  openProfileModal, closeProfileModal, showProfileData, switchProfileTab,
  saveProfile, uploadAvatar, logout, deleteAccount, closeDeleteAccountModal,
  onDeleteConfirmInput, confirmDeleteAccount, onSellerTypeChange,
} = createProfilePage({
  supabase, showToast, btnLoading, enableFocusTrap, disableFocusTrap,
  safeAvatarUrl, getInitials, invalidateGeocodeEntry,
  attachAddressAutocomplete, attachCityAutocomplete, readDawaData,
  navigateTo:      (...args) => navigateTo(...args),
  updateNavAvatar: (...args) => updateNavAvatar(...args),
  updateVerifyUI:  (...args) => updateVerifyUI(...args),
  updateNav:       (...args) => updateNav(...args),
  loadMyListings, loadSavedListings, loadSavedSearches, loadTradeHistory,
  loadInbox:       (...args) => loadInbox(...args),
  getCurrentUser:    () => currentUser,
  getCurrentProfile: () => currentProfile,
  setCurrentProfile: v => { currentProfile = v; },
  setCurrentUser:    v => { currentUser = v; },
});

const {
  validateImageFile, compressImage, previewImages, renderImagePreviews,
  setPrimary, removeImage, uploadImages, resetImageUpload,
  openCropModal, setCropRatio, applyCrop, closeCropModal,
  getSelectedFiles,
} = createImageUpload({
  supabase,
  showToast,
  getEditNewFiles:         () => listingEdit.getEditNewFiles(),
  renderSellImagePreviews: () => renderSellImagePreviews(),
  renderEditNewImages:     () => renderEditNewImages(),
});

const listingEdit = createListingEdit({
  supabase,
  showToast,
  bikeCache,
  validateImageFile,
  compressImage,
  openCropModal,
  getCurrentUser:             () => currentUser,
  getCurrentProfile:          () => currentProfile,
  loadBikes:                  (...args) => loadBikes(...args),
  updateFilterCounts:         (...args) => updateFilterCounts(...args),
  reloadMyListings:           (...args) => reloadMyListings(...args),
  openBikeModal:              (...args) => openBikeModal(...args),
  renderBikePage:             (...args) => renderBikePage(...args),
  renderUserProfilePage:      (...args) => renderUserProfilePage(...args),
  renderDealerProfilePage:    (...args) => renderDealerProfilePage(...args),
});

const {
  openEditModal, closeEditModal, renderEditNewImages,
  editSetExistingPrimary, editRemoveExisting, editPreviewImages,
  editSetNewPrimary, editRemoveNew, saveEditedListing,
} = listingEdit;

const {
  setView, renderMapPage, toggleMapNearMe, resetMapFilters,
  toggleMapFilterPanel, splitCardClick, toggleSplitList,
  applyMapFilters, openMapFiltersSheet, closeMapFiltersSheet,
  mapTabSwitch, locateUser, openFromMap, _openFromMap,
} = createMapPage({
  supabase,
  showToast,
  esc,
  haversineKm,
  formatDistanceKm,
  geocodeCity,
  geocodeAddress,
  stableOffset,
  debounce,
  MAP_PAGE_LIMIT,
  updateSEOMeta,
  setMainView,
  navigateTo:       (...args) => navigateTo(...args),
  showDetailView:   () => showDetailView(),
  openBikeModal:    (...args) => openBikeModal(...args),
  navigateToBike:   (...args) => navigateToBike(...args),
  navigateToDealer: (...args) => navigateToDealer(...args),
  getUserSavedSet:  () => _userSavedSet,
});

const sellPage = createSellPage({
  supabase, showToast, esc, debounce, btnLoading,
  enableFocusTrap, disableFocusTrap, updateSEOMeta,
  attachCityAutocomplete,
  blockIfPendingDealer:   () => blockIfPendingDealer(),
  openLoginModal:         () => openLoginModal(),
  navigateTo:             (...args) => navigateTo(...args),
  showDetailView:         () => showDetailView(),
  showListingView:        () => showListingView(),
  loadBikes:              (...args) => loadBikes(...args),
  updateFilterCounts:     (...args) => updateFilterCounts(...args),
  notifySavedSearches:    (...args) => notifySavedSearches(...args),
  getSelectedFiles,
  validateImageFile,
  uploadImages,
  resetImageUpload,
  openCropModal,
  getCurrentUser:         () => currentUser,
  getCurrentProfile:      () => currentProfile,
});
const {
  openModal, _openModalLegacy, closeModal, selectType, submitListing,
  renderSellPage, submitSellPage, previewSellImages, setSellPrimary, removeSellImage,
  suggestListingFromImages, applyAiSuggestion, fileToBase64,
  setSellStep, advanceSell, backSell, saveSellDraft, clearSellDraft, initSellDraft,
  updateSellPriceSuggestion, showListingSuccessModal, closeListingSuccessModal,
  renderSellImagePreviews,
} = sellPage;

const bikeDetail = createBikeDetail({
  supabase, showToast, esc, safeAvatarUrl, getInitials, formatLastSeen,
  haversineKm, BASE_URL, removeBikeJsonLd, updateSEOMeta, retryHTML,
  stableOffset, bikeCache, geocodeAddress, geocodeCity,
  openUserProfile,
  openDealerProfile,
  getUserSavedSet:      () => _userSavedSet,
  getUserGeoCoords:     () => userGeoCoords,
  setUserGeoCoords:     v  => { userGeoCoords = v; },
  getCurrentUser:       () => currentUser,
  getCurrentProfile:    () => currentProfile,
  navigateTo:           (...args) => navigateTo(...args),
  openLoginModal:       () => openLoginModal(),
  openShareModal:       (...args) => openShareModal(...args),
  updateInboxBadge:     () => updateInboxBadge(),
  loadBikes:            (...args) => loadBikes(...args),
  closeAllModals:       () => closeAllModals(),
  setPendingInboxThread: (t) => { _pendingInboxThread = t; },
});
const {
  fetchBikeById, buildBikeBodyHTML,
  openBikeModal, closeBikeModal,
  renderBikePage, renderBikeSkeleton,
  showDetailView, showListingView,
  initBikeDetailMap, _drawUserPositionOnBikeMap, showMyDistanceOnBikeMap,
  loadResponseTime, loadSellerOtherListings, loadSimilarListings, loadInterestedUsers,
  startConversationWithLiker, openReportModal, closeReportModal, submitReport,
  galleryGoto, galleryNav, attachGallerySwipe,
  openLightbox, closeLightbox, lightboxShow, lightboxNav, lightboxResetZoom,
  lightboxApplyTransform, lightboxClampPan, initLightboxGestures,
  updateMeetMiddle, useMeetMiddle, toggleBidBox, insertPresetMsg,
  toggleMessageBox, stickyBarAction, sendMessage, sendBid, toggleSaveFromModal,
  setupLightboxEvents, registerWindowExports: registerBikeDetailWindowExports,
} = bikeDetail;

setupLightboxEvents();
registerBikeDetailWindowExports();

const {
  renderUserProfilePage, renderDealerProfilePage,
  navigateToProfile, navigateToDealer,
} = createProfilePages({
  supabase, esc, safeAvatarUrl, getInitials, formatLastSeen,
  updateSEOMeta,
  getUserSavedSet:    () => _userSavedSet,
  getCurrentUser:     () => currentUser,
  showDetailView,
  navigateTo:         (...args) => navigateTo(...args),
  highlightStars,
  loadUserAchievements,
});


/* ============================================================
   INIT – hent session én gang og sæt alt op
   ============================================================ */

async function init() {
  // Start offentlig data med det samme – venter ikke på auth
  const sessionPromise = supabase.auth.getSession();
  loadBikes();
  loadInitialData(); // Erstatter loadDealers() + updateFilterCounts() med 2 parallelle queries

  const { data: { session } } = await sessionPromise;

  if (session) {
    currentUser = session.user;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', currentUser.id).single();

    // Fuldfør forhandler-registrering hvis bruger signede op via bliv-forhandler siden
    const meta = currentUser.user_metadata || {};
    if (meta.pending_dealer && (!profile || profile.seller_type !== 'dealer')) {
      await supabase.from('profiles').upsert({
        id:                 currentUser.id,
        email:              currentUser.email,
        name:               meta.name || '',
        shop_name:          meta.shop_name || '',
        cvr:                meta.cvr || '',
        phone:              meta.phone || '',
        address:            meta.address || '',
        city:               meta.city || '',
        lat:                meta.lat || null,
        lng:                meta.lng || null,
        postcode:           meta.postcode || null,
        location_precision: meta.lat && meta.lng ? 'exact' : null,
        seller_type:        'dealer',
        verified:           false,
        email_verified:     true,
      }, { onConflict: 'id' });
      const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
      currentProfile = freshProfile;
      supabase.auth.updateUser({ data: { pending_dealer: null } }).catch(() => {});
      supabase.functions.invoke('notify-message', {
        body: {
          type:      'dealer_application',
          shop_name: meta.shop_name,
          cvr:       meta.cvr,
          contact:   meta.name,
          phone:     meta.phone,
          address:   meta.address,
          city:      meta.city,
          email:     currentUser.email,
          user_id:   currentUser.id,
        },
      }).catch(() => {});
    } else {
      currentProfile = profile;
    }

    updateNav(true, currentProfile?.name, currentProfile?.avatar_url);
    startRealtimeNotifications();
    // Vis admin knap hvis admin
    if (currentProfile && currentProfile.is_admin) {
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = 'flex';
    }
    checkEmailConfirmed();
    // Opdater last_seen (fire-and-forget)
    supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id).then(null, () => {});
  } else {
    updateNav(false);
  }

  // Opdater nav når bruger logger ind/ud
  // _hasHadSession forhindrer at token-refresh (der fyrer SIGNED_IN) kalder loadBikes() unødvendigt
  let _hasHadSession = !!currentUser;
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      const isNewLogin = !_hasHadSession;
      _hasHadSession = true;
      currentUser = session.user;

      if (_event === 'SIGNED_IN' && !isNewLogin) {
        // Token-refresh pseudo-SIGNED_IN: opdater kun currentUser (har nyt token) — ingen sideeffekter
        return;
      }

      // Ægte login eller TOKEN_REFRESHED/andre events: hent profil og opdater UI
      let { data: profile, error: profileErr } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();
      if (profileErr) console.warn('onAuthStateChange profile fetch FAIL:', profileErr.message);

      // Ny OAuth-bruger uden profil endnu — opret den automatisk
      if (!profile && _event === 'SIGNED_IN') {
        const meta = currentUser.user_metadata || {};
        const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || 'Ny bruger';
        await supabase.from('profiles').upsert({
          id:             currentUser.id,
          name,
          email:          currentUser.email,
          seller_type:    'private',
          email_verified: true,
        }, { onConflict: 'id' });
        const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        profile = newProfile;
      }

      currentProfile = profile;
      updateNav(true, profile?.name, profile?.avatar_url);
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = profile?.is_admin ? 'flex' : 'none';
      checkEmailConfirmed();
      if (_event === 'SIGNED_IN' && isNewLogin) {
        loadBikes();
        if (!localStorage.getItem('onboarded')) showOnboardingBanner();
        checkSavedSearchNotifications();
      }
    } else {
      _hasHadSession = false;
      currentUser    = null;
      currentProfile = null;
      stopRealtimeNotifications();
      updateNav(false);
      // Session udløbet — reload siden for at rydde stale state
      if (_event === 'SIGNED_OUT') {
        window.location.href = window.location.pathname;
      }
    }
  });

  // --- Idle/refresh guards ---
  let _refreshInProgress = false;
  let _lastRefreshTime = 0;
  const REFRESH_THROTTLE_MS = 5000; // mindst 5s mellem refreshes

  function _isAnyModalOpen() {
    // Check display='flex' modals
    for (const id of ['dealer-profile-modal', 'user-profile-modal', 'all-dealers-modal', 'login-modal', 'share-modal', 'report-modal', 'inbox-modal']) {
      const el = document.getElementById(id);
      if (el && el.style.display === 'flex') return true;
    }
    // Check classList='open' modals
    for (const id of ['bike-modal', 'map-bike-modal']) {
      const el = document.getElementById(id);
      if (el && el.classList.contains('open')) return true;
    }
    return false;
  }

  // Refresh session + data når bruger vender tilbage til fanen
  // Guards: throttle, concurrent protection, skip if modal open
  let _visibilityTimeout = null;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(_visibilityTimeout);
    _visibilityTimeout = setTimeout(async () => {
      // Guard: skip if a modal is open
      if (_isAnyModalOpen()) return;
      // Guard: throttle
      const now = Date.now();
      if (now - _lastRefreshTime < REFRESH_THROTTLE_MS) return;
      // Guard: concurrent refresh
      if (_refreshInProgress) return;
      _refreshInProgress = true;
      _lastRefreshTime = now;
      try {
        const { data, error } = await supabase.auth.getSession();
        loadBikes();
        // Opdater last_seen når brugeren vender tilbage til fanen
        if (currentUser) {
          supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id).then(() => {}, (err) => {});
        }
      } finally {
        _refreshInProgress = false;
      }
      // updateFilterCounts opdateres kun ved initial load og efter mutationer
    }, 500);
  });

  // Åbn indbakke automatisk hvis ?inbox=true er i URL'en
  if (new URLSearchParams(window.location.search).get('inbox') === 'true' && currentUser) {
    history.replaceState(null, '', window.location.pathname);
    openInboxModal();
  }

  // Åbn delt annonce automatisk hvis ?bike=ID er i URL'en
  const sharedBikeId = new URLSearchParams(window.location.search).get('bike');
  if (sharedBikeId) {
    history.replaceState(null, '', window.location.pathname);
    openBikeModal(sharedBikeId);
  }

  // Åbn admin-panel direkte hvis ?admin=dealers er i URL'en (fra notifikationsmail)
  const adminTab = new URLSearchParams(window.location.search).get('admin');
  if (adminTab && currentProfile?.is_admin) {
    history.replaceState(null, '', window.location.pathname);
    openAdminPanel();
    const validTabs = ['applications', 'users', 'id'];
    const tabMap    = { dealers: 'applications', forhandlere: 'applications' };
    const target    = tabMap[adminTab] || (validTabs.includes(adminTab) ? adminTab : 'applications');
    setTimeout(() => switchAdminTab(target), 100);
  }

  // Håndter email-bekræftelse og password reset (Supabase sætter type i hash)
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get('type') === 'signup') {
    history.replaceState(null, '', window.location.pathname);
    dismissEmailBanner();
    localStorage.removeItem('_pending_dealer');

    // init() har allerede fuldført dealer-setup hvis user_metadata.pending_dealer var sat
    const isPendingDealer = currentProfile?.seller_type === 'dealer' && currentProfile?.verified === false;

    if (currentUser && !isPendingDealer) {
      supabase.from('profiles').update({ email_verified: true }).eq('id', currentUser.id).then(() => {
        if (currentProfile) currentProfile.email_verified = true;
      });
    }

    if (isPendingDealer) {
      showToast('✅ Email bekræftet! Din forhandleransøgning er modtaget – vi vender tilbage hurtigst muligt.');
      navigateTo('/min-profil');
    } else {
      showToast('✅ Din e-mail er bekræftet – velkommen til Cykelbørsen!');
    }
  } else if (hashParams.get('type') === 'recovery') {
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Håndter returnering fra Stripe Checkout
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('dealer_success') === 'true') {
    history.replaceState(null, '', window.location.pathname);
    // Genindlæs profil så verified-status er opdateret
    if (currentUser) {
      const { data: freshProfile } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();
      currentProfile = freshProfile;
      updateNav(true, freshProfile?.name, freshProfile?.avatar_url);
    }
    showToast('🎉 Velkommen som forhandler! Din 3-måneders gratis periode er startet.');
    setTimeout(() => openProfileModal(), 600);
  } else if (urlParams.get('dealer_cancel') === 'true') {
    history.replaceState(null, '', window.location.pathname);
    showToast('ℹ️ Betalingen blev annulleret. Du kan prøve igen når du er klar.');
  }

  // Klik uden for modal lukker den
  document.getElementById('inbox-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeInboxModal();
  });
  document.getElementById('admin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAdminPanel();
  });
  document.getElementById('share-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeShareModal();
  });

  // Backward compat: omstil gamle hash-URLs (#/bike/123 → /bike/123)
  const _initHash = window.location.hash;
  if (_initHash.startsWith('#/') && !_initHash.includes('type=')) {
    history.replaceState({}, '', _initHash.slice(1));
  }

  // Pathname routing: håndter initial route (køres efter Supabase hash-params er tjekket)
  if (!_initHash.includes('type=signup') && !_initHash.includes('type=recovery')) {
    handleRoute();
  }

  // Global Escape-tast: lukker den øverste åbne modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Tjek modaler i prioriteret rækkefølge (inderste/øverste først)
    if (document.getElementById('share-modal')?.classList.contains('open'))      { closeShareModal(); return; }
    if (document.getElementById('admin-modal')?.classList.contains('open'))      { closeAdminPanel(); return; }
    if (document.getElementById('edit-modal')?.classList.contains('open'))       { closeEditModal(); return; }
    if (document.getElementById('crop-modal')?.style.display === 'flex')          { closeCropModal(); return; }
    if (document.getElementById('bike-modal')?.classList.contains('open'))       { closeBikeModal(); return; }
    if (document.getElementById('map-bike-modal')?.classList.contains('open'))   { closeMapBikeModal(); return; }
    if (document.getElementById('inbox-modal')?.classList.contains('open'))      { closeInboxModal(); return; }
    if (document.getElementById('profile-modal')?.classList.contains('open'))    { closeProfileModal(); return; }
    if (document.getElementById('modal')?.classList.contains('open'))            { closeModal(); return; }
    if (document.getElementById('login-modal')?.classList.contains('open'))      { closeLoginModal(); return; }
    // display:flex-baserede modaler
    if (document.getElementById('user-profile-modal')?.style.display === 'flex')   { closeUserProfileModal(); return; }
    if (document.getElementById('dealer-profile-modal')?.style.display === 'flex') { closeDealerProfileModal(); return; }
    if (document.getElementById('all-dealers-modal')?.style.display === 'flex')    { closeAllDealersModal(); return; }
  });
}

function updateNav(loggedIn, name, avatarUrl) {
  const sellBtn        = document.querySelector('.btn-sell');
  const navProfile     = document.getElementById('nav-profile');
  const mbnProfile     = document.getElementById('mbn-profile-btn');
  const mbnLogin       = document.getElementById('mbn-login-btn');
  if (loggedIn) {
    if (sellBtn) {
      if (isPendingDealer()) {
        sellBtn.textContent = '⏳ Afventer godkendelse';
        sellBtn.setAttribute('onclick', 'blockIfPendingDealer()');
        sellBtn.setAttribute('title', 'Din forhandlerprofil afventer admin-godkendelse');
        sellBtn.style.opacity = '0.6';
        sellBtn.style.cursor = 'not-allowed';
      } else {
        sellBtn.textContent = '+ Sæt til salg';
        sellBtn.setAttribute('onclick', 'openModal()');
        sellBtn.removeAttribute('title');
        sellBtn.style.opacity = '';
        sellBtn.style.cursor = '';
      }
    }
    if (navProfile) navProfile.style.display = 'flex';
    if (mbnProfile) mbnProfile.style.display = 'flex';
    if (mbnLogin)   mbnLogin.style.display = 'none';
    updateNavAvatar(name, avatarUrl);
    checkUnreadMessages();
  } else {
    if (sellBtn) { sellBtn.textContent = 'Log ind / Sælg'; sellBtn.setAttribute('onclick', 'openLoginModal()'); }
    if (navProfile) navProfile.style.display = 'none';
    if (mbnProfile) mbnProfile.style.display = 'none';
    if (mbnLogin)   mbnLogin.style.display = 'flex';
  }
}

const { checkEmailConfirmed, dismissEmailBanner, resendConfirmationEmail } = createEmailConfirmationActions({
  supabase,
  getCurrentUser: () => currentUser,
  getCurrentProfile: () => currentProfile,
  setCurrentProfile: (p) => { currentProfile = p; },
  showToast,
});

function updateNavAvatar(name, avatarUrl) {
  return updateNavAvatarUI({ safeAvatarUrl, getInitials }, name, avatarUrl);
}

const { checkUnreadMessages } = createInboxBadgeActions({
  supabase,
  getCurrentUser: () => currentUser,
});

/* ============================================================
   FORHANDLERE
   ============================================================ */

async function loadDealers(dealers, bikeRows) {
  const container = document.getElementById('dealer-cards-container');
  if (!container) return;

  let error;
  if (!dealers || !bikeRows) {
    // Standalone kald – hent data selv
    let dealerRes, bikeRes;
    [dealerRes, bikeRes] = await Promise.all([
      supabase.from('profiles').select('id, shop_name, city, address, name').eq('seller_type', 'dealer').eq('verified', true).order('created_at', { ascending: true }),
      supabase.from('bikes').select('user_id').eq('is_active', true)
    ]);
    dealers  = dealerRes.data;
    bikeRows = bikeRes.data;
    error    = dealerRes.error;
  }

  if (error || !dealers || dealers.length === 0) {
    container.className = 'dealer-cards dealer-empty-state';
    container.innerHTML = `
      <div class="dealer-empty-card">
        <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
        <h3>Ingen forhandlere endnu</h3>
        <p>Vær den første forhandler på Cykelbørsen og nå tusindvis af cykelkøbere.</p>
        <button class="btn-become-dealer-small" onclick="navigateTo('/bliv-forhandler')">Tilmeld din butik →</button>
      </div>
    `;
    return;
  }

  const dealerIdSet = new Set(dealers.map(d => d.id));

  const countMap = {};
  if (bikeRows) {
    for (const b of bikeRows) {
      if (dealerIdSet.has(b.user_id)) {
        countMap[b.user_id] = (countMap[b.user_id] || 0) + 1;
      }
    }
  }

  // Sorter efter antal cykler (flest først)
  dealers.sort((a, b) => (countMap[b.id] || 0) - (countMap[a.id] || 0));

  const top3    = dealers.slice(0, 3);
  const rest    = dealers.slice(3);

  container.className = 'dealer-cards';
  container.innerHTML = top3.map(dealer => buildDealerCard(dealer, countMap, true)).join('');

  // Resten vises inline under en "Se resten"-knap
  if (rest.length > 0) {
    const restHtml = rest.map(d => buildDealerCard(d, countMap, false)).join('');
    const restWrap = document.createElement('div');
    restWrap.innerHTML = `
      <button class="btn-see-all-dealers" id="toggle-rest-dealers" onclick="toggleRestDealers()">
        Se resten (${rest.length} forhandlere) ↓
      </button>
      <div class="dealer-cards dealer-rest-grid" id="rest-dealers-grid" style="display:none;margin-top:16px;">
        ${restHtml}
      </div>
    `;
    container.after(restWrap);
  }

  // Gem alle forhandlere til modal brug
  window._allDealers    = dealers;
  window._dealerCountMap = countMap;
}

// Kombineret startup-fetch: 2 parallelle queries i stedet for 5
async function loadInitialData() {
  const [{ data: dealers, count: dealerCount }, { data: bikesData }] = await Promise.all([
    supabase.from('profiles')
      .select('id, shop_name, city, address, name', { count: 'exact' })
      .eq('seller_type', 'dealer').eq('verified', true)
      .order('created_at', { ascending: true }),
    supabase.from('bikes')
      .select('type, condition, wheel_size, user_id, profiles(seller_type)')
      .eq('is_active', true)
  ]);
  updateFilterCounts(bikesData, dealerCount);
  loadDealers(dealers, bikesData);
}

function buildDealerCard(dealer, countMap, featured = false) {
  const displayName   = dealer.shop_name || dealer.name || 'Forhandler';
  const initials      = getInitials(displayName);
  const bikeCount     = countMap[dealer.id] || 0;
  const locationText  = dealer.address && dealer.city ? `${dealer.address}, ${dealer.city}` : dealer.address || dealer.city || '';
  const featuredClass = featured ? ' dealer-card--featured' : '';
  return `
    <div class="dealer-card${featuredClass}" onclick="navigateToDealer('${dealer.id}')" style="cursor:pointer;" title="Se ${displayName}s profil">
      <div class="dealer-logo-circle">${initials}</div>
      <div class="dealer-name">${displayName} <span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></div>
      ${locationText ? `<div class="dealer-city">📍 ${locationText}</div>` : ''}
      <div class="dealer-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>
    </div>
  `;
}

function toggleRestDealers() {
  const grid = document.getElementById('rest-dealers-grid');
  const btn  = document.getElementById('toggle-rest-dealers');
  if (!grid || !btn) return;
  const open = grid.style.display === 'none';
  grid.style.display  = open ? '' : 'none';
  btn.textContent     = open
    ? `Skjul resten ↑`
    : `Se resten (${grid.querySelectorAll('.dealer-card').length} forhandlere) ↓`;
}

function openAllDealersModal() {
  const modal = document.getElementById('all-dealers-modal');
  if (!modal) return;
  const grid = document.getElementById('all-dealers-grid');
  const dealers   = window._allDealers    || [];
  const countMap  = window._dealerCountMap || {};
  grid.innerHTML = dealers.map(d => buildDealerCard(d, countMap, false)).join('');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeAllDealersModal() {
  const modal = document.getElementById('all-dealers-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function closeMapBikeModal() {
  const el = document.getElementById('map-bike-modal');
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

function closeAllModals() {
  ['all-dealers-modal','dealer-profile-modal','user-profile-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  ['bike-modal','map-bike-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  document.body.style.overflow = '';
}


/* ============================================================
   ANNONCER
   ============================================================ */


async function askIfAvailable(bikeId, sellerId, btn) {
  if (!currentUser) { openLoginModal(); return; }
  if (sellerId === currentUser.id) return;
  if (askedAvailableSet.has(bikeId)) { showToast('Du har allerede spurgt om denne cykel'); return; }
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const { error } = await supabase.from('messages').insert({
    bike_id: bikeId, sender_id: currentUser.id, receiver_id: sellerId,
    content: '👋 Er cyklen stadig til salg?',
  });
  if (error) { showToast('❌ Kunne ikke sende besked'); if (btn) { btn.disabled = false; btn.style.opacity = ''; } return; }
  askedAvailableSet.add(bikeId);
  if (btn) { btn.textContent = '✅'; btn.style.opacity = '1'; }
  showToast('✅ Besked sendt til sælgeren!');

  supabase.functions.invoke('notify-message', {
    body: { type: 'message_id', bikeId, senderId: currentUser.id, receiverId: sellerId },
  }).catch(() => {});
}


/* ============================================================
   GEM / FJERN ANNONCE
   ============================================================ */

async function toggleSave(btn, bikeId) {
  if (!currentUser) { showToast('⚠️ Log ind for at gemme annoncer'); return; }
  const isSaved = btn.textContent === '❤️';
  if (isSaved) {
    const { error } = await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
    if (error) { showToast('❌ Kunne ikke fjerne fra gemte'); return; }
    btn.textContent = '🤍';
    _userSavedSet.delete(bikeId);
    showToast('Fjernet fra gemte');
  } else {
    const { data: bike } = await supabase.from('bikes').select('brand, model, user_id').eq('id', bikeId).single();
    if (bike && bike.user_id === currentUser.id) { showToast('⚠️ Du kan ikke gemme din egen annonce'); return; }
    const { error } = await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
    if (error) { showToast('❌ Kunne ikke gemme annonce'); return; }
    btn.textContent = '❤️';
    _userSavedSet.add(bikeId);
    showToast('❤️ Gemt! Find den under Gemte i din profil.');

    // Send email notification to bike owner (fire-and-forget)
    if (bike) {
      supabase.functions.invoke('notify-message', {
        body: {
          type: 'listing_liked',
          bike_id: bikeId,
          bike_brand: bike.brand,
          bike_model: bike.model,
          bike_owner_id: bike.user_id,
          liker_id: currentUser.id,
          liker_name: currentProfile?.name || 'En bruger',
        },
      }).catch(() => {});
    }
  }
}


// Keyboard-aktivering af filterpills (Enter/Space)
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePill(pill);
    }
  });
});

/* ============================================================
   LOGIN MODAL
   ============================================================ */

const {
  openLoginModal,
  closeLoginModal,
  switchTab,
  handleForgotPassword,
  signInWithGoogle,
  handleLogin,
  handleRegister,
} = createAuthActions({ supabase, showToast, btnLoading, enableFocusTrap, disableFocusTrap });

document.getElementById('login-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLoginModal();
});

/* ============================================================
   TOAST & NAVIGATION SCROLL
   ============================================================ */

async function checkSavedSearchNotifications() {
  if (!currentUser) return;
  const key = `ss_checked_${currentUser.id}`;
  const lastChecked = localStorage.getItem(key) || new Date(0).toISOString();

  const { data: searches } = await supabase
    .from('saved_searches').select('id, name, filters').eq('user_id', currentUser.id);
  if (!searches?.length) return;

  // Tjek om der er nye annoncer siden sidst checked
  const { count } = await supabase.from('bikes')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .gt('created_at', lastChecked);

  localStorage.setItem(key, new Date().toISOString());
  if (!count || count === 0) return;

  // Find søgninger der matcher
  const matchingSearches = searches.filter(s => s.filters && (s.filters.search || s.filters.type || s.filters.city));
  if (!matchingSearches.length) return;

  // Vis notifikation
  const banner = document.createElement('div');
  banner.id = 'ss-notification';
  banner.innerHTML = `
    <div class="ss-notif-content">
      <span class="ss-notif-icon">🔔</span>
      <span class="ss-notif-text">${count} nye cykler siden dit sidste besøg — <a onclick="navigateToMyProfile();setTimeout(()=>switchMyProfileTab('searches'),400)" style="color:var(--forest);font-weight:600;cursor:pointer;">Tjek dine søgninger →</a></span>
      <button onclick="this.closest('#ss-notification').remove()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--muted);padding:4px;">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('ss-notif-visible'), 100);
  setTimeout(() => { banner.classList.remove('ss-notif-visible'); setTimeout(() => banner.remove(), 400); }, 8000);
}

const { useQuickReply, getQuickReplies, renderQuickRepliesHTML } = createQuickReplies({
  esc,
  getCurrentProfile: () => currentProfile,
});

function showSection(section) {
  return showSectionNavigation(section, { navigateTo });
}
/* ============================================================
   MIN PROFIL SIDE (#/me)
   ============================================================ */

function navigateToMyProfile() {
  navigateTo('/me');
}

async function renderMyProfilePage() {
  if (!currentUser || !currentProfile) {
    showListingView();
    openLoginModal();
    return;
  }

  showDetailView();
  document.body.classList.toggle('is-mp-mobile', window.innerWidth <= 768);
  const detailView = document.getElementById('detail-view');
  detailView.innerHTML = renderProfileSkeleton();

  document.title = `Min konto | Cykelbørsen`;
  detailView.innerHTML = buildMyProfilePageHTML();
  loadMyListings('mp-listings-grid');
  loadProfileStats();
  checkUnreadMessages();
}

function buildMyProfilePageHTML() {
  const p           = currentProfile;
  const u           = currentUser;
  const isDealer    = p.seller_type === 'dealer';
  const displayName = isDealer ? (p.shop_name || p.name) : (p.name || 'Min profil');
  const initials    = getInitials(displayName);
  const memberSince = p.created_at
    ? new Date(p.created_at).toLocaleDateString('da-DK', { year: 'numeric', month: 'long' })
    : null;

  const avatarUrl = safeAvatarUrl(p.avatar_url);
  const avatarContent = avatarUrl
    ? `<img src="${avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  // Profile completion
  const completionItems = [
    { label: 'E-mail verificeret', done: !!u?.email_confirmed_at },
    { label: 'Profilbillede',      done: !!p.avatar_url },
    { label: 'By tilføjet',        done: !!p.city },
    { label: 'Om mig udfyldt',     done: !!p.bio },
  ];
  const doneCount = completionItems.filter(i => i.done).length;
  const pct       = Math.round((doneCount / completionItems.length) * 100);
  const hasSidebarContent = pct < 100 || (isDealer && !p.verified);

  const svgBike    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="17" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M6 17l4-8h6l2 8m-8-8h-2m4 0l-2 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgEye     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S6 4.5 12 4.5 22.5 12 22.5 12 18 19.5 12 19.5 1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const svgHeart   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 20.8s-7.5-4.6-7.5-11A4.5 4.5 0 0112 6a4.5 4.5 0 017.5 3.8c0 6.4-7.5 11-7.5 11z" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const svgShake   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 13l5-5 3 3-5 5-3-3zM9 11l4-4 3 3-4 4-3-3zM13 7l3-3 4 4-3 3M5 16l3 3M13 17l2 2 2-1 1-2-3-3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const svgPlus    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const svgEdit    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 4l6 6-11 11H3v-6L14 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const svgInbox   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 13l3-7h12l3 7v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 13h5l1 2h6l1-2h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const svgCheck   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgPin     = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>`;
  const svgMail    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 7l9 7 9-7" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const svgLogout  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgChev    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const svgBack    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  return `
    <div class="mp-wrap">
     <div class="mp-inner${hasSidebarContent ? '' : ' mp-no-sidebar'}">
      <div class="mp-top">
        <button class="mp-back-btn" onclick="navigateTo('/')">${svgBack} Forside</button>
        <h1 class="mp-title">Min konto</h1>
        <p class="mp-subtitle">Administrér dine annoncer, gemte søgninger og kontooplysninger</p>
      </div>

      <div class="mp-layout${hasSidebarContent ? '' : ' mp-no-sidebar'}">
        <!-- Hoved-kolonne -->
        <div class="mp-main">

          <!-- Profil-kort -->
          <div class="mp-account-card">
            <div class="mp-avatar-decor"></div>
            <div class="mp-identity">
              <div class="mp-avatar">${avatarContent}</div>
              <div class="mp-info">
                <div class="mp-name-row">
                  <h2 class="mp-name">${esc(displayName)}</h2>
                  ${p.verified ? `<span class="mp-verified-icon" style="color:var(--forest)" title="Verificeret">${svgCheck}</span>` : ''}
                </div>
                <div class="mp-meta">
                  <span class="mp-type-pill">
                    ${isDealer ? svgBike : ''} ${isDealer ? 'Forhandler' : 'Privat sælger'}
                  </span>
                </div>
                <div class="mp-contact-row">
                  <div class="mp-contact-top">
                    ${p.city ? `<span class="mp-contact-item" style="color:var(--rust)">${svgPin} ${esc(p.city)}</span>` : ''}
                    ${memberSince ? `<span class="mp-member-since">Medlem siden ${memberSince}</span>` : ''}
                  </div>
                  ${u?.email ? `<span class="mp-contact-item mp-contact-email-item">${svgMail} <span class="mp-email-text">${esc(u.email)}</span></span>` : ''}
                </div>
              </div>
            </div>
            <div class="mp-header-actions">
              <button class="mp-action-primary" onclick="navigateTo('/sell')">${svgPlus} <span>Opret annonce</span></button>
              <div class="mp-action-secondary-row">
                <button class="mp-action-secondary" onclick="openProfileModal()" aria-label="Redigér profil">${svgEdit} <span class="mp-action-label">Redigér</span></button>
                <button class="mp-action-secondary mp-action-logout" onclick="logout()" aria-label="Log ud">${svgLogout} <span class="mp-action-label">Log ud</span></button>
              </div>
            </div>
          </div>

          <!-- Stats-grid -->
          <div class="mp-stats-grid">
            <div class="mp-stat-card" onclick="switchMyProfileTab('listings')" title="Mine annoncer">
              <div class="mp-stat-icon" style="color:var(--forest)">${svgBike}</div>
              <div class="mp-stat-num" id="mp-stat-active">–</div>
              <div class="mp-stat-label">Aktive annoncer</div>
              <div class="mp-stat-delta" style="color:var(--forest)" id="mp-stat-active-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" title="Visninger">
              <div class="mp-stat-icon" style="color:var(--rust)">${svgEye}</div>
              <div class="mp-stat-num" id="mp-stat-views">–</div>
              <div class="mp-stat-label">Visninger i alt</div>
              <div class="mp-stat-delta" style="color:var(--rust)" id="mp-stat-views-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" onclick="switchMyProfileTab('saved')" title="Gemte annoncer">
              <div class="mp-stat-icon" style="color:var(--forest)">${svgHeart}</div>
              <div class="mp-stat-num" id="mp-stat-saved">–</div>
              <div class="mp-stat-label">Gemte cykler</div>
              <div class="mp-stat-delta" style="color:var(--forest)" id="mp-stat-saved-delta">Henter…</div>
            </div>
            <div class="mp-stat-card" onclick="switchMyProfileTab('trades')" title="Handler">
              <div class="mp-stat-icon" style="color:var(--forest-light)">${svgShake}</div>
              <div class="mp-stat-num" id="mp-stat-trades">–</div>
              <div class="mp-stat-label">Handler afsluttet</div>
              <div class="mp-stat-delta" style="color:var(--forest-light)" id="mp-stat-trades-delta">Henter…</div>
            </div>
          </div>

          <!-- Forhandler leads-banner (vises kun for dealers) -->
          ${isDealer ? `
          <div class="mp-dealer-banner" id="mp-dealer-banner">
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-leads">–</div>
              <div class="mp-dealer-banner-label">Nye leads (7 dage)</div>
            </div>
            <div class="mp-dealer-banner-divider"></div>
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-topviews">–</div>
              <div class="mp-dealer-banner-label">Visninger på topcykel</div>
            </div>
            <div class="mp-dealer-banner-divider"></div>
            <div class="mp-dealer-banner-stat">
              <div class="mp-dealer-banner-num" id="mp-dealer-respond">–</div>
              <div class="mp-dealer-banner-label">Ubesvarede tråde</div>
            </div>
          </div>` : ''}

          <!-- Insight-banner (vises kun når vi har data) -->
          <div class="mp-insight" id="mp-insight" style="display:none"></div>

          <!-- Tabs + indhold -->
          <div class="mp-tabs-panel">
            <div class="mp-tabs">
              <button class="mp-tab active" data-tab="listings" onclick="switchMyProfileTab('listings')">
                Mine annoncer <span class="mp-tab-count active" id="mp-count-listings">–</span>
              </button>
              <button class="mp-tab" data-tab="saved" onclick="switchMyProfileTab('saved')">
                Gemte <span class="mp-tab-count" id="mp-count-saved">–</span>
              </button>
              <button class="mp-tab" data-tab="searches" onclick="switchMyProfileTab('searches')">
                Søgninger <span class="mp-tab-count" id="mp-count-searches">–</span>
              </button>
              <button class="mp-tab" data-tab="trades" onclick="switchMyProfileTab('trades')">
                Handler <span class="mp-tab-count" id="mp-count-trades">–</span>
              </button>
            </div>
            <div id="mp-panel-listings" class="mp-tab-panel">
              <div id="mp-listings-grid"><p style="color:var(--muted);padding:20px 0">Henter annoncer…</p></div>
            </div>
            <div id="mp-panel-saved" class="mp-tab-panel" style="display:none;">
              <div id="mp-saved-grid"><p style="color:var(--muted);padding:20px 0">Henter gemte…</p></div>
            </div>
            <div id="mp-panel-searches" class="mp-tab-panel" style="display:none;">
              <div id="mp-searches-list"><p style="color:var(--muted);padding:20px 0">Henter søgninger…</p></div>
            </div>
            <div id="mp-panel-trades" class="mp-tab-panel" style="display:none;">
              <div id="mp-trades-list"><p style="color:var(--muted);padding:20px 0">Henter handler…</p></div>
            </div>
          </div>
        </div>

        <!-- Sidebar (kun desktop, kun hvis indhold) -->
        <aside class="mp-sidebar"${!hasSidebarContent ? ' style="display:none"' : ''}>
          <!-- Profil-komplethed (kun hvis ikke 100%) -->
          ${pct < 100 ? `
          <div class="mp-completion-card">
            <div class="mp-completion-title">Profil ${pct}% komplet</div>
            <div class="mp-completion-sub">Tilføj de sidste detaljer for flere henvendelser.</div>
            <div class="mp-completion-bar">
              <div class="mp-completion-fill" style="width:${pct}%"></div>
            </div>
            ${completionItems.map(x => `
              <div class="mp-completion-item">
                <span class="mp-completion-check${x.done ? ' done' : ''}">${x.done ? '✓' : ''}</span>
                <span style="${x.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${x.label}</span>
              </div>`).join('')}
            ${!u?.email_confirmed_at ? `<button class="mp-completion-cta" onclick="openProfileModal()">Bekræft e-mail →</button>` : ''}
          </div>` : ''}

          ${isDealer && !p.verified ? `
          <div class="mp-pending-card">
            <div class="mp-pending-icon">⏳</div>
            <div class="mp-pending-body">
              <div class="mp-pending-title">Ansøgning afventer godkendelse</div>
              <div class="mp-pending-sub">Vi gennemgår din ansøgning og vender tilbage hurtigst muligt.</div>
            </div>
          </div>` : ''}

        </aside>
      </div>
     </div>
    </div>`;
}

function switchMyProfileTab(tab) {
  document.querySelectorAll('.mp-tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    const count = btn.querySelector('.mp-tab-count');
    if (count) count.classList.toggle('active', on);
  });
  ['listings', 'saved', 'searches', 'trades'].forEach(t => {
    const panel = document.getElementById(`mp-panel-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'listings') loadMyListings('mp-listings-grid');
  if (tab === 'saved')    loadSavedListings('mp-saved-grid');
  if (tab === 'searches') loadSavedSearches('mp-searches-list');
  if (tab === 'trades')   loadTradeHistory('mp-trades-list');
}

async function loadProfileStats() {
  if (!currentUser) return;
  const svgTrend = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgBulb  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5V15a1 1 0 001 1h6a1 1 0 001-1v-1.5A6 6 0 0012 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const svgChev  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  try {
    const [bikesRes, savedRes, searchesRes, tradesRes] = await Promise.all([
      supabase.from('bikes').select('id, brand, model, views, is_active, created_at, bike_images(id)').eq('user_id', currentUser.id),
      supabase.from('saved_bikes').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id),
      supabase.from('saved_searches').select('id, name, filters, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
      supabase.from('messages').select('bike_id').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).ilike('content', '%accepteret%'),
    ]);

    const bikes       = bikesRes.data || [];
    const activeBikes = bikes.filter(b => b.is_active);
    const totalViews  = bikes.reduce((s, b) => s + (b.views || 0), 0);
    const savedCount  = savedRes.count || 0;
    const searches    = searchesRes.data || [];
    const tradesCount = new Set((tradesRes.data || []).map(m => m.bike_id)).size;

    // Stats cards
    const activeEl = document.getElementById('mp-stat-active');
    if (activeEl) activeEl.textContent = activeBikes.length;
    const viewsEl = document.getElementById('mp-stat-views');
    if (viewsEl) viewsEl.textContent = totalViews.toLocaleString('da-DK');
    const savedEl = document.getElementById('mp-stat-saved');
    if (savedEl) savedEl.textContent = savedCount;
    const tradesEl = document.getElementById('mp-stat-trades');
    if (tradesEl) tradesEl.textContent = tradesCount;

    const activeDelta = document.getElementById('mp-stat-active-delta');
    if (activeDelta) activeDelta.textContent = activeBikes.length === 1 ? '1 live nu' : `${activeBikes.length} live nu`;
    const viewsDelta = document.getElementById('mp-stat-views-delta');
    if (viewsDelta) viewsDelta.textContent = totalViews > 0 ? `${totalViews.toLocaleString('da-DK')} totalt` : 'Ingen endnu';
    const savedDelta = document.getElementById('mp-stat-saved-delta');
    if (savedDelta) savedDelta.textContent = savedCount > 0 ? `${savedCount} favoritter` : 'Ingen endnu';

    // Tab count badges
    const countListings = document.getElementById('mp-count-listings');
    if (countListings) countListings.textContent = bikes.length;
    const countSaved = document.getElementById('mp-count-saved');
    if (countSaved) countSaved.textContent = savedCount;
    const countSearches = document.getElementById('mp-count-searches');
    if (countSearches) countSearches.textContent = searches.length;
    const countTrades = document.getElementById('mp-count-trades');
    if (countTrades) countTrades.textContent = tradesCount;

    // Trades delta
    const tradesDelta = document.getElementById('mp-stat-trades-delta');
    if (tradesDelta) tradesDelta.textContent = tradesCount > 0 ? (tradesCount === 1 ? '1 gennemført' : `${tradesCount} gennemførte`) : 'Ingen endnu';

    // Forhandler-banner stats (kun hvis bruger er dealer)
    if (currentProfile?.seller_type === 'dealer') {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const [recentMsgsRes, allReceivedRes, allSentRes] = await Promise.all([
          supabase.from('messages').select('id', { count: 'exact', head: true })
            .eq('receiver_id', currentUser.id).gte('created_at', sevenDaysAgo),
          supabase.from('messages').select('id, bike_id, sender_id, created_at')
            .eq('receiver_id', currentUser.id).order('created_at', { ascending: false }).limit(200),
          supabase.from('messages').select('bike_id, sender_id, created_at')
            .eq('sender_id', currentUser.id).order('created_at', { ascending: false }).limit(200),
        ]);

        const leadsEl = document.getElementById('mp-dealer-leads');
        if (leadsEl) leadsEl.textContent = (recentMsgsRes.count || 0).toString();

        const topViewedBike = [...activeBikes].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
        const topViewsEl = document.getElementById('mp-dealer-topviews');
        if (topViewsEl) topViewsEl.textContent = (topViewedBike?.views || 0).toLocaleString('da-DK');

        // Ubesvarede tråde: indgående beskeder hvor sælger ikke har svaret bagefter på samme bike+sender
        const received = allReceivedRes.data || [];
        const sent     = allSentRes.data || [];
        const unanswered = received.filter(rm => {
          return !sent.some(sm =>
            sm.bike_id === rm.bike_id &&
            new Date(sm.created_at) > new Date(rm.created_at)
          );
        });
        // Tæl unikke (bike_id + sender_id)-tråde
        const unansweredKeys = new Set(unanswered.map(m => `${m.bike_id}|${m.sender_id}`));
        const respondEl = document.getElementById('mp-dealer-respond');
        if (respondEl) respondEl.textContent = unansweredKeys.size.toString();
      } catch (e) {
        console.error('Dealer banner stats fejl:', e);
      }
    }

    // Insight banner: most-viewed active listing
    const topBike = [...activeBikes].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
    const insightEl = document.getElementById('mp-insight');
    if (insightEl && topBike && (topBike.views || 0) > 0) {
      const imgCount  = (topBike.bike_images || []).length;
      const MAX_IMGS  = 8;
      const daysOld   = topBike.created_at ? Math.floor((Date.now() - new Date(topBike.created_at)) / 86400000) : 0;

      // Prioritised tips: most impactful first
      let tip;
      if (imgCount < MAX_IMGS) {
        const missing = MAX_IMGS - imgCount;
        tip = `Tilføj ${missing} ${missing === 1 ? 'billede mere' : 'billeder mere'} for at øge synligheden`;
      } else if (daysOld >= 21) {
        tip = `Annoncen er ${daysOld} dage gammel — overvej at justere prisen`;
      } else {
        tip = `Del annoncen med venner for at nå flere potentielle købers`;
      }

      insightEl.innerHTML = `
        <div class="mp-insight-icon">${svgTrend}</div>
        <div class="mp-insight-body">
          <div class="mp-insight-title">
            ${esc(topBike.brand)} ${esc(topBike.model)} har fået
            <span style="color:var(--rust-light)">${(topBike.views || 0).toLocaleString('da-DK')} visninger</span>
          </div>
          <div class="mp-insight-sub">${svgBulb} ${tip}</div>
        </div>
        <button class="mp-insight-cta" onclick="openEditModal('${topBike.id}')">Redigér ${svgChev}</button>
      `;
      insightEl.style.display = '';
    }

  } catch (e) {
    console.error('loadProfileStats fejl:', e);
  }
}

// SPA navigation helper — pushState + route handling
function navigateTo(path) {
  document.body.classList.remove('on-sell-page');
  history.pushState({}, '', path);
  handleRoute();
}

function handleRoute() {
  document.body.classList.remove('is-mp-mobile');
  document.body.classList.remove('map-page-view');
  const path = window.location.pathname;
  const bikeMatch    = path.match(/^\/bike\/([^/]+)$/);
  const profileMatch = path.match(/^\/profile\/([^/]+)$/);
  const dealerMatch  = path.match(/^\/dealer\/([^/]+)$/);
  const meMatch      = path === '/me';
  const sellMatch    = path === '/sell';
  const inboxMatch   = path === '/inbox';
  const dealerApply  = path === '/bliv-forhandler';
  const dealersMatch = path === '/forhandlere';
  const mapPageMatch = path === '/kort';
  const staticMatch  = { '/om-os': 'about', '/vilkaar': 'terms', '/privatlivspolitik': 'privacy', '/kontakt': 'contact', '/guide/tjek-brugt-cykel': 'guide-tjek' }[path];
  if (staticMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderStaticPage(staticMatch);
  } else if (dealerApply) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderBecomeDealerPage();
  } else if (dealersMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderDealersPage();
  } else if (mapPageMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.body.classList.add('map-page-view');
    renderMapPage();
  } else if (inboxMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderInboxPage();
  } else if (meMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderMyProfilePage();
  } else if (sellMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderSellPage();
  } else if (bikeMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderBikePage(bikeMatch[1]);
  } else if (profileMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderUserProfilePage(profileMatch[1]);
  } else if (dealerMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    renderDealerProfilePage(dealerMatch[1]);
  } else {
    showListingView();
  }
}

window.addEventListener('popstate', handleRoute);

function navigateToBike(bikeId) {
  navigateTo(`/bike/${bikeId}`);
}

/* ============================================================
   SIDEBAR FILTRE
   ============================================================ */

function toggleSidebarSection(header) {
  const box = header.closest('.sidebar-box');
  const expanded = box.classList.toggle('collapsed');
  header.setAttribute('aria-expanded', !expanded);
}

function applyFilters() {
  // Sælgertype — hvis "alle" er checket, ignorer de andre
  const sellerAll     = document.querySelector('[data-filter="seller"][data-value="all"]');
  const sellerDealer  = document.querySelector('[data-filter="seller"][data-value="dealer"]');
  const sellerPrivate = document.querySelector('[data-filter="seller"][data-value="private"]');

  // Hvis "Alle sælgere" klikkes på, fjern de andre
  if (sellerAll?.checked) {
    if (sellerDealer)  sellerDealer.checked  = false;
    if (sellerPrivate) sellerPrivate.checked = false;
  }
  // Hvis en specifik sælger vælges, fjern "alle"
  if ((sellerDealer?.checked || sellerPrivate?.checked) && sellerAll?.checked) {
    sellerAll.checked = false;
  }

  // Saml valgte typer
  const types = [...document.querySelectorAll('[data-filter="type"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte stande
  const conditions = [...document.querySelectorAll('[data-filter="condition"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte hjulstørrelser
  const wheelSizes = [...document.querySelectorAll('[data-filter="wheel"]:checked')]
    .map(el => el.dataset.value);

  // Pris
  const minPrice = parseInt(document.querySelector('.price-range input:first-of-type')?.value) || null;
  const maxPrice = parseInt(document.querySelector('.price-range input:last-of-type')?.value) || null;

  // Sælgertype
  let sellerType = null;
  if (sellerDealer?.checked && !sellerPrivate?.checked) sellerType = 'dealer';
  if (sellerPrivate?.checked && !sellerDealer?.checked) sellerType = 'private';

  debouncedLoadFilters({ types, conditions, minPrice, maxPrice, sellerType, wheelSizes });
}

const debouncedLoadFilters = debounce(
  (args) => loadBikesWithFilters(args),
  300
);

let filterOffset       = 0;
let currentFilterArgs  = null;



/* ============================================================
   MOBIL FILTER DRAWER
   ============================================================ */

function openMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.add('open');
  document.getElementById('mobile-filter-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.remove('open');
  document.getElementById('mobile-filter-overlay').classList.remove('open');
  document.body.style.overflow = '';
}


/* ============================================================
   NULSTIL ADGANGSKODE – håndter token fra email-link
   ============================================================ */

async function handleResetPassword() {
  const pw1 = document.getElementById('reset-pw1').value;
  const pw2 = document.getElementById('reset-pw2').value;

  if (!pw1 || pw1.length < 6) { showToast('⚠️ Adgangskode skal være mindst 6 tegn'); return; }
  if (pw1 !== pw2)             { showToast('⚠️ Adgangskoderne matcher ikke'); return; }

  const btn = document.querySelector('[onclick="handleResetPassword()"]');
  const originalText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Opdaterer...'; }

  try {
    // Luk modal omgående for at vise fraktion
    document.getElementById('reset-modal').classList.remove('open');
    document.body.style.overflow = '';

    // Opdater password med timeout (10 sec)
    const updatePromise = supabase.auth.updateUser({ password: pw1 });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 10000)
    );

    await Promise.race([updatePromise, timeoutPromise]);

    history.replaceState(null, '', window.location.pathname);
    showToast('✅ Adgangskode opdateret! Du er nu logget ind.');
  } catch (error) {
    // Åben modal igen hvis der var fejl
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
    showToast('❌ Kunne ikke opdatere adgangskode');
    console.error(error);
  }
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', window.location.pathname);
}

// Lyt efter PASSWORD_RECOVERY event fra Supabase
supabase.auth.onAuthStateChange((_event, session) => {
  if (_event === 'PASSWORD_RECOVERY') {
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
});
/* ============================================================
   INDBAKKE
   ============================================================ */

const {
  renderMessages,
  loadInbox, openThread, closeThread,
  acceptBid, sendReply,
  openInboxModal, closeInboxModal,
  renderInboxPage, loadInboxPage, loadInboxModal,
  openInboxThread, closeInboxThread,
  updateInboxBadge,
} = createInbox({
  supabase, showToast, esc, safeAvatarUrl, getInitials,
  retryHTML, btnLoading, updateSEOMeta,
  renderQuickRepliesHTML,
  getCurrentUser:    () => currentUser,
  getCurrentProfile: () => currentProfile,
  showDetailView,
  showListingView,
  navigateTo:        (...args) => navigateTo(...args),
  openLoginModal:    () => openLoginModal(),
  openRateModal:     (...args) => openRateModal(...args),
  loadBikes:         (...args) => loadBikes(...args),
  updateFilterCounts: (...args) => updateFilterCounts(...args),
  getPendingInboxThread:   () => _pendingInboxThread,
  clearPendingInboxThread: () => { _pendingInboxThread = null; },
});

window.loadInbox          = loadInbox;
window.openThread         = openThread;
window.closeThread        = closeThread;
window.sendReply          = sendReply;
window.acceptBid          = acceptBid;
window.openInboxModal     = openInboxModal;
window.closeInboxModal    = closeInboxModal;
window.openInboxThread    = openInboxThread;
window.closeInboxThread   = closeInboxThread;
window.loadInboxModal     = loadInboxModal;
window.loadInboxPage      = loadInboxPage;
window.renderInboxPage    = renderInboxPage;

/* ============================================================
   REAL-TIME NOTIFIKATIONER
   ============================================================ */

const { startRealtimeNotifications, stopRealtimeNotifications } = createRealtimeNotifications({
  supabase,
  getCurrentUser: () => currentUser,
  updateInboxBadge,
  showToast,
  loadInboxPage,
});

window.startRealtimeNotifications = startRealtimeNotifications;
window.updateInboxBadge           = updateInboxBadge;


/* ============================================================
   BLIV FORHANDLER MODAL
   ============================================================ */

function openBecomeDealerModal() {
  return openBecomeDealerPage(navigateTo);
}

function closeBecomeDealerModal() {
  return closeBecomeDealerModalCompat();
}

function selectDealerPlan(btn) {
  return selectDealerPlanButton(btn);
}

let _dealersPageData  = [];   // [{ dealer, bikeCount, avgRating, ratingCount, distKm }]
let _dealerGPSActive  = false;
let _dealerGPSCoords  = null;

async function renderDealersPage() {
  showDetailView();
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Forhandlere – Cykelbørsen';
  updateSEOMeta('Alle verificerede cykelforhandlere på Cykelbørsen. Køb med tryghed — garanti, servicehistorik og professionel rådgivning.', '/forhandlere');
  _dealersPageData = [];
  _dealerGPSActive = false;
  _dealerGPSCoords = null;

  document.getElementById('detail-view').innerHTML = `
    <div class="dealers-page">
      <div class="dealers-page-header">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
        <h1 class="dealers-page-title">Autoriserede forhandlere</h1>
        <p class="dealers-page-subtitle">Køb med tryghed fra verificerede cykelforhandlere — alle med garanti, servicehistorik og professionel rådgivning.</p>
        <button class="btn-become-dealer" onclick="navigateTo('/bliv-forhandler')">🏪 Bliv forhandler</button>
      </div>
      <div class="dealers-toolbar">
        <button class="dealers-gps-btn" id="dealers-gps-btn" onclick="toggleDealerGPS()">📍 Brug min position</button>
        <select class="dealers-sort-sel" id="dealers-sort" onchange="sortAndRenderDealers()">
          <option value="bikes">Flest cykler</option>
          <option value="nearest">Tættest</option>
          <option value="rating">Bedste rating</option>
        </select>
      </div>
      <div id="dealers-page-grid" class="dealer-cards">
        <p style="color:var(--muted);padding:40px 0;text-align:center;grid-column:1/-1;">Henter forhandlere...</p>
      </div>
    </div>`;

  const [dealerRes, bikeRes, reviewRes] = await Promise.all([
    supabase.from('profiles').select('id, shop_name, city, address, name, avatar_url, lat, lng, location_precision').eq('seller_type', 'dealer').eq('verified', true).order('created_at', { ascending: true }),
    supabase.from('bikes').select('user_id').eq('is_active', true),
    supabase.from('reviews').select('reviewed_user_id, rating'),
  ]);

  const grid = document.getElementById('dealers-page-grid');
  if (!grid) return;

  const dealers  = dealerRes.data  || [];
  const bikeRows = bikeRes.data    || [];
  const reviews  = reviewRes.data  || [];

  if (dealerRes.error || dealers.length === 0) {
    grid.className = 'dealer-cards dealer-empty-state';
    grid.innerHTML = `
      <div class="dealer-empty-card">
        <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
        <h3>Ingen forhandlere endnu</h3>
        <p>Vær den første forhandler på Cykelbørsen og nå tusindvis af cykelkøbere.</p>
        <button class="btn-become-dealer-small" onclick="navigateTo('/bliv-forhandler')">Tilmeld din butik →</button>
      </div>`;
    return;
  }

  const dealerIdSet = new Set(dealers.map(d => d.id));

  const countMap = {};
  for (const b of bikeRows) {
    if (dealerIdSet.has(b.user_id)) countMap[b.user_id] = (countMap[b.user_id] || 0) + 1;
  }

  const ratingSum = {}, ratingCount = {};
  for (const r of reviews) {
    if (dealerIdSet.has(r.reviewed_user_id) && r.rating) {
      ratingSum[r.reviewed_user_id]   = (ratingSum[r.reviewed_user_id]   || 0) + r.rating;
      ratingCount[r.reviewed_user_id] = (ratingCount[r.reviewed_user_id] || 0) + 1;
    }
  }

  _dealersPageData = dealers.map(dealer => ({
    dealer,
    bikeCount:   countMap[dealer.id]   || 0,
    avgRating:   ratingCount[dealer.id] ? ratingSum[dealer.id] / ratingCount[dealer.id] : null,
    ratingCount: ratingCount[dealer.id] || 0,
    distKm:      null,
  }));

  window._allDealers     = dealers;
  window._dealerCountMap = countMap;

  sortAndRenderDealers();
}

async function toggleDealerGPS() {
  const btn = document.getElementById('dealers-gps-btn');
  if (_dealerGPSActive) {
    _dealerGPSActive = false;
    _dealerGPSCoords = null;
    _dealersPageData.forEach(d => d.distKm = null);
    if (btn) { btn.classList.remove('active'); btn.textContent = '📍 Brug min position'; }
    sortAndRenderDealers();
    return;
  }
  if (!navigator.geolocation) { showToast('⚠️ GPS er ikke tilgængeligt'); return; }
  if (btn) { btn.textContent = '📍 Henter position...'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(async pos => {
    _dealerGPSCoords = [pos.coords.latitude, pos.coords.longitude];
    _dealerGPSActive = true;
    if (btn) { btn.classList.add('active'); btn.textContent = '📍 Position aktiv'; btn.disabled = false; }
    showToast('📍 Beregner afstande...');
    // Geocode alle forhandlere
    await Promise.all(_dealersPageData.map(async d => {
      const { dealer } = d;
      let coords = null;
      if (dealer.lat && dealer.lng)              coords = [dealer.lat, dealer.lng];
      else if (dealer.address && dealer.city)    coords = await geocodeAddress(dealer.address, dealer.city);
      if (!coords && dealer.city)                coords = await geocodeCity(dealer.city);
      d.distKm = coords ? haversineKm(_dealerGPSCoords, coords) : null;
    }));
    // Skift sortering til "Tættest" automatisk
    const sel = document.getElementById('dealers-sort');
    if (sel) sel.value = 'nearest';
    sortAndRenderDealers();
  }, () => {
    showToast('❌ Kunne ikke hente position — tjek tilladelser');
    if (btn) { btn.textContent = '📍 Brug min position'; btn.disabled = false; }
  });
}

function sortAndRenderDealers() {
  const sort = document.getElementById('dealers-sort')?.value || 'bikes';
  const data = [..._dealersPageData];

  if (sort === 'nearest') {
    const withDist  = data.filter(d => d.distKm !== null).sort((a, b) => a.distKm - b.distKm);
    const withoutDist = data.filter(d => d.distKm === null).sort((a, b) => b.bikeCount - a.bikeCount);
    _dealersPageData.splice(0, _dealersPageData.length, ...withDist, ...withoutDist);
  } else if (sort === 'rating') {
    data.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
    _dealersPageData.splice(0, _dealersPageData.length, ...data);
  } else {
    data.sort((a, b) => b.bikeCount - a.bikeCount);
    _dealersPageData.splice(0, _dealersPageData.length, ...data);
  }

  const grid = document.getElementById('dealers-page-grid');
  if (!grid) return;
  grid.className = 'dealer-cards';
  grid.innerHTML = _dealersPageData.map(({ dealer, bikeCount, avgRating, ratingCount, distKm }) =>
    buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm)
  ).join('');
}

function buildDealerCardFull(dealer, bikeCount, avgRating, ratingCount, distKm) {
  const displayName  = dealer.shop_name || dealer.name || 'Forhandler';
  const initials     = getInitials(displayName);
  const locationText = dealer.address && dealer.city
    ? `${dealer.address}, ${dealer.city}`
    : dealer.city || '';

  const distHtml = distKm !== null
    ? `<span class="dealer-dist-badge">${formatDistance(distKm)}</span>`
    : '';

  const starsHtml = avgRating !== null
    ? `<div class="dealer-rating">
        <span class="dealer-stars">${renderStars(avgRating)}</span>
        <span class="dealer-rating-num">${avgRating.toFixed(1)} <span style="color:var(--muted);font-weight:400;">(${ratingCount})</span></span>
       </div>`
    : '';

  const mapsHtml = (dealer.address && dealer.city)
    ? `<a class="dealer-maps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dealer.address + ', ' + dealer.city)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Åbn i Google Maps">
         <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         Google Maps
       </a>`
    : '';

  return `
    <div class="dealer-card" onclick="navigateToDealer('${dealer.id}')" style="cursor:pointer;" title="Se ${esc(displayName)}s profil">
      <div class="dealer-card-top">
        <div class="dealer-logo-circle">${initials}</div>
        ${distHtml}
      </div>
      <div class="dealer-name">${esc(displayName)} <span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></div>
      ${locationText ? `<div class="dealer-city">📍 ${esc(locationText)}</div>` : ''}
      ${starsHtml}
      <div class="dealer-count">${bikeCount} ${bikeCount === 1 ? 'cykel' : 'cykler'} til salg</div>
      ${mapsHtml}
    </div>`;
}

function renderStars(avg) {
  const full = Math.floor(avg);
  const half = avg - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function renderBecomeDealerPage() {
  showDetailView();
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.title = 'Bliv forhandler – Cykelbørsen';
  updateSEOMeta('Bliv forhandler på Cykelbørsen. Nå cykellkøbere i hele Danmark. Helt gratis — ingen binding.', '/bliv-forhandler');

  const isLoggedIn = !!currentUser;
  const isAlreadyDealer = isLoggedIn && currentProfile?.seller_type === 'dealer';

  if (isAlreadyDealer) {
    document.getElementById('detail-view').innerHTML = `
      <div class="bd-page">
        <div class="bd-page-header">
          <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
          <h1 class="bd-page-title">Du er allerede forhandler</h1>
          <p class="bd-page-subtitle">Din butiksprofil er aktiv på Cykelbørsen</p>
        </div>
        <div style="text-align:center;padding:32px 0;">
          <button class="form-submit" onclick="navigateTo('/min-profil')" style="width:auto;padding:14px 32px;">Se min profil →</button>
        </div>
      </div>`;
    return;
  }

  document.getElementById('detail-view').innerHTML = `
    <div class="bd-page">
      <div class="bd-page-header">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Tilbage</button>
        <h1 class="bd-page-title">Bliv forhandler</h1>
        <p class="bd-page-subtitle">Få din cykelbutik på Danmarks dedikerede cykelmarkedsplads</p>
      </div>

      <div class="bd-trial-banner">
        🎉 <strong>Gratis for forhandlere</strong> — opret din butiksprofil uden binding eller betaling.
      </div>

      <div class="bd-perks">
        <div class="bd-perk">✅ <span>Ubegrænset antal annoncer</span></div>
        <div class="bd-perk">✅ <span>Verificeret forhandler-badge</span></div>
        <div class="bd-perk">✅ <span>Direkte beskeder fra købere</span></div>
        <div class="bd-perk">✅ <span>Prioriteret placering i søgning</span></div>
        <div class="bd-perk">✅ <span>100% gratis — ingen kreditkort</span></div>
      </div>

      <div class="bd-form">
        <h3 class="bd-form-title">Butiksinformation</h3>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>Butiksnavn *</label><input type="text" id="dealer-shop-name" placeholder="f.eks. VeloShop ApS" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>CVR-nummer *</label><input type="text" id="dealer-cvr" placeholder="f.eks. 12345678" maxlength="8" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Kontaktperson *</label><input type="text" id="dealer-contact" placeholder="Dit fulde navn" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Telefon</label><input type="text" id="dealer-phone" placeholder="f.eks. 12 34 56 78" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Adresse *</label><input type="text" id="dealer-address" placeholder="Start med at skrive gadenavn…" autocomplete="off"></div>
          <div class="form-group"><label>By</label><input type="text" id="dealer-city" placeholder="Udfyldes automatisk" autocomplete="off"></div>
        </div>
        <p class="bd-auth-note" style="margin:-4px 0 0;">📍 Vælg din præcise butiks-adresse fra listen — så vises butikken korrekt på kortet.</p>

        ${!isLoggedIn ? `
        <div class="bd-form-divider">
          <span>Din forhandlerkonto</span>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>Email *</label><input type="email" id="dealer-email" placeholder="din@butik.dk" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
          <div class="form-group"><label>Adgangskode *</label><input type="password" id="dealer-password" placeholder="Min. 6 tegn" onkeydown="if(event.key==='Enter')submitDealerApplication()"></div>
        </div>
        <p class="bd-auth-note">Vi opretter automatisk en forhandlerkonto med din email. Tjek din indbakke for at bekræfte.</p>
        ` : `
        <div class="bd-form-divider"><span>Logget ind som ${esc(currentProfile?.name || currentUser?.email || '')}</span></div>
        <input type="hidden" id="dealer-email" value="${esc(currentUser?.email || '')}">
        `}

        <button class="form-submit" id="dealer-submit-btn" onclick="submitDealerApplication()" style="margin-top:20px;">Opret forhandler-profil →</button>
        <p style="font-size:.75rem;color:var(--muted);text-align:center;margin-top:10px;">
          Gratis at oprette — ingen binding, ingen kreditkort.
        </p>
      </div>
    </div>`;

  // Kobl adresse-autocomplete: ved valg udfyldes by automatisk
  const dealerAddressInput = document.getElementById('dealer-address');
  const dealerCityInput    = document.getElementById('dealer-city');
  if (dealerAddressInput) {
    attachAddressAutocomplete(dealerAddressInput, (picked) => {
      if (dealerCityInput && picked.city) {
        dealerCityInput.value = picked.city;
        dealerCityInput.dataset.dawaLat = String(picked.lat);
        dealerCityInput.dataset.dawaLng = String(picked.lng);
      }
    });
  }
}

async function submitDealerApplication() {
  const shopName = (document.getElementById('dealer-shop-name')?.value || '').trim();
  const cvr      = (document.getElementById('dealer-cvr')?.value || '').trim();
  const contact  = (document.getElementById('dealer-contact')?.value || '').trim();
  const phone    = (document.getElementById('dealer-phone')?.value || '').trim();
  const addressInput = document.getElementById('dealer-address');
  const cityInput    = document.getElementById('dealer-city');
  const address  = (addressInput?.value || '').trim();
  const city     = (cityInput?.value || '').trim();
  const addrData = readDawaData(addressInput);
  const email    = (document.getElementById('dealer-email')?.value || '').trim();
  const password = (document.getElementById('dealer-password')?.value || '').trim();

  if (!shopName || !cvr || !contact) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }
  if (!address || !addrData.lat || !addrData.lng) {
    showToast('⚠️ Vælg din butiks-adresse fra listen så kortet viser jer korrekt'); return;
  }

  const restore = btnLoading('dealer-submit-btn', 'Opretter profil...');

  let userId = currentUser?.id;

  if (!currentUser) {
    if (!email || !password) {
      restore();
      showToast('⚠️ Udfyld email og adgangskode'); return;
    }
    if (password.length < 6) {
      restore();
      showToast('⚠️ Adgangskoden skal være mindst 6 tegn'); return;
    }

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name:           contact,
          pending_dealer: true,
          shop_name:      shopName,
          cvr:            cvr,
          phone:          phone,
          address:        address,
          city:           city,
          lat:            addrData.lat,
          lng:            addrData.lng,
          postcode:       addrData.postcode,
        },
      },
    });

    if (signUpErr) {
      restore();
      if (signUpErr.message?.includes('already registered')) {
        showToast('⚠️ E-mailen er allerede i brug — log ind i stedet');
      } else {
        showToast('❌ ' + (signUpErr.message || 'Kunne ikke oprette konto'));
      }
      return;
    }

    userId = signUpData.user?.id;
    if (!userId) { restore(); showToast('❌ Noget gik galt – prøv igen'); return; }

    // Ny bruger: forhandlerdata er i user_metadata, init() fuldfører setup efter email-bekræftelse
    restore();
    document.getElementById('detail-view').innerHTML = `
      <div class="bd-page">
        <div class="bd-page-header">
          <h1 class="bd-page-title">Tjek din indbakke</h1>
          <p class="bd-page-subtitle">Vi har sendt en bekræftelsesmail til <strong>${esc(email)}</strong>.<br>Klik på linket i mailen for at aktivere din forhandlerkonto.</p>
        </div>
        <div style="text-align:center;padding:32px 0;font-size:3rem;">📬</div>
      </div>`;
    return;
  }

  // Eksisterende bruger: opret ansøgning med verified=false (afventer admin-godkendelse)
  const { error } = await supabase.from('profiles').update({
    shop_name:          shopName,
    cvr:                cvr,
    phone:              phone,
    address:            address,
    city:               city,
    lat:                addrData.lat,
    lng:                addrData.lng,
    postcode:           addrData.postcode,
    location_precision: 'exact',
    seller_type:        'dealer',
    verified:           false,
    name:               contact,
  }).eq('id', userId);

  restore();

  if (error) {
    showToast('❌ Noget gik galt – prøv igen');
    return;
  }

  if (currentProfile) {
    currentProfile.seller_type = 'dealer';
    currentProfile.verified    = false;
    currentProfile.shop_name   = shopName;
    currentProfile.city        = city;
  }

  supabase.functions.invoke('notify-message', {
    body: {
      type:      'dealer_application',
      shop_name: shopName,
      cvr:       cvr,
      contact:   contact,
      phone:     phone,
      address:   address,
      city:      city,
      email:     currentUser.email,
      user_id:   currentUser.id,
    },
  }).catch(() => {});

  showToast('✅ Ansøgning modtaget – vi vender tilbage hurtigst muligt!');
  navigateTo('/min-profil');
}

async function openSubscriptionPortal() {
  if (!currentUser) return;
  const restore = btnLoading('btn-manage-subscription', 'Åbner portal...');
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {
      user_id:    currentUser.id,
      return_url: window.location.origin + window.location.pathname,
    },
  });
  restore();
  if (error || data?.error) {
    showToast('❌ ' + (data?.error || 'Kunne ikke åbne abonnements-portal'));
    return;
  }
  window.location.href = data.url;
}

/* ============================================================
   GØR FUNKTIONER GLOBALE
   ============================================================ */

window.openModal         = openModal;
window.blockIfPendingDealer = blockIfPendingDealer;
window.closeModal        = closeModal;
window.selectType        = selectType;
window.submitListing     = submitListing;
window.openLoginModal    = openLoginModal;
window.signInWithGoogle  = signInWithGoogle;
window.closeLoginModal   = closeLoginModal;
window.switchTab         = switchTab;
window.handleLogin       = handleLogin;
window.handleRegister    = handleRegister;
window.handleForgotPassword = handleForgotPassword;
window.openProfileModal  = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.switchProfileTab     = switchProfileTab;
window.switchUserProfileTab  = switchUserProfileTab;
window.dismissOnboarding    = dismissOnboarding;
window.useQuickReply        = useQuickReply;
window.toggleNearMe         = toggleNearMe;
window.updateNearMeRadius   = updateNearMeRadius;
window.askIfAvailable       = askIfAvailable;
window.switchDealerProfileTab = switchDealerProfileTab;
window.saveProfile          = saveProfile;
window.onSellerTypeChange   = onSellerTypeChange;
window.uploadAvatar      = uploadAvatar;
window.deleteListing     = deleteListing;
window.togglePill        = togglePill;
window.toggleSave        = toggleSave;
window.removeSaved       = removeSaved;
window.saveCurrentSearch  = saveCurrentSearch;
window.applySavedSearch   = applySavedSearch;
window.deleteSavedSearch  = deleteSavedSearch;
window.loadTradeHistory   = loadTradeHistory;
window.showSection       = showSection;
window.logout                  = logout;
window.resendConfirmationEmail = resendConfirmationEmail;
window.dismissEmailBanner      = dismissEmailBanner;
window.deleteAccount          = deleteAccount;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.onDeleteConfirmInput   = onDeleteConfirmInput;
window.confirmDeleteAccount   = confirmDeleteAccount;
window.searchBikes       = searchBikes;
window.sortBikes         = sortBikes;
window.applyFilters           = applyFilters;
window.toggleSidebarSection   = toggleSidebarSection;
window.clearAllFilters        = clearAllFilters;
window.removeFilterPill       = removeFilterPill;
window.loadBikesWithFilters   = loadBikesWithFilters;
window.loadMoreFilteredBikes  = function() { loadBikesWithFilters(currentFilterArgs, true); };
window.openMobileFilter   = openMobileFilter;
window.closeMobileFilter  = closeMobileFilter;
window.closeResetModal    = closeResetModal;
window.handleResetPassword = handleResetPassword;
window.openEditModal          = openEditModal;
window.closeEditModal         = closeEditModal;
window.saveEditedListing      = saveEditedListing;
window.editPreviewImages      = editPreviewImages;
window.editSetExistingPrimary = editSetExistingPrimary;
window.editRemoveExisting     = editRemoveExisting;
window.editSetNewPrimary      = editSetNewPrimary;
window.editRemoveNew          = editRemoveNew;
window.previewImages      = previewImages;
window.setPrimary         = setPrimary;
window.removeImage        = removeImage;
window.renderSellPage            = renderSellPage;
window.submitSellPage            = submitSellPage;
window.previewSellImages         = previewSellImages;
window.setSellPrimary            = setSellPrimary;
window.removeSellImage           = removeSellImage;
window.openCropModal             = openCropModal;
window.closeCropModal            = closeCropModal;
window.applyCrop                 = applyCrop;
window.setCropRatio              = setCropRatio;
window.suggestListingFromImages  = suggestListingFromImages;
window.setSellStep               = setSellStep;
window.advanceSell               = advanceSell;
window.backSell                  = backSell;
window.closeListingSuccessModal  = closeListingSuccessModal;
window.openBikeModal      = openBikeModal;
window.navigateTo         = navigateTo;
window.navigateToBike     = navigateToBike;
window.navigateToProfile  = navigateToProfile;
window.navigateToDealer   = navigateToDealer;
window.navigateToMyProfile = navigateToMyProfile;
window.renderMyProfilePage = renderMyProfilePage;
window.switchMyProfileTab  = switchMyProfileTab;
window.renderBikePage     = renderBikePage;
window.renderUserProfilePage  = renderUserProfilePage;
window.renderDealerProfilePage = renderDealerProfilePage;
window.renderDealersPage       = renderDealersPage;
window.renderMapPage           = renderMapPage;
window.toggleMapNearMe         = toggleMapNearMe;
window.resetMapFilters         = resetMapFilters;
window.toggleMapFilterPanel    = toggleMapFilterPanel;
window.splitCardClick          = splitCardClick;
window.toggleSplitList         = toggleSplitList;
window.applyMapFilters         = applyMapFilters;
window.openMapFiltersSheet     = openMapFiltersSheet;
window.closeMapFiltersSheet    = closeMapFiltersSheet;
window.mapTabSwitch            = mapTabSwitch;
window.setView                 = setView;
window.locateUser              = locateUser;
window.openFromMap             = openFromMap;
window._openFromMap            = _openFromMap;
window.toggleDealerGPS        = toggleDealerGPS;
window.sortAndRenderDealers   = sortAndRenderDealers;
window.showDetailView     = showDetailView;
window.showListingView    = showListingView;
window.closeBikeModal     = closeBikeModal;
window.openReportModal    = openReportModal;
window.closeReportModal   = closeReportModal;
window.submitReport       = submitReport;
window.toggleBidBox       = toggleBidBox;
window.updateMeetMiddle   = updateMeetMiddle;
window.useMeetMiddle      = useMeetMiddle;
window.toggleMessageBox   = toggleMessageBox;
window.insertPresetMsg    = insertPresetMsg;
window.sendMessage        = sendMessage;
window.sendBid            = sendBid;
window.toggleSaveFromModal= toggleSaveFromModal;
window.loadInterestedUsers          = loadInterestedUsers;
window.startConversationWithLiker   = startConversationWithLiker;

/* ============================================================
   START
   ============================================================ */

// Fang uventede promise-fejl globalt så siden ikke sidder fast
window.addEventListener('unhandledrejection', event => {
  console.error('[Uhandteret fejl]', event.reason);
});

init();

window.openBecomeDealerModal   = openBecomeDealerModal;
window.openFooterModal         = openFooterModal;
window.closeFooterModal        = closeFooterModal;
window.submitContactForm       = submitContactForm;
window.closeBecomeDealerModal  = closeBecomeDealerModal;
window.submitDealerApplication = submitDealerApplication;
window.selectDealerPlan        = selectDealerPlan;
window.openSubscriptionPortal  = openSubscriptionPortal;

/* ============================================================
   FOOTER MODALER
   ============================================================ */


function renderStaticPage(type) {
  return renderStaticPageView(type, {
    footerContent,
    showListingView,
    showDetailView,
    updateSEOMeta,
    staticPageRoutes: STATIC_PAGE_ROUTES,
    navigateTo,
  });
}

function openFooterModal(type) { return _openFooterModal(type, navigateTo); }
function closeFooterModal() { return _closeFooterModal(); }
async function submitContactForm() { return _submitContactForm(showToast); }


/* ============================================================
   ADMIN PANEL
   ============================================================ */

const { openAdminPanel, closeAdminPanel, switchAdminTab } = createAdminPanelUI({
  loadDealerApplications,
  loadAllUsers,
  loadIdApplications,
});

async function loadDealerApplications() {
  var list = document.getElementById('admin-applications-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .eq('seller_type', 'dealer')
      .eq('verified', false)
      .order('created_at', { ascending: false });
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente ansøgninger.', 'loadDealerApplications');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.shop_name || p.name) + '</div>'
      + '<div class="admin-row-meta">'
      + (p.name ? p.name + ' · ' : '')
      + (p.email || '') + (p.cvr ? ' · CVR: ' + p.cvr : '')
      + (p.city ? ' · ' + p.city : '') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Godkend</button>'
      + '<button class="btn-reject" onclick="rejectDealer(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function loadAllUsers() {
  var list = document.getElementById('admin-users-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter brugere...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente brugere.', 'loadAllUsers');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen brugere fundet.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    var isVerified = p.verified;
    var isDealer   = p.seller_type === 'dealer';
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">'
      + (p.name || 'Ukendt')
      + (isVerified ? ' <span class="verified-badge">✓</span>' : '')
      + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (isDealer ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + (isDealer && !isVerified ? '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Verificer</button>' : '')
      + (isVerified ? '<button class="btn-reject" onclick="revokeDealer(\'' + p.id + '\')">Fjern verificering</button>' : '')
      + '</div></div>';
  }).join('');
}

async function approveDealer(userId) {
  var err = (await supabase.from('profiles').update({ verified: true }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke godkende forhandler'); return; }
  showToast('✅ Forhandler godkendt og verificeret!');
  loadDealerApplications();
  loadAllUsers();
}

async function rejectDealer(userId) {
  if (!confirm('Afvis denne ansøgning og fjern forhandlerstatus?')) return;
  var err = (await supabase.from('profiles').update({ seller_type: 'private', verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke afvise'); return; }
  showToast('🗑️ Ansøgning afvist');
  loadDealerApplications();
}

async function revokeDealer(userId) {
  if (!confirm('Fjern verificering fra denne forhandler?')) return;
  var err = (await supabase.from('profiles').update({ verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('Verificering fjernet');
  loadAllUsers();
}

window.openAdminPanel       = openAdminPanel;
window.closeAdminPanel      = closeAdminPanel;
window.switchAdminTab       = switchAdminTab;
window.approveDealer        = approveDealer;
window.rejectDealer         = rejectDealer;
window.revokeDealer         = revokeDealer;

/* ============================================================
   AUTOCOMPLETE SØGNING
   ============================================================ */

const { searchAutocomplete, selectAutocomplete, handleSearchKey, bindOutsideClickClose } = createSearchAutocompleteHandlers({
  supabase,
  esc,
  onSearchSubmit: searchBikes,
});

bindOutsideClickClose();

/* ============================================================
   SÆT SOM SOLGT
   ============================================================ */

const { toggleSold, showBuyerPickerModal, confirmBuyerSelection, markBikeSold } = createSoldActions({
  supabase,
  getCurrentUser: () => currentUser,
  showToast,
  reloadMyListings,
  loadBikes,
  updateFilterCounts,
  openUserProfileWithReview,
});


/* ============================================================
   DEL ANNONCE
   ============================================================ */

const {
  openShareModal,
  closeShareModal,
  copyShareLink,
  shareViaSMS,
  openNativeShare,
} = createShareActions({ showToast });


window.searchAutocomplete = searchAutocomplete;
window.selectAutocomplete = selectAutocomplete;
window.handleSearchKey    = handleSearchKey;
window.toggleSold             = toggleSold;
window.confirmBuyerSelection  = confirmBuyerSelection;
window.openShareModal     = openShareModal;
window.closeShareModal    = closeShareModal;
window.copyShareLink      = copyShareLink;
window.shareViaSMS        = shareViaSMS;
window.openNativeShare     = openNativeShare;


/* ============================================================
   VERIFICERING – E-MAIL
   ============================================================ */

function updateVerifyUI() {
  const u = currentUser;
  const p = currentProfile || {};

  // Skjul for forhandlere
  const verifyBox = document.getElementById('verify-box');
  if (verifyBox) verifyBox.style.display = p.seller_type === 'dealer' ? 'none' : 'block';

  // E-mail status
  const emailValue  = document.getElementById('verify-email-value');
  const emailStatus = document.getElementById('verify-email-status');
  if (emailValue && u?.email) emailValue.textContent = u.email;
  if (emailStatus) {
    if (u?.email_confirmed_at) {
      emailStatus.textContent = 'Verificeret';
      emailStatus.className   = 'verify-row-status verify-status-ok';
    } else {
      emailStatus.innerHTML   = '<button class="verify-action-btn" onclick="resendConfirmationEmail()">Bekræft</button>';
      emailStatus.className   = 'verify-row-status';
    }
  }
}

/* ── ADMIN: ID ANSØGNINGER ── */

async function loadIdApplications() {
  var list = document.getElementById('admin-id-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result;
  try {
    result = await supabase
      .from('profiles')
      .select('*')
      .eq('id_pending', true)
      .eq('id_verified', false);
  } catch (e) {
    list.innerHTML = retryHTML('Kunne ikke hente ID-ansøgninger.', 'loadIdApplications');
    return;
  }

  if (result.error || !result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ID-ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<img class="admin-id-img" src="' + (p.id_doc_url || '') + '" onclick="window.open(\'' + (p.id_doc_url || '') + '\',\'_blank\')" title="Klik for at se fuldt billede">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.name || 'Ukendt') + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (p.seller_type === 'dealer' ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveId(\'' + p.id + '\')">✓ Godkend ID</button>'
      + '<button class="btn-reject" onclick="rejectId(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function approveId(userId) {
  var err = (await supabase.from('profiles').update({
    id_verified: true,
    id_pending:  false,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('✅ ID godkendt — bruger har nu et blåt badge');
  loadIdApplications();
  supabase.functions.invoke('notify-message', {
    body: { type: 'id_approved', user_id: userId },
  }).catch(() => {});
  // Hvis den godkendte bruger er den indloggede, opdater cache
  if (currentUser && currentUser.id === userId) {
    currentProfile = { ...currentProfile, id_verified: true, id_pending: false };
    updateVerifyUI();
    loadBikes();
  }
}

async function rejectId(userId) {
  if (!confirm('Afvis denne ID-ansøgning?')) return;
  var err = (await supabase.from('profiles').update({
    id_pending:  false,
    id_doc_url:  null,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('ID-ansøgning afvist');
  loadIdApplications();
  supabase.functions.invoke('notify-message', {
    body: { type: 'id_rejected', user_id: userId },
  }).catch(() => {});
}

window.updateVerifyUI       = updateVerifyUI;
window.approveId          = approveId;
window.rejectId           = rejectId;
window.openUserProfile       = openUserProfile;
window.closeUserProfileModal = closeUserProfileModal;
window.pickStar              = pickStar;
window.submitReview          = submitReview;
window.openRateModal         = openRateModal;
window.closeRateModal        = closeRateModal;
window.submitRatingFromModal = submitRatingFromModal;
window.toggleProfileContact  = toggleProfileContact;
window.sendProfileMessage    = sendProfileMessage;
window.toggleRestDealers     = toggleRestDealers;
window.closeAllDealersModal  = closeAllDealersModal;
window.closeDealerProfileModal = closeDealerProfileModal;
window.openAllDealersModal   = openAllDealersModal;
window.openDealerProfile     = openDealerProfile;
window.filterByDealerCard    = filterByDealerCard;

