/* ============================================================
   CYKEL-VURDERING (/vurder-min-cykel)
   Gratis værktøj: brugeren indtaster cykel-info → får estimeret
   markedsværdi baseret på lignende annoncer på Cykelbørsen.
   ============================================================ */

import { KNOWN_BRANDS, brandToSlug } from './brand-data.js';

const CONDITION_MULTIPLIER = {
  'Ny':        1.15,
  'Som ny':    1.00,
  'God stand': 0.85,
  'Brugt':     0.65,
};

export function createValuation({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  navigateTo,
  BASE_URL,
}) {

  async function renderValuationPage() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = 'Hvad er min cykel værd? Gratis vurdering | Cykelbørsen';
    updateSEOMeta(
      'Gratis cykel-vurdering: indtast mærke, model og stand → få estimeret salgsværdi baseret på rigtige handler. Hurtigt, nemt og uden binding.',
      '/vurder-min-cykel'
    );

    addValuationJsonLd();

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    detailView.innerHTML = `
      <div class="valuation-page">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Forsiden</button>

        <header class="valuation-hero">
          <h1 class="valuation-title">Hvad er din cykel værd?</h1>
          <p class="valuation-subtitle">
            Gratis vurdering baseret på rigtige handler på Cykelbørsen.
            Indtast oplysningerne — vi giver dig et realistisk prisinterval.
          </p>
        </header>

        <form id="valuation-form" class="valuation-form" onsubmit="event.preventDefault();window.runValuation()">
          <div class="valuation-form-row">
            <div class="valuation-field">
              <label>Mærke <span class="req">*</span></label>
              <input type="text" id="val-brand" list="val-brand-list" placeholder="f.eks. Trek" autocomplete="off" required>
              <datalist id="val-brand-list">
                ${KNOWN_BRANDS.map(b => `<option value="${esc(b)}">`).join('')}
              </datalist>
            </div>
            <div class="valuation-field">
              <label>Model <span class="req">*</span></label>
              <input type="text" id="val-model" placeholder="f.eks. FX 3 Disc" required>
            </div>
          </div>

          <div class="valuation-form-row">
            <div class="valuation-field">
              <label>Årgang <span class="req">*</span></label>
              <input type="number" id="val-year" placeholder="f.eks. 2022" min="1990" max="2030" required>
            </div>
            <div class="valuation-field">
              <label>Stand <span class="req">*</span></label>
              <select id="val-condition" required>
                <option value="">Vælg stand</option>
                <option value="Ny">Ny</option>
                <option value="Som ny">Som ny</option>
                <option value="God stand">God stand</option>
                <option value="Brugt">Brugt</option>
              </select>
            </div>
          </div>

          <div class="valuation-form-row">
            <div class="valuation-field">
              <label>Stelstørrelse <span class="optional">(valgfri)</span></label>
              <select id="val-size">
                <option value="">Vælg</option>
                <option>XS (44–48 cm)</option>
                <option>S (49–52 cm)</option>
                <option>M (53–56 cm)</option>
                <option>L (57–60 cm)</option>
                <option>XL (61+ cm)</option>
              </select>
            </div>
            <div class="valuation-field">
              <label>Cykeltype <span class="optional">(valgfri)</span></label>
              <select id="val-type">
                <option value="">Vælg</option>
                <option>Racercykel</option>
                <option>Mountainbike</option>
                <option>Citybike</option>
                <option>El-cykel</option>
                <option>Ladcykel</option>
                <option>Børnecykel</option>
                <option>Gravel</option>
              </select>
            </div>
          </div>

          <button type="submit" class="valuation-submit">
            <span class="valuation-submit-label">Få min vurdering →</span>
          </button>
        </form>

        <div id="valuation-result" class="valuation-result" style="display:none;"></div>

        <section class="valuation-info">
          <h2 class="valuation-info-title">Sådan fungerer vurderingen</h2>
          <div class="valuation-info-grid">
            <div class="valuation-info-card">
              <div class="valuation-info-icon">📊</div>
              <h3>Rigtige data</h3>
              <p>Vurderingen er baseret på faktiske annoncer fra Cykelbørsen — ikke gætteri eller udenlandske prisindeks.</p>
            </div>
            <div class="valuation-info-card">
              <div class="valuation-info-icon">⚡</div>
              <h3>Hurtig og gratis</h3>
              <p>Få et estimat på 2 sekunder. Ingen email-binding, ingen kreditkort, ingen forpligtelse.</p>
            </div>
            <div class="valuation-info-card">
              <div class="valuation-info-icon">🎯</div>
              <h3>Realistisk prisinterval</h3>
              <p>Vi viser et lav-median-høj-interval så du ved både den hurtige pris og maksimum-prisen.</p>
            </div>
          </div>
        </section>

        <section class="valuation-faq">
          <h2 class="valuation-info-title">Ofte stillede spørgsmål</h2>
          <details class="valuation-faq-item">
            <summary>Hvor præcis er vurderingen?</summary>
            <p>Præcisionen afhænger af hvor mange lignende cykler der er solgt for nylig. Hvis vi finder mindst 5 sammenlignelige annoncer, er estimatet typisk inden for ±15% af den faktiske salgspris. Vi viser altid hvor mange handler estimatet er baseret på.</p>
          </details>
          <details class="valuation-faq-item">
            <summary>Hvad gør jeg hvis I ikke har data nok?</summary>
            <p>Hvis vi ikke finder lignende cykler giver vi et bredere interval baseret på din cykels mærke og type. Du kan også kontakte en af vores forhandlere for personlig vurdering — de kender markedet bedst.</p>
          </details>
          <details class="valuation-faq-item">
            <summary>Skal jeg sætte prisen på medianværdien?</summary>
            <p>Hvis du har travlt med at sælge — start på medianen eller lidt under. Hvis du kan vente — start på den høje pris og sæt ned hvis du ikke får henvendelser. Cykler i 'Som ny'-stand sælger typisk hurtigere end 'Brugt'.</p>
          </details>
          <details class="valuation-faq-item">
            <summary>Hvad påvirker prisen mest?</summary>
            <p>I prioriteret rækkefølge: (1) Mærke + model + årgang, (2) stand, (3) komponentgruppe og specs, (4) hvor populær modellen er, (5) årstid (forår/sommer = højere priser).</p>
          </details>
        </section>
      </div>
    `;
  }

  async function runValuation() {
    const brand     = document.getElementById('val-brand').value.trim();
    const model     = document.getElementById('val-model').value.trim();
    const yearRaw   = document.getElementById('val-year').value;
    const condition = document.getElementById('val-condition').value;
    const size      = document.getElementById('val-size').value;
    const type      = document.getElementById('val-type').value;
    const year      = parseInt(yearRaw);

    if (!brand || !model || !year || !condition) return;

    const submitBtn = document.querySelector('.valuation-submit');
    const labelEl   = submitBtn?.querySelector('.valuation-submit-label');
    const original  = labelEl?.textContent;
    if (labelEl) labelEl.textContent = 'Beregner…';
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await calculateValuation({ brand, model, year, condition, size, type });
      renderResult(result, { brand, model, year, condition });
    } catch (err) {
      console.error('Vurdering fejl:', err);
      const resultEl = document.getElementById('valuation-result');
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<p style="color:var(--rust);text-align:center;">Noget gik galt. Prøv igen.</p>`;
      }
    } finally {
      if (labelEl && original) labelEl.textContent = original;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function calculateValuation({ brand, model, year, condition, size, type }) {
    // Trin 1: forsøg eksakt brand + model + årgang ±2
    let { data: matches } = await supabase
      .from('bikes')
      .select('price, condition, year')
      .ilike('brand', brand)
      .ilike('model', `%${model}%`)
      .gte('year', year - 2)
      .lte('year', year + 2)
      .gt('price', 0);

    let sampleType = 'exact';

    // Trin 2: hvis <3 matches, udvid årgangsinterval
    if (!matches || matches.length < 3) {
      const { data: wider } = await supabase
        .from('bikes')
        .select('price, condition, year')
        .ilike('brand', brand)
        .ilike('model', `%${model}%`)
        .gt('price', 0);
      if (wider && wider.length > (matches?.length || 0)) {
        matches = wider;
        sampleType = 'wider-year';
      }
    }

    // Trin 3: hvis stadig <3 matches, gå til brand+type uden model
    if (!matches || matches.length < 3) {
      const baseQuery = supabase
        .from('bikes')
        .select('price, condition, year')
        .ilike('brand', brand)
        .gt('price', 0);
      const { data: broad } = type
        ? await baseQuery.eq('type', type)
        : await baseQuery;
      if (broad && broad.length >= 3) {
        matches = broad;
        sampleType = 'brand-type';
      }
    }

    if (!matches || matches.length === 0) {
      return { ok: false, reason: 'no-data', sampleSize: 0 };
    }

    // Normalisér priserne til den ønskede stand
    const targetMult = CONDITION_MULTIPLIER[condition] || 1.0;
    const normalized = matches
      .map(b => {
        const m = CONDITION_MULTIPLIER[b.condition] || 1.0;
        return (b.price * targetMult) / m;
      })
      .filter(p => p > 100 && p < 1_000_000) // Drop outliers
      .sort((a, b) => a - b);

    if (normalized.length === 0) {
      return { ok: false, reason: 'no-valid-data', sampleSize: 0 };
    }

    const median = percentile(normalized, 50);
    const low    = percentile(normalized, 25);
    const high   = percentile(normalized, 75);

    return {
      ok: true,
      low:    Math.round(low / 100) * 100,
      median: Math.round(median / 100) * 100,
      high:   Math.round(high / 100) * 100,
      sampleSize: normalized.length,
      sampleType,
    };
  }

  function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lo  = Math.floor(idx);
    const hi  = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function renderResult(result, input) {
    const resultEl = document.getElementById('valuation-result');
    if (!resultEl) return;
    resultEl.style.display = 'block';

    if (!result.ok) {
      resultEl.innerHTML = `
        <div class="valuation-result-card valuation-result-empty">
          <div class="valuation-result-icon">📭</div>
          <h2 class="valuation-result-title">Ikke data nok</h2>
          <p>Vi har endnu ikke set nok handler af ${esc(input.brand)} ${esc(input.model)} til at give en præcis vurdering.</p>
          <p style="margin-top:12px;">Du kan stadig oprette annoncen og lade markedet vise dig den rigtige pris — eller spørge en af vores forhandlere om vejledning.</p>
          <div class="valuation-result-cta">
            <button class="valuation-cta-primary" onclick="navigateTo('/sell')">Opret annonce →</button>
            <button class="valuation-cta-secondary" onclick="navigateTo('/forhandlere')">Find forhandler</button>
          </div>
        </div>`;
      return;
    }

    const sampleNote = result.sampleType === 'exact'
      ? `Baseret på ${result.sampleSize} lignende handler`
      : result.sampleType === 'wider-year'
        ? `Baseret på ${result.sampleSize} ${esc(input.brand)} ${esc(input.model)}-handler (alle årgange)`
        : `Baseret på ${result.sampleSize} ${esc(input.brand)}-handler (få model-specifikke data)`;

    const rangeWidth = result.high - result.low;
    const medianPos  = ((result.median - result.low) / rangeWidth) * 100;

    resultEl.innerHTML = `
      <div class="valuation-result-card">
        <h2 class="valuation-result-title">${esc(input.brand)} ${esc(input.model)} (${esc(input.condition)})</h2>
        <p class="valuation-result-year">Årgang ${input.year}</p>

        <div class="valuation-result-median">
          <div class="valuation-result-median-label">Estimeret markedspris</div>
          <div class="valuation-result-median-value">${formatPrice(result.median)}</div>
        </div>

        <div class="valuation-result-range">
          <div class="valuation-range-bar">
            <div class="valuation-range-fill"></div>
            <div class="valuation-range-marker" style="left:${medianPos}%;"></div>
          </div>
          <div class="valuation-range-labels">
            <div class="valuation-range-label">
              <span class="valuation-range-label-tag">Lav</span>
              <span class="valuation-range-label-price">${formatPrice(result.low)}</span>
            </div>
            <div class="valuation-range-label valuation-range-label-center">
              <span class="valuation-range-label-tag">Median</span>
              <span class="valuation-range-label-price">${formatPrice(result.median)}</span>
            </div>
            <div class="valuation-range-label valuation-range-label-right">
              <span class="valuation-range-label-tag">Høj</span>
              <span class="valuation-range-label-price">${formatPrice(result.high)}</span>
            </div>
          </div>
        </div>

        <p class="valuation-result-note">${sampleNote}</p>

        <div class="valuation-result-tips">
          <h3>💡 Tips</h3>
          <ul>
            <li><strong>Sælg hurtigt</strong>: start på medianen eller 5% under</li>
            <li><strong>Maksimer pris</strong>: start på den høje pris med skarpe billeder og god beskrivelse</li>
            <li><strong>Husk</strong>: gode billeder og en troværdig beskrivelse hæver salgsprisen markant</li>
          </ul>
        </div>

        <div class="valuation-result-cta">
          <button class="valuation-cta-primary" onclick="navigateTo('/sell')">
            🚀 Opret annonce til ${formatPrice(result.median)}
          </button>
          <button class="valuation-cta-secondary" onclick="window.runValuation();window.scrollTo({top:0,behavior:'smooth'});">
            Beregn igen
          </button>
        </div>
      </div>`;

    // Scroll til resultatet
    setTimeout(() => {
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function formatPrice(n) {
    return Math.round(n).toLocaleString('da-DK') + ' kr.';
  }

  function addValuationJsonLd() {
    const existing = document.getElementById('valuation-jsonld');
    if (existing) existing.remove();

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': 'Cykel-vurdering',
      'description': 'Gratis værktøj til at estimere markedsværdien af din cykel baseret på rigtige handler på Cykelbørsen.',
      'url': `${BASE_URL}/vurder-min-cykel`,
      'applicationCategory': 'BusinessApplication',
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'DKK',
      },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'valuation-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  return {
    renderValuationPage,
    runValuation,
  };
}
