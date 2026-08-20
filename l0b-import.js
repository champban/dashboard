(function(){
'use strict';

const KIND_ORDER=['task','subtask','event','event_window','task_attachment'];
const CHUNK_ROWS=500;
const encoder=new TextEncoder();

function bytes(value){return encoder.encode(String(value))}
function join(parts){
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let at=0;
  for(const part of parts){out.set(part,at);at+=part.length}return out;
}
function framed(tag,value){const body=bytes(value);return join([bytes(tag+body.length+':'),body])}
function encInt(value){if(!Number.isSafeInteger(value))throw Error('invalid_integer');return framed('I',String(value))}
function encText(value){return framed('S',String(value).normalize('NFC'))}
function encBytes(value){return join([bytes('P'+value.length+':'),value])}
function encNull(){return bytes('N0:')}
function encBool(value){return bytes(value?'B1:1':'B1:0')}
function encDate(value){const text=String(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error('invalid_date');return bytes('D10:'+text)}
function encNullable(value,encode){return value===undefined||value===null?encNull():encode(value)}
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',value))}
function hex(value){return Array.from(value,b=>b.toString(16).padStart(2,'0')).join('')}
function bytea(value){return '\\x'+hex(value)}

async function chunkHash(seq,kind,payloadText){
  return digest(join([encInt(seq),encText(kind),encBytes(bytes(payloadText))]));
}
function sourceKeys(){
  const keyPart=value=>{const text=String(value).normalize('NFC');return bytes(text).length+':'+text};
  return {
    task:(kind,id)=>'T'+keyPart(kind)+keyPart(id),
    event:id=>'E'+keyPart(id),
    subtask:(parent,id)=>'S'+keyPart(parent)+keyPart(id),
    attachment:(parent,id)=>'A'+keyPart(parent)+keyPart(id)
  };
}
function rowBytes(kind,row){
  const prefix=join([
    encText(kind),encNullable(row.source_key,encText),encNullable(row.parent_source_key,encText),
    encNullable(row.ordinal,encInt),encBool(row.is_active!==false)
  ]),p=row.projected||{};
  if(kind==='task')return join([prefix,encText(p.task_kind),encText(p.title),
    encNullable(p.status_text,encText),encNullable(p.category,encText),
    encNullable(p.priority,encText),encNullable(p.due_date,encDate)]);
  if(kind==='subtask')return join([prefix,encText(p.text),encBool(p.done===true),encInt(p.ordinal)]);
  if(kind==='event')return join([prefix,encText(p.title),encNullable(p.event_type,encText),encNullable(p.category,encText)]);
  if(kind==='event_window')return join([prefix,encDate(p.window_start),encDate(p.window_end)]);
  if(kind==='task_attachment')return join([prefix,encText(p.attachment_kind),
    encNullable(p.display_name,encText),encNullable(p.href,encText),
    encNullable(p.mime_type,encText),encNullable(p.byte_size,encInt),encInt(p.ordinal)]);
  throw Error('unsupported_kind');
}
async function rowHash(kind,row){return digest(rowBytes(kind,row))}
async function setHash(hashes){
  const sorted=hashes.map(value=>new Uint8Array(value)).sort((a,b)=>{
    for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])return a[i]-b[i]}return a.length-b.length;
  });
  return digest(join(sorted));
}

function nullableText(value){return value===undefined||value===null||value===''?null:String(value)}
function taskCategory(task,kind){
  if(kind==='work')return nullableText(task.category??task.project??task.cat);
  return nullableText(task.category??task.cat??task.project);
}
function binaryMarker(item){
  if(!item||typeof item!=='object')return false;
  return ['data','base64','blob','bytes','binary','content','buffer'].some(key=>{
    const value=item[key];return value!==undefined&&value!==null&&value!=='';
  });
}
function projectPayload(payload){
  if(!payload||typeof payload!=='object'||!Array.isArray(payload.personal)||!Array.isArray(payload.work)){
    throw Error('invalid_planner_payload');
  }
  const rows={task:[],subtask:[],event:[],event_window:[],task_attachment:[]};
  const addTasks=(items,taskKind)=>{
    items.forEach(task=>{
      if(!task||typeof task!=='object')return rows.task.push({source_id:null,task_kind:taskKind,title:''});
      rows.task.push({
        source_id:task.id,
        task_kind:taskKind,
        title:String(task.title??''),
        status_text:nullableText(task.status),
        category:taskCategory(task,taskKind),
        priority:nullableText(task.priority),
        due_date:nullableText(task.due)
      });
      (Array.isArray(task.subtasks)?task.subtasks:[]).forEach((subtask,ordinal)=>{
        const value=subtask&&typeof subtask==='object'?subtask:{};
        rows.subtask.push({
          source_id:value.id,
          parent_source_id:task.id,
          parent_task_kind:taskKind,
          text:String(value.text??''),
          done:value.done===true,
          ordinal
        });
      });
      (Array.isArray(task.attachments)?task.attachments:[]).forEach((attachment,ordinal)=>{
        const value=attachment&&typeof attachment==='object'?attachment:{};
        const href=nullableText(value.href??value.url);
        rows.task_attachment.push({
          source_id:value.id,
          parent_source_id:task.id,
          parent_task_kind:taskKind,
          attachment_kind:(value.type==='link'||href)?'link':'file_ref',
          display_name:nullableText(value.label??value.name),
          href,
          mime_type:nullableText(value.mime??value.mimeType??value.mime_type),
          byte_size:Number.isSafeInteger(value.size)&&value.size>=0?value.size:null,
          ordinal,
          has_binary:binaryMarker(value)
        });
      });
    });
  };
  addTasks(payload.personal,'personal');
  addTasks(payload.work,'work');
  (Array.isArray(payload.events)?payload.events:[]).forEach(event=>{
    const value=event&&typeof event==='object'?event:{};
    rows.event.push({
      source_id:value.id,
      title:String(value.title??''),
      event_type:nullableText(value.type),
      category:nullableText(value.category??value.type)
    });
    let windows=Array.isArray(value.windows)?value.windows.filter(w=>w&&(w.start||w.end)):[];
    if(!windows.length&&(value.start||value.end))windows=[{start:value.start||value.end,end:value.end||value.start}];
    windows.forEach((windowValue,ordinal)=>rows.event_window.push({
      parent_source_id:value.id,
      ordinal,
      window_start:String(windowValue.start||windowValue.end||''),
      window_end:String(windowValue.end||windowValue.start||'')
    }));
  });
  return rows;
}

