/* ────────────────────────────────────────────────────────────────
   image-strip.js — intet billede forlader enheden med sin metadata

   Reglen, kort: alt hvad brugeren vælger, skal gennem toStrippedBlob før
   det uploades til Storage eller sendes til en tredjepart.

   HVORFOR DET HAR SIT EGET MODUL
   Et cykelfoto tages hjemme i gården eller i kælderen. Telefonen skriver
   GPS-koordinaterne ind i billedets EXIF. Uploader man filen uændret,
   offentliggør man sælgerens hjemmeadresse sammen med et billede af en
   dyr cykel. Det er både en sikkerhedsrisiko for brugeren og persondata
   der behandles uden formål.

   Et canvas-gennemløb fjerner EXIF. Ikke fordi canvas er et
   metadata-værktøj, men fordi den tegner pixels om fra bunden og
   ingenting andet følger med.

   Den var indtil nu en sideeffekt af komprimering, kopieret ind i fire
   funktioner i tre filer — og alle fire havde nået at få deres egne
   genveje der returnerede originalfilen: "spring over hvis WebP under
   500 KB", "spring over hvis under 4 MB", "brug originalen hvis
   komprimeringen fejler". Hver genvej var fornuftig set som en
   komprimeringsbeslutning. Set som en persondatabeslutning var de alle
   forkerte, og profilbilleder gik slet ikke igennem.

   Derfor bor den her, alene, med ét navn der siger hvad den er til for.

   Den KASTER hvis billedet ikke kan afkodes, i stedet for at falde
   tilbage til originalen. Kan vi ikke afkode det, kan vi ikke strippe
   det, og så må det ikke sendes nogen steder. Som sidegevinst er det et
   indholdsbaseret filtypetjek: en fil der hedder .jpg men ikke er et
   billede, fejler her — den almindelige validering stoler kun på
   file.type, som browseren udleder af filendelsen.
──────────────────────────────────────────────────────────────── */

const DECODE_TIMEOUT_MS = 15000;

/* GIF er den ene undtagelse, og det er ikke en genvej: GIF-formatet har
   slet ingen EXIF-blok, så der er ingen GPS at fjerne. Et canvas-gennemløb
   ville til gengæld reducere en animation til dens første billede. */
export const isGif = (file) => file?.type === 'image/gif';

/**
 * Afkoder et billede og tegner det om på et canvas uden metadata.
 *
 * @param {File|Blob} file    Brugerens fil.
 * @param {number}    maxDim  Længste side i px; mindre billeder skaleres ikke op.
 * @param {string}    mime    Output-format, fx 'image/webp'.
 * @param {number}    quality 0-1.
 * @returns {Promise<Blob>}   Uden EXIF. Kaster hvis billedet ikke kan afkodes.
 */
export async function toStrippedBlob(file, maxDim, mime, quality) {
  let objectUrl = null;
  try {
    let source = null;

    // createImageBitmap respekterer EXIF-orienteringen, så et iPhone-
    // portrætbillede ikke ender med at ligge ned når EXIF forsvinder.
    if (typeof createImageBitmap === 'function') {
      try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch { source = null; }
    }

    if (!source) {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => reject(new Error('Billede timeout')), DECODE_TIMEOUT_MS);
        img.onload  = () => { clearTimeout(timeout); resolve(img); };
        img.onerror = () => { clearTimeout(timeout); reject(new Error('Kunne ikke læse billede')); };
        img.src = objectUrl;
      });
    }

    let width  = source.width  || source.naturalWidth;
    let height = source.height || source.naturalHeight;
    if (!width || !height) throw new Error('Billede har ingen dimensioner');

    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width  = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas ikke tilgængelig');
    ctx.drawImage(source, 0, 0, width, height);
    if (source.close) source.close();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality));
    if (!blob || blob.size === 0) throw new Error('Canvas gav en tom fil');
    return blob;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
