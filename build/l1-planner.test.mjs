import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';

const source=fs.readFileSync('l1-planner.js','utf8');
const app=fs.readFileSync('src/App.jsx','utf8');
const mobile=fs.readFileSync('mobile/index.html','utf8');
const packager=fs.readFileSync('build/package.mjs','utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(String(key))?map.get(String(key)):null,
    setItem:(key,value)=>map.set(String(key),String(value)),
    removeItem:key=>map.delete(String(key)),
    snapshot:()=>Object.fromEntries(map)
  };
}
function loadBridge(enabled=false){
  const localStorage=memoryStorage();
  let fullReads=0,mobileReads=0;
  const context={
    crypto:webcrypto,TextEncoder,Blob,console,localStorage,
    __MTP_L1_SOURCE_FULL__:()=>{fullReads+=1;return{personal:[],work:[]}},
    __MTP_L1_SOURCE_MOBILE__:()=>{mobileReads+=1;return{personal:[],work:[]}}
  };
  context.window=context;vm.createContext(context);
  const body=enabled?source.replace('const ENABLED=false','const ENABLED=true'):source;
  vm.runInContext(body,context,{filename:'l1-planner.js'});
  return {bridge:context.__MTP_L1__,context,localStorage,reads:()=>({fullReads,mobileReads})};
}

assert.match(source,/const ENABLED=false/,'L1B client is source-published off');
assert.match(source,/const MODE='off'/);
assert.doesNotMatch(source,/set(?:Timeout|Interval)\([^)]*(?:flush|transport|rpc|upload)/s,'no timer sends L1 work');

const disabled=loadBridge(false);
assert.equal(disabled.bridge.enabled,false);
assert.equal(disabled.bridge.mode,'off');
assert.deepEqual(disabled.reads(),{fullReads:0,mobileReads:0},'bridge load reads no planner data');
assert.deepEqual(plain(disabled.bridge.sourcePayload('full')),{personal:[],work:[]});
assert.deepEqual(disabled.reads(),{fullReads:1,mobileReads:0},'source read is explicit only');

const identity=disabled.bridge.createIdentityMap({storage:disabled.localStorage,profileKey:'profile-1'});
const taskId=identity.get('task:personal',123);
assert.match(taskId,/^[0-9a-f-]{36}$/);
assert.equal(identity.get('task:personal',123),taskId,'legacy identity is stable');
assert.notEqual(identity.get('task:personal',124),taskId);

const payload={
  version:7,appVersion:'3.77.2',profile:{id:'device-only',name:'Owner',emoji:'👤'},
  personal:[{id:123,title:'Plan',status:'pending',cat:'Home',priority:'High',due:'2026-09-01',
    description:'Details',progress:20,subtasks:[{id:11,text:'Step',done:false}],deps:[124],
    attachments:[{id:12,type:'link',url:'https://example.com/doc',label:'Doc'}]}],
  work:[{id:124,title:'Dependency',status:'todo',project:'L1',subtasks:[],deps:[],attachments:[]}],events:[{id:20,title:'Trip',typeId:'travel',color:'#336699',windows:[{id:21,start:'2026-09-02',end:'2026-09-03',desc:'Window',loc:{name:'Bangkok'}}]}],
  notes:[{id:30,title:'Note',emoji:'📝',html:'<p>Safe</p>'}],
  customTabs:[],eventTypes:[],calViews:[],ganttViews:[],timelineViews:[],groupColors:{},tabOrder:[],widgetOrder:[],
  config:{themeId:'claude',lang:'EN',gsyncAuto:true,googleClientId:'device-only',anthropicKey:'never-sync'},
  fileName:'device-only.json',tabReads:{today:2},activity:[{label:'device-only'}]
};
const projected=disabled.bridge.projectProfile(payload,{identityMap:identity});
assert.equal(projected.tasks.length,2);
assert.equal(projected.tasks[0].children.length,1);
assert.equal(projected.tasks[0].dependencies[0].task_id,projected.tasks[1].id,'dependency reuses canonical task identity');
assert.equal(projected.events[0].payload.windows.length,1);
assert.equal(projected.notes[0].payload.content_html,'<p>Safe</p>');
assert.equal(projected.settings.config.themeId,'claude');
assert.equal('googleClientId' in projected.settings.config,false);
assert.equal('anthropicKey' in projected.settings.config,false);
assert.equal('tabReads' in projected.settings,false);
assert.equal('activity' in projected.settings,false);
assert.equal('fileName' in projected.settings,false);
assert.equal(projected.binaryObjects.length,0);

assert.throws(()=>disabled.bridge.projectProfile({...payload,notes:[{id:31,title:'bad',html:'<img src="data:image/png;base64,AAA">'}]},{identityMap:identity}),/note_active_or_embedded_content/);
assert.throws(()=>disabled.bridge.safeSettings({...payload,customTabs:[{accessToken:'bad'}]}),/queue_forbidden_field/);

const disabledQueue=disabled.bridge.createOfflineQueue({storage:disabled.localStorage,profileKey:'profile-1',transport:()=>{throw Error('must not run')}});
assert.throws(()=>disabledQueue.enqueue({}),/l1_client_disabled/);
assert.deepEqual(plain(await disabledQueue.flush()),{status:'disabled',sent:0,remaining:0});

