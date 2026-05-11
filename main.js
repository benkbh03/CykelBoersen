/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

import { esc, debounce, formatLastSeen, removeBikeJsonLd, updateSEOMeta, safeAvatarUrl, trapFocus, enableFocusTrap, disableFocusTrap, haversineKm, stableOffset, BASE_URL, btnLoading, getInitials, formatDistanceKm, transformImageUrl, setImageTransformsEnabled } from './js/utils.js';
import { ensureLeaflet, ensureCropper } from './js/asset-loader.js';
import { geocodeAddress, geocodeCity, invalidateGeocodeEntry } from './js/geocode.js';
import { supabase } from './js/supabase-client.js';
import { BIKES_PAGE_SIZE, MAP_PAGE_LIMIT, STATIC_PAGE_ROUTES, IMAGE_TRANSFORMS_ENABLED } from './js/config.js';
setImageTransformsEnabled(IMAGE_TRANSFORMS_ENABLED);
import { openFooterModal as _openFooterModal, closeFooterModal as _closeFooterModal, submitContactForm as _submitContactForm } from './js/footer-actions.js';
import { attachAddressAutocomplete, attachCityAutocomplete, readDawaData } from './js/dawa-autocomplete.js';
import { createSearchAutocompleteHandlers } from './js/search-autocomplete.js';
import { createRealtimeNotifications } from './js/realtime-notifications.js';
import { createShareActions } from './js/share-actions.js';
import { setMainView, showDetailView, showListingView as _baseShowListingView } from './js/view-switcher.js';
import { createSoldActions } from './js/sold-actions.js';
import { createQuickReplies } from './js/quick-replies.js';
import { createEmailConfirmationActions } from './js/email-confirmation.js';
import { createInboxBadgeActions } from './js/inbox-badge.js';
import { updateNavAvatarUI } from './js/nav-avatar.js';
import { retryHTML, showToast } from './js/ui-feedback.js';
import { showSectionNavigation } from './js/section-nav.js';
import { openBecomeDealerPage, closeBecomeDealerModalCompat, selectDealerPlanButton } from './js/dealer-modal-actions.js';
import { isPendingDealerProfile, blockIfPendingDealerProfile } from './js/dealer-guards.js';
import { createAuthActions } from './js/auth.js';
import { createFilters } from './js/filters.js';
import { createBikesList } from './js/bikes-list.js';
import { createMyProfile } from './js/my-profile.js';
import { createReviews } from './js/reviews.js';
import { createProfilePage } from './js/profile-page.js';
import { createImageUpload } from './js/image-upload.js';
import { createListingEdit } from './js/listing-edit.js';
import { createCykelagentCta } from './js/cykelagent-cta.js';
import { createFollowDealer } from './js/dealer-extras.js';

/* ============================================================
   LAZY MODULE LOADER
   ============================================================
   Heavy/route-specific modules loades først når de bruges, så main thread
   ikke blokeres af parsing under first paint.
   ============================================================ */
function lazyCtrl(loader, factoryName, getDeps, onInit) {
  let inst = null;
  let promise = null;
  return function ensure() {
    if (inst) return Promise.resolve(inst);
    if (!promise) {
      promise = loader().then(mod => {
        inst = mod[factoryName](typeof getDeps === 'function' ? getDeps() : getDeps);
        if (typeof onInit === 'function') onInit(inst);
        return inst;
      });
    }
    return promise;
  };
}

// Wrap: returnerer en async funktion der lazy-loader controlleren og kalder en metode på den.
function lazyMethod(ensureFn, methodName) {
  return (...args) => ensureFn().then(c => {
    const fn = c[methodName];
    return typeof fn === 'function' ? fn.apply(c, args) : fn;
  });
}

// Cached lazy loader for a single named export from et modul (bruges til små helpers)
function lazyExport(loader, exportName) {
  let promise = null;
  return (...args) => {
    if (!promise) promise = loader();
    return promise.then(m => m[exportName](...args));
  };
}

/* showListingView wrapper med SEO-cleanup deps */
function showListingView() {
  return _baseShowListingView({ updateSEOMeta, removeBikeJsonLd });
}

/* Support-chat: stub window-funktioner der lazy-loader modulet ved første klik.
   Modulet selv overskriver disse stubs ved import. */
let _supportChatPromise = null;
function _ensureSupportChat() {
  if (!_supportChatPromise) _supportChatPromise = import('./js/support-chat.js');
  return _supportChatPromise;
}
window.toggleChat      = (...args) => _ensureSupportChat().then(() => window.toggleChat(...args));
window.sendChatMessage = (...args) => _ensureSupportChat().then(() => window.sendChatMessage(...args));
window.handleChatKey   = (...args) => _ensureSupportChat().then(() => window.handleChatKey(...args));

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

const { updateCykelagentCta, dismissCykelagentCta } = createCykelagentCta({ hasActiveFilters, describeActiveFilters });
window.dismissCykelagentCta = dismissCykelagentCta;

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
  esc, safeAvatarUrl, getInitials, formatLastSeen, retryHTML, transformImageUrl,
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
// Profile modals — lazy-loaded (kun når bruger åbner et profil-kort)
const _ensureProfileModals = lazyCtrl(
  () => import('./js/profile-modals.js'),
  'createProfileModals',
  () => ({
    supabase, esc, safeAvatarUrl, getInitials, formatLastSeen, retryHTML, showToast,
    getCurrentUser:       () => currentUser,
    userSavedSet:         _userSavedSet,
    closeAllDealersModal: (...args) => closeAllDealersModal(...args),
    closeAllModals:       (...args) => closeAllModals(...args),
    highlightStars,
  }),
);
const filterByDealerCard       = lazyMethod(_ensureProfileModals, 'filterByDealerCard');
const openDealerProfile        = lazyMethod(_ensureProfileModals, 'openDealerProfile');
const closeDealerProfileModal  = lazyMethod(_ensureProfileModals, 'closeDealerProfileModal');
const openUserProfileWithReview = lazyMethod(_ensureProfileModals, 'openUserProfileWithReview');
const openUserProfile          = lazyMethod(_ensureProfileModals, 'openUserProfile');
const switchUserProfileTab     = lazyMethod(_ensureProfileModals, 'switchUserProfileTab');
const switchDealerProfileTab   = lazyMethod(_ensureProfileModals, 'switchDealerProfileTab');
const toggleProfileContact     = lazyMethod(_ensureProfileModals, 'toggleProfileContact');
const sendProfileMessage       = lazyMethod(_ensureProfileModals, 'sendProfileMessage');
const loadUserAchievements     = lazyMethod(_ensureProfileModals, 'loadUserAchievements');
const closeUserProfileModal    = lazyMethod(_ensureProfileModals, 'closeUserProfileModal');

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
  validateImageFile, compressImage, compressForAI, previewImages, renderImagePreviews,
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

