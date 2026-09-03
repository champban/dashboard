// build/sync-content-check.test.mjs — "Check now" compares data, not clocks.
//
// The Sync Manager's green line reads `dataLastUpdated === lastPushedStamp`, which
// answers "did THIS device upload its own latest edit". It cannot see that another
// device saved, so a device could sit on "✓ Google Drive has what is on screen" while
// the cloud held work it had never heard of. Nothing asked the cloud.
//
// gsyncCheckNow downloads the file and compares dataFingerprint() of both sides.
// Direction still comes from the stamps, because content equality says only THAT two
// copies differ, never which way. When the content differs and both stamps claim
// nothing moved, the stamps are wrong — that case asks instead of picking a winner.
//
// The load-bearing test here is the ROUND TRIP: save, serve the uploaded bytes back as
// the cloud file, and check. If dataFingerprint included savedAt or dataLastUpdated —
// both of which change on every save — "matched" would be unreachable and the whole
// readout would be a permanent false alarm. Fabricating a "matching" fixture by hand
// would not catch that; only a real save/download cycle does.
//
// Run: node build/sync-content-check.test.mjs   (needs ./test-bundle.js)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = fs.readFileSync('./test-bundle.js', 'utf8');

const NOW = new Date('2026-07-26T14:29:00.000Z').getTime();
const LOCAL_EDIT = new Date('2026-07-26T12:00:00.000Z').toISOString();
const CLOUD_MTIME = new Date('2026-07-26T11:00:00.000Z').toISOString();
const PROFILE = 'check-profile';
const FILE_ID = 'CLOUD-1';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const fails = [];
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(label);
};
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const stored = (store) => String(store.get(`${PROFILE}::lifeplanner-personal-v1`) || '');

