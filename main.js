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
import { createMyProfilePage } from './js/my-profile-page.js';
import { createDealersPage } from './js/dealers-page.js';
import { createCykelagentCta } from './js/cykelagent-cta.js';

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

const { updateCykelagentCta } = createCykelagentCta({ hasActiveFilters, describeActiveFilters });

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
  updateActiveFiltersBar, updateCykelagentCta, applyNearMeFilter, hasActiveFilters, describeActiveFilters,
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
  attachCityAutocomplete,
});

const {
  openEditModal, closeEditModal, renderEditNewImages,
  editSetExistingPrimary, editRemoveExisting, editPreviewImages,
  editSetNewPrimary, editRemoveNew, saveEditedListing,
} = listingEdit;

const {
  setView, renderMapPage, toggleMapNearMe, resetMapFilters, toggleMapDd, pickMapDd,
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
  renderSellImagePreviews, showSellTermsModal,
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
  renderProfileSkeleton,
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

const {
  navigateToMyProfile,
  renderMyProfilePage,
  buildMyProfilePageHTML,
  switchMyProfileTab,
  loadProfileStats,
} = createMyProfilePage({
  supabase, esc, safeAvatarUrl, getInitials,
  renderProfileSkeleton,
  showDetailView,
  showListingView,
  openLoginModal:    () => openLoginModal(),
  openProfileModal:  () => openProfileModal(),
  openEditModal:     (...args) => openEditModal(...args),
  loadMyListings,
  loadSavedListings,
  loadSavedSearches,
  loadTradeHistory,
  checkUnreadMessages: (...args) => checkUnreadMessages(...args),
  navigateTo:        (...args) => navigateTo(...args),
  getCurrentUser:    () => currentUser,
  getCurrentProfile: () => currentProfile,
});

window.navigateToMyProfile = navigateToMyProfile;
window.renderMyProfilePage  = renderMyProfilePage;
window.switchMyProfileTab   = switchMyProfileTab;
window.loadProfileStats     = loadProfileStats;

const {
  openBecomeDealerModal,
  closeBecomeDealerModal,
  selectDealerPlan,
  renderDealersPage,
  toggleDealerGPS,
  sortAndRenderDealers,
  renderBecomeDealerPage,
  submitDealerApplication,
  openSubscriptionPortal,
} = createDealersPage({
  supabase, showToast, esc, getInitials,
  formatDistanceKm, haversineKm, updateSEOMeta, btnLoading,
  geocodeAddress, geocodeCity,
  showDetailView,
  attachAddressAutocomplete, readDawaData,
  navigateTo:              (...args) => navigateTo(...args),
  navigateToDealer,
  openBecomeDealerPage,
  closeBecomeDealerModalCompat,
  selectDealerPlanButton,
  getCurrentUser:    () => currentUser,
  getCurrentProfile: () => currentProfile,
  updateCurrentProfile: (patch) => { if (currentProfile) Object.assign(currentProfile, patch); },
});

window.openBecomeDealerModal   = openBecomeDealerModal;
window.closeBecomeDealerModal  = closeBecomeDealerModal;
window.submitDealerApplication = submitDealerApplication;
window.selectDealerPlan        = selectDealerPlan;
window.openSubscriptionPortal  = openSubscriptionPortal;
window.renderDealersPage       = renderDealersPage;
window.toggleDealerGPS         = toggleDealerGPS;
window.sortAndRenderDealers    = sortAndRenderDealers;

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
      <span class="ss-notif-text">${count} nye cykler matcher dine Cykelagenter — <a onclick="navigateToMyProfile();setTimeout(()=>switchMyProfileTab('searches'),400)" style="color:var(--forest);font-weight:600;cursor:pointer;">Se matches →</a></span>
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

function selectHeroCatChip(el, type) {
  document.getElementById('search-type').value = type;
  searchBikes();
  document.querySelectorAll('.hero-cat-chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('active');
  el.setAttribute('aria-pressed', 'true');
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
  const staticMatch  = { '/om-os': 'about', '/vilkaar': 'terms', '/privatlivspolitik': 'privacy', '/kontakt': 'contact', '/guide/tjek-brugt-cykel': 'guide-tjek', '/cookiepolitik': 'cookies' }[path];
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

  // Saml valgte stelstørrelser
  const sizes = [...document.querySelectorAll('[data-filter="size"]:checked')]
    .map(el => el.dataset.value);

  // Pris
  const minPrice = parseInt(document.querySelector('.price-range input:first-of-type')?.value) || null;
  const maxPrice = parseInt(document.querySelector('.price-range input:last-of-type')?.value) || null;

  // Sælgertype
  let sellerType = null;
  if (sellerDealer?.checked && !sellerPrivate?.checked) sellerType = 'dealer';
  if (sellerPrivate?.checked && !sellerDealer?.checked) sellerType = 'private';

  debouncedLoadFilters({ types, conditions, minPrice, maxPrice, sellerType, wheelSizes, sizes });
}

function toggleConditionInfo() {
  const popup = document.getElementById('condition-info-popup');
  if (!popup) return;
  const visible = popup.style.display !== 'none';
  popup.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const close = (e) => { if (!e.target.closest('#condition-info-popup') && !e.target.closest('.wheel-info-btn')) { popup.style.display = 'none'; document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

let _quizA1 = null;
function startBikeQuiz() {
  document.getElementById('bike-quiz-intro').style.display = 'none';
  document.getElementById('bike-quiz-steps').style.display = 'block';
}
function quizPick(step, val) {
  if (step === 1) {
    _quizA1 = val;
    if (val === 'born') { _showQuizResult(); return; }
    document.getElementById('quiz-step-1').style.display = 'none';
    document.getElementById('quiz-step-2').style.display = 'block';
  } else {
    _quizA2 = val;
    _showQuizResult();
  }
}
let _quizA2 = null;
function _showQuizResult() {
  const map = {
    pendler: { komfort: { type: 'Citybike', desc: 'Opret, behagelig og nem at vedligeholde — perfekt til daglig pendling.' }, fart: { type: 'Racercykel', desc: 'Hurtig og effektiv — kommer hurtigt frem på asfalt.' }, pris: { type: 'Citybike', desc: 'Citybikes er typisk billige i drift og robuste.' } },
    motion:  { fart: { type: 'Racercykel', desc: 'Optimeret til fart — ideel til konditionstræning på vej.' }, komfort: { type: 'Gravel', desc: 'Alsidig og komfortabel — god til både vej og let terræn.' }, pris: { type: 'Mountainbike', desc: 'Robust og billig i vedligehold — god til motion på varieret underlag.' } },
    tur:     { komfort: { type: 'Gravel', desc: 'Håndterer både grusveje og asfalt — perfekt til naturture.' }, fart: { type: 'Racercykel', desc: 'Hurtig på vej — god til lange distancer.' }, pris: { type: 'Mountainbike', desc: 'Robust og alsidig til naturture.' } },
    shopping:{ komfort: { type: 'Ladcykel', desc: 'Masser af plads til indkøb og stor lasteevne.' }, pris: { type: 'Citybike', desc: 'Nem og billig løsning til daglige indkøb.' }, fart: { type: 'El-cykel', desc: 'Kom nemt frem med fuld kurv — motor tager det tunge arbejde.' } },
    born:    { type: 'Børnecykel', desc: 'Vælg størrelse baseret på barnets højde — brug vores størrelsesguide under stelstørrelse.' },
  };
  const result = _quizA1 === 'born' ? map.born : (map[_quizA1]?.[_quizA2] || { type: 'Citybike', desc: 'En god alsidig løsning.' });
  document.getElementById('quiz-step-2').style.display = 'none';
  document.getElementById('quiz-step-1').style.display = 'none';
  document.getElementById('quiz-result-type').textContent = result.type;
  document.getElementById('quiz-result-desc').textContent = result.desc;
  document.getElementById('quiz-apply-btn').dataset.type = result.type;
  document.getElementById('quiz-result').style.display = 'block';
}
function quizBack() {
  document.getElementById('quiz-step-2').style.display = 'none';
  document.getElementById('quiz-step-1').style.display = 'block';
}
function resetQuiz() {
  _quizA1 = null; _quizA2 = null;
  document.getElementById('quiz-result').style.display = 'none';
  document.getElementById('quiz-step-1').style.display = 'block';
  document.getElementById('quiz-step-2').style.display = 'none';
  document.getElementById('bike-quiz-intro').style.display = 'flex';
  document.getElementById('bike-quiz-steps').style.display = 'none';
}
function applyQuizResult() {
  const type = document.getElementById('quiz-apply-btn').dataset.type;
  if (!type) return;
  const sel = document.getElementById('search-type');
  if (sel) { sel.value = type; }
  loadBikes({ type });
  document.getElementById('bike-quiz-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function suggestChildBikeSize() {
  const h = parseInt(document.getElementById('child-height-input')?.value);
  const result = document.getElementById('child-height-result');
  const detail = document.getElementById('child-size-detail');
  if (!result) return;
  if (!h || h < 85 || h > 175) { result.textContent = ''; if (detail) detail.textContent = ''; return; }
  let label, desc;
  if      (h < 100) { label = '12"'; desc = 'Ca. 2–3 år. Hjul: 12 tommer.'; }
  else if (h < 115) { label = '16"'; desc = 'Ca. 4–6 år. Hjul: 16 tommer.'; }
  else if (h < 125) { label = '18"'; desc = 'Ca. 5–7 år. Hjul: 18 tommer.'; }
  else if (h < 140) { label = '20"'; desc = 'Ca. 6–9 år. Hjul: 20 tommer.'; }
  else if (h < 160) { label = '24"'; desc = 'Ca. 9–12 år. Hjul: 24 tommer.'; }
  else              { label = '26"'; desc = 'Ca. 12+ år — snart voksenstørrelse.'; }
  result.textContent = '→ ' + label;
  if (detail) detail.textContent = desc;
}

function toggleSizeInfo() {
  const popup = document.getElementById('size-info-popup');
  if (!popup) return;
  const visible = popup.style.display !== 'none';
  popup.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const close = (e) => { if (!e.target.closest('#size-info-popup') && !e.target.closest('.wheel-info-btn')) { popup.style.display = 'none'; document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function toggleWheelInfo() {
  const popup = document.getElementById('wheel-info-popup');
  if (!popup) return;
  const visible = popup.style.display !== 'none';
  popup.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const close = (e) => { if (!e.target.closest('#wheel-info-popup') && !e.target.closest('.wheel-info-btn')) { popup.style.display = 'none'; document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function suggestFrameSize() {
  const h = parseInt(document.getElementById('height-input')?.value);
  const result = document.getElementById('height-result');
  if (!result) return;
  if (!h || h < 140 || h > 220) { result.textContent = ''; return; }
  let size, val;
  if      (h <= 162) { size = 'XS'; val = 'XS (44–48 cm)'; }
  else if (h <= 170) { size = 'S';  val = 'S (49–52 cm)'; }
  else if (h <= 178) { size = 'M';  val = 'M (53–56 cm)'; }
  else if (h <= 188) { size = 'L';  val = 'L (57–60 cm)'; }
  else               { size = 'XL'; val = 'XL (61+ cm)'; }
  result.textContent = '→ ' + size;
  const cb = document.querySelector(`[data-filter="size"][data-value="${val}"]`);
  document.querySelectorAll('[data-filter="size"]').forEach(c => { c.checked = false; });
  if (cb) { cb.checked = true; applyFilters(); }
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
window.showSection         = showSection;
window.selectHeroCatChip  = selectHeroCatChip;
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
window.suggestFrameSize       = suggestFrameSize;
window.toggleWheelInfo        = toggleWheelInfo;
window.toggleSizeInfo         = toggleSizeInfo;
window.toggleConditionInfo    = toggleConditionInfo;
window.startBikeQuiz          = startBikeQuiz;
window.quizPick               = quizPick;
window.quizBack               = quizBack;
window.resetQuiz              = resetQuiz;
window.applyQuizResult        = applyQuizResult;
window.suggestChildBikeSize   = suggestChildBikeSize;
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
window.showSellTermsModal        = showSellTermsModal;
window.openBikeModal      = openBikeModal;
window.navigateTo         = navigateTo;
window.navigateToBike     = navigateToBike;
window.navigateToProfile  = navigateToProfile;
window.navigateToDealer   = navigateToDealer;
window.renderBikePage     = renderBikePage;
window.renderUserProfilePage  = renderUserProfilePage;
window.renderDealerProfilePage = renderDealerProfilePage;
window.renderMapPage           = renderMapPage;
window.toggleMapNearMe         = toggleMapNearMe;
window.toggleMapDd             = toggleMapDd;
window.pickMapDd               = pickMapDd;
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

window.openFooterModal         = openFooterModal;
window.closeFooterModal        = closeFooterModal;
window.submitContactForm       = submitContactForm;

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

