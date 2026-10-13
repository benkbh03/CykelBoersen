/* ────────────────────────────────────────────────────────────────
   smart-filter.js — "Beskriv cyklen du leder efter"

   Fritekst øverst i filterpanelet. Edge-funktionen smart-filter
   oversætter teksten til de ALMINDELIGE filtre (samme form som
   applyFilters() bygger), og main.js sætter sidebarens afkrydsninger ud
   fra dem. Der findes altså ikke et "AI-filter" ved siden af de rigtige:
   resultatet er de samme filter-piller som når man klikker selv, og man
   retter dem på samme måde.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase-client.js';
import { setRankWords, clearRankWords } from './smart-rank.js';

const MAX_CHARS = 300;

/** Antal valgte værdier i et filter-args-objekt (til statuslinjen). */
function countFilters(args) {
  let n = 0;
  for (const v of Object.values(args || {})) {
    if (Array.isArray(v)) n += v.length;
    else if (v !== null && v !== undefined && v !== '') n += 1;
  }
  // Min- og maxpris er ét filter for brugeren.
  if (args?.minPrice && args?.maxPrice) n -= 1;
  return n;
}

/** ["kurv", "lys"] → "kurv eller lys" */
function listWords(words) {
  const w = words.slice(0, 5);
  return w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} eller ${w[w.length - 1]}`;
}

/**
 * @param {object} deps
 * @param {(args: object) => void} deps.onApply  sætter filtrene og genindlæser listen
 */
export function initSmartFilter({ onApply }) {
  const input  = document.getElementById('smart-filter-input');
  const btn    = document.getElementById('smart-filter-btn');
  const status = document.getElementById('smart-filter-status');
  if (!input || !btn || input.dataset.ready) return;
  input.dataset.ready = '1';

  let busy = false;
  const say = (msg, isError = false) => {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('is-error', isError);
  };

  async function run() {
    const text = input.value.trim();
    if (busy) return;
    if (text.length < 3) { say('Skriv lidt om cyklen du leder efter.', true); input.focus(); return; }
    if (text.length > MAX_CHARS) { say(`Højst ${MAX_CHARS} tegn.`, true); return; }

    busy = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Finder…';
    say('');
    try {
      const { data, error } = await supabase.functions.invoke('smart-filter', { body: { text } });
      if (error) {
        let msg = 'Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder.';
        try { msg = (await error.context.json()).error || msg; } catch {}
        say(msg, true);
        return;
      }
      const args = data?.filters || {};
      // Ord der ikke er et filter (fx "kurv") sorterer listen i stedet,
      // så en hverdagsbeskrivelse ikke ender i en tom liste.
      const words = Array.isArray(data?.keywords) ? data.keywords : [];
      const n = countFilters(args);
      if (!n && !words.length) {
        clearRankWords();
        say('Fandt ikke noget at filtrere på. Prøv fx med type, mærke, størrelse eller pris.', true);
        return;
      }
      setRankWords(words);
      onApply(args);
      const filtersMsg = !n ? 'Satte ingen filtre.'
        : n === 1 ? 'Satte 1 filter. Du kan fjerne det over annoncerne.'
        : `Satte ${n} filtre. Du kan fjerne dem enkeltvis over annoncerne.`;
      const rankMsg = words.length ? ` Annoncer der nævner ${listWords(words)} står først.` : '';
      say(filtersMsg + rankMsg);
    } catch (_) {
      say('Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder.', true);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  btn.addEventListener('click', run);
  // Tømmes feltet, holder ordene op med at sortere ved næste indlæsning.
  input.addEventListener('input', () => { if (!input.value.trim()) clearRankWords(); });
  input.addEventListener('keydown', (e) => {
    // Enter søger, Shift+Enter giver ny linje.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); run(); }
  });
}
