// build/secret-scan.mjs — fail the build if a real credential is committed.
//
// Why this exists: a Google API key was committed to this public repo twice in one
// week, the second time through the GitHub web editor. GitHub push protection now
// blocks that at the door, but push protection is a repository setting someone can
// switch off, and it never sees a commit that is not pushed. This check lives in the
// repo and runs in CI, so it is part of the code rather than part of the account.
//
// Patterns are deliberately NARROW: only strings that are credentials by
// construction. This repo legitimately ships a Google OAuth **client ID**
// (src/App.jsx, auth.js) — a public identifier for a frontend OAuth flow, not a
// secret — and a broad "anything credential-shaped" scanner would flag it and leave
// CI permanently red, which is how a check gets ignored and then removed.
//
// Run: node build/secret-scan.mjs            scan every tracked file
//      node build/secret-scan.mjs --selftest prove the patterns still bite

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PATTERNS = [
  // Google API key: literal prefix + exactly 33 more characters.
  { name: 'Google API key', re: /AIzaSy[A-Za-z0-9_-]{33}/g },
  // Any PEM private key block.
  { name: 'private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9]{10,}/g },
  // OpenAI / Anthropic style. Requires the hyphen and a long tail, so ordinary
  // words beginning "sk" cannot trip it.
  { name: 'sk- API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9]{24,}/g },
];

// This file names the patterns it looks for, so scanning it would report itself.
const SELF = 'build/secret-scan.mjs';

const redact = (s) => (s.length <= 10 ? s.slice(0, 4) + '…' : s.slice(0, 10) + `…(${s.length} chars)`);

function scanText(text, label, findings) {
  const lines = text.split('\n');
  for (const { name, re } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      // Minified files are one enormous line; cap what gets reported, not what is read.
      for (const m of lines[i].matchAll(re)) {
        findings.push({ file: label, line: i + 1, name, match: redact(m[0]) });
      }
    }
  }
}

if (process.argv.includes('--selftest')) {
  // Each of these must be caught. They are assembled at runtime so this file does
  // not contain a scannable credential of its own.
  const cases = [
    ['Google API key', 'const k = "' + 'AIzaSy' + 'B'.repeat(33) + '";'],
    ['private key block', '-----BEGIN RSA PRIVATE KEY-----'],
    ['AWS access key id', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
    ['GitHub token', 'ghp_' + 'a'.repeat(36)],
    ['Slack token', 'xoxb-' + '1'.repeat(12)],
    ['sk- API key', 'sk-ant-' + 'x'.repeat(30)],
  ];
  // And these must NOT be caught: things this repo ships on purpose.
  const allowed = [
    '369687000000-abcdefghijklmnopqrst.apps.googleusercontent.com', // OAuth client ID
    'const skip = true;',                                           // "sk" in a word
    'sha512-abcdefghijklmnopqrstuvwxyz0123456789',                  // lockfile integrity
    'https://qjaywadzvwvcspdsjxth.supabase.co',                     // project URL
  ];
  let bad = 0;
  for (const [want, text] of cases) {
    const f = [];
    scanText(text, 'selftest', f);
    const hit = f.some((x) => x.name === want);
    console.log(`  ${hit ? 'ok  ' : 'FAIL'} catches ${want}`);
    if (!hit) bad++;
  }
  for (const text of allowed) {
    const f = [];
    scanText(text, 'selftest', f);
    const ok = f.length === 0;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ignores ${text.slice(0, 46)}`);
    if (!ok) bad++;
  }
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST PASS');
  process.exit(bad ? 1 : 0);
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter((f) => f !== SELF);

const findings = [];
let scanned = 0;
for (const f of files) {
  let buf;
  try { buf = fs.readFileSync(f); } catch { continue; }
  if (buf.includes(0)) continue;                 // binary
  scanText(buf.toString('utf8'), f, findings);
  scanned++;
}

console.log(`secret scan: ${scanned} tracked text file(s) (skipped ${SELF})`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  ${f.name}  ${f.match}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error file=${f.file},line=${f.line}::${f.name} committed. Revoke it, remove it from the source, and do not replace it with a new value unless the code actually reads one.`);
    }
  }
  process.exit(1);
}
console.log('no credentials found');
