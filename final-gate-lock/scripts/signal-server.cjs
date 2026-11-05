/**
 * Server for the lock → TV signal. Runs on the PC behind the TV. No dependencies.
 *
 *   /            the built lock (dist/), for testing in Chrome. The tablet normally runs the installed
 *                app and only uses /api, through the PC address saved in its operator menu.
 *   /tv         the page to show on the TV (scripts/signal-tv.html)
 *   /api/*       the signal: passed, ping, manual, reset, events
 *
 * Two ways to run it:
 *   npm run signal      from the repo, reading dist/ from disk
 *   npm run signal:exe  packs this file and the pages into one Windows program (see
 *                       build-server-exe.mjs), which needs nothing installed on the PC.
 *                       CommonJS because that's what Node can pack. Built-in modules only.
 *
 * There is no authentication, so anyone on the same network can trigger the TV.
 *
 * SIGNAL_PORT fixes the port (default: 8787, or the next free one).
 * SIGNAL_NO_BROWSER=1 stops the program opening the TV page by itself.
 */
const { spawn } = require('node:child_process');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { createServer } = require('node:http');
const { networkInterfaces } = require('node:os');
const { extname, join, resolve, sep } = require('node:path');
const sea = require('node:sea');

const PACKED = sea.isSea();
const packedKeys = PACKED ? new Set(sea.getAssetKeys()) : null;
const DIST = resolve(__dirname, '../dist');

const FIRST_PORT = Number(process.env.SIGNAL_PORT ?? 8787);
const PORT_ATTEMPTS = process.env.SIGNAL_PORT ? 1 : 10;
const MAX_BODY_BYTES = 4096;
const TABLET_LOST_MS = 10_000;
const ADDRESS_CHECK_MS = 5000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};

const state = { passes: 0, passed: false, lastSource: null, lastPassAt: null, rttMs: null };
const seenIds = new Set();
const tvClients = new Set();
let port = FIRST_PORT;
let tabletSeenAt = null;
let tabletConnected = false;
let addresses = [];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// ---- network addresses

const VIRTUAL_ADAPTER = /vethernet|virtual|vmware|vbox|hyper-v|wsl|loopback|tailscale|zerotier|vpn|bluetooth/i;
const REAL_ADAPTER = /wi-?fi|wlan|wireless|ethernet/i;

/** IPv4 addresses, most likely tablet-reachable first: real adapters, then others, then virtual. */
function findAddresses() {
  const rank = (name) => (VIRTUAL_ADAPTER.test(name) ? 2 : REAL_ADAPTER.test(name) ? 0 : 1);
  const found = [];
  for (const [adapter, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      // 169.254.x.x means the adapter never got an address
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) found.push({ ip: a.address, adapter });
    }
  }
  return found.sort((a, b) => rank(a.adapter) - rank(b.adapter));
}

const pcAddress = (ip) => `${ip}:${port}`;
const chromeLink = (ip) => `http://${pcAddress(ip)}/?signal`;
const tvLink = () => `http://localhost:${port}/tv`;

function printLinks() {
  console.log('');
  console.log('  ============================================================');
  console.log('    FINAL GATE LOCK SERVER');
  console.log('  ============================================================');
  console.log('');
  if (addresses.length === 0) {
    console.log('    NO NETWORK YET. Connect this PC to the same network as the');
    console.log('    tablet. The address will appear here by itself.');
  } else {
    const [main, ...others] = addresses;
    console.log('    ON THE TABLET: operator menu > PC address, enter:');
    console.log('');
    console.log(`        ${pcAddress(main.ip)}`);
    if (others.length > 0) {
      console.log('');
      console.log('    If the link stays DOWN, try one of these instead:');
      for (const o of others) console.log(`        ${pcAddress(o.ip)}   (${o.adapter})`);
    }
    console.log('');
    console.log('    To run the lock from this PC in Chrome instead (test only):');
    console.log(`        ${chromeLink(main.ip)}`);
  }
  console.log('');
  console.log(`    TV page: ${tvLink()}`);
  console.log('');
  console.log('    Keep this window open. Closing it stops the server.');
  console.log('    If Windows Firewall asks, choose Allow.');
  console.log('  ============================================================');
  console.log('');
}

function refreshAddresses() {
  const next = findAddresses();
  const changed = next.map((a) => a.ip).join() !== addresses.map((a) => a.ip).join();
  addresses = next;
  if (changed) {
    log('The network changed, so the PC address may be different:');
    printLinks();
  }
}

// ---- signal state

function snapshot() {
  return {
    ...state,
    tabletAgeMs: tabletSeenAt === null ? null : Date.now() - tabletSeenAt,
    pcAddress: addresses.length > 0 ? pcAddress(addresses[0].ip) : null,
  };
}

function broadcast() {
  const line = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const client of tvClients) client.write(line);
}

function recordPass(source) {
  state.passes++;
  state.passed = true;
  state.lastSource = source;
  state.lastPassAt = Date.now();
  log(`PASS #${state.passes} (${source})`);
  broadcast();
}

function sawTablet() {
  tabletSeenAt = Date.now();
  if (!tabletConnected) log('Tablet connected');
  tabletConnected = true;
}

