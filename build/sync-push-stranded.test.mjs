// build/sync-push-stranded.test.mjs — "Save to Cloud" must actually upload.
//
// Reproduces the exact state from the bug report's Sync Manager screenshot:
//
//     📄 My-Todo-Planner1.json
//     📱 This device    18 hr ago · 08:00 PM     <- local data is NEWER
//     ☁️ Cloud file     18 hr ago · 07:57 PM     <- by three minutes
//     🔄 Last checked   just now  · 02:29 PM
//     ✓ Already up to date — nothing to upload   <- and it refused to upload
//
// localChanged used to be `dataLastUpdated > lastSyncAt + 1500`, i.e. "did the data
// change since we last CHECKED" rather than "is the data newer than what is in the
// cloud". The no-op branch re-stamps lastSyncAt on every check, so once lastSyncAt got
// ahead of dataLastUpdated the edit was invisible forever and every further check
// pushed lastSyncAt further out. The newer data could never leave the device.
//
// The decision is now `dataLastUpdated !== lastPushedStamp` — the stamp that was last
// actually uploaded, on this device's own clock.
//
// Run: node build/sync-push-stranded.test.mjs   (needs ./test-bundle.js)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

const NOW = new Date('2026-07-02T14:29:00.000Z').getTime();   // "02:29 PM"
const LOCAL_EDIT = new Date('2026-07-01T20:00:00.000Z').toISOString(); // 08:00 PM
const CLOUD_MTIME = new Date('2026-07-01T19:57:00.000Z').toISOString(); // 07:57 PM
const PROFILE = 'test-profile';
const FILE_ID = 'CLOUD-1';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function boot({ lastPushedStamp, cloudMoved }) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://champban.github.io/dashboard/', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  Object.defineProperty(window.navigator, 'userAgent', { value: IPHONE, configurable: true });

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

  // --- storage: a profile mid-sync, with newer local data than the cloud ------
  const store = new Map();
  const p = (k) => `${PROFILE}::${k}`;
  store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE, name: 'Test', emoji: '🧪' }]));
  store.set('lifeplanner-active-profile', PROFILE);          // raw — no JSON.parse on read
  store.set(p('lifeplanner-personal-v1'), JSON.stringify([
    { id: 't1', title: 'EditedOnPhone', status: 'todo', due: '2026-08-01' },
  ]));
  store.set(p('lifeplanner-data-updated-v1'), LOCAL_EDIT);   // raw ISO string
  store.set(p('lifeplanner-gdrive-sync-v1'), JSON.stringify({
    fileId: FILE_ID, fileName: 'My-Todo-Planner1.json', localName: '',
    // The trap: lastSyncAt is far AHEAD of the local edit, exactly as the no-op
    // branch left it after re-stamping on every check.
    lastSyncAt: NOW - 1000,
    lastCloudModified: CLOUD_MTIME,
    ...(lastPushedStamp === undefined ? {} : { lastPushedStamp }),
  }));
  store.set(p('lifeplanner-config-v1'), JSON.stringify({ gsyncConnected: true, gsyncAuto: false }));

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

  // --- a signed-in Drive whose file records every write ----------------------
  const uploads = [];
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'tok', expires_in: 3600 }) }),
    revoke: (t, cb) => cb && cb(),
  } } };
  window.fetch = (url, opts = {}) => {
    const u = String(url);
    const json = (b) => Promise.resolve({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('oauth2/v3/userinfo')) return json({ email: 'champbanyat@gmail.com' });
    if (u.includes('upload/drive/v3/files')) {          // this is a PUSH
      uploads.push(String(opts.body || ''));
      return json({ id: FILE_ID, name: 'My-Todo-Planner1.json', modifiedTime: new Date(NOW).toISOString() });
    }
    if (u.includes(`drive/v3/files/${FILE_ID}?alt=media`)) {
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({
        version: 7, savedAt: CLOUD_MTIME, dataLastUpdated: CLOUD_MTIME, personal: [], work: [] }) });
    }
    if (/drive\/v3\/files\/[^?]+\?fields=/.test(u)) {
      // cloudMoved: a modifiedTime this device has never recorded — i.e. another
      // device wrote the file after our last check.
      return json({ id: FILE_ID, name: 'My-Todo-Planner1.json', trashed: false,
        modifiedTime: cloudMoved ? new Date(NOW - 60 * 1000).toISOString() : CLOUD_MTIME });
    }
    if (u.includes('drive/v3/files?q=')) return json({ files: [] });
    return Promise.resolve({ ok: false, status: 404, text: async () => 'not stubbed', json: async () => ({}) });
  };

  const RealDate = window.Date;
  class FrozenDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [NOW])); }
    static now() { return NOW; }
  }
  FrozenDate.parse = RealDate.parse; FrozenDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', { value: FrozenDate, configurable: true, writable: true });

  const errors = [];
  window.onerror = (m, s, l, c, err) => { errors.push(String(err && err.stack ? err.stack : m)); return true; };
  const real = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };
  window.eval(bundle);
  return { window, store, uploads, errors, restore: () => { console.error = real; } };
}

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};

