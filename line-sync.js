(function(){
"use strict";

// Public browser bridge: it contains no LINE or Supabase backend secret.
// The signed-in Supabase session comes from auth.js and RLS keeps every write
// scoped to auth.uid().
const SNAPSHOT_SCHEMA = 3;
const MAX_TASKS = 500;
const MAX_SNAPSHOT_BYTES = 240 * 1024;
const MAX_SUBTASKS_PER_TASK = 20;
const MAX_SUBTASK_CHARS = 120;
const MAX_ATTACHMENTS_PER_TASK = 3;
const MAX_ATTACHMENT_LABEL_CHARS = 80;
const MAX_ATTACHMENT_URL_CHARS = 1000;
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

function httpsUrl(value){
  const raw=String(value??"").trim();
  if(!raw || raw.length>MAX_ATTACHMENT_URL_CHARS)return "";
  try{
    const parsed=new URL(raw);
    if(parsed.protocol!=="https:" || !parsed.hostname || parsed.username || parsed.password)return "";
    return parsed.href;
  }catch{
    return "";
  }
}

function attachmentKind(value){
  const url=String(value??"").toLowerCase();
  if(/\.(?:jpg|jpeg|png|gif|webp|svg|bmp)(?:[?#]|$)/.test(url))return "image";
  if(/\.(?:mp4|mov|webm|avi|mkv)(?:[?#]|$)/.test(url)
    || /(?:youtube\.com|youtu\.be|vimeo\.com)/.test(url))return "video";
  return "link";
}

function projectSubtasks(task){
  const source=Array.isArray(task?.subtasks)?task.subtasks:[];
  const subtasks=source.slice(0,MAX_SUBTASKS_PER_TASK).map(item=>({
    text:cleanText(item?.text,MAX_SUBTASK_CHARS)||"(ไม่มีชื่อ)",
    done:item?.done===true,
  }));
  return {
    subtasks,
    subtaskCountTotal:source.length,
    subtasksTruncated:source.length>subtasks.length,
  };
}

function projectAttachments(task){
  const source=Array.isArray(task?.attachments)?task.attachments:[];
  const valid=[];
  for(const item of source){
    if(item?.type!=="link")continue;
    const url=httpsUrl(item.url);
    if(!url)continue;
    valid.push({
      kind:attachmentKind(url),
      label:cleanText(item?.label||item?.name,MAX_ATTACHMENT_LABEL_CHARS)
        || cleanText(new URL(url).hostname,MAX_ATTACHMENT_LABEL_CHARS)
        || "Attachment",
      url,
    });
    if(valid.length>=MAX_ATTACHMENTS_PER_TASK)break;
  }
  const shareableTotal=source.filter(item=>item?.type==="link" && !!httpsUrl(item.url)).length;
  return {
    attachments:valid,
    attachmentCountTotal:shareableTotal,
    attachmentsTruncated:shareableTotal>valid.length,
  };
}

function projectTask(task,type,sharing){
  const projected={
    type,
    title:cleanText(task?.title,240)||"(ไม่มีชื่อ)",
    status:cleanText(task?.status,32)||"pending",
    due:isoDate(task?.due||task?.endDate),
    category:cleanText(task?.project||task?.cat,100),
    priority:cleanText(task?.priority,24),
  };
  if(sharing.subtasks)Object.assign(projected,projectSubtasks(task));
  if(sharing.attachmentLinks)Object.assign(projected,projectAttachments(task));
  return projected;
}

function projectEvent(event){
  const firstWindow=Array.isArray(event?.windows)?event.windows[0]:null;
  const start=isoDate(firstWindow?.start||event?.start||event?.due||event?.end);
  const end=isoDate(firstWindow?.end||event?.end||event?.due||start)||start;
  return {
    type:"event",
    title:cleanText(event?.title,240)||"(ไม่มีชื่อ)",
    start,
    end,
    category:cleanText(event?.type||event?.category||event?.cat,100),
  };
}

function taskOrder(a,b){
  const aDone=String(a.status).toLowerCase()==="done"?1:0;
  const bDone=String(b.status).toLowerCase()==="done"?1:0;
  const aDue=a.due||"9999-12-31", bDue=b.due||"9999-12-31";
  return aDone-bDone||aDue.localeCompare(bDue)||a.title.localeCompare(b.title,"th");
}

function eventOrder(a,b){
  return (a.start||"9999-12-31").localeCompare(b.start||"9999-12-31")
    ||a.title.localeCompare(b.title,"th");
}

function snapshotSelectionOrder(a,b){
  const aCreated=isoTimestamp(a.record?.createdAt)||"";
  const bCreated=isoTimestamp(b.record?.createdAt)||"";
  return bCreated.localeCompare(aCreated)||b.position-a.position;
}

function buildSnapshot(payload,source){
  if (!payload || !Array.isArray(payload.personal) || !Array.isArray(payload.work)) {
    throw new Error("Planner data is not a valid profile payload.");
  }
  const sharing={
    subtasks:payload?.config?.lineShareSubtasks===true,
    attachmentLinks:payload?.config?.lineShareAttachmentLinks===true,
  };
  // Select recently-created source records before applying the byte/task cap.
  // Sorting by due date first used to silently discard newer, far-future tasks
  // from large snapshots, so LINE search could not find them. createdAt is used
  // only for selection and is never included in the reduced snapshot.
  const candidates=[
    ...payload.personal.map((task,position)=>({record:task,type:"personal",position})),
    ...payload.work.map((task,position)=>({record:task,type:"work",position:payload.personal.length+position})),
    ...(Array.isArray(payload.events)?payload.events:[]).map((event,position)=>({
      record:event,type:"event",position:payload.personal.length+payload.work.length+position,
    })),
  ].sort(snapshotSelectionOrder);
  const snapshotBase={
    schemaVersion:SNAPSHOT_SCHEMA,
    appVersion:cleanText(payload.appVersion,40),
    source:source==="mobile"?"mobile":"full",
    syncedAt:new Date().toISOString(),
    dataUpdatedAt:isoTimestamp(payload.dataLastUpdated||payload.savedAt),
    driveSavedAt:isoTimestamp(payload.savedAt),
    sharing,
    taskCountTotal:payload.personal.length+payload.work.length,
    eventCountTotal:Array.isArray(payload.events)?payload.events.length:0,
    truncated:false,
    tasks:[],
    events:[],
  };
  const tasks=[];
  const events=[];
  let bytes=new Blob([JSON.stringify(snapshotBase)]).size;
  for(const candidate of candidates){
    if(tasks.length+events.length>=MAX_TASKS)break;
    const item=candidate.type==="event"
      ?projectEvent(candidate.record)
      :projectTask(candidate.record,candidate.type,sharing);
    const itemBytes=new Blob([JSON.stringify(item)]).size+1;
    if(bytes+itemBytes>MAX_SNAPSHOT_BYTES)break;
    (candidate.type==="event"?events:tasks).push(item);
    bytes+=itemBytes;
  }
  tasks.sort(taskOrder);
  events.sort(eventOrder);
  const snapshot={
    ...snapshotBase,
    truncated:candidates.length>tasks.length+events.length,
    tasks,
    events,
  };
  if(new Blob([JSON.stringify(snapshot)]).size>MAX_SNAPSHOT_BYTES){
    throw new Error("LINE task snapshot exceeded its safe size limit.");
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
