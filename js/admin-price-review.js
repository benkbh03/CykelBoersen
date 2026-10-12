/* ────────────────────────────────────────────────────────────────
   admin-price-review.js — cykelannoncer under 200 kr. venter her

   En Cannondale el-cykel til 9 kr. stod på forsiden i flere dage 6. okt.
   En så lav pris er en test, en tastefejl eller et lokkemiddel. Derfor
   holder databasen dem tilbage (supabase/sql/add_low_price_review.sql), og
   her godkender eller afviser admin dem.

   Godkend: annoncen går live, og den godkendte pris huskes.
   Afvis:   annoncen forbliver skjult. Sælgeren kan rette prisen op, så
            går den live af sig selv.
   Begge skrives i moderation_log af admin_review_bike().
──────────────────────────────────────────────────────────────── */

import { bikePath } from './bike-url.js';

export function createAdminPriceReview({ supabase, esc, retryHTML, showToast, notifySavedSearches }) {
  async function loadPriceReview() {
    const el = document.getElementById('admin-price-review');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--muted)">Indlæser…</p>';

    const { data, error } = await supabase
      .from('bikes')
      .select('id, user_id, brand, model, type, price, city, year, created_at, profiles!user_id(name, shop_name), bike_images(url, is_primary)')
      .eq('held_for_review', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      el.innerHTML = retryHTML('Kunne ikke hente annoncer til godkendelse.', 'loadPriceReview');
      return;
    }
    if (!data || data.length === 0) {
      el.innerHTML = '<p style="color:var(--muted)">Ingen annoncer venter. Cykelannoncer under 200 kr. lander her, før de bliver vist.</p>';
      return;
    }

    el.innerHTML = '<p style="color:var(--muted);margin:0 0 var(--space-4)">Cykelannoncer under 200 kr. Ingen af dem er synlige for andre end sælgeren.</p>'
      + data.map(b => {
        const seller = b.profiles?.shop_name || b.profiles?.name || 'Ukendt';
        const img = b.bike_images?.find(i => i.is_primary)?.url || b.bike_images?.[0]?.url || '';
        const date = b.created_at ? new Date(b.created_at).toLocaleDateString('da-DK') : '';
        return '<div class="admin-row">'
          + (img ? `<img src="${esc(img)}" alt="" loading="lazy" style="width:64px;height:48px;object-fit:cover;border-radius:var(--radius-sm);flex-shrink:0">` : '')
          + '<div class="admin-row-info">'
          + `<div class="admin-row-name"><a href="${bikePath(b)}" target="_blank" rel="noopener">${esc(b.brand)} ${esc(b.model)}</a> · ${Number(b.price).toLocaleString('da-DK')} kr.</div>`
          + `<div class="admin-row-meta">${esc(seller)}${b.city ? ' · ' + esc(b.city) : ''}${b.type ? ' · ' + esc(b.type) : ''}${b.year ? ' · ' + esc(String(b.year)) : ''} · oprettet ${date}</div>`
          + '</div>'
          + '<div class="admin-row-actions">'
          + `<button class="btn-approve" onclick="reviewLowPriceBike('${b.id}', true)">Godkend</button>`
          + `<button class="btn-reject" onclick="reviewLowPriceBike('${b.id}', false)">Afvis</button>`
          + '</div></div>';
      }).join('');
  }

  async function reviewLowPriceBike(bikeId, approve) {
    let reason = null;
    if (!approve) {
      reason = prompt('Afvis annoncen?\n\nDen forbliver skjult. Sælgeren kan rette prisen, så går den live.\n\nKort begrundelse (gemmes i moderationsloggen):', 'Urealistisk pris');
      if (reason === null) return;
    }
    const { error } = await supabase.rpc('admin_review_bike', { p_bike_id: bikeId, p_approve: approve, p_reason: reason });
    if (error) { showToast('Kunne ikke gemme: ' + error.message, 'fejl'); return; }

    if (approve) {
      // Først nu er annoncen offentlig, så først nu må cykelagenterne høre om den.
      const { data: b } = await supabase.from('bikes').select('id, user_id').eq('id', bikeId).single();
      if (b && notifySavedSearches) notifySavedSearches(b);
    }
    showToast(approve ? 'Annoncen er godkendt og vises nu' : 'Annoncen er afvist og forbliver skjult', 'ok');
    loadPriceReview();
  }

  return { loadPriceReview, reviewLowPriceBike };
}
