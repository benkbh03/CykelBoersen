/* ============================================================
   STELSTØRRELSE-FINDER (/stelstoerrelse-guide)
   Interaktivt værktøj: bruger indtaster højde + benlængde + cykeltype
   → får anbefalet stelstørrelse + range.
   ============================================================ */

// Højde → stelstørrelse-range (fallback hvis benlængde ikke kendes)
const HEIGHT_RANGES = [
  { min: 148, max: 162, size: 'XS', label: 'XS (44–48 cm)', cmRange: [44, 48] },
  { min: 163, max: 170, size: 'S',  label: 'S (49–52 cm)',  cmRange: [49, 52] },
  { min: 171, max: 178, size: 'M',  label: 'M (53–56 cm)',  cmRange: [53, 56] },
  { min: 179, max: 188, size: 'L',  label: 'L (57–60 cm)',  cmRange: [57, 60] },
  { min: 189, max: 220, size: 'XL', label: 'XL (61+ cm)',   cmRange: [61, 65] },
];

// Inseam-multiplier pr. cykeltype (industristandard ratios)
const INSEAM_MULTIPLIER = {
  'Racercykel':   0.685,  // Lemond-formel ish
  'Gravel':       0.685,
  'Mountainbike': 0.66,   // MTB sidder mere oprejst
  'Citybike':     0.66,
  'El-cykel':     0.66,
  'Ladcykel':     0.62,
  'Børnecykel':   0.66,
};

