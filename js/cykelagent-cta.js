/* Cykelagent på forsiden: én rolig knap i værktøjslinjen ved sorteringen
   ("Få besked om nye"), i stedet for det farvede banner over listen.
   Banneret lignede en reklame og skiftede plads og tekst med filtrene;
   knappen står samme sted hele tiden (inspireret af DBA's "Opret annonceagent",
   men i vores egen form).
   - Med aktive filtre: gemmer søgningen som Cykelagent (saveCurrentSearch).
   - Uden filtre: åbner Cykelagent-siden, hvor man bygger en fra bunden.
   - Skjult på Tilbehør-fanen: Cykelagent er kun for cykler.
   #cykelagent-cta-strip holdes skjult; elementet bliver stående et stykke tid,
   så en cachet ældre udgave af denne fil ikke fejler (CLAUDE.md, cache-reglen). */

export function createCykelagentCta({ hasActiveFilters, describeActiveFilters, getBrowseCategory }) {
  function updateCykelagentCta() {
    const strip = document.getElementById('cykelagent-cta-strip');
    if (strip) strip.style.display = 'none';

    const btn = document.getElementById('btn-save-search');
    if (!btn) return;
    const isAccessories = (getBrowseCategory ? getBrowseCategory() : 'cykel') === 'tilbehoer';
    btn.hidden = isAccessories;
    if (isAccessories) return;

    const parts = hasActiveFilters() ? describeActiveFilters() : [];
    btn.title = parts.length
      ? `Få en e-mail når en ny cykel matcher: ${parts.join(' · ')}`
      : 'Få en e-mail når en ny cykel matcher din søgning';
  }

  function cykelagentSave() {
    if (hasActiveFilters()) window.saveCurrentSearch?.();
    else window.navigateTo?.('/cykelagenter');
  }

  // Bevaret for window-eksporten i main.js; banneret findes ikke længere.
  function dismissCykelagentCta() {}

  return { updateCykelagentCta, dismissCykelagentCta, cykelagentSave };
}
