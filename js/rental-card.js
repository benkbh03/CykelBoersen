/* ============================================================
   UDLEJNING — kortet på /udlejning
   ------------------------------------------------------------
   Én funktion til kortet, så oversigten og forhåndsvisningen i
   opret-formularen ikke kan glide fra hinanden. Det forhandleren
   ser mens de skriver, er præcis det kunden ser.
   ============================================================ */

import { esc } from './utils.js';
import { noImagePlaceholder } from './ui-icons.js';

/**
 * @param {object} it          rental_items-række (title, type, city, daily_rate)
 * @param {object} opts
 * @param {string} [opts.imgUrl]     primærbillede
 * @param {string} [opts.dealerName] butikkens navn
 * @param {boolean} [opts.preview]   uden klik (forhåndsvisning)
 */
export function rentalCardHTML(it, { imgUrl = '', dealerName = 'Forhandler', preview = false } = {}) {
  const title = it.title || 'Titel på cyklen';
  const meta = [it.type, it.city].filter(Boolean).map(esc).join(' · ');
  const click = preview ? '' : ` onclick="navigateTo('/udlejning/${esc(it.id)}')"`;
  return `
    <div class="rental-card${preview ? ' rental-card--preview' : ''}"${click}>
      <div class="rental-card-img">
        ${imgUrl
          ? `<img src="${esc(imgUrl)}" alt="${esc(title)}" loading="lazy" decoding="async" width="400" height="300">`
          : noImagePlaceholder()}
      </div>
      <div class="rental-card-body">
        <div class="rental-card-title">${esc(title)}</div>
        <div class="rental-card-price">${(Number(it.daily_rate) || 0).toLocaleString('da-DK')} kr. <span>pr. dag</span></div>
        ${meta ? `<div class="rental-card-meta">${meta}</div>` : ''}
        <div class="rental-card-dealer">${esc(dealerName)}</div>
      </div>
    </div>`;
}

/** Linjerne under kortet i forhåndsvisningen: det kunden ser på cykelsiden. */
export function rentalTermsHTML(it) {
  const kr = n => `${(Number(n) || 0).toLocaleString('da-DK')} kr.`;
  const rows = [];
  if (it.weekly_rate) rows.push(['Pr. uge', kr(it.weekly_rate)]);
  rows.push(['Depositum', it.deposit_amount ? kr(it.deposit_amount) : 'Intet']);
  rows.push(['Lejeperiode', `${it.min_days || 1} til ${it.max_days || 14} dage`]);
  if (it.address || it.city) rows.push(['Afhentning', [it.address, it.city].filter(Boolean).map(esc).join(', ')]);
  return `<dl class="rental-preview-terms">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}
