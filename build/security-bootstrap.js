(function(){
'use strict';
const SECURITY_VERSION='3.77.1-security';
const MAX_JSON_CHARS=52428800;
const MAX_FILE_BYTES=52428800;
const DANGEROUS_KEYS=new Set(['__proto__','prototype','constructor']);
const SECRET_KEYS=new Set(['anthropicKey','googleApiKey','apiKey','api_key','clientSecret','client_secret','accessToken','access_token','refreshToken','refresh_token','idToken','id_token']);
const SUPABASE_AUTH_STORAGE_KEY='sb-qjaywadzvwvcspdsjxth-auth-token';
const originalJSONParse=JSON.parse.bind(JSON);
const originalJSONStringify=JSON.stringify.bind(JSON);
function secureReviver(userReviver){return function(k,v){if(DANGEROUS_KEYS.has(k))return undefined;return typeof userReviver==='function'?userReviver.call(this,k,v):v}}
JSON.parse=function(text,reviver){if(typeof text==='string'&&text.length>MAX_JSON_CHARS)throw new Error('JSON file is too large for safe browser processing.');return originalJSONParse(text,secureReviver(reviver))};
function redactObject(value,seen){if(!value||typeof value!=='object')return value;seen=seen||new WeakSet();if(seen.has(value))return value;seen.add(value);if(Array.isArray(value)){value.forEach(v=>redactObject(v,seen));return value}Object.keys(value).forEach(k=>{if(SECRET_KEYS.has(k))value[k]='';else redactObject(value[k],seen)});return value}
function redactStoredValue(value){if(typeof value!=='string')return value;const s=value.trim();if(!(s.startsWith('{')||s.startsWith('[')))return value;try{const parsed=originalJSONParse(value);redactObject(parsed);return originalJSONStringify(parsed)}catch{return value}}
function protectStoredValue(key,value){const text=String(value);return String(key)===SUPABASE_AUTH_STORAGE_KEY?text:redactStoredValue(text)}
try{const nativeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){return nativeSet.call(this,k,protectStoredValue(k,v))};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i),v=localStorage.getItem(k),safe=protectStoredValue(k,v);if(safe!==v)localStorage.setItem(k,safe)}}catch(e){}
const innerDesc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
const nativeInnerGet=innerDesc&&innerDesc.get;
const nativeInnerSet=innerDesc&&innerDesc.set;
const ALLOWED_TAGS=new Set(['A','B','BLOCKQUOTE','BR','CODE','DIV','EM','H1','H2','H3','H4','H5','H6','HR','I','IMG','LI','OL','P','PRE','S','SPAN','STRONG','TABLE','TBODY','TD','TH','THEAD','TR','U','UL']);
const DROP_TAGS=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','OPTION','SVG','MATH','LINK','META']);
const GLOBAL_ATTRS=new Set(['class','title','data-mention-type','data-mention-id','data-note-img']);
const STYLE_PROPS=new Set(['text-align','width','max-width','border-radius','background','background-color','border','border-left','padding','margin','margin-top','margin-bottom','font-weight','color','font-size','line-height','white-space']);
function safeURL(raw,kind){try{const v=String(raw||'').trim();if(!v)return '';if(kind==='img'&&(v.startsWith('data:image/')||v.startsWith('blob:')))return v;const u=new URL(v,location.href);if(u.protocol==='https:'||u.protocol==='http:'||kind!=='img'&&(u.protocol==='mailto:'||u.protocol==='tel:'))return u.href;if(v.startsWith('#'))return v}catch(e){}return ''}
function cleanStyle(styleText){const out=[];String(styleText||'').split(';').forEach(part=>{const i=part.indexOf(':');if(i<1)return;const p=part.slice(0,i).trim().toLowerCase(),v=part.slice(i+1).trim();if(!STYLE_PROPS.has(p)||!/^[#(),.%\-\w\s]+$/.test(v)||/url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(v))return;out.push(p+':'+v)});return out.join(';')}
function sanitizeHTML(input){if(!nativeInnerSet||!nativeInnerGet)return String(input||'');const t=document.createElement('template');nativeInnerSet.call(t,String(input||''));const walker=document.createTreeWalker(t.content,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_COMMENT);const remove=[];while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===8){remove.push(n);continue}if(!ALLOWED_TAGS.has(n.tagName)){if(DROP_TAGS.has(n.tagName))n.textContent='';remove.push(n);continue}[...n.attributes].forEach(a=>{const name=a.name.toLowerCase();if(name.startsWith('on')||['srcdoc','formaction','xlink:href','xmlns'].includes(name)){n.removeAttribute(a.name);return}if(name==='style'){const s=cleanStyle(a.value);s?n.setAttribute('style',s):n.removeAttribute('style');return}if(n.tagName==='A'&&name==='href'){const u=safeURL(a.value,'link');u?n.setAttribute('href',u):n.removeAttribute('href');return}if(n.tagName==='IMG'&&name==='src'){const u=safeURL(a.value,'img');u?n.setAttribute('src',u):n.removeAttribute('src');return}const allowed=GLOBAL_ATTRS.has(name)||(n.tagName==='A'&&['href','target','rel'].includes(name))||(n.tagName==='IMG'&&['src','alt','width','height'].includes(name))||(n.tagName==='TD'&&['colspan','rowspan'].includes(name))||(n.tagName==='TH'&&['colspan','rowspan'].includes(name));if(!allowed)n.removeAttribute(a.name)});if(n.tagName==='A'&&n.getAttribute('target')==='_blank')n.setAttribute('rel','noopener noreferrer')}
remove.reverse().forEach(n=>{if(n.nodeType===1&&n.childNodes.length)n.replaceWith(...n.childNodes);else n.remove()});return nativeInnerGet.call(t)}
if(innerDesc&&nativeInnerSet&&nativeInnerGet){Object.defineProperty(Element.prototype,'innerHTML',{configurable:innerDesc.configurable,enumerable:innerDesc.enumerable,get:nativeInnerGet,set:function(v){if(this.matches&&this.matches('[data-mtp-note-editor]'))return nativeInnerSet.call(this,sanitizeHTML(v));return nativeInnerSet.call(this,v)}})}
if(document.execCommand){const nativeExec=document.execCommand.bind(document);document.execCommand=function(cmd,ui,val){if(String(cmd).toLowerCase()==='inserthtml')val=sanitizeHTML(val);return nativeExec(cmd,ui,val)}}
const nativeFetch=window.fetch&&window.fetch.bind(window);if(nativeFetch)window.fetch=function(input,init){let u;try{u=new URL(typeof input==='string'?input:input.url,location.href)}catch{return nativeFetch(input,init)}if(u.hostname==='api.anthropic.com')return Promise.reject(new Error('Direct AI API calls are disabled in the static security build. Use a secured backend proxy.'));return nativeFetch(input,init)};
function hardenExternalLinks(root){(root||document).querySelectorAll('a[target="_blank"]').forEach(a=>a.setAttribute('rel','noopener noreferrer'))}
document.addEventListener('paste',function(e){const ed=e.target&&e.target.closest&&e.target.closest('[data-mtp-note-editor]');if(!ed)return;const html=e.clipboardData&&e.clipboardData.getData('text/html');if(html){e.preventDefault();document.execCommand('insertHTML',false,sanitizeHTML(html))}},true);
document.addEventListener('drop',function(e){const ed=e.target&&e.target.closest&&e.target.closest('[data-mtp-note-editor]');if(ed)setTimeout(()=>{ed.innerHTML=ed.innerHTML},0)},true);
document.addEventListener('blur',function(e){const ed=e.target&&e.target.closest&&e.target.closest('[data-mtp-note-editor]');if(ed)ed.innerHTML=ed.innerHTML},true);
document.addEventListener('change',function(e){const input=e.target;if(!input||input.type!=='file'||!input.files||!input.files[0])return;if(input.files[0].size>MAX_FILE_BYTES){e.preventDefault();e.stopImmediatePropagation();input.value='';alert('File is too large for safe browser processing. Maximum '+Math.round(MAX_FILE_BYTES/1048576)+' MB.')}},true);
document.addEventListener('click',function(){hardenExternalLinks(document)},true);
new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)hardenExternalLinks(n)}))).observe(document.documentElement,{childList:true,subtree:true});
window.__MTP_SECURITY__=Object.freeze({version:SECURITY_VERSION,sanitizeHTML,safeURL});
})();
