(function(){
"use strict";

// Public browser bridge: it contains no LINE or Supabase backend secret.
// The signed-in Supabase session comes from auth.js and RLS keeps every write
// scoped to auth.uid().
const SNAPSHOT_SCHEMA = 1;
const MAX_TASKS = 500;
const MAX_SNAPSHOT_BYTES = 240 * 1024;
const LINK_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function apiClient(){
  const client = window.__MTP_AUTH__?.client;
  if (!client) throw new Error("Supabase sign-in is not ready.");
  return client;
}

async function ownerId(){
  const client = apiClient();
  const {data,error} = await client.auth.getClaims();
  const id = data?.claims?.sub;
  if (error || !id) throw new Error("Please sign in to My Todo Planner again.");
  return id;
}

function cleanText(value,max){
  return String(value??"")
    .replace(/<[^>]*>/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,max);
}

function isoDate(value){
  const match=String(value??"").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?match[1]:"";
}

function isoTimestamp(value){
  const time=Date.parse(value||"");
  return Number.isFinite(time)?new Date(time).toISOString():null;
}

function projectTask(task,type){
  return {
    type,
    title:cleanText(task?.title,240)||"(ไม่มีชื่อ)",
    status:cleanText(task?.status,32)||"pending",
    due:isoDate(task?.due||task?.endDate),
    category:cleanText(task?.project||task?.cat,100),
    priority:cleanText(task?.priority,24),
  };
}

function taskOrder(a,b){
  const aDone=String(a.status).toLowerCase()==="done"?1:0;
  const bDone=String(b.status).toLowerCase()==="done"?1:0;
  const aDue=a.due||"9999-12-31", bDue=b.due||"9999-12-31";
  return aDone-bDone||aDue.localeCompare(bDue)||a.title.localeCompare(b.title,"th");
}

function buildSnapshot(payload,source){
  if (!payload || !Array.isArray(payload.personal) || !Array.isArray(payload.work)) {
    throw new Error("Planner data is not a valid profile payload.");
  }
  const all=[
    ...payload.personal.map(task=>projectTask(task,"personal")),
    ...payload.work.map(task=>projectTask(task,"work")),
  ].sort(taskOrder);
  const tasks=all.slice(0,MAX_TASKS);
  const snapshot={
    schemaVersion:SNAPSHOT_SCHEMA,
    appVersion:cleanText(payload.appVersion,40),
    source:source==="mobile"?"mobile":"full",
    syncedAt:new Date().toISOString(),
    dataUpdatedAt:isoTimestamp(payload.dataLastUpdated||payload.savedAt),
    driveSavedAt:isoTimestamp(payload.savedAt),
    taskCountTotal:all.length,
    truncated:all.length>tasks.length,
    tasks,
  };
  if (new Blob([JSON.stringify(snapshot)]).size>MAX_SNAPSHOT_BYTES) {
    throw new Error("LINE task snapshot is too large. Archive old completed tasks first.");
  }
  return snapshot;
}

async function publish(payload,source){
  const client=apiClient();
  const id=await ownerId();
  const snapshot=buildSnapshot(payload,source);
  const now=new Date().toISOString();
  const row={
    owner_id:id,
    schema_version:SNAPSHOT_SCHEMA,
    snapshot,
    data_updated_at:snapshot.dataUpdatedAt,
    drive_saved_at:snapshot.driveSavedAt,
    source:snapshot.source,
    updated_at:now,
  };
  const {data,error}=await client
    .from("mtp_line_snapshots")
    .upsert(row,{onConflict:"owner_id"})
    .select("updated_at")
    .single();
  if(error)throw new Error(error.message||"Could not publish the LINE task snapshot.");
  return {updatedAt:data?.updated_at||now,taskCount:snapshot.tasks.length,truncated:snapshot.truncated};
}

function randomCode(){
  if(!window.crypto?.getRandomValues)throw new Error("Secure random numbers are unavailable.");
  const bytes=new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
  const chars=[...bytes].map(byte=>CODE_ALPHABET[byte%CODE_ALPHABET.length]).join("");
  return `MTP-${chars.slice(0,4)}-${chars.slice(4)}`;
}

async function sha256Hex(value){
  if(!window.crypto?.subtle)throw new Error("Secure hashing is unavailable.");
  const digest=await window.crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function createLinkCode(){
  const client=apiClient();
  const id=await ownerId();
  for(let attempt=0;attempt<3;attempt+=1){
    const code=randomCode();
    const now=new Date();
    const expiresAt=new Date(now.getTime()+LINK_TTL_MS).toISOString();
    const row={
      owner_id:id,
      code_hash:await sha256Hex(code),
      expires_at:expiresAt,
      used_at:null,
      created_at:now.toISOString(),
      updated_at:now.toISOString(),
    };
    const {error}=await client
      .from("mtp_line_link_codes")
      .upsert(row,{onConflict:"owner_id"});
    if(!error)return {code,expiresAt,command:`เชื่อม ${code}`};
    if(attempt===2)throw new Error(error.message||"Could not create a LINE link code.");
  }
  throw new Error("Could not create a LINE link code.");
}

async function getStatus(){
  const client=apiClient();
  const id=await ownerId();
  const [accountResult,snapshotResult]=await Promise.all([
    client.from("mtp_line_accounts")
      .select("linked_at,last_seen_at")
      .eq("owner_id",id)
      .maybeSingle(),
    client.from("mtp_line_snapshots")
      .select("updated_at,data_updated_at")
      .eq("owner_id",id)
      .maybeSingle(),
  ]);
  if(accountResult.error)throw new Error(accountResult.error.message||"Could not read LINE link status.");
  if(snapshotResult.error)throw new Error(snapshotResult.error.message||"Could not read LINE snapshot status.");
  return {
    linked:!!accountResult.data,
    linkedAt:accountResult.data?.linked_at||null,
    lastSeenAt:accountResult.data?.last_seen_at||null,
    snapshotUpdatedAt:snapshotResult.data?.updated_at||null,
    dataUpdatedAt:snapshotResult.data?.data_updated_at||null,
  };
}

window.__MTP_LINE__=Object.freeze({
  buildSnapshot,
  createLinkCode,
  getStatus,
  publish,
  sha256Hex,
});
})();
