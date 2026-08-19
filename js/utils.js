/* ============================================================
   CYKELBØRSEN – js/utils.js
   Pure helper functions with no external dependencies.
   ============================================================ */

export const BASE_URL = 'https://cykelbørsen.dk';

/* Canonical-URL med afsluttende skråstreg.

   Prerenderede sider ligger som <rute>/index.html, og GitHub Pages serverer
   dem derfor på /rute/ MED skråstreg — et kald til /rute svarer 301 videre.
   Canonical pegede på formen UDEN skråstreg, altså på en adresse der
   omdirigerer, og sitemappet gjorde det samme for 213 af 214 URL'er.

   Resultatet var tre forskellige adresser for hver side: den Google kravlede,
   den canonical udpegede, og den sitemappet listede. Search Console viste det
   som 175 "Alternate page with proper canonical tag" og 25 "Page with
   redirect" — hver side blev hentet to gange for at ende samme sted.

   Dyrt netop her: 112 annoncesider står som "Discovered - currently not
   indexed", altså sider Google kender men ikke gider bruge kravlebudget på.
   Halvdelen af det budget gik til at gå i ring.

   Samme regel er replikeret i scripts/prerender.mjs og
   scripts/generate-sitemap.mjs. Ændres den ene, skal de to andre følge med. */
export function canonicalUrl(path) {
  const p = String(path || '/');
  if (p === '/' || p === '') return `${BASE_URL}/`;
  // Rør ikke ved noget med query eller fragment — de er ikke mappe-ruter.
  if (p.includes('?') || p.includes('#')) return BASE_URL + p;
  return BASE_URL + (p.endsWith('/') ? p : `${p}/`);
}
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

/* Password-validering — stærk nok til at stoppe de oplagte svage koder, men UDEN
   komplekse sammensætningskrav (krav om store/små bogstaver + tal + specialtegn)
   der skræmmer nye brugere. Filosofi (NIST 800-63B): længde + blokér de
   gættelige/lækkede koder slår sammensætningsregler. Returnerer { ok, message }.
   ctx kan indeholde { email, name } så koden ikke må være brugerens egen email/navn. */
export function validatePassword(pw, ctx = {}) {
  const v = String(pw || '');
  if (v.length < 8)  return { ok: false, message: 'Adgangskoden skal være mindst 8 tegn.' };
  if (v.length > 72) return { ok: false, message: 'Adgangskoden må højst være 72 tegn.' };
  const lower = v.toLowerCase();
  // De mest gættelige koder (inkl. et par danske + sitenavnet).
  const COMMON = new Set([
    '12345678', '123456789', '1234567890', 'password', 'password1', 'passw0rd',
    'qwerty123', 'qwertyui', '11111111', '00000000', 'iloveyou', 'welcome1',
    'adgangskode', 'kodeord12', 'sommer2024', 'sommer2025', 'danmark12',
    'cykelborsen', 'cykelboersen', 'christiania',
  ]);
  if (COMMON.has(lower)) return { ok: false, message: 'Den adgangskode er for nem at gætte — vælg en anden.' };
  if (/^(.)\1+$/.test(v)) return { ok: false, message: 'Undgå at gentage det samme tegn — vælg en mere unik kode.' };
  if (/^(01234567|12345678|23456789|34567890|abcdefgh|87654321|98765432)/.test(lower)) {
    return { ok: false, message: 'Undgå simple talrækker som 12345678 — vælg en mere unik kode.' };
  }
  const emailLocal = String(ctx.email || '').toLowerCase().split('@')[0];
  if (emailLocal.length >= 4 && lower.includes(emailLocal)) {
    return { ok: false, message: 'Adgangskoden må ikke indeholde din email.' };
  }
  const name = String(ctx.name || '').toLowerCase().trim();
  if (name.length >= 4 && lower === name) {
    return { ok: false, message: 'Adgangskoden må ikke være dit navn.' };
  }
  return { ok: true, message: '' };
}

