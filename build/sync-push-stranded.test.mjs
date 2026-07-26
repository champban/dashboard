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
// And a save COMMITS WHAT IS ON SCREEN AT THAT MOMENT: the stamp it writes is "now", in
// the payload, in dataLastUpdated and in lastPushedStamp alike. Leaving dataLastUpdated
// at the older edit time made a successful save read as a failure — "This browser 19 hr
// ago" beside "Google Drive 3 min ago".
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

function boot({ lastPushedStamp, cloudMoved, auto = false, copyFails = false }) {
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
  store.set(p('lifeplanner-config-v1'), JSON.stringify({ gsyncConnected: true, gsyncAuto: auto }));

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
  // Creates are kept apart from uploads on purpose. A conflict copy is a NEW file;
  // a write to the master file is what destroys something. Pooling them would make
  // "did it overwrite the master?" unanswerable, and that is the assertion that
  // matters most in the blocks below.
  const creates = [];
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'tok', expires_in: 3600 }) }),
    revoke: (t, cb) => cb && cb(),
  } } };
  window.fetch = (url, opts = {}) => {
    const u = String(url);
    const json = (b) => Promise.resolve({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('oauth2/v3/userinfo')) return json({ email: 'champbanyat@gmail.com' });
    if (u.includes('uploadType=multipart')) {           // createFile — a NEW file
      const body = String(opts.body || '');
      if (copyFails) return Promise.resolve({ ok: false, status: 500,
        text: async () => 'copy upload refused', json: async () => ({}) });
      creates.push(body);
      const name = (body.match(/"name":"([^"]+)"/) || [, ''])[1];
      return json({ id: 'COPY-' + creates.length, name, modifiedTime: new Date(NOW).toISOString() });
    }
    if (u.includes('upload/drive/v3/files')) {          // this is a PUSH to the master
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
      // parents is what getParentFolder reads, so a conflict copy can be asserted to
      // land in the master file's folder rather than in My Drive root.
      return json({ id: FILE_ID, name: 'My-Todo-Planner1.json', trashed: false, parents: ['FOLDER-1'],
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
  return { window, store, uploads, creates, errors, restore: () => { console.error = real; } };
}

const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
// The profile's task list as it stands in storage. applyPayloadLive writes through to
// it, so this answers "was the download applied?" without depending on which tab or
// modal happens to be rendered.
const stored = (store) => String(store.get(`${PROFILE}::lifeplanner-personal-v1`) || '');
const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};

// Opens the Sync Manager and signs in, stopping short of pressing anything. The panel
// shows only a "Connect Google Drive" prompt until there is a live token, and this
// environment starts without one.
async function connectDrive(w) {
  const chip = [...w.document.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === 'Cloud sync status');
  if (!chip) return false;
  chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(400);
  const connect = [...w.document.querySelectorAll('button')]
    .find((b) => /Connect Google Drive/i.test(b.textContent || ''));
  if (connect) {
    connect.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(600);
  }
  return true;
}

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
  await settle(500);
  // Save to Cloud asks first now, from the header button and from this panel alike, so a
  // press on its own writes nothing. Answering the confirm is part of "pressing save" —
  // and every assertion below about what a save does depends on getting past it.
  const yes = [...w.document.querySelectorAll('button')]
    .find((b) => /Yes — save to Google Drive/i.test((b.textContent || '')));
  if (yes) {
    yes.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(900);
  }
  return { opened: true, pressed: true, confirmed: !!yes };
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
    // A save commits what is on screen AT THE MOMENT OF THE SAVE, so the stamp that
    // goes up is that moment — not the older edit time the data happened to carry.
    check('the upload is stamped with the moment of the save',
      !!sent && sent.dataLastUpdated === new Date(NOW).toISOString(),
      sent ? String(sent.dataLastUpdated) : '');
  }

  const rec = JSON.parse(store.get(`${PROFILE}::lifeplanner-gdrive-sync-v1`));
  check('lastPushedStamp matches the moment of the save',
    rec.lastPushedStamp === new Date(NOW).toISOString(), JSON.stringify(rec.lastPushedStamp));
  check('the browser time is refreshed too, so nothing reads as stale',
    store.get(`${PROFILE}::lifeplanner-data-updated-v1`) === new Date(NOW).toISOString(),
    JSON.stringify(store.get(`${PROFILE}::lifeplanner-data-updated-v1`)));
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

  // The rule, stated by the user: pressing save commits what is on screen AT THAT
  // MOMENT, so the browser's own time must become that moment — not stay at the old
  // edit time. Leaving it stale is what made a successful save look like a failure:
  // "This browser 19 hr ago" beside "Google Drive 3 min ago".
  const browserStamp = store.get(`${PROFILE}::lifeplanner-data-updated-v1`);
  check('the browser time is refreshed to the moment of the save',
    browserStamp === new Date(NOW).toISOString(),
    `still ${JSON.stringify(browserStamp)} — expected the save moment ${new Date(NOW).toISOString()}`);
  check('and it equals what was recorded as pushed', browserStamp === rec.lastPushedStamp,
    `browser ${browserStamp} vs pushed ${rec.lastPushedStamp}`);

  // Same value in the uploaded body, so the file agrees with both.
  let sent = null;
  try { sent = JSON.parse(uploads[uploads.length - 1]); } catch {}
  check('the uploaded file carries that same stamp', !!sent && sent.dataLastUpdated === browserStamp,
    sent ? String(sent.dataLastUpdated) : 'could not parse the body');
}

// ── the ONE case that must still refuse: the cloud moved without us seeing it ──
// Overwriting there loses another device's work, so it asks instead of uploading.
{
  // Cloud moved, and THIS device has nothing unsaved (lastPushedStamp === the local
  // edit). Until 3.78 this raised a modal — whose own first line said "This device has
  // no unsaved edits, so updating is safe". A dialog that argues for the button it is
  // asking you to press is friction, not consent, so the safe case now applies itself.
  //
  // This block used to assert the modal, and passed for the wrong reason after the
  // behaviour changed: the new toast reads "Updated from cloud — another device saved",
  // which matched the old /Another device saved/i pattern. The assertions below name the
  // dialog's own chrome instead, so they cannot be satisfied by a status message.
  console.log('\n--- cloud moved, nothing unsaved here: apply it, do not ask ---');
  {
    const { window, store, uploads, errors, restore } = boot({ lastPushedStamp: LOCAL_EDIT, cloudMoved: true });
    await settle();
    restore();
    if (errors.length) check('no runtime errors', false, errors[0]);
    await pressSaveToCloud(window);
    const body = window.document.body.textContent || '';
    check('does NOT overwrite the newer cloud copy', uploads.length === 0,
      `${uploads.length} upload(s) — another device's work would have been lost`);
    check('does not put a decision in the way', !/Save needs a decision|Take the cloud copy/i.test(body),
      body.slice(0, 160));
    // Probed in storage, not in the DOM: with the Sync Manager open the task list is
    // not on screen either way, so a DOM check would pass whether or not the download
    // was ever applied. The cloud stub serves `personal: []`.
    check('applies the cloud copy to browser storage', !/EditedOnPhone/.test(stored(store)),
      'the local task is still stored, so the download was never applied');
    check('and says so', /Updated from cloud/i.test(body), body.slice(0, 160));
  }

  // The genuine collision: cloud moved AND this device holds an edit that never went up
  // (no lastPushedStamp). Auto-applying here would discard local work, so this is the
  // one case that still asks. It is the guard that keeps "apply automatically" from
  // becoming "lose whichever copy arrives second".
  console.log('\n--- cloud moved AND local has unsaved edits: must ask ---');
  {
    const { window, store, uploads, errors, restore } = boot({ cloudMoved: true });
    await settle();
    restore();
    if (errors.length) check('no runtime errors', false, errors[0]);
    await pressSaveToCloud(window);
    const body = window.document.body.textContent || '';
    check('does NOT silently overwrite a newer cloud copy', uploads.length === 0,
      `${uploads.length} upload(s) — another device's work would have been lost`);
    check('does NOT silently discard the local edit either', /EditedOnPhone/.test(stored(store)),
      'the stored task vanished — the cloud copy was applied over unsaved work');
    check('asks which copy to keep instead', /Save needs a decision/i.test(body), body.slice(0, 160));
    check('and offers both directions', /Take the cloud copy/i.test(body) && /overwrite the cloud/i.test(body),
      body.slice(0, 200));
    // The dialog is raised from the Sync Manager panel and has to sit above it. At
    // zIndex 6000 against the panel's 9700 it rendered behind the thing that opened it,
    // and Chromium at 390x844 reported every one of its buttons covered — present in
    // the DOM, unanswerable on screen. jsdom cannot paint, but the numbers are the bug.
    const zOf = (re) => {
      const el = [...window.document.querySelectorAll('div')].find((d) =>
        d.style && d.style.position === 'fixed' && re.test(d.textContent || ''));
      return el ? parseInt(el.style.zIndex || '0', 10) : null;
    };
    const zDialog = zOf(/Save needs a decision/i), zPanel = zOf(/Sync Manager/i);
    check('the dialog stacks above the Sync Manager that raised it',
      zDialog !== null && zPanel !== null && zDialog > zPanel,
      `dialog z=${zDialog} panel z=${zPanel}`);
  }
}

// ── the same rule on the auto-sync path, which is where it matters most ─────────
// Nobody presses anything here: the tab regains focus, gsyncNow reconciles, and the
// other device's save has to land in browser storage on its own. This is the scenario
// the behaviour was reported against — "if another device saved, apply it, do not stop
// to ask" — and the Save-press blocks above cannot cover it, because they go through
// gsyncSaveNow rather than gsyncNow.
{
  console.log('\n--- auto-sync, cloud moved, nothing unsaved here: applies on focus ---');
  const { window, store, uploads, errors, restore } = boot({ lastPushedStamp: LOCAL_EDIT, cloudMoved: true, auto: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  check('the local edit starts out in storage', /EditedOnPhone/.test(stored(store)));
  await connectDrive(window);
  window.dispatchEvent(new window.Event('focus'));
  await settle(900);
  const body = window.document.body.textContent || '';
  check('brings the other device\'s save into browser storage', !/EditedOnPhone/.test(stored(store)),
    'the local task is still stored — the cloud change never arrived');
  check('without asking', !/Save needs a decision|Take the cloud copy/i.test(body), body.slice(0, 160));
  check('and without pushing anything back up', uploads.length === 0,
    `${uploads.length} upload(s) — it should have pulled, not pushed`);
}

// ── Dropbox rule: the copy that loses the master file is not deleted ───────────
// Before this, whichever side lost the dialog was gone, and the confirm step said so —
// "This cannot be undone from here. Cancel and use Backup to Local Drive first" — which
// is only useful to someone who read it before the collision existed.
//
// Each block below answers the dialog one way and asserts on the multipart create that
// Drive received. `creates` is deliberately a separate list from `uploads`: a conflict
// copy is a new file, an upload overwrites the master, and conflating them would make
// the destructive half unobservable.
async function clickByText(w, re) {
  const b = [...w.document.querySelectorAll('button')].find((x) => re.test(x.textContent || ''));
  if (!b) return false;
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(900);
  return true;
}
const createdName = (body) => (String(body).match(/"name":"([^"]+)"/) || [, ''])[1];

{
  console.log('\n--- collision, take the cloud copy: this device is kept as a conflicted copy ---');
  const { window, store, uploads, creates, errors, restore } = boot({ cloudMoved: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await pressSaveToCloud(window);
  const asked = await clickByText(window, /Take the cloud copy/i);
  check('the dialog offered the cloud copy', asked);
  check('a conflicted copy was written to Drive', creates.length === 1,
    `${creates.length} create(s) — the losing copy was destroyed instead`);
  const name = createdName(creates[0] || '');
  check('named after the master file, marked as a conflicted copy',
    /^My-Todo-Planner1 \(conflicted copy from this device \d{4}-\d{2}-\d{2} \d{2}-\d{2}\)\.json$/.test(name), name);
  // A filename containing "/" is rejected by Drive, and every locale-formatted date is
  // liable to produce one — so this is a real failure mode, not a style check.
  check('the name has no path separator in it', !name.includes('/'), name);
  check('the copy holds the edit that left the screen', /EditedOnPhone/.test(creates[0] || ''),
    'the copy was written but does not contain the local work');
  check('placed beside the master file, not in My Drive root',
    /"parents":\["FOLDER-1"\]/.test(creates[0] || ''), creates[0].slice(0, 200));
  check('and the master file itself was NOT overwritten', uploads.length === 0,
    `${uploads.length} upload(s) — taking the cloud copy should not push`);
  check('the cloud copy is now what this device holds', !/EditedOnPhone/.test(stored(store)));
}

{
  console.log('\n--- collision, overwrite the cloud: the other device is kept as a conflicted copy ---');
  const { window, uploads, creates, errors, restore } = boot({ cloudMoved: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await pressSaveToCloud(window);
  await clickByText(window, /Keep this device and overwrite the cloud/i);
  check('a conflicted copy was written to Drive', creates.length === 1,
    `${creates.length} create(s) — the other device's save was destroyed instead`);
  check('attributed to Drive, not to this device',
    /\(conflicted copy from Google Drive \d{4}-\d{2}-\d{2} \d{2}-\d{2}\)\.json$/.test(createdName(creates[0] || '')),
    createdName(creates[0] || ''));
  check('then the master file was overwritten', uploads.length === 1,
    `${uploads.length} upload(s) — the save the user asked for did not happen`);
  // Ordering is the whole feature, so it is asserted, not assumed: the copy has to be
  // on Drive before the write that makes it the only remaining trace.
  check('the copy went up BEFORE the overwrite',
    creates.length === 1 && uploads.length === 1 && /EditedOnPhone/.test(uploads[0]));
}

{
  // The run that the ordering exists for. If the conflict copy cannot be written, the
  // promise made in the dialog is already broken — so nothing may be destroyed. A
  // version that copied afterwards, or that ignored the failure, would lose the data
  // here while still having told the user it was safe.
  console.log('\n--- the conflicted copy fails to upload: destroy nothing ---');
  const { window, store, uploads, creates, errors, restore } = boot({ cloudMoved: true, copyFails: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await pressSaveToCloud(window);
  await clickByText(window, /Take the cloud copy/i);
  check('no conflicted copy exists', creates.length === 0);
  check('the local edit is STILL in browser storage', /EditedOnPhone/.test(stored(store)),
    'the cloud copy was applied even though the backup of the local copy failed');
  check('and the master file was not touched either', uploads.length === 0,
    `${uploads.length} upload(s)`);
  check('the failure is reported rather than swallowed',
    /Drive error 500|copy upload refused|failed/i.test(window.document.body.textContent || ''),
    (window.document.body.textContent || '').slice(0, 200));
}

console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