// A Drive file that actually behaves like one: an upload replaces its bytes and moves
// its modifiedTime, so a save followed by a check reads back what was written.
function boot({ cloudContent, cloudModified = CLOUD_MTIME, lastPushedStamp, lastCloudModified = CLOUD_MTIME, auto = false, lastPushedFp, lineMutation }) {
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

  const store = new Map();
  const p = (k) => `${PROFILE}::${k}`;
  store.set('lifeplanner-profiles', JSON.stringify([{ id: PROFILE, name: 'Test', emoji: '🧪' }]));
  store.set('lifeplanner-active-profile', PROFILE);
  store.set(p('lifeplanner-personal-v1'), JSON.stringify([
    { id: 't1', title: 'OnThisDevice', status: 'todo', due: '2026-08-01' },
  ]));
  store.set(p('lifeplanner-data-updated-v1'), LOCAL_EDIT);
  store.set(p('lifeplanner-gdrive-sync-v1'), JSON.stringify({
    fileId: FILE_ID, fileName: 'My-Todo-Planner1.json', localName: '',
    lastSyncAt: NOW - 1000, lastCloudModified,
    ...(lastPushedStamp === undefined ? {} : { lastPushedStamp }),
    ...(lastPushedFp === undefined ? {} : { lastPushedFp }),
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

  const cloud = { content: cloudContent, modifiedTime: cloudModified };
  const uploads = [];
  const metaCalls = { n: 0 };
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'tok', expires_in: 3600 }) }),
    revoke: (t, cb) => cb && cb(),
  } } };
  window.fetch = (url, opts = {}) => {
    const u = String(url);
    const json = (b) => Promise.resolve({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('oauth2/v3/userinfo')) return json({ email: 'champbanyat@gmail.com' });
    if (u.includes('uploadType=multipart')) {
      return json({ id: 'COPY-1', name: 'conflict copy.json', modifiedTime: new Date(NOW).toISOString() });
    }
    if (u.includes('upload/drive/v3/files')) {
      // A real overwrite: the file becomes what was sent, and its clock moves.
      const body = String(opts.body || '');
      uploads.push(body);
      cloud.content = body;
      cloud.modifiedTime = new Date(NOW + uploads.length * 1000).toISOString();
      return json({ id: FILE_ID, name: 'My-Todo-Planner1.json', modifiedTime: cloud.modifiedTime });
    }
    if (u.includes(`drive/v3/files/${FILE_ID}?alt=media`)) {
      return Promise.resolve({ ok: true, status: 200, text: async () => cloud.content });
    }
    if (/drive\/v3\/files\/[^?]+\?fields=/.test(u)) {
      metaCalls.n += 1;
      return json({ id: FILE_ID, name: 'My-Todo-Planner1.json', trashed: false, parents: ['FOLDER-1'],
        modifiedTime: cloud.modifiedTime });
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

  // Only set when a test passes lineMutation — every other test leaves
  // window.__MTP_LINE__ undefined, so prepareLineMutations() takes its own
  // no-op fallback ({payload, mutationIds:[]}) and behaves exactly as before.
  const lineCalls = { completeMutations: [] };
  if (lineMutation) {
    window.__MTP_LINE__ = {
      prepareMutations: async (payload) => lineMutation(payload),
      completeMutations: async (ids) => { lineCalls.completeMutations.push(ids); },
    };
  }

  const errors = [];
  window.onerror = (m, s, l, c, err) => { errors.push(String(err && err.stack ? err.stack : m)); return true; };
  const real = console.error;
  console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };
  window.eval(bundle);
  return { window, store, cloud, uploads, metaCalls, errors, lineCalls, restore: () => { console.error = real; } };
}

// Opens the Sync Manager and signs in, pressing nothing else.
async function openPanel(w) {
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
async function press(w, re, ms = 1100) {
  const b = [...w.document.querySelectorAll('button')].find((x) => re.test(x.textContent || ''));
  if (!b) return false;
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(ms);
  return true;
}
// Save to Cloud asks first — header button and panel button alike — so a bare press
// writes nothing. Answering the confirm is part of pressing save.
async function saveToCloud(w) {
  if (!await press(w, /Save to Cloud/i, 500)) return false;
  return press(w, /Yes — save to Google Drive/i, 1100);
}
const body = (w) => (w.document.body.textContent || '').replace(/\s+/g, ' ');
// The verdict, not the word. "Check now — matched or not?" is a BUTTON that is on
// screen the whole time, so /matched/ matches before any check has run — a positive
// assertion written that way passes for free. The readout prefixes its verdict with a
// tick, and nothing else on the page can produce "✓ Matched".
const saysMatched = (w) => /✓ Matched/.test(body(w));

// A cloud file holding something this device has never seen.
const OTHER_DEVICE = JSON.stringify({
  version: 7, savedAt: CLOUD_MTIME, dataLastUpdated: CLOUD_MTIME,
  personal: [{ id: 'c1', title: 'OnTheOtherDevice', status: 'todo', due: '2026-08-02' }], work: [],
}, null, 2);

// ── the round trip. Save, then check what was saved: it must read as matched ────
// This is the assertion that pins dataFingerprint's exclusions. savedAt and
// dataLastUpdated move on every single save, so if either were compared, a file this
// device wrote one second ago would report as different from the screen that wrote it.
let savedBytes = null;
{
  console.log('--- save, then check the very bytes that were saved: matched ---');
  const { window, uploads, errors, restore } = boot({ cloudContent: OTHER_DEVICE });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  check('the Check now button exists', await press(window, /Check now/i) !== false);
  // That first check found the other device's file and, with nothing unsaved here,
  // applied it — 3.78. Now save the screen and re-check.
  await saveToCloud(window);
  const before = uploads.length;
  savedBytes = uploads[uploads.length - 1] || null;
  check('the save uploaded something', !!savedBytes);
  await press(window, /Check now/i);
  check('reports matched after a round trip', saysMatched(window), body(window).slice(0, 240));
  check('and uploads nothing more to say so', uploads.length === before,
    `${uploads.length - before} extra upload(s) — a check must not write`);
}

// ── matched content while the stamps say otherwise ─────────────────────────────
// The false alarm this feature exists to end: identical data, but lastPushedStamp is
// missing, so the stamp line insists "never saved to Drive from here".
{
  console.log('\n--- content identical but the stamps disagree: still matched, still no upload ---');
  const { window, uploads, errors, restore } = boot({
    cloudContent: savedBytes, cloudModified: CLOUD_MTIME, lastPushedStamp: undefined });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  check('the stamp line claims it was never saved', /never saved to Drive/i.test(body(window)),
    body(window).slice(0, 200));
  await press(window, /Check now/i);
  check('the content check says matched', saysMatched(window), body(window).slice(0, 240));
  check('nothing was uploaded', uploads.length === 0, `${uploads.length} upload(s)`);
  check('and no decision was demanded', !/Both copies changed|choose which/i.test(body(window)));
}

// ── only the cloud moved: applied, silently (3.78 must survive this) ───────────
{
  console.log('\n--- cloud moved, nothing unsaved here: applied without asking ---');
  const { window, store, uploads, errors, restore } = boot({
    cloudContent: OTHER_DEVICE, cloudModified: new Date(NOW - 60000).toISOString(),
    lastPushedStamp: LOCAL_EDIT });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  check('this device starts with its own task', /OnThisDevice/.test(stored(store)));
  await openPanel(window);
  await press(window, /Check now/i);
  check('the other device\'s data is now in browser storage', /OnTheOtherDevice/.test(stored(store)),
    'the download was never applied');
  check('no dialog appeared', !/Both copies changed|Save needs a decision/i.test(body(window)));
  check('and nothing was pushed back up', uploads.length === 0, `${uploads.length} upload(s)`);
}

// ── cloud moved AND a confirmed LINE mutation is waiting: the production
// incident this fix closes. Before it, this branch adopted the cloud copy
// and returned — never calling prepareLineMutations at all — so a confirmed
// delete/add/edit/status change from LINE sat forever as status="confirmed",
// applied_at=null, with nothing on screen ever telling the owner it silently
// never happened. Six call sites had this same gap (gsyncNow's cloud-adopt
// and "nothing changed" branches, gsyncSaveNow's cloud-adopt branch,
// gsyncAcceptCloud, gsyncAcceptLocal) — this is the one a user actually hit.
{
  console.log('\n--- cloud moved AND a LINE mutation is pending: applied, not silently skipped ---');
  const lineMutation = async (payload) => ({
    payload: { ...payload, personal: payload.personal.filter((t) => t.title !== 'OnTheOtherDevice') },
    mutationIds: ['line-mutation-1'], rejected: [],
  });
  const { window, store, uploads, errors, lineCalls, restore } = boot({
    cloudContent: OTHER_DEVICE, cloudModified: new Date(NOW - 60000).toISOString(),
    lastPushedStamp: LOCAL_EDIT, lineMutation });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  await press(window, /Check now/i);
  check('the LINE mutation was applied — the deleted task is gone from storage',
    !/OnTheOtherDevice/.test(stored(store)), 'the mutation never took effect');
  check('the merged result was uploaded back to Drive, not just adopted silently',
    uploads.length > 0, `${uploads.length} upload(s)`);
  check('the uploaded bytes reflect the mutation', !uploads.some((u) => /OnTheOtherDevice/.test(u)));
  check('completeMutations was called with the applied id',
    lineCalls.completeMutations.some((ids) => ids.includes('line-mutation-1')),
    JSON.stringify(lineCalls.completeMutations));
}

// ── both moved: the existing conflict dialog, unchanged ────────────────────────
{
  console.log('\n--- both sides moved: asks, and destroys nothing ---');
  const { window, store, uploads, errors, restore } = boot({
    cloudContent: OTHER_DEVICE, cloudModified: new Date(NOW - 60000).toISOString(),
    lastPushedStamp: undefined });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  await press(window, /Check now/i);
  check('it asks which copy keeps the master file', /Both copies changed/i.test(body(window)),
    body(window).slice(0, 240));
  check('this device\'s data is untouched', /OnThisDevice/.test(stored(store)));
  check('and nothing was uploaded', uploads.length === 0, `${uploads.length} upload(s)`);
}

// ── the case only a content check can find ─────────────────────────────────────
// Both stamps say "nothing moved here", and they are both wrong: the files differ.
// Before this, every code path believed the stamps and reported "already up to date".
// There is no honest direction to pick, so it has to ask.
{
  console.log('\n--- stamps say "nothing changed" but the files differ: must ask, not shrug ---');
  const { window, store, uploads, errors, restore } = boot({
    cloudContent: OTHER_DEVICE,
    cloudModified: CLOUD_MTIME, lastCloudModified: CLOUD_MTIME,   // cloud "has not moved"
    lastPushedStamp: LOCAL_EDIT });                                // local "has not moved"
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  await press(window, /Check now/i);
  const t = body(window);
  check('it does NOT claim to be up to date', !/Already up to date/i.test(t) && !saysMatched(window),
    t.slice(0, 240));
  check('it says the copies differ', /neither side recorded a change|differ/i.test(t), t.slice(0, 240));
  check('it asks rather than guessing a winner', /Both copies changed/i.test(t), t.slice(0, 240));
  check('nothing was applied', /OnThisDevice/.test(stored(store)));
  check('nothing was uploaded', uploads.length === 0, `${uploads.length} upload(s)`);
}

// ── the 10s poll ──────────────────────────────────────────────────────────────
// Real timers, so this block waits. Worth the seconds: the poll is the only reason a
// device left sitting on a desk notices another device at all, and the switch that
// turns it off is a promise ("manual only") that has to hold.
{
  console.log('\n--- auto-sync on: polls Drive about every 10s, and acts on what it finds ---');
  const { window, store, metaCalls, errors, restore } = boot({
    cloudContent: OTHER_DEVICE, cloudModified: new Date(NOW - 60000).toISOString(),
    lastPushedStamp: LOCAL_EDIT, auto: true });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  const at0 = metaCalls.n;
  await settle(11500);
  check('it asked Drive without anyone pressing anything', metaCalls.n > at0,
    `metadata calls went ${at0} → ${metaCalls.n}`);
  check('and brought the other device\'s save in', /OnTheOtherDevice/.test(stored(store)),
    'the poll noticed nothing');
}
{
  console.log('\n--- auto-sync off: "manual only" means no polling at all ---');
  const { window, metaCalls, errors, restore } = boot({
    cloudContent: OTHER_DEVICE, cloudModified: new Date(NOW - 60000).toISOString(),
    lastPushedStamp: LOCAL_EDIT, auto: false });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  const at0 = metaCalls.n;
  await settle(11500);
  check('Drive was not polled', metaCalls.n === at0, `metadata calls went ${at0} → ${metaCalls.n}`);
}

// ── the reported bug: the stamps agree, and they are lying ─────────────────────
// From the report, one panel two lines apart:
//     ✓ Google Drive has what is on screen
//     ● Unsaved changes
// with "This browser · saved 39 min ago · 08:37 PM" while it was 09:17 PM and the screen
// had been edited throughout. dataLastUpdated only moved where someone remembered to
// call setDataLastUpdated, so an edit path that forgot it was invisible — and invisible
// did not merely mislabel: localChanged is what decides whether to upload, so Drive kept
// the copy from forty minutes earlier.
//
// lastPushedFp is set to a value that cannot match anything real, which is exactly the
// state a forgotten setter produces: the stamps agree, the data does not.
{
  console.log('\n--- stamps agree but the data does not: must NOT claim to be in sync ---');
  const { window, uploads, errors, restore } = boot({
    cloudContent: OTHER_DEVICE, lastPushedStamp: LOCAL_EDIT, lastPushedFp: 'STALE-NEVER-MATCHES' });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  await openPanel(window);
  const t = body(window);
  check('the panel does NOT claim Drive has what is on screen',
    !/✓ Google Drive has what is on screen/.test(t), t.slice(0, 240));
  check('it says the screen is not on Drive yet', /not saved to Drive yet/.test(t), t.slice(0, 240));
  // The half that actually loses data: with the old timestamp test this device believed
  // it had nothing to upload, so pressing save uploaded nothing.
  await saveToCloud(window);
  check('pressing Save actually uploads', uploads.length >= 1,
    `${uploads.length} upload(s) — the screen would have stayed stranded`);
}

// ── Save to Cloud asks first, from either button ────────────────────────────────
// The action moved into the header, a few pixels from the notification bell, and it
// overwrites a file other devices read. Both buttons carry the same label, so both go
// through the same confirm — one label doing two different things depending on where it
// was pressed is a trap.
{
  console.log('\n--- Save to Cloud asks before it writes ---');
  const { window, uploads, errors, restore } = boot({ cloudContent: OTHER_DEVICE, lastPushedStamp: undefined });
  await settle();
  restore();
  if (errors.length) check('no runtime errors', false, errors[0]);
  // The header button is present before the Sync Manager is ever opened — that is the
  // whole point of moving it out.
  const header = [...window.document.querySelectorAll('button')]
    .find((b) => /Save to Cloud/.test(b.getAttribute('aria-label') || ''));
  check('a Save to Cloud button is in the header, panel unopened', !!header);
  if (header) {
    header.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(700);
  }
  const t = body(window);
  check('it asks instead of saving', /Save to Cloud\?/.test(t) && /Yes — save to Google Drive/.test(t),
    t.slice(0, 200));
  check('nothing is uploaded by asking', uploads.length === 0, `${uploads.length} upload(s)`);
  // No must be a real no: this is the assertion that would catch a confirm wired to
  // fire the save either way.
  await press(window, /No — change nothing/i, 700);
  check('"No" uploads nothing', uploads.length === 0, `${uploads.length} upload(s)`);
  if (header) {
    header.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle(700);
  }
  await press(window, /Yes — save to Google Drive/i, 1200);
  check('"Yes" uploads', uploads.length >= 1, `${uploads.length} upload(s)`);
}

// ── Stage 5A: cloud-adopt retries, races and reporting ─────────────────────────
const extractStage5aArrow = (source, declaration, following) => {
  const start = source.indexOf(declaration);
  check(`Stage 5A source contains ${declaration.trim()}`, start >= 0);
  if (start < 0) return null;
  const end = source.indexOf(following, start);
  check(`Stage 5A source terminates ${declaration.trim()}`, end > start);
  if (end < 0) return null;
  const prefix = declaration.slice(0, declaration.indexOf('async'));
  return source.slice(start + prefix.length, end + 5).trim().replace(/;$/, '');
};

{
  console.log('\n--- Stage 5A Full: revalidate → upload → checkpoint → complete → adopt ---');
  const fullSource = fs.readFileSync('src/App.jsx', 'utf8');
  const expression = extractStage5aArrow(fullSource,
    '  const importUseCloud = async () => {', '\n  };\n\n  // ── N104:');
  if (expression) {
    const names = ['importConflict','setImportConflict','prepareLineMutations','gsync','GDrive',
      'payloadDigest','dataFingerprint','setDataLastUpdated','persistGsync','window',
      'applyPayloadLive','publishLineSnapshot','setGsyncStatus','noteLineSaveResult','setGsyncError','note'];
    const factory = new Function(...names, `return (${expression});`);
    const cloud={personal:[{id:'cloud'}],work:[],events:[],notes:[],config:{}};
    const merged={...cloud,personal:[...cloud.personal,{id:'line'}]};
    const events=[];let checkpoint=null,adopted=null,persisted=null;
    const action=factory(
      {cloud:{payload:cloud,modifiedTime:'m1'}},
      value=>{events.push(value===null?'clear':'checkpoint');if(value?.completion)checkpoint=value},
      async payload=>{events.push('prepare');return{payload:merged,mutationIds:['id-1'],rejected:[{error:'expired'}]}},
      {fileId:'drive-1'},
      {getMeta:async()=>{events.push('meta');return{modifiedTime:'m1',etag:'etag-1'}},
       download:async()=>{events.push('download');return JSON.stringify(cloud)},
       updateFile:async(id,text,etag)=>{events.push('upload');check('Full writes with current ETag',etag==='etag-1');return{modifiedTime:'m2'}}},
      value=>JSON.stringify(value),value=>JSON.stringify(value),()=>events.push('stamp'),
      async value=>{events.push('persist');persisted=value},
      {__MTP_LINE__:{completeMutations:async()=>events.push('complete')}},
      async value=>{events.push('adopt');adopted=value},()=>events.push('publish'),
      value=>events.push('status:'+value),(rejected,fallback,kind)=>events.push(`result:${kind||''}:${fallback||''}:${rejected?.length||0}`),
      message=>events.push('error:'+message),(kind,message)=>events.push(`note:${kind}:${message}`));
    await action();
    check('Full revalidates before preparing',events.indexOf('download')<events.indexOf('prepare'),events.join(' → '));
    check('Full uploads before completion',events.indexOf('upload')<events.indexOf('complete'),events.join(' → '));
    check('Full checkpoints before completion',events.indexOf('checkpoint')<events.indexOf('complete'),events.join(' → '));
    check('Full completes before adoption',events.indexOf('complete')<events.indexOf('adopt'),events.join(' → '));
    check('Full adopts exact merged payload',adopted?.personal?.some(x=>x.id==='line'));
    check('Full persists returned modifiedTime',persisted?.lastCloudModified==='m2');

    const staleEvents=[];let refreshed=null;
    const stale=factory({cloud:{payload:cloud,modifiedTime:'m1'}},value=>{refreshed=value;staleEvents.push('refresh')},
      async()=>{staleEvents.push('prepare');return{payload:merged,mutationIds:['id-1'],rejected:[]}},
      {fileId:'drive-1'},
      {getMeta:async()=>({modifiedTime:'m2',etag:'etag-2'}),download:async()=>JSON.stringify({...cloud,notes:[{id:'new'}]}),updateFile:async()=>staleEvents.push('upload')},
      value=>JSON.stringify(value),value=>JSON.stringify(value),()=>{},async()=>{},
      {__MTP_LINE__:{completeMutations:async()=>staleEvents.push('complete')}},async()=>staleEvents.push('adopt'),()=>{},
      ()=>{},()=>{},()=>{},(kind)=>staleEvents.push('note:'+kind));
    await stale();
    check('Full stale Drive revision reopens conflict',!!refreshed?.cloud&&refreshed.cloud.modifiedTime==='m2');
    check('Full stale Drive revision is never overwritten',!staleEvents.includes('upload')&&!staleEvents.includes('prepare'),staleEvents.join(' → '));

    const firstEvents=[];let recoveryState=null;
    const ambiguous=factory({cloud:{payload:cloud,modifiedTime:'m1'}},value=>{if(value?.completion)recoveryState=value},
      async()=>({payload:merged,mutationIds:['id-1'],rejected:[{error:'expired'}]}),{fileId:'drive-1'},
      {getMeta:async()=>({modifiedTime:'m1',etag:'etag-1'}),download:async()=>JSON.stringify(cloud),updateFile:async()=>({modifiedTime:'m2'})},
      value=>JSON.stringify(value),value=>JSON.stringify(value),()=>{},async()=>{},
      {__MTP_LINE__:{completeMutations:async()=>{firstEvents.push('complete');throw Error('response lost')}}},
      async()=>firstEvents.push('adopt'),()=>{},value=>firstEvents.push('status:'+value),
      (rejected,fallback,kind)=>firstEvents.push(`result:${kind}:${fallback}:${rejected.length}`),()=>{},()=>{});
    await ambiguous();
    check('Full ambiguous completion keeps exact recovery checkpoint',!!recoveryState?.completion?.payload&&recoveryState.completion.mutationIds[0]==='id-1');
    check('Full ambiguous completion does not adopt early',!firstEvents.includes('adopt'),firstEvents.join(' → '));
    check('Full failure reports both later error and earlier rejection',firstEvents.some(x=>/response lost:1/.test(x)),firstEvents.join(' → '));

    const retryEvents=[];let retryAdopted=null;
    const retry=factory(recoveryState,()=>{},async()=>{retryEvents.push('prepare');throw Error('must not prepare')},{fileId:'drive-1'},
      {getMeta:async()=>{retryEvents.push('meta');throw Error('must not reread')},download:async()=>{},updateFile:async()=>retryEvents.push('upload')},
      value=>JSON.stringify(value),value=>JSON.stringify(value),()=>{},async()=>{},
      {__MTP_LINE__:{completeMutations:async ids=>{retryEvents.push('complete');check('Full retry uses exact IDs',ids[0]==='id-1')}}},
      async value=>{retryEvents.push('adopt');retryAdopted=value},()=>retryEvents.push('publish'),()=>{},()=>{},()=>{},()=>{});
    await retry();
    check('Full retry is completion-only',!retryEvents.includes('prepare')&&!retryEvents.includes('upload')&&!retryEvents.includes('meta'),retryEvents.join(' → '));
    check('Full retry adopts checkpoint payload',retryAdopted?.personal?.some(x=>x.id==='line'));
  }
}

{
  console.log('\n--- Stage 5A Mobile: durable completion-only checkpoint contracts ---');
  const mobile=fs.readFileSync('mobile/index.html','utf8');
  const showAt=mobile.indexOf('function showConflict(meta){');
  const pullAt=mobile.indexOf('  const pull=async()=>{',showAt);
  const pushAt=mobile.indexOf('\n  const push=async()=>{',pullAt);
  const pullBlock=mobile.slice(pullAt,pushAt);
  const resumeAt=mobile.indexOf('async function resumeLineCompletion(');
  const syncAt=mobile.indexOf('async function syncNow(',resumeAt);
  const resumeBlock=mobile.slice(resumeAt,syncAt);
  check('Mobile persists prepared checkpoint before upload',pullBlock.indexOf("phase:'prepared'")<pullBlock.indexOf('await driveUpdate'),pullBlock.slice(0,500));
  check('Mobile persists uploaded checkpoint before resume',pullBlock.indexOf("phase:'uploaded'")>pullBlock.indexOf('await driveUpdate')&&pullBlock.indexOf('resumeLineCompletion',pullBlock.indexOf("phase:'uploaded'"))>pullBlock.indexOf("phase:'uploaded'"));
  check('Mobile checkpoint carries exact IDs, payload and rejections',/payload,mutationIds:\[\.\.\.mutationIds\],rejected:\[\.\.\.rejected\]/.test(pullBlock));
  check('Mobile cloud language is passed explicitly',/prepareProfileForSave\(data,cloudLang\)/.test(pullBlock));
  check('Mobile resume completes checkpoint IDs',/complete\(checkpoint\.mutationIds\)/.test(resumeBlock));
  check('Mobile resume never prepares mutations',! /prepareMutations/.test(resumeBlock));
  check('Mobile uploaded phase never uploads again',resumeBlock.indexOf("if(checkpoint.phase!=='uploaded')")<resumeBlock.indexOf('driveUpdate'));
  check('Mobile adopts checkpoint payload only after completion',resumeBlock.indexOf('await complete')<resumeBlock.indexOf('state.data=normalizeProfile'));
  check('Mobile exact save avoids language restamp',/saveLocal\(false,true\)/.test(resumeBlock));
  check('Mobile clears checkpoint only after exact local save',resumeBlock.indexOf('saveLocal(false,true)')<resumeBlock.indexOf('persistLineCompletion(null)'));
  check('Mobile reports rejection on recovery failure',/lineSaveToastText\(rejected,state\.driveError\)/.test(resumeBlock));
  check('Mobile reports rejection on pull failure',/lineSaveToastText\(rejected,state\.driveError\)/.test(pullBlock));
  check('Mobile sync resumes checkpoint before preparing again',/resumeLineCompletion\(\{silent\}\)/.test(mobile));
}

console.log(fails.length ? `\nFAIL (${fails.length}): ${fails.join('; ')}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
