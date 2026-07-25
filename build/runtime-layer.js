(function(){
  'use strict';
  document.documentElement.dataset.mtpPro='3.77.0';
  var skip=document.createElement('a');
  skip.id='mtp-pro-skip';skip.href='#root';skip.textContent='Skip to application';
  document.body.prepend(skip);
  var net=document.createElement('div');net.id='mtp-network-banner';net.setAttribute('role','status');net.setAttribute('aria-live','polite');document.body.appendChild(net);
  var err=document.createElement('div');err.id='mtp-runtime-banner';err.setAttribute('role','alert');document.body.appendChild(err);
  function updateNetwork(){
    if(navigator.onLine){net.classList.remove('mtp-banner-visible');net.textContent='';}
    else{net.textContent='Offline — changes remain on this device. Google Drive sync will resume after reconnection.';net.classList.add('mtp-banner-visible');}
  }
  window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);updateNetwork();
  var errorTimer;
  function reportRuntime(){
    err.textContent='A display error was detected. Your saved data was not deleted. Save a backup, then reload the app.';
    err.classList.add('mtp-banner-visible');clearTimeout(errorTimer);errorTimer=setTimeout(function(){err.classList.remove('mtp-banner-visible')},12000);
  }
  window.addEventListener('error',function(e){if(e && e.target && (e.target.tagName==='SCRIPT'||e.target.tagName==='LINK')) return; reportRuntime();});
  window.addEventListener('unhandledrejection',reportRuntime);
  function improveA11y(root){
    (root||document).querySelectorAll('button:not([aria-label])').forEach(function(btn){
      var text=(btn.textContent||'').replace(/\s+/g,' ').trim();
      var label=btn.getAttribute('title')||text;
      if(label) btn.setAttribute('aria-label',label.slice(0,120));
    });
    (root||document).querySelectorAll('img:not([alt])').forEach(function(img){img.alt='';});
  }
  improveA11y(document);
  var observer=new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(function(n){if(n.nodeType===1) improveA11y(n);});});});
  observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
})();
