/* ============================================================
   KATEGORI-LANDINGSSIDE (/racercykler, /el-cykler, …)
   ------------------------------------------------------------
   Egen landingsside pr. cykeltype med unik H1, SEO-tekst, FAQ og
   et filtreret annonce-feed (bike.type = kategoriens type). Samme
   mønster som js/brand-page.js. Statisk prerendret i
   scripts/prerender.mjs — hold indholdsstrukturen i sync.
   ============================================================ */

import { CATEGORY_META } from './category-data.js';

const CATEGORY_INITIAL_BIKES = 8;

export function createCategoryPage({
  supabase,
  esc,
  updateSEOMeta,
  showDetailView,
  showListingView,
  navigateTo,
  navigateToBike,
  BASE_URL,
}) {

  function conditionClass(c) {
    if (c === 'Ny')        return 'cond-ny';
    if (c === 'Som ny')    return 'cond-somny';
    if (c === 'God stand') return 'cond-god';
    if (c === 'Brugt')     return 'cond-brugt';
    return '';
  }

  async function renderCategoryPage(slug) {
    const meta = CATEGORY_META[slug];
    if (!meta) {
      showListingView();
      return;
    }

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = meta.title;
    updateSEOMeta(meta.metaDesc, `/${slug}`, { title: meta.title });
    addCategoryJsonLd(slug, meta);

    detailView.innerHTML = `
      <div class="brand-page category-page">
        <button class="sell-back-btn" onclick="history.length > 1 ? history.back() : navigateTo('/')">← Tilbage</button>
        <div class="brand-page-hero">
          <h1 class="brand-page-title">${esc(meta.h1)}</h1>
        </div>

        <div class="brand-page-body">
          <p class="brand-page-description">${esc(meta.intro)}</p>
        </div>

        <div id="category-bikes-section" class="brand-page-section">
          <h2 class="brand-page-section-title">${esc(meta.name)} til salg</h2>
          <div id="category-bikes-grid" class="brand-bikes-grid">
            <p style="color:var(--muted);padding:20px;">Henter ${esc(meta.name.toLowerCase())}…</p>
          </div>
          <div id="category-bikes-more" class="brand-show-more-wrap"></div>
        </div>

        ${meta.faq && meta.faq.length ? `
        <div class="brand-page-section category-faq">
          <h2 class="brand-page-section-title">Ofte stillede spørgsmål om ${esc(meta.name.toLowerCase())}</h2>
          <div class="category-faq-list">
            ${meta.faq.map(f => `
              <details class="category-faq-item">
                <summary>${esc(f.q)}</summary>
                <p>${esc(f.a)}</p>
              </details>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="brand-page-section">
          <h2 class="brand-page-section-title">Andre kategorier</h2>
          <div class="brand-related-grid">
            ${meta.related.map(rs => CATEGORY_META[rs]
              ? `<a class="brand-related-chip" href="/${rs}" onclick="event.preventDefault();navigateTo('/${rs}')">${esc(CATEGORY_META[rs].name)}</a>`
              : '').join('')}
          </div>
        </div>
      </div>
    `;

    loadCategoryBikes(slug, meta);
  }

  async function loadCategoryBikes(slug, meta) {
    const grid = document.getElementById('category-bikes-grid');
    const moreSlot = document.getElementById('category-bikes-more');
    if (!grid) return;

    const { data: bikes, error } = await supabase
      .from('bikes')
      .select('id, brand, model, price, type, city, condition, year, size, size_cm, is_active, created_at, profiles!user_id(name, seller_type, shop_name, verified), bike_images(url, thumb_url, is_primary)')
      .eq('is_active', true)
      .eq('category', 'cykel')
      .eq('type', meta.type)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      grid.innerHTML = `<p style="color:var(--muted);padding:20px;">Kunne ikke hente cykler. <button onclick="renderCategoryPage('${slug}')" style="background:var(--rust);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Prøv igen</button></p>`;
      return;
    }

    if (!bikes || bikes.length === 0) {
      grid.innerHTML = `
        <div class="brand-empty-state">
          <p>Der er ingen ${esc(meta.name.toLowerCase())} til salg lige nu.</p>
          <p style="margin-top:8px;font-size:0.9rem;color:var(--muted);">Opret en cykelagent, så får du besked når en bliver tilgængelig.</p>
          <button class="brand-cta-btn" onclick="navigateTo('/')">Se alle cykler →</button>
        </div>`;
      return;
    }

    grid.innerHTML = bikes.map(b => buildBikeCard(b)).join('');

    if (bikes.length > CATEGORY_INITIAL_BIKES) {
      grid.classList.add('brand-bikes-grid--collapsed');
      if (moreSlot) {
        moreSlot.innerHTML = `<button class="brand-show-more-btn" onclick="expandCategoryBikes()">Vis alle ${bikes.length} ${esc(meta.name.toLowerCase())} →</button>`;
      }
    } else if (moreSlot) {
      moreSlot.innerHTML = '';
    }

    const sectionTitle = document.querySelector('#category-bikes-section .brand-page-section-title');
    if (sectionTitle) {
      sectionTitle.textContent = `${bikes.length} ${meta.name.toLowerCase()} til salg`;
    }
  }

  function expandCategoryBikes() {
    const grid = document.getElementById('category-bikes-grid');
    const slot = document.getElementById('category-bikes-more');
    if (grid) grid.classList.remove('brand-bikes-grid--collapsed');
    if (slot) slot.innerHTML = '';
  }

  function buildBikeCard(b) {
    const _pRec = b.bike_images?.find(i => i.is_primary) || b.bike_images?.[0];
    const primaryImg = _pRec?.thumb_url || _pRec?.url;
    const profile = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = profile.shop_name || profile.name || 'Sælger';
    return `
      <div class="bike-card" onclick="navigateToBike('${b.id}')">
        <div class="bike-card-img">
          ${primaryImg
            ? `<img src="${primaryImg}" alt="${esc(b.brand)} ${esc(b.model)}" loading="lazy" decoding="async" width="400" height="300">`
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

  function addCategoryJsonLd(slug, meta) {
    const existing = document.getElementById('category-jsonld');
    if (existing) existing.remove();

    const blocks = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': meta.h1,
        'description': meta.metaDesc,
        'url': `${BASE_URL}/${slug}`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', position: 1, name: 'Forside', item: `${BASE_URL}/` },
          { '@type': 'ListItem', position: 2, name: meta.name, item: `${BASE_URL}/${slug}` },
        ],
      },
    ];
    if (meta.faq && meta.faq.length) {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': meta.faq.map(f => ({
          '@type': 'Question',
          'name': f.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
        })),
      });
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'category-jsonld';
    script.textContent = JSON.stringify(blocks);
    document.head.appendChild(script);
  }

  function removeCategoryJsonLd() {
    const el = document.getElementById('category-jsonld');
    if (el) el.remove();
  }

  return {
    renderCategoryPage,
    expandCategoryBikes,
    removeCategoryJsonLd,
  };
}
