/* ============================================================
   CYKELBØRSEN – js/utils.js
   Pure helper functions with no external dependencies.
   ============================================================ */

export const BASE_URL = 'https://cykelbørsen.dk';
const DEFAULT_DESC = 'Danmarks dedikerede markedsplads for nye og brugte cykler. Køb og sælg racercykler, mountainbikes, el-cykler og meget mere. Gratis at oprette annonce. Fra private sælgere og autoriserede forhandlere.';

// Hjælper: deaktiver knap og vis spinner, returnerer gendan-funktion
export function btnLoading(id, label) {
  const btn = document.getElementById(id);
  if (!btn) return () => {};
  btn.disabled = true;
  btn.dataset.origText = btn.innerHTML;
  btn.innerHTML = `<span class="btn-spinner"></span>${label}`;
  return () => { btn.disabled = false; btn.innerHTML = btn.dataset.origText; };
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function formatLastSeen(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5)   return 'Netop aktiv';
  if (mins < 60)  return `Aktiv for ${mins} min. siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Aktiv for ${hrs} ${hrs === 1 ? 'time' : 'timer'} siden`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `Aktiv for ${days} ${days === 1 ? 'dag' : 'dage'} siden`;
  return 'Aktiv for over en uge siden';
}

/* Relativ tid til annonce-historik ("Oprettet for X dage siden").
   Forskellig fra formatLastSeen ved at den ikke har "Netop aktiv"-prefix
   og dækker længere tidsspænd op til "over et år siden". */
export function formatRelativeAge(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return mins <= 1 ? 'lige nu' : `for ${mins} min. siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `for ${hrs} ${hrs === 1 ? 'time' : 'timer'} siden`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `for ${days} ${days === 1 ? 'dag' : 'dage'} siden`;
  const months = Math.floor(days / 30);
  if (months < 12) return `for ${months} ${months === 1 ? 'måned' : 'måneder'} siden`;
  const years = Math.floor(days / 365);
  return `for ${years} ${years === 1 ? 'år' : 'år'} siden`;
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

/* Supabase image-transformation: konverterer en /object/public/-URL til
   /render/image/public/ med width + quality, så browseren modtager et
   thumbnail i passende størrelse i stedet for original-billedet.
   Kræver Supabase Pro-plan. Returnerer original-URL hvis input ikke er en
   Supabase storage-URL. */
// Sættes ved init() i main.js fra config.IMAGE_TRANSFORMS_ENABLED.
let _imageTransformsEnabled = true;
export function setImageTransformsEnabled(v) { _imageTransformsEnabled = !!v; }

export function transformImageUrl(url, { width, height, quality = 75, resize } = {}) {
  if (!_imageTransformsEnabled) return url;
  if (!url || typeof url !== 'string') return url;
  // Match kun Supabase /storage/v1/object/public/ URLs
  const idx = url.indexOf('/storage/v1/object/public/');
  if (idx === -1) return url;
  const base = url.slice(0, idx);
  const rest = url.slice(idx + '/storage/v1/object/public/'.length);
  // Strip eksisterende query-string fra rest
  const qIdx = rest.indexOf('?');
  const path = qIdx === -1 ? rest : rest.slice(0, qIdx);
  const params = new URLSearchParams();
  if (width)  params.set('width',  String(width));
  if (height) params.set('height', String(height));
  if (quality) params.set('quality', String(quality));
  // Brug kun resize når BÅDE width og height er angivet — ellers kan Supabase
  // crop-mode klippe billedet uventet (CSS object-fit klarer croppingen i UI).
  if (resize && width && height) params.set('resize', resize);
  return `${base}/storage/v1/render/image/public/${path}?${params.toString()}`;
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
  if (km < 1)  return (Math.round(km * 10) / 10).toString().replace('.', ',') + ' km';
  if (km < 10) return (Math.round(km * 10) / 10).toString().replace('.', ',') + ' km';
  return Math.round(km) + ' km';
}
