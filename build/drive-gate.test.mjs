// build/drive-gate.test.mjs — first run must be able to open a JSON from Drive.
//
// N104. On the onboarding gate (no profile yet) the iOS layout leads with
// "Open from Google Drive". The gate is an early `return` near the top of App,
// above every modal and panel, so the old handler — connect, then
// setGsyncPanel(true) — switched on a panel that is not mounted on this path.
// A successful Google sign-in therefore looked exactly like a failed one:
// nothing happened, and the user stayed on the welcome screen. The gate also
// rendered no error, so a genuine failure was invisible too.
//
// This drives the whole first-run path with a stubbed GIS + Drive REST layer:
// tap the button, see the file list, pick a file, land in the app with that
// file's data, and have the file linked for sync.
//
// Run: node build/drive-gate.test.mjs   (needs ./test-bundle.js)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const DRIVE_FILE = { id: 'FILE-1', name: 'my-planner.json', modifiedTime: '2026-07-20T10:00:00.000Z' };
const PAYLOAD = {
  version: 7,
  savedAt: '2026-07-20T10:00:00.000Z',
  profile: { name: 'From Drive', emoji: '☁️' },
  personal: [{ id: 'p1', title: 'TaskFromDrive', status: 'todo', due: '2026-07-30' }],
  work: [],
  events: [],
  notes: [],
};

// Records what the app actually asked Google for, so the test can tell "the list
// call never happened" apart from "the list came back empty".
const calls = [];

function boot() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://champban.github.io/dashboard/',
    userAgent: IPHONE_UA,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  // The constructor's userAgent option does not reach navigator here, and the
  // gate only offers the Drive button when the UA says iPhone/iPad.
  Object.defineProperty(window.navigator, 'userAgent', { value: IPHONE_UA, configurable: true });

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
  window.alert = (m) => { calls.push({ alert: String(m) }); };
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

  // --- storage: deliberately EMPTY, so the app shows the onboarding gate ------
  const store = new Map();
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

  // --- stub Google Identity Services -----------------------------------------
  // loadGIS() short-circuits when window.google.accounts.oauth2 already exists,
  // so no script is ever appended and no network is needed.
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => {
          calls.push({ initTokenClient: { scope: cfg.scope, prompt: null } });
          return {
            requestAccessToken: (opts) => {
              calls.push({ requestAccessToken: (opts && opts.prompt) || '' });
              cfg.callback({ access_token: 'test-token', expires_in: 3600 });
            },
          };
        },
        revoke: (t, cb) => cb && cb(),
      },
    },
  };

  // --- stub the Drive REST layer ---------------------------------------------
  const json = (body) => Promise.resolve({
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  window.fetch = (url, opts) => {
    const u = String(url);
    calls.push({ fetch: u.replace('https://www.googleapis.com/', '').slice(0, 90) });
    if (u.includes('oauth2/v3/userinfo')) return json({ email: 'champbanyat@gmail.com' });
    if (u.includes(`drive/v3/files/${DRIVE_FILE.id}?alt=media`)) {
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(PAYLOAD), json: async () => PAYLOAD });
    }
    if (/drive\/v3\/files\/[^?]+\?fields=/.test(u)) return json(DRIVE_FILE);
    if (u.includes('drive/v3/files?q=')) return json({ files: [DRIVE_FILE] });
    if (u.includes('upload/drive/v3/files')) return json(DRIVE_FILE);
    return Promise.resolve({ ok: false, status: 404, text: async () => 'not stubbed', json: async () => ({}) });
  };

  const FIXED = new Date('2026-07-25T09:00:00.000Z').getTime();
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
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 300)); };
  window.eval(bundle);
  return { window, store, errors, restore: () => { console.error = realConsoleError; } };
}

const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const buttons = (w) => [...w.document.querySelectorAll('button')];
const byText = (w, re) => buttons(w).find((b) => re.test((b.textContent || '').trim()));
const tap = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const bodyText = (w) => w.document.body.textContent || '';

const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail && !cond ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};

const { window, store, errors, restore } = boot();
await settle();
restore();

console.log('--- first run, iPhone UA, empty storage ---');
if (process.env.DBG) {
  console.log('UA        :', window.navigator.userAgent.slice(0, 40));
  console.log('body text :', JSON.stringify(bodyText(window).slice(0, 300)));
  console.log('buttons   :', JSON.stringify(buttons(window).map((b) => (b.textContent || '').trim().slice(0, 30))));
  console.log('errors    :', errors.slice(0, 3));
}
const gateBtn = byText(window, /Open from Google Drive/i);
check('welcome gate offers "Open from Google Drive"', !!gateBtn);
if (!gateBtn) {
  console.log('\nFAIL — cannot continue without the button');
  process.exit(1);
}

// --- tap it ------------------------------------------------------------------
tap(window, gateBtn);
await settle(600);

const askedForList = calls.some((c) => c.fetch && c.fetch.includes('drive/v3/files?q='));
check('signing in also asks Drive for the file list', askedForList,
  'the app connected and then never listed anything');

const fileBtn = byText(window, new RegExp(DRIVE_FILE.name.replace('.', '\\.'), 'i'));
check('the Drive file list is shown on the gate', !!fileBtn,
  'nothing new rendered — the panel it tries to open is not mounted on this path');

