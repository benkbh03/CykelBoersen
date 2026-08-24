/* ────────────────────────────────────────────────────────────────
   feature-flags.js — funktioner der er bygget, men ikke sluppet løs endnu

   Udlejning er færdigkodet, men flowet er ikke gennemtestet med rigtige
   betalinger og Stripe Connect-konti. Indtil det er sket, skal almindelige
   brugere ikke kunne finde det, mens admin skal kunne bruge det som normalt.

   "Ikke kunne finde" dækker tre ting, og alle tre skal være på plads:
     1. Ingen links nogen steder i brugerfladen
     2. Ruterne sender ikke-admins hjem i stedet for at rendere en halvfærdig
        funktion, hvis nogen kender adressen
     3. Siderne er taget ud af sitemap.xml og markeret noindex, så Google
        hverken indekserer eller viser dem. Uden det punkt er de stadig
        offentlige statiske filer på GitHub Pages, uanset hvad JS'en gør.

   Sæt RENTAL_ADMIN_ONLY til false når flowet er testet. Det er det eneste
   sted der skal ændres i frontenden; sitemap og noindex styres af
   scripts/generate-sitemap.mjs og scripts/prerender.mjs.
──────────────────────────────────────────────────────────────── */

export const RENTAL_ADMIN_ONLY = true;

/** Må denne profil se og bruge udlejning? */
export function rentalAllowed(profile) {
  return !RENTAL_ADMIN_ONLY || !!profile?.is_admin;
}

/**
 * Slå udlejnings-links til og fra i brugerfladen.
 *
 * Klassen sidder på <body> og er sat i index.html fra start, ikke af JS.
 * Ellers ville linkene nå at blive tegnet i det sekund der går før auth er
 * afklaret, og så ville de blinke forbi for alle besøgende.
 */
export function applyFeatureFlags(profile) {
  document.body.classList.toggle('rental-hidden', !rentalAllowed(profile));
}
