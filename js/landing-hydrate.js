/* ══════════════════════════════════════════════════════════════════
   Forsiden som partial

   De 218 prerendrede sider blev bygget ud fra index.html, og index.html
   indeholder hele forsiden: hero, søgefelt, sidebar-filtre, annoncegitter,
   quiz, kategorichips. 838 linjer, 71,6 KB. På hver eneste underside lå det
   hele med — skjult bag display:none, aldrig vist, men fuldt læsbart for
   Google.

   Det kostede to ting. Hver side havde to <h1>, og den første var forsidens,
   så /om-os/ meldte sig til Google som "Find din næste cykel på Cykelbørsen".
   Og 612 ord var ordret ens på alle sider, så det unikke indhold udgjorde
   2 til 5 procent. Search Console svarede med 188 sider under
   "Alternate page with proper canonical tag".

   Nu udelader prerenderen forsidens markup og lægger den i
   /partials/landing.html i stedet. Undersiderne har én <h1>, deres egen, og
   er 71,6 KB lettere. Klikker brugeren hjem, hentes partialen og sættes ind.

   Filen er GENERERET af scripts/prerender.mjs ud fra index.html. Ret aldrig
   i den i hånden — to kopier af det samme markup driver fra hinanden, og
   det har vi set nok af i dette repo.
   ══════════════════════════════════════════════════════════════════ */

let _igang = null;

/** Er forsiden udeladt af dokumentet? (Sandt på prerendrede undersider.) */
export function landingMangler() {
  const el = document.getElementById('landing-layout');
  return !!el && el.children.length === 0;
}

/**
 * Sikrer at #landing-layout har indhold. Er den allerede fyldt — dvs. vi står
 * på selve forsiden, eller den er hentet før — returneres med det samme.
 *
 * @param {string}   version  ASSET_VERSION, så partialen cache-bustes med resten
 * @param {Function} efter    kaldes når markup'en er i DOM og handlere kan bindes
 * @returns {Promise<boolean>} true hvis forsiden er klar
 */
export function hydrerLanding(version, efter) {
  const el = document.getElementById('landing-layout');
  if (!el) return Promise.resolve(false);
  if (el.children.length > 0) return Promise.resolve(true);
  if (_igang) return _igang;

  _igang = fetch(`/partials/landing.html?v=${version}`)
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then((html) => {
      el.innerHTML = html;
      if (efter) efter();
      return true;
    })
    .catch((e) => {
      console.error('Kunne ikke hente forsiden:', e);
      _igang = null;
      // Fald tilbage til en rigtig sideindlæsning. Langsommere end en
      // SPA-navigation, men den kan ikke fejle på samme måde, og brugeren
      // ender det sted han klikkede hen.
      window.location.replace('/');
      return false;
    });

  return _igang;
}
