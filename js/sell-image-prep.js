/* ────────────────────────────────────────────────────────────────
   sell-image-prep.js — billedet gøres klar i det øjeblik det lægges ind

   Sælg-flowet lagde indtil nov. 2026 brugerens originalfil i listen, og
   uploadImages() i image-upload.js sendte den uændret til den offentlige
   bucket, med EXIF (kamera, tidspunkt og ofte GPS) intakt. Rediger annonce
   og opret udlejning rensede ved modtagelsen; sælg-flowet var det eneste
   sted der ikke gjorde.

   Rensningen sker HER, ved modtagelsen, og ikke i uploadImages(), fordi
   image-upload.js importeres statisk i main.js og kan ligge i en gammel
   udgave i browserens eller Cloudflares cache. Lægger vi den rensede fil i
   listen, uploader også en gammel uploadImages() den rensede fil. Det
   dækker både uploadImages og uploadImagesNoInsert (admin på vegne af en
   forhandler), fordi begge uploader item.file.

   Originalen gemmes ikke. AI-versionen laves med det samme fra originalen
   (højere opløsning, så små logoer kan læses) og er også renset.

   Størrelsesgrænsen tjekkes EFTER komprimering. Tidligere blev en 48 MP-
   JPEG på 12 MB afvist, selv om den efter komprimering fylder ca. 200 KB.
──────────────────────────────────────────────────────────────── */

import { toStrippedBlob, isGif } from './image-strip.js';

const MAX_RESULT_MB = 10;   // efter komprimering; bucket-grænsen er den samme
const MAX_RAW_MB    = 60;   // værn mod at telefonen løber tør for hukommelse
const DISPLAY_DIM   = 1200;
const AI_DIM        = 2000;

const HEIC_RE  = /\.(heic|heif)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;

const isHeic = (file) =>
  /image\/hei[cf]/i.test(file.type || '') || HEIC_RE.test(file.name || '');

/* Ligner filen et billede? Tom type sker på nogle Android-vælgere og for
   filer fra skytjenester; dem prøver vi at afkode i stedet for at afvise. */
function looksLikeImage(file) {
  const type = file.type || '';
  if (type.startsWith('image/')) return true;
  // Ukendt type: prøv at afkode. Lykkes det ikke, afvises filen alligevel
  // af toStrippedBlob, så der er intet at miste ved at forsøge.
  if (type === '' || type === 'application/octet-stream') return true;
  return IMAGE_RE.test(file.name || '');
}

function baseName(file) {
  return (file.name || 'billede').replace(/\.[^.]+$/, '') || 'billede';
}

/**
 * Gør ét billede klar til sælg-flowet.
 *
 * @param {File} file  Filen som brugeren valgte.
 * @param {object} [opts]
 * @param {boolean} [opts.forAI=true]  Lav også AI-versionen. AI-analysen
 *   bruger højst fire billeder, så de øvrige sparer en ekstra afkodning.
 * @returns {Promise<{ ok: true, file: File, aiFile: File|null }
 *                  | { ok: false, reason: string, message: string }>}
 *   reason er en af: empty, type, size, heic, decode. Den bruges i tragten
 *   (img_rejected_<reason>) og må derfor ikke indeholde filnavnet.
 */
export async function prepareSellImage(file, { forAI = true } = {}) {
  const name = file?.name || 'Billedet';

  if (!file || file.size === 0) {
    return { ok: false, reason: 'empty', message: `"${name}" er tom og kan ikke bruges.` };
  }
  if (!looksLikeImage(file)) {
    return { ok: false, reason: 'type', message: `"${name}" er ikke et billede.` };
  }
  if (file.size > MAX_RAW_MB * 1024 * 1024) {
    return { ok: false, reason: 'size', message: `"${name}" er for stort (over ${MAX_RAW_MB} MB). Vælg et mindre billede.` };
  }

  // GIF har ingen EXIF-blok, og et canvas-gennemløb ville gøre en animation
  // til ét billede. Samme undtagelse som i image-strip.js.
  if (isGif(file)) {
    if (file.size > MAX_RESULT_MB * 1024 * 1024) {
      return { ok: false, reason: 'size', message: `"${name}" er for stort (maks ${MAX_RESULT_MB} MB).` };
    }
    return { ok: true, file, aiFile: null };
  }

  let display;
  try {
    display = await toStrippedBlob(file, DISPLAY_DIM, 'image/webp', 0.78);
  } catch (e) {
    // Kan vi ikke afkode det, kan vi ikke rense det, og så må det ikke
    // sendes nogen steder. Reglen i image-strip.js.
    if (isHeic(file)) {
      return {
        ok: false, reason: 'heic',
        message: `"${name}" er et HEIC-billede, som denne browser ikke kan åbne. Vælg billedet fra Fotos i stedet for Filer, eller gem det som JPG først.`,
      };
    }
    return { ok: false, reason: 'decode', message: `"${name}" kunne ikke åbnes. Prøv et andet billede.` };
  }

  // Nogle browsere (ældre Safari) laver PNG når de ikke kan skrive WebP.
  const ext  = display.type === 'image/webp' ? 'webp' : display.type === 'image/jpeg' ? 'jpg' : 'png';
  const type = display.type || 'image/webp';
  if (display.size > MAX_RESULT_MB * 1024 * 1024) {
    return { ok: false, reason: 'size', message: `"${name}" er for stort, også efter komprimering (maks ${MAX_RESULT_MB} MB).` };
  }
  const cleaned = new File([display], `${baseName(file)}.${ext}`, { type });

  // AI-versionen: højere opløsning, også renset. Fejler den, bruger
  // AI-analysen display-versionen, som allerede er renset.
  let aiFile = null;
  if (forAI) try {
    const aiBlob = await toStrippedBlob(file, AI_DIM, 'image/jpeg', 0.92);
    aiFile = new File([aiBlob], `${baseName(file)}-ai.jpg`, { type: 'image/jpeg' });
  } catch { aiFile = null; }

  return { ok: true, file: cleaned, aiFile };
}
