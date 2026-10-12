/* ============================================================
   CYKELBØRSEN – js/env.js
   Vælger database ud fra hvor siden kører.

   Produktion = det rigtige domæne. Alt andet (localhost, preview-links
   fra Cloudflare Pages, *.github.io) bruger staging-projektet, så en
   test aldrig skriver i rigtige brugeres data.

   Er STAGING ikke udfyldt endnu, falder alt tilbage til produktion,
   præcis som før denne fil fandtes.
   ============================================================ */

const PRODUCTION_HOSTS = [
  'cykelbørsen.dk',
  'xn--cykelbrsen-5cb.dk',
  'www.xn--cykelbrsen-5cb.dk',
];

const PRODUCTION = {
  url: 'https://ktufgncydxhkhfttojkh.supabase.co',
  key: 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B',
};

// Udfyldes når staging-projektet er oprettet i Supabase. Husk også at
// tilføje staging-adressen til connect-src i CSP'en i index.html.
const STAGING = {
  url: '',
  key: '',
};

const host = typeof location !== 'undefined' ? location.hostname : '';

export const IS_PRODUCTION = PRODUCTION_HOSTS.includes(host);
export const IS_STAGING = !IS_PRODUCTION && !!STAGING.url;

export const SUPABASE_ENV = IS_STAGING ? STAGING : PRODUCTION;

/* En tydelig bjælke på staging, så man aldrig er i tvivl om hvilken
   database man klikker rundt i. */
if (IS_STAGING && typeof document !== 'undefined') {
  const show = () => {
    if (document.getElementById('staging-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'staging-bar';
    bar.textContent = 'Staging: testdata, ikke den rigtige side';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:10001;'
      + 'padding:var(--space-1) var(--space-3);text-align:center;'
      + 'background:var(--rust);color:var(--cream);font:var(--weight-semibold) var(--text-xs)/1.4 var(--font-sans);'
      + 'pointer-events:none;';
    document.body.appendChild(bar);
  };
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
}
