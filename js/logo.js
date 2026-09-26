/* ────────────────────────────────────────────────────────────────
   logo.js — ordmærket "cykelbørsen", hvor ø'et er en kursgraf

   Egen fil og ikke i ui-icons.js: en ny eksport i et eksisterende modul
   dræbte siden for besøgende med cache den 25. sep. (CLAUDE.md, mønster-
   tabellen). Header og footer i index.html har samme markup statisk, så
   logoet står der fra første tegning; brug logoHtml() alle andre steder.

   variant: 'light' (mørk tekst på lys baggrund) | 'dark' (lys tekst på
   mørk baggrund). CSS: .logo i css/01-base.css.
──────────────────────────────────────────────────────────────── */

export const LOGO_OE_SVG =
  '<svg class="logo-oe" viewBox="14 -12 72 124" aria-hidden="true" overflow="visible">'
  + '<circle cx="50" cy="54" r="30" fill="none" stroke="currentColor" stroke-width="12"/>'
  + '<polyline points="10,94 28,72 40,78 50,54 60,58 72,34 90,14" fill="none"'
  + ' stroke="var(--logo-accent)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>';

export function logoHtml({ variant = 'light' } = {}) {
  const v = variant === 'dark' ? 'dark' : 'light';
  return `<a href="/" class="logo logo--${v}" aria-label="Cykelbørsen – forside">`
    + '<span aria-hidden="true">cykelb</span>' + LOGO_OE_SVG
    + '<span aria-hidden="true" class="logo-r">rsen</span></a>';
}
