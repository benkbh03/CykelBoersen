/* ============================================================
   "Officiel"-mærket ved Cykelbørsens egen konto
   ============================================================
   Mærket kommer fra profiles.is_official, som kun admin kan sætte
   (add_official_account.sql). Navnet "Cykelbørsen" alene beviser
   ingenting: en svindler brugte det 13. okt.

   Ny fil frem for en eksport i utils.js: en cachet utils.js uden
   eksporten ville ellers lægge indbakken ned (se CLAUDE.md). */

export function officialBadgeHTML() {
  return '<span class="official-badge" title="Cykelbørsens egen konto. Kun denne konto kan have mærket.">'
    + '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
    + 'Officiel</span>';
}
