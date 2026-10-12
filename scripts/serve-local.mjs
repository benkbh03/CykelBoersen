// Lokal udviklingsserver: `node scripts/serve-local.mjs` → http://localhost:8080
//
// Serverer repoet som GitHub Pages gør, inkl. SPA-fallback (_redirects:
// /* → /index.html). Siden kører på localhost, så js/env.js vælger
// staging-databasen, når den er sat op.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function resolve(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) return null;
  try {
    const s = await stat(file);
    if (s.isFile()) return file;
    if (s.isDirectory()) {
      const idx = join(file, 'index.html');
      if ((await stat(idx).catch(() => null))?.isFile()) return idx;
    }
  } catch {}
  return null;
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  // Ukendte stier uden filendelse er app-ruter → index.html (som _redirects).
  const file = (await resolve(path)) ?? (extname(path) ? null : join(ROOT, 'index.html'));
  if (!file) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`CykelBørsen lokalt: http://localhost:${PORT}`));