// Map page — lazy-loaded (kun /kort route). Loader også Leaflet samtidig.
const _ensureMapPage = lazyCtrl(
  () => Promise.all([
    import('./js/map-page.js'),
    ensureLeaflet(),
  ]).then(([mod]) => mod),
  'createMapPage',
  () => ({
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
  }),
);
const setView                = lazyMethod(_ensureMapPage, 'setView');
const renderMapPage          = lazyMethod(_ensureMapPage, 'renderMapPage');
const toggleMapNearMe        = lazyMethod(_ensureMapPage, 'toggleMapNearMe');
const toggleMapBoundsFilter  = lazyMethod(_ensureMapPage, 'toggleMapBoundsFilter');
const applyMapBoundsSearch   = lazyMethod(_ensureMapPage, 'applyMapBoundsSearch');
const resetMapFilters        = lazyMethod(_ensureMapPage, 'resetMapFilters');
const toggleMapDd            = lazyMethod(_ensureMapPage, 'toggleMapDd');
const pickMapDd              = lazyMethod(_ensureMapPage, 'pickMapDd');
const toggleMapFilterPanel   = lazyMethod(_ensureMapPage, 'toggleMapFilterPanel');
const splitCardClick         = lazyMethod(_ensureMapPage, 'splitCardClick');
const toggleSplitList        = lazyMethod(_ensureMapPage, 'toggleSplitList');
const applyMapFilters        = lazyMethod(_ensureMapPage, 'applyMapFilters');
const openMapFiltersSheet    = lazyMethod(_ensureMapPage, 'openMapFiltersSheet');
const closeMapFiltersSheet   = lazyMethod(_ensureMapPage, 'closeMapFiltersSheet');
const mapTabSwitch           = lazyMethod(_ensureMapPage, 'mapTabSwitch');
const locateUser             = lazyMethod(_ensureMapPage, 'locateUser');
const openFromMap            = lazyMethod(_ensureMapPage, 'openFromMap');
const _openFromMap           = lazyMethod(_ensureMapPage, '_openFromMap');

// Sell page — lazy-loaded (kun /sell route eller "+ Sæt til salg")
const _ensureSellPage = lazyCtrl(
  () => import('./js/sell-page.js'),
  'createSellPage',
  () => ({
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
    compressForAI,
    getCurrentUser:         () => currentUser,
    getCurrentProfile:      () => currentProfile,
  }),
);
const openModal                  = lazyMethod(_ensureSellPage, 'openModal');
const _openModalLegacy           = lazyMethod(_ensureSellPage, '_openModalLegacy');
const closeModal                 = lazyMethod(_ensureSellPage, 'closeModal');
const selectType                 = lazyMethod(_ensureSellPage, 'selectType');
const submitListing              = lazyMethod(_ensureSellPage, 'submitListing');
const renderSellPage             = lazyMethod(_ensureSellPage, 'renderSellPage');
const submitSellPage             = lazyMethod(_ensureSellPage, 'submitSellPage');
const previewSellImages          = lazyMethod(_ensureSellPage, 'previewSellImages');
const setSellPrimary             = lazyMethod(_ensureSellPage, 'setSellPrimary');
const removeSellImage            = lazyMethod(_ensureSellPage, 'removeSellImage');
const suggestListingFromImages   = lazyMethod(_ensureSellPage, 'suggestListingFromImages');
const applyAiSuggestion          = lazyMethod(_ensureSellPage, 'applyAiSuggestion');
const fileToBase64               = lazyMethod(_ensureSellPage, 'fileToBase64');
const setSellStep                = lazyMethod(_ensureSellPage, 'setSellStep');
const advanceSell                = lazyMethod(_ensureSellPage, 'advanceSell');
const backSell                   = lazyMethod(_ensureSellPage, 'backSell');
const toggleAdvancedSpecs        = lazyMethod(_ensureSellPage, 'toggleAdvancedSpecs');
const saveSellDraft              = lazyMethod(_ensureSellPage, 'saveSellDraft');
const clearSellDraft             = lazyMethod(_ensureSellPage, 'clearSellDraft');
const initSellDraft              = lazyMethod(_ensureSellPage, 'initSellDraft');
const updateSellPriceSuggestion  = lazyMethod(_ensureSellPage, 'updateSellPriceSuggestion');
const showListingSuccessModal    = lazyMethod(_ensureSellPage, 'showListingSuccessModal');
const closeListingSuccessModal   = lazyMethod(_ensureSellPage, 'closeListingSuccessModal');
const renderSellImagePreviews    = lazyMethod(_ensureSellPage, 'renderSellImagePreviews');
const showSellTermsModal         = lazyMethod(_ensureSellPage, 'showSellTermsModal');

