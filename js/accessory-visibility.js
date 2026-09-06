/* ────────────────────────────────────────────────────────────────
   accessory-visibility.js — vis Cykler|Tilbehør-kontakten når der ER tilbehør

   Kontakten er en hård top-level opdeling og hører hjemme ved siden af
   resultaterne den styrer. Men med nul tilbehørsannoncer var den ren
   dekoration: den eneste tilstand nogen nogensinde så, var "Cykler", og
   den brugte den mest værdifulde plads på siden — lige ved overskriften —
   på et valg der ikke fandtes.

   Selve kategori-aksen er IKKE fjernet. `category` løber gennem sælg-flow,
   filtre, tællere, autocomplete og Cykelagenten, og tilbehør er inden for
   scope ifølge STRATEGI.md. Det er kun kontakten der gemmes væk.

   VIGTIGT: synligheden er datastyret, ikke et flag nogen skal huske at
   slå til igen. Så snart den første tilbehørsannonce findes, dukker
   kontakten op af sig selv ved næste indlæsning. Sælgere kan oprette
   tilbehør imens, fordi sælg-flowet har sit eget kategorivalg uafhængigt
   af denne kontakt.

   Tælles på data der allerede er hentet i loadInitialData — ingen ekstra
   forespørgsel.
──────────────────────────────────────────────────────────────── */

/**
 * @param {Array<{category?: string}>|null|undefined} rows
 *   Alle aktive annoncer, begge kategorier. Skal indeholde `category`.
 */
export function applyAccessoryVisibility(rows) {
  const wrap = document.querySelector('.browse-cat-wrap');
  if (!wrap) return;

  /* Kan vi ikke se dataene, skjuler vi ikke noget. En fejlet forespørgsel
     må aldrig få en funktion til at forsvinde — så ville et netværksglitch
     ligne en produktbeslutning. */
  if (!Array.isArray(rows)) { wrap.hidden = false; return; }

  const harTilbehoer = rows.some(r => r?.category === 'tilbehoer');
  wrap.hidden = !harTilbehoer;
}
