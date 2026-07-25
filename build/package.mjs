// build/package.mjs — assembles the shipped index.html.
//
// Why this file exists: the security/UI wrapper lives OUTSIDE the React bundle.
// Before this script existed, a plain `vite build` silently dropped all of it.
// Everything the browser loads is now generated from tracked source files, and
// the CSP hashes are computed from the exact bytes shipped — never by hand.
//
// Usage:  node build/package.mjs <bundle.js> <out.html> <version>

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [, , bundlePath, outPath, version] = process.argv;
if (!bundlePath || !outPath || !version) {
  console.error('usage: node build/package.mjs <bundle.js> <out.html> <version>');
  process.exit(1);
}

const B = path.dirname(new URL(import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(B, f), 'utf8');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

// --- inline scripts, in DOM order. Order matters: the security bootstrap must
// --- run before any app code so its innerHTML/JSON guards are already installed.
const inline = [
  { id: 'mtp-security-bootstrap', body: read('security-bootstrap.js') },
  { id: 'mtp-prepaint-theme', body: read('prepaint.js') },
  { id: 'mtp-storage-shim', body: read('storage-shim.js') },
  { id: 'mtp-app-bundle', body: fs.readFileSync(bundlePath, 'utf8') },
  { id: 'mtp-pro-runtime-layer', body: read('runtime-layer.js') },
  { id: 'mtp-security-ui', body: read('security-ui.js') },
];

// A CSP hash must cover the element's text content exactly as it appears in the
// document — including the newlines the <script> template puts around the body.
// Hashing s.body alone is off by those two bytes and the browser blocks every
// inline script, so emit and hash the same string.
const content = (s) => `\n${s.body}\n`;

const hashes = inline.map((s) => `'sha256-${sha256(content(s))}'`).join(' ');

const CSP = [
  "default-src 'self'",
  `script-src 'self' https://accounts.google.com https://cdnjs.cloudflare.com ${hashes}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://qjaywadzvwvcspdsjxth.supabase.co",
  'frame-src https://accounts.google.com https://*.google.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self' https://accounts.google.com",
  "manifest-src 'self' data:",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const tag = (s) => `<script id="${s.id}">${content(s)}</script>`;

const html = `${read('head.html').trimEnd()}
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<style>
${read('base.css').trimEnd()}
</style>
<style id="mtp-pro-ui-layer">
${read('pro-ui-layer.css').trimEnd()}
</style>
<link rel="stylesheet" href="auth.css">
</head>
<body class="mtp-auth-pending">
<div id="root"></div>
${tag(inline[0])}
${tag(inline[1])}
${tag(inline[2])}
${tag(inline[3])}
${tag(inline[4])}
${tag(inline[5])}
<script defer src="vendor/supabase-2.110.7.js"></script>
<script defer src="auth.js"></script>
</body>
</html>
`;

fs.writeFileSync(outPath, html, 'utf8');

// --- self-verification ------------------------------------------------------
// Read the emitted file back and hash what a browser would actually hash: the
// text content of each inline <script>. Hashing our own in-memory strings would
// pass even when the emitted document disagrees with the CSP, which is exactly
// the bug this check exists to catch.
let ok = true;
const reread = fs.readFileSync(outPath, 'utf8');
const emitted = [...reread.matchAll(/<script(?![^>]*\bsrc=)[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)];

if (emitted.length !== inline.length) {
  console.error(`inline script count mismatch: emitted ${emitted.length}, expected ${inline.length}`);
  ok = false;
}
for (const [, id, body] of emitted) {
  if (!CSP.includes(sha256(body))) { console.error('CSP hash does not cover emitted script:', id); ok = false; }
}
for (const s of inline) {
  if (!reread.includes(s.body)) { console.error('body altered on write:', s.id); ok = false; }
}

console.log(`packaged ${outPath}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  v${version}`);
console.log(`inline scripts: ${emitted.length}   csp hashes: ${inline.length}   verify: ${ok ? 'PASS' : 'FAIL'}`);
emitted.forEach(([, id, body]) => console.log(`   ${id.padEnd(24)} ${String(Buffer.byteLength(body)).padStart(8)} B  sha256-${sha256(body).slice(0, 12)}…`));

if (!ok) process.exit(1);
