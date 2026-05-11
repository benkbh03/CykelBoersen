/* ============================================================
   BLOG (/blog og /blog/:slug)
   ============================================================ */

import { BLOG_ARTICLES, getAllArticlesSorted, getArticleBySlug } from './blog-data.js';

export function createBlogPage({
  esc,
  updateSEOMeta,
  showDetailView,
  showListingView,
  navigateTo,
  BASE_URL,
}) {

  async function renderBlogOverview() {
    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = 'Cykelbørsen Blog — Guides, tests og tips';
    updateSEOMeta(
      'Cykelbørsens blog: guides til at købe og sælge cykler, sikkerhed, test og inspiration. Skrevet af cykel-entusiaster for cykel-entusiaster.',
      '/blog'
    );

    addBlogOverviewJsonLd();

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    const articles = getAllArticlesSorted();
    const categories = [...new Set(articles.map(a => a.category))];

    detailView.innerHTML = `
      <div class="blog-page">
        <button class="sell-back-btn" onclick="navigateTo('/')">← Forsiden</button>

        <header class="blog-hero">
          <h1 class="blog-title">Cykelbørsen Blog</h1>
          <p class="blog-subtitle">
            Guides, tests og tips fra cykel-entusiaster — for cykel-entusiaster.
            Skrevet af os, brugt af dig.
          </p>
        </header>

        <div class="blog-categories">
          <button class="blog-cat-btn active" data-cat="all" onclick="filterBlogCategory(this, 'all')">Alle</button>
          ${categories.map(c => `
            <button class="blog-cat-btn" data-cat="${esc(c)}" onclick="filterBlogCategory(this, '${esc(c)}')">${esc(c)}</button>
          `).join('')}
        </div>

        <div class="blog-articles-grid" id="blog-articles-grid">
          ${articles.map(a => `
            <a class="blog-card" href="/blog/${a.slug}" onclick="event.preventDefault();navigateTo('/blog/${a.slug}')" data-cat="${esc(a.category)}">
              <div class="blog-card-emoji">${a.heroEmoji}</div>
              <div class="blog-card-body">
                <span class="blog-card-category">${esc(a.category)}</span>
                <h2 class="blog-card-title">${esc(a.title)}</h2>
                <p class="blog-card-excerpt">${esc(a.excerpt)}</p>
                <div class="blog-card-meta">
                  <span>${formatDate(a.publishedAt)}</span>
                  <span>·</span>
                  <span>${a.readTime} min. læsning</span>
                </div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  function filterBlogCategory(btn, cat) {
    document.querySelectorAll('.blog-cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.blog-card').forEach(card => {
      const show = cat === 'all' || card.dataset.cat === cat;
      card.style.display = show ? '' : 'none';
    });
  }

  async function renderBlogArticle(slug) {
    const article = getArticleBySlug(slug);
    if (!article) {
      showListingView();
      return;
    }

    showDetailView();
    window.scrollTo({ top: 0, behavior: 'auto' });

    document.title = `${article.title} — Cykelbørsen Blog`;
    updateSEOMeta(article.metaDesc, `/blog/${slug}`);

    addBlogArticleJsonLd(article);

    const detailView = document.getElementById('detail-view');
    if (!detailView) return;

    // Find 3 relaterede artikler (samme kategori, ikke nuværende)
    const related = getAllArticlesSorted()
      .filter(a => a.slug !== slug && a.category === article.category)
      .slice(0, 3);
    const fallback = getAllArticlesSorted()
      .filter(a => a.slug !== slug)
      .slice(0, 3);
    const relatedFinal = related.length >= 2 ? related : fallback;

    detailView.innerHTML = `
      <article class="blog-article">
        <button class="sell-back-btn" onclick="navigateTo('/blog')">← Blog</button>

        <header class="blog-article-header">
          <div class="blog-article-emoji">${article.heroEmoji}</div>
          <span class="blog-article-category">${esc(article.category)}</span>
          <h1 class="blog-article-title">${esc(article.title)}</h1>
          <div class="blog-article-meta">
            <span>${formatDate(article.publishedAt)}</span>
            <span>·</span>
            <span>${article.readTime} min. læsning</span>
            <span>·</span>
            <span>Cykelbørsen</span>
          </div>
        </header>

        <div class="blog-article-body">
          ${article.body}
        </div>

        <div class="blog-article-cta">
          <h3>Klar til at handle?</h3>
          <div class="blog-article-cta-btns">
            <button onclick="navigateTo('/')">Se annoncer</button>
            <button onclick="navigateTo('/sell')" class="primary">Opret annonce</button>
          </div>
        </div>

        <section class="blog-related">
          <h2>Læs også</h2>
          <div class="blog-related-grid">
            ${relatedFinal.map(a => `
              <a class="blog-related-card" href="/blog/${a.slug}" onclick="event.preventDefault();navigateTo('/blog/${a.slug}')">
                <div class="blog-related-emoji">${a.heroEmoji}</div>
                <div class="blog-related-info">
                  <span class="blog-related-cat">${esc(a.category)}</span>
                  <h3>${esc(a.title)}</h3>
                  <span class="blog-related-meta">${a.readTime} min. læsning</span>
                </div>
              </a>
            `).join('')}
          </div>
        </section>
      </article>
    `;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const months = ['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december'];
    return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function addBlogOverviewJsonLd() {
    const existing = document.getElementById('blog-jsonld');
    if (existing) existing.remove();
    const articles = getAllArticlesSorted();
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      'name': 'Cykelbørsen Blog',
      'description': 'Guides, tests og tips om cykler.',
      'url': `${BASE_URL}/blog`,
      'publisher': {
        '@type': 'Organization',
        'name': 'Cykelbørsen',
        'url': BASE_URL,
      },
      'blogPost': articles.map(a => ({
        '@type': 'BlogPosting',
        'headline': a.title,
        'description': a.excerpt,
        'datePublished': a.publishedAt,
        'url': `${BASE_URL}/blog/${a.slug}`,
      })),
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'blog-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function addBlogArticleJsonLd(article) {
    const existing = document.getElementById('blog-jsonld');
    if (existing) existing.remove();
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'headline': article.title,
      'description': article.metaDesc,
      'datePublished': article.publishedAt,
      'author': {
        '@type': 'Organization',
        'name': 'Cykelbørsen',
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Cykelbørsen',
        'url': BASE_URL,
      },
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': `${BASE_URL}/blog/${article.slug}`,
      },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'blog-jsonld';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  return {
    renderBlogOverview,
    renderBlogArticle,
    filterBlogCategory,
  };
}
