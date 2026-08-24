(function(){
'use strict';

// L1B publication is source-only. Changing this constant is a separate client
// activation decision and is intentionally caught by static/browser tests.
const ENABLED=false;
const MODE='off';
const QUEUE_VERSION=1;
const MAX_QUEUE_ITEMS=500;
const MAX_QUEUE_BYTES=2*1024*1024;
const MAX_PAYLOAD_BYTES=256*1024;
const MAX_FILE_BYTES=5*1024*1024;
const PRIVATE_BUCKET='mtp-private';
const OPERATIONS=new Set([
  'task.create','task.update','task.delete','task.children.replace',
  'event.put','event.delete','note.put','note.delete','settings.update',
  'attachment.put','attachment.delete'
]);
const FORBIDDEN_KEYS=new Set([
  '__proto__','prototype','constructor','anthropicKey','googleApiKey',
  'googleClientId','msAppId','clientSecret','client_secret','accessToken',
  'access_token','refreshToken','refresh_token','idToken','id_token',
  'apiKey','api_key','password','secret','token','defaultFilePath',
  'defaultFileName','fileHandle','driveFileId','driveLink','gsync'
]);
const FORBIDDEN_KEYS_LOWER=new Set(Array.from(FORBIDDEN_KEYS,function(key){return String(key).toLowerCase();}));
const SAFE_CONFIG_KEYS=new Set([
  'themeId','fontFamily','fontSize','lang','ganttZoom','ganttWeeks',
  'ganttDates','ganttBarLines','ganttCustomStart','ganttCustomDur',
  'ganttCustomUnit','timelineFontSize','timelineFontFamily','timelineTheme',
  'timelineDetails','timelineCompact','timelineActiveView','ganttActiveView',
  'gsyncAuto','defaultTab','autoSavePrompt','defaultStartFolder',
  'backupReminderWeeks','lineShareSubtasks','lineShareAttachmentLinks',
  'calFontSize','calFontFamily'
]);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function byteSize(value){
  const text=typeof value==='string'?value:JSON.stringify(value);
  if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function isObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function assertUuid(value,label){if(!UUID_RE.test(String(value||'')))throw Error((label||'id')+'_invalid');return String(value).toLowerCase();}
function randomUuid(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(typeof crypto==='undefined'||typeof crypto.getRandomValues!=='function')throw Error('secure_random_unavailable');
  crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,function(v){return v.toString(16).padStart(2,'0');}).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function walkSafe(value,seen){
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return;
  if(typeof value==='string'){
    if(/^\s*(data|blob|javascript):/i.test(value))throw Error('queue_embedded_or_active_content');
    return;
  }
  if(typeof Blob!=='undefined'&&value instanceof Blob)throw Error('queue_binary_forbidden');
  if(typeof File!=='undefined'&&value instanceof File)throw Error('queue_binary_forbidden');
  if(typeof ArrayBuffer!=='undefined'&&(value instanceof ArrayBuffer||ArrayBuffer.isView(value)))throw Error('queue_binary_forbidden');
  if(typeof value!=='object')throw Error('queue_value_invalid');
  seen=seen||new Set();if(seen.has(value))throw Error('queue_cycle_forbidden');seen.add(value);
  Object.keys(value).forEach(function(key){
    if(FORBIDDEN_KEYS.has(key)||FORBIDDEN_KEYS_LOWER.has(String(key).toLowerCase()))throw Error('queue_forbidden_field');
    walkSafe(value[key],seen);
  });
  seen.delete(value);
}
function safeConfig(config){
  const out={};
  if(!isObject(config))return out;
  Object.keys(config).forEach(function(key){
    if(SAFE_CONFIG_KEYS.has(key)&&config[key]!==undefined)out[key]=clone(config[key]);
  });
  walkSafe(out);return out;
}
function safeSettings(payload){
  if(!isObject(payload))throw Error('planner_payload_invalid');
  const profile=isObject(payload.profile)?{
    name:String(payload.profile.name||'').slice(0,200),
    emoji:String(payload.profile.emoji||'').slice(0,32)
  }:{name:'',emoji:''};
  const out={
    profile:profile,
    config:safeConfig(payload.config),
    customTabs:Array.isArray(payload.customTabs)?clone(payload.customTabs):[],
    eventTypes:Array.isArray(payload.eventTypes)?clone(payload.eventTypes):[],
    calViews:Array.isArray(payload.calViews)?clone(payload.calViews):[],
    ganttViews:Array.isArray(payload.ganttViews)?clone(payload.ganttViews):[],
    timelineViews:Array.isArray(payload.timelineViews)?clone(payload.timelineViews):[],
    groupColors:isObject(payload.groupColors)?clone(payload.groupColors):{},
    tabOrder:Array.isArray(payload.tabOrder)?clone(payload.tabOrder):[],
    widgetOrder:Array.isArray(payload.widgetOrder)?clone(payload.widgetOrder):[]
  };
  walkSafe(out);
  if(byteSize(out)>1024*1024)throw Error('planner_settings_too_large');
  return out;
}
function noteHtmlSafe(html){
  const value=String(html||'');
  if(value.length>1000000)throw Error('note_html_too_large');
  if(/(src|href)\s*=\s*["']?\s*(data|blob):/i.test(value)||
     /<\s*(script|iframe|object|embed|form|meta|base)(\s|>)/i.test(value)||
     /on[a-z]+\s*=/i.test(value)||/javascript\s*:/i.test(value)){
    throw Error('note_active_or_embedded_content');
  }
  return value;
}
function legacyKey(kind,value){return String(kind)+':'+String(value);}
function createIdentityMap(options){
  options=options||{};
  const storage=options.storage||window.localStorage;
  const profileKey=String(options.profileKey||'selected');
  const key='mtp-l1-identity-v1::'+profileKey;
  let map={};
  try{map=JSON.parse(storage.getItem(key)||'{}');if(!isObject(map))map={};}catch(_){map={};}
  function persist(){storage.setItem(key,JSON.stringify(map));}
  return Object.freeze({
    get:function(kind,value){
      const k=legacyKey(kind,value);
      if(!map[k]){map[k]=UUID_RE.test(String(value||''))?String(value).toLowerCase():randomUuid();persist();}
      return map[k];
    },
    peek:function(kind,value){return map[legacyKey(kind,value)]||null;},
    snapshot:function(){return clone(map);}
  });
}
function attachmentKind(item){
  if(!isObject(item))return 'file_ref';
  return item.type==='link'||/^https:\/\//i.test(String(item.href||item.url||''))?'link':'file_ref';
}
function hasBinary(item){
  if(!isObject(item))return false;
  return ['data','base64','blob','bytes','binary','content','buffer'].some(function(key){return item[key]!==undefined&&item[key]!==null&&item[key]!=='';});
}
function projectProfile(payload,options){
  if(!isObject(payload)||!Array.isArray(payload.personal)||!Array.isArray(payload.work))throw Error('planner_payload_invalid');
  options=options||{};
  const ids=options.identityMap||createIdentityMap({storage:options.storage,profileKey:options.profileKey});
  const tasks=[],events=[],notes=[],binaryObjects=[];
  payload.personal.concat(payload.work).forEach(function(task){
    if(isObject(task))ids.get('task',task.id);
  });
  function addTasks(list,kind){
    list.forEach(function(task){
      if(!isObject(task))throw Error('task_invalid');
      const taskId=ids.get('task',task.id);
      const children=(Array.isArray(task.subtasks)?task.subtasks:[]).map(function(sub,index){
        return {id:ids.get('subtask:'+taskId,sub&&sub.id),text:String(sub&&sub.text||'').slice(0,4000),done:!!(sub&&sub.done),ordinal:index};
      });
      const deps=(Array.isArray(task.deps)?task.deps:[]).map(function(dep,index){
        const raw=isObject(dep)?(dep.task_id||dep.id):dep;
        return {task_id:ids.get('task',raw),ordinal:index};
      });
      const attachments=(Array.isArray(task.attachments)?task.attachments:[]).map(function(item,index){
        const attachmentId=ids.get('attachment:'+taskId,item&&item.id);
        if(hasBinary(item))binaryObjects.push({parent_kind:'task',parent_id:taskId,id:attachmentId,ordinal:index,name:String(item.name||item.label||'file'),mime_type:String(item.mimeType||item.mime||''),byte_size:Number(item.size)||null});
        return {id:attachmentId,ordinal:index,kind:attachmentKind(item),name:String(item&&item.name||item&&item.label||''),href:/^https:\/\//i.test(String(item&&item.href||item&&item.url||''))?String(item.href||item.url):null,mime_type:String(item&&item.mimeType||item&&item.mime||''),byte_size:Number(item&&item.size)||null,needs_upload:hasBinary(item)};
      });
      tasks.push({
        id:taskId,task_kind:kind,payload:{
          title:String(task.title||''),status_text:task.status||null,
          category:kind==='work'?(task.category||task.project||task.cat||null):(task.category||task.cat||task.project||null),
          priority:task.priority||null,due_date:task.due||null,description:task.description||null,
          start_date:task.startDate||null,assignee:task.assignee||null,project:task.project||null,
          progress:Number.isFinite(Number(task.progress))?Number(task.progress):null,
          recurrence_rule:task.recur||null,is_recurring:!!task.isRecurring,
          location_text:typeof task.location==='string'?task.location:(task.location?JSON.stringify(task.location):null),
          task_notes:task.notes||null,pinned:!!task.pinned,original_due_date:task.originalDue||null,
          delay_label:task.delayLabel||null,milestone:task.milestone!==false,
          milestone_at:task.milestoneAt||null,completed_at:task.completedAt||null,
          source_created_at:task.createdAt||null,renewed_from_task_id:null
        },children:children,dependencies:deps,attachments:attachments
      });
    });
  }
  addTasks(payload.personal,'personal');addTasks(payload.work,'work');
  (Array.isArray(payload.events)?payload.events:[]).forEach(function(event){
    if(!isObject(event))throw Error('event_invalid');
    const eventId=ids.get('event',event.id);
    let windows=Array.isArray(event.windows)?event.windows:[];
    if(!windows.length&&(event.start||event.end))windows=[{start:event.start||event.end,end:event.end||event.start,desc:event.note||''}];
    events.push({id:eventId,payload:{
      title:String(event.title||''),event_type:event.typeId||event.type||null,
      category:event.category||event.typeId||event.type||null,color_hex:event.color||null,
      note_text:event.note||null,legacy_location_text:typeof event.location==='string'?event.location:null,
      windows:windows.map(function(win,index){return {id:ids.get('event_window:'+eventId,win&&win.id!==undefined?win.id:index),start:String(win&&win.start||win&&win.end||''),end:String(win&&win.end||win&&win.start||''),description:String(win&&win.desc||win&&win.description||''),location:isObject(win&&win.loc)?clone(win.loc):null,display_ordinal:index};})
    }});
  });
  (Array.isArray(payload.notes)?payload.notes:[]).forEach(function(note){
    if(!isObject(note))throw Error('note_invalid');
    notes.push({id:ids.get('note',note.id),payload:{title:String(note.title||'Untitled').slice(0,500),emoji:String(note.emoji||'').slice(0,32),content_html:noteHtmlSafe(note.html||'')}});
  });
  const result={tasks:tasks,events:events,notes:notes,settings:safeSettings(payload),binaryObjects:binaryObjects,identity:ids.snapshot()};
  walkSafe({tasks:tasks.map(function(t){return {id:t.id,payload:t.payload,children:t.children,dependencies:t.dependencies};}),events:events,notes:notes,settings:result.settings});
  return result;
}
function safeName(value){
  const name=String(value||'file').normalize?String(value||'file').normalize('NFKC'):String(value||'file');
  const cleaned=name.replace(/[\\/\u0000-\u001f\u007f]+/g,'-').replace(/[^0-9A-Za-z._ -]/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,120);
  return cleaned||'file';
}
function privateObjectPath(ownerId,parentKind,parentId,objectId,fileName){
  const owner=assertUuid(ownerId,'owner_id'),parent=assertUuid(parentId,'parent_id'),object=assertUuid(objectId,'object_id');
  if(parentKind!=='task'&&parentKind!=='note')throw Error('parent_kind_invalid');
  return owner+'/'+parentKind+'/'+parent+'/'+object+'/'+safeName(fileName);
}
function planPrivateObject(meta){
  if(!isObject(meta))throw Error('object_metadata_invalid');
  const size=Number(meta.byte_size);
  if(!Number.isSafeInteger(size)||size<1||size>MAX_FILE_BYTES)throw Error('object_size_invalid');
  const path=privateObjectPath(meta.owner_id,meta.parent_kind,meta.parent_id,meta.id,meta.file_name);
  return {bucket:PRIVATE_BUCKET,path:path,mime_type:String(meta.mime_type||''),byte_size:size,content_sha256:String(meta.content_sha256||'').toLowerCase()};
}
function validateEnvelope(envelope){
  if(!isObject(envelope)||!OPERATIONS.has(envelope.operation))throw Error('queue_operation_invalid');
  assertUuid(envelope.entity_id,'entity_id');assertUuid(envelope.idempotency_key,'idempotency_key');
  if(envelope.expected_version!==null&&envelope.expected_version!==undefined&&(!Number.isSafeInteger(envelope.expected_version)||envelope.expected_version<1))throw Error('queue_version_invalid');
  walkSafe(envelope.payload||{});
  if(byteSize(envelope.payload||{})>MAX_PAYLOAD_BYTES)throw Error('queue_payload_too_large');
  return {operation:envelope.operation,entity_id:String(envelope.entity_id).toLowerCase(),expected_version:envelope.expected_version===undefined?null:envelope.expected_version,payload:clone(envelope.payload||{}),idempotency_key:String(envelope.idempotency_key).toLowerCase()};
}
function classifyError(error){
  const code=String(error&&error.code||'');
  const status=Number(error&&error.status||0);
  if(['L1P01','L1V01','L1I01','42501'].indexOf(code)>=0||status===400||status===401||status===403||status===404||status===409||status===422)return 'permanent';
  if(status===408||status===429||status>=500||code==='NETWORK'||error&&error.name==='TypeError')return 'transient';
  return 'permanent';
}
function createOfflineQueue(options){
  options=options||{};
  const storage=options.storage||window.localStorage;
  const profileKey=String(options.profileKey||'selected');
  const key='mtp-l1-queue-v'+QUEUE_VERSION+'::'+profileKey;
  const transport=options.transport;
  const clock=typeof options.clock==='function'?options.clock:Date.now;
  let entries=[];
  try{entries=JSON.parse(storage.getItem(key)||'[]');if(!Array.isArray(entries))entries=[];}catch(_){entries=[];}
  function persist(){
    const text=JSON.stringify(entries);
    if(byteSize(text)>MAX_QUEUE_BYTES)throw Error('queue_storage_limit');
    storage.setItem(key,text);
  }
  function enqueue(envelope){
    if(!ENABLED)throw Error('l1_client_disabled');
    const item=validateEnvelope(envelope);
    if(entries.length>=MAX_QUEUE_ITEMS)throw Error('queue_item_limit');
    if(entries.some(function(row){return row.idempotency_key===item.idempotency_key;}))throw Error('queue_idempotency_duplicate');
    entries.push(Object.assign({attempts:0,next_attempt_at:0,queued_at:clock()},item));persist();return clone(item);
  }
  async function flush(){
    if(!ENABLED)return {status:'disabled',sent:0,remaining:entries.length};
    if(typeof transport!=='function')throw Error('queue_transport_missing');
    let sent=0;
    while(entries.length){
      const item=entries[0];
      if(item.next_attempt_at>clock())return {status:'backoff',sent:sent,remaining:entries.length};
      try{
        await transport(clone(item));entries.shift();persist();sent+=1;
      }catch(error){
        if(classifyError(error)==='permanent')return {status:'blocked',sent:sent,remaining:entries.length,code:String(error&&error.code||'permanent')};
        item.attempts+=1;item.next_attempt_at=clock()+Math.min(60000,1000*Math.pow(2,Math.min(item.attempts-1,6)));persist();
        return {status:'retry',sent:sent,remaining:entries.length};
      }
    }
    return {status:'complete',sent:sent,remaining:0};
  }
  return Object.freeze({enabled:ENABLED,enqueue:enqueue,flush:flush,inspect:function(){return clone(entries);},clear:function(){if(!ENABLED)throw Error('l1_client_disabled');entries=[];persist();}});
}
function buildDriveExport(server,base){
  if(!isObject(server))throw Error('server_snapshot_invalid');
  const settings=isObject(server.settings)?server.settings:{};
  const profile=isObject(settings.profile)?clone(settings.profile):(isObject(base&&base.profile)?clone(base.profile):{name:'',emoji:''});
  const config=safeConfig(settings.config||base&&base.config||{});
  const tasks=Array.isArray(server.tasks)?server.tasks:[];
  const personal=[],work=[];
  tasks.forEach(function(row){
    const item=clone(row.planner||row);
    item.id=String(row.id||item.id);delete item.version;delete item.owner_id;delete item.record_origin;delete item.source_key;
    (row.task_kind==='work'||item.task_kind==='work'?work:personal).push(item);
  });
  const out={
    version:7,appVersion:String(base&&base.appVersion||''),profile:profile,
    savedAt:new Date().toISOString(),dataLastUpdated:server.dataLastUpdated||null,
    fileName:String(base&&base.fileName||''),personal:personal,work:work,
    events:Array.isArray(server.events)?clone(server.events):[],
    notes:Array.isArray(server.notes)?clone(server.notes):[],
    customTabs:Array.isArray(settings.customTabs)?clone(settings.customTabs):[],config:config,
    widgetOrder:Array.isArray(settings.widgetOrder)?clone(settings.widgetOrder):[],
    eventTypes:Array.isArray(settings.eventTypes)?clone(settings.eventTypes):[],
    calViews:Array.isArray(settings.calViews)?clone(settings.calViews):[],
    ganttViews:Array.isArray(settings.ganttViews)?clone(settings.ganttViews):[],
    timelineViews:Array.isArray(settings.timelineViews)?clone(settings.timelineViews):[],
    groupColors:isObject(settings.groupColors)?clone(settings.groupColors):{},
    tabOrder:Array.isArray(settings.tabOrder)?clone(settings.tabOrder):[],tabReads:{},activity:[],
    summary:{personalCount:personal.length,workCount:work.length,doneCount:personal.concat(work).filter(function(t){return t.status==='done';}).length,overdueCount:0}
  };
  walkSafe(out);return out;
}
function sourcePayload(kind){
  const getter=kind==='mobile'?window.__MTP_L1_SOURCE_MOBILE__:window.__MTP_L1_SOURCE_FULL__;
  if(typeof getter!=='function')throw Error('planner_source_unavailable');
  return clone(getter());
}

window.__MTP_L1__=Object.freeze({
  enabled:ENABLED,mode:MODE,bucket:PRIVATE_BUCKET,
  sourcePayload:sourcePayload,createIdentityMap:createIdentityMap,
  projectProfile:projectProfile,createOfflineQueue:createOfflineQueue,
  privateObjectPath:privateObjectPath,planPrivateObject:planPrivateObject,
  buildDriveExport:buildDriveExport,validateEnvelope:validateEnvelope,
  classifyError:classifyError,safeSettings:safeSettings
});
})();
