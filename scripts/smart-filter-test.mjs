#!/usr/bin/env node
/**
 * Testsæt for smart søgning.
 *
 * Sender hver søgning i scripts/smart-filter-cases.json gennem PRÆCIS den
 * instruktion og oprydning som edge-funktionen bruger
 * (supabase/functions/_shared/smart-filter-core.ts) og tjekker svaret mod
 * facit. Kør det før hver ændring i instruktionen; en rettelse må ikke
 * ødelægge en søgning der virkede før.
 *
 * Kald går direkte til Anthropic, ikke gennem edge-funktionen, så testen
 * ikke rammer funktionens grænse på 20 kald pr. IP pr. time og ikke fylder
 * loggen med testsøgninger. 30 søgninger koster ca. 6 øre.
 *
 *   ANTHROPIC_API_KEY=… node --experimental-strip-types scripts/smart-filter-test.mjs
 *   (eller GitHub → Actions → "Test smart søgning" → Run workflow)
 *
 * Valgfrit: ONLY="kurv" kører kun søgninger hvis tekst indeholder ordet.
 */
import { readFileSync } from 'node:fs';
import { MODEL, SYSTEM_PROMPT, parseReply } from '../supabase/functions/_shared/smart-filter-core.ts';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY mangler.'); process.exit(2); }

const { cases } = JSON.parse(readFileSync(new URL('./smart-filter-cases.json', import.meta.url), 'utf8'));
const only = (process.env.ONLY || '').toLowerCase();
const todo = only ? cases.filter(c => c.text.toLowerCase().includes(only)) : cases;

async function ask(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024, output_config: { effort: 'low' },
        system: SYSTEM_PROMPT, messages: [{ role: 'user', content: text }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.content ?? []).find(b => b.type === 'text')?.text ?? '';
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('Anthropic svarede ikke efter tre forsøg');
}

const same = (a, b) => {
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
  return a === b;
};

function check(c, out) {
  const errs = [];
  for (const [k, v] of Object.entries(c.expect || {})) {
    if (!same(out.filters[k], v)) errs.push(`${k}: ventede ${JSON.stringify(v)}, fik ${JSON.stringify(out.filters[k])}`);
  }
  for (const k of c.absent || []) {
    if (out.filters[k] !== undefined) errs.push(`${k} skulle ikke sættes, fik ${JSON.stringify(out.filters[k])}`);
  }
  for (const w of c.keywords || []) {
    if (!out.keywords.some(x => x.startsWith(w) || w.startsWith(x))) errs.push(`sorteringsord mangler "${w}", fik ${JSON.stringify(out.keywords)}`);
  }
  return errs;
}

const results = [];
const queue = todo.map((c, i) => ({ c, i }));
async function worker() {
  while (queue.length) {
    const { c, i } = queue.shift();
    try {
      const out = parseReply(await ask(c.text), c.text);
      results[i] = { c, out, errs: check(c, out) };
    } catch (e) {
      results[i] = { c, out: null, errs: [String(e.message || e)] };
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

let failed = 0;
for (const r of results.filter(Boolean)) {
  if (r.errs.length) failed++;
  console.log(`${r.errs.length ? 'FEJL' : 'OK  '}  ${r.c.text}`);
  for (const e of r.errs) console.log(`        ${e}`);
  if (r.errs.length && r.out) console.log(`        svar: ${JSON.stringify(r.out)}`);
}
console.log(`\n${results.length - failed} af ${results.length} bestået.`);
process.exit(failed ? 1 : 0);
