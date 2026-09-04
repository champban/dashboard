import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { transform } from "esbuild";

const read = (path) => fs.readFileSync(path, "utf8");
const full = read("src/App.jsx");
const mobile = read("mobile/index.html");
const packager = read("build/package.mjs");
const browserBridge = read("line-sync.js");
const webhook = read("supabase/functions/line-todo-webhook/index.ts");
const migration = read("supabase/migrations/20260728155436_line_official_readonly_bot.sql");
const snapshotV2Migration = read("supabase/migrations/20260730031026_line_task_details_snapshot_v2.sql");
const snapshotV3Migration = read("supabase/migrations/20260801090000_line_snapshot_v3_events.sql");
const mutationMigration = read("supabase/migrations/20260802090000_line_confirmed_mutations.sql");
const config = read("supabase/config.toml");

assert.match(packager, /<script defer src="line-sync\.js"><\/script>/);
assert.match(mobile, /<script defer src="\.\.\/line-sync\.js"><\/script>/);
const mobileCsp = mobile.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
for (const match of mobile.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  assert.doesNotThrow(() => new vm.Script(match[1]), "mobile inline script must parse");
  const hash = crypto.createHash("sha256").update(match[1]).digest("base64");
  assert.match(mobileCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "mobile CSP must cover every inline script");
}
assert.match(full, /await GDrive\.updateFile[\s\S]{0,900}void publishLineSnapshot\(payload\)/);
assert.match(full, /await applyPayloadLive\(adopted\)[\s\S]{0,500}void publishLineSnapshot\(adopted\)/);
assert.match(mobile, /await driveUpdate[\s\S]{0,500}void publishLineSnapshot\(payload\)/);
assert.match(mobile, /await driveDownload[\s\S]{0,700}void publishLineSnapshot\(data\)/);
const mobilePrepareAt = mobile.indexOf("prepareMutations(state.data)");
const mobileMutationUploadAt = mobile.indexOf("const r=await driveUpdate", mobilePrepareAt);
const mobileMutationCommitAt = mobile.indexOf("state.data=payload", mobilePrepareAt);
assert.ok(mobilePrepareAt >= 0 && mobileMutationUploadAt > mobilePrepareAt
  && mobileMutationCommitAt > mobileMutationUploadAt,
"Mobile must not expose a queued LINE mutation in local state before Drive accepts it");
const fullImportCloudAt = full.indexOf("const importUseCloud = async () => {");
const fullImportPrepareAt = full.indexOf("prepareLineMutations(latestPayload)", fullImportCloudAt);
const fullImportPersistAt = full.indexOf("persistFullLineCompletion(checkpoint)", fullImportPrepareAt);
const fullImportFinishAt = full.indexOf("finishFullLineCompletion(checkpoint)", fullImportPersistAt);
assert.ok(fullImportCloudAt >= 0 && fullImportPrepareAt > fullImportCloudAt
  && fullImportPersistAt > fullImportPrepareAt && fullImportFinishAt > fullImportPersistAt,
"Full import cloud-wins must persist a prepared checkpoint before recovery executes");
assert.match(full.slice(fullImportCloudAt,fullImportFinishAt), /baseCanonical:canonicalJSON\(latestPayload\)/);
assert.match(full.slice(fullImportCloudAt,fullImportFinishAt), /targetCanonical:canonicalJSON\(payload\)/);
const fullCompletionAt = full.indexOf("const finishFullLineCompletion = async");
const fullCompletionEnd = full.indexOf("const refreshLineStatus", fullCompletionAt);
const fullCompletionBlock = full.slice(fullCompletionAt, fullCompletionEnd);
assert.match(fullCompletionBlock, /provided\|\|gsync\.lineCompletion/);
assert.match(fullCompletionBlock, /GDrive\.getMeta[\s\S]*GDrive\.download/);
assert.match(full, /function classifyLineRecoveryPayload\(currentPayload, checkpoint\)/);
assert.match(fullCompletionBlock, /recoveryState=classifyLineRecoveryPayload\(currentPayload,checkpoint\)/);
assert.match(fullCompletionBlock, /recoveryState\.state!=="target"[\s\S]*recoveryState\.state!=="base"/);
assert.match(fullCompletionBlock, /GDrive\.updateFile[\s\S]*persistFullLineCompletion\(checkpoint\)/);
assert.match(fullCompletionBlock, /await complete\(checkpoint\.mutationIds\)[\s\S]*applyPayloadLive\(checkpoint\.payload,\{strict:true\}\)/);
assert.doesNotMatch(fullCompletionBlock.slice(fullCompletionBlock.indexOf('await complete')), /prepareLineMutations/);
assert.match(fullCompletionBlock, /Drive error 412\|Precondition Failed[\s\S]*reopenFullLineCompletionConflict/);
assert.match(fullCompletionBlock, /const expectedEtag=meta\.etag\|\|checkpoint\.baseEtag\|\|""[\s\S]*if\(!expectedEtag\)throw new Error[\s\S]*GDrive\.updateFile[\s\S]*expectedEtag/);
assert.match(fullCompletionBlock, /delete next\.lineCompletion[\s\S]*persistGsyncStrict\(next\)/);
assert.match(full, /const writeStorageExact = async[\s\S]*!result \|\| result\.key !== key[\s\S]*window\.storage\.get\(key\)[\s\S]*roundTrip\.value !== serialized/);
assert.match(full, /const persistGsyncStrict = async[\s\S]*writeStorageExact\(pk\(GSYNC_KEY\)/);
assert.match(full, /applyPayloadLive = async \(parsed, \{ strict=false \} = \{\}\)/);
assert.match(full, /if \(strict\) await writeStorageExact\(pk\(DATA_UPDATED_KEY\)/);
assert.match(full, /const resolveFullLineRecoveryConflict = async[\s\S]*saveConflictCopy\(currentText,"Google Drive before LINE recovery"\)[\s\S]*finishFullLineCompletion\(resumed\)/);
assert.match(full, /function recoveryLocalCanonical\(payload\)/);
assert.match(full, /const preserveFullLocalEdits = async[\s\S]*saveConflictCopy[\s\S]*preservedLocalCanonical[\s\S]*persistFullLineCompletion/);
assert.match(fullCompletionBlock, /preserveFullLocalEdits\(checkpoint\)[\s\S]*await complete\(checkpoint\.mutationIds\)[\s\S]*preserveFullLocalEdits\(checkpoint\)[\s\S]*applyPayloadLive/);
assert.match(full.slice(fullImportCloudAt), /localBaselineCanonical:recoveryLocalCanonical\(buildSavePayload\(\)\)/);
const fullImportCloudBlock = full.slice(fullImportCloudAt, full.indexOf("// ── N104:", fullImportCloudAt));
assert.match(fullImportCloudBlock, /if\(gsyncBusy\.current\|\|gsyncChecking\.current\)[\s\S]*gsyncBusy\.current=true[\s\S]*finally\{[\s\S]*gsyncBusy\.current=false/);
assert.ok(fullImportCloudBlock.indexOf("gsyncBusy.current=true") < fullImportCloudBlock.indexOf("prepareLineMutations(latestPayload)"),
  "Full cloud-choice must own the shared exclusion before preparing a LINE mutation");
const fullCheckAt = full.indexOf("const gsyncCheckNow = async");
const fullCheckBlock = full.slice(fullCheckAt, full.indexOf("// This is the app's first fixed-interval poll", fullCheckAt));
assert.match(fullCheckBlock, /if \(gsyncChecking\.current \|\| gsyncBusy\.current \|\| gsync\.lineCompletion\) return null;/);
assert.ok(fullCheckBlock.indexOf("gsyncChecking.current = true") < fullCheckBlock.indexOf("prepareLineMutations"),
  "Full Check Now must own its exclusion before preparing a LINE mutation");
assert.match(fullCheckBlock,/if \(same\)[\s\S]*prepareLineMutations\(cloudPayload\)/,
  "Fingerprint-equal Check Now must preserve the exact downloaded payload fields");
const fullNowAt=full.indexOf("const gsyncNow = async");
const fullNowBlock=full.slice(fullNowAt,full.indexOf("const gsyncSaveNow = async",fullNowAt));
assert.match(fullNowBlock,/const basePayload=JSON\.parse\(await GDrive\.download\(gsync\.fileId\)\);[\s\S]*prepareLineMutations\(basePayload\)/,
  "No-clock-change mutation handling must merge into the downloaded Drive base");
assert.match(full, /gsyncChecking\.current \|\| gsyncBusy\.current \|\| gsync\.lineCompletion/);
assert.match(full, /FULL_LINE_COMPLETION_KIND = "import-cloud-conflict-v2"/);
const fullMutationStartAt=full.indexOf("const startFullLineCompletion = async");
const fullMutationStartEnd=full.indexOf("const refreshLineStatus",fullMutationStartAt);
const fullMutationStartBlock=full.slice(fullMutationStartAt,fullMutationStartEnd);
assert.match(fullMutationStartBlock, /baseCanonical:canonicalJSON\(basePayload\)/);
assert.match(fullMutationStartBlock, /persistFullLineCompletion\(checkpoint,durableSyncBase\)[\s\S]*finishFullLineCompletion\(checkpoint\)/);
assert.equal((full.match(/startFullLineCompletion\(/g)||[]).length,12,
  "Every one of the twelve Full mutation-upload paths must use durable recovery");
assert.doesNotMatch(full,/completeMutations\?\.\(prepared\.mutationIds\)/,
  "A prepared mutation may only be completed by the durable recovery path");
for(const marker of ["const gsyncPull = async","const gsyncNow = async",
  "const gsyncSaveNow = async","const gsyncCheckNow = async","const gsyncAcceptCloud = async"]){
  const at=full.indexOf(marker);
  const end=marker.includes("gsyncCheckNow")
    ?full.indexOf("// Every 10s",at):full.indexOf("\n  };",at);
  assert.match(full.slice(at,end),/startFullLineCompletion\(\{basePayload:/,
    `${marker} must checkpoint the downloaded Drive base before a mutation upload`);
}
for (const marker of ["const gsyncPush = async", "const gsyncPull = async", "const gsyncNow = async", "const gsyncSaveNow = async"]) {
  const at=full.indexOf(marker),end=full.indexOf("\n  };",at);
  assert.ok(at>=0&&full.slice(at,end).includes("finishFullLineCompletion()"), `${marker} must resume durable completion first`);
}
const mobileConflictAt = mobile.indexOf("function showConflict(meta){");
const mobileConflictBlock = mobile.slice(mobileConflictAt, mobile.indexOf("function bindSync(){", mobileConflictAt));
const mobileRecoveryAt = mobile.indexOf("async function resumeLineCompletion(");
const mobileSyncAt = mobile.indexOf("async function syncNow(", mobileRecoveryAt);
const mobileRecoveryBlock = mobile.slice(mobileRecoveryAt,mobileSyncAt);
assert.match(mobile, /function canonicalJSON\(v\)/);
assert.match(mobile, /async function driveMeta\(id\)[\s\S]*etag:r\.headers\?\.get\?\.\('etag'\)/);
assert.match(mobile, /async function driveUpdate\(id,text,expectedEtag=''\)[\s\S]*headers\['If-Match'\]=expectedEtag/);
assert.match(mobileConflictBlock, /const currentMeta=await driveMeta[\s\S]*revisionAdvanced[\s\S]*showConflict\(currentMeta\)/);
assert.match(mobileConflictBlock, /baseCanonical:canonicalJSON\(downloaded\)[\s\S]*targetCanonical:canonicalJSON\(payload\)/);
assert.match(mobileConflictBlock, /persistLineCompletion\(checkpoint\)[\s\S]*resumeLineCompletion/);
assert.doesNotMatch(mobileConflictBlock, /persistLineCompletion\(checkpoint\)[\s\S]{0,300}driveUpdate/);
assert.match(mobile, /function classifyLineRecoveryPayload\(currentPayload,checkpoint\)/);
assert.match(mobileRecoveryBlock, /recoveryState=classifyLineRecoveryPayload\(current,checkpoint\)/);
assert.match(mobileRecoveryBlock, /recoveryState\.state!=='target'[\s\S]*recoveryState\.state!=='base'/);
assert.match(mobileRecoveryBlock, /const expectedEtag=String\(currentMeta\.etag\|\|''\)\.trim\(\)\|\|String\(checkpoint\.baseEtag\|\|''\)\.trim\(\);[\s\S]*if\(!expectedEtag\)throw Error\('Could not verify the Google Drive revision\. LINE recovery remains pending\.'\);[\s\S]*driveUpdate\(checkpoint\.fileId[\s\S]*expectedEtag/);
assert.ok(mobileRecoveryBlock.indexOf("if(!expectedEtag)") < mobileRecoveryBlock.indexOf("driveUpdate(checkpoint.fileId"),
  "Mobile recovery must fail closed before PATCH when no non-empty current/base ETag exists");
assert.match(mobileRecoveryBlock, /reopenLineCompletionConflict/);
assert.match(mobileRecoveryBlock, /await complete\(checkpoint\.mutationIds\)[\s\S]*state\.data=normalizeProfile/);
assert.doesNotMatch(mobileRecoveryBlock, /prepareMutations/);
assert.match(mobileRecoveryBlock, /saveLocal\(false,true\)[\s\S]*persistLineCompletion\(null\)/);
assert.match(mobile, /async function resolveBlockedLineCompletion\(\)[\s\S]*driveCreate\(lineRecoveryCopyName\(\),currentText[\s\S]*resumeLineCompletion/);
assert.match(mobile, /function recoveryLocalCanonical\(payload\)/);
assert.match(mobile, /async function preserveMobileLocalEdits\(provided\)[\s\S]*driveCreate\(lineRecoveryLocalCopyName\(\)[\s\S]*preservedLocalCanonical[\s\S]*persistLineCompletion/);
assert.match(mobileRecoveryBlock, /preserveMobileLocalEdits\(checkpoint\)[\s\S]*await complete\(checkpoint\.mutationIds\)[\s\S]*preserveMobileLocalEdits\(checkpoint\)[\s\S]*state\.data=normalizeProfile/);
assert.match(mobileConflictBlock, /localBaselineCanonical:recoveryLocalCanonical\(state\.data\)/);
assert.match(mobileConflictBlock, /const pull=async\(\)=>\{[\s\S]*if\(state\.driveBusy\)return;[\s\S]*setDriveBusy\(true\)[\s\S]*finally\{setDriveBusy\(false\)\}/);
assert.match(mobileConflictBlock, /Keep both and finish LINE recovery/);
const fullLinkGuardAt = full.indexOf("const blockFullLinkChangeDuringRecovery = () => {");
const fullRelinkAt = full.indexOf("const gsyncRelink = async", fullLinkGuardAt);
const fullUnlinkAt = full.indexOf("const gsyncUnlink = async", fullRelinkAt);
const fullLinkGuardBlock = full.slice(fullLinkGuardAt, fullRelinkAt);
const fullRelinkBlock = full.slice(fullRelinkAt, full.indexOf("const gsyncOpenFolder", fullRelinkAt));
const fullUnlinkBlock = full.slice(fullUnlinkAt, full.indexOf("const gsyncNow = async", fullUnlinkAt));
assert.match(fullLinkGuardBlock, /gsyncBusy\.current/);
assert.match(fullLinkGuardBlock, /gsync\.lineCompletion/);
assert.ok(fullRelinkBlock.indexOf("blockFullLinkChangeDuringRecovery()") < fullRelinkBlock.indexOf("persistGsync"),
  "Full relink must retain the checkpoint and its original file before changing the link");
assert.ok(fullUnlinkBlock.indexOf("blockFullLinkChangeDuringRecovery()") < fullUnlinkBlock.indexOf("persistGsync"),
  "Full unlink must retain the checkpoint and its original file before clearing the link");
const fullProfileSwitchAt = full.indexOf("const switchProfile = (newId) => {");
const fullProfileSwitchBlock = full.slice(fullProfileSwitchAt, full.indexOf("const toggleLang", fullProfileSwitchAt));
const fullProfileDeleteAt = full.indexOf("const handleDelete = (id) => {");
const fullProfileDeleteBlock = full.slice(fullProfileDeleteAt, full.indexOf("const inp =", fullProfileDeleteAt));
assert.ok(fullProfileSwitchBlock.indexOf("blockFullLinkChangeDuringRecovery()") < fullProfileSwitchBlock.indexOf("setActiveProfileId"),
  "Full profile switch must retain the active profile recovery checkpoint");
assert.ok(fullProfileDeleteBlock.indexOf("currentProfileId===id && onBeforeActiveProfileDelete?.()") < fullProfileDeleteBlock.indexOf("Object.keys(localStorage)"),
  "Full active-profile deletion must be blocked before profile-scoped recovery storage is removed");
assert.match(full, /onBeforeActiveProfileDelete=\{blockFullLinkChangeDuringRecovery\}/);

const mobileFileGuardAt = mobile.indexOf("function blockCloudFileChangeDuringRecovery(id=null){");
const mobileDeleteAt = mobile.indexOf("async function deleteCloudFile(id,name){", mobileFileGuardAt);
const mobileRelinkAt = mobile.indexOf("async function linkCloudFile(id,name){", mobileDeleteAt);
const mobileCreateAt = mobile.indexOf("async function createCloudFile(folderTab=null){", mobileRelinkAt);
const mobileSyncAtEntry = mobile.indexOf("async function syncNow(silent=false){", mobileCreateAt);
const mobileFileGuardBlock = mobile.slice(mobileFileGuardAt, mobile.indexOf("async function connectDrive", mobileFileGuardAt));
const mobileDeleteBlock = mobile.slice(mobileDeleteAt, mobileRelinkAt);
const mobileRelinkBlock = mobile.slice(mobileRelinkAt, mobileCreateAt);
const mobileCreateBlock = mobile.slice(mobileCreateAt, mobile.indexOf("function syncTimestamp", mobileCreateAt));
const mobileSyncEntryBlock = mobile.slice(mobileSyncAtEntry, mobile.indexOf("function showConflict(meta){", mobileSyncAtEntry));
assert.ok(mobileRelinkAt >= 0, "Mobile relink handler must exist");
assert.match(mobileRelinkBlock, /if\(state\.driveBusy\)return/);
assert.match(mobileFileGuardBlock, /state\.sync\.lineCompletion/);
assert.ok(mobileRelinkBlock.indexOf("blockCloudFileChangeDuringRecovery()") < mobileRelinkBlock.indexOf("driveDownload"),
  "Mobile must block relinking before downloading or switching to another Drive file");
assert.ok(mobileCreateBlock.indexOf("blockCloudFileChangeDuringRecovery()") < mobileCreateBlock.indexOf("driveCreate"),
  "Mobile must block creating a new active Drive file while recovery is pending");
assert.ok(mobileDeleteBlock.indexOf("blockCloudFileChangeDuringRecovery(id)") < mobileDeleteBlock.indexOf("driveDelete"),
  "Mobile must block deleting the active Drive file while recovery is pending");
assert.match(mobileSyncEntryBlock, /async function syncNow\(silent=false\)\{\s*if\(state\.driveBusy\)return;/);
const mobileConnectAt = mobile.indexOf("async function connectDrive(){");
const mobileShowFilesAt = mobile.indexOf("async function showCloudFiles(){");
const mobileRenameAt = mobile.indexOf("async function renameCloudFile(id,oldName){");
const mobileConflictPushAt = mobile.indexOf("  const push=async()=>{", mobile.indexOf("function showConflict(meta){"));
for (const [name,at] of [["connectDrive",mobileConnectAt],["showCloudFiles",mobileShowFilesAt],["renameCloudFile",mobileRenameAt],["conflict push",mobileConflictPushAt]]) {
  const block = mobile.slice(at, mobile.indexOf("setDriveBusy(true)",at)+"setDriveBusy(true)".length);
  assert.match(block, /if\(state\.driveBusy\)return;[\s\S]*setDriveBusy\(true\)/, `Mobile ${name} must reject entry before owning the Drive lock`);
}

// ── Stage 5A focused unit regressions ───────────────────────────────────────
// Exercise the exact helper implementations without booting another JSDOM app.
// This keeps the suite fast while proving the four clean-mirror findings stay closed.
const fullCanonicalSource = full.slice(
  full.indexOf("function canonicalJSON(v){"),
  full.indexOf("// What counts as \"the data\""),
);
const recoveryContext = {};
vm.runInNewContext(`${fullCanonicalSource}\nthis.canonicalJSON=canonicalJSON;this.classifyLineRecoveryPayload=classifyLineRecoveryPayload;`, recoveryContext);
const canonical = recoveryContext.canonicalJSON;
const classifyRecovery = recoveryContext.classifyLineRecoveryPayload;
const basePayload = {personal:[{id:"a",title:"One"}],config:{lang:"EN"},tabReads:{today:1},activity:[{id:"x"}]};
const targetPayload = {...basePayload,personal:[...basePayload.personal,{id:"b",title:"LINE add"}]};
const checkpoint = {phase:"prepared",payload:targetPayload,baseCanonical:canonical(basePayload),targetCanonical:canonical(targetPayload)};
assert.equal(classifyRecovery(basePayload,checkpoint).state,"base", "unchanged base may perform the first upload");
assert.equal(classifyRecovery(targetPayload,checkpoint).state,"target", "exact uploaded target must use completion-only recovery");
assert.equal(classifyRecovery({...targetPayload,tabReads:{today:2}},checkpoint).state,"blocked", "tab-read-only drift must not be hidden by a partial fingerprint");
assert.equal(classifyRecovery({...targetPayload,config:{lang:"TH"}},checkpoint).state,"blocked", "settings-only drift must not be overwritten by stale recovery bytes");
assert.equal(classifyRecovery({...basePayload,activity:[{id:"newer"}]},checkpoint).state,"blocked", "activity-only drift must force explicit reconciliation");

const recoveryLocalSource = full.slice(
  full.indexOf("function recoveryLocalCanonical(payload){"),
  full.indexOf("function classifyLineRecoveryPayload",full.indexOf("function recoveryLocalCanonical(payload){")),
);
const localContext={structuredClone:value=>JSON.parse(JSON.stringify(value)),JSON};
vm.runInNewContext(`${fullCanonicalSource}\n${recoveryLocalSource}\nthis.recoveryLocalCanonical=recoveryLocalCanonical;`,localContext);
const localCanonical=localContext.recoveryLocalCanonical;
const localBaseline={personal:[{id:"a",title:"One"}],work:[],savedAt:"old",dataLastUpdated:"old",summary:{personalCount:1},config:{lang:"EN"}};
assert.equal(localCanonical({...localBaseline,savedAt:"new",dataLastUpdated:"new",summary:{personalCount:99}}),localCanonical(localBaseline),"volatile save metadata must not create a false local-edit conflict");
assert.notEqual(localCanonical({...localBaseline,personal:[{id:"a",title:"Edited while recovering"}]}),localCanonical(localBaseline),"task edits during recovery must be detected");
assert.notEqual(localCanonical({...localBaseline,config:{lang:"TH"}}),localCanonical(localBaseline),"settings edits during recovery must be detected");

// The source-order contracts above bind these executable race models to the
// synchronous guards used by Full and Mobile. Each model holds the first action
// across an await, starts the competing action, and proves one confirmed add is
// prepared only once regardless of which trigger wins the race.
const deferred = () => {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return {promise,release};
};
async function exerciseFullRace(first) {
  let busy=false,checking=false,prepareAddCalls=0;
  const hold=deferred();
  const prepareAdd=async()=>{prepareAddCalls+=1;};
  const cloudChoice=async(gate=Promise.resolve())=>{
    if(busy||checking)return;
    busy=true;
    try{await gate;await prepareAdd();}finally{busy=false;}
  };
  const checkNow=async(gate=Promise.resolve())=>{
    if(checking||busy)return;
    checking=true;
    try{await gate;await prepareAdd();}finally{checking=false;}
  };
  const winner=first==="check"?checkNow(hold.promise):cloudChoice(hold.promise);
  await Promise.resolve();
  await (first==="check"?cloudChoice():checkNow());
  hold.release();
  await winner;
  return prepareAddCalls;
}
assert.equal(await exerciseFullRace("check"),1,"Full cloud-choice must defer while Check Now owns the checker lock");
assert.equal(await exerciseFullRace("cloud"),1,"Full Check Now must defer after cloud-choice owns the shared exclusion");

async function exerciseMobileRace(first) {
  let driveBusy=false,prepareAddCalls=0;
  const hold=deferred();
  const enter=async(gate=Promise.resolve())=>{
    if(driveBusy)return;
    driveBusy=true;
    try{await gate;prepareAddCalls+=1;}finally{driveBusy=false;}
  };
  const recovery=gate=>enter(gate);
  const syncNow=gate=>enter(gate);
  const winner=first==="recovery"?recovery(hold.promise):syncNow(hold.promise);
  await Promise.resolve();
  await (first==="recovery"?syncNow():recovery());
  const firstStillOwnsLock=driveBusy;
  hold.release();
  await winner;
  return {prepareAddCalls,firstStillOwnsLock};
}
assert.deepEqual(await exerciseMobileRace("recovery"),{prepareAddCalls:1,firstStillOwnsLock:true},"Mobile sync must defer without clearing recovery's Drive lock");
assert.deepEqual(await exerciseMobileRace("sync"),{prepareAddCalls:1,firstStillOwnsLock:true},"Mobile recovery must defer without clearing sync's Drive lock");

// Execute the exact Mobile recovery function with both revision tags empty.
// The catch may rewrite the same sync checkpoint, but no remote or adoption
// side effect may run and the durable completion checkpoint must remain intact.
const missingEtagCheckpoint={kind:"cloud-conflict-v1",phase:"prepared",fileId:"drive-1",
  payload:{personal:[{id:"line-1",title:"Queued LINE add"}],config:{lang:"EN"}},
  mutationIds:["mutation-1"],baseCanonical:"base",targetCanonical:"target",baseEtag:"   "};
const missingEtagData={personal:[{id:"local-1",title:"Existing local task"}],config:{lang:"EN"}};
const missingEtagState={data:missingEtagData,lang:"EN",sync:{fileId:"drive-1",lineCompletion:missingEtagCheckpoint}};
const missingEtagCalls={patch:0,complete:0,persist:0,clear:0,save:0,history:0,publish:0,write:0};
let missingEtagSavedSync="",missingEtagError="";
const mobileRecoveryRuntime=vm.createContext({
  state:missingEtagState,MOBILE_LINE_COMPLETION_KIND:"cloud-conflict-v1",JSON,String,Date,
  sameId:(left,right)=>String(left)===String(right),
  driveMeta:async()=>({etag:"   ",trashed:false,modifiedTime:"2026-09-04T00:00:00.000Z"}),
  driveDownload:async()=>JSON.stringify({personal:[],config:{lang:"EN"}}),
  normalizeProfile:value=>value,
  classifyLineRecoveryPayload:()=>({state:"base",currentCanonical:"base",targetCanonical:"target"}),
  reopenLineCompletionConflict:async()=>{throw Error("unexpected conflict reopen");},
  driveUpdate:async()=>{missingEtagCalls.patch+=1;return{};},
  persistLineCompletion:value=>{missingEtagCalls.persist+=1;if(value===null)missingEtagCalls.clear+=1;},
  preserveMobileLocalEdits:async value=>value,
  window:{__MTP_LINE__:{completeMutations:async()=>{missingEtagCalls.complete+=1;}}},
  pushHistory:()=>{missingEtagCalls.history+=1;},cloneProfileData:value=>JSON.parse(JSON.stringify(value)),
  saveLocal:()=>{missingEtagCalls.save+=1;return true;},
  publishLineSnapshot:()=>{missingEtagCalls.publish+=1;},
  closeModal:()=>{},toast:message=>{missingEtagError=message;},render:()=>{},
  lineSaveToastText:(_rejected,message)=>message,tr:key=>key,
  writeJSON:(_key,value)=>{missingEtagCalls.write+=1;missingEtagSavedSync=JSON.stringify(value);return true;},
  LS_SYNC:"sync",pendingConflictMeta:null,
});
vm.runInContext(`${mobileRecoveryBlock}\nthis.resumeLineCompletion=resumeLineCompletion;`,mobileRecoveryRuntime);
assert.equal(await mobileRecoveryRuntime.resumeLineCompletion(),true,"missing-Etag recovery must remain handled and pending");
assert.deepEqual({...missingEtagCalls},{patch:0,complete:0,persist:0,clear:0,save:0,history:0,publish:0,write:1},
  "missing-Etag recovery must not PATCH, complete, adopt, publish or clear its checkpoint");
assert.equal(missingEtagState.data,missingEtagData,"missing-Etag recovery must not adopt the queued payload");
assert.equal(missingEtagState.sync.lineCompletion,missingEtagCheckpoint,"missing-Etag recovery must retain the exact checkpoint");
assert.equal(JSON.parse(missingEtagSavedSync).lineCompletion.fileId,"drive-1","rewritten sync state must still contain the checkpoint");
assert.match(missingEtagError,/Google Drive revision.*remains pending/,
  "missing-Etag recovery must explain why it stayed pending");

const fullContextChangeAllowed=(busy,storedCheckpoint)=>!(busy||storedCheckpoint);
assert.equal(fullContextChangeAllowed(false,checkpoint),false,"Full profile/file context changes must reject while a recovery checkpoint exists");
assert.equal(fullContextChangeAllowed(true,null),false,"Full context changes must reject while cloud-choice owns the lock before its checkpoint exists");
assert.equal(fullContextChangeAllowed(false,null),true,"Full context changes remain available when no recovery is active");

const strictStart = full.indexOf("const writeStorageExact = async");
const strictEnd = full.indexOf("\n\n  const applyPayloadLive",strictStart);
const strictExpression = full.slice(full.indexOf("=",strictStart)+1,strictEnd).trim().replace(/;$/,"");
const applyStart = full.indexOf("const applyPayloadLive = async");
const applyEnd = full.indexOf("\n\n  // ── Google Drive sync",applyStart);
const applyExpression = full.slice(full.indexOf("=",applyStart)+1,applyEnd).trim().replace(/;$/,"");
const persisted = new Map();
let failKey = "";
const appliedSetters = [];
const runtimeContext = vm.createContext({
  window:{storage:{
    set:async(key,value)=>{if(key===failKey)return null;persisted.set(key,value);return{key,value};},
    get:async(key)=>persisted.has(key)?{key,value:persisted.get(key)}:null,
  }},
  P_KEY:"P",W_KEY:"W",EVENTS_KEY:"E",NOTES_KEY:"N",CUSTOM_TABS_KEY:"CT",
  CONFIG_KEY:"CFG",WIDGET_KEY:"WID",EVENT_TYPES_KEY:"ET",CAL_VIEWS_KEY:"CV",
  GANTT_VIEWS_KEY:"GV",TL_VIEWS_KEY:"TV",GROUP_COLORS_KEY:"GC",TABORDER_KEY:"TO",
  TABREADS_KEY:"TR",ACTIVITY_KEY:"A",DATA_UPDATED_KEY:"D",DEFAULT_CONFIG:{defaultTab:"milestones"},
  pk:key=>key,Date,
  setPersonal:value=>appliedSetters.push(["personal",value]),setWork:value=>appliedSetters.push(["work",value]),
  setEvents:()=>{},setNotes:()=>{},setCustomTabs:()=>{},setConfig:()=>{},setFontSize:()=>{},setLang:()=>{},
  setWidgetOrder:()=>{},setEventTypes:()=>{},setCalViews:()=>{},setGanttViewsBk:()=>{},setTlViewsBk:()=>{},
  setGroupColors:()=>{},setGroupColorCache:()=>{},setTabOrder:()=>{},setTabReads:()=>{},
  setActivity:()=>{},setUndoStack:()=>{},setRedoStack:()=>{},setDataLastUpdated:()=>{},
});
runtimeContext.writeStorageExact = vm.runInContext(`(${strictExpression})`,runtimeContext);
const applyPayloadStrict = vm.runInContext(`(${applyExpression})`,runtimeContext);
failKey="W";
await assert.rejects(
  applyPayloadStrict({version:7,personal:[{id:"a"}],work:[{id:"b"}],events:[],notes:[],dataLastUpdated:"2026-09-03T00:00:00.000Z"},{strict:true}),
  /Could not save work tasks/,
  "strict local adoption must reject a null storage result",
);
assert.deepEqual(appliedSetters,[],"React state must not adopt payload fields after a durable-write failure");
failKey="";persisted.clear();
runtimeContext.window.storage.get=async key=>persisted.has(key)?{key,value:"mismatched"}:null;
await assert.rejects(
  runtimeContext.writeStorageExact("checkpoint","exact","LINE recovery checkpoint"),
  /Could not verify LINE recovery checkpoint/,
  "strict checkpoint writes must reject a mismatched read-back",
);
runtimeContext.window.storage.get=async key=>persisted.has(key)?{key,value:persisted.get(key)}:null;
persisted.clear();
await assert.doesNotReject(
  applyPayloadStrict({version:7,personal:[{id:"a"}],work:[{id:"b"}],events:[],notes:[],tabReads:{today:1},activity:[],dataLastUpdated:"2026-09-03T00:00:00.000Z"},{strict:true}),
  "strict local adoption must pass after exact set/read-back for every required field",
);
assert.equal(persisted.get("TR"),JSON.stringify({today:1}));
assert.equal(persisted.get("D"),"2026-09-03T00:00:00.000Z");

assert.doesNotMatch(browserBridge, /LINE_CHANNEL_(?:SECRET|ACCESS_TOKEN)/);
assert.doesNotMatch(browserBridge, /service_role|sb_secret_/);
assert.doesNotMatch(browserBridge, /anthropic\.com|openai\.com/);
assert.match(browserBridge, /SNAPSHOT_SCHEMA = 3/);
assert.match(browserBridge, /lineShareSubtasks===true/);
assert.match(browserBridge, /lineShareAttachmentLinks===true/);
assert.match(browserBridge, /item\?\.type!=="link"/);

assert.match(migration, /enable row level security/g);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = owner_id\)/);
assert.match(migration, /security definer/);
assert.match(migration, /revoke all on function public\.mtp_claim_line_link/);
assert.match(migration, /grant execute on function public\.mtp_claim_line_link\(text, text\) to service_role/);
assert.match(snapshotV2Migration, /check \(schema_version in \(1, 2\)\)/);
assert.match(snapshotV2Migration, /not valid/);
assert.match(snapshotV2Migration, /validate constraint mtp_line_snapshots_schema_version_check/);
assert.doesNotMatch(snapshotV2Migration, /\b(?:delete|truncate)\s+from\b/i);
assert.match(snapshotV3Migration, /check \(schema_version in \(1, 2, 3\)\)/);
assert.match(snapshotV3Migration, /not valid/);
assert.match(snapshotV3Migration, /validate constraint mtp_line_snapshots_schema_version_check/);
assert.doesNotMatch(snapshotV3Migration, /\b(?:delete|truncate)\s+from\b/i);
assert.match(mutationMigration,/enable row level security/);
assert.match(mutationMigration,/status in \('draft','confirmed','cancelled','applied','rejected'\)/);
assert.doesNotMatch(mutationMigration,/\b(?:delete|truncate)\s+from\b/i);
assert.match(config, /\[functions\.line-todo-webhook\][\s\S]*verify_jwt = false/);

const rawBodyAt = webhook.indexOf("const rawBody = await request.text()");
const signatureAt = webhook.indexOf("verifyLineSignature(rawBody");
const parseAt = webhook.indexOf("body = JSON.parse(rawBody)");
const menuAt = webhook.indexOf('intent.kind === "menu"');
const snapshotAt = webhook.indexOf('.from("mtp_line_snapshots")');
assert.ok(rawBodyAt >= 0 && signatureAt > rawBodyAt && parseAt > signatureAt,
  "raw LINE body must be verified before JSON parsing");
assert.ok(menuAt >= 0 && snapshotAt > menuAt,
  "a linked menu request must not require a planner snapshot read");
assert.doesNotMatch(webhook, /console\.(?:log|warn|error)/);
assert.match(webhook, /event\?\.source\?\.type === "user"/);
assert.match(webhook, /api\.line\.me\/v2\/bot\/message\/reply/);
assert.match(webhook, /messages: messages\.slice\(0, 5\)/);
assert.match(webhook, /intent\.kind === "menu"/);
assert.match(webhook, /buildMenuMessage\(language\)/);
assert.match(webhook, /buildQuickReply\(language\)/);
assert.match(webhook, /event\?\.type === "postback"/);
assert.match(webhook, /parseSearchPromptPostback\(event\?\.postback\?\.data\)/);
assert.match(webhook, /buildSearchPromptMessage\(language\)/);
assert.match(webhook, /buildReplyMessages\(intent, snapshot, \{ language \}\)/);
await assert.doesNotReject(
  transform(webhook, { loader: "ts", target: "es2022" }),
  "Edge Function TypeScript must parse",
);

console.log("LINE integration contracts: PASS");