export function formatLastSeen(dateStr, maxAgeHours = null) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  // Skjul gammel tilstedeværelse: "Aktiv for 5 dage siden" får en ung
  // markedsplads til at se død ud. Vis kun når det er friskt nok.
  if (maxAgeHours != null && diff > maxAgeHours * 3600000) return null;
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

/* Bogstav-størrelse (XS/S/M/L/XL) er mærke-afhængig og kun vejledende — cm-målet
   er det pålidelige. Træk KUN bogstavet ud af det gemte "M (53–56 cm)"-format,
   så den strenge cm-range ikke modsiger sælgerens mærke-størrelse (fx en Scott
   der markedsføres som L ved 56 cm, hvor vores skala kalder 56 for M).
   Returnerer fx "M", eller null hvis værdien ikke starter med et kendt bogstav. */
export function frameSizeLetter(size) {
  if (!size) return null;
  const m = String(size).trim().match(/^(XS|S|M|L|XL)\b/i);
  return m ? m[1].toUpperCase() : null;
}

/* Fakta til annoncekortets meta-linje — KUN dem der faktisk findes.
   Årstal og størrelse er de to mindst udfyldte felter i basen (kun ~3 % af
   annoncerne har en stelstørrelse), og netop dem havde kortene hardcodet med
   "–" som fallback. Resultatet var "Citybike · –" på næsten hvert eneste kort.
   En tankestreg ser ud som en fejl; fravær ser ud som en beslutning.
   Rækkefølgen er prioriteret: de mest købsrelevante fakta først. Felter der
   ikke er hentet i den pågældende query er bare undefined og springes over. */
export function bikeMetaFacts(b, max = 2) {
  if (!b) return [];
  const out = [];
  if (b.year) out.push(String(b.year));
  const sz = b.size_cm ? `${b.size_cm} cm` : (frameSizeLetter(b.size) || b.size || '');
  if (sz) out.push(`Str. ${sz}`);
  if (b.warranty) out.push('Garanti');
  const color = Array.isArray(b.colors) && b.colors.length ? b.colors[0] : b.color;
  if (color) out.push(String(color));
  return out.slice(0, max);
}

/* Små inline-SVG-ikoner til trust-badges (sælgertype, garanti). currentColor
   arver badgens tekstfarve, ~1em så de flugter med teksten. Erstatter emoji
   (🏪/👤/🛡️) der renderede forskelligt pr. styresystem og brød det editorial-
   udtryk. Skjold-stien er den samme som tyveri-tippet — bevidst konsistens.
   Størrelsen kan overstyres (fx iconShield(28)) til de steder hvor ikonet er
   et selvstændigt grafisk element frem for et inline-badge. Stregtykkelsen
   skaleres ned ved store størrelser, så de ikke bliver klodsede. */
