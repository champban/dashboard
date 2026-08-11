// Resolves the freshest vite bundle and hands it to the packager, then refreshes
// BUILD-MANIFEST.json. Exists because the bundle filename is content-hashed, so
// `npm run package` cannot hard-code it and a shell glob is not portable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ASSETS = 'dist/assets';
if (!fs.existsSync(ASSETS)) {
  console.error('dist/assets missing — run `npm run build` first');
  process.exit(1);
}
const bundle = fs.readdirSync(ASSETS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, m: fs.statSync(path.join(ASSETS, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0];
if (!bundle) { console.error('no .js bundle in dist/assets'); process.exit(1); }

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
execFileSync(process.execPath,
  ['build/package.mjs', path.join(ASSETS, bundle.f), 'index.html', version],
  { stdio: 'inherit' });

// Keep the manifest honest about what was just written. mobile/index.html is a
// separate hand-written app (not part of this build), but its manifest entry
// is refreshed here too so the two can never drift apart the way full.* alone
// used to let them.
const bytes = fs.readFileSync('index.html');
const manifestPath = 'BUILD-MANIFEST.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.full.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
manifest.full.bytes = bytes.length;
const mobileBytes = fs.readFileSync('mobile/index.html');
manifest.mobile.sha256 = crypto.createHash('sha256').update(mobileBytes).digest('hex');
manifest.mobile.bytes = mobileBytes.length;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`BUILD-MANIFEST.json  full sha256 ${manifest.full.sha256}  ${manifest.full.bytes} B`);
console.log(`BUILD-MANIFEST.json  mobile sha256 ${manifest.mobile.sha256}  ${manifest.mobile.bytes} B`);