// Bike detail — lazy-loaded (kun ved /bike/:id route eller åbning af bike-modal)
// Ved første load kører setupLightboxEvents + registerWindowExports.
// Leaflet bruges til lokations-kort i bike-modal.
const _ensureBikeDetail = lazyCtrl(
  () => Promise.all([
    import('./js/bike-detail.js'),
    ensureLeaflet(),
  ]).then(([mod]) => mod),
  'createBikeDetail',
  () => ({
    supabase, showToast, esc, safeAvatarUrl, getInitials, formatLastSeen,
    haversineKm, BASE_URL, removeBikeJsonLd, updateSEOMeta, retryHTML,
    stableOffset, bikeCache, geocodeAddress, geocodeCity, transformImageUrl,
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
  }),
  (inst) => {
    // Engangs-init når modulet er loaded
    inst.setupLightboxEvents();
    inst.registerWindowExports();
  },
);
const fetchBikeById              = lazyMethod(_ensureBikeDetail, 'fetchBikeById');
const buildBikeBodyHTML          = lazyMethod(_ensureBikeDetail, 'buildBikeBodyHTML');
const openBikeModal              = lazyMethod(_ensureBikeDetail, 'openBikeModal');
const closeBikeModal             = lazyMethod(_ensureBikeDetail, 'closeBikeModal');
const renderBikePage             = lazyMethod(_ensureBikeDetail, 'renderBikePage');
const renderBikeSkeleton         = lazyMethod(_ensureBikeDetail, 'renderBikeSkeleton');
const initBikeDetailMap          = lazyMethod(_ensureBikeDetail, 'initBikeDetailMap');
const _drawUserPositionOnBikeMap = lazyMethod(_ensureBikeDetail, '_drawUserPositionOnBikeMap');
const showMyDistanceOnBikeMap    = lazyMethod(_ensureBikeDetail, 'showMyDistanceOnBikeMap');
const loadResponseTime           = lazyMethod(_ensureBikeDetail, 'loadResponseTime');
const loadSellerOtherListings    = lazyMethod(_ensureBikeDetail, 'loadSellerOtherListings');
const loadSimilarListings        = lazyMethod(_ensureBikeDetail, 'loadSimilarListings');
const loadInterestedUsers        = lazyMethod(_ensureBikeDetail, 'loadInterestedUsers');
const startConversationWithLiker = lazyMethod(_ensureBikeDetail, 'startConversationWithLiker');
const openReportModal            = lazyMethod(_ensureBikeDetail, 'openReportModal');
const closeReportModal           = lazyMethod(_ensureBikeDetail, 'closeReportModal');
const submitReport               = lazyMethod(_ensureBikeDetail, 'submitReport');
const galleryGoto                = lazyMethod(_ensureBikeDetail, 'galleryGoto');
const galleryNav                 = lazyMethod(_ensureBikeDetail, 'galleryNav');
const attachGallerySwipe         = lazyMethod(_ensureBikeDetail, 'attachGallerySwipe');
const openLightbox               = lazyMethod(_ensureBikeDetail, 'openLightbox');
const closeLightbox              = lazyMethod(_ensureBikeDetail, 'closeLightbox');
const lightboxNav                = lazyMethod(_ensureBikeDetail, 'lightboxNav');
const lightboxResetZoom          = lazyMethod(_ensureBikeDetail, 'lightboxResetZoom');
const updateMeetMiddle           = lazyMethod(_ensureBikeDetail, 'updateMeetMiddle');
const useMeetMiddle              = lazyMethod(_ensureBikeDetail, 'useMeetMiddle');
const toggleBidBox               = lazyMethod(_ensureBikeDetail, 'toggleBidBox');
const insertPresetMsg            = lazyMethod(_ensureBikeDetail, 'insertPresetMsg');
const toggleMessageBox           = lazyMethod(_ensureBikeDetail, 'toggleMessageBox');
const stickyBarAction            = lazyMethod(_ensureBikeDetail, 'stickyBarAction');
const sendMessage                = lazyMethod(_ensureBikeDetail, 'sendMessage');
const sendBid                    = lazyMethod(_ensureBikeDetail, 'sendBid');
const toggleSaveFromModal        = lazyMethod(_ensureBikeDetail, 'toggleSaveFromModal');

// Profile pages — lazy-loaded (kun /profile/:id og /dealer/:id ruter)
const _ensureProfilePages = lazyCtrl(
  () => import('./js/profile-pages.js'),
  'createProfilePages',
  () => ({
    supabase, esc, safeAvatarUrl, getInitials, formatLastSeen,
    updateSEOMeta,
    getUserSavedSet:    () => _userSavedSet,
    getCurrentUser:     () => currentUser,
    showDetailView,
    navigateTo:         (...args) => navigateTo(...args),
    highlightStars,
    loadUserAchievements,
    followDealer,
  }),
);
const renderUserProfilePage   = lazyMethod(_ensureProfilePages, 'renderUserProfilePage');
const renderDealerProfilePage = lazyMethod(_ensureProfilePages, 'renderDealerProfilePage');
const navigateToProfile       = lazyMethod(_ensureProfilePages, 'navigateToProfile');
const navigateToDealer        = lazyMethod(_ensureProfilePages, 'navigateToDealer');
const renderProfileSkeleton   = lazyMethod(_ensureProfilePages, 'renderProfileSkeleton');

// My profile page — lazy-loaded (kun /me route)
const _ensureMyProfilePage = lazyCtrl(
  () => import('./js/my-profile-page.js'),
  'createMyProfilePage',
  () => ({
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
  }),
);
const navigateToMyProfile    = lazyMethod(_ensureMyProfilePage, 'navigateToMyProfile');
const renderMyProfilePage    = lazyMethod(_ensureMyProfilePage, 'renderMyProfilePage');
const buildMyProfilePageHTML = lazyMethod(_ensureMyProfilePage, 'buildMyProfilePageHTML');
const switchMyProfileTab     = lazyMethod(_ensureMyProfilePage, 'switchMyProfileTab');
const loadProfileStats       = lazyMethod(_ensureMyProfilePage, 'loadProfileStats');

window.navigateToMyProfile = navigateToMyProfile;
window.renderMyProfilePage  = renderMyProfilePage;
window.switchMyProfileTab   = switchMyProfileTab;
window.loadProfileStats     = loadProfileStats;

// Dealers page — lazy-loaded (/forhandlere + /bliv-forhandler routes)
const _ensureDealersPage = lazyCtrl(
  () => import('./js/dealers-page.js'),
  'createDealersPage',
  () => ({
    supabase, showToast, esc, getInitials, safeAvatarUrl, transformImageUrl,
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
  }),
);
const openBecomeDealerModal    = lazyMethod(_ensureDealersPage, 'openBecomeDealerModal');
const closeBecomeDealerModal   = lazyMethod(_ensureDealersPage, 'closeBecomeDealerModal');
const selectDealerPlan         = lazyMethod(_ensureDealersPage, 'selectDealerPlan');
const renderDealersPage        = lazyMethod(_ensureDealersPage, 'renderDealersPage');
const toggleDealerGPS          = lazyMethod(_ensureDealersPage, 'toggleDealerGPS');
const sortAndRenderDealers     = lazyMethod(_ensureDealersPage, 'sortAndRenderDealers');
const toggleDealerServiceFilter = lazyMethod(_ensureDealersPage, 'toggleDealerServiceFilter');
const renderBecomeDealerPage   = lazyMethod(_ensureDealersPage, 'renderBecomeDealerPage');
const submitDealerApplication  = lazyMethod(_ensureDealersPage, 'submitDealerApplication');
const openSubscriptionPortal   = lazyMethod(_ensureDealersPage, 'openSubscriptionPortal');