async function pressSaveToCloud(w) {
  const chip = [...w.document.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === 'Cloud sync status');
  if (!chip) return { opened: false };
  chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(400);
  // The panel shows only a "Connect Google Drive" prompt until there is a live token,
  // and this environment starts without one. Connect first, the way a user would.
  const connect = [...w.document.querySelectorAll('button')]
    .find((b) => /Connect Google Drive/i.test(b.textContent || ''));
  if (connect) {
    connect.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(600);
  }
  const save = [...w.document.querySelectorAll('button')]
    .find((b) => /Save to Cloud/i.test((b.textContent || '')));
  if (!save) return { opened: true, pressed: false };
  save.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(900);
  return { opened: true, pressed: true };
}

// ── the reported state: a record with no lastPushedStamp (every existing install)
{
  console.log('--- stranded: local 08:00 PM, cloud 07:57 PM, no lastPushedStamp ---');
  const { window, store, uploads, errors, restore } = boot({ lastPushedStamp: undefined });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);

  const r = await pressSaveToCloud(window);
  check('Sync Manager opens from the header chip', r.opened);
  check('a "Save to Cloud" button is present', r.pressed);

  check('pressing it actually UPLOADS', uploads.length > 0,
    'it reported "Already up to date — nothing to upload" and sent nothing');

  if (uploads.length) {
    let sent = null;
    try { sent = JSON.parse(uploads[uploads.length - 1]); } catch { /* multipart create */ }
    if (!sent) {
      const m = uploads[uploads.length - 1].match(/\{[\s\S]*"personal"[\s\S]*\}/);
      try { sent = JSON.parse(m ? m[0] : ''); } catch {}
    }
    check('the upload carries this device\'s data', !!sent && JSON.stringify(sent).includes('EditedOnPhone'),
      sent ? JSON.stringify(sent).slice(0, 90) : 'could not parse the uploaded body');
    check('the upload carries the local edit stamp', !!sent && sent.dataLastUpdated === LOCAL_EDIT,
      sent ? String(sent.dataLastUpdated) : '');
  }

  const rec = JSON.parse(store.get(`${PROFILE}::lifeplanner-gdrive-sync-v1`));
  check('lastPushedStamp is recorded after the push', rec.lastPushedStamp === LOCAL_EDIT,
    JSON.stringify(rec.lastPushedStamp));
}

// ── nothing changed locally: "Save to Cloud" must STILL upload ───────────────
// The button says save. Reported as: "when I click Save to Cloud it means I ask to
// save whatever shows on the screen to the Google Drive file, but now it is not
// working like that." Correct — it called the two-way reconciler, which is entitled
// to answer "nothing to upload". That is the right answer for auto-sync and the wrong
// one for a button a person pressed.
{
  console.log('\n--- nothing changed locally: save must still write to Drive ---');
  const { window, store, uploads, errors, restore } = boot({ lastPushedStamp: LOCAL_EDIT });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await pressSaveToCloud(window);
  check('Save to Cloud uploads even with no local change', uploads.length > 0,
    'it refused with "Already up to date — nothing to upload"; the user asked for a save');
  const body = window.document.body.textContent || '';
  check('and reports a save, not a no-op', /Saved to cloud/i.test(body),
    'still reporting "nothing to upload"');
  const rec = JSON.parse(store.get(`${PROFILE}::lifeplanner-gdrive-sync-v1`));
  check('the cloud-file stamp moves forward', rec.lastCloudModified === new Date(NOW).toISOString(),
    JSON.stringify(rec.lastCloudModified));
}

// ── the ONE case that must still refuse: the cloud moved without us seeing it ──
// Overwriting there loses another device's work, so it asks instead of uploading.
{
  console.log('\n--- cloud moved since this device last looked ---');
  const { window, uploads, errors, restore } = boot({ lastPushedStamp: LOCAL_EDIT, cloudMoved: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await pressSaveToCloud(window);
  check('does NOT silently overwrite a newer cloud copy', uploads.length === 0,
    `${uploads.length} upload(s) — another device's work would have been lost`);
  const body = window.document.body.textContent || '';
  check('asks which copy to keep instead', /choose which copy|Another device saved|Update now|overwrite/i.test(body),
    body.slice(0, 140));
}

console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
