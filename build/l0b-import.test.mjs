import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {TextEncoder} from 'node:util';

const calls=[];
const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='mtp_import_claim')return{data:[{batch_id:'10000000-0000-4000-8000-000000000001',generation:1}],error:null};
  if(name==='mtp_import_finalize')return{data:[{batch_id:'10000000-0000-4000-8000-000000000001',status:'succeeded',reject_count:0}],error:null};
  return{data:[{}],error:null};
}};
const window={__MTP_AUTH__:{client}};
const context=vm.createContext({window,crypto:webcrypto,TextEncoder,URL,console,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('l0b-import.js','utf8'),context,{filename:'l0b-import.js'});
const bridge=window.__MTP_L0B__;
assert.ok(bridge,'manual import bridge is published');
assert.equal(bridge.enabled,false,'Packet A keeps shipped import controls fail closed');

const canonical=JSON.parse(fs.readFileSync('test/vectors/l0b-canonical.json','utf8'));
const chunkVectors=JSON.parse(fs.readFileSync('test/vectors/l0b-chunk-bytes.json','utf8'));
assert.equal(canonical.assertions.length,14,'approved canonical vector set has 14 assertions');
assert.equal(chunkVectors.vectors.length,8,'exact-byte suite has eight shared payload vectors');
const fromHex=value=>Uint8Array.from(value.match(/../g).map(part=>Number.parseInt(part,16)));
const concat=values=>values.reduce((all,value)=>{
  const next=new Uint8Array(all.length+value.length);next.set(all);next.set(value,all.length);return next;
},new Uint8Array());
const rowHashes={};
for(const [id,vector] of Object.entries(canonical.rows)){
  rowHashes[id]=await bridge.rowHash(vector.kind,vector.row);
  assert.equal(bridge.hex(rowHashes[id]),vector.sha256,'shared row vector '+id);
}
for(const [id,vector] of Object.entries(canonical.sets)){
  const actual=await bridge.setHash(vector.members.map(member=>rowHashes[member]));
  assert.equal(bridge.hex(actual),vector.sha256,'shared set vector '+id);
}
const chunks={};
for(const vector of chunkVectors.vectors){
  chunks[vector.id]=await bridge.chunkHash(vector.seq,vector.kind,vector.payload);
  assert.equal(bridge.hex(chunks[vector.id]),vector.sha256,'shared exact-byte vector '+vector.id);
}
for(const [id,vector] of Object.entries(canonical.chunk_chains)){
  const actual=new Uint8Array(await webcrypto.subtle.digest('SHA-256',concat(vector.members.map(member=>chunks[member]))));
  assert.equal(bridge.hex(actual),vector.sha256,'shared chunk-chain vector '+id);
}
assert.notEqual(canonical.rows.task_personal.row.source_key,canonical.rows.task_work.row.source_key);
assert.notEqual(canonical.rows.task_personal.sha256,canonical.rows.task_work.sha256);
assert.notEqual(canonical.rows.task_null.sha256,canonical.rows.task_empty.sha256);
assert.equal(canonical.rows.task_nfc.sha256,canonical.rows.task_nfd.sha256);
assert.notEqual(canonical.rows.delimiter_single.sha256,canonical.rows.delimiter_split.sha256);
assert.equal(canonical.sets.tasks_ab.sha256,canonical.sets.tasks_ba.sha256);
assert.notEqual(canonical.sets.task_single.sha256,canonical.sets.task_double.sha256);
assert.notEqual(canonical.rows.subtask_parent_a.row.source_key,canonical.rows.subtask_parent_b.row.source_key);
assert.notEqual(canonical.sets.windows_original.sha256,canonical.sets.windows_reordered.sha256);
assert.equal(canonical.sets.events_ab.sha256,canonical.sets.events_ba.sha256);
assert.equal(bridge.hex(bridge.encBool(true)),canonical.primitives.bool_true_hex);
assert.equal(bridge.hex(bridge.encText('1')),canonical.primitives.text_one_hex);
assert.notEqual(canonical.primitives.bool_true_hex,canonical.primitives.text_one_hex);
assert.equal(bridge.hex(bridge.encDate('2026-01-05')),canonical.primitives.date_hex);
assert.equal(bridge.hex(bridge.encText('2026-01-05')),canonical.primitives.text_date_hex);
assert.notEqual(canonical.primitives.date_hex,canonical.primitives.text_date_hex);
assert.notEqual(canonical.chunk_chains.full.sha256,canonical.chunk_chains.omitted.sha256);

const payload={personal:[{
  id:1,title:'Personal',status:'pending',cat:'Home',priority:'High',due:'2026-08-20',
  subtasks:[{id:11,text:'x'.repeat(121),done:false}],
  attachments:[{id:12,type:'file',name:'photo.jpg',mimeType:'image/jpeg',size:123,data:'data:image/jpeg;base64,PRIVATE'}]
}],work:[{id:1,title:'Work',status:'todo',project:'Alpha',subtasks:[],attachments:[]}],events:[{
  id:'event-1',title:'Planning',type:'Planning',windows:[{start:'2026-09-02',end:'2026-09-01'}]
}]};
const projected=bridge.projectPayload(payload);
assert.equal(projected.task.length,2);
assert.equal(projected.task[0].task_kind,'personal');
assert.equal(projected.task[1].task_kind,'work');
assert.equal(projected.subtask[0].text.length,121,'D-1 preserves subtask text above the AI-only 120 cap');
assert.deepEqual(JSON.parse(JSON.stringify(projected.event_window[0])),{
  parent_source_id:'event-1',ordinal:0,window_start:'2026-09-02',window_end:'2026-09-01'
},'D-1 preserves inverted date windows as anomaly evidence');
assert.equal(projected.task_attachment[0].has_binary,true);
assert.equal(projected.task_attachment[0].mime_type,'image/jpeg');
assert.equal('data' in projected.task_attachment[0],false,'binary content never enters transport');
assert.doesNotMatch(JSON.stringify(projected),/PRIVATE/);

const first=await bridge.chunkHash(0,'task','[{"a":1}]');
const whitespace=await bridge.chunkHash(0,'task','[{"a": 1}]');
const reordered=await bridge.chunkHash(0,'task','[{"b":2,"a":1}]');
assert.notEqual(bridge.hex(first),bridge.hex(whitespace),'transport hash attests exact whitespace bytes');
assert.notEqual(bridge.hex(first),bridge.hex(reordered),'transport hash attests exact key order');

const emptyPlan=await bridge.planChunks({personal:[],work:[],events:[]});
assert.equal(emptyPlan.chunks.length,0);
assert.equal(bridge.hex(emptyPlan.payloadHash),createHash('sha256').update('').digest('hex'));

const result=await bridge.importNow(payload);
assert.equal(result.status,'succeeded');
assert.deepEqual(calls.map(call=>call.name),[
  'mtp_import_claim','mtp_import_stage','mtp_import_stage','mtp_import_stage',
  'mtp_import_stage','mtp_import_stage','mtp_import_finalize'
]);
assert.ok(calls[0].args.p_client_payload_hash.startsWith('\\x'));
const stages=calls.filter(call=>call.name==='mtp_import_stage');
assert.deepEqual(stages.map(call=>call.args.p_chunk_seq),[0,1,2,3,4]);
assert.equal(stages.at(-1).args.p_is_final,true);
assert.equal(stages.slice(0,-1).some(call=>call.args.p_is_final),false);

const app=fs.readFileSync('src/App.jsx','utf8');
const mobile=fs.readFileSync('mobile/index.html','utf8');
assert.equal((app.match(/id="l0bImportFull"/g)||[]).length,1,'Full keeps one reviewed manual control in source');
assert.equal((mobile.match(/id="l0bImportMobile"/g)||[]).length,1,'Mobile keeps one reviewed manual control in source');
assert.match(app,/window\.__MTP_L0B__\?\.enabled===true && \(/,
  'Full renders the control only behind the disabled bridge gate');
assert.match(mobile,/window\.__MTP_L0B__\?\.enabled===true\?`<div class="sync-card card"><h3>Database foundation/,
  'Mobile renders the control only behind the disabled bridge gate');
assert.match(app,/bridge\?\.enabled!==true\|\|!bridge\?\.importNow/,
  'Full handler also fails closed if invoked without activation');
assert.match(mobile,/bridge\?\.enabled!==true\|\|!bridge\?\.importNow/,
  'Mobile handler also fails closed if invoked without activation');
for(const source of [app,mobile]){
  assert.doesNotMatch(source,/l0bDataFoundation/);
  assert.doesNotMatch(source,/set(?:Timeout|Interval)\([^)]*importNow/s,'no timer invokes L0b import');
}
assert.doesNotMatch(fs.readFileSync('l0b-import.js','utf8'),/__MTP_LINE__|driveUpdate|Save to Cloud/,'manual importer is isolated from LINE and Drive');

console.log('L0b exact-byte/manual import client: PASS');
