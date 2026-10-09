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
      const n = countFilters(args);
      if (!n) {
        say('Fandt ikke noget at filtrere på. Prøv fx med type, mærke, størrelse eller pris.', true);
        return;
      }
      onApply(args);
      say(n === 1 ? 'Satte 1 filter. Du kan fjerne det over annoncerne.' : `Satte ${n} filtre. Du kan fjerne dem enkeltvis over annoncerne.`);
    } catch (_) {
      say('Smart filter svarede ikke. Prøv igen, eller brug filtrene herunder.', true);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => {
    // Enter søger, Shift+Enter giver ny linje.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); run(); }
  });
}