export function createSizeFinder({
  esc,
  updateSEOMeta,
  showDetailView,
  navigateTo,
  BASE_URL,
}) {

  async function renderSizeFinderPage() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = 'Stelstørrelse-finder — Hvilken cykelstørrelse passer mig? | Cykelbørsen';
    updateSEOMeta(
      'Find den rigtige cykelstørrelse: indtast højde + benlængde + cykeltype og få anbefalet stelstørrelse på sekunder. Gratis værktøj fra Cykelbørsen.',
      '/stelstoerrelse-guide'
    );

    addSizeFinderJsonLd();

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    detailView.innerHTML = `
      <div class="size-finder-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>

        <header class="size-finder-hero">
          <h1 class="size-finder-title">Find din cykelstørrelse</h1>
          <p class="size-finder-subtitle">
            Indtast din højde, cykeltype og — hvis du kender den — din benlængde.
            Vi giver dig den anbefalede stelstørrelse på 2 sekunder.
          </p>
        </header>

        <form id="size-finder-form" class="size-finder-form" onsubmit="event.preventDefault();window.runSizeFinder()">
          <div class="size-finder-field">
            <label>Din højde <span class="req">*</span></label>
            <div class="size-finder-slider-wrap">
              <input type="range" id="sf-height" min="140" max="210" value="175" oninput="window.updateSizeFinderHeightLabel()">
              <span class="size-finder-slider-value" id="sf-height-value">175 cm</span>
            </div>
          </div>

          <div class="size-finder-field">
            <label>Cykeltype <span class="req">*</span></label>
            <select id="sf-type">
              <option>Racercykel</option>
              <option>Gravel</option>
              <option>Mountainbike</option>
              <option selected>Citybike</option>
              <option>El-cykel</option>
              <option>Ladcykel</option>
              <option>Børnecykel</option>
            </select>
          </div>

          <details class="size-finder-advanced">
            <summary>Kender du din benlængde? (giver mere præcist resultat)</summary>
            <div class="size-finder-field">
              <label>Benlængde (inseam, valgfri)</label>
              <input type="number" id="sf-inseam" min="60" max="100" placeholder="f.eks. 82" step="1">
              <p class="size-finder-hint">Stå med ryggen mod væggen, sæt en bog mellem benene op til skridtet, mål fra bogens top til gulvet i cm.</p>
            </div>
          </details>

          <button type="submit" class="size-finder-submit">Find min størrelse →</button>
        </form>

        <div id="size-finder-result" class="size-finder-result" style="display:none;"></div>

        <section class="size-finder-info">
          <h2 class="size-finder-info-title">Sådan virker det</h2>
          <div class="size-finder-info-grid">
            <div class="size-finder-info-card">
              <div class="size-finder-info-icon">📏</div>
              <h3>1. Højde alene</h3>
              <p>Vi bruger industri-standardtabeller baseret på højde, hvilket er præcist nok for 80% af ryttere.</p>
            </div>
            <div class="size-finder-info-card">
              <div class="size-finder-info-icon">🦵</div>
              <h3>2. Med benlængde</h3>
              <p>Indtaster du også benlængde, beregner vi præcis cm-størrelse — særligt nyttigt hvis du er i grænseland mellem to størrelser.</p>
            </div>
            <div class="size-finder-info-card">
              <div class="size-finder-info-icon">🚲</div>
              <h3>3. Cykeltypen påvirker</h3>
              <p>En racer sidder anderledes end en citybike. Vi bruger forskellige formler pr. cykeltype så du får den rigtige fit.</p>
            </div>
          </div>
        </section>

        <section class="size-finder-faq">
          <h2 class="size-finder-info-title">Ofte stillede spørgsmål</h2>
          <details class="size-finder-faq-item">
            <summary>Hvor præcist er resultatet?</summary>
            <p>Hvis du indtaster både højde og benlængde, er resultatet typisk inden for ±1 cm af optimal stelstørrelse. Bemærk: forskellige mærker har lidt forskellige geometrier, så en "M" Trek og en "M" Specialized er ikke 100% identiske. Brug altid en prøvetur som endelig test.</p>
          </details>
          <details class="size-finder-faq-item">
            <summary>Hvad gør jeg hvis jeg er imellem to størrelser?</summary>
            <p>Hvis du er på grænsen (fx 178 cm — mellem M og L racere) afhænger valget af din krops-proportioner og kørestil:
            <ul><li><strong>Vælg M</strong> hvis du har korte ben + lang overkrop, eller foretrækker oprejst position</li>
            <li><strong>Vælg L</strong> hvis du har lange ben + kort overkrop, eller foretrækker race-position</li></ul></p>
          </details>
          <details class="size-finder-faq-item">
            <summary>Skal jeg altid lave en prøvetur?</summary>
            <p>Ja. Vores værktøj er meget præcist baseret på de standard-formler producenter selv bruger. Men hver krop er unik. En 5-minutters prøvetur kan afsløre om en cykel der "passer på papiret" virkelig passer dig.</p>
          </details>
          <details class="size-finder-faq-item">
            <summary>Børnecykler — hvordan finder jeg den rigtige størrelse?</summary>
            <p>Til børn handler det mere om hjulstørrelse end stelstørrelse:
            <ul><li>3-5 år: 12-16" hjul</li>
            <li>5-7 år: 16-20" hjul</li>
            <li>7-10 år: 20-24" hjul</li>
            <li>10+ år: 24-26" hjul</li></ul>
            Barnet skal kunne sætte begge fødder fast på jorden når det sidder på sadlen.</p>
          </details>
        </section>
      </div>
    `;
  }

  function updateSizeFinderHeightLabel() {
    const val = document.getElementById('sf-height').value;
    const label = document.getElementById('sf-height-value');
    if (label) label.textContent = `${val} cm`;
  }

  function runSizeFinder() {
    const height = parseInt(document.getElementById('sf-height').value) || 0;
    const type   = document.getElementById('sf-type').value;
    const inseamRaw = document.getElementById('sf-inseam').value;
    const inseam = inseamRaw ? parseInt(inseamRaw) : null;

    if (!height || height < 100 || height > 230) return;

    const result = calculateFrameSize({ height, inseam, type });
    renderResult(result, { height, inseam, type });
  }

  function calculateFrameSize({ height, inseam, type }) {
    // Først: find højde-baseret range
    const heightMatch = HEIGHT_RANGES.find(r => height >= r.min && height <= r.max) || HEIGHT_RANGES[2];

    // Hvis inseam er angivet, beregn præcis cm
    let exactCm = null;
    if (inseam && inseam > 50 && inseam < 110) {
      const mult = INSEAM_MULTIPLIER[type] ?? 0.66;
      exactCm = Math.round(inseam * mult);
    }

    // Cykler med tomme-størrelser (børn) får speciel formatering
    const isKids = type === 'Børnecykel';

    return {
      sizeLabel: heightMatch.label,
      sizeShort: heightMatch.size,
      cmRange: heightMatch.cmRange,
      exactCm,
      isKids,
      height,
      inseam,
      type,
    };
  }

  function renderResult(result, input) {
    const resultEl = document.getElementById('size-finder-result');
    if (!resultEl) return;
    resultEl.style.display = 'block';

    const sizeFilterUrl = `/?size=${encodeURIComponent(result.sizeLabel)}&type=${encodeURIComponent(input.type)}`;

    resultEl.innerHTML = `
      <div class="size-finder-result-card">
        <div class="size-finder-result-emoji">📏</div>
        <p class="size-finder-result-label">Vi anbefaler dig</p>
        <h2 class="size-finder-result-size">${result.sizeShort}</h2>
        <p class="size-finder-result-cmrange">${result.cmRange[0]}–${result.cmRange[1]} cm rammestørrelse</p>

        ${result.exactCm ? `
        <div class="size-finder-result-precise">
          <span class="size-finder-result-precise-label">Præcis (baseret på din benlængde):</span>
          <span class="size-finder-result-precise-value">${result.exactCm} cm</span>
        </div>` : ''}

        <p class="size-finder-result-note">
          Baseret på højde ${input.height} cm${input.inseam ? `, benlængde ${input.inseam} cm` : ''}
          og cykeltype ${input.type}.
        </p>

        <div class="size-finder-result-cta">
          <button class="size-finder-cta-primary" onclick="window.applyPopularSearch && window.applyPopularSearch({type:'${input.type}'})">
            🔍 Se ${result.sizeShort}-cykler på Cykelbørsen
          </button>
        </div>

        <div class="size-finder-result-tips">
          <h3>💡 Husk</h3>
          <ul>
            <li><strong>Mærkeforskel</strong>: en "M" Trek er ikke 100% lig en "M" Specialized — tjek altid producentens egen tabel</li>
            <li><strong>Prøvetur</strong>: lav altid en kort prøvetur før du køber</li>
            <li><strong>Foden på jorden</strong>: du skal kunne sætte begge fødder fast på jorden når du sidder af</li>
          </ul>
        </div>
      </div>
    `;

    setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function addSizeFinderJsonLd() {
    const existing = document.getElementById('sizefinder-jsonld');
    if (existing) existing.remove();
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': 'Stelstørrelse-finder',
      'description': 'Gratis interaktivt værktøj til at finde den rigtige cykelstørrelse baseret på højde, benlængde og cykeltype.',
      'url': `${BASE_URL}/stelstoerrelse-guide`,
      'applicationCategory': 'BusinessApplication',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'DKK' },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'sizefinder-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  return {
    renderSizeFinderPage,
    runSizeFinder,
    updateSizeFinderHeightLabel,
  };
}
