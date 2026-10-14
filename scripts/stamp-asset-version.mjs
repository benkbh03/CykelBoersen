/**
 * Sætter cache-versionen i index.html ud fra indholdet af de filer den beskytter.
 *
 * Versionen var et tal man bumpede i hånden i hver PR. Det gav en
 * merge-konflikt på samme linje hver gang to PR'er var åbne samtidig.
 * Nu kører det her script i sitemap-workflowet efter hver merge til main:
 * versionen er de første 10 tegn af en SHA-256 over css/, js/, main.js og
 * partials/. Samme indhold giver samme version, så den daglige kørsel ikke
 * laver tomme commits, og enhver ændring i en af filerne giver en ny.
 *
 * Skriver både <html data-asset-v> og CSS-linkenes ?v= i index.html.
 * Prerender læser index.html bagefter, så de statiske sider får samme version.
 *
 * PR'er må IKKE ændre versionen i hånden (tjekkes i check-content.yml).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = ['css', 'js', 'main.js', 'partials'];

function listFiles(p) {
  const abs = join(ROOT, p);
  if (!statSync(abs).isDirectory()) return [p];
  return readdirSync(abs).flatMap(name => listFiles(join(p, name)));
}

const files = INPUTS.flatMap(listFiles).sort();
const hash = createHash('sha256');
for (const f of files) {
  // Stien med i hashen, så en omdøbning også giver en ny version.
  hash.update(relative(ROOT, join(ROOT, f)).replace(/\\/g, '/'));
  hash.update('\0');
  hash.update(readFileSync(join(ROOT, f)));
  hash.update('\0');
}
const version = hash.digest('hex').slice(0, 10);

const indexPath = join(ROOT, 'index.html');
const before = readFileSync(indexPath, 'utf8');

let attrHits = 0;
let cssHits = 0;
const after = before
  .replace(/data-asset-v="[^"]*"/g, () => { attrHits++; return `data-asset-v="${version}"`; })
  .replace(/(href="\/css\/[^"?]+\.css)\?v=[^"]*"/g, (_, href) => { cssHits++; return `${href}?v=${version}"`; });

// Fejl højt hvis mønstrene ikke ramte: en stille no-op er præcis den fejl
// den gamle håndbump havde tre gange.
if (attrHits !== 1) {
  console.error(`Forventede 1 data-asset-v i index.html, fandt ${attrHits}.`);
  process.exit(1);
}
if (cssHits === 0) {
  console.error('Fandt ingen CSS-links med ?v= i index.html.');
  process.exit(1);
}

if (after !== before) writeFileSync(indexPath, after);
console.log(`Asset-version ${version} (${files.length} filer, ${cssHits} CSS-links)${after === before ? ', uændret' : ''}.`);
