// build/date-picker-target.test.mjs — every date field must be pickable on a phone.
//
// Reported from an iPhone as "cannot pick a date in any field that needs one", with a
// screenshot showing the numeric keypad open over a half-typed "9". DateInput backs all
// 16 date fields in the app, and it had two problems that combined into that screenshot:
//
//   1. the native <input type="date"> was 20x20 with pointerEvents:"none", so it could
//      not be tapped at all — the only way in was showPicker()
//   2. the 📅 button next to it measured about 20px wide (fontSize 13 + 2px padding)
//      against Apple's 44px minimum, and sat flush against a full-height text input
//
// A near miss on a 20px target lands on the text field, and iOS answers with the keypad.
// Measured in real Chromium at 390x844 before the fix: the date input was 20x44 with
// pointerEvents "none", its centre hit the BUTTON, and the tap target came to 890px²
// against the 1936px² Apple asks for — 46% of the minimum.
//
// The fix makes the date input itself the target: 44px wide, full field height,
// pointerEvents live, with the 📅 glyph demoted to a pointerEvents:"none" span. This
// test guards all three of those properties. Geometry comes from the inline style
// attribute — jsdom does no layout, but these are literals in the style object, and the
// bug was in the literals.
//
// Run: node build/date-picker-target.test.mjs   (needs ./test-bundle.js)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');
const PROFILE = 'date-test';
const MIN_TAP = 44;   // Apple Human Interface Guidelines minimum tap target, in pt

const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};

function boot() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://champban.github.io/dashboard/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });

  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.MutationObserver = window.MutationObserver || class { observe() {} disconnect() {} takeRecords() { return []; } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {}; window.alert = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  if (!window.crypto || !window.crypto.randomUUID) {
    Object.defineProperty(window, 'crypto', {
      value: { getRandomValues: (a) => a, randomUUID: () => 'test-uuid' }, configurable: true });
  }
  if (!window.indexedDB) {
    Object.defineProperty(window, 'indexedDB', { value: { open: () => ({ addEventListener() {} }) }, configurable: true });
  }

  const store = new Map();
  const p = (k) => `${PROFILE}::${k}`;
  store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE, name: 'Test', emoji: '🧪' }]));
  store.set('lifeplanner-active-profile', PROFILE);
  store.set(p('lifeplanner-personal-v1'), JSON.stringify([
    { id: 't1', title: 'PickMe', status: 'todo', due: '2026-07-25', startDate: '2026-07-11', priority: 'medium' },
  ]));
  // The date fields live on the Personal tab, so open there rather than clicking around.
  store.set(p('lifeplanner-config-v1'), JSON.stringify({ defaultTab: 'personal' }));

  const shim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }, clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null, get length() { return store.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: { ...shim }, configurable: true });
  window.storage = {
    get: async (k) => ({ key: k, value: store.has(k) ? store.get(k) : null }),
    set: async (k, v) => { store.set(k, v); return { key: k, value: v }; },
    delete: async (k) => { store.delete(k); return { key: k, deleted: true }; },
    list: async () => ({ keys: Array.from(store.keys()) }),
  };
  window.fetch = () => Promise.resolve({ ok: false, status: 404, text: async () => '', json: async () => ({}) });

  const errors = [];
  window.onerror = (m, s, l, c, err) => { errors.push(String(err && err.stack ? err.stack : m)); return true; };
  const real = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };
  window.eval(bundle);
  return { window, errors, restore: () => { console.error = real; } };
}

const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const px = (v) => parseInt(String(v || '0'), 10) || 0;

const { window, errors, restore } = boot();
await settle();
restore();
if (errors.length) check('no runtime errors', false, errors[0]);

// defaultTab alone did not get there — the Personal tab has to be opened the way a
// user opens it. Same navigation the Chromium run used.
if (!window.document.querySelector('input[type="date"]')) {
  const nav = [...window.document.querySelectorAll('button')]
    .find((b) => /Personal\d*$/.test((b.textContent || '').trim()));
  if (nav) {
    nav.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(900);
  }
}

const dates = [...window.document.querySelectorAll('input[type="date"]')];
// A zero-length list would make every assertion below pass by having nothing to check,
// which is the failure mode that hides a regression rather than reporting one.
check(`date fields are on screen (${dates.length} found)`, dates.length > 0,
  'no input[type=date] rendered — the probe never reached a date field');

dates.forEach((d, i) => {
  const s = d.style;
  const tag = `field ${i + 1}`;
  check(`${tag}: the native picker accepts taps`, s.pointerEvents !== 'none',
    `pointerEvents is "${s.pointerEvents}" — the picker cannot be reached by tapping`);
  check(`${tag}: tap target is at least ${MIN_TAP}px wide`, px(s.width) >= MIN_TAP,
    `${px(s.width)}px`);
  // top+bottom:0 instead of a height literal is how it spans the field; either is fine
  // as long as it is not a 20px square again.
  check(`${tag}: spans the field's height`,
    (s.top === '0px' && s.bottom === '0px') || px(s.height) >= MIN_TAP,
    `top=${s.top} bottom=${s.bottom} height=${s.height}`);

  // Exactly one hit-testable layer in that 44px. Two is what produced the original bug:
  // aim for the calendar, miss, land on something else.
  const wrap = d.parentElement;
  const glyph = [...wrap.querySelectorAll('button, span')].find((e) => /📅/.test(e.textContent || ''));
  check(`${tag}: the 📅 glyph is decoration, not a second target`,
    !!glyph && glyph.tagName === 'SPAN' && glyph.style.pointerEvents === 'none',
    glyph ? `${glyph.tagName} with pointerEvents "${glyph.style.pointerEvents}"` : 'no 📅 glyph found');

  // The typing path is the other half of this control and must survive the overlay:
  // the text input has to reserve at least as much right padding as the overlay covers.
  const txt = wrap.querySelector('input[type="text"]');
  check(`${tag}: typed text cannot slide under the overlay`,
    !!txt && px(txt.style.paddingRight) >= px(s.width),
    txt ? `paddingRight ${px(txt.style.paddingRight)}px vs overlay ${px(s.width)}px` : 'no text input');
});

console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
