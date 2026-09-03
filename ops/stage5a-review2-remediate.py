#!/usr/bin/env python3
"""Deterministically remediate the second Stage 5A exact-head review.

Temporary branch-only tooling. It changes only the approved Full/Mobile source,
focused tests, and durable release records. It performs no network, provider,
database, migration, Storage, Auth, RLS, secret, deploy, backup, or Production
operation.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str) -> None:
    text = read(path)
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{path}: missing start marker {start_marker!r}")
    if text.find(start_marker, start + 1) >= 0:
        raise SystemExit(f"{path}: non-unique start marker {start_marker!r}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{path}: missing end marker {end_marker!r}")
    write(path, text[:start] + replacement + text[end:])


def insert_after_in_function(path: str, function_marker: str, target: str, insertion: str) -> None:
    text = read(path)
    start = text.find(function_marker)
    if start < 0:
        raise SystemExit(f"{path}: missing function marker {function_marker!r}")
    end = text.find("\n  };", start)
    if end < 0:
        raise SystemExit(f"{path}: function end missing for {function_marker!r}")
    pos = text.find(target, start, end)
    if pos < 0:
        raise SystemExit(f"{path}: target missing in {function_marker!r}: {target!r}")
    if insertion.strip() in text[start:end]:
        raise SystemExit(f"{path}: insertion already present in {function_marker!r}")
    pos += len(target)
    write(path, text[:pos] + insertion + text[pos:])


# ── Full app: durable prepared/uploaded checkpoint and completion-only recovery ─
replace_once(
    "src/App.jsx",
    'const GSYNC_KEY = "lifeplanner-gdrive-sync-v1"; // {fileId, fileName, lastSyncAt, lastCloudModified, lastPushedStamp}\n',
    'const GSYNC_KEY = "lifeplanner-gdrive-sync-v1"; // {fileId, fileName, lastSyncAt, lastCloudModified, lastPushedStamp}\n'
    'const FULL_LINE_COMPLETION_KIND = "import-cloud-conflict-v2";\n',
)

replace_once(
    "src/App.jsx",
    '''  const persistGsync = async (next) => {
    setGsync(next);
    try{ await window.storage.set(pk(GSYNC_KEY), JSON.stringify(next)); }catch{}
  };
''',
    '''  const persistGsync = async (next) => {
    setGsync(next);
    try{ await window.storage.set(pk(GSYNC_KEY), JSON.stringify(next)); }catch{}
  };

  // A post-upload LINE completion checkpoint is a correctness record, not a UI
  // preference. Unlike ordinary sync metadata, failure to persist it must stop
  // before queue completion so a reload can never re-prepare an already-uploaded
  // `add` and create a duplicate task.
  const persistGsyncStrict = async (next) => {
    await window.storage.set(pk(GSYNC_KEY), JSON.stringify(next));
    setGsync(next);
    return next;
  };
  const persistFullLineCompletion = async (checkpoint, base=gsync) => {
    const next={...base};
    if(checkpoint) next.lineCompletion=checkpoint; else delete next.lineCompletion;
    return persistGsyncStrict(next);
  };
''',
)

replace_once(
    "src/App.jsx",
    '''  const prepareLineMutations = async payload => {
    const bridge=window.__MTP_LINE__;
    return bridge?.prepareMutations?bridge.prepareMutations(payload):{payload,mutationIds:[]};
  };

  const refreshLineStatus = async () => {
''',
    '''  const prepareLineMutations = async payload => {
    const bridge=window.__MTP_LINE__;
    return bridge?.prepareMutations?bridge.prepareMutations(payload):{payload,mutationIds:[]};
  };

  const reopenFullLineCompletionConflict = async (checkpoint, rejected, message) => {
    const meta=await GDrive.getMeta(checkpoint.fileId);
    if(meta.trashed) throw new Error("The cloud file was deleted.");
    const text=await GDrive.download(checkpoint.fileId);
    const payload=JSON.parse(text);
    await persistFullLineCompletion(null);
    setImportConflict({
      parsed:checkpoint.localPayload||buildSavePayload(),
      fileName:checkpoint.localFileName||gsync.localName||"opened file",
      handle:null,
      cloud:{payload,modifiedTime:meta.modifiedTime||"",etag:meta.etag||""},
    });
    setGsyncStatus("idle"); setGsyncError("");
    noteLineSaveResult(rejected,message,rejected.length?"partial":"later");
  };

  // Resume a durable checkpoint before any normal sync operation. Prepared
  // checkpoints revalidate/rebase before upload; uploaded checkpoints never run
  // mutation preparation again and retry only the idempotent completion RPC.
  const finishFullLineCompletion = async (provided=null) => {
    let checkpoint=provided||gsync.lineCompletion;
    if(!checkpoint||checkpoint.kind!==FULL_LINE_COMPLETION_KIND
        ||!checkpoint.fileId||checkpoint.fileId!==gsync.fileId) return false;
    const rejected=Array.isArray(checkpoint.rejected)?checkpoint.rejected:[];
    try{
      if(checkpoint.phase!=="uploaded"){
        const meta=await GDrive.getMeta(checkpoint.fileId);
        if(meta.trashed) throw new Error("The cloud file was deleted.");
        const currentText=await GDrive.download(checkpoint.fileId);
        const currentPayload=JSON.parse(currentText);
        const currentDigest=payloadDigest(currentPayload);
        const targetDigest=payloadDigest(checkpoint.payload);
        const alreadyUploaded=currentDigest===targetDigest;
        const etagChanged=!!checkpoint.baseEtag&&!!meta.etag&&meta.etag!==checkpoint.baseEtag;
        const timeChanged=(meta.modifiedTime||"")!==(checkpoint.baseModifiedTime||"");
        const contentChanged=!!checkpoint.baseDigest&&currentDigest!==checkpoint.baseDigest;
        if(!alreadyUploaded&&(etagChanged||timeChanged||contentChanged)){
          await reopenFullLineCompletionConflict(checkpoint,rejected,
            "Google Drive changed — review the updated cloud copy before choosing again");
          return true;
        }
        if(!alreadyUploaded){
          let updated;
          try{
            updated=await GDrive.updateFile(checkpoint.fileId,
              JSON.stringify(checkpoint.payload,null,2),meta.etag||checkpoint.baseEtag||"");
          }catch(error){
            const message=error?.message||"Could not update Google Drive.";
            if(/Drive error 412|Precondition Failed/i.test(message)){
              await reopenFullLineCompletionConflict(checkpoint,rejected,
                "Google Drive changed — review the updated cloud copy before choosing again");
              return true;
            }
            throw error;
          }
          checkpoint={...checkpoint,phase:"uploaded",
            modifiedTime:updated.modifiedTime||meta.modifiedTime||""};
        }else{
          checkpoint={...checkpoint,phase:"uploaded",
            modifiedTime:meta.modifiedTime||checkpoint.modifiedTime||""};
        }
        await persistFullLineCompletion(checkpoint);
      }

      const complete=window.__MTP_LINE__?.completeMutations;
      if(typeof complete!=="function") throw new Error("LINE sync module is not ready. Reload and try again.");
      await complete(checkpoint.mutationIds);
      setDataLastUpdated(checkpoint.stamp);
      await applyPayloadLive(checkpoint.payload);
      void publishLineSnapshot(checkpoint.payload);
      const next={...gsync,lastSyncAt:Date.now(),
        lastCloudModified:checkpoint.modifiedTime||checkpoint.baseModifiedTime||"",
        lastPushedStamp:checkpoint.stamp,lastPushedFp:checkpoint.fingerprint};
      delete next.lineCompletion;
      await persistGsyncStrict(next);
      setImportConflict(null);
      setGsyncStatus("synced"); setGsyncError("");
      noteLineSaveResult(rejected);
    }catch(error){
      const message=error?.message||"LINE completion recovery failed.";
      setGsyncStatus("error"); setGsyncError(message);
      noteLineSaveResult(rejected,message,"error");
    }
    return true;
  };

  const refreshLineStatus = async () => {
''',
)

for marker in (
    "  const gsyncPush = async ({silent=false}={}) => {",
    "  const gsyncPull = async ({force=false}={}) => {",
    "  const gsyncNow = async () => {",
    "  const gsyncSaveNow = async () => {",
):
    insert_after_in_function(
        "src/App.jsx", marker, "    try {\n",
        "      if(await finishFullLineCompletion()) return;\n",
    )

full_import = '''  const importUseCloud = async () => {
    const ic=importConflict;
    const durable=gsync.lineCompletion;
    if(durable){ await finishFullLineCompletion(durable); return; }
    if(!ic) return;
    let rejected=[];
    try{
      if(!gsync.fileId) throw new Error("No Google Drive file is linked.");
      const latestMeta=await GDrive.getMeta(gsync.fileId);
      if(latestMeta.trashed) throw new Error("The cloud file was deleted.");
      const latestText=await GDrive.download(gsync.fileId);
      const latestPayload=JSON.parse(latestText);
      const driveAdvanced=(latestMeta.modifiedTime||"")!==(ic.cloud.modifiedTime||"")
        ||payloadDigest(latestPayload)!==payloadDigest(ic.cloud.payload);
      if(driveAdvanced){
        setImportConflict({...ic,completion:null,
          cloud:{payload:latestPayload,modifiedTime:latestMeta.modifiedTime||"",etag:latestMeta.etag||""}});
        setGsyncStatus("idle"); setGsyncError("");
        note("later","Google Drive changed — review the updated cloud copy before choosing again");
        return;
      }

      const prepared=await prepareLineMutations(latestPayload);
      rejected=Array.isArray(prepared.rejected)?prepared.rejected:[];
      const mutationIds=Array.isArray(prepared.mutationIds)?prepared.mutationIds:[];
      if(mutationIds.length){
        const stamp=new Date().toISOString();
        const payload={...prepared.payload,dataLastUpdated:stamp};
        const checkpoint={kind:FULL_LINE_COMPLETION_KIND,phase:"prepared",
          fileId:gsync.fileId,baseModifiedTime:latestMeta.modifiedTime||"",
          baseEtag:latestMeta.etag||"",baseDigest:payloadDigest(latestPayload),
          payload,mutationIds:[...mutationIds],rejected:[...rejected],stamp,
          fingerprint:dataFingerprint(payload),localPayload:ic.parsed,
          localFileName:ic.fileName||"opened file"};
        await persistFullLineCompletion(checkpoint);
        setImportConflict({...ic,cloud:{payload:latestPayload,
          modifiedTime:latestMeta.modifiedTime||"",etag:latestMeta.etag||""},completion:checkpoint});
        await finishFullLineCompletion(checkpoint);
        return;
      }

      await applyPayloadLive(latestPayload);
      await persistGsync({...gsync,lastSyncAt:Date.now(),
        lastCloudModified:latestMeta.modifiedTime||""});
      void publishLineSnapshot(latestPayload);
      setImportConflict(null);
      setGsyncStatus("synced"); setGsyncError("");
      if(rejected.length) noteLineSaveResult(rejected);
    }catch(error){
      const message=error?.message||"Could not apply the Google Drive copy.";
      if(/Drive error 412|Precondition Failed/i.test(message)){
        try{
          const meta=await GDrive.getMeta(gsync.fileId);
          const payload=JSON.parse(await GDrive.download(gsync.fileId));
          await persistFullLineCompletion(null);
          setImportConflict({...ic,completion:null,
            cloud:{payload,modifiedTime:meta.modifiedTime||"",etag:meta.etag||""}});
          setGsyncStatus("idle"); setGsyncError("");
          noteLineSaveResult(rejected,
            "Google Drive changed — review the updated cloud copy before choosing again",
            rejected.length?"partial":"later");
          return;
        }catch{}
      }
      setGsyncStatus("error"); setGsyncError(message);
      noteLineSaveResult(rejected,message,"error");
    }
  };
'''
replace_between(
    "src/App.jsx",
    "  const importUseCloud = async () => {",
    "\n\n  // ── N104:",
    full_import,
)

# ── Mobile: ETag preconditions and stale-checkpoint conflict reopening ─────────
replace_once(
    "mobile/index.html",
    "async function driveMeta(id){return (await driveFetch(`drive/v3/files/${id}?fields=id,name,modifiedTime,trashed,size,parents,webViewLink`)).json()}\n"
    "async function driveDownload(id){return (await driveFetch(`drive/v3/files/${id}?alt=media`)).text()}\n"
    "async function driveUpdate(id,text){return (await driveFetch(`upload/drive/v3/files/${id}?uploadType=media&fields=id,name,modifiedTime`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:text})).json()}\n",
    "async function driveMeta(id){const r=await driveFetch(`drive/v3/files/${id}?fields=id,name,modifiedTime,trashed,size,parents,webViewLink`);return{...await r.json(),etag:r.headers?.get?.('etag')||''}}\n"
    "async function driveDownload(id){return (await driveFetch(`drive/v3/files/${id}?alt=media`)).text()}\n"
    "async function driveUpdate(id,text,expectedEtag=''){const headers={'Content-Type':'application/json'};if(expectedEtag)headers['If-Match']=expectedEtag;return (await driveFetch(`upload/drive/v3/files/${id}?uploadType=media&fields=id,name,modifiedTime`,{method:'PATCH',headers,body:text})).json()}\n",
)

mobile_recovery = '''async function reopenLineCompletionConflict(checkpoint,rejected,message){
  const latest=await driveMeta(checkpoint.fileId);
  persistLineCompletion(null);
  pendingConflictMeta=latest;
  state.driveError='';
  showConflict(latest);
  toast(lineSaveToastText(rejected,message));
  return true;
}
async function resumeLineCompletion({silent=false,closeConflict=false}={}){
  let checkpoint=state.sync.lineCompletion;
  if(!checkpoint||checkpoint.kind!==MOBILE_LINE_COMPLETION_KIND||!sameId(checkpoint.fileId,state.sync.fileId))return false;
  const rejected=Array.isArray(checkpoint.rejected)?checkpoint.rejected:[];
  try{
    if(checkpoint.phase!=='uploaded'){
      const currentMeta=await driveMeta(checkpoint.fileId);
      if(currentMeta.trashed)throw Error('Cloud file was deleted.');
      const currentText=await driveDownload(checkpoint.fileId);
      const current=normalizeProfile(JSON.parse(currentText));
      const alreadyUploaded=JSON.stringify(current)===JSON.stringify(checkpoint.payload);
      const etagChanged=!!checkpoint.baseEtag&&!!currentMeta.etag&&currentMeta.etag!==checkpoint.baseEtag;
      const timeChanged=(currentMeta.modifiedTime||'')!==(checkpoint.baseModifiedTime||'');
      if(!alreadyUploaded&&(etagChanged||timeChanged)){
        return reopenLineCompletionConflict(checkpoint,rejected,
          'Google Drive changed — review the current conflict before choosing again.');
      }
      if(!alreadyUploaded){
        try{
          const uploaded=await driveUpdate(checkpoint.fileId,JSON.stringify(checkpoint.payload,null,2),
            currentMeta.etag||checkpoint.baseEtag||'');
          checkpoint={...checkpoint,phase:'uploaded',modifiedTime:uploaded.modifiedTime||currentMeta.modifiedTime||''};
        }catch(error){
          const message=error?.message||'Could not update Google Drive.';
          if(/Drive 412|Precondition Failed/i.test(message)){
            return reopenLineCompletionConflict(checkpoint,rejected,
              'Google Drive changed — review the current conflict before choosing again.');
          }
          throw error;
        }
      }else checkpoint={...checkpoint,phase:'uploaded',modifiedTime:currentMeta.modifiedTime||checkpoint.modifiedTime||''};
      persistLineCompletion(checkpoint);
    }
    const complete=window.__MTP_LINE__?.completeMutations;
    if(typeof complete!=='function')throw Error('LINE sync module is not ready. Reload and try again.');
    await complete(checkpoint.mutationIds);
    pushHistory('Resolve conflict from cloud');
    state.data=normalizeProfile(cloneProfileData(checkpoint.payload));
    state.lang=state.data.config?.lang||state.lang;
    state.sync.lastCloudModified=checkpoint.modifiedTime||checkpoint.baseModifiedTime||'';
    state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
    state.sync.lineCompletion=checkpoint;
    if(!saveLocal(false,true))throw Error('Could not save the recovered cloud copy in this browser.');
    persistLineCompletion(null);
    void publishLineSnapshot(state.data);pendingConflictMeta=null;
    if(closeConflict)closeModal();
    if(rejected.length)toast(lineSaveToastText(rejected,'↓ '+tr('synced')));
    else if(!silent)toast('↓ '+tr('synced'));
    render();return true;
  }catch(e){
    state.driveError=e.message||'LINE completion recovery failed.';
    writeJSON(LS_SYNC,state.sync);
    if(!silent||rejected.length)toast(lineSaveToastText(rejected,state.driveError));
    render();return true;
  }
}
'''
replace_between(
    "mobile/index.html",
    "async function resumeLineCompletion({silent=false,closeConflict=false}={}){",
    "\nasync function syncNow(silent=false){",
    mobile_recovery,
)

mobile_pull = '''  const pull=async()=>{
    let rejected=[];
    try{
      if(await resumeLineCompletion({closeConflict:true}))return;
      const currentMeta=await driveMeta(state.sync.fileId);
      if(currentMeta.trashed)throw Error('Cloud file was deleted.');
      const revisionAdvanced=(currentMeta.modifiedTime||'')!==(meta.modifiedTime||'')
        ||(!!meta.etag&&!!currentMeta.etag&&currentMeta.etag!==meta.etag);
      if(revisionAdvanced){
        pendingConflictMeta=currentMeta;showConflict(currentMeta);
        toast('Google Drive changed — review the current conflict before choosing again.');
        return;
      }
      const text=await driveDownload(state.sync.fileId),downloaded=normalizeProfile(JSON.parse(text));
      const linePrepared=window.__MTP_LINE__?.prepareMutations
        ?await window.__MTP_LINE__.prepareMutations(downloaded)
        :{payload:downloaded,mutationIds:[],rejected:[]};
      rejected=Array.isArray(linePrepared.rejected)?linePrepared.rejected:[];
      const mutationIds=Array.isArray(linePrepared.mutationIds)?linePrepared.mutationIds:[];
      const data=normalizeProfile(linePrepared.payload||downloaded);
      if(mutationIds.length){
        const cloudLang=data.config?.lang||downloaded.config?.lang||state.lang;
        const payload=prepareProfileForSave(data,cloudLang);
        const checkpoint={kind:MOBILE_LINE_COMPLETION_KIND,phase:'prepared',
          fileId:state.sync.fileId,baseModifiedTime:currentMeta.modifiedTime||'',
          baseEtag:currentMeta.etag||'',modifiedTime:currentMeta.modifiedTime||'',
          payload,mutationIds:[...mutationIds],rejected:[...rejected]};
        persistLineCompletion(checkpoint);
        await resumeLineCompletion({closeConflict:true});
        return;
      }
      pushHistory('Resolve conflict from cloud');state.data=data;state.lang=state.data.config?.lang||state.lang;
      state.sync.lastCloudModified=currentMeta.modifiedTime||'';state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
      saveLocal(false);void publishLineSnapshot(data);pendingConflictMeta=null;closeModal();
      if(rejected.length)toast(lineSaveToastText(rejected,'↓ '+tr('synced')));
      render();
    }catch(e){state.driveError=e.message||'Cloud conflict recovery failed.';
      toast(lineSaveToastText(rejected,state.driveError));render()}
  };'''
replace_between(
    "mobile/index.html",
    "  const pull=async()=>{",
    "\n  const push=async()=>{",
    mobile_pull,
)

# ── Focused contracts/regressions ─────────────────────────────────────────────
replace_between(
    "build/line-contract.test.mjs",
    'const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");',
    '\n\nassert.doesNotMatch(browserBridge,',
    '''const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");
const fullImportPrepareAt = full.indexOf("prepareLineMutations(latestPayload)", fullImportCloudAt);
const fullImportPersistAt = full.indexOf("persistFullLineCompletion(checkpoint)", fullImportPrepareAt);
const fullImportFinishAt = full.indexOf("finishFullLineCompletion(checkpoint)", fullImportPersistAt);
assert.ok(fullImportCloudAt >= 0 && fullImportPrepareAt > fullImportCloudAt
  && fullImportPersistAt > fullImportPrepareAt && fullImportFinishAt > fullImportPersistAt,
"Full import cloud-wins must persist a prepared checkpoint before recovery executes");
const fullCompletionAt = full.indexOf("const finishFullLineCompletion = async");
const fullCompletionEnd = full.indexOf("const refreshLineStatus", fullCompletionAt);
const fullCompletionBlock = full.slice(fullCompletionAt, fullCompletionEnd);
assert.match(fullCompletionBlock, /provided\|\|gsync\.lineCompletion/);
assert.match(fullCompletionBlock, /phase!=="uploaded"[\s\S]*GDrive\.getMeta[\s\S]*GDrive\.download/);
assert.match(fullCompletionBlock, /GDrive\.updateFile[\s\S]*persistFullLineCompletion\(checkpoint\)/);
assert.match(fullCompletionBlock, /await complete\(checkpoint\.mutationIds\)[\s\S]*applyPayloadLive\(checkpoint\.payload\)/);
assert.doesNotMatch(fullCompletionBlock.slice(fullCompletionBlock.indexOf('await complete')), /prepareLineMutations/);
assert.match(fullCompletionBlock, /Drive error 412\|Precondition Failed[\s\S]*reopenFullLineCompletionConflict/);
assert.match(fullCompletionBlock, /noteLineSaveResult\(rejected,message,"error"\)/);
assert.match(full, /const persistGsyncStrict = async[\s\S]*window\.storage\.set\(pk\(GSYNC_KEY\)/);
assert.match(full, /FULL_LINE_COMPLETION_KIND = "import-cloud-conflict-v2"/);
for (const marker of ["const gsyncPush = async", "const gsyncPull = async", "const gsyncNow = async", "const gsyncSaveNow = async"]) {
  const at=full.indexOf(marker),end=full.indexOf("\n  };",at);
  assert.ok(at>=0&&full.slice(at,end).includes("finishFullLineCompletion()"), `${marker} must resume durable completion first`);
}
const mobileConflictAt = mobile.indexOf("function showConflict(meta){");
const mobileConflictBlock = mobile.slice(mobileConflictAt, mobile.indexOf("function bindSync(){", mobileConflictAt));
const mobileRecoveryAt = mobile.indexOf("async function resumeLineCompletion(");
const mobileSyncAt = mobile.indexOf("async function syncNow(", mobileRecoveryAt);
const mobileRecoveryBlock = mobile.slice(mobileRecoveryAt,mobileSyncAt);
assert.match(mobile, /async function driveMeta\(id\)[\s\S]*etag:r\.headers\?\.get\?\.\('etag'\)/);
assert.match(mobile, /async function driveUpdate\(id,text,expectedEtag=''\)[\s\S]*headers\['If-Match'\]=expectedEtag/);
assert.match(mobileConflictBlock, /const currentMeta=await driveMeta[\s\S]*revisionAdvanced[\s\S]*showConflict\(currentMeta\)/);
assert.match(mobileConflictBlock, /baseEtag:currentMeta\.etag[\s\S]*persistLineCompletion\(checkpoint\)[\s\S]*resumeLineCompletion/);
assert.doesNotMatch(mobileConflictBlock, /persistLineCompletion\(checkpoint\)[\s\S]{0,300}driveUpdate/);
assert.match(mobileRecoveryBlock, /currentMeta\.etag!==checkpoint\.baseEtag/);
assert.match(mobileRecoveryBlock, /driveUpdate\(checkpoint\.fileId[\s\S]*currentMeta\.etag\|\|checkpoint\.baseEtag/);
assert.match(mobileRecoveryBlock, /reopenLineCompletionConflict/);
assert.match(mobileRecoveryBlock, /await complete\(checkpoint\.mutationIds\)[\s\S]*state\.data=normalizeProfile/);
assert.doesNotMatch(mobileRecoveryBlock, /prepareMutations/);
assert.match(mobileRecoveryBlock, /saveLocal\(false,true\)[\s\S]*persistLineCompletion\(null\)/);''',
)

replace_between(
    "build/sync-content-check.test.mjs",
    "// ── Stage 5A: cloud-adopt retries, races and reporting",
    "\nconsole.log(fails.length ?",
    '''// ── Stage 5A: durable retries, stale revisions and rejection reporting ──────
{
  console.log('\\n--- Stage 5A Full durable checkpoint contracts ---');
  const full=fs.readFileSync('src/App.jsx','utf8');
  const persistAt=full.indexOf('const persistGsyncStrict = async');
  const prepareAt=full.indexOf('const prepareLineMutations = async');
  const finishAt=full.indexOf('const finishFullLineCompletion = async',prepareAt);
  const finishEnd=full.indexOf('const refreshLineStatus',finishAt);
  const finish=full.slice(finishAt,finishEnd);
  const importAt=full.indexOf('const importUseCloud = async');
  const importEnd=full.indexOf('// ── N104:',importAt);
  const cloud=full.slice(importAt,importEnd);
  check('Full durable sync write is strict',persistAt>=0&&/window\\.storage\\.set\\(pk\\(GSYNC_KEY\\)/.test(full.slice(persistAt,prepareAt)));
  check('Full stores prepared checkpoint before finishing',cloud.indexOf('persistFullLineCompletion(checkpoint)')<cloud.indexOf('finishFullLineCompletion(checkpoint)'));
  check('Full prepared recovery revalidates content',/phase!=="uploaded"[\\s\\S]*GDrive\\.getMeta[\\s\\S]*GDrive\\.download/.test(finish));
  check('Full prepared recovery uses ETag precondition',/GDrive\\.updateFile[\\s\\S]*meta\\.etag\\|\\|checkpoint\\.baseEtag/.test(finish));
  check('Full uploaded retry completes without preparation',/await complete\\(checkpoint\\.mutationIds\\)/.test(finish)&&! /prepareLineMutations/.test(finish.slice(finish.indexOf('await complete'))));
  check('Full adopts exact checkpoint payload',/applyPayloadLive\\(checkpoint\\.payload\\)/.test(finish));
  check('Full stale/412 recovery reopens conflict',/Drive error 412\\|Precondition Failed/.test(finish)&&/reopenFullLineCompletionConflict/.test(finish));
  check('Full stale/412 recovery retains rejection notice',/noteLineSaveResult\\(rejected,message,rejected\\.length\\?"partial":"later"\\)/.test(full));
  check('Full clears durable checkpoint only after adoption',finish.indexOf('applyPayloadLive(checkpoint.payload)')<finish.indexOf('delete next.lineCompletion'));
}

{
  console.log('\\n--- Stage 5A Mobile ETag and stale-checkpoint contracts ---');
  const mobile=fs.readFileSync('mobile/index.html','utf8');
  const showAt=mobile.indexOf('function showConflict(meta){');
  const pullAt=mobile.indexOf('  const pull=async()=>{',showAt);
  const pullEnd=mobile.indexOf('\\n  const push=async()=>{',pullAt);
  const pull=mobile.slice(pullAt,pullEnd);
  const resumeAt=mobile.indexOf('async function resumeLineCompletion(');
  const resumeEnd=mobile.indexOf('async function syncNow(',resumeAt);
  const resume=mobile.slice(resumeAt,resumeEnd);
  check('Mobile metadata retains ETag',/async function driveMeta\\(id\\)[\\s\\S]*etag:r\\.headers/.test(mobile));
  check('Mobile update supports If-Match',/driveUpdate\\(id,text,expectedEtag=''\\)[\\s\\S]*If-Match/.test(mobile));
  check('Mobile final decision revalidates revision',/currentMeta=await driveMeta[\\s\\S]*revisionAdvanced/.test(pull));
  check('Mobile final decision does not upload directly',! /persistLineCompletion\\(checkpoint\\)[\\s\\S]{0,300}driveUpdate/.test(pull));
  check('Mobile prepared checkpoint carries base ETag',/baseEtag:currentMeta\\.etag/.test(pull));
  check('Mobile recovery uploads with precondition',/driveUpdate\\(checkpoint\\.fileId[\\s\\S]*currentMeta\\.etag\\|\\|checkpoint\\.baseEtag/.test(resume));
  check('Mobile stale prepared checkpoint reopens conflict',/reopenLineCompletionConflict/.test(resume)&&/showConflict\\(latest\\)/.test(mobile));
  check('Mobile stale checkpoint is cleared before conflict opens',mobile.indexOf('persistLineCompletion(null)',mobile.indexOf('async function reopenLineCompletionConflict'))<mobile.indexOf('showConflict(latest)',mobile.indexOf('async function reopenLineCompletionConflict')));
  check('Mobile uploaded retry never prepares again',! /prepareMutations/.test(resume));
  check('Mobile completion precedes exact adoption',resume.indexOf('await complete(checkpoint.mutationIds)')<resume.indexOf('state.data=normalizeProfile'));
  check('Mobile rejection survives stale/failure recovery',/lineSaveToastText\\(rejected,message\\)/.test(mobile)&&/lineSaveToastText\\(rejected,state\\.driveError\\)/.test(resume));
}
''',
)

# ── Durable records ───────────────────────────────────────────────────────────
replace_once(
    "CHANGELOG.md",
    "- After Drive accepts a merged LINE mutation, Full retains the exact payload and\n  IDs as a completion checkpoint; an ambiguous completion response retries only\n  the idempotent queue update and never falls back to stale cloud bytes.\n",
    "- Full persists profile-scoped prepared/uploaded completion checkpoints before\n  Drive upload/queue completion. Reload recovery revalidates prepared writes,\n  retries uploaded checkpoints using only the exact IDs, and adopts the exact\n  uploaded payload before clearing the durable checkpoint.\n",
)
replace_once(
    "CHANGELOG.md",
    "- Mobile persists a temporary post-upload checkpoint containing the exact\n  payload/IDs/rejections. Reload or retry completes those IDs without preparing\n  or applying the mutation a second time, then adopts the exact uploaded payload.\n",
    "- Mobile extracts Drive ETags, uses `If-Match` for conflict uploads, and clears\n  stale prepared checkpoints before reopening the current conflict. Uploaded\n  checkpoints remain completion-only across reloads and cannot reapply an `add`.\n",
)
replace_once(
    "CHANGELOG.md",
    "- Mobile preserves the downloaded cloud profile language, and Full/Mobile report\n  earlier rejected mutations even when upload or completion later fails.\n",
    "- Mobile preserves the downloaded cloud profile language, and Full/Mobile report\n  earlier rejected mutations even when upload, completion, stale-revision refresh,\n  or local adoption later fails.\n",
)

replace_once(
    "PROJECT_CONTEXT.md",
    "| LINE-CLOUD-ADOPT-1 | A cloud-wins decision could overwrite a pending confirmed LINE mutation, a newer Drive revision, or duplicate an `add` after an ambiguous completion response | Final cloud payloads were not revalidated atomically and no post-upload completion checkpoint separated Drive persistence from idempotent queue completion | Full revalidates metadata/content and uses `If-Match`; Full/Mobile retain exact post-upload payload/IDs/rejections and retry completion without re-preparing; Mobile preserves cloud language; all failure exits report rejections | `build/sync-content-check.test.mjs`; `build/line-contract.test.mjs`; `npm test`; `npm run verify`; `npm run scan-secrets` |\n",
    "| LINE-CLOUD-ADOPT-1 | A cloud-wins decision could overwrite a pending confirmed LINE mutation or newer Drive revision, duplicate an `add` after reload, or permanently block Mobile sync on a stale prepared checkpoint | Final cloud payloads were not atomically preconditioned and completion state was not durably separated into prepared/uploaded phases across reloads | Full persists profile-scoped prepared/uploaded checkpoints, revalidates content/ETag and retries only exact completion IDs; Mobile uses ETag `If-Match`, clears stale prepared state and reopens the current conflict; exact payload/language/rejections survive every recovery path | `build/sync-content-check.test.mjs`; `build/line-contract.test.mjs`; `npm test`; `npm run verify`; `npm run scan-secrets` |\n",
)
replace_once(
    "PROJECT_CONTEXT.md",
    "| — | ~~`importUseCloud` can still skip a pending LINE mutation~~ | **Closed in the Stage 5A no-migration candidate.** Full revalidates the selected Drive revision and keeps an exact completion checkpoint; Mobile persists completion-only recovery and preserves cloud language. Both report rejected mutations on later failure and are pinned by runtime/contract regressions. |\n",
    "| — | ~~`importUseCloud` can still skip a pending LINE mutation~~ | **Closed in the Stage 5A no-migration candidate.** Full persists prepared/uploaded recovery across reloads; Mobile preconditions conflict writes and reopens stale checkpoints. Both retry exact completion IDs without re-preparing, preserve cloud language/payload, and report rejections on every failure/refresh path. |\n",
)

stage_path=ROOT/"docs/STAGE5A_NO_MIGRATION_RELEASE.md"
stage=stage_path.read_text(encoding="utf-8")
record='''

## Exact-head review remediation round 2

The second exact-head review required four additional source-only controls:

- Full prepared/uploaded completion state is profile-scoped and durable in the
  existing Drive sync record, so reload recovery never re-prepares an already
  uploaded mutation.
- Mobile metadata retains the Drive ETag and every conflict upload uses an
  `If-Match` precondition after final revision revalidation.
- A stale Mobile prepared checkpoint is deleted before the latest conflict is
  reopened; it cannot permanently short-circuit later sync attempts.
- Full 412/stale-revision recovery preserves and surfaces preparation rejections
  while refreshing the conflict.

Focused contracts cover durable phase ordering, completion-only retry, exact
payload adoption, Mobile stale-checkpoint reopening, ETag preconditions, and
rejection reporting. The source boundary remains no-migration/no-Production.
'''
if "## Exact-head review remediation round 2" in stage:
    raise SystemExit("Stage 5A review-remediation record already exists")
stage_path.write_text(stage.rstrip()+record+"\n",encoding="utf-8")

print("Stage 5A second-review remediation applied")
