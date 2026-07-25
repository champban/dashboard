// check4.mjs — jsdom render harness.
// Purpose: catch runtime TDZ / undeclared-component crashes that `vite build` does NOT catch.
// A healthy render prints "LEN <n>" with n > 0. A crash prints "THROW: ...".
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'https://champban.github.io/dashboard/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;

// --- polyfills jsdom lacks -------------------------------------------------
if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  });
}
class RO { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = window.ResizeObserver || RO;
if (!window.MutationObserver) {
  window.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
}
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLCanvasElement.prototype.getContext = () => null;
if (!window.crypto || !window.crypto.randomUUID) {
  Object.defineProperty(window, 'crypto', { value: { getRandomValues: (a) => a, randomUUID: () => 'test-uuid' }, configurable: true });
}
if (!window.indexedDB) Object.defineProperty(window, 'indexedDB', { value: { open: () => ({ addEventListener() {} }) }, configurable: true });
window.fetch = () => Promise.resolve({ ok: false, status: 0, json: async () => ({}), text: async () => '' });

// --- storage mock: an app-shaped profile so the app renders past the gate ---
const store = new Map();
const PROFILE_ID = 'test-profile';
store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE_ID, name: 'Test', emoji: '🧪' }]));
store.set('lifeplanner-active-profile', JSON.stringify(PROFILE_ID));
const storageShim = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
Object.defineProperty(window, 'localStorage', { value: storageShim, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: { ...storageShim }, configurable: true });
window.storage = {
  get: async (k) => ({ key: k, value: store.get(k) ?? null }),
  set: async (k, v) => { store.set(k, v); return { key: k, value: v }; },
  delete: async (k) => { store.delete(k); return { key: k, deleted: true }; },
  list: async () => ({ keys: Array.from(store.keys()) }),
};

// --- freeze the clock ------------------------------------------------------
// The app renders relative dates and countdowns, so an unfrozen clock makes the
// rendered length drift between runs. That drift once looked exactly like a
// regression. Pin it so the only thing that moves the number is the code.
const FIXED = new Date('2026-07-01T09:00:00.000Z').getTime();
const RealDate = window.Date;
class FrozenDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
FrozenDate.parse = RealDate.parse;
FrozenDate.UTC = RealDate.UTC;
Object.defineProperty(window, 'Date', { value: FrozenDate, configurable: true, writable: true });

// --- capture errors instead of dying silently ------------------------------
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e?.error?.stack || e.message)));
window.onerror = (m, s, l, c, err) => { errors.push(String(err?.stack || m)); return true; };
process.on('unhandledRejection', (r) => errors.push('unhandledRejection: ' + r));

const origConsoleError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 300)); };

try {
  window.eval(bundle);
} catch (e) {
  console.error = origConsoleError;
  console.log('THROW:', e && e.stack ? e.stack.split('\n').slice(0, 12).join('\n') : e);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 400));
console.error = origConsoleError;

const root = window.document.getElementById('root');
const len = root ? root.innerHTML.length : -1;
const txt = root ? (root.textContent || '').trim().slice(0, 160) : '';

console.log('LEN', len);
console.log('NODES', root ? root.getElementsByTagName('*').length : -1);
console.log('TEXT', JSON.stringify(txt));
if (errors.length) {
  console.log('--- errors (' + errors.length + ') ---');
  errors.slice(0, 6).forEach((e) => console.log(String(e).split('\n').slice(0, 6).join('\n')));
}
process.exit(len > 0 ? 0 : 2);