const _svgIcon = (paths, size = 13) => {
  const sw = size >= 28 ? 1.5 : size >= 20 ? 1.75 : 2;
  const va = size <= 16 ? 'vertical-align:-2px;' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="${va}" aria-hidden="true">${paths}</svg>`;
};
export const iconDealer  = (s) => _svgIcon('<path d="M3 9l1.5-5h15L21 9"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>', s);
export const iconPrivate = (s) => _svgIcon('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>', s);
export const iconShield  = (s) => _svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', s);
// Cykel — bruges på kort-markører hvor den parres med iconDealer (privat annonce
// vs. forhandler). To hjul, stel og styr; holdt enkel så den er læsbar ved 16-18 px.
export const iconHeart   = (s) => _svgIcon('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>', s);
export const iconBell    = (s) => _svgIcon('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>', s);
export const iconShare   = (s) => _svgIcon('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>', s);
export const iconPin     = (s) => _svgIcon('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>', s);
export const iconMail    = (s) => _svgIcon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>', s);
export const iconCart    = (s) => _svgIcon('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6"/>', s);
export const iconTag     = (s) => _svgIcon('<path d="M20.6 12.6 12 21.2l-8.5-8.5V3.5H12z"/><circle cx="7.8" cy="7.8" r="1.3"/>', s);
export const iconWrench  = (s) => _svgIcon('<path d="M14.7 6.3a4 4 0 1 0 5 5L21 21H3l9.7-15.7z"/>', s);
export const iconPencil  = (s) => _svgIcon('<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', s);
export const iconBike    = (s) => _svgIcon('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M5.5 17.5l4-9h5l3 9M9.5 8.5h-2M14.5 8.5l-5 9"/>', s);

/* ── PRIS ──────────────────────────────────────────────────────
   "Gives væk"-annoncer har price = 0. De må ALDRIG vises som "0 kr.", så al
   prisvisning går gennem priceLabel(). Der findes over tyve steder i
   kodebasen der formaterer en pris; hvis hvert af dem selv skulle huske
   at tjekke is_giveaway, ville nogle af dem lade være. Ét sted i stedet.

   priceLabel(bike)  → "Gives væk" | "4.500 kr."
   priceText(bike)   → samme, men uden markup — til <title>, meta-tags og
                       alt hvor strengen ikke lander i HTML.
   GIVEAWAY_LABEL    → den kanoniske tekst, så den kan ændres ét sted. */
export const GIVEAWAY_LABEL = 'Gives væk';
export const isGiveaway = (b) => !!(b && (b.is_giveaway || (b.price === 0 && b.price != null)));
export function priceText(b) {
  if (isGiveaway(b)) return GIVEAWAY_LABEL;
  const n = Number(b?.price);
  return Number.isFinite(n) ? `${n.toLocaleString('da-DK')} kr.` : '';
}
// Til HTML: gaven får en klasse så den kan sættes i en anden farve end en
// rigtig pris, uden at kaldsstedet skal vide noget om det.
export function priceLabel(b) {
  return isGiveaway(b)
    ? `<span class="price-giveaway">${GIVEAWAY_LABEL}</span>`
    : priceText(b);
}

// Escape en værdi til brug som JS-streng inde i et inline on*-attribut (dobbelt-quoted),
// fx onclick="fn('HER')". Forhindrer BÅDE attribut-breakout (") og JS-string-breakout
// (' og \). Brug esc() til almindeligt tekst-indhold; escAttr() KUN til on*-handler-args.
export function escAttr(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// Trim brand+model. Behandler '-', '.', '?', tomme strenge og kun-whitespace
// som "ingen model" så vi ikke får 'MBK -' eller 'Trek ?' i kortet.
export function bikeTitle(brand, model) {
  const b = (brand == null ? '' : String(brand)).trim();
  const m = (model == null ? '' : String(model)).trim();
  if (!m || /^[-.?_/\\]+$/.test(m)) return b;
  return `${b} ${m}`.trim();
}

export function removeBikeJsonLd() {
  const old = document.getElementById('bike-jsonld');
  if (old) old.remove();
}

export function updateSEOMeta(description, canonicalPath, opts) {
  const desc = description || DEFAULT_DESC;
  // Skal give SAMME adresse som prerenderingen skrev, ellers modsiger den
  // rå HTML og den JS-rendrede DOM hinanden om hvad canonical er.
  const url = canonicalUrl(canonicalPath);
  const metaDesc = document.getElementById('meta-description');
  if (metaDesc) metaDesc.setAttribute('content', desc);
  const canonical = document.getElementById('canonical-link');
  if (canonical) canonical.setAttribute('href', url);
  const setProp = (prop, val) => {
    if (val == null) return;
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  const setName = (name, val) => {
    if (val == null) return;
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  setProp('og:description', desc);
  setProp('og:url', url);
  setName('twitter:description', desc);
  const title = (opts && opts.title) || document.title;
  if (title) {
    setProp('og:title', title);
    setName('twitter:title', title);
  }
  if (opts && opts.image) {
    setProp('og:image', opts.image);
    setName('twitter:image', opts.image);
    if (opts.imageAlt) setProp('og:image:alt', opts.imageAlt);
  }
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
