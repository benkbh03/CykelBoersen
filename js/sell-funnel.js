/* ────────────────────────────────────────────────────────────────
   sell-funnel.js — hvor langt folk når i sælg-flowet

   Databasen ved hvor mange annoncer der BLEV oprettet. Den ved intet om dem
   der åbnede flowet, kom til trin 2 og lukkede fanen. Uden det tal kan man
   ikke se om arbejdet med at fjerne friktion — AI-udfyldning fra billeder,
   DBA-import, tre trin frem for én lang formular — faktisk virkede.

   ANONYMT med vilje:
   - intet user_id, ingen IP
   - intet gemt i browseren, hverken cookie eller localStorage
   - flow_id laves i hukommelsen når flowet åbnes og er væk ved genindlæsning

   Derfor kræver det intet cookie-samtykke, og derfor tæller det ALLE
   besøgende — ikke kun dem der trykker "Accepter alle". Ved de nuværende
   besøgstal er det forskellen på et brugbart og et ubrugeligt tal.

   Fire-and-forget: en fejlet logning må aldrig kunne stoppe nogen i at
   oprette en annonce.
──────────────────────────────────────────────────────────────── */

let _flowId = null;
let _sent = new Set();   // ét trin logges én gang pr. forsøg

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback til ældre browsere — behøver ikke være kryptografisk, kun unik
  // nok til at binde fire hændelser sammen inden for én session.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Nyt forsøg. Kaldes når sælg-flowet åbnes, og nulstiller hvad der er logget,
 * så en bruger der opretter to annoncer i træk tæller som to forsøg.
 */
export function startSellFlow() {
  _flowId = newId();
  _sent = new Set();
}

/**
 * Log et trin. Samme trin logges kun én gang pr. forsøg — ellers ville en
 * bruger der klikker frem og tilbage mellem trin 2 og 3 se ud som flere
 * personer.
 *
 * @param {object} supabase
 * @param {'start'|'step_2'|'step_3'|'complete'} step
 * @param {object} [meta]
 * @param {string} [meta.category]  'cykel' | 'tilbehoer'
 * @param {string} [meta.prefilled] 'ai' | 'import' — blev felterne udfyldt
 *   automatisk? Gør det muligt at se om hjælpen holder folk i flowet.
 */
export function trackSellStep(supabase, step, { category, prefilled } = {}) {
  if (!_flowId || _sent.has(step)) return;
  _sent.add(step);
  try {
    supabase
      .from('sell_funnel_events')
      .insert({ flow_id: _flowId, step, category: category || null, prefilled: prefilled || null })
      .then(null, () => {});
  } catch (_) { /* må aldrig stoppe brugeren */ }
}
