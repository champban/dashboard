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
assert.match(mobileRecoveryBlock, /saveLocal\(false,true\)[\s\S]*persistLineCompletion\(null\)/);

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
