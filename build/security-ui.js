(function(){
'use strict';
function lockCredentialFields(root){
  (root||document).querySelectorAll('label').forEach(function(label){
    var text=(label.textContent||'').trim().toUpperCase();
    if(!/(ANTHROPIC API KEY|GOOGLE API KEY|GOOGLE OAUTH CLIENT ID)/.test(text))return;
    var box=label.parentElement;if(!box)return;
    box.style.display='none';
    box.querySelectorAll('input,textarea').forEach(function(i){i.value='';i.disabled=true;i.readOnly=true;i.autocomplete='off'});
  });
  var cloud=[...(root||document).querySelectorAll('span,div')].find(function(el){return (el.textContent||'').trim()==='☁️ CLOUD STORAGE'});
  if(cloud&&cloud.parentElement&&!cloud.parentElement.querySelector('[data-mtp-security-note]')){
    var note=document.createElement('div');note.dataset.mtpSecurityNote='1';note.textContent='Drive sync uses your signed-in Google account. OAuth credentials are managed by this deployment; Local JSON and offline use remain available.';note.style.cssText='margin:8px 0;padding:9px 11px;border:1px solid #0f766e55;border-radius:8px;background:#0f766e12;color:var(--c-text-muted);font-size:11px;font-weight:700';cloud.parentElement.insertBefore(note,cloud.nextSibling);
  }
}
lockCredentialFields(document);
new MutationObserver(function(rs){rs.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType===1)lockCredentialFields(n)})})}).observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
})();
