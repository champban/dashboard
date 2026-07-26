// build/sync-visibility.test.mjs — you must be able to see WHEN things last synced.
//
// Reported as: "we can't see what time the cloud file last synced with local
// storage." Three separate causes, all asserted here:
//
//   1. No surface printed a wall-clock time. Every one used a relative age only
//      ("5 min ago"), and the sole absolute form was toLocaleDateString() past 24
//      hours — which drops the clock. "What time?" had no answer in the UI.
//   2. The status dot / file name / last-sync line existed ONLY in the desktop File
//      menu, which is not rendered below 1024px. On a phone there was nothing.
//   3. The three facts that actually matter — when this device changed, when the
//      cloud file changed, when the two were last compared — were never shown
//      together, so a mismatch could not be seen, only guessed at.
//
// Run: node build/sync-visibility.test.mjs   (needs ./test-bundle.js)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

const FIXED = new Date('2026-07-01T09:00:00.000Z').getTime();
const PROFILE = 'test-profile';
// Deliberately three different times, so the test can tell the three lines apart.
const LOCAL_STAMP = new Date(FIXED - 2 * 60 * 1000).toISOString();   // 2 min ago
const CLOUD_STAMP = new Date(FIXED - 40 * 60 * 1000).toISOString();  // 40 min ago
const CHECKED_AT = FIXED - 5 * 60 * 1000;                            // 5 min ago

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function boot({ width, height, ua }) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://champban.github.io/dashboard/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  if (ua) Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });

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
  window.alert = () => {};
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

  // A profile that is already linked to a cloud file, with all three stamps distinct.
  const store = new Map();
  const p = (k) => `${PROFILE}::${k}`;
  store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE, name: 'Test', emoji: '🧪' }]));
  // RAW, not JSON. The app reads this one with a bare localStorage.getItem() and no
  // JSON.parse, so seeding it stringified yields an id that literally contains quote
  // characters — pk() then builds `"test-profile"::key` and never matches the
  // profile-scoped rows below. The other harnesses get away with it only because they
  // seed no profile-scoped data at all.
  store.set('lifeplanner-active-profile', PROFILE);
  store.set(p('lifeplanner-gdrive-sync-v1'), JSON.stringify({
    fileId: 'CLOUD-1', fileName: 'my-planner.json', localName: '',
    lastSyncAt: CHECKED_AT, lastCloudModified: CLOUD_STAMP,
  }));
  // Stored raw, not JSON — this key holds a bare ISO string.
  store.set(p('lifeplanner-data-updated-v1'), LOCAL_STAMP);

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
  const real = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };
  window.eval(bundle);
  return { window, errors, restore: () => { console.error = real; } };
}

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};
// A wall-clock time, in any locale form jsdom produces (24h or "9:00 AM").
const HAS_CLOCK = /\b\d{1,2}:\d{2}(:\d{2})?\s?([AP]M)?/i;

// ---------------------------------------------------------------- phone header
{
  const { window, errors, restore } = boot({ width: 390, height: 844, ua: IPHONE });
  await settle();
  restore();
  console.log('--- phone 390, profile linked to a cloud file ---');
  if (errors.length) check('no runtime errors', false, errors[0]);

  if (process.env.DBG) {
    console.log('       aria-labels:', JSON.stringify([...window.document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')).filter(Boolean).slice(0,12)));
    console.log('       header text:', JSON.stringify((window.document.querySelector('.lp-app-chrome')?.textContent||'').slice(0,120)));
    console.log('       fileName in body:', (window.document.body.textContent||'').includes('my-planner.json'));
  }
  const chip = [...window.document.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === 'Cloud sync status');
  check('phone header shows a cloud-sync chip', !!chip,
    'the status lived only in the desktop File menu, which is not rendered below 1024px');

  if (chip) {
    const text = (chip.textContent || '').trim();
    console.log(`       chip reads: ${JSON.stringify(text)}`);
    check('chip shows a wall-clock time, not just an age', HAS_CLOCK.test(text), text);
    check('chip shows the relative age too', /ago|just now/.test(text), text);

    // The tooltip is where all three facts live in the compact layout.
    const tip = chip.getAttribute('title') || '';
    check('chip tooltip names the cloud file', tip.includes('my-planner.json'), tip.slice(0, 80));
    for (const [what, stamp] of [['This browser', LOCAL_STAMP], ['Cloud file', CLOUD_STAMP]]) {
      const hhmm = new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      check(`tooltip carries the ${what} time (${hhmm})`, tip.includes(hhmm), tip.replace(/\n/g, ' | '));
    }
    // The three ages are 2 / 40 / 5 minutes apart, so they must not all read alike.
    const ages = [...tip.matchAll(/(\d+) min ago/g)].map((m) => m[1]);
    check('the three stamps are distinct, not one value repeated',
      new Set(ages).size >= 2, JSON.stringify(ages));
  }

  // Tapping it must reach the full panel.
  if (chip) {
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(350);
    const body = window.document.body.textContent || '';
    check('tapping the chip opens the sync panel', /Cloud sync|GOOGLE DRIVE|Sync/i.test(body));
    if (process.env.DBG) console.log('       panel body:', JSON.stringify(body.slice(0, 400)));
    check('panel lists this device / cloud file / last checked together',
      body.includes('This browser') && body.includes('Cloud file') && body.includes('Last checked'),
      'the three facts were never shown side by side');

    // Three storage locations, three labelled boxes. The middle one used to be
    // headed "This device (local)" with a filename under it that just mirrored the
    // Drive name — so browser storage and a file on disk looked like one place.
    check('names all three storage locations distinctly',
      /Google Drive/i.test(body) && /This browser/i.test(body) && /File on disk/i.test(body),
      'boxes seen: ' + ['Google Drive','This browser','File on disk'].filter(x=>new RegExp(x,'i').test(body)).join(', '));
    check('browser storage is described as storage, not as a file',
      /copy the app reads|not a file/i.test(body));
    check('the disk snapshot warns that it does not update',
      /does not update|one-off snapshot/i.test(body));
    check('one name per location — "This device" is no longer used alongside "This browser"',
      !/This device/.test(body), 'two labels for the same storage location');
    check('no fictional filename under the browser-storage box',
      !/This browser[\s\S]{0,80}my-planner\.json/i.test(body),
      'the mirrored Drive name is back under browser storage');
  }
}

// -------------------------------------------------------------------- desktop
{
  const { window, errors, restore } = boot({ width: 1440, height: 900 });
  await settle();
  restore();
  console.log('\n--- desktop 1440 ---');
  if (errors.length) check('no runtime errors', false, errors[0]);
  // The desktop File menu is behind a click; assert the shared formatter reached the
  // build at all rather than re-deriving the menu path here.
  const html = window.document.body.innerHTML;
  check('desktop still renders', html.length > 1000);
}

console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