const path=disabled.bridge.privateObjectPath(
  '10000000-0000-4000-8000-000000000001','note',
  '13000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001','../../รูป plan.png'
);
assert.equal(path,'10000000-0000-4000-8000-000000000001/note/13000000-0000-4000-8000-000000000001/14000000-0000-4000-8000-000000000001/plan.png');
assert.throws(()=>disabled.bridge.planPrivateObject({owner_id:'10000000-0000-4000-8000-000000000001',parent_kind:'note',parent_id:'13000000-0000-4000-8000-000000000001',id:'14000000-0000-4000-8000-000000000001',file_name:'x',byte_size:5242881}),/object_size_invalid/);

const exported=disabled.bridge.buildDriveExport({
  tasks:[{id:'11000000-0000-4000-8000-000000000001',task_kind:'personal',planner:{title:'Plan',status:'done',version:9,owner_id:'private'}}],
  events:[],notes:[],settings:projected.settings,dataLastUpdated:'2026-08-24T00:00:00Z'
},{appVersion:'3.77.2',fileName:'backup.json'});
assert.equal(exported.version,7);
assert.equal(exported.personal.length,1);
assert.equal(exported.personal[0].id,'11000000-0000-4000-8000-000000000001');
assert.equal('owner_id' in exported.personal[0],false);
assert.equal('version' in exported.personal[0],false);
assert.equal('googleClientId' in exported.config,false);
assert.deepEqual(plain(exported.tabReads),{});
assert.deepEqual(plain(exported.activity),[]);

// Simulate the later one-line activation only inside this isolated VM. This
// proves FIFO/idempotency/backoff behavior without changing shipped bytes.
const active=loadBridge(true);
let now=1000;
const sent=[];
const queue=active.bridge.createOfflineQueue({
  storage:active.localStorage,profileKey:'profile-a',clock:()=>now,
  transport:async item=>{sent.push(item.idempotency_key);}
});
const envelopeA={operation:'note.put',entity_id:'13000000-0000-4000-8000-000000000001',expected_version:null,payload:{title:'A'},idempotency_key:'a1000000-0000-4000-8000-000000000001'};
const envelopeB={operation:'note.delete',entity_id:'13000000-0000-4000-8000-000000000001',expected_version:1,payload:{},idempotency_key:'a1000000-0000-4000-8000-000000000002'};
queue.enqueue(envelopeA);queue.enqueue(envelopeB);
assert.throws(()=>queue.enqueue(envelopeA),/queue_idempotency_duplicate/);
assert.deepEqual(plain(await queue.flush()),{status:'complete',sent:2,remaining:0});
assert.deepEqual(sent,[envelopeA.idempotency_key,envelopeB.idempotency_key],'queue preserves FIFO');

let transient=true,attempted=[];
const retryQueue=active.bridge.createOfflineQueue({
  storage:memoryStorage(),profileKey:'profile-b',clock:()=>now,
  transport:async item=>{attempted.push(item.idempotency_key);if(transient){const e=Error('down');e.status=503;throw e;}}
});
retryQueue.enqueue(envelopeA);
assert.deepEqual(plain(await retryQueue.flush()),{status:'retry',sent:0,remaining:1});
assert.equal(retryQueue.inspect()[0].attempts,1);
assert.equal(retryQueue.inspect()[0].idempotency_key,envelopeA.idempotency_key,'retry preserves original idempotency key');
assert.deepEqual(plain(await retryQueue.flush()),{status:'backoff',sent:0,remaining:1});
now=2000;transient=false;
assert.deepEqual(plain(await retryQueue.flush()),{status:'complete',sent:1,remaining:0});
assert.deepEqual(attempted,[envelopeA.idempotency_key,envelopeA.idempotency_key]);

const blockedQueue=active.bridge.createOfflineQueue({
  storage:memoryStorage(),profileKey:'profile-c',clock:()=>now,
  transport:async()=>{const e=Error('conflict');e.code='L1V01';throw e;}
});
blockedQueue.enqueue(envelopeB);
assert.deepEqual(plain(await blockedQueue.flush()),{status:'blocked',sent:0,remaining:1,code:'L1V01'});
assert.equal(blockedQueue.inspect().length,1,'permanent conflict is retained for explicit resolution');
assert.throws(()=>active.bridge.validateEnvelope({...envelopeA,payload:{accessToken:'bad'}}),/queue_forbidden_field/);
assert.throws(()=>active.bridge.validateEnvelope({...envelopeA,payload:{image:'data:image/png;base64,AAA'}}),/queue_embedded_or_active_content/);
assert.equal(active.bridge.classifyError({status:429}),'transient');
assert.equal(active.bridge.classifyError({code:'42501'}),'permanent');

assert.match(app,/window\.__MTP_L1_SOURCE_FULL__ = source/,'Full registers the complete source getter');
assert.match(mobile,/window\.__MTP_L1_SOURCE_MOBILE__=prepareForSave/,'Mobile registers the complete source getter');
assert.match(packager,/<script defer src="l1-planner\.js"><\/script>/);
assert.match(mobile,/<script defer src="\.\.\/l1-planner\.js"><\/script>/);

console.log('L1B disabled adapters / offline queue / Drive export: PASS');
