#!/usr/bin/env python3
"""Deterministically rematerialize the approved Stage 5A no-migration source patch.

Temporary branch-only tooling. It performs exact single-anchor replacements and
fails closed on any source drift. No network, database, provider, secret, deploy,
or Production operation is used.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement anchor, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


old_full = '''  // direction 2: the cloud wins — ignore the file, load what is on Drive
  const importUseCloud = async () => {
    const ic = importConflict; if (!ic) return;
    setImportConflict(null);
    await applyPayloadLive(ic.cloud.payload);
    await persistGsync({ ...gsync, lastSyncAt: Date.now(), lastCloudModified: ic.cloud.modifiedTime });
    void publishLineSnapshot(ic.cloud.payload);
    setGsyncStatus("synced");
  };
'''

new_full = '''  // direction 2: the cloud wins — ignore the file, load what is on Drive
  // Stage 5A: prepare against the FINAL cloud payload. Preparing earlier is not
  // sufficient because this rare path downloads/adopts a different copy after
  // the normal sync preparation point.
  const importUseCloud = async () => {
    const ic = importConflict; if (!ic) return;
    try {
      const prepared = await prepareLineMutations(ic.cloud.payload);
      const payload = prepared.payload;
      if (prepared.mutationIds.length) {
        if (!gsync.fileId) throw new Error("No Google Drive file is linked.");
        const stamp = new Date().toISOString();
        const merged = { ...payload, dataLastUpdated: stamp };
        const pushedFp = dataFingerprint(merged);
        const updated = await GDrive.updateFile(gsync.fileId, JSON.stringify(merged, null, 2));
        setDataLastUpdated(stamp);
        await persistGsync({ ...gsync, lastSyncAt: Date.now(),
          lastCloudModified: updated.modifiedTime || ic.cloud.modifiedTime,
          lastPushedStamp: stamp, lastPushedFp: pushedFp });
        await window.__MTP_LINE__?.completeMutations?.(prepared.mutationIds);
        await applyPayloadLive(merged);
        void publishLineSnapshot(merged);
        setImportConflict(null);
        setGsyncStatus("synced");
        noteLineSaveResult(prepared.rejected);
        return;
      }
      await applyPayloadLive(payload);
      await persistGsync({ ...gsync, lastSyncAt: Date.now(), lastCloudModified: ic.cloud.modifiedTime });
      void publishLineSnapshot(payload);
      setImportConflict(null);
      setGsyncStatus("synced");
      if (prepared.rejected?.length) noteLineSaveResult(prepared.rejected);
    } catch (error) {
      // Keep the conflict open. A failed Drive upload must not complete queued
      // mutation IDs, replace local data, or report a successful resolution.
      const message = error?.message || "Could not apply the Google Drive copy.";
      setGsyncStatus("error");
      setGsyncError(message);
      note("error", message);
    }
  };
'''
replace_once("src/App.jsx", old_full, new_full)

old_mobile = '''  const pull=async()=>{
    const text=await driveDownload(state.sync.fileId),data=normalizeProfile(JSON.parse(text));
    pushHistory('Resolve conflict from cloud');state.data=data;state.lang=state.data.config?.lang||state.lang;
    state.sync.lastCloudModified=meta.modifiedTime;state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
    saveLocal(false);void publishLineSnapshot(data);pendingConflictMeta=null;closeModal();render();
  };
'''

new_mobile = '''  const pull=async()=>{
    try{
      const text=await driveDownload(state.sync.fileId),downloaded=normalizeProfile(JSON.parse(text));
      const linePrepared=window.__MTP_LINE__?.prepareMutations
        ?await window.__MTP_LINE__.prepareMutations(downloaded)
        :{payload:downloaded,mutationIds:[],rejected:[]};
      const mutationIds=Array.isArray(linePrepared.mutationIds)?linePrepared.mutationIds:[];
      let data=normalizeProfile(linePrepared.payload||downloaded),cloudModified=meta.modifiedTime;
      if(mutationIds.length){
        const payload=prepareProfileForSave(data),r=await driveUpdate(state.sync.fileId,JSON.stringify(payload,null,2));
        data=normalizeProfile(payload);cloudModified=r.modifiedTime||meta.modifiedTime;
        await window.__MTP_LINE__?.completeMutations?.(mutationIds);
      }
      pushHistory('Resolve conflict from cloud');state.data=data;state.lang=state.data.config?.lang||state.lang;
      state.sync.lastCloudModified=cloudModified;state.sync.lastSyncAt=Date.now();state.sync.dirty=false;
      saveLocal(false);void publishLineSnapshot(data);pendingConflictMeta=null;closeModal();
      if(linePrepared.rejected?.length)toast(lineSaveToastText(linePrepared.rejected,'↓ '+tr('synced')));
      render();
    }catch(e){state.driveError=e.message;toast(e.message);render()}
  };
'''
replace_once("mobile/index.html", old_mobile, new_mobile)

sync_test_anchor = '''console.log(fails.length ? `\\nFAIL (${fails.length}): ${fails.join('; ')}` : '\\nPASS');
process.exit(fails.length ? 1 : 0);
'''

sync_test_block = r'''// ── Stage 5A: final cloud-adopt decision points must preserve LINE changes ─────
const extractStage5aArrow = (source, declaration, following) => {
  const start = source.indexOf(declaration);
  check(`Stage 5A source contains ${declaration.trim()}`, start >= 0);
  if (start < 0) return null;
  const end = source.indexOf(following, start);
  check(`Stage 5A source terminates ${declaration.trim()}`, end > start);
  if (end < 0) return null;
  const prefix = declaration.slice(0, declaration.indexOf('async'));
  const expression = source.slice(start + prefix.length, end + 5).trim().replace(/;$/, '');
  return expression;
};

{
  console.log('\n--- Stage 5A Full import conflict: upload → complete → adopt ---');
  const fullSource = fs.readFileSync('src/App.jsx', 'utf8');
  const expression = extractStage5aArrow(fullSource,
    '  const importUseCloud = async () => {',
    '\n  };\n\n  // ── N104:');
  if (expression) {
    const dependencyNames = [
      'importConflict','setImportConflict','prepareLineMutations','gsync','GDrive',
      'dataFingerprint','setDataLastUpdated','persistGsync','window','applyPayloadLive',
      'publishLineSnapshot','setGsyncStatus','noteLineSaveResult','setGsyncError','note',
    ];
    const factory = new Function(...dependencyNames, `return (${expression});`);
    const events = [];
    let uploaded = null, adopted = null, persisted = null;
    const cloud = { personal:[{id:'cloud',title:'Cloud'}], work:[], events:[], notes:[], config:{} };
    const merged = { ...cloud, personal:[...cloud.personal,{id:'line',title:'From LINE'}] };
    const action = factory(
      { cloud:{payload:cloud,modifiedTime:'cloud-old'} },
      value => events.push(value===null?'clear':'set-conflict'),
      async payload => { events.push('prepare'); check('Full prepares selected cloud payload', payload===cloud); return {payload:merged,mutationIds:['m1'],rejected:[]}; },
      {fileId:'drive-1'},
      {updateFile:async(id,text)=>{events.push('upload');uploaded=JSON.parse(text);check('Full uploads linked Drive file',id==='drive-1');return{modifiedTime:'cloud-new'}}},
      payload => JSON.stringify(payload),
      () => events.push('stamp'),
      async value => {events.push('persist');persisted=value},
      {__MTP_LINE__:{completeMutations:async ids=>{events.push('complete');check('Full completes exact mutation IDs',ids.join(',')==='m1')}}},
      async payload => {events.push('adopt');adopted=payload},
      payload => {events.push('publish');check('Full publishes adopted payload',payload===adopted)},
      value => events.push(`status:${value}`),
      () => events.push('result'),
      message => events.push(`error:${message}`),
      (kind,message) => events.push(`note:${kind}:${message}`),
    );
    await action();
    check('Full upload contains pending LINE mutation', uploaded?.personal?.some(item=>item.id==='line'));
    check('Full adopts the uploaded merged payload', adopted?.personal?.some(item=>item.id==='line'));
    check('Full persists returned Drive modifiedTime', persisted?.lastCloudModified==='cloud-new');
    check('Full orders upload before completion', events.indexOf('upload') < events.indexOf('complete'), events.join(' → '));
    check('Full orders completion before local adoption', events.indexOf('complete') < events.indexOf('adopt'), events.join(' → '));
    check('Full clears conflict only after adoption', events.indexOf('adopt') < events.indexOf('clear'), events.join(' → '));
    check('Full reports synced only after success', events.includes('status:synced'), events.join(' → '));

    const failedEvents = [];
    const failedAction = factory(
      { cloud:{payload:cloud,modifiedTime:'cloud-old'} },
      value => failedEvents.push(value===null?'clear':'set-conflict'),
      async () => {failedEvents.push('prepare');return{payload:merged,mutationIds:['m1'],rejected:[]}},
      {fileId:'drive-1'},
      {updateFile:async()=>{failedEvents.push('upload');throw new Error('upload failed')}},
      ()=>'fp',
      ()=>failedEvents.push('stamp'),
      async()=>failedEvents.push('persist'),
      {__MTP_LINE__:{completeMutations:async()=>failedEvents.push('complete')}},
      async()=>failedEvents.push('adopt'),
      ()=>failedEvents.push('publish'),
      value=>failedEvents.push(`status:${value}`),
      ()=>failedEvents.push('result'),
      message=>failedEvents.push(`error:${message}`),
      (kind,message)=>failedEvents.push(`note:${kind}:${message}`),
    );
    await failedAction();
    check('Full failed upload completes no mutation', !failedEvents.includes('complete'), failedEvents.join(' → '));
    check('Full failed upload adopts no cloud payload', !failedEvents.includes('adopt'), failedEvents.join(' → '));
    check('Full failed upload keeps conflict unresolved', !failedEvents.includes('clear'), failedEvents.join(' → '));
    check('Full failed upload reports error, not synced', failedEvents.includes('status:error')&&!failedEvents.includes('status:synced'), failedEvents.join(' → '));
  }
}

{
  console.log('\n--- Stage 5A Mobile conflict pull: upload → complete → adopt ---');
  const mobileSource = fs.readFileSync('mobile/index.html', 'utf8');
  const showConflictAt = mobileSource.indexOf('function showConflict(meta){');
  const scoped = showConflictAt >= 0 ? mobileSource.slice(showConflictAt) : '';
  const expression = extractStage5aArrow(scoped,
    '  const pull=async()=>{',
    '\n  };\n  const push=async()=>{');
  if (expression) {
    const dependencyNames = [
      'state','driveDownload','normalizeProfile','window','driveUpdate','prepareProfileForSave',
      'pushHistory','saveLocal','publishLineSnapshot','pendingConflictMeta','closeModal',
      'lineSaveToastText','toast','tr','render','meta',
    ];
    const factory = new Function(...dependencyNames, `return (${expression});`);
    const events = [];
    const local = {personal:[{id:'local'}],work:[],events:[],notes:[],config:{lang:'EN'}};
    const downloaded = {personal:[{id:'cloud'}],work:[],events:[],notes:[],config:{lang:'EN'}};
    const merged = {...downloaded,personal:[...downloaded.personal,{id:'line'}]};
    const state = {data:local,lang:'EN',sync:{fileId:'drive-1',lastCloudModified:'cloud-old',lastSyncAt:0,dirty:true},driveError:''};
    let uploaded = null, published = null, closed = false;
    const pull = factory(
      state,
      async()=>{events.push('download');return JSON.stringify(downloaded)},
      value=>JSON.parse(JSON.stringify(value)),
      {__MTP_LINE__:{
        prepareMutations:async payload=>{events.push('prepare');check('Mobile prepares final downloaded payload',payload.personal[0].id==='cloud');return{payload:merged,mutationIds:['m1'],rejected:[{error:'expired'}]}},
        completeMutations:async ids=>{events.push('complete');check('Mobile completes exact IDs',ids.join(',')==='m1')},
      }},
      async(id,text)=>{events.push('upload');uploaded=JSON.parse(text);return{modifiedTime:'cloud-new'}},
      payload=>({...payload,savedAt:'stage5a'}),
      ()=>events.push('adopt'),
      ()=>events.push('save'),
      payload=>{events.push('publish');published=payload},
      {},
      ()=>{events.push('close');closed=true},
      rejected=>`rejected:${rejected.length}`,
      message=>events.push(`toast:${message}`),
      key=>key,
      ()=>events.push('render'),
      {modifiedTime:'cloud-old'},
    );
    await pull();
    check('Mobile upload contains pending LINE mutation', uploaded?.personal?.some(item=>item.id==='line'));
    check('Mobile adopts uploaded merged payload', state.data?.personal?.some(item=>item.id==='line'));
    check('Mobile publishes adopted payload', published===state.data);
    check('Mobile persists returned modifiedTime', state.sync.lastCloudModified==='cloud-new');
    check('Mobile orders upload before completion', events.indexOf('upload') < events.indexOf('complete'), events.join(' → '));
    check('Mobile orders completion before adoption', events.indexOf('complete') < events.indexOf('adopt'), events.join(' → '));
    check('Mobile surfaces rejected mutation result', events.some(value=>value==='toast:rejected:1'), events.join(' → '));
    check('Mobile closes conflict only after success', closed&&events.indexOf('adopt')<events.indexOf('close'), events.join(' → '));

    const failedState = {data:local,lang:'EN',sync:{fileId:'drive-1',lastCloudModified:'cloud-old',lastSyncAt:0,dirty:true},driveError:''};
    const failedEvents = [];
    const failedPull = factory(
      failedState,
      async()=>JSON.stringify(downloaded),
      value=>JSON.parse(JSON.stringify(value)),
      {__MTP_LINE__:{prepareMutations:async()=>({payload:merged,mutationIds:['m1'],rejected:[]}),completeMutations:async()=>failedEvents.push('complete')}},
      async()=>{failedEvents.push('upload');throw new Error('upload failed')},
      payload=>payload,
      ()=>failedEvents.push('adopt'),
      ()=>failedEvents.push('save'),
      ()=>failedEvents.push('publish'),
      {},
      ()=>failedEvents.push('close'),
      ()=>'rejected',
      message=>failedEvents.push(`toast:${message}`),
      key=>key,
      ()=>failedEvents.push('render'),
      {modifiedTime:'cloud-old'},
    );
    await failedPull();
    check('Mobile failed upload completes no mutation', !failedEvents.includes('complete'), failedEvents.join(' → '));
    check('Mobile failed upload adopts no cloud payload', !failedEvents.includes('adopt'), failedEvents.join(' → '));
    check('Mobile failed upload keeps conflict open', !failedEvents.includes('close'), failedEvents.join(' → '));
    check('Mobile failed upload preserves local data', failedState.data===local);
    check('Mobile failed upload reports the error', failedState.driveError==='upload failed'&&failedEvents.includes('toast:upload failed'), failedEvents.join(' → '));
  }
}

'''
replace_once("build/sync-content-check.test.mjs", sync_test_anchor, sync_test_block + sync_test_anchor)

line_contract_anchor = '''assert.ok(mobilePrepareAt >= 0 && mobileMutationUploadAt > mobilePrepareAt
  && mobileMutationCommitAt > mobileMutationUploadAt,
"Mobile must not expose a queued LINE mutation in local state before Drive accepts it");
'''
line_contract_extra = '''assert.ok(mobilePrepareAt >= 0 && mobileMutationUploadAt > mobilePrepareAt
  && mobileMutationCommitAt > mobileMutationUploadAt,
"Mobile must not expose a queued LINE mutation in local state before Drive accepts it");
const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");
const fullImportPrepareAt = full.indexOf("prepareLineMutations(ic.cloud.payload)", fullImportCloudAt);
const fullImportUploadAt = full.indexOf("await GDrive.updateFile", fullImportPrepareAt);
const fullImportCompleteAt = full.indexOf("completeMutations", fullImportUploadAt);
const fullImportAdoptAt = full.indexOf("await applyPayloadLive(merged)", fullImportCompleteAt);
const fullImportClearAt = full.indexOf("setImportConflict(null)", fullImportAdoptAt);
assert.ok(fullImportCloudAt >= 0 && fullImportPrepareAt > fullImportCloudAt
  && fullImportUploadAt > fullImportPrepareAt && fullImportCompleteAt > fullImportUploadAt
  && fullImportAdoptAt > fullImportCompleteAt && fullImportClearAt > fullImportAdoptAt,
"Full import cloud-wins must prepare, upload, complete, adopt, then clear the conflict");
const mobileConflictAt = mobile.indexOf("function showConflict(meta){");
const mobileConflictDownloadAt = mobile.indexOf("const text=await driveDownload", mobileConflictAt);
const mobileConflictPrepareAt = mobile.indexOf("prepareMutations(downloaded)", mobileConflictDownloadAt);
const mobileConflictUploadAt = mobile.indexOf("await driveUpdate", mobileConflictPrepareAt);
const mobileConflictCompleteAt = mobile.indexOf("completeMutations", mobileConflictUploadAt);
const mobileConflictAdoptAt = mobile.indexOf("pushHistory('Resolve conflict from cloud')", mobileConflictCompleteAt);
const mobileConflictCloseAt = mobile.indexOf("pendingConflictMeta=null;closeModal()", mobileConflictAdoptAt);
assert.ok(mobileConflictAt >= 0 && mobileConflictDownloadAt > mobileConflictAt
  && mobileConflictPrepareAt > mobileConflictDownloadAt && mobileConflictUploadAt > mobileConflictPrepareAt
  && mobileConflictCompleteAt > mobileConflictUploadAt && mobileConflictAdoptAt > mobileConflictCompleteAt
  && mobileConflictCloseAt > mobileConflictAdoptAt,
"Mobile cloud pull must prepare the final download, upload, complete, adopt, then close");
const mobileConflictBlock = mobile.slice(mobileConflictAt, mobile.indexOf("function bindSync(){", mobileConflictAt));
assert.match(mobileConflictBlock, /lineSaveToastText\(linePrepared\.rejected/);
assert.match(mobileConflictBlock, /catch\(e\)\{state\.driveError=e\.message;toast\(e\.message\);render\(\)\}/);
'''
replace_once("build/line-contract.test.mjs", line_contract_anchor, line_contract_extra)

changelog_anchor = "# Changelog\n\n"
changelog_entry = '''# Changelog

## Unreleased — Stage 5A no-migration cloud conflict safety — 2026-09-02

- Full local-file conflict → **Keep what is on Drive** now prepares confirmed
  LINE mutations against the selected cloud payload, uploads the merged payload
  first, and completes mutation IDs only after Drive accepts it.
- Mobile conflict **Cloud → Local** applies the same final-download ordering and
  preserves the unresolved conflict when the upload fails.
- Added success/failure runtime coverage plus Full/Mobile ordering contracts.
- Closed the `importUseCloud` backlog gap and added a recurrence-prevention rule
  for every cloud-adopt decision point.
- Source-only candidate: no Database, migration, Storage, Auth, RLS, provider,
  secret, backup, deployment, merge, activation, reconciliation or Production
  operation is included.

'''
replace_once("CHANGELOG.md", changelog_anchor, changelog_entry)

recurrence_anchor = "| LINE-WEBHOOK-1 | LINE redelivery or partial batch failure could duplicate drafts and reprocess completed events |"
context_path = ROOT / "PROJECT_CONTEXT.md"
context = context_path.read_text(encoding="utf-8")
if context.count(recurrence_anchor) != 1:
    raise SystemExit("PROJECT_CONTEXT.md: LINE-WEBHOOK-1 anchor drifted")
line_start = context.index(recurrence_anchor)
line_end = context.index("\n", line_start)
recurrence_row = "| LINE-CLOUD-ADOPT-1 | A cloud-wins decision could overwrite a pending confirmed LINE mutation after an earlier preparation point | `importUseCloud` omitted final-payload preparation; Mobile downloaded a fresh cloud payload after `syncNow` prepared the old local state | Every final cloud-adopt decision prepares the downloaded/selected payload, uploads a merged Drive copy before completing IDs or adopting locally, and leaves the conflict unresolved on upload failure | `build/sync-content-check.test.mjs`; `build/line-contract.test.mjs`; `npm test`; `npm run verify`; `npm run scan-secrets` |\n"
context = context[:line_end+1] + recurrence_row + context[line_end+1:]
old_backlog = "| — | `importUseCloud` can still skip a pending LINE mutation | Same class of bug fixed 2026-08-11 across 8 sync entry points (see the confirmed-mutations release record above), but deliberately not fixed there too: `importUseCloud` is part of the rare \"open a conflicting local file from disk, keep the cloud copy\" flow, not the core Drive sync loop. Low priority — needs both a disk-file import *and* a pending LINE mutation at the same time. |"
new_backlog = "| — | ~~`importUseCloud` can still skip a pending LINE mutation~~ | **Closed in the Stage 5A no-migration candidate.** Full prepares the selected Drive payload and Mobile prepares the final downloaded payload; both upload before completing mutation IDs or adopting locally, retain the conflict on upload failure, and are pinned by runtime/contract regressions. |"
if context.count(old_backlog) != 1:
    raise SystemExit(f"PROJECT_CONTEXT.md: importUseCloud backlog anchor count={context.count(old_backlog)}")
context = context.replace(old_backlog, new_backlog, 1)
context_path.write_text(context, encoding="utf-8")

stage_path = ROOT / "docs/STAGE5A_NO_MIGRATION_RELEASE.md"
stage = stage_path.read_text(encoding="utf-8")n
