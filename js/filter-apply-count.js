/* Antallet på mobilens "Vis cykler"-knap i filterarket.
   Filtrene slår igennem med det samme, mens arket er åbent, så knappen kan
   sige hvad der venter bag den: "Vis 23 cykler" eller "Ingen cykler matcher".
   Så lukker køberen ikke arket ned over en tom liste. (Idéen er Bilbasens
   "Vis 41.875 biler"-knap.) Tallet kommer fra samme forespørgsel som listen.
   n = null: ingen aktive filtre, knappen står som "Vis cykler". */
export function setFilterApplyCount(n, category = 'cykel') {
  const btn = document.getElementById('sidebar-mobile-apply-btn');
  if (!btn) return;
  const acc = category === 'tilbehoer';
  if (n == null) { btn.textContent = acc ? 'Vis tilbehør' : 'Vis cykler'; return; }
  if (n === 0) { btn.textContent = acc ? 'Intet tilbehør matcher' : 'Ingen cykler matcher'; return; }
  const num = n.toLocaleString('da-DK');
  btn.textContent = acc ? `Vis ${num} stk. tilbehør` : `Vis ${num} ${n === 1 ? 'cykel' : 'cykler'}`;
}