// Brand-landingsside — lazy-loaded (/cykler/:brand)
const _ensureBrandPage = lazyCtrl(
  () => import('./js/brand-page.js'),
  'createBrandPage',
  () => ({
    supabase, esc, updateSEOMeta,
    showDetailView, showListingView,
    navigateTo:       (...args) => navigateTo(...args),
    navigateToBike:   (...args) => navigateToBike(...args),
    navigateToDealer: (...args) => navigateToDealer(...args),
    safeAvatarUrl, getInitials, transformImageUrl,
    BASE_URL,
  }),
);
const renderBrandPage     = lazyMethod(_ensureBrandPage, 'renderBrandPage');
const renderBrandsOverview = lazyMethod(_ensureBrandPage, 'renderBrandsOverview');
const removeBrandJsonLd   = lazyMethod(_ensureBrandPage, 'removeBrandJsonLd');
window.renderBrandPage    = renderBrandPage;
window.renderBrandsOverview = renderBrandsOverview;

// Cykel-vurdering — lazy-loaded (/vurder-min-cykel)
const _ensureValuation = lazyCtrl(
  () => import('./js/valuation.js'),
  'createValuation',
  () => ({
    supabase, esc, updateSEOMeta, showDetailView,
    navigateTo: (...args) => navigateTo(...args),
    BASE_URL,
  }),
);
const renderValuationPage = lazyMethod(_ensureValuation, 'renderValuationPage');
const runValuation        = lazyMethod(_ensureValuation, 'runValuation');
window.renderValuationPage = renderValuationPage;
window.runValuation        = runValuation;

// Blog — lazy-loaded (/blog og /blog/:slug)
const _ensureBlog = lazyCtrl(
  () => import('./js/blog-page.js'),
  'createBlogPage',
  () => ({
    esc, updateSEOMeta, showDetailView, showListingView,
    navigateTo: (...args) => navigateTo(...args),
    BASE_URL,
  }),
);
const renderBlogOverview = lazyMethod(_ensureBlog, 'renderBlogOverview');
const renderBlogArticle  = lazyMethod(_ensureBlog, 'renderBlogArticle');
const filterBlogCategory = lazyMethod(_ensureBlog, 'filterBlogCategory');
window.renderBlogOverview = renderBlogOverview;
window.renderBlogArticle  = renderBlogArticle;
window.filterBlogCategory = filterBlogCategory;

window.openBecomeDealerModal   = openBecomeDealerModal;
window.closeBecomeDealerModal  = closeBecomeDealerModal;
window.submitDealerApplication = submitDealerApplication;
window.selectDealerPlan        = selectDealerPlan;
window.openSubscriptionPortal  = openSubscriptionPortal;
window.renderDealersPage       = renderDealersPage;
window.toggleDealerGPS         = toggleDealerGPS;
window.sortAndRenderDealers    = sortAndRenderDealers;
window.toggleDealerServiceFilter = toggleDealerServiceFilter;

/* ============================================================
   INIT – hent session én gang og sæt alt op
   ============================================================ */

