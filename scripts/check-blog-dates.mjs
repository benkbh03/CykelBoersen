#!/usr/bin/env node
/**
 * Fejler hvis et blogindlæg har en publiceringsdato efter i dag.
 *
 * Datoen vises på siden og står som datePublished i JSON-LD. En dato i
 * fremtiden er en løgn over for læseren og et rødt flag for Google.
 * Køres i CI ved pull requests og før prerender.
 *
 *   node scripts/check-blog-dates.mjs
 */
import { BLOG_ARTICLES } from '../js/blog-data-v2.js';

// Sammenlign datoer som ÅÅÅÅ-MM-DD i dansk tid, så et indlæg dateret i dag
// ikke fejler fordi runneren kører i UTC.
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' });

const errors = [];
for (const [key, a] of Object.entries(BLOG_ARTICLES)) {
  const d = a.publishedAt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '') || Number.isNaN(Date.parse(d))) {
    errors.push(`${key}: publishedAt "${d}" er ikke en gyldig ÅÅÅÅ-MM-DD-dato`);
  } else if (d > today) {
    errors.push(`${key}: publishedAt ${d} ligger efter i dag (${today})`);
  }
}

if (errors.length) {
  console.error('Blogdatoer fejlede:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`Blogdatoer OK (${Object.keys(BLOG_ARTICLES).length} indlæg, ingen efter ${today}).`);
