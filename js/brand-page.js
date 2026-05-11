/* ============================================================
   BRAND-LANDINGSSIDE (/cykler/:brand)
   ============================================================ */

import { getBrandMeta, slugToBrand, brandToSlug, BRANDS_META, KNOWN_BRANDS } from './brand-data.js';

export function createBrandPage({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  showListingView,
  navigateTo,
  navigateToBike,
  navigateToDealer,
  safeAvatarUrl,
  getInitials,
  transformImageUrl,
  BASE_URL,
}) {

  function conditionClass(c) {
    if (c === 'Ny')        return 'cond-ny';
    if (c === 'Som ny')    return 'cond-somny';
    if (c === 'God stand') return 'cond-god';
    if (c === 'Brugt')     return 'cond-brugt';
    return '';
  }

  async function renderBrandPage(brandSlug) {
    const brandName = slugToBrand(brandSlug);
    if (!brandName) {
      showListingView();
      return;
    }

    const meta = getBrandMeta(brandName);
    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    // Sæt SEO + titel
    const title = `Brugte og nye ${brandName} cykler til salg | Cykelbørsen`;
    const desc  = meta.description.slice(0, 155);
    document.title = title;
    updateSEOMeta(desc, `/cykler/${brandSlug}`);

    // Tilføj brand-specifik JSON-LD
    addBrandJsonLd(brandName, meta);

    // Render skelet med loading-state
    detailView.innerHTML = `
      <div class="brand-page">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Forsiden</button>
        <div class="brand-page-hero">
          <h1 class="brand-page-title">${esc(brandName)}</h1>
          ${meta.tagline ? `<p class="brand-page-tagline">${esc(meta.tagline)}</p>` : ''}
          ${meta.country || meta.founded ? `
          <div class="brand-page-meta">
            ${meta.country ? `<span class="brand-meta-chip">🌍 ${esc(meta.country)}</span>` : ''}
            ${meta.founded ? `<span class="brand-meta-chip">📅 Grundlagt ${meta.founded}</span>` : ''}
            ${meta.typical_price_range ? `<span class="brand-meta-chip">💰 ${esc(meta.typical_price_range)}</span>` : ''}
          </div>` : ''}
        </div>

        <div class="brand-page-body">
          <p class="brand-page-description">${esc(meta.description)}</p>
        </div>

        <div id="brand-bikes-section" class="brand-page-section">
          <h2 class="brand-page-section-title">Cykler til salg</h2>
          <div id="brand-bikes-grid" class="bike-grid">
            <p style="color:var(--muted);padding:20px;">Henter ${esc(brandName)}-cykler…</p>
          </div>
        </div>

        ${meta.popular_models ? `
        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Populære ${esc(brandName)}-modeller</h2>
          <div class="brand-models-grid">
            ${Object.entries(meta.popular_models).map(([type, models]) => `
              <div class="brand-models-group">
                <h3 class="brand-models-group-title">${esc(type)}</h3>
                <ul class="brand-models-list">
                  ${models.map(m => `<li>${esc(m)}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div id="brand-dealers-section" class="brand-page-section" style="display:none;">
          <h2 class="brand-page-section-title">Forhandlere der sælger ${esc(brandName)}</h2>
          <div id="brand-dealers-list" class="brand-dealers-list"></div>
        </div>

        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Relaterede mærker</h2>
          <div class="brand-related-grid">
            ${getRelatedBrands(brandName).map(b => `
              <a class="brand-related-chip" href="/cykler/${brandToSlug(b)}" onclick="event.preventDefault();navigateTo('/cykler/${brandToSlug(b)}')">${esc(b)}</a>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Indlæs cykler + forhandlere parallelt
    loadBrandBikes(brandName);
    loadBrandDealers(brandName);
  }

  async function loadBrandBikes(brandName) {
    const grid = document.getElementById('brand-bikes-grid');
    if (!grid) return;

    const { data: bikes, error } = await supabase
      .from('bikes')
      .select('id, brand, model, price, type, city, condition, year, size, size_cm, color, colors, warranty, external_url, is_active, created_at, user_id, profiles(name, seller_type, shop_name, verified, avatar_url), bike_images(url, is_primary)')
      .eq('is_active', true)
      .ilike('brand', brandName)
      .order('created_at', { ascending: false })
      .limit(24);

    if (error) {
      grid.innerHTML = `<p style="color:var(--muted);padding:20px;">Kunne ikke hente cykler. <button onclick="renderBrandPage('${brandToSlug(brandName)}')" style="background:var(--rust);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Prøv igen</button></p>`;
      return;
    }

    if (!bikes || bikes.length === 0) {
      grid.innerHTML = `
        <div class="brand-empty-state">
          <p>Der er ingen ${esc(brandName)}-cykler til salg lige nu.</p>
          <p style="margin-top:8px;font-size:0.9rem;color:var(--muted);">Gem en søgning, så får du besked når en bliver tilgængelig.</p>
          <button class="brand-cta-btn" onclick="navigateTo('/?search=${encodeURIComponent(brandName)}')">Se alle cykler →</button>
        </div>`;
      return;
    }

    grid.innerHTML = bikes.map(b => buildBikeCard(b)).join('');
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';

    // Opdater sektion-titel med antal
    const sectionTitle = document.querySelector('#brand-bikes-section .brand-page-section-title');
    if (sectionTitle) {
      sectionTitle.textContent = `${bikes.length} ${brandName}${bikes.length === 1 ? '-cykel' : '-cykler'} til salg`;
    }
  }

  function buildBikeCard(b) {
    const primaryImg = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url;
    const thumb = primaryImg ? transformImageUrl(primaryImg, { width: 400, quality: 75 }) : '';
    const profile = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = profile.shop_name || profile.name || 'Sælger';
    return `
      <div class="bike-card" onclick="navigateToBike('${b.id}')">
        <div class="bike-card-img">
          ${primaryImg
            ? `<img src="${thumb}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" decoding="async" width="400" height="300">`
            : '<span style="font-size:4rem">🚲</span>'}
          <div class="bike-card-badges">
            <span class="condition-tag ${conditionClass(b.condition) || ''}">${esc(b.condition || '')}</span>
          </div>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${esc(b.brand)} ${esc(b.model)}</div>
            <div class="bike-price">${(b.price || 0).toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${esc(b.type || '')}</span><span>${b.year || '–'}</span>${b.size || b.size_cm ? `<span>Str. ${b.size_cm ? b.size_cm + ' cm' : esc(b.size)}</span>` : ''}
          </div>
          <div class="card-footer">
            <span class="card-location">📍 ${esc(b.city || '')}</span>
            <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">${sellerType === 'dealer' ? '🏪 ' + esc(sellerName) : '👤 Privat'}</span>
          </div>
        </div>
      </div>`;
  }

  async function loadBrandDealers(brandName) {
    const section = document.getElementById('brand-dealers-section');
    const list = document.getElementById('brand-dealers-list');
    if (!section || !list) return;

    // Find unique dealers der har annoncer med dette brand
    const { data: bikes } = await supabase
      .from('bikes')
      .select('user_id, profiles!inner(id, shop_name, name, city, address, avatar_url, verified, seller_type)')
      .eq('is_active', true)
      .eq('profiles.seller_type', 'dealer')
      .ilike('brand', brandName)
      .limit(50);

    if (!bikes || bikes.length === 0) return;

    // Deduplikér på dealer-id
    const dealerMap = new Map();
    for (const b of bikes) {
      if (!dealerMap.has(b.user_id) && b.profiles) {
        dealerMap.set(b.user_id, b.profiles);
      }
    }
    const dealers = [...dealerMap.values()];
    if (dealers.length === 0) return;

    section.style.display = '';
    list.innerHTML = dealers.slice(0, 6).map(d => {
      const name = d.shop_name || d.name || 'Forhandler';
      const avatar = safeAvatarUrl(d.avatar_url);
      return `
        <a class="brand-dealer-card" href="/dealer/${d.id}" onclick="event.preventDefault();navigateToDealer('${d.id}')">
          <div class="brand-dealer-logo">
            ${avatar ? `<img src="${avatar}" alt="${esc(name)}">` : `<span>${esc(getInitials(name))}</span>`}
          </div>
          <div class="brand-dealer-info">
            <div class="brand-dealer-name">${esc(name)}${d.verified ? ' ✓' : ''}</div>
            ${d.city ? `<div class="brand-dealer-city">📍 ${esc(d.city)}</div>` : ''}
          </div>
        </a>`;
    }).join('');
  }

  function getRelatedBrands(brandName) {
    // Naive: vis 5 andre brands fra samme primære cykeltype
    const meta = getBrandMeta(brandName);
    const myTypes = meta?.popular_models ? Object.keys(meta.popular_models) : [];
    const candidates = [];
    for (const [slug, m] of Object.entries(BRANDS_META)) {
      if (m.name === brandName) continue;
      if (!m.popular_models) continue;
      const overlap = Object.keys(m.popular_models).some(t => myTypes.includes(t));
      if (overlap) candidates.push(m.name);
    }
    return candidates.slice(0, 6);
  }

  function addBrandJsonLd(brandName, meta) {
    // Fjern evt. eksisterende
    const existing = document.getElementById('brand-jsonld');
    if (existing) existing.remove();

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': `Brugte og nye ${brandName} cykler`,
      'description': meta.description,
      'url': `${BASE_URL}/cykler/${brandToSlug(brandName)}`,
      'about': {
        '@type': 'Brand',
        'name': brandName,
        ...(meta.country && { 'foundingLocation': meta.country }),
        ...(meta.founded && { 'foundingDate': String(meta.founded) }),
      },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'brand-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function removeBrandJsonLd() {
    const el = document.getElementById('brand-jsonld');
    if (el) el.remove();
  }

  async function renderBrandsOverview() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = 'Alle cykelmærker — Brugte og nye cykler | Cykelbørsen';
    updateSEOMeta(
      'Browse alle cykelmærker på Cykelbørsen — fra Trek og Cube til Christiania Bikes og Brompton. Find brugte og nye cykler fra over 70 mærker.',
      '/maerker'
    );

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    // Hent antal aktive annoncer pr. brand (parallel)
    const { data: bikes } = await supabase
      .from('bikes')
      .select('brand')
      .eq('is_active', true);

    const counts = new Map();
    if (bikes) {
      for (const b of bikes) {
        if (!b.brand) continue;
        const key = b.brand.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    // Grupperinger: kurateret (har metadata) vs auto-fallback
    const curated = [];
    const others  = [];
    for (const brand of KNOWN_BRANDS) {
      const slug  = brandToSlug(brand);
      const count = counts.get(brand.toLowerCase()) || 0;
      const isCurated = !!BRANDS_META[slug];
      const item = { brand, slug, count };
      if (isCurated) curated.push(item);
      else others.push(item);
    }

    // Sortér efter antal aktive annoncer (faldende), så fyldte mærker top
    curated.sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
    others.sort((a, b)  => b.count - a.count || a.brand.localeCompare(b.brand));

    const totalActive = bikes ? bikes.length : 0;

    detailView.innerHTML = `
      <div class="brands-overview-page">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Forsiden</button>

        <header class="brands-overview-hero">
          <h1 class="brands-overview-title">Alle cykelmærker</h1>
          <p class="brands-overview-subtitle">
            Browse cykler fra over ${KNOWN_BRANDS.length} mærker —
            ${totalActive.toLocaleString('da-DK')} aktive annoncer i alt.
          </p>
        </header>

        <section class="brands-overview-section">
          <h2 class="brands-overview-section-title">Kuraterede mærker</h2>
          <div class="brands-overview-grid">
            ${curated.map(({ brand, slug, count }) => `
              <a class="brand-tile" href="/cykler/${slug}" onclick="event.preventDefault();navigateTo('/cykler/${slug}')">
                <div class="brand-tile-name">${esc(brand)}</div>
                ${count > 0
                  ? `<div class="brand-tile-count">${count} ${count === 1 ? 'cykel' : 'cykler'}</div>`
                  : `<div class="brand-tile-count brand-tile-count-empty">Ingen aktuelle</div>`}
              </a>
            `).join('')}
          </div>
        </section>

        ${others.length > 0 ? `
        <section class="brands-overview-section">
          <h2 class="brands-overview-section-title">Øvrige mærker</h2>
          <div class="brands-overview-grid">
            ${others.map(({ brand, slug, count }) => `
              <a class="brand-tile brand-tile-compact" href="/cykler/${slug}" onclick="event.preventDefault();navigateTo('/cykler/${slug}')">
                <div class="brand-tile-name">${esc(brand)}</div>
                ${count > 0
                  ? `<div class="brand-tile-count">${count} ${count === 1 ? 'cykel' : 'cykler'}</div>`
                  : ''}
              </a>
            `).join('')}
          </div>
        </section>` : ''}
      </div>
    `;
  }

  return {
    renderBrandPage,
    renderBrandsOverview,
    removeBrandJsonLd,
  };
}
