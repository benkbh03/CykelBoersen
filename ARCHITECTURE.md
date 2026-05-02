# Frontend Architecture (Modularized)

This document maps responsibilities after the `main.js` split so humans and AI agents can navigate faster.

## Entry point
- `main.js`
  - App bootstrap and cross-feature orchestration.
  - Imports feature modules and wires global handlers.

## Core shared modules
- `js/supabase-client.js`: shared Supabase client instance.
- `js/config.js`: app constants (`BIKES_PAGE_SIZE`, `MAP_PAGE_LIMIT`, `STATIC_PAGE_ROUTES`).
- `js/utils.js`: shared pure helpers (`esc`, `debounce`, `getInitials`, `formatDistanceKm`, etc.).
- `js/ui-feedback.js`: generic UI feedback (`showToast`, `retryHTML`).

## Feature modules extracted from `main.js`
- `js/dawa-autocomplete.js`: address/city autocomplete and DAWA data extraction.
- `js/search-autocomplete.js`: search-box autocomplete handlers.
- `js/realtime-notifications.js`: Supabase realtime channel lifecycle.
- `js/inbox-badge.js`: unread message count + badge rendering.
- `js/share-actions.js`: share modal logic.
- `js/sold-actions.js`: mark-as-sold flow + buyer picker.
- `js/admin-panel-ui.js`: admin modal/tab switching behavior.
- `js/footer-actions.js`: footer/contact modal actions.
- `js/static-pages-content.js`: static page content data.
- `js/static-pages.js`: static page renderer.
- `js/onboarding.js`: onboarding banner show/dismiss.
- `js/quick-replies.js`: quick reply generation and actions.
- `js/email-confirmation.js`: email confirmation banner actions.
- `js/nav-avatar.js`: navbar avatar rendering.
- `js/view-switcher.js`: listing/map view switch logic.
- `js/section-nav.js`: section navigation helper.
- `js/dealer-modal-actions.js`: dealer modal action helpers.
- `js/dealer-guards.js`: pending dealer guards.
- `js/auth.js`: login/register/forgot-password/Google OAuth handlers + login modal open/close.

## Practical rule of thumb
When adding/changing functionality:
1. Put pure formatting/helper logic in `js/utils.js`.
2. Put feature-specific UI behavior in a dedicated `js/<feature>.js` module.
3. Keep `main.js` as orchestration glue (imports + wiring), not implementation-heavy.
