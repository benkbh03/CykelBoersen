/* Shared trust-score logik. Bruges på bike-detail (kompakt pill) og
   profilsider (fuld breakdown på Vurderinger-tabben).

   Anti-gaming: kun cykler hvor der findes en anmeldelse fra en ANDEN
   bruger tæller som "verificeret salg". En sælger kan ikke selv lave
   anmeldelser, så fake-handler (markér 5 cykler solgt med det samme)
   boost'er ikke trust-scoren. */

import { esc } from './utils.js';

export async function fetchTrustData(supabase, profileId) {
  const [reviewsRes, allReviewsRes] = await Promise.all([
    // Anmeldelser fra ANDRE brugere linket til specifik bike → verificeret salg
    supabase.from('reviews')
      .select('bike_id, rating')
      .eq('reviewed_user_id', profileId)
      .neq('reviewer_id', profileId)
      .not('bike_id', 'is', null),
    // Alle anmeldelser (til avg rating + count display)
    supabase.from('reviews')
      .select('rating')
      .eq('reviewed_user_id', profileId),
  ]);
  return computeTrustStats(reviewsRes.data || [], allReviewsRes.data || []);
}

/* Brug denne hvis profilside allerede har fetched reviews — undgår duplikeret
   netværkskald. Reviews skal indeholde bike_id, rating, reviewer_id felter. */
export function computeTrustStatsFromReviews(profileId, reviews) {
  const verifiedRows = (reviews || []).filter(r =>
    r.bike_id && r.reviewer_id !== profileId
  );
  return computeTrustStats(verifiedRows, reviews || []);
}

function computeTrustStats(verifiedReviews, allReviews) {
  const verifiedBikeIds = new Set(verifiedReviews.map(r => r.bike_id));
  const soldCount = verifiedBikeIds.size;
  const reviewCount = allReviews.length;
  const avgRating = reviewCount > 0
    ? allReviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount
    : 0;
  return { soldCount, reviewCount, avgRating };
}

export function calculateTrustScore(profile, stats) {
  const { soldCount, reviewCount, avgRating } = stats;
  let trustScore = 0;
  if (profile.email_verified) trustScore += 1;
  if (profile.id_verified)    trustScore += 2;
  if (soldCount >= 5)          trustScore += 3;
  else if (soldCount >= 1)     trustScore += 1;
  if (profile.verified && profile.seller_type === 'dealer') trustScore += 3;
  if (avgRating >= 4.5 && reviewCount >= 3) trustScore += 2;
  const isTrusted = trustScore >= 5;

  const tips = [];
  if (!profile.email_verified)  tips.push('Email-verifikation');
  if (!profile.id_verified)     tips.push('ID-verifikation');
  if (soldCount < 5)             tips.push(`${Math.max(1, 5 - soldCount)} flere salg`);
  if (profile.seller_type === 'dealer' && !profile.verified) tips.push('CVR-godkendelse');
  if (reviewCount < 3)           tips.push('Flere anmeldelser');

  return { trustScore, isTrusted, tips };
}

/* Kompakt pill til bike-detail seller card. Returnerer tom streng hvis
   ikke trusted — keeper sælger-rækken ren for nye sælgere. Full breakdown
   findes alligevel på sælgers profil → Vurderinger-tab. */
export function buildTrustPillHTML(score) {
  if (!score.isTrusted) return '';
  return `<span class="trust-pill" title="Trust-score: ${score.trustScore}/11. Bygges på verifikationer, handelshistorik og anmeldelser.">🛡️ Trygt køb</span>`;
}

/* Fuld breakdown — bruges øverst på Vurderinger-tabben på profilsider. */
export function buildTrustBreakdownHTML(profile, stats, score) {
  const { soldCount, reviewCount, avgRating } = stats;
  const { trustScore, isTrusted, tips } = score;
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('da-DK', { month: 'long', year: 'numeric' })
    : null;
  const ratingHtml = reviewCount > 0
    ? `${avgRating.toFixed(1)}★ <span class="trust-stat-sub">(${reviewCount} anmeldelse${reviewCount === 1 ? '' : 'r'})</span>`
    : null;

  return `
    <div class="trust-card ${isTrusted ? 'trust-card--trusted' : 'trust-card--neutral'}">
      ${isTrusted ? `
      <div class="trust-card-badge" title="Trust-score: ${trustScore}/11. Bygges på verifikationer, handelshistorik og anmeldelser.">
        <span class="trust-card-badge-icon" aria-hidden="true">🛡️</span>
        <div class="trust-card-badge-text">
          <strong>Trygt køb</strong>
          <span>Verificeret sælger med god handelshistorik</span>
        </div>
      </div>` : ''}
      <div class="trust-card-stats">
        ${memberSince ? `
        <div class="trust-stat">
          <span class="trust-stat-label">Medlem siden</span>
          <span class="trust-stat-value">${esc(memberSince)}</span>
        </div>` : ''}
        <div class="trust-stat">
          <span class="trust-stat-label">Solgte cykler</span>
          <span class="trust-stat-value">${soldCount}</span>
        </div>
        ${ratingHtml ? `
        <div class="trust-stat">
          <span class="trust-stat-label">Vurdering</span>
          <span class="trust-stat-value">${ratingHtml}</span>
        </div>` : `
        <div class="trust-stat trust-stat--muted">
          <span class="trust-stat-label">Vurdering</span>
          <span class="trust-stat-value">Endnu ingen anmeldelser</span>
        </div>`}
      </div>
      ${!isTrusted && tips.length ? `
      <div class="trust-card-tips" title="Mangler for at få Trygt-køb-stempel">
        <span class="trust-card-tips-label">Bygger tillid via:</span>
        ${tips.slice(0, 3).map(t => `<span class="trust-card-tip-chip">${esc(t)}</span>`).join('')}
      </div>` : ''}
    </div>
  `;
}
