/* ============================================================
   CYKELBØRSEN – js/utils.js
   Pure helper functions with no external dependencies.
   ============================================================ */

export const BASE_URL = 'https://cykelbørsen.dk';
const DEFAULT_DESC = 'Danmarks markedsplads for brugte cykler. Køb og sælg racercykler, mountainbikes, el-cykler og meget mere. Gratis at oprette annonce. Fra private sælgere og autoriserede forhandlere.';

// Hjælper: deaktiver knap og vis spinner, returnerer gendan-funktion
export function btnLoading(id, label) {
  const btn = document.getElementById(id);
  if (!btn) return () => {};
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${label || ''}`;
  return () => { btn.disabled = false; btn.innerHTML = orig; };
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function formatLastSeen(dateStr) {
  if (!dateStr) return 'Ukendt';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'Aktiv lige nu';
  if (min < 60) return `Aktiv for ${min} min. siden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Aktiv for ${h} t. siden`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Aktiv i går';
  if (d < 7) return `Aktiv for ${d} dage siden`;
  return 'Aktiv for over en uge siden';
}

export function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function removeBikeJsonLd() {
  const old = document.getElementById('bike-jsonld');
  if (old) old.remove();
}

export function updateSEOMeta(description, canonicalPath) {
  const desc = description || DEFAULT_DESC;
  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', desc);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.setAttribute('href', canonicalPath ? BASE_URL + canonicalPath : BASE_URL + '/');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', canonicalPath ? BASE_URL + canonicalPath : BASE_URL + '/');
}

export function safeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return esc(url);
  } catch { return null; }
}

export function trapFocus(modalEl) {
  const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const els = () => Array.from(modalEl.querySelectorAll(focusable));
  const first = () => els()[0];
  const last  = () => els()[els().length - 1];

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const all = els();
    if (!all.length) return;
    if (e.shiftKey) {
      if (document.activeElement === first()) { e.preventDefault(); last().focus(); }
    } else {
      if (document.activeElement === last())  { e.preventDefault(); first().focus(); }
    }
  }

  modalEl.addEventListener('keydown', onKeyDown);
  requestAnimationFrame(() => { const f = first(); if (f) f.focus(); });
  return () => modalEl.removeEventListener('keydown', onKeyDown);
}

const _focusTrapCleanup = {};

export function enableFocusTrap(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (_focusTrapCleanup[modalId]) _focusTrapCleanup[modalId]();
  _focusTrapCleanup[modalId] = trapFocus(el);
}

export function disableFocusTrap(modalId) {
  if (_focusTrapCleanup[modalId]) {
    _focusTrapCleanup[modalId]();
    delete _focusTrapCleanup[modalId];
  }
}

export function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function stableOffset(id, axis) {
  let h = axis === 0 ? 0x811c9dc5 : 0xdeadbeef;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x1000193) >>> 0;
  return (h / 0xFFFFFFFF) - 0.5;
}

export function getInitials(name, fallback = "U") {
  const base = (name || fallback).toString().trim();
  return (base || fallback).substring(0, 2).toUpperCase();
}


export function formatDistanceKm(km) {
  if (km < 1)  return (Math.round(km * 10) / 10).toString().replace('.', \,') + ' km';
  if (km < 10) return (Math.round(km * 10) / 10).toString().replace('.', \,') + ' km';
  return Math.round(km) + ' km';
}