async function init() {
  // Render sidebar farve-swatches
  import('./js/color-swatches.js').then(({ renderColorSwatches }) => {
    const colorGrid = document.getElementById('color-filter-grid');
    renderColorSwatches(colorGrid, { filterAttr: 'color', onChange: () => applyFilters() });
  });

  // By/postnummer-autocomplete + radius-søg på hero-søgefeltet
  const searchCityInput  = document.getElementById('search-city');
  const searchCityClear  = document.getElementById('search-city-clear');
  const searchCityRadius = document.getElementById('search-city-radius');

  // Anvend by-radius (kalder samme distance-filter som "Nær mig", men med
  // byens DAWA-koordinater i stedet for GPS).
  function applyCityRadius() {
    if (!searchCityInput || !searchCityRadius) return;
    const lat = parseFloat(searchCityInput.dataset.dawaLat);
    const lng = parseFloat(searchCityInput.dataset.dawaLng);
    const radius = parseInt(searchCityRadius.value);
    if (Number.isFinite(lat) && Number.isFinite(lng) && radius > 0) {
      // Slå evt. aktiv "Nær mig"-pille fra (mutual exclusivt)
      const nearmePill = document.getElementById('pill-nearme');
      if (nearmePill && nearmePill.classList.contains('active')) {
        nearmePill.classList.remove('active');
        const nearmeRadiusSel = document.getElementById('nearme-radius');
        if (nearmeRadiusSel) nearmeRadiusSel.style.display = 'none';
      }
      userGeoCoords = [lat, lng];
      activeRadius  = radius;
      applyNearMeFilter();
    } else {
      // Ingen radius valgt — ryd evt. tidligere by-radius
      userGeoCoords = null;
      activeRadius  = null;
      document.querySelectorAll('.nearme-dist').forEach(el => el.remove());
      // Genindlæs så bortfiltrerede kort vises igen
      loadBikes(currentFilters);
    }
  }

  if (searchCityInput) {
    attachCityAutocomplete(searchCityInput, () => {
      // Bruger har valgt en by fra autocomplete → vis radius-vælger
      if (searchCityRadius) searchCityRadius.hidden = false;
      searchBikes();
      // Hvis radius allerede er valgt, anvend straks
      if (searchCityRadius && searchCityRadius.value) applyCityRadius();
    });
    const updateClearBtn = () => {
      if (searchCityClear) searchCityClear.hidden = !searchCityInput.value;
      // Skjul radius hvis bruger sletter byen manuelt
      if (!searchCityInput.value && searchCityRadius) {
        searchCityRadius.value = '';
        searchCityRadius.hidden = true;
      }
    };
    searchCityInput.addEventListener('input', updateClearBtn);
    if (searchCityClear) {
      searchCityClear.addEventListener('click', () => {
        searchCityInput.value = '';
        delete searchCityInput.dataset.dawaLat;
        delete searchCityInput.dataset.dawaLng;
        delete searchCityInput.dataset.dawaPostcode;
        if (searchCityRadius) {
          searchCityRadius.value = '';
          searchCityRadius.hidden = true;
        }
        userGeoCoords = null;
        activeRadius = null;
        document.querySelectorAll('.nearme-dist').forEach(el => el.remove());
        updateClearBtn();
        searchBikes();
        searchCityInput.focus();
      });
    }
    if (searchCityRadius) {
      searchCityRadius.addEventListener('change', applyCityRadius);
    }
    updateClearBtn();
  }

  // Start offentlig data med det samme – venter ikke på auth
  const sessionPromise = supabase.auth.getSession();
  loadBikes();
  loadInitialData(); // Erstatter loadDealers() + updateFilterCounts() med 2 parallelle queries

  // Render "Sidst set"-sektion på forsiden (lazy import — kun hvis bruger har localStorage-data)
  import('./js/recently-viewed.js').then(({ renderRecentlyViewedSection, clearRecentlyViewed }) => {
    renderRecentlyViewedSection('recently-viewed');
    window.clearRecentlyViewedSection = () => {
      clearRecentlyViewed();
      renderRecentlyViewedSection('recently-viewed');
    };
  }).catch(() => {});

  const { data: { session } } = await sessionPromise;

  if (session) {
    currentUser = session.user;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', currentUser.id).single();

    // Fuldfør forhandler-registrering hvis bruger signede op via bliv-forhandler siden
    const meta = currentUser.user_metadata || {};
    if (meta.pending_dealer && (!profile || profile.seller_type !== 'dealer')) {
      // email_verified og verified sættes ikke her — håndteres af DB-triggers/admin-actions
      const dealerUpsert = await supabase.from('profiles').upsert({
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
      }, { onConflict: 'id' });
      if (dealerUpsert.error) {
        console.error('Dealer upsert fejl:', dealerUpsert.error);
      }
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
      // email_verified synkroniseres automatisk via auth.users-trigger
      if (!profile && _event === 'SIGNED_IN') {
        const meta = currentUser.user_metadata || {};
        const name = meta.full_name || meta.name || currentUser.email?.split('@')[0] || 'Ny bruger';
        const isPendingDealer = !!meta.pending_dealer;
        await supabase.from('profiles').upsert({
          id:             currentUser.id,
          name:           isPendingDealer ? (meta.name || name) : name,
          email:          currentUser.email,
          seller_type:    isPendingDealer ? 'dealer' : 'private',
          shop_name:      isPendingDealer ? (meta.shop_name || null) : null,
          cvr:            isPendingDealer ? (meta.cvr || null) : null,
          phone:          isPendingDealer ? (meta.phone || null) : null,
          address:        isPendingDealer ? (meta.address || null) : null,
          city:           isPendingDealer ? (meta.city || null) : null,
          lat:            isPendingDealer ? (meta.lat || null) : null,
          lng:            isPendingDealer ? (meta.lng || null) : null,
          postcode:       isPendingDealer ? (meta.postcode || null) : null,
          location_precision: isPendingDealer && meta.lat && meta.lng ? 'exact' : null,
        }, { onConflict: 'id' });
        const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        profile = newProfile;
      }

      // Eksisterende profil men pending_dealer → opgradér til dealer
      // (kører hvis init() missede det pga. timing med URL-hash session)
      if (profile && profile.seller_type !== 'dealer' && currentUser.user_metadata?.pending_dealer) {
        const meta = currentUser.user_metadata;
        const upgradeRes = await supabase.from('profiles').upsert({
          id:                 currentUser.id,
          email:              currentUser.email,
          name:               meta.name || profile.name || '',
          shop_name:          meta.shop_name || profile.shop_name || '',
          cvr:                meta.cvr || profile.cvr || '',
          phone:              meta.phone || profile.phone || '',
          address:            meta.address || profile.address || '',
          city:               meta.city || profile.city || '',
          lat:                meta.lat || profile.lat || null,
          lng:                meta.lng || profile.lng || null,
          postcode:           meta.postcode || profile.postcode || null,
          location_precision: meta.lat && meta.lng ? 'exact' : profile.location_precision,
          seller_type:        'dealer',
        }, { onConflict: 'id' });
        if (upgradeRes.error) {
          console.error('Pending dealer upgrade fejl:', upgradeRes.error);
        } else {
          supabase.auth.updateUser({ data: { pending_dealer: null } }).catch(() => {});
          const { data: refreshed } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
          profile = refreshed || profile;
        }
      }

      currentProfile = profile;
      updateNav(true, profile?.name, profile?.avatar_url);
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = profile?.is_admin ? 'flex' : 'none';
      checkEmailConfirmed();
      if (_event === 'SIGNED_IN' && isNewLogin) {
        loadBikes();
        if (!localStorage.getItem('onboarded')) {
          import('./js/onboarding.js').then(m => m.showOnboardingBanner()).catch(() => {});
        }
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

    // Sæt email_verified=true. Trigger validerer at auth.users.email_confirmed_at er sat.
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
    if (document.getElementById('sidebar-filters')?.classList.contains('mobile-open')) { closeMobileFilters(); return; }
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
        sellBtn.setAttribute('onclick', 'event.preventDefault(); blockIfPendingDealer()');
        sellBtn.setAttribute('title', 'Din forhandlerprofil afventer admin-godkendelse');
        sellBtn.style.opacity = '0.6';
        sellBtn.style.cursor = 'not-allowed';
      } else {
        sellBtn.textContent = '+ Sæt til salg';
        sellBtn.setAttribute('onclick', 'event.preventDefault(); openModal()');
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
    if (sellBtn) { sellBtn.textContent = 'Log ind / Sælg'; sellBtn.setAttribute('onclick', 'event.preventDefault(); openLoginModal()'); }
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
        <p>Bliv en af de første forhandlere på Cykelbørsen.
Vær med fra starten og nå ud til tusindvis af cykelkøbere.</p>
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
      .select('type, condition, size, wheel_size, colors, user_id, profiles(seller_type)')
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
   FØLG FORHANDLER
   ============================================================ */
const followDealer = createFollowDealer({
  supabase,
  showToast,
  getCurrentUser:   () => currentUser,
  openLoginModal:   () => openLoginModal(),
  navigateTo:       (...args) => navigateTo(...args),
});
async function toggleFollowDealer(dealerId, btnEl) {
  return followDealer.toggleFollow(dealerId, btnEl);
}
window.toggleFollowDealer = toggleFollowDealer;

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
/* ============================================================
   PASSWORD UI HELPERS
   ============================================================ */
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (btn) {
    btn.setAttribute('aria-label', isHidden ? 'Skjul adgangskode' : 'Vis adgangskode');
    btn.classList.toggle('pw-toggle--shown', isHidden);
  }
}

function updatePwStrength(inputId, wrapId) {
  const input = document.getElementById(inputId);
  const wrap  = document.getElementById(wrapId);
  if (!input || !wrap) return;
  const v = input.value || '';
  if (!v) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const fill  = wrap.querySelector('.pw-strength-fill');
  const label = wrap.querySelector('.pw-strength-label');
  // Score: længde + variation
  let score = 0;
  if (v.length >= 8)  score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v))     score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  // 0-1: weak, 2-3: medium, 4-5: strong
  const tier = v.length < 8 ? 'too-short' : score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong';
  const labels = {
    'too-short': `🔴 Mindst 8 tegn (du har ${v.length})`,
    weak:        '🔴 Svag — gør den længere',
    medium:      '🟡 OK — kan gøres stærkere',
    strong:      '🟢 Stærkt password ✓',
  };
  const widths = { 'too-short': '20%', weak: '35%', medium: '65%', strong: '100%' };
  if (fill)  { fill.style.width = widths[tier]; fill.dataset.tier = tier; }
  if (label) label.textContent = labels[tier];
}

function navigateTo(path) {
  document.body.classList.remove('on-sell-page');
  history.pushState({}, '', path);
  handleRoute();
}

function handleRoute() {
  document.body.classList.remove('is-mp-mobile');
  document.body.classList.remove('map-page-view');
  // Defensiv: luk altid mobil-filter-drawer ved navigation
  const _sb = document.getElementById('sidebar-filters');
  const _ov = document.getElementById('mobile-filter-overlay');
  if (_sb) _sb.classList.remove('mobile-open');
  if (_ov) _ov.classList.remove('open');
  if (document.body.classList.contains('mobile-filters-open')) {
    document.body.classList.remove('mobile-filters-open');
  }
  const path = window.location.pathname;
  const bikeMatch    = path.match(/^\/bike\/([^/]+)$/);
  const profileMatch = path.match(/^\/profile\/([^/]+)$/);
  const dealerMatch  = path.match(/^\/dealer\/([^/]+)$/);
  const brandMatch   = path.match(/^\/cykler\/([^/]+)$/);
  const brandsOverviewMatch = path === '/maerker' || path === '/mærker';
  const valuationMatch = path === '/vurder-min-cykel';
  const blogArticleMatch = path.match(/^\/blog\/([^/]+)$/);
  const blogOverviewMatch = path === '/blog';
  const meMatch      = path === '/me';
  const sellMatch    = path === '/sell';
  const inboxMatch   = path === '/inbox';
  const dealerApply  = path === '/bliv-forhandler';
  const dealersMatch = path === '/forhandlere';
  const mapPageMatch = path === '/kort';
  const staticMatch  = { '/om-os': 'about', '/vilkaar': 'terms', '/privatlivspolitik': 'privacy', '/kontakt': 'contact', '/guide/tjek-brugt-cykel': 'guide-tjek', '/sikkerhedsguide': 'sikkerhedsguide', '/cookiepolitik': 'cookies' }[path];
  if (staticMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderStaticPage(staticMatch);
  } else if (dealerApply) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBecomeDealerPage();
  } else if (dealersMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderDealersPage();
  } else if (mapPageMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    document.body.classList.add('map-page-view');
    const mapBikeId = new URLSearchParams(window.location.search).get('bike');
    if (mapBikeId) history.replaceState(null, '', '/kort');
    renderMapPage();
    if (mapBikeId) setTimeout(() => openBikeModal(mapBikeId), 600);
  } else if (inboxMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderInboxPage();
  } else if (meMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderMyProfilePage();
  } else if (sellMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderSellPage();
  } else if (bikeMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBikePage(bikeMatch[1]);
  } else if (profileMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderUserProfilePage(profileMatch[1]);
  } else if (dealerMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderDealerProfilePage(dealerMatch[1]);
  } else if (brandMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBrandPage(decodeURIComponent(brandMatch[1]));
  } else if (brandsOverviewMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBrandsOverview();
  } else if (valuationMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderValuationPage();
  } else if (blogArticleMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBlogArticle(decodeURIComponent(blogArticleMatch[1]));
  } else if (blogOverviewMatch) {
    closeAllModals();
    window.scrollTo({ top: 0, behavior: 'auto' });
    showDetailView();
    renderBlogOverview();
  } else {
    showListingView();
    // Genrenderér "Sidst set" så listen opdateres efter en bike-modal/detail-visit
    import('./js/recently-viewed.js').then(m => m.renderRecentlyViewedSection('recently-viewed')).catch(() => {});
  }
}

