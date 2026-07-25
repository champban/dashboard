(function(){
    try {
      var themeId='claude';
      for (var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('lifeplanner-config')!==-1){try{var cfg=JSON.parse(localStorage.getItem(k));if(cfg&&cfg.themeId){themeId=cfg.themeId;break;}}catch(e){}}}
      var DARK={dark:{bg:'#0a0f1a',surface:'#1e293b',surface2:'#111827',border:'#334155',text:'#f1f5f9',muted:'#64748b',card2:'#0f172a',accent:'#6366f1'},midnight:{bg:'#060b18',surface:'#0f1f3d',surface2:'#091529',border:'#1e3a5f',text:'#e2f0ff',muted:'#5b7fa6',card2:'#091529',accent:'#3b82f6'},forest:{bg:'#0a110c',surface:'#162018',surface2:'#0d1810',border:'#2d4a30',text:'#e8f5ea',muted:'#5a8060',card2:'#0d1810',accent:'#22c55e'}};
      var t=DARK[themeId];
      if(t){var r=document.documentElement.style;r.setProperty('--c-bg',t.bg);r.setProperty('--c-surface',t.surface);r.setProperty('--c-surface2',t.surface2);r.setProperty('--c-border',t.border);r.setProperty('--c-text',t.text);r.setProperty('--c-text-muted',t.muted);r.setProperty('--c-card2',t.card2);r.setProperty('--c-card',t.surface);r.setProperty('--c-input',t.card2);r.setProperty('--c-accent',t.accent);r.setProperty('--c-hover',t.accent+'22');r.setProperty('--c-row-odd',t.surface2);document.documentElement.style.background=t.bg;}
    }catch(e){}
  })();
