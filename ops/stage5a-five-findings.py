#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_between(text: str, start: str, end: str, replacement: str, *, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'{label}: start marker not found')
    b = text.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f'{label}: end marker not found')
    return text[:a] + replacement + text[b:]


def replace_once(text: str, old: str, new: str, *, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one anchor, found {count}')
    return text.replace(old, new, 1)


app = read('src/App.jsx')
full_start = '  // direction 2: the cloud wins — ignore the file, load what is on Drive\n'
full_end = '  // ── N104: open a JSON from Drive on the very first run ────────────────────\n'
full_replacement = r'''  // direction 2: the cloud wins — ignore the file, load what is on Drive
  // Stage 5A: prepare against the FINAL cloud payload. A two-phase local marker
  // makes upload/completion retries idempotent: a retry never prepares the same
  // confirmed mutation twice, and it adopts only the bytes known to be on Drive.
  const importUseCloud = async () => {
    const ic = importConflict; if (!ic) return;
    const fileId = gsync.fileId;
    const completionKey = fileId ? `mtp-stage5a-import-cloud-completion-v1:${fileId}` : "";
    let rejected = [];
    const readCompletion = () => {
      if (!completionKey) return null;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(completionKey) || "null");
        return parsed?.fileId === fileId && Array.isArray(parsed.mutationIds)
          && parsed.mutationIds.length && parsed.payload ? parsed : null;
      } catch {
        window.localStorage.removeItem(completionKey);
        return null;
      }
    };
    const writeCompletion = value => {
      window.localStorage.setItem(completionKey, JSON.stringify(value));
    };
    const clearCompletion = () => window.localStorage.removeItem(completionKey);
    const refreshConflict = (payload, modifiedTime, message) => {
      setImportConflict({ ...ic, cloud: { payload, modifiedTime: modifiedTime || "" } });
      setGsyncStatus("idle");
      note("later", message);
    };
    try {
      if (!fileId) throw new Error("No Google Drive file is linked.");
      let pending = readCompletion();
      if (pending) {
        rejected = Array.isArray(pending.rejected) ? pending.rejected : [];
        const currentMeta = await GDrive.getMeta(fileId);
        const currentPayload = JSON.parse(await GDrive.download(fileId));
        const currentFp = dataFingerprint(currentPayload);
        if (pending.stage === "prepared") {
          if (currentFp === pending.payloadFingerprint) {
            pending = { ...pending, stage: "uploaded",
              uploadedModifiedTime: currentMeta.modifiedTime || pending.uploadedModifiedTime || "" };
            writeCompletion(pending);
          } else if (currentFp !== pending.baseFingerprint
              || (pending.expectedModifiedTime && currentMeta.modifiedTime
                && currentMeta.modifiedTime !== pending.expectedModifiedTime)) {
            refreshConflict(currentPayload, currentMeta.modifiedTime,
              "Google Drive changed — review the refreshed Drive copy before continuing.");
            return;
          } else {
            const updated = await GDrive.updateFile(fileId, JSON.stringify(pending.payload, null, 2));
            pending = { ...pending, stage: "uploaded",
              uploadedModifiedTime: updated.modifiedTime || currentMeta.modifiedTime || "" };
            writeCompletion(pending);
          }
        } else if (currentFp !== pending.payloadFingerprint) {
          refreshConflict(currentPayload, currentMeta.modifiedTime,
            "Google Drive changed after the LINE update was uploaded — review the refreshed Drive copy.");
          return;
        }
        const complete = window.__MTP_LINE__?.completeMutations;
        if (typeof complete !== "function") throw new Error("LINE mutation completion is unavailable.");
        await complete(pending.mutationIds);
        const recoveredText = await GDrive.download(fileId);
        const recovered = JSON.parse(recoveredText);
        const recoveredFp = dataFingerprint(recovered);
        if (recoveredFp !== pending.payloadFingerprint) {
          const recoveredMeta = await GDrive.getMeta(fileId);
          refreshConflict(recovered, recoveredMeta.modifiedTime,
            "Google Drive changed while the LINE update was being completed — review the refreshed Drive copy.");
          return;
        }
        const stamp = pending.stamp || recovered.dataLastUpdated || new Date().toISOString();
        const recoveredMeta = await GDrive.getMeta(fileId);
        setDataLastUpdated(stamp);
        await persistGsync({ ...gsync, lastSyncAt: Date.now(),
          lastCloudModified: recoveredMeta.modifiedTime || pending.uploadedModifiedTime || "",
          lastPushedStamp: stamp, lastPushedFp: recoveredFp });
        await applyPayloadLive(recovered);
        void publishLineSnapshot(recovered);
        clearCompletion();
        setImportConflict(null);
        setGsyncStatus("synced");
        if (rejected.length) noteLineSaveResult(rejected);
        else note("saved", "Saved to cloud");
        return;
      }

      const before = await GDrive.getMeta(fileId);
      const latestText = await GDrive.download(fileId);
      const after = await GDrive.getMeta(fileId);
      let latest = JSON.parse(latestText);
      const changedDuringRead = !!before.modifiedTime && !!after.modifiedTime
        && before.modifiedTime !== after.modifiedTime;
      const advancedSinceDialog = !!ic.cloud.modifiedTime && !!after.modifiedTime
        && ic.cloud.modifiedTime !== after.modifiedTime;
      const contentChanged = dataFingerprint(latest) !== dataFingerprint(ic.cloud.payload);
      if (changedDuringRead || advancedSinceDialog || contentChanged) {
        if (changedDuringRead) latest = JSON.parse(await GDrive.download(fileId));
        refreshConflict(latest, after.modifiedTime || before.modifiedTime || ic.cloud.modifiedTime,
          "Google Drive changed — review the refreshed Drive copy before continuing.");
        return;
      }

      const prepared = await prepareLineMutations(latest);
      rejected = Array.isArray(prepared.rejected) ? prepared.rejected : [];
      const mutationIds = Array.isArray(prepared.mutationIds) ? prepared.mutationIds : [];
      const payload = prepared.payload;
      if (mutationIds.length) {
        const stamp = new Date().toISOString();
        const merged = { ...payload, dataLastUpdated: stamp };
        pending = { version: 1, fileId, stage: "prepared", mutationIds,
          payload: merged, rejected, stamp,
          expectedModifiedTime: after.modifiedTime || before.modifiedTime || ic.cloud.modifiedTime || "",
          baseFingerprint: dataFingerprint(latest),
          payloadFingerprint: dataFingerprint(merged), uploadedModifiedTime: "" };
        writeCompletion(pending);
        const updated = await GDrive.updateFile(fileId, JSON.stringify(merged, null, 2));
        pending = { ...pending, stage: "uploaded",
          uploadedModifiedTime: updated.modifiedTime || pending.expectedModifiedTime || "" };
        writeCompletion(pending);
        setDataLastUpdated(stamp);
        await persistGsync({ ...gsync, lastSyncAt: Date.now(),
          lastCloudModified: pending.uploadedModifiedTime,
          lastPushedStamp: stamp, lastPushedFp: pending.payloadFingerprint });
        const complete = window.__MTP_LINE__?.completeMutations;
        if (typeof complete !== "function") throw new Error("LINE mutation completion is unavailable.");
        await complete(mutationIds);
        await applyPayloadLive(merged);
        void publishLineSnapshot(merged);
        clearCompletion();
        setImportConflict(null);
        setGsyncStatus("synced");
        noteLineSaveResult(rejected);
        return;
      }
      await applyPayloadLive(payload);
      await persistGsync({ ...gsync, lastSyncAt: Date.now(),
        lastCloudModified: after.modifiedTime || before.modifiedTime || ic.cloud.modifiedTime });
      void publishLineSnapshot(payload);
      setImportConflict(null);
      setGsyncStatus("synced");
      if (rejected.length) noteLineSaveResult(rejected);
    } catch (error) {
      const message = error?.message || "Could not apply the Google Drive copy.";
      setGsyncStatus("error");
      setGsyncError(message);
      if (rejected.length) noteLineSaveResult(rejected);
      else note("error", message);
    }
  };

'''
app = replace_between(app, full_start, full_end, full_replacement, label='Full importUseCloud')
write('src/App.jsx', app)

mobile = read('mobile/index.html')
show_at = mobile.find('function showConflict(meta){')
if show_at < 0:
    raise SystemExit('Mobile showConflict not found')
pull_start = mobile.find('  const pull=async()=>{', show_at)
pull_end = mobile.find('  const push=async()=>{', pull_start)
if pull_start < 0 or pull_end < 0:
    raise SystemExit('Mobile pull block markers not found')
mobile_pull = r'''  const pull=async()=>{
    const fileId=state.sync.fileId,completionKey=`mtp-mobile-cloud-completion-v1:${fileId}`;
    let lineRejected=[];
    const readCompletion=()=>{try{const value=JSON.parse(window.localStorage.getItem(completionKey)||'null');return value?.fileId===fileId&&Array.isArray(value.mutationIds)&&value.mutationIds.length&&value.payload?value:null}catch(_){window.localStorage.removeItem(completionKey);return null}};
    const writeCompletion=value=>window.localStorage.setItem(completionKey,JSON.stringify(value));
    const clearCompletion=()=>window.localStorage.removeItem(completionKey);
    try{
      let pending=readCompletion();
      if(pending){
        lineRejected=Array.isArray(pending.rejected)?pending.rejected:[];
        const current=normalizeProfile(JSON.parse(await driveDownload(fileId))),currentJson=JSON.stringify(current);
        const target=normalizeProfile(pending.payload),targetJson=JSON.stringify(target);
        const baseJson=JSON.stringify(normalizeProfile(pending.basePayload||{}));
        if(pending.stage==='prepared'){
          if(currentJson===targetJson){
            pending={...pending,stage:'uploaded'};writeCompletion(pending);
          }else if(currentJson===baseJson){
            const r=await driveUpdate(fileId,JSON.stringify(target,null,2));
            pending={...pending,stage:'uploaded',modifiedTime:r.modifiedTime||pending.modifiedTime||meta.modifiedTime};writeCompletion(pending);
          }else throw new Error('Google Drive changed — review the conflict again before continuing.');
        }else if(currentJson!==targetJson)throw new Error('Google Drive changed after the LINE update upload — review the conflict again.');
        const complete=window.__MTP_LINE__?.completeMutations;
        if(typeof complete!=='function')throw new Error('LINE mutation completion is unavailable.');
        await complete(pending.mutationIds);
        const data=normalizeProfile(pending.payload);
        pushHistory('Resolve conflict from cloud');state.data=data;state.lang=data.config?.lang||state.lang;
        state.sync.lastCloudModified=pending.modifiedTime||meta.modifiedTime;state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
        saveLocal(false);void publishLineSnapshot(data);clearCompletion();pendingConflictMeta=null;closeModal();
        if(lineRejected.length)toast(lineSaveToastText(lineRejected,'↓ '+tr('synced')));
        render();return;
      }

      const text=await driveDownload(fileId),downloaded=normalizeProfile(JSON.parse(text));
      const linePrepared=window.__MTP_LINE__?.prepareMutations
        ?await window.__MTP_LINE__.prepareMutations(downloaded)
        :{payload:downloaded,mutationIds:[],rejected:[]};
      lineRejected=Array.isArray(linePrepared.rejected)?linePrepared.rejected:[];
      const mutationIds=Array.isArray(linePrepared.mutationIds)?linePrepared.mutationIds:[];
      let data=normalizeProfile(linePrepared.payload||downloaded),cloudModified=meta.modifiedTime;
      if(mutationIds.length){
        const cloudLanguage=data.config?.lang||state.lang;
        let payload=prepareProfileForSave(data);
        payload={...payload,config:{...(payload.config||{}),lang:cloudLanguage}};
        data=normalizeProfile(payload);
        pending={version:1,fileId,stage:'prepared',mutationIds,payload:data,
          basePayload:downloaded,rejected:lineRejected,modifiedTime:meta.modifiedTime};
        writeCompletion(pending);
        const r=await driveUpdate(fileId,JSON.stringify(data,null,2));
        cloudModified=r.modifiedTime||meta.modifiedTime;
        pending={...pending,stage:'uploaded',modifiedTime:cloudModified};writeCompletion(pending);
        const complete=window.__MTP_LINE__?.completeMutations;
        if(typeof complete!=='function')throw new Error('LINE mutation completion is unavailable.');
        await complete(mutationIds);
        clearCompletion();
      }
      pushHistory('Resolve conflict from cloud');state.data=data;state.lang=state.data.config?.lang||state.lang;
      state.sync.lastCloudModified=cloudModified;state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
      saveLocal(false);void publishLineSnapshot(data);pendingConflictMeta=null;closeModal();
      if(lineRejected.length)toast(lineSaveToastText(lineRejected,'↓ '+tr('synced')));
      render();
    }catch(e){const message=e?.message||'Could not load the Drive copy.';state.driveError=message;
      if(lineRejected.length)toast(lineSaveToastText(lineRejected,message));else toast(message);render()}
  };
'''
mobile = mobile[:pull_start] + mobile_pull + mobile[pull_end:]

def refresh_mobile_csp(source: str) -> str:
    import base64
    scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', source)
    if not scripts:
        raise SystemExit('Mobile CSP: no inline scripts found')
    hashes = ["'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'" for s in scripts]
    meta = re.search(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)', source)
    if not meta:
        raise SystemExit('Mobile CSP meta not found')
    policy = meta.group(2)
    match = re.search(r'(script-src\s+)([^;]+)', policy)
    if not match:
        raise SystemExit('Mobile script-src not found')
    directives = [token for token in match.group(2).split() if not token.startswith("'sha256-")]
    new_script_src = match.group(1) + ' '.join(directives + hashes)
    policy = policy[:match.start()] + new_script_src + policy[match.end():]
    return source[:meta.start()] + meta.group(1) + policy + meta.group(3) + source[meta.end():]

mobile = refresh_mobile_csp(mobile)
write('mobile/index.html', mobile)

test = read('build/sync-content-check.test.mjs')
test_start = '// ── Stage 5A: final cloud-adopt decision points must preserve LINE changes ─────\n'
test_end = "console.log(fails.length ? `\\nFAIL (${fails.length}): ${fails.join('; ')}` : '\\nPASS');\n"
new_tests = r'''// ── Stage 5A review remediation: race + ambiguous-completion recovery ───────────
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
const memoryStorage = () => {
  const values = new Map();
  return {getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};
};

{
  console.log('\n--- Stage 5A Full: stale Drive revision reopens the choice ---');
  const fullSource=fs.readFileSync('src/App.jsx','utf8');
  const expression=extractStage5aArrow(fullSource,'  const importUseCloud = async () => {','\n  };\n\n  // ── N104:');
  if(expression){
    const names=['importConflict','setImportConflict','prepareLineMutations','gsync','GDrive','dataFingerprint',
      'setDataLastUpdated','persistGsync','window','applyPayloadLive','publishLineSnapshot','setGsyncStatus',
      'noteLineSaveResult','setGsyncError','note'];
    const factory=new Function(...names,`return (${expression});`);
    const cached={personal:[{id:'old'}],work:[],events:[],notes:[],config:{}};
    const newer={personal:[{id:'new'}],work:[],events:[],notes:[],config:{}};
    const events=[];let refreshed=null,prepareCalls=0;
    const action=factory({cloud:{payload:cached,modifiedTime:'m1'}},v=>{refreshed=v;events.push('refresh')},
      async()=>{prepareCalls++;return{payload:newer,mutationIds:[],rejected:[]}}, {fileId:'f1'},
      {getMeta:async()=>({modifiedTime:'m2'}),download:async()=>JSON.stringify(newer),updateFile:async()=>{events.push('upload')}},
      value=>JSON.stringify(value),()=>events.push('stamp'),async()=>events.push('persist'),
      {localStorage:memoryStorage(),__MTP_LINE__:{completeMutations:async()=>events.push('complete')}},
      async()=>events.push('adopt'),()=>events.push('publish'),v=>events.push(`status:${v}`),
      ()=>events.push('result'),()=>events.push('error'),(kind)=>events.push(`note:${kind}`));
    await action();
    check('Full stale revision refreshes the conflict',refreshed?.cloud?.payload?.personal?.[0]?.id==='new');
    check('Full stale revision performs no preparation or write',prepareCalls===0&&!events.includes('upload'),events.join(' → '));
    check('Full stale revision remains unresolved',!events.includes('adopt')&&events.includes('note:later'),events.join(' → '));
  }
}

{
  console.log('\n--- Stage 5A Full: lost completion response resumes without reapplying ---');
  const fullSource=fs.readFileSync('src/App.jsx','utf8');
  const expression=extractStage5aArrow(fullSource,'  const importUseCloud = async () => {','\n  };\n\n  // ── N104:');
  if(expression){
    const names=['importConflict','setImportConflict','prepareLineMutations','gsync','GDrive','dataFingerprint',
      'setDataLastUpdated','persistGsync','window','applyPayloadLive','publishLineSnapshot','setGsyncStatus',
      'noteLineSaveResult','setGsyncError','note'];
    const factory=new Function(...names,`return (${expression});`);
    const base={personal:[{id:'cloud'}],work:[],events:[],notes:[],config:{}};
    const merged={...base,personal:[...base.personal,{id:'line-once'}]};
    const storage=memoryStorage(),events=[];let drive=base,mtime='m1',prepareCalls=0,uploads=0,completes=0,adopted=null;
    const conflict={cloud:{payload:base,modifiedTime:'m1'}};
    const makeAction=()=>factory(conflict,()=>events.push('clear'),async()=>{prepareCalls++;return{payload:merged,mutationIds:['mu1'],rejected:[]}},
      {fileId:'f1'}, {getMeta:async()=>({modifiedTime:mtime}),download:async()=>JSON.stringify(drive),
        updateFile:async(_id,text)=>{uploads++;drive=JSON.parse(text);mtime='m2';return{modifiedTime:mtime}}},
      value=>JSON.stringify(value),()=>events.push('stamp'),async()=>events.push('persist'),
      {localStorage:storage,__MTP_LINE__:{completeMutations:async()=>{completes++;if(completes===1)throw new Error('completion response lost')}}},
      async value=>{adopted=value;events.push('adopt')},()=>events.push('publish'),v=>events.push(`status:${v}`),
      ()=>events.push('result'),m=>events.push(`error:${m}`),(kind)=>events.push(`note:${kind}`));
    await makeAction()();
    check('Full first attempt uploaded exact merged payload once',uploads===1&&drive.personal.filter(x=>x.id==='line-once').length===1);
    check('Full ambiguous completion retains a durable marker',storage.values.size===1);
    check('Full ambiguous completion does not adopt or clear',!events.includes('adopt')&&!events.includes('clear'),events.join(' → '));
    await makeAction()();
    check('Full retry does not prepare or upload again',prepareCalls===1&&uploads===1,`prepare=${prepareCalls} upload=${uploads}`);
    check('Full retry repeats only idempotent completion',completes===2);
    check('Full retry adopts the uploaded bytes exactly once',adopted?.personal?.filter(x=>x.id==='line-once').length===1);
    check('Full retry clears durable marker after success',storage.values.size===0);
  }
}

{
  console.log('\n--- Stage 5A Full: rejected rows remain visible when upload fails ---');
  const fullSource=fs.readFileSync('src/App.jsx','utf8');
  const expression=extractStage5aArrow(fullSource,'  const importUseCloud = async () => {','\n  };\n\n  // ── N104:');
  if(expression){
    const names=['importConflict','setImportConflict','prepareLineMutations','gsync','GDrive','dataFingerprint',
      'setDataLastUpdated','persistGsync','window','applyPayloadLive','publishLineSnapshot','setGsyncStatus',
      'noteLineSaveResult','setGsyncError','note'];
    const factory=new Function(...names,`return (${expression});`);
    const base={personal:[],work:[],events:[],notes:[],config:{}},events=[];let surfaced=0,error='';
    const action=factory({cloud:{payload:base,modifiedTime:'m1'}},()=>{},async()=>({payload:base,mutationIds:['m1'],rejected:[{error:'expired'}]}),
      {fileId:'f1'}, {getMeta:async()=>({modifiedTime:'m1'}),download:async()=>JSON.stringify(base),updateFile:async()=>{throw new Error('upload failed')}},
      value=>JSON.stringify(value),()=>{},async()=>{}, {localStorage:memoryStorage(),__MTP_LINE__:{completeMutations:async()=>{}}},
      async()=>events.push('adopt'),()=>{},()=>{},rejected=>{surfaced=rejected.length},message=>{error=message},()=>{});
    await action();
    check('Full failed upload surfaces the one-time rejection',surfaced===1);
    check('Full failed upload also retains the later error',error==='upload failed');
  }
}

{
  console.log('\n--- Stage 5A Mobile: completion retry is idempotent and keeps cloud language ---');
  const mobileSource=fs.readFileSync('mobile/index.html','utf8');
  const scoped=mobileSource.slice(mobileSource.indexOf('function showConflict(meta){'));
  const expression=extractStage5aArrow(scoped,'  const pull=async()=>{','\n  };\n  const push=async()=>{');
  if(expression){
    const names=['state','driveDownload','normalizeProfile','window','driveUpdate','prepareProfileForSave','pushHistory',
      'saveLocal','publishLineSnapshot','pendingConflictMeta','closeModal','lineSaveToastText','toast','tr','render','meta'];
    const factory=new Function(...names,`return (${expression});`);
    const local={personal:[{id:'local'}],work:[],events:[],notes:[],config:{lang:'EN'}};
    const base={personal:[{id:'cloud'}],work:[],events:[],notes:[],config:{lang:'TH'}};
    const merged={...base,personal:[...base.personal,{id:'line-once'}]};
    const storage=memoryStorage(),state={data:local,lang:'EN',sync:{fileId:'f1',dirty:true},driveError:''};
    let drive=base,prepareCalls=0,uploads=0,completes=0,closes=0;const toasts=[];
    const makePull=()=>factory(state,async()=>JSON.stringify(drive),value=>JSON.parse(JSON.stringify(value)),
      {localStorage:storage,__MTP_LINE__:{prepareMutations:async()=>{prepareCalls++;return{payload:merged,mutationIds:['m1'],rejected:[{error:'expired'}]}},
        completeMutations:async()=>{completes++;if(completes===1)throw new Error('completion response lost')}}},
      async(_id,text)=>{uploads++;drive=JSON.parse(text);return{modifiedTime:'m2'}},
      value=>({...value,config:{...(value.config||{}),lang:state.lang},savedAt:'saved'}),()=>{},()=>{},()=>{},
      {},()=>{closes++},(rejected,baseText)=>`${baseText}|rejected:${rejected.length}`,text=>toasts.push(text),key=>key,()=>{},
      {modifiedTime:'m1'});
    await makePull()();
    check('Mobile first attempt writes exactly one mutation',uploads===1&&drive.personal.filter(x=>x.id==='line-once').length===1);
    check('Mobile upload preserves downloaded cloud language',drive.config?.lang==='TH',JSON.stringify(drive.config));
    check('Mobile completion failure leaves local data and conflict untouched',state.data===local&&closes===0);
    check('Mobile completion failure surfaces rejection and later error',toasts.some(x=>/completion response lost/.test(x)&&/rejected:1/.test(x)),toasts.join(' | '));
    check('Mobile completion failure retains durable marker',storage.values.size===1);
    await makePull()();
    check('Mobile retry skips prepare and upload',prepareCalls===1&&uploads===1,`prepare=${prepareCalls} upload=${uploads}`);
    check('Mobile retry repeats only completion',completes===2);
    check('Mobile retry adopts one mutation with cloud language',state.data.personal.filter(x=>x.id==='line-once').length===1&&state.lang==='TH');
    check('Mobile retry closes and clears marker only after success',closes===1&&storage.values.size===0);
  }
}

'''
test = replace_between(test, test_start, test_end, new_tests, label='Stage5A runtime tests')
write('build/sync-content-check.test.mjs', test)

contract = read('build/line-contract.test.mjs')
contract_start = 'const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");\n'
contract_end = 'assert.doesNotMatch(browserBridge, /LINE_CHANNEL_(?:SECRET|ACCESS_TOKEN)/);\n'
new_contract = r'''const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");
const fullImportRevalidateAt = full.indexOf("await GDrive.getMeta(fileId)", fullImportCloudAt);
const fullImportDownloadAt = full.indexOf("await GDrive.download(fileId)", fullImportRevalidateAt);
const fullImportPrepareAt = full.indexOf("prepareLineMutations(latest)", fullImportDownloadAt);
const fullImportMarkerAt = full.indexOf('stage: "prepared"', fullImportPrepareAt);
const fullImportUploadAt = full.indexOf("await GDrive.updateFile", fullImportMarkerAt);
const fullImportCompleteAt = full.indexOf("await complete(mutationIds)", fullImportUploadAt);
const fullImportAdoptAt = full.indexOf("await applyPayloadLive(merged)", fullImportCompleteAt);
const fullImportClearAt = full.indexOf("clearCompletion()", fullImportAdoptAt);
assert.ok(fullImportCloudAt >= 0 && fullImportRevalidateAt > fullImportCloudAt
  && fullImportDownloadAt > fullImportRevalidateAt && fullImportPrepareAt > fullImportDownloadAt
  && fullImportMarkerAt > fullImportPrepareAt && fullImportUploadAt > fullImportMarkerAt
  && fullImportCompleteAt > fullImportUploadAt && fullImportAdoptAt > fullImportCompleteAt
  && fullImportClearAt > fullImportAdoptAt,
"Full import cloud-wins must revalidate, persist a marker, upload, complete, adopt, then clear");
const fullImportBlock = full.slice(fullImportCloudAt, full.indexOf("// ── N104:", fullImportCloudAt));
assert.match(fullImportBlock, /mtp-stage5a-import-cloud-completion-v1/);
assert.match(fullImportBlock, /currentFp !== pending\.payloadFingerprint/);
assert.match(fullImportBlock, /if \(rejected\.length\) noteLineSaveResult\(rejected\)/);

const mobileConflictAt = mobile.indexOf("function showConflict(meta){");
const mobileConflictDownloadAt = mobile.indexOf("const text=await driveDownload", mobileConflictAt);
const mobileConflictPrepareAt = mobile.indexOf("prepareMutations(downloaded)", mobileConflictDownloadAt);
const mobileConflictMarkerAt = mobile.indexOf("stage:'prepared'", mobileConflictPrepareAt);
const mobileConflictUploadAt = mobile.indexOf("await driveUpdate", mobileConflictMarkerAt);
const mobileConflictCompleteAt = mobile.indexOf("await complete(mutationIds)", mobileConflictUploadAt);
const mobileConflictAdoptAt = mobile.indexOf("pushHistory('Resolve conflict from cloud')", mobileConflictCompleteAt);
const mobileConflictCloseAt = mobile.indexOf("clearCompletion();pendingConflictMeta=null;closeModal()", mobileConflictAdoptAt);
assert.ok(mobileConflictAt >= 0 && mobileConflictDownloadAt > mobileConflictAt
  && mobileConflictPrepareAt > mobileConflictDownloadAt && mobileConflictMarkerAt > mobileConflictPrepareAt
  && mobileConflictUploadAt > mobileConflictMarkerAt && mobileConflictCompleteAt > mobileConflictUploadAt
  && mobileConflictAdoptAt > mobileConflictCompleteAt && mobileConflictCloseAt > mobileConflictAdoptAt,
"Mobile cloud pull must persist a marker, upload, complete, adopt, then close");
const mobileConflictBlock = mobile.slice(mobileConflictAt, mobile.indexOf("function bindSync(){", mobileConflictAt));
assert.match(mobileConflictBlock, /mtp-mobile-cloud-completion-v1/);
assert.match(mobileConflictBlock, /lang:cloudLanguage/);
assert.match(mobileConflictBlock, /if\(lineRejected\.length\)toast\(lineSaveToastText\(lineRejected,message\)\)/);

'''
contract = replace_between(contract, contract_start, contract_end, new_contract, label='LINE static contracts')
write('build/line-contract.test.mjs', contract)

context = read('PROJECT_CONTEXT.md')
row_re = re.compile(r'^\| LINE-CLOUD-ADOPT-1 \|.*$', re.M)
match = row_re.search(context)
if not match:
    raise SystemExit('PROJECT_CONTEXT LINE-CLOUD-ADOPT-1 row not found')
new_row = '| LINE-CLOUD-ADOPT-1 | A cloud-wins decision could overwrite a pending confirmed LINE mutation, retry an ambiguous completion into a duplicate add, or overwrite a Drive revision newer than the dialog | Final cloud-adopt paths lacked click-time Drive revalidation and durable post-upload completion state | Full revalidates current Drive bytes/mtime before write; Full and Mobile persist a two-phase prepared/uploaded marker with the exact payload and mutation IDs, retry completion without re-preparing, preserve the selected cloud language, and surface rejected rows even when a later step fails | Runtime lost-response, stale-revision, language and rejection regressions plus static ordering/CSP contracts; exact-head CI and independent review required | `build/sync-content-check.test.mjs`; `build/line-contract.test.mjs`; `npm test`; `npm run verify`; `npm run scan-secrets` |'
context = context[:match.start()] + new_row + context[match.end():]
write('PROJECT_CONTEXT.md', context)

changelog = read('CHANGELOG.md')
anchor = '- Added success/failure runtime coverage plus Full/Mobile ordering contracts.\n'
addition = ('- Added click-time Drive revalidation so a stale conflict dialog cannot overwrite a newer Drive revision.\n'
            '- Added durable two-phase completion markers so lost completion responses resume without reapplying an add/edit/delete mutation.\n'
            '- Preserved the selected cloud profile language and retained rejected-mutation feedback on later failures.\n')
if addition.strip() not in changelog:
    changelog = replace_once(changelog, anchor, anchor + addition, label='CHANGELOG Stage5A anchor')
write('CHANGELOG.md', changelog)

stage = read('docs/STAGE5A_NO_MIGRATION_RELEASE.md')
heading = '## Review remediation — five findings\n'
if heading not in stage:
    stage += r'''

## Review remediation — five findings

Status: **IMPLEMENTED / EXACT-HEAD CI AND INDEPENDENT REVIEW REQUIRED**

The release-gate review found three P1 and two P2 gaps in the first candidate.
The remediation remains source-only and no-migration:

1. Full re-reads Drive metadata and content at the final cloud-wins click and
   reopens the decision when the reviewed revision has advanced.
2. Full and Mobile persist a two-phase `prepared` / `uploaded` local completion
   marker before Drive write and before mutation completion. A retry reuses the
   exact payload and IDs, so an ambiguous completion response cannot create a
   second UUID for an `add` mutation.
3. Full recovery verifies that Drive still contains the uploaded fingerprint
   before retrying completion or adopting locally.
4. Mobile explicitly restores the selected downloaded profile language after
   `prepareProfileForSave`, preventing the losing local language from replacing
   it.
5. Both clients preserve rejected-mutation feedback when upload or completion
   later fails.

Regression coverage executes stale-revision, lost-response retry, duplicate-add,
language preservation and rejection-plus-failure cases. The Mobile CSP hashes are
recalculated from the final inline scripts. No Database, migration, Storage,
Auth, RLS, provider, secret, backup/recovery, import/reconciliation, activation,
deployment or Production operation is included. Merge remains a separate Owner
Critical Gate.
'''
write('docs/STAGE5A_NO_MIGRATION_RELEASE.md', stage)

print('Stage 5A five-finding remediation applied')