window.addEventListener('popstate', handleRoute);

/* Preload hyppigt brugte moduler når browseren er idle —
   så klik på annoncer, "Sæt til salg", profiler og footer-links
   navigerer øjeblikkeligt uden lazy-load delay (flicker). */
function _preloadStaticModules() {
  // Brug requestIdleCallback hvis tilgængelig, ellers setTimeout som fallback
  const schedule = window.requestIdleCallback || (cb => setTimeout(cb, 800));
  schedule(() => {
    // Footer-links (Om os, Vilkår, Privatlivspolitik, Kontakt)
    import('./js/static-pages.js').catch(() => {});
    import('./js/static-pages-content.js').catch(() => {});
    // Profil-sider (bruger/forhandler)
    import('./js/profile-pages.js').catch(() => {});
    import('./js/profile-modals.js').catch(() => {});
    // Annonce-modal (klik på bike-card) + Leaflet til lokations-kort
    import('./js/bike-detail.js').catch(() => {});
    ensureLeaflet().catch(() => {});
    // "Sæt til salg"-knap
    import('./js/sell-page.js').catch(() => {});
    // "Forhandlere"-link i topnav
    import('./js/dealers-page.js').catch(() => {});
  });
}
window.addEventListener('load', _preloadStaticModules);

/* ============================================================
   GLOBAL LINK INTERCEPTOR
   Fanger ALLE interne <a href="/..."> klik og bruger JS-navigation
   i stedet for default browser-reload. Forhindrer at en glemt
   event.preventDefault() får siden til at refreshe.
   ============================================================ */
document.addEventListener('click', function(e) {
  const a = e.target.closest('a');
  if (!a) return;
  // Spring over hvis modifier-tast (Ctrl/Cmd/Shift = åbn i ny fane)
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // Spring over hvis target="_blank" eller eksplicit eksternt
  if (a.target && a.target !== '' && a.target !== '_self') return;
  if (a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href) return;
  // Kun interne ruter — ikke #anchor, ikke mailto:, ikke tel:, ikke fuld URL
  if (!href.startsWith('/') || href.startsWith('//')) return;
  // Spring over assets (images, css, js, etc.)
  if (/\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|ico|webmanifest)(\?.*)?$/i.test(href)) return;
  // Vi har en intern app-rute — håndter via JS
  e.preventDefault();
  navigateTo(href);
});

function navigateToBike(bikeId) {
  navigateTo(`/bike/${bikeId}`);
}

/* ============================================================
   SIDEBAR FILTRE
   ============================================================ */

