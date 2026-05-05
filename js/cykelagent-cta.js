export function createCykelagentCta({ hasActiveFilters, describeActiveFilters }) {
  function updateCykelagentCta() {
    const strip = document.getElementById('cykelagent-cta-strip');
    if (!strip) return;

    if (!hasActiveFilters()) {
      strip.style.display = 'none';
      return;
    }

    const parts = describeActiveFilters();
    const label = parts.length > 0
      ? parts.join(' · ')
      : 'dine aktive filtre';

    strip.style.display = 'flex';
    strip.innerHTML = `
      <span class="cta-strip-text">
        🔔 Få besked når der dukker op: <strong>${label}</strong>
      </span>
      <button class="cta-strip-btn" onclick="saveCurrentSearch()">
        Opret Cykelagent →
      </button>
    `;
  }

  return { updateCykelagentCta };
}
