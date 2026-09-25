/* ============================================================
   SÆLGERLINJEN PÅ ANNONCEKORT — én linje: [type-ikon] Navn ✓ · [pin] By

   Før var der fire forskellige udgaver (forside, kategori, mærke,
   forhandlerprofil) med avatar-cirkel, farvet pille, 📍-emoji og en
   "sidst aktiv"-linje i hver sin kombination. Én funktion, så de ikke
   kan glide fra hinanden igen.

   Ligger i en NY fil med vilje: nye eksporter i et eksisterende modul
   dræbte siden for besøgende med cache (se CLAUDE.md, mønster-tabellen).

   `extra` er rå HTML der sættes efter navnet (fx stelnummer-skjoldet);
   kalderen er ansvarlig for at den er escapet.
   ============================================================ */
import { esc, iconDealer, iconPrivate, iconPin } from './utils.js';

export function cardSellerLine(profile, city, extra = '') {
  const p = profile || {};
  const isDealer = (p.seller_type || 'private') === 'dealer';
  const name = isDealer ? (p.shop_name || p.name) : p.name;
  return `<div class="card-seller-line">
      <span class="card-seller-id" title="${isDealer ? 'Forhandler' : 'Privat sælger'}">
        <span class="card-seller-ikon${isDealer ? ' er-forhandler' : ''}" aria-hidden="true">${isDealer ? iconDealer(12) : iconPrivate(12)}</span>
        <span class="seller-name">${esc(name) || 'Ukendt'}</span>
        ${p.verified ? '<span class="verified-badge" title="Verificeret forhandler">✓</span>' : ''}
      </span>
      ${extra}
      ${city ? `<span class="card-location">${iconPin(12)}<span class="bike-city">${esc(city)}</span></span>` : ''}
    </div>`;
}
