// Tiny static server for the built app (no dependencies, works offline).
// Usage: node kiosk/serve.mjs [port]   — serves ../dist on http://localhost:<port> (default 4173).
// Service workers need http://localhost, not file://.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
// Files that must never be cached by the browser, so updates to dist/ are picked up.
const noCache = new Set(['/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest']);

try {
  statSync(join(root, 'index.html'));
} catch {
  console.error(`No build found in ${root}. Run "npm run build" first.`);
  process.exit(1);
}

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    path = '/index.html'; // single-page app fallback
    file = join(root, path);
    stat = statSync(file);
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': noCache.has(path) ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Dream Pattern: http://localhost:${port}`));
