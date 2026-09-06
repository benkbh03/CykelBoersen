/* ────────────────────────────────────────────────────────────────
   tab-scroll.js — pile på en fanerække der er bredere end skærmen

   Cykeltyperne blev faneblade i stedet for piller. Det løste at "Alle" og
   "Alle typer" lignede to markeringer i samme kontrol, men det kostede en
   ting piller havde gratis: en pille der bliver klippet midt i sin runde
   form SIGER at der er mere. En fane klippet flugtende gør ikke.

   Målt ved 1024px: rækken er 770px bred i et felt på 523px. Fire typer —
   Ladcykel, Børnecykel, Senior og halvdelen af Gravel — lå uden for kanten,
   og intet på skærmen antydede det. En udtoning alene var ikke nok: den
   sidste synlige fane sluttede tilfældigvis lige før udtoningen, så der var
   ikke noget at tone ud, og rækken så stadig afsluttet ud.

   Pilene vises KUN når der faktisk er noget at rulle til, og de opdateres
   ved rul, ved ændret vindue og når rækken bygges om (tilbehør har 29 typer
   mod cyklernes 9). På touch ruller man med fingeren; pilene skader ikke,
   men de er primært til mus og tastatur.
──────────────────────────────────────────────────────────────── */

const TOLERANCE = 2;   // Delpixel-afrundinger må ikke tænde en pil der intet gør.
const SPRING    = 220; // px pr. klik. Ca. to faner, så man beholder overblikket.

function opdater(felt, venstre, hoejre) {
  const maks = felt.scrollWidth - felt.clientWidth;
  venstre.hidden = felt.scrollLeft <= TOLERANCE;
  hoejre.hidden  = felt.scrollLeft >= maks - TOLERANCE;
}

function rul(felt, retning) {
  felt.scrollBy({ left: retning * SPRING, behavior: 'smooth' });
}

function lavPil(retning, etiket) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `fb-arrow fb-arrow--${retning > 0 ? 'right' : 'left'}`;
  b.setAttribute('aria-label', etiket);
  /* aria-hidden på selve pilen ville skjule knappen for skærmlæsere, og den
     ER en rigtig handling. I stedet er SVG'en dekoration og aria-label bærer
     betydningen. */
  b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
    (retning > 0 ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7') + '"/></svg>';
  return b;
}

/**
 * Sæt rullepile på en vandret fanerække.
 * @param {string} vaelger CSS-vælger for den rullende beholder.
 * @returns {Function|undefined} oprydning, hvis der blev sat pile op.
 */
export function initTabScroll(vaelger = '.filter-band .hero-cat-chips') {
  const felt = document.querySelector(vaelger);
  if (!felt) return;

  /* Pilene skal ligge OVENPÅ rækkens kanter, ikke ved siden af, ellers
     flytter de fanerne hver gang de dukker op og forsvinder. Derfor en
     positioneret forælder. Den findes allerede i markuppen som .fb-tabs;
     mangler den, gør vi ingenting frem for at rode i DOM-strukturen. */
  const ramme = felt.closest('.fb-tabs');
  if (!ramme) return;

  const venstre = lavPil(-1, 'Rul til tidligere cykeltyper');
  const hoejre  = lavPil(1,  'Rul til flere cykeltyper');
  ramme.append(venstre, hoejre);

  const tegn = () => opdater(felt, venstre, hoejre);

  venstre.addEventListener('click', () => rul(felt, -1));
  hoejre .addEventListener('click', () => rul(felt,  1));
  felt.addEventListener('scroll', tegn, { passive: true });

  /* Bredden ændrer sig af to grunde: vinduet, og at rækken bygges om når man
     skifter mellem Cykler og Tilbehør. ResizeObserver fanger begge, hvor en
     resize-lytter kun fanger den første. */
  const ro = new ResizeObserver(tegn);
  ro.observe(felt);
  const mo = new MutationObserver(tegn);
  mo.observe(felt, { childList: true });

  tegn();

  return () => {
    ro.disconnect();
    mo.disconnect();
    felt.removeEventListener('scroll', tegn);
    venstre.remove();
    hoejre.remove();
  };
}
