// build/fab-stack.test.mjs — the bottom-right floating controls must not overlap.
//
// Four independent fixed round buttons live in that corner: ＋ quick-add task,
// 📌 quick note, 🗓 quick event and ⛶ presentation mode. Each used to carry its
// own hardcoded offset (76, 84, 132, 88), so on a phone three of them landed on
// the same square and only the highest z-index was visible. This test renders the
// app at a phone width and at a desktop width and asserts every pair of those
// buttons is disjoint.
//
// Geometry is read from the inline style attribute, not getComputedStyle: jsdom's
// CSS parser reorders the arguments of env() inside calc(), so the serialized
// value is unusable. The leading px number of the calc survives, and that is the
// slot offset this test cares about.
//
// Run: node build/fab-stack.test.mjs   (needs ./test-bundle.js — npm run test-bundle)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

// The buttons, keyed by the label they render. `pad` is the extra vertical space
// the safe-area inset can add on a notched device; the whole column shifts by it
// together, so it does not change the overlap maths — it is recorded to show the
// column also clears the home indicator.
const WANT = ['＋', '📌', '🗓', '⛶'];

function render(width, height) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://champban.github.io/dashboard/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });

  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.MutationObserver = window.MutationObserver || class { observe() {} disconnect() {} takeRecords() { return []; } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  if (!window.crypto || !window.crypto.randomUUID) {
    Object.defineProperty(window, 'crypto', {
      value: { getRandomValues: (a) => a, randomUUID: () => 'test-uuid' }, configurable: true,
    });
  }
  if (!window.indexedDB) {
    Object.defineProperty(window, 'indexedDB', { value: { open: () => ({ addEventListener() {} }) }, configurable: true });
  }
  window.fetch = () => Promise.resolve({ ok: false, status: 0, json: async () => ({}), text: async () => '' });

  const store = new Map();
  const PROFILE_ID = 'test-profile';
  store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE_ID, name: 'Test', emoji: '🧪' }]));
  store.set('lifeplanner-active-profile', JSON.stringify(PROFILE_ID));
  const shim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: { ...shim }, configurable: true });
  window.storage = {
    get: async (k) => ({ key: k, value: store.has(k) ? store.get(k) : null }),
    set: async (k, v) => { store.set(k, v); return { key: k, value: v }; },
    delete: async (k) => { store.delete(k); return { key: k, deleted: true }; },
    list: async () => ({ keys: Array.from(store.keys()) }),
  };

  const FIXED = new Date('2026-07-01T09:00:00.000Z').getTime();
  const RealDate = window.Date;
  class FrozenDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [FIXED])); }
    static now() { return FIXED; }
  }
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', { value: FrozenDate, configurable: true, writable: true });

  const errors = [];
  window.onerror = (m, s, l, c, err) => { errors.push(String(err && err.stack ? err.stack : m)); return true; };
  const realConsoleError = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };
  window.eval(bundle);
  return { window, errors, restore: () => { console.error = realConsoleError; } };
}

// "calc(71px + env(...))" -> 71 ; "126px" -> 126. jsdom may have reordered the
// env() arguments, but the first integer is still the slot offset.
const leadingPx = (v) => {
  const m = String(v || '').match(/-?\d+/);
  return m ? Number(m[0]) : null;
};
const usesInset = (v) => /safe-area-inset-bottom/.test(String(v || ''));

async function check(label, width, height, expectInset) {
  const { window, errors, restore } = render(width, height);
  await new Promise((r) => setTimeout(r, 400));
  restore();

  const found = new Map();
  for (const b of window.document.querySelectorAll('button')) {
    const style = b.getAttribute('style') || '';
    if (!/position:\s*fixed/.test(style) || !/border-radius:\s*50%/.test(style)) continue;
    const text = (b.textContent || '').trim();
    if (!WANT.includes(text)) continue;
    const bottom = /(?:^|;)\s*bottom:\s*([^;]+)/.exec(style);
    const right = /(?:^|;)\s*right:\s*([^;]+)/.exec(style);
    const h = /(?:^|;)\s*height:\s*([^;]+)/.exec(style);
    const w = /(?:^|;)\s*width:\s*([^;]+)/.exec(style);
    if (!bottom || !h) continue;
    found.set(text, {
      text,
      bottom: leadingPx(bottom[1]),
      inset: usesInset(bottom[1]),
      right: leadingPx(right && right[1]),
      h: leadingPx(h[1]),
      w: leadingPx(w && w[1]),
      raw: bottom[1].trim(),
    });
  }

  const fails = [];
  console.log(`\n--- ${label} (${width}x${height}) ---`);
  if (errors.length) fails.push(`${errors.length} runtime error(s): ${errors[0]}`);

  for (const t of WANT) {
    if (!found.has(t)) { fails.push(`button ${t} not rendered`); continue; }
    const b = found.get(t);
    console.log(`  ${t}  ${String(b.w).padStart(3)}x${String(b.h)}  right=${String(b.right).padStart(3)}  bottom=${b.raw}`);
  }

  const list = WANT.filter((t) => found.has(t)).map((t) => found.get(t));

  // Every button in a compact layout must offset itself by the home-indicator
  // inset, because the bottom nav it sits above does the same.
  for (const b of list) {
    if (b.inset !== expectInset) {
      fails.push(`${b.text}: safe-area inset ${b.inset ? 'present' : 'missing'}, expected ${expectInset ? 'present' : 'absent'}`);
    }
  }

  // Pairwise disjointness. Both boxes are anchored to the same two edges, so
  // comparing the offsets directly is exact.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const vOverlap = a.bottom < b.bottom + b.h && b.bottom < a.bottom + a.h;
      const hOverlap = a.right < b.right + b.w && b.right < a.right + a.w;
      if (vOverlap && hOverlap) {
        fails.push(`${a.text} overlaps ${b.text}: `
          + `${a.text} bottom ${a.bottom}..${a.bottom + a.h} right ${a.right}..${a.right + a.w} vs `
          + `${b.text} bottom ${b.bottom}..${b.bottom + b.h} right ${b.right}..${b.right + b.w}`);
      }
    }
  }

  // On a compact layout the whole column must also clear the bottom nav, which is
  // 56px (phone) or 64px (tablet) plus a 3px active-tab border, plus the inset.
  if (expectInset) {
    const navTop = width >= 768 ? 67 : 59;
    for (const b of list) {
      if (b.bottom < navTop) fails.push(`${b.text} at ${b.bottom}px is over the ${navTop}px bottom nav`);
    }
  }

  // The header must carry the class auth.js looks for, or the sign-out control
  // falls back to a full-width fixed pill across this same corner.
  if (expectInset) {
    const chrome = window.document.querySelector('.lp-app-chrome');
    const ok = chrome && chrome.classList.contains('toprow');
    console.log(`  header .toprow: ${ok ? 'yes' : 'NO'}`);
    if (!ok) fails.push('compact top bar is missing the toprow class');
  }

  fails.forEach((f) => console.log('  FAIL ' + f));
  if (!fails.length) console.log('  OK   no overlaps, offsets as expected');
  return fails.length;
}

let bad = 0;
bad += await check('phone', 390, 844, true);
bad += await check('tablet', 834, 1112, true);
bad += await check('desktop', 1440, 900, false);

console.log(bad ? `\nFAIL (${bad})` : '\nPASS');
process.exit(bad ? 1 : 0);
