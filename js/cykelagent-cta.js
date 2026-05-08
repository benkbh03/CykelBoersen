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

export function createCykelagentCta({ hasActiveFilters, describeActiveFilters }) {
  function updateCykelagentCta(resultCount = null) {
    const strip = document.getElementById('cykelagent-cta-strip');
    if (!strip) return;

    if (!hasActiveFilters()) {
      strip.style.display = 'none';
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
      leadText = `🔔 Ingen cykler matcher <strong>${label}</strong> lige nu — gem søgningen og få besked når en dukker op`;
    } else if (isFew) {
      leadText = `🔔 Kun ${resultCount} ${resultCount === 1 ? 'cykel' : 'cykler'} matcher <strong>${label}</strong> — få besked når der kommer flere`;
    } else {
      leadText = `🔔 Få besked når der dukker op: <strong>${label}</strong>`;
    }

    strip.style.display = 'flex';
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
