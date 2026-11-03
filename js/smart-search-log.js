/* ────────────────────────────────────────────────────────────────
   smart-search-log.js — antal fundne cykler til smart søgnings log

   Edge-funktionen smart-filter gemmer søgningen anonymt og svarer med et
   logId. Siden kender først antallet af cykler når listen er hentet, så
   her ventes på den næste filtrerede liste (bikes-list-v2.js sender
   'cb:filtered-count'), og antallet skrives på rækken via
   set_smart_search_result(). Søgninger med 0 cykler er dem vi læser, når
   instruktionen skal rettes.

   Fejler noget, sker der ingenting: rækken står bare uden antal. En cachet
   bikes-list.js (før omdøbningen) giver det samme.

   Ny fil med vilje: se cache-reglen i CLAUDE.md.
──────────────────────────────────────────────────────────────── */

import { supabase } from './supabase-client.js';

const WAIT_MS = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _stop = null;

/** Kald lige FØR filtrene sættes. Første liste efter det tælles. */
export function reportSmartSearchResult(logId) {
  if (_stop) _stop();
  if (typeof logId !== 'string' || !UUID.test(logId)) return;

  const onCount = (e) => {
    stop();
    const n = e?.detail?.count;
    if (typeof n !== 'number') return;
    supabase.rpc('set_smart_search_result', { p_id: logId, p_count: n })
      .then(() => {}, () => {});
  };
  const timer = setTimeout(() => stop(), WAIT_MS);
  function stop() {
    clearTimeout(timer);
    window.removeEventListener('cb:filtered-count', onCount);
    _stop = null;
  }
  window.addEventListener('cb:filtered-count', onCount);
  _stop = stop;
}
