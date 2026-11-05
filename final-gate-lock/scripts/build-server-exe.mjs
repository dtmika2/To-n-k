/**
 * Packs the signal server, the built lock and the TV page into one Windows program, using Node's
 * single executable application support: release/Final-Gate-Lock-Server.exe.
 *
 * Run through `npm run signal:exe`, which builds dist/ first.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.error('This builds a Windows program, so run it on Windows.');
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const RELEASE = join(ROOT, 'release');
const WORK = join(RELEASE, 'build');
const EXE = join(RELEASE, 'Final-Gate-Lock-Server.exe');
// the service worker is never served by this program
const SKIP = new Set(['sw.js']);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Failed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Use `npm run signal:exe`, which builds it first.');
  process.exit(1);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const TV_VIDEO = join(ROOT, 'PlaceholderVideo.mp4');
const TV_COVER = join(ROOT, 'PlaceholderStoneCover.png');
for (const file of [TV_VIDEO, TV_COVER]) {
  if (!existsSync(file)) {
    console.error(`TV content is missing: ${file}`);
    process.exit(1);
  }
}

const assets = {
  'tv.html': join(ROOT, 'scripts', 'signal-tv.html'),
  'tv-video.mp4': TV_VIDEO,
  'tv-cover.png': TV_COVER,
};
for (const entry of readdirSync(DIST, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  const key = relative(DIST, file).split(sep).join('/');
  if (!SKIP.has(key) && !key.endsWith('.map')) assets[`dist/${key}`] = file;
}

const blob = join(WORK, 'server.blob');
const config = join(WORK, 'sea-config.json');
writeFileSync(
  config,
  JSON.stringify({
    main: join(ROOT, 'scripts', 'signal-server.cjs'),
    output: blob,
    disableExperimentalSEAWarning: true,
    assets,
  }),
);

run(process.execPath, ['--experimental-sea-config', config]);
copyFileSync(process.execPath, EXE);
// The fuse is a fixed value from Node's documentation: it marks where the program is injected.
run(process.execPath, [
  join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js'),
  EXE,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
]);
rmSync(WORK, { recursive: true, force: true });

console.log(`\nBuilt ${relative(ROOT, EXE)} with ${Object.keys(assets).length} packed files.`);
