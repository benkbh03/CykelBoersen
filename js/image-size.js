/* Billed-URL'er i den størrelse de vises i.

   Næsten alle annoncebilleder (95 af 98 aktive primærbilleder, 18. okt.)
   kommer fra forhandler-feeds og peger direkte på cdn.shopify.com i fuld
   størrelse, i snit 87 KB pr. billede. Shopifys CDN skalerer selv, når
   URL'en får ?width=: et kort i 600 px vejer ca. 37 KB. Egne uploads har
   allerede thumb_url (800 px WebP) og bruges uændret.

   Ny fil med vilje: en ny eksport i et eksisterende, statisk importeret
   modul kan møde en cachet gammel udgave (se CLAUDE.md). */

const SHOPIFY_HOST = 'cdn.shopify.com';

/* Kort: to kolonner på en telefon er ca. 180 px brede, op til 3x tæthed. */
export const CARD_IMAGE_WIDTH = 600;
/* Galleriets hovedbillede og lightbox. Shopify forstørrer aldrig, så et
   mindre original kommer uændret. */
export const GALLERY_IMAGE_WIDTH = 1600;

export function sizedImageUrl(url, width) {
  if (!url || !width) return url;
  let u;
  try { u = new URL(url); } catch { return url; }
  if (u.hostname !== SHOPIFY_HOST) return url;
  u.searchParams.set('width', String(width));
  return u.toString();
}

/* Kortbillede for én bike_images-række: egen thumbnail, ellers den
   skalerede original. */
export function cardImageUrl(rec) {
  if (!rec) return null;
  return rec.thumb_url || sizedImageUrl(rec.url, CARD_IMAGE_WIDTH) || null;
}