// ---- API

function sendJson(res, status, body) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', fail);
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        fail(e);
      }
    });
  });
}

async function handleApi(req, res, path) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && path === '/api/events') {
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    tvClients.add(res);
    req.on('close', () => tvClients.delete(res));
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad request' });
    return;
  }

  switch (path) {
    case '/api/passed': {
      if (typeof body.id !== 'string' || body.id.length === 0 || body.id.length > 64) {
        sendJson(res, 400, { ok: false, error: 'missing id' });
        return;
      }
      sawTablet();
      const duplicate = seenIds.has(body.id);
      if (duplicate) log(`Ignored a repeat of pass ${body.id}`);
      else {
        seenIds.add(body.id);
        recordPass('tablet');
      }
      sendJson(res, 200, { ok: true, duplicate });
      return;
    }
    case '/api/ping':
      sawTablet();
      if (typeof body.rttMs === 'number') state.rttMs = body.rttMs;
      sendJson(res, 200, { ok: true });
      return;
    case '/api/manual':
      recordPass('manual');
      sendJson(res, 200, { ok: true });
      return;
    case '/api/reset':
      state.passed = false;
      log('TV reset');
      broadcast();
      sendJson(res, 200, { ok: true });
      return;
    default:
      sendJson(res, 404, { ok: false, error: 'not found' });
  }
}

// ---- pages and files

function readTvPage() {
  return PACKED ? Buffer.from(sea.getRawAsset('tv.html')) : readFileSync(join(__dirname, 'signal-tv.html'));
}

/** The TV's video, or null if it's missing. Replace the file to change the content. */
function readTvVideo() {
  if (PACKED) return Buffer.from(sea.getRawAsset('tv-video.mp4'));
  const file = resolve(__dirname, '../PlaceholderVideo.mp4');
  return existsSync(file) ? readFileSync(file) : null;
}

/** A file of the built lock, or null. `path` starts with a slash. */
function readDistFile(path) {
  if (PACKED) {
    const key = `dist${path}`;
    return packedKeys.has(key) ? Buffer.from(sea.getRawAsset(key)) : null;
  }
  const file = resolve(DIST, `.${path}`);
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) return null;
  return readFileSync(file);
}

function sendBytes(res, name, bytes) {
  res.writeHead(200, {
    'Content-Type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': bytes.length,
    'Cache-Control': 'no-cache',
  });
  res.end(bytes);
}

function handleStatic(res, path) {
  if (path === '/tv' || path === '/tv/') {
    sendBytes(res, 'tv.html', readTvPage());
    return;
  }
  if (path === '/tv/video') {
    const video = readTvVideo();
    if (video) sendBytes(res, 'tv-video.mp4', video);
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No video file');
    }
    return;
  }
  // No service worker from this server: on localhost it would take over and answer /tv with the lock.
  if (path === '/registerSW.js') {
    sendBytes(res, path, Buffer.alloc(0));
    return;
  }
  const name = path === '/' ? '/index.html' : path;
  const bytes = path === '/sw.js' ? null : readDistFile(name);
  if (!bytes) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  sendBytes(res, name, bytes);
}

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path.startsWith('/api/')) {
    handleApi(req, res, path).catch((e) => {
      console.error(e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  handleStatic(res, path);
});

// ---- start-up

/** Started by double-click, the window would vanish with the error in it, so wait for a key. */
function fatal(message) {
  console.error(`\n  ERROR: ${message}\n`);
  if (!PACKED) process.exit(1);
  console.error('  Press Enter to close this window.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
}

function openTvPage() {
  if (!PACKED || process.env.SIGNAL_NO_BROWSER || process.platform !== 'win32') return;
  const child = spawn('cmd', ['/c', 'start', '', tvLink()], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => log(`Could not open a browser. Open ${tvLink()} by hand.`));
  child.unref();
}

process.on('uncaughtException', (e) => fatal(e.stack ?? String(e)));

let attemptsLeft = PORT_ATTEMPTS;
server.on('error', (e) => {
  // EACCES: Windows reserves some port ranges, typically for Hyper-V
  if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && --attemptsLeft > 0) {
    port++;
    server.listen(port, '0.0.0.0');
    return;
  }
  if (e.code === 'EADDRINUSE' || e.code === 'EACCES') fatal(`Port ${port} can't be used. Is the server already running?`);
  else fatal(e.message);
});

server.on('listening', () => {
  process.title = 'Final Gate Lock Server';
  addresses = findAddresses();
  printLinks();
  if (!PACKED && !existsSync(join(DIST, 'index.html'))) console.log("  dist/ is missing, so the lock won't load. Run `npm run build`.\n");
  log('Waiting for the tablet...');
  openTvPage();

  setInterval(refreshAddresses, ADDRESS_CHECK_MS);
  // Keeps the TV page's "tablet last seen" current, and notices when the tablet goes quiet.
  setInterval(() => {
    if (tabletConnected && Date.now() - tabletSeenAt > TABLET_LOST_MS) {
      tabletConnected = false;
      log('Tablet lost: no heartbeat for 10 s');
    }
    broadcast();
  }, 1000);
});

server.listen(port, '0.0.0.0');