async function planChunks(payload){
  const rows=projectPayload(payload),chunks=[];
  for(const kind of KIND_ORDER){
    for(let offset=0;offset<rows[kind].length;offset+=CHUNK_ROWS){
      const payloadText=JSON.stringify(rows[kind].slice(offset,offset+CHUNK_ROWS));
      const seq=chunks.length;
      chunks.push({seq,kind,payloadText,hash:await chunkHash(seq,kind,payloadText)});
    }
  }
  if(chunks.length)chunks[chunks.length-1].isFinal=true;
  const payloadHash=await digest(join(chunks.map(chunk=>chunk.hash)));
  return {chunks,payloadHash,rows};
}

function rpcRow(data){return Array.isArray(data)?data[0]:data}
function safeRpcError(error,step){
  const code=String(error&&error.code||'rpc_error').replace(/[^0-9A-Za-z_-]/g,'').slice(0,40);
  const wrapped=Error('L0b '+step+' failed ('+code+')');wrapped.code=code;return wrapped;
}
async function importNow(payload){
  const client=window.__MTP_AUTH__&&window.__MTP_AUTH__.client;
  if(!client)throw Error('L0b import is unavailable until sign-in is ready.');
  const plan=await planChunks(payload);
  let claim;
  try{
    const response=await client.rpc('mtp_import_claim',{
      p_client_payload_hash:bytea(plan.payloadHash),
      p_declared_chunk_count:plan.chunks.length,
      p_lease_seconds:120
    });
    if(response.error)throw safeRpcError(response.error,'claim');
    claim=rpcRow(response.data);
    if(!claim||!claim.batch_id)throw Error('L0b claim returned no batch.');
    let heartbeatAt=Date.now();
    for(const chunk of plan.chunks){
      if(Date.now()-heartbeatAt>45000){
        const beat=await client.rpc('mtp_import_heartbeat',{
          p_batch_id:claim.batch_id,p_generation:claim.generation
        });
        if(beat.error)throw safeRpcError(beat.error,'heartbeat');
        heartbeatAt=Date.now();
      }
      const staged=await client.rpc('mtp_import_stage',{
        p_batch_id:claim.batch_id,
        p_generation:claim.generation,
        p_chunk_seq:chunk.seq,
        p_kind:chunk.kind,
        p_chunk_payload:chunk.payloadText,
        p_is_final:chunk.isFinal===true
      });
      if(staged.error)throw safeRpcError(staged.error,'stage');
    }
    const finalized=await client.rpc('mtp_import_finalize',{
      p_batch_id:claim.batch_id,p_generation:claim.generation
    });
    if(finalized.error)throw safeRpcError(finalized.error,'finalize');
    const result=rpcRow(finalized.data);
    if(!result)throw Error('L0b finalize returned no evidence.');
    return result;
  }catch(error){
    if(claim&&claim.batch_id){
      try{await client.rpc('mtp_import_abort',{
        p_batch_id:claim.batch_id,p_generation:claim.generation,p_reason:'client_abort'
      })}catch{}
    }
    throw error;
  }
}

window.__MTP_L0B__=Object.freeze({
  importNow,
  projectPayload,
  planChunks,
  chunkHash,
  encInt,
  encText,
  encBytes,
  encNull,
  encBool,
  encDate,
  sourceKeys:sourceKeys(),
  rowBytes,
  rowHash,
  setHash,
  hex
});
})();