if (fileBtn) {
  // --- pick the file ---------------------------------------------------------
  tap(window, fileBtn);
  await settle(700);

  const txt = bodyText(window);
  check('gate is gone (a profile was created)', !/Welcome to My Todo Planner/i.test(txt));
  check('the file was downloaded', calls.some((c) => c.fetch && c.fetch.includes('alt=media')));

  // Assert on storage rather than on screen: a freshly opened file lands on the
  // Timeline tab, which lists milestones, so an open to-do is legitimately not
  // rendered there. What matters is that the payload reached the new profile.
  const pKey = [...store.keys()].find((k) => /^profile-\d+::lifeplanner-personal/.test(k));
  check("the file's tasks were written to the new profile", !!pKey && store.get(pKey).includes('TaskFromDrive'),
    pKey ? store.get(pKey).slice(0, 80) : 'no personal key at all');
  const profRow = store.get('lifeplanner-profiles') || '';
  check('the profile is named after the file contents', profRow.includes('From Drive'), profRow.slice(0, 120));

  // The config carrying gsyncConnected must be scoped too, and must not be a
  // DEFAULT_CONFIG blob written over the file's own settings.
  // The file's own edit stamp must land in the new profile, or "Data updated" is
  // blank right after opening from Drive even though the file states when its
  // contents changed. This PAYLOAD carries only savedAt — the pre-existing shape —
  // so it also proves the fallback for files written before dataLastUpdated existed.
  const duKey = [...store.keys()].find((k) => /^profile-\d+::lifeplanner-data-updated/.test(k));
  check("the file's edit stamp is carried into the profile", !!duKey && store.get(duKey) === PAYLOAD.savedAt,
    duKey ? `stored ${JSON.stringify(store.get(duKey))}, file says ${JSON.stringify(PAYLOAD.savedAt)}` : 'no stamp written at all');
  check('the stamp is stored raw, not JSON-quoted', !!duKey && !store.get(duKey).startsWith('"'),
    duKey ? store.get(duKey) : '');

  const cKeys = [...store.keys()].filter((k) => /lifeplanner-config/.test(k));
  const cScoped = cKeys.filter((k) => /^profile-\d+::/.test(k));
  check('config written only under the new profile', cScoped.length === 1 && cKeys.length === cScoped.length,
    JSON.stringify(cKeys));
  if (cScoped.length === 1) {
    check('the profile records that Drive is connected',
      JSON.parse(store.get(cScoped[0])).gsyncConnected === true, store.get(cScoped[0]).slice(0, 100));
  }

  // The link must be written under the NEW profile's key. `activeProfileId` is
  // still null in the closure that opens the file, so an unscoped pk() write
  // would land on the bare key and the profile would come back unlinked.
  const keys = [...store.keys()];
  const scoped = keys.filter((k) => /^profile-\d+::lifeplanner-gdrive-sync-v1$/.test(k));
  const bare = keys.filter((k) => k === 'lifeplanner-gdrive-sync-v1');
  check('Drive link stored under the new profile', scoped.length === 1,
    `scoped=${scoped.length} bare=${bare.length}`);
  check('no unscoped Drive-link write', bare.length === 0);
  if (scoped.length === 1) {
    const linked = JSON.parse(store.get(scoped[0]));
    check('link points at the opened file', linked.fileId === DRIVE_FILE.id && linked.fileName === DRIVE_FILE.name,
      JSON.stringify(linked));
  }
}

// --- a failure must be visible, not silent -----------------------------------
{
  const b = boot();
  await settle();
  b.restore();
  // Make sign-in fail the way a blocked popup or a cancelled consent does.
  b.window.google.accounts.oauth2.initTokenClient = (cfg) => ({
    requestAccessToken: () => cfg.error_callback({ type: 'popup_closed' }),
  });
  const btn = byText(b.window, /Open from Google Drive/i);
  const before = bodyText(b.window);
  tap(b.window, btn);
  await settle(600);
  const after = bodyText(b.window);
  console.log('--- sign-in fails ---');
  check('the gate says something went wrong', after !== before && /popup_closed|again|error|Could not|ไม่/i.test(after),
    'the screen is byte-identical to before the tap — a failed sign-in is invisible');
}

// --- an empty list must explain itself ---------------------------------------
// The likeliest real-world outcome: drive.file scope only sees files this app
// created, so a .json the user uploaded to Drive by hand is invisible to it. An
// empty list with no explanation reads as "the app is broken".
{
  const b = boot();
  await settle();
  b.restore();
  const realFetch = b.window.fetch;
  b.window.fetch = (url, opts) => {
    if (String(url).includes('drive/v3/files?q=')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{"files":[]}' });
    }
    return realFetch(url, opts);
  };
  tap(b.window, byText(b.window, /Open from Google Drive/i));
  await settle(600);
  const after = bodyText(b.window);
  console.log('--- Drive has no files this app can see ---');
  check('the empty list explains the drive.file rule',
    /only see files it saved itself|เห็นได้เฉพาะไฟล์ที่ตัวเองบันทึก/i.test(after),
    'an empty list with no explanation looks like a broken app');
}

if (errors.length) {
  console.log(`--- runtime errors (${errors.length}) ---`);
  errors.slice(0, 4).forEach((e) => console.log('  ' + String(e).split('\n').slice(0, 3).join(' | ')));
}
console.log('\ncalls:', JSON.stringify(calls.filter((c) => c.fetch).map((c) => c.fetch)));
console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