function toggleSidebarSection(header) {
  const box = header.closest('.sidebar-box');
  // Mobile uses 'expanded' class (default-collapsed); desktop uses 'collapsed' class (default-expanded)
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    const expanded = box.classList.toggle('expanded');
    header.setAttribute('aria-expanded', expanded);
  } else {
    const expanded = box.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', !expanded);
  }
}

function openMobileFilters() {
  const sidebar = document.getElementById('sidebar-filters');
  const overlay = document.getElementById('mobile-filter-overlay');
  if (!sidebar) return;
  sidebar.classList.add('mobile-open');
  if (overlay) overlay.classList.add('open');
  document.body.classList.add('mobile-filters-open');
}

function closeMobileFilters() {
  const sidebar = document.getElementById('sidebar-filters');
  const overlay = document.getElementById('mobile-filter-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('mobile-filters-open');
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

  // Saml valgte farver
  const colors = [...document.querySelectorAll('[data-filter="color"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte mærker
  const brands = [...document.querySelectorAll('[data-filter="brand"]:checked')]
    .map(el => el.dataset.value);

  // Cykel-specifikke strukturerede filtre
  const frameMaterials = [...document.querySelectorAll('[data-filter="frame_material"]:checked')]
    .map(el => el.dataset.value);

  const brakeTypes = [...document.querySelectorAll('[data-filter="brake_type"]:checked')]
    .map(el => el.dataset.value);

  const groupsets = [...document.querySelectorAll('[data-filter="groupset"]:checked')]
    .map(el => el.dataset.value);

  // Elektronisk gear: 'true', 'false', begge eller ingen
  const electronicChecked = [...document.querySelectorAll('[data-filter="electronic_shifting"]:checked')]
    .map(el => el.dataset.value);
  let electronicShifting = null; // null = ingen filter
  if (electronicChecked.length === 1) {
    electronicShifting = electronicChecked[0] === 'true';
  }
  // hvis begge eller ingen er checked → ingen filter (alle)

  // Pris
  const minPrice = parseInt(document.querySelector('.price-range input:first-of-type')?.value) || null;
  const maxPrice = parseInt(document.querySelector('.price-range input:last-of-type')?.value) || null;

  // Vægt (max kg)
  const maxWeightRaw = document.getElementById('sidebar-max-weight')?.value;
  const maxWeight = maxWeightRaw ? parseFloat(maxWeightRaw) : null;

  // Sælgertype
  let sellerType = null;
  if (sellerDealer?.checked && !sellerPrivate?.checked) sellerType = 'dealer';
  if (sellerPrivate?.checked && !sellerDealer?.checked) sellerType = 'private';

  debouncedLoadFilters({
    types, conditions, minPrice, maxPrice, sellerType,
    wheelSizes, sizes, colors, brands,
    frameMaterials, brakeTypes, groupsets, electronicShifting,
    maxWeight,
  });
}

const KNOWN_BRANDS = ['Amladcykler','Avenue','Babboe','Batavus','Bergamont','Bianchi','Bike by Gubi','Black Iron Horse','BMC','Brompton','Butchers & Bicycles','Cannondale','Canyon','Carqon','Centurion','Cervélo','Christiania Bikes','Colnago','Conway','Corratec','Cube','E-Fly','Early Rider','Electra','Everton','FACTOR','Felt','Focus','Frog Bikes','Gazelle','Ghost','Giant','GT','Gudereit','Haibike','Husqvarna','Kalkhoff','Kildemoes','Koga','Kona','Kreidler','Lapierre','Larry vs Harry / Bullitt','Lindebjerg','Liv','LOOK','Marin','Mate Bike','MBK','Merida','Momentum','Mondraker','Motobecane','Moustache','Nihola','Nishiki','Norden','Norco','Omnium','Orbea','Pegasus','Pinarello','Principia','Puky','Qio','QWIC','Raleigh','Riese & Müller','Ridley','Royal Cargobike','Santa Cruz','SCO','Scott','Seaside Bike','Silverback','Sparta','Specialized','Stevens','Superior','Tern','Trek','Triobike','Urban Arrow','uVelo','VanMoof','Velo de Ville','Victoria','Wilier','Winther','Woom','Yuba'];

function brandAutocomplete(input, listId) {
  const list = document.getElementById(listId);
  const q = input.value.toLowerCase().trim();
  if (!q) { list.style.display = 'none'; return; }
  const matches = KNOWN_BRANDS.filter(b => b.toLowerCase().startsWith(q)).slice(0, 6);
  if (!matches.length) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(b => `<div class="brand-autocomplete-item" onmousedown="selectBrand('${esc(b)}', '${input.id}', '${listId}')">${esc(b)}</div>`).join('');
  list.style.display = 'block';
}

function selectBrand(brand, inputId, listId) {
  const input = document.getElementById(inputId);
  if (input) input.value = brand;
  const list = document.getElementById(listId);
  if (list) list.style.display = 'none';
}

function filterBrandList() {
  const q = (document.getElementById('brand-filter-search')?.value || '').toLowerCase();
  document.querySelectorAll('#brand-filter-list .filter-option').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function expandBikeDesc() {
  const wrap = document.getElementById('bike-desc-wrap');
  const btn  = document.getElementById('bike-desc-btn');
  if (!wrap || !btn) return;
  wrap.classList.remove('is-clamped');
  btn.style.display = 'none';
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

function updateConditionGuide(selectId, guideId) {
  const val = document.getElementById(selectId)?.value || '';
  const guide = document.getElementById(guideId);
  if (!guide) return;
  guide.querySelectorAll('.cg-row').forEach(row => {
    row.classList.toggle('cg-active', row.dataset.cond === val);
    row.classList.toggle('cg-dim', val !== '' && row.dataset.cond !== val);
  });
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

function toggleSizeFitInfo() {
  const popup = document.getElementById('fit-info-popup');
  if (!popup) return;
  const visible = popup.style.display !== 'none';
  popup.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const close = (e) => { if (!e.target.closest('#fit-info-popup') && !e.target.closest('.fit-info-btn')) { popup.style.display = 'none'; document.removeEventListener('click', close); } };
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



/* ============================================================
   NULSTIL ADGANGSKODE – håndter token fra email-link
   ============================================================ */

async function handleResetPassword() {
  const pw1 = document.getElementById('reset-pw1').value;
  const pw2 = document.getElementById('reset-pw2').value;

  if (!pw1 || pw1.length < 8) { showToast('⚠️ Adgangskoden skal være mindst 8 tegn'); return; }
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

// Inbox — lazy-loaded (kun når bruger åbner indbakke eller /inbox route)
const _ensureInbox = lazyCtrl(
  () => import('./js/inbox.js'),
  'createInbox',
  () => ({
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
  }),
);
const renderMessages   = lazyMethod(_ensureInbox, 'renderMessages');
const loadInbox        = lazyMethod(_ensureInbox, 'loadInbox');
const openThread       = lazyMethod(_ensureInbox, 'openThread');
const closeThread      = lazyMethod(_ensureInbox, 'closeThread');
const acceptBid        = lazyMethod(_ensureInbox, 'acceptBid');
const sendReply        = lazyMethod(_ensureInbox, 'sendReply');
const openInboxModal   = lazyMethod(_ensureInbox, 'openInboxModal');
const closeInboxModal  = lazyMethod(_ensureInbox, 'closeInboxModal');
const renderInboxPage  = lazyMethod(_ensureInbox, 'renderInboxPage');
const loadInboxPage    = lazyMethod(_ensureInbox, 'loadInboxPage');
const loadInboxModal   = lazyMethod(_ensureInbox, 'loadInboxModal');
const openInboxThread  = lazyMethod(_ensureInbox, 'openInboxThread');
const closeInboxThread = lazyMethod(_ensureInbox, 'closeInboxThread');
const updateInboxBadge = lazyMethod(_ensureInbox, 'updateInboxBadge');

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
window.togglePasswordVisibility = togglePasswordVisibility;
window.updatePwStrength = updatePwStrength;
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
window.dismissOnboarding    = lazyExport(() => import('./js/onboarding.js'), 'dismissOnboarding');
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
window.setMaxWeight = function(kg) {
  const input = document.getElementById('sidebar-max-weight');
  if (!input) return;
  input.value = kg;
  applyFilters();
};
window.filterBrandList        = filterBrandList;
window.brandAutocomplete      = brandAutocomplete;
window.selectBrand            = selectBrand;
window.suggestFrameSize       = suggestFrameSize;
window.toggleWheelInfo        = toggleWheelInfo;
window.toggleSizeInfo         = toggleSizeInfo;
window.toggleSizeFitInfo      = toggleSizeFitInfo;
window.toggleConditionInfo    = toggleConditionInfo;
window.toggleSellConditionInfo = function() {
  const popup = document.getElementById('cg-sell');
  if (!popup) return;
  const isOpen = popup.style.display !== 'none';
  popup.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => {
      const close = (e) => { if (!e.target.closest('#cg-sell') && !e.target.closest('.wheel-info-btn')) { popup.style.display = 'none'; document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 0);
  }
};
window.updateConditionGuide   = updateConditionGuide;
window.expandBikeDesc         = expandBikeDesc;
window.startBikeQuiz          = startBikeQuiz;
window.quizPick               = quizPick;
window.quizBack               = quizBack;
window.resetQuiz              = resetQuiz;
window.applyQuizResult        = applyQuizResult;
window.suggestChildBikeSize   = suggestChildBikeSize;
window.toggleSidebarSection   = toggleSidebarSection;
window.openMobileFilters      = openMobileFilters;
window.closeMobileFilters     = closeMobileFilters;
window.clearAllFilters        = clearAllFilters;
window.removeFilterPill       = removeFilterPill;
window.loadBikesWithFilters   = loadBikesWithFilters;
window.loadMoreFilteredBikes  = function() { loadBikesWithFilters(currentFilterArgs, true); };
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
window.toggleAdvancedSpecs       = toggleAdvancedSpecs;
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
window.toggleMapBoundsFilter   = toggleMapBoundsFilter;
window.applyMapBoundsSearch    = applyMapBoundsSearch;
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


async function renderStaticPage(type) {
  const [{ renderStaticPageView }, { footerContent }] = await Promise.all([
    import('./js/static-pages.js'),
    import('./js/static-pages-content.js'),
  ]);
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

const _ensureAdminPanel = lazyCtrl(
  () => import('./js/admin-panel-ui.js'),
  'createAdminPanelUI',
  () => ({ loadDealerApplications, loadAllUsers, loadIdApplications }),
);
const openAdminPanel  = lazyMethod(_ensureAdminPanel, 'openAdminPanel');
const closeAdminPanel = lazyMethod(_ensureAdminPanel, 'closeAdminPanel');
const switchAdminTab  = lazyMethod(_ensureAdminPanel, 'switchAdminTab');

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

async function _callAdminAction(action, targetUserId) {
  const { data, error } = await supabase.functions.invoke('admin-actions', {
    body: { action, target_user_id: targetUserId },
  });
  if (error || data?.error) {
    return { ok: false, error: data?.error || error?.message || 'Ukendt fejl' };
  }
  return { ok: true };
}

async function approveDealer(userId) {
  const res = await _callAdminAction('approve_dealer', userId);
  if (!res.ok) { showToast('❌ ' + res.error); return; }
  showToast('✅ Forhandler godkendt og verificeret!');
  loadDealerApplications();
  loadAllUsers();
}

async function rejectDealer(userId) {
  if (!confirm('Afvis denne ansøgning og fjern forhandlerstatus?')) return;
  const res = await _callAdminAction('reject_dealer', userId);
  if (!res.ok) { showToast('❌ ' + res.error); return; }
  showToast('🗑️ Ansøgning afvist');
  loadDealerApplications();
}

async function revokeDealer(userId) {
  if (!confirm('Fjern verificering fra denne forhandler?')) return;
  const res = await _callAdminAction('revoke_dealer', userId);
  if (!res.ok) { showToast('❌ ' + res.error); return; }
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
  const res = await _callAdminAction('approve_id', userId);
  if (!res.ok) { showToast('❌ ' + res.error); return; }
  showToast('✅ ID godkendt — bruger har nu et blåt badge');
  loadIdApplications();
  supabase.functions.invoke('notify-message', {
    body: { type: 'id_approved', user_id: userId },
  }).catch(() => {});
  if (currentUser && currentUser.id === userId) {
    currentProfile = { ...currentProfile, id_verified: true, id_pending: false };
    updateVerifyUI();
    loadBikes();
  }
}

async function rejectId(userId) {
  if (!confirm('Afvis denne ID-ansøgning?')) return;
  const res = await _callAdminAction('reject_id', userId);
  if (!res.ok) { showToast('❌ ' + res.error); return; }
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

window.showBikeOnMap = function(bikeId) {
  closeBikeModal && closeBikeModal();
  if (window.location.pathname !== '/kort') {
    window._pendingMapBikeId = bikeId;
    navigateTo('/kort');
  } else {
    splitCardClick && splitCardClick(bikeId);
  }
};

