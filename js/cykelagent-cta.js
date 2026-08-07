/* Vis Cykelagent-CTA over annonce-listen.
   - Når resultaterne er få (≤5): brug stærkere "kun X matcher"-copy.
   - Ellers: standard "få besked"-prompt.
   - Skjules helt hvis bruger har dismisset for det aktuelle filter (sessionStorage). */
const DISMISS_KEY = 'cb_cta_dismissed_filters';

function _filterFingerprint(parts) {
  return (parts || []).join('|').toLowerCase();
}

function _isDismissed(parts) {
  try {
    const fp = _filterFingerprint(parts);
    return sessionStorage.getItem(DISMISS_KEY) === fp;
  } catch { return false; }
}

function _markDismissed(parts) {
  try {
    sessionStorage.setItem(DISMISS_KEY, _filterFingerprint(parts));
  } catch {}
}

/* Flytter CTA-strippen over eller under annonce-gitteret.
   DOM-flytning frem for to kopier, så der kun findes ét element med id'et og
   dismiss-logikken ikke skal kende til placeringen. */
function placeStrip(strip, where) {
  const grid = document.getElementById('listings-grid');
  if (!grid || !grid.parentNode) return;
  const target = where === 'after' ? grid.nextSibling : grid;
  // Undgå unødig DOM-mutation hvis den allerede står rigtigt.
  if (where === 'after' && strip.previousElementSibling === grid) return;
  if (where === 'before' && strip.nextElementSibling === grid) return;
  grid.parentNode.insertBefore(strip, target);
}

export function createCykelagentCta({ hasActiveFilters, describeActiveFilters, getBrowseCategory }) {
  function updateCykelagentCta(resultCount = null) {
    const strip = document.getElementById('cykelagent-cta-strip');
    if (!strip) return;

    // Cykelagent-byggeren er cykel-only; tilbehørs-agenter er follow-up.
    // Skjul hele CTA'en på Tilbehør-fanen så vi ikke lover en cykel-feature.
    if ((getBrowseCategory ? getBrowseCategory() : 'cykel') === 'tilbehoer') {
      strip.style.display = 'none';
      return;
    }

    if (!hasActiveFilters()) {
      // Ingen aktive filtre = brugeren er lige landet og har ikke set en eneste
      // cykel endnu. Så flyttes strippen NED under annoncerne: vis noget værd at
      // abonnere på, før du beder om tilmeldingen. Med aktive filtre er den
      // derimod kontekstuelt relevant ("kun X matcher") og bliver stående
      // over listen — se placeStrip() nedenfor.
      placeStrip(strip, 'after');
      strip.style.display = 'flex';
      strip.classList.remove('cykelagent-cta-strip--accent');
      strip.innerHTML = `
        <span class="cta-strip-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Få besked når din næste cykel dukker op — opret en gratis <strong>Cykelagent</strong></span>
        <div class="cta-strip-actions">
          <button class="cta-strip-btn" onclick="navigateTo('/cykelagenter')">Opret Cykelagent →</button>
        </div>
      `;
      return;
    }

    const parts = describeActiveFilters();
    if (_isDismissed(parts)) {
      strip.style.display = 'none';
      return;
    }

    const label = parts.length > 0 ? parts.join(' · ') : 'dine aktive filtre';
    const isFew = typeof resultCount === 'number' && resultCount <= 5;
    const isZero = resultCount === 0;

    let leadText;
    if (isZero) {
      leadText = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Ingen cykler matcher <strong>${label}</strong> lige nu — gem søgningen og få besked når en dukker op`;
    } else if (isFew) {
      leadText = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Kun ${resultCount} ${resultCount === 1 ? 'cykel' : 'cykler'} matcher <strong>${label}</strong> — få besked når der kommer flere`;
    } else {
      leadText = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg> Få besked når der dukker op: <strong>${label}</strong>`;
    }

    strip.style.display = 'flex';
    placeStrip(strip, 'before');
    strip.classList.toggle('cykelagent-cta-strip--accent', isFew || isZero);
    strip.innerHTML = `
      <span class="cta-strip-text">${leadText}</span>
      <div class="cta-strip-actions">
        <button class="cta-strip-btn" onclick="saveCurrentSearch()">
          Opret Cykelagent →
        </button>
        <button class="cta-strip-dismiss" onclick="dismissCykelagentCta()" aria-label="Skjul">×</button>
      </div>
    `;
  }

  function dismissCykelagentCta() {
    const parts = describeActiveFilters();
    _markDismissed(parts);
    const strip = document.getElementById('cykelagent-cta-strip');
    if (strip) strip.style.display = 'none';
  }

  return { updateCykelagentCta, dismissCykelagentCta };
}
