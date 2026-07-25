import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appSource = fs.readFileSync("src/App.jsx", "utf8");
const start = appSource.indexOf("const GDrive = (() => {");
const end = appSource.indexOf("\n})();", start) + "\n})();".length;
assert.ok(start >= 0 && end > start, "GDrive source is present");

function engine({online=true, appendScript=()=>{}, fetchImpl=async()=>{ throw new Error("fetch must not run in this test"); }}={}) {
  const elements = new Map();
  const document = {
    getElementById: id => elements.get(id) || null,
    createElement: () => ({
      remove() { elements.delete(this.id); },
      addEventListener(type, fn) { this[`on${type}`] = fn; },
    }),
    head: {
      appendChild(script) {
        elements.set(script.id, script);
        appendScript(script, elements);
      },
    },
  };
  const context = {
    console,
    document,
    navigator: {onLine: online},
    window: {},
    localStorage: {getItem:()=>null, setItem(){}, removeItem(){}},
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(
    `const GDRIVE_CLIENT_ID="test"; const GDRIVE_SCOPE="drive.file";\n${appSource.slice(start, end)}\nglobalThis.__engine=GDrive;`,
    context,
  );
  return {drive:context.__engine, context};
}

// A nested REST helper must never start GIS/OAuth after its token expires.
{
  let scripts = 0;
  const {drive} = engine({appendScript:()=>{ scripts++; }});
  await assert.rejects(drive.listFiles(), /session expired.*reconnect/i);
  assert.equal(scripts, 0, "expired REST call did not initiate interactive OAuth");
}

// Offline failures are specific and happen before either OAuth or fetch.
{
  const {drive} = engine({online:false});
  await assert.rejects(drive.listFiles(), /offline/i);
}

// A failed first GIS element is removed, then a fresh script succeeds once.
{
  let attempts = 0;
  const {drive, context} = engine({appendScript:script=>{
    attempts++;
    queueMicrotask(()=>{
      if (attempts === 1) script.onerror();
      else {
        const oauth2 = {
          initTokenClient(cfg) {
            return {requestAccessToken() { cfg.callback({access_token:"memory-only", expires_in:3600}); }};
          },
        };
        context.window.google = {accounts:{oauth2}};
        script.onload();
      }
    });
  }});
  assert.equal(await drive.signIn({}), "memory-only");
  assert.equal(attempts, 2, "GIS load retried exactly once");
}

// A token obtained by an explicit connect lists the authorized JSON files.
{
  const expected = [{id:"file-1", name:"Planner.json", modifiedTime:"2026-07-25T00:00:00Z"}];
  let context;
  const built = engine({
    appendScript:script=>queueMicrotask(()=>{
      context.window.google = {accounts:{oauth2:{
        initTokenClient:cfg=>({requestAccessToken:()=>cfg.callback({access_token:"connected", expires_in:3600})}),
      }}};
      script.onload();
    }),
    fetchImpl:async()=>({ok:true, status:200, json:async()=>({files:expected})}),
  });
  context = built.context;
  await built.drive.signIn({});
  assert.deepEqual(await built.drive.listFiles(), expected);
}

// UI regression assertions cover both independently rendered file-list paths.
assert.equal((appSource.match(/const \[listError, setListError\]/g)||[]).length, 2);
assert.equal((appSource.match(/onClick=\{reconnectAndReload\}/g)||[]).length, 2);
assert.equal((appSource.match(/Google’s <code>drive\.file<\/code>/g)||[]).length, 2);
assert.doesNotMatch(appSource, /catch\(e\)\{ \/\* surfaced via status \*\//);

console.log("N104 PASS: expiry, offline, GIS retry, visible recovery, and scope guidance");
