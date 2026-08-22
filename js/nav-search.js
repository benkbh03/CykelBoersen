/* ────────────────────────────────────────────────────────────────
   nav-search.js — kompakt søgefelt i topbaren

   Baggrund: den store søgebar ligger inde i #landing-layout, som sættes til
   display:none på ALLE andre ruter. Søgning forsvandt derfor fuldstændigt så
   snart man forlod forsiden — på annoncesider, forhandlersider, kortet,
   mærkesider, blogindlæg og alle de prerenderede landingssider. En besøgende
   fra Google, der landede på en mærkeside uden at finde det rigtige, havde
   ingen anden vej end at klikke på logoet.

   Feltet er derfor synligt overalt UNDEN forsiden, og på forsiden først når
   hero'ens søgebar er scrollet op forbi topbaren. To søgefelter på skærmen
   samtidig ville bare være to steder at være i tvivl om.

   Feltet er en VISNING af det rigtige søgefelt, ikke et selvstændigt filter:
   det skriver sin tekst ind i #search-input og kalder searchBikes(), præcis
   som hero-baren gør. Samme kilde til sandhed, én kodesti at fejlsøge.
──────────────────────────────────────────────────────────────── */

/** Er vi på forsiden lige nu? Aflæses på om landing-layout er synligt,
 *  ikke på location.pathname — så virker det også for de ruter der viser
 *  forsiden uden at ændre stien. */
function onHome() {
  const landing = document.getElementById('landing-layout');
  return !!landing && getComputedStyle(landing).display !== 'none';
}

function applyVisibility() {
  let show = true;
  if (onHome()) {
    const hero = document.querySelector('.search-section');
    // Vis den først når hero-baren reelt er ude af syne bag topbaren.
    show = hero ? hero.getBoundingClientRect().bottom <= 8 : true;
  }
  /* Riv aldrig feltet væk mens nogen skriver i det. Scroller man op igen
     midt i en søgning, ville display:none fjerne fokus og æde resten af det
     man tastede. */
  const input = document.getElementById('nav-search-input');
  if (!show && input && document.activeElement === input) show = true;

  document.body.classList.toggle('nav-search-on', show);
  if (!show) document.body.classList.remove('nav-search-open');
}

export function initNavSearch() {
  const form = document.getElementById('nav-search');
  if (!form) return;

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; applyVisibility(); });
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  /* Ruteskift skifter #landing-layout mellem display:none og '' via
     view-switcher.js. En MutationObserver på style-attributten fanger det
     uden at nav-search skal hægtes ind i handleRoute — så kan routing og
     søgefelt ændres uafhængigt af hinanden. */
  const landing = document.getElementById('landing-layout');
  if (landing) {
    new MutationObserver(schedule).observe(landing, {
      attributes: true, attributeFilter: ['style'],
    });
  }

  /* ── Siden må ikke kravle opad mens man skriver ──
     html har scroll-padding-top: 80px, så anker-hop ikke lander bag topbaren.
     Feltet her ligger SELV i den fastgjorte topbar, altså inde i den
     polstring. Chrome scroller markøren "ind i syne" ved fokus og ved hvert
     tastetryk, forsøger derfor at skubbe feltet ned under de 80 px — men
     baren følger med opad, så forsøget gentages ved næste bogstav. Målt
     resultat før rettelsen: siden hoppede 58 px, altså cirka én navhøjde,
     pr. tast.

     Hverken scroll-margin på feltet eller overflow-anchor stopper det; det
     er testet. Positionen gemmes derfor lige før browseren får lov at
     scrolle og sættes tilbage i samme frame. Kun ved fokus og tastetryk, så
     brugerens egen scrolling er urørt. */
  const input = document.getElementById('nav-search-input');
  if (input) {
    const restoreTo = (y) => requestAnimationFrame(() => {
      if (window.scrollY !== y) window.scrollTo(0, y);
    });
    const holdScroll = () => restoreTo(window.scrollY);

    /* Ved fokus rækker det ikke at måle inde i focus-handleren: browseren har
       allerede scrollet, når focus-hændelsen udsendes, så man ville låse den
       forkerte position fast. pointerdown sker FØR fokus, så positionen
       hentes derfra når feltet klikkes. Tastatur-fokus (Tab) falder tilbage
       på den aktuelle position. */
    let beforeFocus = null;
    form.addEventListener('pointerdown', () => { beforeFocus = window.scrollY; });
    input.addEventListener('focus', () => {
      const y = beforeFocus != null ? beforeFocus : window.scrollY;
      beforeFocus = null;
      restoreTo(y);
    });
    input.addEventListener('keydown', holdScroll);
    input.addEventListener('input', holdScroll);
  }

  // Escape lukker det udvidede felt på mobil.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-search-open')) {
      document.body.classList.remove('nav-search-open');
    }
  });

  applyVisibility();
}

/** Mobil: forstør/skjul feltet. På mobil er der ikke plads til et input i
 *  rækken, så knappen folder det ud på sin egen linje under topbaren. */
export function toggleNavSearch() {
  const open = document.body.classList.toggle('nav-search-open');
  if (open) {
    const input = document.getElementById('nav-search-input');
    // Fokus efter reflow, ellers når feltet ikke at være synligt.
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  }
}

/**
 * Send søgningen. Skriver teksten ind i det RIGTIGE søgefelt og kalder
 * searchBikes(), i stedet for at bygge sin egen forespørgsel.
 * @param {Event} ev
 * @param {{navigateTo: Function, searchBikes: Function}} deps
 */
export function submitNavSearch(ev, { navigateTo, searchBikes } = {}) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
  const q = (document.getElementById('nav-search-input')?.value || '').trim();

  const run = () => {
    const heroInput = document.getElementById('search-input');
    if (heroInput) heroInput.value = q;
    if (typeof searchBikes === 'function') searchBikes();
    // Scroll ned til resultaterne. Uden det bliver man stående i toppen og
    // tror der ikke skete noget, fordi listen ligger under hero'en.
    document.querySelector('.listings-header')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  document.body.classList.remove('nav-search-open');

  if (onHome()) {
    run();
  } else {
    // 50 ms er samme forsinkelse som applyPopularSearch bruger: navigateTo
    // skifter layout synkront, men listen skal nå at være i DOM'en.
    if (typeof navigateTo === 'function') navigateTo('/');
    setTimeout(run, 50);
  }
}
