/* ============================================================
   FORHANDLERE UDEN CYKLER: KORT LISTE UNDER KORTENE
   ============================================================
   Forhandlere med cykler til salg får et fuldt kort på /forhandlere.
   De øvrige står her som én linje med navn og by. Tre ens kort med
   "Ingen cykler lige nu" fik siden til at se tom ud for de forhandlere
   vi inviterer (Byens Bedste, 29. okt.). Lægger en forhandler cykler op,
   rykker den af sig selv op blandt kortene.
   Ny fil frem for en ny eksport i et eksisterende modul (cache-reglen i
   CLAUDE.md). */

// Navnet uden at fluebenet kan falde ned på egen linje: sidste ord og
// fluebenet står i samme ombrydningsfri span.
export function dealerNameWithTick(name, esc) {
  const safe = String(name || '').trim();
  const cut  = safe.lastIndexOf(' ');
  const head = cut > 0 ? safe.slice(0, cut + 1) : '';
  const tail = cut > 0 ? safe.slice(cut + 1) : safe;
  return `${esc(head)}<span class="dealer-name-end">${esc(tail)}<span class="dealer-verified-tick" title="Verificeret forhandler">✓</span></span>`;
}

export function dealerRestListHtml(rows, esc) {
  if (!rows.length) return '';
  const items = rows.map(({ dealer }) => {
    const name = dealer.shop_name || dealer.name || 'Forhandler';
    const city = dealer.city || '';
    // Rigtigt link (kan åbnes i ny fane og læses af skærmlæsere); klik i
    // samme fane går gennem routeren som kortene.
    return `<li><a class="dealer-rest-row" href="/dealer/${esc(dealer.id)}/" onclick="event.preventDefault();navigateToDealer('${esc(dealer.id)}')">
        <span class="dealer-rest-name">${dealerNameWithTick(name, esc)}</span>
        ${city ? `<span class="dealer-rest-city">${esc(city)}</span>` : ''}
      </a></li>`;
  }).join('');
  return `<h2 class="dealer-rest-title">Også på Cykelbørsen</h2>
    <p class="dealer-rest-sub">Har ikke cykler til salg lige nu.</p>
    <ul class="dealer-rest-list">${items}</ul>`;
}
