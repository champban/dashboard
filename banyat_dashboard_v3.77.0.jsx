import { useState, useEffect, useMemo, useRef } from "react";
import React from "react";

// ─── App Version ──────────────────────────────────────────────────────────────
const APP_VERSION   = "3.77.0";
const APP_BUILD     = "2026-06-27";

// ─── All configurable defaults — overridable from Config tab ─────────────────
const DEFAULT_CONFIG = {
  themeId:      "claude",
  fontFamily:   "system",
  fontSize:     14,
  lang:         "EN",
  ganttZoom:    "2y",
  ganttWeeks:   true,
  ganttDates:   false, // N45: show short dd/mm labels under the week row
  ganttBarLines: false, // N48: show 3-line bars (title / dates / description)
  ganttCustomStart: "",  // N50: custom view window — start date (ISO)
  ganttCustomDur: 6,     // N50: duration value
  ganttCustomUnit: "m",  // N50: d | w | m | y
  timelineFontSize: 12,        // N53
  timelineFontFamily: "system",// N53
  timelineTheme: "classic",    // N59
  timelineDetails: false,      // N62: show dates + description inside bars
  timelineCompact: false,      // N88: squeeze lanes/bars for a denser overview
  timelineActiveView: "",      // N59: last-selected saved view (re-applied on open)
  ganttActiveView: "",         // N59
  // N56: remembered data-file location. Browsers cannot open an absolute path
  // without the user picking it once, so this is a HINT shown next to Open/Save
  // (and used as the download filename). Chrome/Edge also reopen the last
  // folder via the File System Access API once permission is granted.
  defaultFilePath: "",  // N91: no personal path baked in — user sets their own
  gsyncAuto: true,     // auto-push edits to Google Drive
  ganttFontSize: 11,   // N43: font size for gantt bars + labels
  ganttFontFamily: "system", // N43
  defaultTab:   "milestones", // N59: the Timeline page (tab id kept as "milestones")
  autoSavePrompt: true,
  defaultFileName: "", // Q2: user's preferred save filename (folder handle stored separately in IDB)
  defaultStartFolder: "documents", // N25: which system folder file dialogs open in by default
  backupReminderWeeks: 1, // A1: nudge to back up every N weeks (user-configurable, 1-16)
  calFontSize: 12,        // N36: calendar day-cell font size (px), configurable in Calendar
  calFontFamily: "system", // N36: calendar font family
  // AI + Cloud keys (user-supplied, stored in profile file)
  anthropicKey:  "",
  googleApiKey:  "",
  googleClientId:"",
  msAppId:       "",
};
const CHANGELOG = [
  {
    version: "3.9.1",
    date: "2026-06-30",
    prev: "3.9.0",
    changes: [
      "🏷️ Renamed app: 'Life Planner Dashboard' → 'My Todo Planner' (display only — internal storage keys unchanged for data safety)",
      "📂 Config → Default Data File: new 'Browse…' button opens a native file picker and sets the chosen file as default in one step",
      "📂 Browse uses File System Access API on Chrome/Edge (real handle persisted) with Safari/Firefox fallback to manual file input",
    ],
    breaking: [],
  },
  {
    version: "3.6.1",
    date: "2026-06-27",
    prev: "3.6.0",
    changes: [
      "💾 Save/Save As now bundles ALL data + config + attachments in one JSON file",
      "💾 Save overwrites existing file by same name (standard app behaviour, ⌘S)",
      "💾 Save As: type a new name or keep existing — full flexibility",
      "💾 Auto-save prompt: when profile file is known, confirm 'Save changes?' before overwriting",
      "📊 Gantt: 3-month view added (3m button); week numbers ON by default",
      "🏠 Overview: No-Date tasks shown inline (editable) — No Date tab removed",
      "⚙️ Config tab: all defaults configurable (theme, font, language, default tab, Gantt zoom/weeks)",
      "📅 Work tasks: setting Start Date auto-fills End Date to same value (user can change after)",
      "🎨 Dark backgrounds replaced with readable warm-dark slate tones; text contrast improved",
      "🕐 Activity tab: tracks ALL data file changes (add/edit/delete/status/pin + config + profile)",
      "🐛 Senior audit: no-date IIFE fixed, notification IIFE cleaned, snapshot size capped at 20",
    ],
    breaking: [],
  },
  {
    version: "3.6.0",
    date: "2026-06-27",
    prev: "3.5.0",
    changes: [
      "Activity per-entry ↩ Restore button — jump back to any past state",
      "Open Profile Data in File menu — opens JSON = loads profile = login",
      "Activity now tracks 20 entries with snapshots",
    ],
    breaking: [],
  },
];

const ACTIVITY_KEY    = "lifeplanner-activity-v1";
const CONFIG_KEY      = "lifeplanner-config-v1";
const CUSTOM_TABS_KEY = "lifeplanner-custom-tabs-v1";
const WIDGET_KEY      = "lifeplanner-widgets-v1";
const IDB_NAME        = "lifeplanner-dashboard";
const IDB_STORE       = "attachments";
// N-DefaultFile removed in v3.12.0 — superseded by simpler "Open…" flow
const PROFILES_KEY    = "lifeplanner-profiles";        // list of profile metadata
const ACTIVE_PROF_KEY = "lifeplanner-active-profile";  // currently active profile id

// ─── Profile key builders ─────────────────────────────────────────────────────
const profKey = (profileId, key) => `${profileId}::${key}`;

// No hardcoded default profile — user creates their own on first launch

function getProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveProfiles(list) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch {}
}
function getActiveProfileId() {
  try { return localStorage.getItem(ACTIVE_PROF_KEY) || null; } catch { return null; }
}
function setActiveProfileId(id) {
  try { localStorage.setItem(ACTIVE_PROF_KEY, id); } catch {}
  __activeProfIdG = id; // keep module-level scope helper in sync (6-dim audit fix)
}
// 6-dim audit fix: profile-scoped key helper usable from ANY component.
// Mirrors App's pk(): tab components previously wrote RAW keys while loads read
// profile-scoped keys — edits from those paths were silently lost on reload.
let __activeProfIdG = getActiveProfileId();
const pkG = (key) => __activeProfIdG ? profKey(__activeProfIdG, key) : key;

// ─── GOOGLE DRIVE SYNC ENGINE ────────────────────────────────────────────────
// Frontend-only OAuth via Google Identity Services (GIS). No client secret; the
// access token lives in memory only. All Drive calls use the plain REST API so
// there is no heavy SDK to bundle. drive.file scope = we can only see files this
// app created or the user explicitly picked — never their whole Drive.
const GDrive = (() => {
  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;
  let gisReady = false;

  const loadGIS = () => new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { gisReady = true; return resolve(); }
    const existing = document.getElementById("gis-script");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.id = "gis-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => { gisReady = true; resolve(); };
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });

  // Interactive sign-in (must be triggered by a user click, or the popup is blocked)
  let lastHint = null;   // remember the last account so Connect skips the chooser
  try { lastHint = localStorage.getItem("gdrive-last-email") || null; } catch {}

  const signIn = ({silent=false}={}) => new Promise(async (resolve, reject) => {
    try {
      await loadGIS();
      const cfg = {
        client_id: GDRIVE_CLIENT_ID,
        scope: GDRIVE_SCOPE,
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error));
          accessToken = resp.access_token;
          tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in*1000 : 3600*1000) - 60000;
          resolve(accessToken);
        },
        error_callback: (err) => reject(new Error(err?.type || "sign-in cancelled")),
      };
      // A: if we've signed in before on this browser, pre-select that account so
      // the user doesn't pick from a list or re-approve — it becomes one tap.
      if (lastHint) cfg.login_hint = lastHint;
      tokenClient = window.google.accounts.oauth2.initTokenClient(cfg);
      // silent = no UI at all (needs a live Google session; blocked by 3rd-party
      // cookie rules in most browsers, so it's best-effort). Otherwise: once we
      // have a remembered account + granted scope, prompt:"" reuses them quietly;
      // only the very first time do we show the consent screen.
      const promptMode = silent ? "none" : ((accessToken || lastHint) ? "" : "consent");
      tokenClient.requestAccessToken({ prompt: promptMode });
    } catch (e) { reject(e); }
  });

  // try to get a token WITHOUT showing any UI (for auto sign-in on app open)
  const trySilent = async () => { try { return await signIn({silent:true}); } catch { return null; } };

  const ensureToken = async () => {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;
    return signIn({}); // interactive if needed
  };

  const signOut = ({forget=false}={}) => {
    if (accessToken && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(accessToken, ()=>{}); } catch {}
    }
    accessToken = null; tokenExpiry = 0;
    if (forget) { lastHint = null; try{ localStorage.removeItem("gdrive-last-email"); }catch{} }
  };

  const isSignedIn = () => !!accessToken && Date.now() < tokenExpiry;

  // after signing in, learn which account it was so next time we can pre-select it
  const rememberAccount = async () => {
    try {
      const tok = accessToken; if (!tok) return;
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers:{ Authorization:`Bearer ${tok}` } });
      if (r.ok) { const j = await r.json(); if (j.email) { lastHint = j.email; try{ localStorage.setItem("gdrive-last-email", j.email); }catch{} } }
    } catch {}
  };

  // ── Drive REST helpers ─────────────────────────────────────────────────────
  const api = async (path, opts={}) => {
    const tok = await ensureToken();
    const res = await fetch(`https://www.googleapis.com/${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${tok}`, ...(opts.headers||{}) },
    });
    if (res.status === 401) { accessToken=null; throw new Error("Google session expired — please reconnect."); }
    if (!res.ok) throw new Error(`Drive error ${res.status}: ${await res.text().catch(()=> "")}`.slice(0,140));
    return res;
  };

  // metadata (id, name, modifiedTime) for a file
  const getMeta = async (fileId) => {
    const res = await api(`drive/v3/files/${fileId}?fields=id,name,modifiedTime,trashed,parents`);
    return res.json();
  };

  // download the JSON body of a file
  const download = async (fileId) => {
    const res = await api(`drive/v3/files/${fileId}?alt=media`);
    return res.text();
  };

  // create a new .json file in the user's Drive, return its id
  const createFile = async (name, content) => {
    const meta = { name, mimeType: "application/json" };
    const boundary = "-------ban" + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(meta) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      content +
      `\r\n--${boundary}--`;
    const res = await api("upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  };

  // overwrite an existing file's contents
  const updateFile = async (fileId, content) => {
    const res = await api(`upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,modifiedTime`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: content,
    });
    return res.json();
  };

  // list the app's .json files so the user can pick one (drive.file scope)
  const listFiles = async () => {
    const res = await api("drive/v3/files?q=" + encodeURIComponent("mimeType='application/json' and trashed=false") +
      "&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime)");
    return (await res.json()).files || [];
  };

  // rename a file on Drive (keeps the same fileId, just changes its name)
  const renameFile = async (fileId, newName) => {
    const res = await api(`drive/v3/files/${fileId}?fields=id,name,modifiedTime`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    return res.json();
  };

  // the folder id that contains a file (null = lives in My Drive root)
  const getParentFolder = async (fileId) => {
    try {
      const res = await api(`drive/v3/files/${fileId}?fields=parents`);
      const j = await res.json();
      return (j.parents && j.parents[0]) || null;
    } catch { return null; }
  };

  const hasRememberedAccount = () => !!lastHint;

  return { loadGIS, signIn, trySilent, signOut, isSignedIn, ensureToken, rememberAccount, hasRememberedAccount, getMeta, download, createFile, updateFile, listFiles, renameFile, getParentFolder };
})();


// ── UUID: entity ids must be globally unique, not just "unique on this machine
//    right now". Date.now() collides when several items are created in the same
//    millisecond (bulk import) or on two machines whose split-files are later
//    merged. crypto.randomUUID() removes that risk; the timestamp fallback keeps
//    older browsers working. Existing numeric ids stay valid — import matches by
//    id either way, so this is backward compatible.
function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map(x=>x.toString(16).padStart(2,"0"));
      return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
    }
  } catch {}
  return `id-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
const idb = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE, { keyPath:"id" });
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror   = () => rej(req.error);
    });
  },
  async put(id, data) {
    try { const db=await this.open(); const tx=db.transaction(IDB_STORE,"readwrite"); tx.objectStore(IDB_STORE).put({id,data}); return true; } catch { return false; }
  },
  async get(id) {
    try { const db=await this.open(); return new Promise((res,rej)=>{ const req=db.transaction(IDB_STORE).objectStore(IDB_STORE).get(id); req.onsuccess=()=>res(req.result?.data||null); req.onerror=()=>rej(req.error); }); } catch { return null; }
  },
  async del(id) {
    try { const db=await this.open(); const tx=db.transaction(IDB_STORE,"readwrite"); tx.objectStore(IDB_STORE).delete(id); return true; } catch { return false; }
  },
  async getAll() {
    try { const db=await this.open(); return new Promise((res,rej)=>{ const req=db.transaction(IDB_STORE).objectStore(IDB_STORE).getAll(); req.onsuccess=()=>res(req.result||[]); req.onerror=()=>rej(req.error); }); } catch { return []; }
  },
};

// ─── Recurrence helpers ───────────────────────────────────────────────────────
// N37: datetime-local <-> ISO helpers (input is LOCAL time; toISOString() is UTC → shifted)
function isoToLocalInput(iso){
  if(!iso) return "";
  const d=new Date(iso); if(isNaN(d)) return "";
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToIso(v){ if(!v) return ""; const d=new Date(v); return isNaN(d)?"":d.toISOString(); }

function nextDueDate(task) {
  if (!task.due && !task.recur) return null;
  const r = (task.recur||"").toLowerCase();
  // Parse due as LOCAL noon to avoid UTC-midnight day-shift
  const base = task.due
    ? (()=>{const [y,m,dd]=task.due.slice(0,10).split("-").map(Number);return new Date(y,(m||1)-1,dd||1,12,0,0);})()
    : new Date();
  const d = new Date(base);
  // N19: generic "every N day(s)/week(s)/month(s)/year(s)" — most flexible, checked first
  const genericMatch = r.match(/every\s+(\d+)\s*(day|week|month|year)/);
  if (genericMatch) {
    const n = parseInt(genericMatch[1], 10);
    const unit = genericMatch[2];
    if (unit==="day") d.setDate(d.getDate()+n);
    else if (unit==="week") d.setDate(d.getDate()+n*7);
    else if (unit==="month") d.setMonth(d.getMonth()+n);
    else if (unit==="year") d.setFullYear(d.getFullYear()+n);
    return fmtLocal(d);
  }
  // N-QuickRecur presets (most specific → least)
  if (r.includes("every 2 weeks") || r.includes("biweekly") || r.includes("fortnight")) {
    d.setDate(d.getDate() + 14);
  } else if (r.includes("weekdays")) {
    // next weekday (skip Sat/Sun)
    do { d.setDate(d.getDate() + 1); } while (d.getDay()===0 || d.getDay()===6);
  } else if (r.includes("daily") || r === "every day") {
    d.setDate(d.getDate() + 1);
  } else if (r.includes("weekly") || r === "every week") {
    d.setDate(d.getDate() + 7);
  } else if (r.includes("monthly") || r === "every month") {
    d.setMonth(d.getMonth() + 1);
  } else if (r.includes("annual") || r.includes("every year") || r.includes("yearly") || r.includes("every march") || r.includes("every sep")) {
    d.setFullYear(d.getFullYear() + 1);
  } else if (r.includes("every 3 months") || r.includes("quarter")) {
    d.setMonth(d.getMonth() + 3);
  } else if (r.includes("jan & jul") || r.includes("jan and jul")) {
    const m = d.getMonth();
    d.setMonth(m < 6 ? 6 : 18 - m); // next Jan or Jul
  } else if (r.includes("automatic")) {
    return null; // managed externally
  } else {
    return null; // unknown pattern
  }
  return fmtLocal(d);
}

function renewRecurringTask(task) {
  const next = nextDueDate(task);
  if (!next) return null;
  return {
    ...task,
    id: newId(),
    due: next,
    status: "pending",
    pinned: false,
    subtasks: (task.subtasks||[]).map(s=>({...s,done:false})),
    progress: 0,
    _renewedFrom: task.id,
  };
}

// ─── Thai calendar ────────────────────────────────────────────────────────────
const THAI_HOLIDAYS_2026 = {
  "2026-01-01": "วันปีใหม่",
  "2026-02-01": "วันตรุษจีน",
  "2026-04-06": "วันจักรี",
  "2026-04-13": "วันสงกรานต์",
  "2026-04-14": "วันสงกรานต์",
  "2026-04-15": "วันสงกรานต์",
  "2026-05-01": "วันแรงงาน",
  "2026-05-04": "วันฉัตรมงคล",
  "2026-06-03": "วันเฉลิมพระราชินี",
  "2026-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2026-08-12": "วันแม่แห่งชาติ",
  "2026-10-13": "วันนวมินทรมหาราช",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-05": "วันพ่อแห่งชาติ",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี",
};
const THAI_HOLIDAYS_2027 = {
  "2027-01-01": "วันปีใหม่",
  "2027-04-06": "วันจักรี",
  "2027-04-13": "วันสงกรานต์",
  "2027-04-14": "วันสงกรานต์",
  "2027-04-15": "วันสงกรานต์",
  "2027-05-01": "วันแรงงาน",
  "2027-05-04": "วันฉัตรมงคล",
  "2027-06-03": "วันเฉลิมพระราชินี",
  "2027-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2027-08-12": "วันแม่แห่งชาติ",
  "2027-12-05": "วันพ่อแห่งชาติ",
  "2027-12-10": "วันรัฐธรรมนูญ",
};
const THAI_HOLIDAYS = {...THAI_HOLIDAYS_2026, ...THAI_HOLIDAYS_2027};
function isThaiHoliday(dateIso) { return THAI_HOLIDAYS[dateIso] || null; }
function toThaiYear(year) { return year + 543; }

// ─── i18n strings ─────────────────────────────────────────────────────────────
const i18n = {
  EN: {
    overview:"🏠 Overview", calendar:"🗓 Calendar", gantt:"📊 Gantt",
    personal:"👤 Personal", work:"💼 Work", activity:"🕐 Activity",
    config:"⚙️ Config", about:"ℹ️ About",
    addTask:"+ Add Task", backup:"💾 Backup", addTab:"+ Add Tab",
    done:"Done", overdue:"Overdue", pending:"Pending",
    today:"Today", noDate:"No date",
    search:"Search all tasks…",
    pinned:"📌 Pinned", upNext:"⚡ Up Next — 90 Days",
    dataUpdated:"Data updated", dataOriginal:"original seed data",
    high:"High", medium:"Medium", low:"Low",
  },
  TH: {
    overview:"🏠 ภาพรวม", calendar:"🗓 ปฏิทิน", gantt:"📊 แผนงาน",
    personal:"👤 ส่วนตัว", work:"💼 งาน", activity:"🕐 กิจกรรม",
    config:"⚙️ ตั้งค่า", about:"ℹ️ เกี่ยวกับ",
    addTask:"+ เพิ่มงาน", backup:"💾 สำรองข้อมูล", addTab:"+ เพิ่มแท็บ",
    done:"เสร็จแล้ว", overdue:"เกินกำหนด", pending:"รอดำเนินการ",
    today:"วันนี้", noDate:"ไม่มีวันกำหนด",
    search:"ค้นหาทุกงาน…",
    pinned:"📌 ปักหมุด", upNext:"⚡ งานที่กำลังมาถึง — 90 วัน",
    dataUpdated:"ข้อมูลอัปเดตล่าสุด", dataOriginal:"ข้อมูลเริ่มต้น",
    high:"สูง", medium:"กลาง", low:"ต่ำ",
  },
};

// Default widget order for Overview
const DEFAULT_WIDGETS = ["pinned","twoweek","stats","upnext","yearband","nodate"]; // N39: +twoweek

// ─── Responsive breakpoint hook ──────────────────────────────────────────────
// Phone  : < 768px
// Tablet : 768–1023px  (iPad Mini, iPad Air, iPad Pro 11" portrait)
// Desktop: ≥ 1024px    (iPad Pro 12.9" landscape, laptop, monitor)
// ─── iFrame compatibility — Google Drive viewer / Claude Artifacts on iPad ────
if (typeof window !== "undefined" && window.self !== window.top) {
  document.addEventListener("click",    ()=>{}, true);
  document.addEventListener("touchend", ()=>{}, true);
  document.addEventListener("touchstart",()=>{}, true);
}


function useBreakpoint() {
  const get = () => {
    if (typeof window === "undefined") return "desktop";
    const w = window.innerWidth;
    if (w < 768)  return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  };
  const [bp, setBp] = useState(get);
  useEffect(()=>{
    const update = () => setBp(get());
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", ()=>setTimeout(update,150));
    return ()=>{
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  },[]);
  return bp;
}
// Convenience aliases
function useIsMobile()  { return useBreakpoint() === "mobile";  }
function useIsTablet()  { return useBreakpoint() === "tablet";  }
function useIsDesktop() { return useBreakpoint() === "desktop"; }

// ─── Bottom nav tabs (mobile + tablet) ───────────────────────────────────────
const BOTTOM_NAV = [
  { id:"timeline",  icon:"🏠", label:"Home"     },
  { id:"today",     icon:"🔥", label:"Today"    },
  { id:"calendar",  icon:"🗓", label:"Calendar" },
  { id:"gantt",     icon:"📊", label:"Gantt"    },
  { id:"personal",  icon:"👤", label:"Personal" },
  { id:"work",      icon:"💼", label:"Work"     },
];

// ─── Google Drive / OneDrive helpers ─────────────────────────────────────────
// Uses Google Picker API — no backend needed, runs entirely in browser
// User picks a .json file from their own Drive; app reads/writes it directly.
// Google Drive sync credentials. Client ID + API key are safe to ship in a
// frontend — Google restricts them to the domain registered in the Cloud
// Console, and the OAuth token flow (GIS) never needs a client secret.
const GDRIVE_API_KEY  = "AIzaSyCGbaaFkWdzM2eSZM0dfED8eu0FOIR2z2o";
const GDRIVE_CLIENT_ID = "369687041884-heue2bffon430f0kfaetcp8mv8kbh8q2.apps.googleusercontent.com";
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GSYNC_KEY = "lifeplanner-gdrive-sync-v1"; // {fileId, fileName, lastSyncAt, lastCloudModified}

// Open a local file (works on all platforms including mobile)
function triggerLocalFileOpen(inputRef) {
  inputRef.current && inputRef.current.click();
}

// Download / upload helpers that work on mobile browsers
// ─────────────────────────────────────────────────────────────────────────────
// N52: SPLIT DATA FILES — Work / Personal / Core, loadable independently.
//
// Safety rules baked in (these are the ways this feature can destroy data):
//  1. A slot that is NOT loaded is NEVER written. "Save All" only writes loaded
//     slots, so opening Personal alone can never blank out the Work file.
//  2. Cross-file @mention links are left intact when the target isn't loaded —
//     they render as "not loaded", they are never stripped.
//  3. Loading a slot clears that slot's storage keys first, so stale rows from a
//     previous file can never mix into the new one.
//  4. Every file carries fileKind + schema; loading a Work file into the
//     Personal slot is refused rather than silently merged.
// ─────────────────────────────────────────────────────────────────────────────
const SPLIT_SCHEMA = 1;
const SPLIT_KINDS  = ["work","personal","core"];

function buildSplitFile(kind, payload, profile) {
  return {
    fileKind: kind,
    schema: SPLIT_SCHEMA,
    appVersion: APP_VERSION,
    profile: profile || null,
    savedAt: new Date().toISOString(),
    data: payload,
  };
}
// Returns { ok:true, kind, data } or { ok:false, error }
function readSplitFile(parsed, expectKind) {
  if (!parsed || typeof parsed!=="object") return {ok:false, error:"Not a valid JSON object"};
  // legacy combined file → let the caller handle it
  if (!parsed.fileKind && (Array.isArray(parsed.personal) || Array.isArray(parsed.work)))
    return {ok:false, error:"combined", combined:true};
  if (!SPLIT_KINDS.includes(parsed.fileKind))
    return {ok:false, error:`Unknown file kind "${parsed.fileKind}"`};
  if (expectKind && parsed.fileKind!==expectKind)
    return {ok:false, error:`This is a ${parsed.fileKind.toUpperCase()} file — it cannot be loaded into the ${expectKind.toUpperCase()} slot`};
  if (Number(parsed.schema)>SPLIT_SCHEMA)
    return {ok:false, error:"This file was written by a newer version of the app"};
  return {ok:true, kind:parsed.fileKind, data:parsed.data};
}
function splitFileName(kind, profileName) {
  const p=(profileName||"profile").replace(/[^a-zA-Z0-9]/g,"-");
  const d=new Date();
  const st=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return `My-Todo-${kind.charAt(0).toUpperCase()+kind.slice(1)}-${p}-${st}.json`;
}

function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  // On iOS, need to open in new tab rather than anchor click
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    const w = window.open(url, "_blank");
    if (!w) {
      // Fallback: use anchor
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

// ─── Group C: AI helper (uses in-artifact Anthropic API; works when published) ──
// Returns text on success, or throws with a friendly message when the API isn't reachable
// (e.g. when the app is opened as a local .html file rather than a published artifact).
async function callClaude(prompt, maxTokens=1000) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role:"user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error("AI unavailable");
  const data = await resp.json();
  const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim();
  if (!text) throw new Error("empty");
  return text;
}


function exportToPDF({ personal, work, profileName }) {
  const esc = (s)=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const today = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"});
  const fmtD = (d)=>d?new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";
  const statusChip = (s)=>{
    const map={done:"#22c55e",overdue:"#ef4444",pending:"#f59e0b",todo:"#6366f1",inprogress:"#3b82f6",review:"#a855f7"};
    return `<span style="background:${map[s]||"#94a3b8"}22;color:${map[s]||"#64748b"};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">${esc(s||"—")}</span>`;
  };
  const rows = (list,type)=>list.map(t=>`
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:600">${t.status==="done"?"✓ ":""}${esc(t.title)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb">${esc(type==="work"?(t.project||"(No Project)"):(t.cat||"—"))}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb">${esc(t.priority||"—")}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${fmtD(t.due)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb">${statusChip(t.status)}</td>
    </tr>`).join("");
  const section = (title,icon,list,type)=>list.length?`
    <h2 style="font-size:15px;margin:24px 0 8px;color:#166534">${icon} ${title} <span style="color:#9ca3af;font-weight:400">(${list.length})</span></h2>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">TASK</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">CATEGORY/PROJECT</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">PRIORITY</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DUE</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">STATUS</th>
      </tr></thead>
      <tbody>${rows(list,type)}</tbody>
    </table>`:"";

  const activePersonal = personal.filter(t=>t.status!=="done");
  const activeWork = work.filter(t=>t.status!=="done");
  const donePersonal = personal.filter(t=>t.status==="done");
  const doneWork = work.filter(t=>t.status==="done");
  const doneTotal = donePersonal.length+doneWork.length;
  const total = personal.length+work.length;
  const rate = total>0?Math.round((doneTotal/total)*100):0;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>My Todo Planner — Report</title></head>
  <body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#1f2937;max-width:800px;margin:0 auto;padding:30px">
    <div style="border-bottom:3px solid #166534;padding-bottom:14px;margin-bottom:8px">
      <h1 style="margin:0;font-size:22px;color:#166534">📋 My Todo Planner</h1>
      <div style="color:#6b7280;font-size:13px;margin-top:4px">${esc(profileName||"")} · Generated ${today}</div>
    </div>
    <div style="display:flex;gap:14px;margin:16px 0;flex-wrap:wrap">
      <div style="flex:1;min-width:100px;background:#f9fafb;border-radius:8px;padding:12px 16px;text-align:center">
        <div style="font-size:22px;font-weight:800">${total}</div><div style="font-size:10px;color:#6b7280">TOTAL</div></div>
      <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#22c55e">${doneTotal}</div><div style="font-size:10px;color:#6b7280">DONE</div></div>
      <div style="flex:1;min-width:100px;background:#eff6ff;border-radius:8px;padding:12px 16px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#6366f1">${rate}%</div><div style="font-size:10px;color:#6b7280">COMPLETE</div></div>
    </div>
    ${section("Personal — Active","🏠",activePersonal,"personal")}
    ${section("Work — Active","💼",activeWork,"work")}
    ${section("Personal — Completed","✅",donePersonal,"personal")}
    ${section("Work — Completed","✅",doneWork,"work")}
    <div style="margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
      Generated by My Todo Planner · ${new Date().toLocaleString("en-GB")}
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
  </body></html>`;

  const w = window.open("","_blank");
  if (!w) { alert("Please allow popups to export PDF"); return; }
  w.document.write(html);
  w.document.close();
}





// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = {
  // ── Claude-inspired: warm off-white surface, subtle orange accent, clean typography
  claude: {
    name: "Claude (Default)", emoji: "🤍",
    bg:         "#f9f7f5",   // warm off-white page background
    surface:    "#ffffff",   // card / panel surface
    surface2:   "#f3f1ee",   // secondary surface (inputs, code blocks)
    border:     "#e8e4df",   // subtle warm grey border
    text:       "#1a1714",   // near-black warm text
    textMuted:  "#7d7168",   // warm medium grey
    accent:     "#d97706",   // Claude's amber/orange accent
    accentText: "#92400e",   // deep amber for text on light
    accentBg:   "#fef3c7",   // soft amber glow for highlights
    cardBg:     "#ffffff",
    inputBg:    "#f9f7f5",
    shadow:     "0 1px 4px rgba(0,0,0,.08)",
    chip:       "#f3f1ee",
    chipText:   "#5c5248",
  },
  dark: {
    name: "Dark", emoji: "🌙",
    bg:         "#0a0f1a", surface: "#1e293b", surface2: "#111827",
    border:     "#334155", text: "#f1f5f9",   textMuted: "#64748b",
    accent:     "#6366f1", accentText: "#a5b4fc", accentBg: "#6366f122",
    cardBg:     "#1e293b", inputBg: "#0f172a",
    shadow:     "0 1px 4px rgba(0,0,0,.4)",
    chip:       "#334155", chipText: "#94a3b8",
  },
  midnight: {
    name: "Midnight Blue", emoji: "🌌",
    bg:         "#060b18", surface: "#0f1f3d", surface2: "#091529",
    border:     "#1e3a5f", text: "#e2f0ff",   textMuted: "#5b7fa6",
    accent:     "#3b82f6", accentText: "#93c5fd", accentBg: "#3b82f622",
    cardBg:     "#0f1f3d", inputBg: "#060b18",
    shadow:     "0 1px 4px rgba(0,0,0,.5)",
    chip:       "#1e3a5f", chipText: "#7bafd4",
  },
  forest: {
    name: "Forest", emoji: "🌲",
    bg:         "#0a110c", surface: "#162018", surface2: "#0d1810",
    border:     "#2d4a30", text: "#e8f5ea",   textMuted: "#5a8060",
    accent:     "#22c55e", accentText: "#86efac", accentBg: "#22c55e22",
    cardBg:     "#162018", inputBg: "#0a110c",
    shadow:     "0 1px 4px rgba(0,0,0,.4)",
    chip:       "#2d4a30", chipText: "#6aaa70",
  },
  light: {
    name: "Light Clean", emoji: "☀️",
    bg:         "#f8fafc", surface: "#ffffff", surface2: "#f1f5f9",
    border:     "#e2e8f0", text: "#0f172a",   textMuted: "#64748b",
    accent:     "#6366f1", accentText: "#4338ca", accentBg: "#6366f112",
    cardBg:     "#ffffff", inputBg: "#f8fafc",
    shadow:     "0 1px 3px rgba(0,0,0,.06)",
    chip:       "#e2e8f0", chipText: "#475569",
  },
  // ── 3 new Light themes ─────────────────────────────────────────────────────
  sky: {
    name: "Sky", emoji: "☁️",
    bg:         "#f0f7ff",   // cool blue-white
    surface:    "#ffffff",
    surface2:   "#e8f4fd",
    border:     "#bfdbfe",   // soft blue border
    text:       "#0c1a2e",
    textMuted:  "#4a6fa5",
    accent:     "#0ea5e9",   // sky blue
    accentText: "#0369a1",
    accentBg:   "#e0f2fe",
    cardBg:     "#ffffff",
    inputBg:    "#f0f7ff",
    shadow:     "0 1px 4px rgba(14,165,233,.10)",
    chip:       "#dbeafe",
    chipText:   "#1d4ed8",
  },
  rose: {
    name: "Rose", emoji: "🌸",
    bg:         "#fff5f7",   // warm pink-white
    surface:    "#ffffff",
    surface2:   "#fce7f0",
    border:     "#fecdd3",   // soft rose border
    text:       "#1a0a10",
    textMuted:  "#9f5c70",
    accent:     "#f43f5e",   // rose
    accentText: "#be123c",
    accentBg:   "#ffe4e9",
    cardBg:     "#ffffff",
    inputBg:    "#fff5f7",
    shadow:     "0 1px 4px rgba(244,63,94,.10)",
    chip:       "#fce7f0",
    chipText:   "#9f1239",
  },
  sage: {
    name: "Sage", emoji: "🌿",
    bg:         "#f0fdf4",   // fresh green-white
    surface:    "#ffffff",
    surface2:   "#dcfce7",
    border:     "#bbf7d0",   // soft green border
    text:       "#0a1a10",
    textMuted:  "#4a8060",
    accent:     "#10b981",   // emerald
    accentText: "#065f46",
    accentBg:   "#d1fae5",
    cardBg:     "#ffffff",
    inputBg:    "#f0fdf4",
    shadow:     "0 1px 4px rgba(16,185,129,.10)",
    chip:       "#dcfce7",
    chipText:   "#065f46",
  },
};

// Default to Claude theme
const DEFAULT_THEME = "claude";


const FONT_FAMILIES = [
  { id:"system", label:"System (default)", value:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif" },
  { id:"inter",  label:"Inter",            value:"'Inter','Segoe UI',sans-serif" },
  { id:"mono",   label:"Monospace",        value:"'JetBrains Mono','Fira Code','Courier New',monospace" },
  { id:"serif",  label:"Serif (elegant)",  value:"'Georgia','Times New Roman',serif" },
  { id:"thai",   label:"Thai-friendly",    value:"'Noto Sans Thai','Sarabun',sans-serif" },
];


const PERSONAL_TASKS = []; // No seed data — user creates their own

const WORK_TASKS_SEED = [];

// ─── Constants ────────────────────────────────────────────────────────────────
const CAT_COLOR = {
  Car:"#60a5fa", Finance:"#a78bfa", Health:"#34d399",
  Home:"#fbbf24", Insurance:"#f87171", Activity:"#22d3ee",
  Tax:"#fb923c", Motorcycle:"#f472b6",
};
const WORK_CAT_COLOR = {
  Strategy:"#818cf8", Operations:"#34d399", HR:"#f472b6",
  Finance:"#a78bfa", Marketing:"#fb923c", IT:"#60a5fa",
  Legal:"#f87171", Admin:"#fbbf24", Other:"#94a3b8",
};
// Q1: Work now uses PROJECT (not category). Default project list + color palette.
const DEFAULT_PROJECTS = ["Lotus General"];
const PROJECT_PALETTE = ["#818cf8","#34d399","#f472b6","#a78bfa","#fb923c","#60a5fa","#f87171","#fbbf24","#2dd4bf","#c084fc","#4ade80","#38bdf8"];
// Deterministic color for any project name (stable across renders)
function projectColor(name) {
  if (!name) return "#94a3b8";
  let h=0; for (let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length];
}

// N74: user overrides for category / project colours. Colour belongs to the GROUP,
// not to a single task, so the timeline stays readable — same group, same colour.
const GROUP_COLORS_KEY = "lifeplanner-group-colors-v1";
let __groupColors = {};                       // module cache, refreshed on load/save
function setGroupColorCache(map){ __groupColors = map || {}; }
function groupColor(name, fallback) {
  if(!name) return fallback || "#94a3b8";
  return __groupColors[name] || fallback || CAT_COLOR[name] || projectColor(name);
}
const GROUP_SWATCHES = ["#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e","#10b981",
  "#14b8a6","#06b6d4","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899",
  "#f43f5e","#64748b","#78716c","#0f766e"];
const PRIORITY_CFG = {
  High:   { color:"#ef4444", bg:"#ef444418" },
  Medium: { color:"#f59e0b", bg:"#f59e0b18" },
  Low:    { color:"#22c55e", bg:"#22c55e18" },
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
// N2 FIX: timezone-safe local date formatter (avoids UTC day-shift in +7 timezone)
const fmtLocal = (d) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
// Timezone-safe parser: "YYYY-MM-DD" → local noon Date (avoids UTC-midnight day-shift in UTC+7).
// Use this everywhere a date string is turned into a Date for positioning/comparison.
const parseDateLocal = (s) => {
  if (!s) return null;
  if (s instanceof Date) return s;
  const [y,m,d] = String(s).slice(0,10).split("-").map(Number);
  return new Date(y, (m||1)-1, d||1, 12, 0, 0, 0);
};
const THIS_YEAR = TODAY.getFullYear();
const THIS_MONTH = TODAY.getMonth();
const MS_DAY = 86400000;
const P_KEY = "lifeplanner-personal-v1";
const W_KEY = "lifeplanner-work-v1";
const EVENTS_KEY = "lifeplanner-events-v1"; // N24: Event items (timespan, no done, calendar+gantt only)
const EVENT_TYPES_KEY = "lifeplanner-event-types-v1"; // N35: named event types with colors
const CAL_VIEWS_KEY   = "lifeplanner-cal-views-v1";   // N35: saved custom calendar view filters
const GANTT_VIEWS_KEY = "lifeplanner-gantt-views-v1"; // N55: saved Gantt filter presets
const TL_VIEWS_KEY    = "lifeplanner-timeline-views-v1"; // N55: saved Timeline filter presets
const DEFAULT_EVENT_TYPES = [
  { id:"holiday",  name:"Thai Holiday",   color:"#ef4444" },
  { id:"personal", name:"Personal Event", color:"#8b5cf6" },
  { id:"work",     name:"Work Event",     color:"#3b82f6" },
  { id:"travel",   name:"Travel",         color:"#f59e0b" },
];
const NOTES_KEY = "lifeplanner-notes-v1"; // N26: Notion-style notes (pages with blocks)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso); d.setHours(0,0,0,0);
  return Math.ceil((d - TODAY) / MS_DAY);
}
// N23: central overdue check — computes fresh from due date + status.
// A task is overdue if it has a due date in the past AND isn't done.
// This avoids relying on a stale `status==="overdue"` field that may not be updated.
function isOverdue(t) {
  if (!t || !t.due) return false;
  if (t.status === "done") return false;
  return daysUntil(t.due) < 0;
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}
function fmtShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
}
function fmtMonthLabel(y, m) {
  return new Date(y, m, 1).toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
}

// ─── 3B. NLP Date Parser — converts natural language to ISO date ──────────────
// Supports EN + TH. Call parseNLPDate("tomorrow") → "2026-07-02" (or null)
function parseNLPDate(input) {
  if (!input || !input.trim()) return null;
  const s = input.trim().toLowerCase();
  const now = new Date(TODAY);
  const toISO = (d) => d.toISOString().slice(0,10);
  const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
  const addWeeks = (d,n) => addDays(d,n*7);
  const addMonths = (d,n) => { const r=new Date(d); r.setMonth(r.getMonth()+n); return r; };

  // ── Exact keywords ──
  if (["today","วันนี้"].includes(s))              return toISO(now);
  if (["tomorrow","พรุ่งนี้","พรุ่งนี้"].includes(s)) return toISO(addDays(now,1));
  if (["yesterday","เมื่อวาน"].includes(s))         return toISO(addDays(now,-1));
  if (["next week","สัปดาห์หน้า"].some(k=>s===k)) {
    const d=new Date(now); d.setDate(d.getDate()+(8-d.getDay())%7||7); return toISO(d);
  }
  if (["end of month","สิ้นเดือน"].some(k=>s===k)) {
    return toISO(new Date(now.getFullYear(),now.getMonth()+1,0));
  }
  if (["end of year","สิ้นปี"].some(k=>s===k)) {
    return toISO(new Date(now.getFullYear(),11,31));
  }
  if (["next month","เดือนหน้า"].some(k=>s===k)) return toISO(addMonths(now,1));

  // ── "in N days/weeks/months" ──
  let m;
  m = s.match(/^in (\d+) days?$/);          if(m) return toISO(addDays(now,+m[1]));
  m = s.match(/^in (\d+) weeks?$/);         if(m) return toISO(addWeeks(now,+m[1]));
  m = s.match(/^in (\d+) months?$/);        if(m) return toISO(addMonths(now,+m[1]));
  m = s.match(/^(\d+) days? (?:from now|later)$/); if(m) return toISO(addDays(now,+m[1]));

  // ── Thai: "อีก N วัน/สัปดาห์/เดือน" ──
  m = s.match(/^อีก\s*(\d+)\s*วัน$/);       if(m) return toISO(addDays(now,+m[1]));
  m = s.match(/^อีก\s*(\d+)\s*สัปดาห์$/);   if(m) return toISO(addWeeks(now,+m[1]));
  m = s.match(/^อีก\s*(\d+)\s*เดือน$/);     if(m) return toISO(addMonths(now,+m[1]));

  // ── "next [weekday]" ──
  const DAYS_EN = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const DAYS_TH = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
  const nextDay = (targetDow) => {
    const d=new Date(now); const curr=d.getDay();
    const diff=(targetDow-curr+7)%7||7; // always go FORWARD
    return addDays(d,diff);
  };
  m = s.match(/^next (\w+)$/);
  if(m) { const i=DAYS_EN.indexOf(m[1]); if(i>=0) return toISO(nextDay(i)); }
  // Thai "วันจันทร์หน้า" etc
  for(let i=0;i<DAYS_TH.length;i++) {
    if(s.includes(DAYS_TH[i])&&(s.includes("หน้า")||s.includes("next"))) return toISO(nextDay(i));
  }

  // ── "this [weekday]" — nearest upcoming ──
  m = s.match(/^this (\w+)$/);
  if(m) {
    const i=DAYS_EN.indexOf(m[1]);
    if(i>=0) { const d=new Date(now); const diff=(i-d.getDay()+7)%7; return toISO(addDays(d,diff||7)); }
  }

  // ── "+N" shorthand ──
  m = s.match(/^\+(\d+)d?$/);  if(m) return toISO(addDays(now,+m[1]));
  m = s.match(/^\+(\d+)w$/);   if(m) return toISO(addWeeks(now,+m[1]));
  m = s.match(/^\+(\d+)m$/);   if(m) return toISO(addMonths(now,+m[1]));

  // ── "DD/MM" or "DD/MM/YYYY" ──
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if(m) {
    const yr = m[3] ? +m[3] : now.getFullYear();
    const dt = new Date(yr,+m[2]-1,+m[1]);
    if(!isNaN(dt)) return toISO(dt);
  }

  return null; // not parseable → let user use date picker
}

// B3: parse a whole task from one natural-language line.
// e.g. "จ่ายค่าไฟ ทุกวันที่ 5"  or  "call dentist tomorrow"  or  "ประชุม every monday"
// Returns { title, recur, isRecurring, due } — title always set; others best-effort.
function parseQuickTask(input) {
  if (!input || !input.trim()) return null;
  let text = input.trim();
  let recur = "", due = "";

  // ── recurrence phrases (strip from title once matched) ──
  const recurRules = [
    [/\bทุกวัน\b|\bevery ?day\b|\bdaily\b/i, "daily"],
    [/\bทุกสัปดาห์\b|\bevery ?week\b|\bweekly\b/i, "weekly"],
    [/\bทุกเดือน\b|\bevery ?month\b|\bmonthly\b/i, "monthly"],
    [/\bทุกปี\b|\bevery ?year\b|\bannually\b|\byearly\b/i, "annually"],
    [/\bทุก\s*3\s*เดือน\b|\bquarterly\b|\bevery 3 months\b/i, "every 3 months"],
    [/\bวันธรรมดา\b|\bweekdays?\b/i, "weekdays (Mon-Fri)"],
    [/\bทุก 2 สัปดาห์\b|\bevery 2 weeks\b|\bbi-?weekly\b/i, "every 2 weeks"],
  ];
  for (const [re,val] of recurRules) {
    if (re.test(text)) { recur = val; text = text.replace(re,"").trim(); break; }
  }

  // ── "ทุกวันที่ N" (monthly on day N) ──
  let m = text.match(/ทุกวันที่\s*(\d{1,2})/);
  if (m) {
    recur = "monthly";
    const day = Math.min(28, Math.max(1, +m[1]));
    const now = new Date(TODAY);
    let d = new Date(now.getFullYear(), now.getMonth(), day, 12);
    if (d < now) d = new Date(now.getFullYear(), now.getMonth()+1, day, 12);
    due = fmtLocal(d);
    text = text.replace(/ทุกวันที่\s*\d{1,2}/,"").trim();
  }

  // ── date phrases: try the whole remainder and common tails ──
  if (!due) {
    const tails = ["tomorrow","today","next week","next month","พรุ่งนี้","วันนี้","สัปดาห์หน้า","เดือนหน้า","สิ้นเดือน","สิ้นปี"];
    for (const t of tails) {
      const re = new RegExp("\\s*"+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s*$","i");
      if (re.test(text)) { const iso=parseNLPDate(t); if(iso){ due=iso; text=text.replace(re,"").trim(); break; } }
    }
  }
  // "in N days/weeks" tail
  if (!due) {
    const m2 = text.match(/(in \d+ (?:days?|weeks?|months?)|อีก\s*\d+\s*(?:วัน|สัปดาห์|เดือน))\s*$/i);
    if (m2) { const iso=parseNLPDate(m2[1]); if(iso){ due=iso; text=text.replace(m2[0],"").trim(); } }
  }

  const title = text.replace(/\s{2,}/g," ").trim() || input.trim();
  return { title, recur, isRecurring: !!recur, due };
}


// Returns a possibly-modified task. Idempotent — only stamps on the done transition.
function stampMilestone(prevTask, nextTask) {
  const wasDone = prevTask?.status==="done";
  const isDone = nextTask?.status==="done";
  if (isDone && !wasDone && nextTask.milestone!==false) {
    // N13: default timestamp = task's end/due date (not "now") — user can edit later in Milestones tab
    const defaultTs = nextTask.due ? new Date(nextTask.due+"T12:00:00").toISOString() : new Date().toISOString();
    return { ...nextTask, milestoneAt: defaultTs };
  }
  if (!isDone && wasDone) {
    // Un-done → clear the milestone timestamp
    const { milestoneAt, ...rest } = nextTask;
    return { ...rest, milestoneAt:"" };
  }
  return nextTask;
}

// N-Rec: when a task in `list` is edited to done, stamp milestone AND if recurring,
// append the next occurrence. Returns new list. Used by tabs without the recur popup.
// `defaultStatus` is "todo" (work) or "pending" (personal) for the spawned task.
function applyEditWithRecur(list, updated, defaultStatus) {
  const prev = list.find(t=>t.id===updated.id);
  const becameDone = prev && prev.status!=="done" && updated.status==="done";
  // N37: strip transient control fields so they never persist on a task
  const strip = (t)=>{ const {_nextDue,_nextCount,_skipNext,...rest}=t; return rest; };
  const stamped = strip(stampMilestone(prev||{}, updated));
  let next = list.map(t=>t.id===updated.id?stamped:t);
  // Spawn next occurrence(s) for recurring task that just became done.
  // N37: honours _nextDue (user-confirmed date) and _nextCount (how many ahead).
  if (becameDone && (updated.isRecurring||updated.recur) && updated._skipNext!==true) {
    const count = Math.max(1, Math.min(12, Number(updated._nextCount)||1));
    let cursorDue = updated._nextDue || nextDueDate(updated);
    const spawned = [];
    for (let i=0;i<count && cursorDue;i++){
      spawned.push({
        ...strip(updated),
        id: newId(),
        status: defaultStatus,
        due: cursorDue,
        startDate: updated.startDate ? cursorDue : "",
        pinned: false,
        milestoneAt: "",
        originalDue: "",
        delayLabel: "",
      });
      cursorDue = nextDueDate({...updated, due:cursorDue});
    }
    const nd = cursorDue;
    if (spawned.length) {
      next = [...next, ...spawned];
    }
  }
  return next;
}

// ─── N39: DateInput — a date field you can TYPE into as well as pick from ────
// Accepts: 2026-07-14 · 14/07/2026 · 14-07-2026 · 14 Jul 2026 · 20260714
// Also accepts natural language ("tomorrow", "พรุ่งนี้", "+3d") via parseNLPDate.
// Shows a 📅 button that opens the browser's native picker.
function normalizeTypedDate(raw){
  if(!raw) return "";
  const s = String(raw).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                       // already ISO
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);     // DD/MM/YYYY
  if(m){ const [_,d,mo,y]=m; return `${y}-${String(+mo).padStart(2,"0")}-${String(+d).padStart(2,"0")}`; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);                            // YYYYMMDD
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);             // 14 Jul 2026
  if(m){
    const idx = MONTHS.findIndex(x=>x.toLowerCase().startsWith(m[2].slice(0,3).toLowerCase()));
    if(idx>=0) return `${m[3]}-${String(idx+1).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
  }
  try{ const nlp = parseNLPDate(s); if(nlp) return nlp; }catch{}
  return null; // unparseable
}
function DateInput({ value, onChange, style={}, placeholder="YYYY-MM-DD or 14/07/2026", disabled=false, title }){
  const [text, setText] = useState(value||"");
  const [bad, setBad]   = useState(false);
  const pickRef = useRef(null);
  useEffect(()=>{ setText(value||""); setBad(false); },[value]);
  const commit = (raw)=>{
    if(!raw.trim()){ setBad(false); onChange(""); return; }
    const iso = normalizeTypedDate(raw);
    if(iso){ setBad(false); setText(iso); onChange(iso); }
    else setBad(true);
  };
  return (
    <div style={{position:"relative",display:"flex",alignItems:"center",width:"100%"}} title={title}>
      <input type="text" inputMode="numeric" value={text} disabled={disabled} placeholder={placeholder}
        onChange={e=>{setText(e.target.value); if(bad) setBad(false);}}
        onBlur={e=>commit(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(e.currentTarget.value); e.currentTarget.blur(); } }}
        style={{...style, paddingRight:32, borderColor: bad ? "#ef4444" : style.borderColor||style.border||undefined,
          ...(bad?{border:"1.5px solid #ef4444"}:{})}}/>
      {/* hidden native picker, opened by the calendar button */}
      <input ref={pickRef} type="date" value={value||""} disabled={disabled} tabIndex={-1}
        onChange={e=>{ setBad(false); setText(e.target.value); onChange(e.target.value); }}
        style={{position:"absolute",right:6,width:20,height:20,opacity:0,pointerEvents:"none"}}/>
      <button type="button" disabled={disabled} title="Open the calendar picker"
        onClick={()=>{ const el=pickRef.current; if(!el) return; if(el.showPicker) el.showPicker(); else el.click(); }}
        style={{position:"absolute",right:4,background:"transparent",border:"none",cursor:disabled?"default":"pointer",
          fontSize:13,opacity:disabled?0.3:0.6,padding:2,lineHeight:1}}>📅</button>
      {bad && <span style={{position:"absolute",left:0,top:"100%",fontSize:9,color:"#ef4444",fontWeight:700,marginTop:2,whiteSpace:"nowrap"}}>Invalid date format</span>}
    </div>
  );
}

// N37: an event may occupy SEVERAL time windows under one id (e.g. a trip that
// happens twice). Legacy events only have start/end — normalise both shapes.
function eventWindows(ev){
  if (Array.isArray(ev.windows) && ev.windows.length) {
    return ev.windows.filter(w=>w && (w.start||w.end)).map(w=>({start:w.start||w.end, end:w.end||w.start, desc:w.desc||""}));
  }
  if (ev.start || ev.end) return [{start:ev.start||ev.end, end:ev.end||ev.start, desc:ev.note||""}];
  return [];
}

// N37: ISO week number (module-level; CalendarTab has its own local copy)
function isoWeekNum(d){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day);
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  return Math.ceil(((t-y0)/86400000+1)/7);
}

// N37: global activity logger — lets tab components record Recent Activity.
// App publishes window.__pushActivity; tabs previously wrote storage directly and
// silently skipped activity tracking (that's why the feed looked empty).
function logAct(type, title, module, detail=""){
  try{ window.__pushActivity && window.__pushActivity(type, title, module, detail); }catch{}
}

// N37: should we ask for the next due date? (task just flipped to Done and repeats)
function needsNextDue(payload, prevStatus){
  const wasDone = prevStatus==="done";
  return payload.status==="done" && !wasDone && (payload.isRecurring||!!payload.recur);
}

// ─── N37: NEXT-DUE POPUP — asked EVERY time a recurring task is marked Done ──
// Shows the pre-calculated next due date (from the recurrence rule), lets the
// user change it, and optionally pre-create several occurrences ahead.
function NextDuePopup({ task, onConfirm, onCancel }) {
  const preset = nextDueDate(task) || fmtLocal(TODAY);
  const [due, setDue] = useState(preset);
  const [count, setCount] = useState(1);
  const [skip, setSkip] = useState(false);
  const inp={width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",
    background:"var(--c-surface)",color:"var(--c-text)",fontSize:14,outline:"none",boxSizing:"border-box"};
  const lbl={display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:5};
  // preview the dates that will be created
  const preview = (()=>{
    if (skip) return [];
    const out=[]; let c=due;
    for(let i=0;i<Math.max(1,Math.min(12,count)) && c;i++){ out.push(c); c=nextDueDate({...task,due:c}); }
    return out;
  })();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:7000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:3}}>🔁 Set the next due date</div>
        <div style={{fontSize:11.5,color:"var(--c-text-muted)",marginBottom:16,lineHeight:1.5}}>
          "{task.title}" repeats (<b>{task.recur||"recurring"}</b>) — the next date is pre-calculated. Adjust it before saving.
        </div>
        <div style={{display:"grid",gap:13}}>
          <div>
            <label style={lbl}>NEXT DUE DATE</label>
            <DateInput style={inp} value={due} onChange={setDue} disabled={skip}/>
            {due!==preset&&!skip&&<div style={{fontSize:10,color:"#f59e0b",marginTop:4}}>Changed from the calculated date ({preset})</div>}
          </div>
          <div>
            <label style={lbl}>HOW MANY OCCURRENCES AHEAD</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min={1} max={12} value={count} disabled={skip}
                onChange={e=>{let v=parseInt(e.target.value,10); if(isNaN(v))v=1; setCount(Math.max(1,Math.min(12,v)));}}
                style={{...inp,width:80,textAlign:"center",fontWeight:700}}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[1,2,3,6,12].map(n=>(
                  <button key={n} onClick={()=>setCount(n)} disabled={skip}
                    style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:700,cursor:skip?"not-allowed":"pointer",
                      border:count===n?"1.5px solid #166534":"1px solid var(--c-border)",
                      background:count===n?"#16653422":"var(--c-surface)",color:count===n?"#166534":"var(--c-text-muted)",opacity:skip?0.4:1}}>{n}</button>
                ))}
              </div>
            </div>
          </div>
          {preview.length>0&&(
            <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:9,padding:"10px 12px"}}>
              <div style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",marginBottom:6}}>Will create {preview.length} new task{preview.length!==1?"s":""}</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {preview.map((d,i)=><span key={i} style={{fontSize:11,fontWeight:700,color:"#166534",background:"#16653418",border:"1px solid #16653433",borderRadius:6,padding:"3px 8px"}}>{d}</span>)}
              </div>
            </div>
          )}
          <button onClick={()=>setSkip(s=>!s)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:9,
              border:"1.5px solid var(--c-border)",background:skip?"#7f1d1d22":"var(--c-surface)",cursor:"pointer",width:"100%"}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>⛔ Don\u2019t create the next one (end this series)</span>
            <span style={{fontSize:12,fontWeight:800,color:skip?"#ef4444":"var(--c-text-muted)"}}>{skip?"✓ Off":"On"}</span>
          </button>
        </div>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>onConfirm({ _nextDue:skip?"":due, _nextCount:skip?0:count, _skipNext:skip })}
            style={{flex:1.4,padding:"11px 0",borderRadius:10,border:"none",background:"#166534",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>
            ✓ Confirm &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}

// N-DuplicateTask: shared helper — copies core fields, resets identity/state ──
function duplicateTask(t) {
  const { id, status, pinned, originalDue, delayLabel, ...core } = t;
  return {
    ...core,
    id: newId(),
    title: `${t.title} (Copy)`,
    status: t._type==="work" ? "todo" : "pending",     // reset to default status
    pinned: false,                                      // reset pin
    originalDue: "",                                    // reset delay tracking — fresh task, no delay history
    delayLabel: "",
  };
}

function urgency(t) {
  if (t.status==="done")    return { label:"Done",    color:"#22c55e" };
  if (isOverdue(t)) return { label:"Overdue", color:"#ef4444" };
  if (!t.due) return { label:"No date", color:"var(--c-text-muted)" };
  const d = daysUntil(t.due);
  if (d < 0)   return { label:`${Math.abs(d)}d ago`, color:"#ef4444" };
  if (d === 0) return { label:"Today",               color:"#f97316" };
  if (d <= 14) return { label:`${d}d`,               color:"#f97316" };
  if (d <= 60) return { label:`${d}d`,               color:"#eab308" };
  return { label:fmtShort(t.due), color:"var(--c-text-muted)" };
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────
function Chip({ color, children, small }) {
  return (
    <span style={{
      background:color+"22", color, fontSize:small?9:10, fontWeight:700,
      padding:small?"1px 5px":"2px 7px", borderRadius:20,
      whiteSpace:"nowrap", letterSpacing:"0.04em",
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SWITCHER MODAL
// ─────────────────────────────────────────────────────────────────────────────
const PROFILE_EMOJIS = ["👤","🧑","👨","👩","🧔","🧑‍💼","👨‍💼","👩‍💼","🧑‍🔬","🎯","⭐","🔥","🚀","🌟","💎","🦁","🐯","🦊"];

function ProfileSwitcher({ currentProfileId, onSwitch, onClose, profiles: initialProfiles, onSaveProfiles }) {
  const [profiles, setProfiles] = useState(initialProfiles || getProfiles());
  const [mode, setMode] = useState("list"); // "list" | "new" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("👤");

  const saveAndRefresh = (list) => {
    saveProfiles(list);
    setProfiles(list);
    onSaveProfiles&&onSaveProfiles(list);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = `profile-${Date.now()}`;
    const newProf = { id, name: newName.trim(), emoji: newEmoji, createdAt: new Date().toISOString().slice(0,10) };
    saveAndRefresh([...profiles, newProf]);
    setMode("list"); setNewName(""); setNewEmoji("👤");
  };

  const handleRename = () => {
    if (!newName.trim() || !editTarget) return;
    saveAndRefresh(profiles.map(p => p.id===editTarget.id ? {...p, name:newName.trim(), emoji:newEmoji} : p));
    setMode("list"); setEditTarget(null); setNewName(""); setNewEmoji("👤");
  };

  const handleDelete = (id) => {
    if (profiles.length <= 1) {
      alert("Cannot delete the last profile. Create another profile first.");
      return;
    }
    if (!confirm(`Delete profile? All data for this profile will be lost.`)) return;
    // Remove all localStorage keys for this profile
    Object.keys(localStorage).filter(k=>k.startsWith(`${id}::`)).forEach(k=>localStorage.removeItem(k));
    const next = profiles.filter(p=>p.id!==id);
    saveAndRefresh(next);
    const remaining = profiles.filter(p=>p.id!==id);
    if (currentProfileId===id && remaining.length>0) onSwitch(remaining[0].id);
  };

  const inp = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1.5px solid var(--c-border)", background:"var(--c-surface)", color:"var(--c-text)", fontSize:13, outline:"none", boxSizing:"border-box" };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:3500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,width:"100%",maxWidth:440,boxShadow:"0 25px 70px rgba(0,0,0,.8)",maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"16px 20px",borderBottom:"1px solid var(--c-border)"}}>
          <span style={{fontSize:20}}>👤</span>
          <span style={{fontSize:16,fontWeight:800,color:"var(--c-text)",flex:1}}>
            {mode==="new"?"Create New Profile":mode==="edit"?"Edit Profile":"Switch Profile"}
          </span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>

        <div style={{overflowY:"auto",flex:1,padding:"16px 20px"}}>
          {/* ── Profile List ── */}
          {mode==="list"&&(
            <div>
              <div style={{display:"grid",gap:8,marginBottom:16}}>
                {profiles.map(p=>{
                  const isActive = p.id===currentProfileId;
                  return (
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${isActive?"#6366f1":"var(--c-surface)"}`,background:isActive?"#6366f111":"var(--c-surface2)",cursor:"pointer",transition:"all .15s"}}
                      onClick={()=>{if(!isActive){onSwitch(p.id);}}}
                      onMouseEnter={e=>{if(!isActive)e.currentTarget.style.borderColor="var(--c-border)";}}
                      onMouseLeave={e=>{if(!isActive)e.currentTarget.style.borderColor="var(--c-surface)";}}>
                      <span style={{fontSize:24,flexShrink:0}}>{p.emoji}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:700,color:isActive?"#a5b4fc":"var(--c-text)"}}>{p.name}</div>
                        <div style={{fontSize:11,color:"var(--c-text-muted)"}}>Created {p.createdAt}</div>
                      </div>
                      {isActive&&<span style={{fontSize:10,fontWeight:800,color:"#6366f1",background:"#6366f122",padding:"2px 8px",borderRadius:20,flexShrink:0}}>ACTIVE</span>}
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={e=>{e.stopPropagation();setEditTarget(p);setNewName(p.name);setNewEmoji(p.emoji);setMode("edit");}}
                          style={{padding:"3px 8px",borderRadius:6,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:11,cursor:"pointer"}}>✏️</button>
                        {(
                          <button onClick={e=>{e.stopPropagation();handleDelete(p.id);}}
                            style={{padding:"3px 8px",borderRadius:6,border:"1px solid var(--c-border)",background:"transparent",color:"#f87171",fontSize:11,cursor:"pointer"}}>🗑️</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={()=>{setMode("new");setNewName("");setNewEmoji("👤");}}
                style={{width:"100%",padding:"10px 0",borderRadius:9,border:"1px dashed var(--c-border)",background:"transparent",color:"#6366f1",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                ＋ Create New Profile
              </button>
            </div>
          )}

          {/* ── Create / Edit Form ── */}
          {(mode==="new"||mode==="edit")&&(
            <div style={{display:"grid",gap:14}}>
              <div>
                <label style={{display:"block",fontSize:11,color:"var(--c-text-muted)",fontWeight:700,letterSpacing:"0.06em",marginBottom:6}}>EMOJI</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                  {PROFILE_EMOJIS.map(e=>(
                    <button key={e} onClick={()=>setNewEmoji(e)} style={{width:36,height:36,borderRadius:8,border:`2px solid ${newEmoji===e?"#6366f1":"var(--c-border)"}`,background:newEmoji===e?"#6366f122":"var(--c-surface)",fontSize:20,cursor:"pointer"}}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,color:"var(--c-text-muted)",fontWeight:700,letterSpacing:"0.06em",marginBottom:6}}>PROFILE NAME</label>
                <input style={inp} value={newName} onChange={e=>setNewName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&(mode==="new"?handleCreate():handleRename())}
                  placeholder="e.g. Work Profile, Personal, Family…" autoFocus/>
              </div>
              {newName.trim()&&(
                <div style={{padding:"10px 14px",background:"var(--c-surface2)",borderRadius:8,border:"1px solid var(--c-border)",display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>{newEmoji}</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>{newName}</div>
                    <div style={{fontSize:11,color:"var(--c-text-muted)"}}>Preview</div>
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setMode("list");setEditTarget(null);setNewName("");}}
                  style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,cursor:"pointer"}}>
                  Cancel
                </button>
                <button onClick={mode==="new"?handleCreate:handleRename}
                  style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                  {mode==="new"?"Create Profile":"Save Changes"}
                </button>
              </div>
            </div>
          )}
        </div>

        {mode==="list"&&(
          <div style={{padding:"10px 20px",borderTop:"1px solid var(--c-border)",fontSize:10,color:"var(--c-border)",textAlign:"center"}}>
            Each profile has its own tasks, config, and custom tabs — data is never shared between profiles
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SEARCH
// ─────────────────────────────────────────────────────────────────────────────
function GlobalSearch({ personal, work, notes=[], events=[], onClose, lang, onSaveTask, onDuplicateTask, onNavigate }) {
  const [q, setQ] = useState("");
  const [editingTask, setEditingTask] = useState(null); // N-SearchClickEdit

  // ── N-SearchHistory: persist last 10 searches in localStorage ────────────
  const HIST_KEY = "lp-search-history";
  const [history, setHistory] = useState(()=>{
    try { return JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); } catch { return []; }
  });

  const saveHistory = (term) => {
    if (!term.trim()) return;
    const next = [term, ...history.filter(h=>h!==term)].slice(0,10);
    setHistory(next);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(next)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HIST_KEY); } catch {}
  };

  const inp = useRef(null);
  useEffect(()=>{ inp.current?.focus(); },[]);

  const t = i18n[lang]||i18n.EN;
  const results = useMemo(()=>{
    if (!q.trim()) return [];
    const qL = q.toLowerCase();
    const score = (task) => {
      let s = 0;
      if (task.title?.toLowerCase().includes(qL)) s+=3;
      if (task.description?.toLowerCase().includes(qL)) s+=2;
      if (task.cat?.toLowerCase().includes(qL)) s+=1;
      if (task.project?.toLowerCase().includes(qL)) s+=1;
      if (task.location?.toLowerCase().includes(qL)) s+=1;
      if (task.notes?.toLowerCase().includes(qL)) s+=1;
      return s;
    };
    const combined = [
      ...personal.map(t=>({...t,_type:"personal"})),
      ...work.map(t=>({...t,_type:"work"})),
    ];
    return combined.map(t=>({...t,_score:score(t)}))
      .filter(t=>t._score>0)
      .sort((a,b)=>b._score-a._score)
      .slice(0,20);
  },[q,personal,work]);

  // B4: also search notes + events (title match) — shown as jump-to links
  const otherResults = useMemo(()=>{
    if (!q.trim()) return [];
    const qL=q.toLowerCase(); const out=[];
    notes.forEach(n=>{ if((n.title||"").toLowerCase().includes(qL)) out.push({kind:"note",id:n.id,label:n.title,icon:"📝"}); });
    events.forEach(e=>{ if((e.title||"").toLowerCase().includes(qL)) out.push({kind:"event",id:e.id,label:e.title,icon:"📅"}); });
    return out.slice(0,10);
  },[q,notes,events]);

  // Highlight matching text
  const highlight = (text="", query="") => {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx<0) return text;
    return <>{text.slice(0,idx)}<mark style={{background:"#f59e0b44",color:"#92400e",borderRadius:3,padding:"0 2px"}}>{text.slice(idx,idx+query.length)}</mark>{text.slice(idx+query.length)}</>;
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:80,padding:"80px 16px 0"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:640,background:"var(--c-card2)",borderRadius:16,border:"1px solid var(--c-border)",boxShadow:"0 8px 40px rgba(0,0,0,.2)",overflow:"hidden"}}>
        {/* Search input */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:"1px solid var(--c-border)"}}>
          <span style={{fontSize:18,flexShrink:0}}>🔍</span>
          <input ref={inp} value={q} onChange={e=>setQ(e.target.value)}
            placeholder={t.search}
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:"var(--c-text)",fontSize:16,fontWeight:500}}
            onKeyDown={e=>{
              if(e.key==="Escape") onClose();
              if(e.key==="Enter" && q.trim()) saveHistory(q.trim());
            }}
          />
          {q&&<button onClick={()=>setQ("")} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>}
          <kbd style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:5,padding:"2px 6px",fontSize:10,color:"var(--c-text-muted)"}}>Esc</kbd>
        </div>

        {/* History panel — shown when search box is empty */}
        <div style={{maxHeight:460,overflowY:"auto"}}>
          {!q.trim()&&(
            history.length===0 ? (
              <div style={{padding:"24px 16px",textAlign:"center",color:"var(--c-text-muted)",fontSize:13}}>
                Start typing to search across all tasks…
              </div>
            ) : (
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"10px 16px 6px",borderBottom:`1px solid var(--c-border)`}}>
                  <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>
                    🕐 RECENT SEARCHES
                  </span>
                  <button onClick={clearHistory}
                    style={{fontSize:10,color:"var(--c-text-muted)",background:"transparent",border:"none",
                      cursor:"pointer",fontWeight:600,padding:"2px 6px",borderRadius:4}}>
                    Clear all
                  </button>
                </div>
                {history.map((h,i)=>(
                  <div key={i}
                    onClick={()=>setQ(h)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",
                      cursor:"pointer",borderBottom:i<history.length-1?`1px solid var(--c-border)`:"none",
                      background:"transparent",transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontSize:14,opacity:0.5}}>🔍</span>
                    <span style={{fontSize:13,color:"var(--c-text)",flex:1}}>{h}</span>
                    <button
                      onClick={e=>{
                        e.stopPropagation();
                        const next=history.filter((_,j)=>j!==i);
                        setHistory(next);
                        try{localStorage.setItem(HIST_KEY,JSON.stringify(next));}catch{}
                      }}
                      style={{fontSize:14,color:"var(--c-text-muted)",background:"transparent",
                        border:"none",cursor:"pointer",lineHeight:1,padding:"0 4px",opacity:0.6}}
                      title="Remove this search">×</button>
                  </div>
                ))}
              </div>
            )
          )}
          {q.trim()&&results.length===0&&otherResults.length===0&&(
            <div style={{padding:"24px 16px",textAlign:"center",color:"var(--c-text-muted)",fontSize:13}}>
              No results found for "<span style={{color:"var(--c-text)"}}>{q}</span>"
            </div>
          )}
          {results.map((task,i)=>{
            const isWork = task._type==="work";
            const cc = isWork?(WORK_CAT_COLOR[task.cat]||"#94a3b8"):(CAT_COLOR[task.cat]||"#94a3b8");
            const urg = urgency(task);
            return (
              <div key={`${task._type}-${task.id}`}
                onClick={()=>{saveHistory(q.trim());setEditingTask(task);}}
                style={{
                padding:"12px 16px",
                borderBottom:i<results.length-1?"1px solid var(--c-border)":"none",
                borderLeft:`3px solid ${cc}`,
                background:i%2===0?"var(--c-card2)":"var(--c-bg)",
                cursor:"pointer",
                transition:"background .12s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
              onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"var(--c-card2)":"var(--c-bg)"}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--c-text)",marginBottom:4,lineHeight:1.4}}>
                      {highlight(task.title, q)}
                    </div>
                    {task.description&&(
                      <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:4,lineHeight:1.4}}>
                        {highlight(task.description, q)}
                      </div>
                    )}
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                      <Chip color={cc}>{task.cat}</Chip>
                      <Chip color={isWork?"#818cf8":"#34d399"} small>{isWork?"Work":"Personal"}</Chip>
                      {task.due&&<span style={{fontSize:10,color:urg.color,fontWeight:700}}>{urg.label}</span>}
                      {task.project&&<span style={{fontSize:10,color:"#818cf8"}}>📁 {task.project}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {task.due&&<div style={{fontSize:10,color:"var(--c-text-muted)"}}>{fmtDate(task.due)}</div>}
                    <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:2}}>
                      {'★'.repeat(Math.min(task._score,3))}{'☆'.repeat(Math.max(0,3-task._score))}
                    </div>
                    <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>✏️</div>
                  </div>
                </div>
              </div>
            );
          })}
          {/* B4: notes + events matches */}
          {otherResults.length>0 && (
            <div style={{borderTop:results.length?"2px solid var(--c-border)":"none"}}>
              {otherResults.map(r=>(
                <div key={`${r.kind}-${r.id}`}
                  onClick={()=>{saveHistory(q.trim());onNavigate&&onNavigate(r.kind,r.id);}}
                  style={{padding:"11px 16px",borderBottom:"1px solid var(--c-border)",cursor:"pointer",
                    display:"flex",alignItems:"center",gap:10,transition:"background .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{fontSize:16}}>{r.icon}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600,color:"var(--c-text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{highlight(r.label,q)}</span>
                  <span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:700,textTransform:"uppercase"}}>{r.kind}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {q.trim()&&results.length>0&&(
          <div style={{padding:"8px 16px",borderTop:`1px solid var(--c-border)`,
            fontSize:10,color:"var(--c-text-muted)",display:"flex",
            justifyContent:"space-between",alignItems:"center"}}>
            <span>{results.length} result{results.length!==1?"s":""}</span>
            <button onClick={()=>saveHistory(q.trim())}
              style={{fontSize:10,color:"var(--c-accent)",background:"transparent",
                border:"none",cursor:"pointer",fontWeight:700,padding:"2px 6px"}}>
              🕐 Save search
            </button>
          </div>
        )}
      </div>
      {editingTask&&(
        <TaskDetailModal
          task={editingTask}
          onSave={t=>{ onSaveTask&&onSaveTask(t); setEditingTask(null); }}
          onClose={()=>setEditingTask(null)}
          onDuplicate={onDuplicateTask}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────
// ─── 3B. NLPDateInput — text field that parses natural language to a date ────
// Shows alongside date picker. User types "tomorrow" → auto-fills the date picker.
function NLPDateInput({ onDateParsed, placeholder="e.g. tomorrow, +3d, next monday" }) {
  const [nlpVal, setNlpVal] = useState("");
  const [hint, setHint] = useState(null);      // {iso, display} when parsed
  const [error, setError] = useState(false);

  const tryParse = (val) => {
    if (!val.trim()) { setHint(null); setError(false); return; }
    const iso = parseNLPDate(val);
    if (iso) {
      const display = new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
      setHint({iso,display});
      setError(false);
    } else {
      setHint(null);
      setError(val.length > 2); // only show error after user types enough
    }
  };

  const apply = () => {
    if (hint) { onDateParsed(hint.iso); setNlpVal(""); setHint(null); }
  };

  return (
    <div style={{marginBottom:6}}>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <input
          value={nlpVal}
          onChange={e=>{setNlpVal(e.target.value);tryParse(e.target.value);}}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();apply();}}}
          placeholder={placeholder}
          style={{flex:1,padding:"5px 10px",borderRadius:7,fontSize:11,outline:"none",
            border:`1.5px solid ${hint?"#22c55e":error?"#ef4444":"var(--c-border)"}`,
            background:"var(--c-surface)",color:"var(--c-text)"}}
        />
        {hint&&(
          <button onClick={apply}
            style={{padding:"5px 10px",borderRadius:7,border:"none",background:"#22c55e",
              color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            ✓ {hint.display}
          </button>
        )}
      </div>
      {error&&!hint&&<div style={{fontSize:9,color:"#ef4444",marginTop:2}}>
        Not recognized — try: tomorrow, +3d, next monday, 15/08
      </div>}
    </div>
  );
}

function WorkModal({ task, onSave, onClose, allTasks, onDuplicate }) {
  const [colorTick, setColorTick] = useState(0); // N74
  const blank = { title:"", description:"", project:"", assignee:"", cat:"Other", priority:"Medium", startDate:"", due:"", status:"todo", progress:0, subtasks:[], notes:"", location:"", attachments:[], pinned:false, deps:[], originalDue:"", delayLabel:"", milestone:true, milestoneAt:"" };
  // C1/N-Form: merge blank defaults with task so NO field is ever undefined
  const [f, setF] = useState(task ? { ...blank, ...task, subtasks:task.subtasks||[] } : blank);
  const [showPostponedPopup, setShowPostponedPopup] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [customStatus, setCustomStatus] = useState("");
  const [showCustomCat, setShowCustomCat] = useState(false);
  const [showCustomStatus, setShowCustomStatus] = useState(false);
  // Q1: Work project management (replaces category)
  const [customProject, setCustomProject] = useState("");
  const [showCustomProject, setShowCustomProject] = useState(false);
  const [deletedProjects, setDeletedProjects] = useState([]); // session-only hide of custom projects

  const set = (k,v) => setF(p => {
    if (k==="status" && (v==="delayed")) {
      setShowPostponedPopup(true); // N-Postponed: show popup for delayed
    }
    if (k==="status" && v==="ontrack" && p.delayLabel) {
      // ontrack clears delay tracking
      return {...p,[k]:v};
    }
    const next = {...p,[k]:v};
    // Auto-fill end date when start date set
    if (k==="startDate" && v && (!p.due || p.due===p.startDate)) next.due = v;
    return next;
  });
  const [pendingDone, setPendingDone] = useState(null); // N37: next-due popup payload
  const addSub = () => { if(!newSub.trim()||f.subtasks.length>=20) return; set("subtasks",[...f.subtasks,{id:Date.now(),text:newSub.trim(),done:false}]); setNewSub(""); };
  const toggleSub = id => set("subtasks", f.subtasks.map(s=>s.id===id?{...s,done:!s.done}:s));
  const removeSub = id => set("subtasks", f.subtasks.filter(s=>s.id!==id));
  const doneSubs = f.subtasks.filter(s=>s.done).length;
  const autoProgress = f.subtasks.length>0 ? Math.round((doneSubs/f.subtasks.length)*100) : f.progress;
  // C6: AI — break the task goal into subtasks
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const aiGenerateSubtasks = async () => {
    if (!f.title.trim()) { setAiErr("Enter a task title first"); return; }
    setAiBusy(true); setAiErr("");
    try {
      const prompt = `Break this goal into 3-7 concrete, actionable subtasks. Goal: "${f.title}"${f.description?` (details: ${f.description})`:""}. Reply ONLY with a JSON array of short strings, no other text. Example: ["Step one","Step two"]. Reply in the same language as the goal.`;
      const out = await callClaude(prompt, 600);
      let arr; try { arr = JSON.parse(out.replace(/```json|```/g,"").trim()); } catch { arr = out.split("\n").map(l=>l.replace(/^[-*\d.\s]+/,"").trim()).filter(Boolean); }
      if (Array.isArray(arr) && arr.length) {
        const room = Math.max(0, 20 - f.subtasks.length);
        const subs = arr.slice(0,room).map((t,i)=>({id:Date.now()+i,text:String(t).slice(0,120),done:false}));
        set("subtasks",[...f.subtasks,...subs]);
      } else setAiErr("Could not break it down — try again");
    } catch { setAiErr("AI only works when published as an artifact"); }
    setAiBusy(false);
  };

  // derive cats and statuses from existing work tasks
  const existingCats = useMemo(()=>{
    const base = Object.keys(WORK_CAT_COLOR);
    const extra = (allTasks||[]).map(t=>t.cat).filter(c=>c&&!base.includes(c));
    return [...base,...new Set(extra)];
  },[allTasks]);

  // Q1: derive projects = default list + those already used in work tasks (minus session-deleted)
  const existingProjects = useMemo(()=>{
    const used = (allTasks||[]).map(t=>t.project).filter(Boolean);
    const all = [...new Set([...DEFAULT_PROJECTS, ...used])];
    // keep current selection visible even if just added
    if (f.project && !all.includes(f.project)) all.push(f.project);
    return all.filter(p=>!deletedProjects.includes(p) || p===f.project);
  },[allTasks, deletedProjects, f.project]);

  const handleAddProject = () => {
    const v = customProject.trim();
    if (!v) return;
    set("project", v);
    setCustomProject("");
    setShowCustomProject(false);
  };
  const handleDeleteProject = (p) => {
    if (DEFAULT_PROJECTS.includes(p)) return; // can't delete defaults
    setDeletedProjects(prev=>[...prev, p]);
    if (f.project===p) set("project",""); // clear if currently selected
  };

  const existingStatuses = useMemo(()=>{
    const base = ["todo","inprogress","ontrack","review","delayed","done"];
    const extra = (allTasks||[]).map(t=>t.status).filter(s=>s&&!base.includes(s));
    return [...base,...new Set(extra)];
  },[allTasks]);

  const statusLabel = s => s==="todo"?"To Do":s==="inprogress"?"In Progress":s==="ontrack"?"🟢 On Track":s==="review"?"Review":s==="delayed"?"🔴 Delayed":s==="done"?"Done":s;
  const statusColor = s => s==="inprogress"?"#60a5fa":s==="review"?"#a78bfa":s==="done"?"#22c55e":s==="todo"?"var(--c-text-muted)":"#818cf8";

  const handleAddCat = () => { const v=customCat.trim(); if(!v) return; set("cat",v); setCustomCat(""); setShowCustomCat(false); };
  const handleAddStatus = () => { const v=customStatus.trim(); if(!v) return; set("status",v); setCustomStatus(""); setShowCustomStatus(false); };

  const inp = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1.5px solid var(--c-border)", background:"var(--c-surface)", color:"var(--c-text)", fontSize:13, outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:11, color:"var(--c-text-muted)", marginBottom:4, fontWeight:700, letterSpacing:"0.06em" };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:580,boxShadow:"0 25px 60px rgba(0,0,0,.7)",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,color:"var(--c-text)",fontSize:17,fontWeight:800}}>{task?"✏️ Edit Work Task":"➕ New Work Task"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"grid",gap:13}}>
          <div><label style={lbl}>TASK TITLE</label><input style={inp} value={f.title} onChange={e=>set("title",e.target.value)} placeholder="What needs to be done?"/></div>
          <div><label style={lbl}>DESCRIPTION <span style={{fontWeight:500,color:"var(--c-text-muted)"}}>· type @ to link</span></label><MentionTextarea style={{...inp,height:72,resize:"vertical",lineHeight:1.6}} value={f.description||""} onChange={v=>set("description",v)} placeholder="Describe the task…  type @ to link a task/note/event"/></div>
          <div>
            <label style={lbl}>📍 LOCATION</label>
            <div style={{position:"relative"}}>
              <input style={{...inp,paddingRight:90}} value={f.location||""} onChange={e=>set("location",e.target.value)} placeholder="e.g. Central World, Bangkok…"/>
              {f.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.location)}`} target="_blank" rel="noopener noreferrer" style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"#1e40af",color:"#93c5fd",fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:6,textDecoration:"none",whiteSpace:"nowrap"}}>Open Map ↗</a>}
            </div>
          </div>
          <div><label style={lbl}>ASSIGNEE</label><input style={inp} value={f.assignee} onChange={e=>set("assignee",e.target.value)} placeholder="Who's responsible?"/></div>

          {/* Q1: PROJECT pills + custom (replaces old Category for Work) */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <label style={{...lbl,marginBottom:0}}>PROJECT</label>
              <button onClick={()=>setShowCustomProject(v=>!v)} style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f133",borderRadius:20,padding:"2px 8px",cursor:"pointer"}}>
                {showCustomProject?"✕ Cancel":"＋ New project"}
              </button>
            </div>
            {showCustomProject?(
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp,flex:1}} value={customProject} onChange={e=>setCustomProject(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddProject()} placeholder="Project name… (Enter to add)"/>
            {/* N74: project colour, editable from the task */}
            <GroupColorPicker name={f.project} current={groupColor(f.project)}
              count={(typeof window!=="undefined"&&window.__groupColors)?window.__groupColors.countFor(f.project):0}
              onPick={(n,c)=>{ window.__groupColors&&window.__groupColors.set(n,c); setColorTick(x=>x+1); }}
              label="PROJECT COLOUR"/>
                <button onClick={handleAddProject} style={{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:"pointer",fontWeight:800,fontSize:13}}>Add</button>
              </div>
            ):(
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {existingProjects.map(p=>{
                  const cc = groupColor(p);
                  const isSel = f.project===p;
                  return (
                    <span key={p} style={{display:"inline-flex",alignItems:"center",gap:3}}>
                      <button onClick={()=>set("project",p)} style={{padding:"4px 11px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:isSel?cc:"var(--c-border)",background:isSel?cc+"22":"transparent",color:isSel?cc:"var(--c-text-muted)"}}>{p}</button>
                      {!DEFAULT_PROJECTS.includes(p)&&(
                        <button onClick={()=>handleDeleteProject(p)} title={`Delete project "${p}"`} style={{fontSize:11,color:"var(--c-text-muted)",background:"transparent",border:"none",cursor:"pointer",padding:0,opacity:0.5}}>✕</button>
                      )}
                    </span>
                  );
                })}
                {!f.project&&<span style={{fontSize:10,color:"var(--c-text-muted)",fontStyle:"italic",alignSelf:"center"}}>No project selected</span>}
              </div>
            )}
          </div>

          <div><label style={lbl}>PRIORITY</label><div style={{display:"flex",gap:6}}>{["High","Medium","Low"].map(p=><button key={p} onClick={()=>set("priority",p)} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid",borderColor:f.priority===p?PRIORITY_CFG[p].color:"var(--c-border)",background:f.priority===p?PRIORITY_CFG[p].bg:"transparent",color:f.priority===p?PRIORITY_CFG[p].color:"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{p}</button>)}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>set("pinned",!f.pinned)} style={{
              display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
              borderRadius:8,border:`1.5px solid ${f.pinned?"#f59e0b":"var(--c-border)"}`,
              background:f.pinned?"#f59e0b22":"transparent",
              color:f.pinned?"#fbbf24":"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer",
              transition:"all .15s"
            }}>
              <span style={{fontSize:15}}>📌</span>
              {f.pinned?"Pinned to Overview":"Pin to Overview top"}
            </button>
            {f.pinned&&<span style={{fontSize:11,color:"var(--c-text-muted)"}}>This task will appear in the pinned panel</span>}
          </div>

          {/* N4: Milestone checkbox — default ON. When done → recorded in Milestones timeline */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,
            border:`1.5px solid ${f.milestone?"#f59e0b55":"var(--c-border)"}`,
            background:f.milestone?"#f59e0b11":"transparent"}}>
            <button onClick={()=>set("milestone",!f.milestone)} style={{
              width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",
              border:`2px solid ${f.milestone?"#f59e0b":"var(--c-border)"}`,
              background:f.milestone?"#f59e0b":"transparent",color:"#fff",fontSize:14,fontWeight:900,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              {f.milestone?"✓":""}
            </button>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>🏆 Track as Milestone</div>
              <div style={{fontSize:10,color:"var(--c-text-muted)"}}>When completed, this task is saved to your Milestones timeline with a timestamp</div>
            </div>
          </div>

          {/* N13/N14: Editable milestone timestamp — shown when done + milestone tracked */}
          {f.milestone && f.status==="done" && (
            <div>
              <label style={lbl}>🏆 MILESTONE TIMESTAMP</label>
              <input type="datetime-local" style={inp}
                value={isoToLocalInput(f.milestoneAt)}
                onChange={e=>set("milestoneAt", localInputToIso(e.target.value))}/>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>Defaults to the task's due date — edit to record the actual completion time</div>
            </div>
          )}

          {/* Status pills + custom */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <label style={{...lbl,marginBottom:0}}>STATUS</label>
              <button onClick={()=>setShowCustomStatus(v=>!v)} style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f133",borderRadius:20,padding:"2px 8px",cursor:"pointer"}}>
                {showCustomStatus?"✕ Cancel":"＋ New status"}
              </button>
            </div>
            {showCustomStatus?(
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp,flex:1}} value={customStatus} onChange={e=>setCustomStatus(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddStatus()} placeholder="Status name… (Enter to add)"/>
                <button onClick={handleAddStatus} style={{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:"pointer",fontWeight:800,fontSize:13}}>Add</button>
              </div>
            ):(
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {existingStatuses.map(s=>{
                  const sc = statusColor(s);
                  return <button key={s} onClick={()=>set("status",s)} style={{padding:"4px 11px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:f.status===s?sc:"var(--c-border)",background:f.status===s?sc+"22":"transparent",color:f.status===s?sc:"var(--c-text-muted)"}}>{statusLabel(s)}</button>;
                })}
                {f.status&&!existingStatuses.includes(f.status)&&<button style={{padding:"4px 11px",borderRadius:20,border:"1px solid #a78bfa",background:"#a78bfa22",fontSize:11,fontWeight:700,color:"#a78bfa",cursor:"default"}}>✦ {f.status}</button>}
              </div>
            )}

            {/* N-Postponed: delayed popup */}
            {showPostponedPopup&&f.status==="delayed"&&(
              <PostponedPopup
                currentDue={f.due}
                originalDue={f.originalDue}
                isWork={true}
                onConfirm={({originalDue,newDue,delayLabel})=>{
                  // N54: the new date IS the end date; start date follows it automatically
                  setF(p=>({...p, originalDue, due:newDue, startDate:newDue, delayLabel}));
                  setShowPostponedPopup(false);
                }}
                onCancel={()=>{
                  setF(p=>({...p, status:"inprogress"}));
                  setShowPostponedPopup(false);
                }}
              />
            )}
            {/* N-Postponed: show delay info */}
            {!showPostponedPopup&&f.status==="delayed"&&f.delayLabel&&(
              <div style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:8,
                padding:"6px 12px",fontSize:11,fontWeight:800,color:"#ef4444",
                display:"flex",alignItems:"center",gap:6}}>
                🔴 Delayed {f.delayLabel} from {f.originalDue||"original date"}
                <button onClick={()=>setShowPostponedPopup(true)}
                  style={{marginLeft:"auto",fontSize:9,padding:"2px 8px",borderRadius:5,
                    border:"1px solid #ef444444",background:"transparent",color:"#ef4444",cursor:"pointer"}}>
                  Edit dates
                </button>
              </div>
            )}
            {/* N-Postponed: ontrack shows delay history */}
            {f.status==="ontrack"&&f.delayLabel&&(
              <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:8,
                padding:"6px 12px",fontSize:11,fontWeight:700,color:"#22c55e"}}>
                🟢 On Track · was delayed {f.delayLabel}
              </div>
            )}
          </div>

          {/* 3B: NLP Date Parser */}
          <div>
            <label style={{...lbl,display:"flex",alignItems:"center",gap:6}}>
              🗓 QUICK DATE <span style={{fontSize:9,fontWeight:500,color:"var(--c-text-muted)"}}>type natural language → fills End Date</span>
            </label>
            <NLPDateInput onDateParsed={v=>{
              set("due",v);
              if(!f.startDate) set("startDate",v);
            }}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>START DATE</label><DateInput style={inp} value={f.startDate||""} onChange={val=>{
              const v=val||null;
              set("startDate",v);
              if(v && (!f.due || f.due===f.startDate)) set("due",v);
            }}/></div>
            <div>
              <label style={lbl}>END DATE = DUE DATE</label>
              <DateInput style={inp} value={f.due||""} onChange={val=>set("due",val||null)}/>
              {f.due&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>endDate auto-synced</div>}
            </div>
          </div>

          {f.subtasks.length===0&&<div><label style={lbl}>PROGRESS — {f.progress}%</label><input type="range" min={0} max={100} value={f.progress} onChange={e=>set("progress",+e.target.value)} style={{width:"100%",accentColor:"#6366f1"}}/></div>}
          <div>
            <label style={lbl}>SUBTASKS {f.subtasks.length>0&&`(${doneSubs}/${f.subtasks.length} — ${autoProgress}%)`}</label>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <input style={{...inp,flex:1}} value={newSub} onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSub()} placeholder="Add subtask… (Enter)"/>
              <button onClick={addSub} style={{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:"pointer",fontWeight:700,fontSize:13}}>+</button>
              <button onClick={aiGenerateSubtasks} disabled={aiBusy} title="Let AI break this into subtasks"
                style={{background:aiBusy?"#94a3b8":"#8b5cf6",border:"none",borderRadius:8,color:"#fff",padding:"0 12px",cursor:aiBusy?"wait":"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>
                {aiBusy?"⏳":"✨ AI"}</button>
            </div>
            {aiErr&&<div style={{fontSize:11,color:"#f59e0b",marginBottom:8}}>{aiErr}</div>}
            {f.subtasks.map(s=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:"var(--c-surface)",borderRadius:7,marginBottom:5}}>
                <button onClick={()=>toggleSub(s.id)} style={{width:16,height:16,borderRadius:4,flexShrink:0,border:`2px solid ${s.done?"#22c55e":"var(--c-text-muted)"}`,background:s.done?"#22c55e22":"transparent",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#22c55e",fontSize:10}}>{s.done?"✓":""}</button>
                <span style={{flex:1,color:s.done?"var(--c-text-muted)":"var(--c-text)",fontSize:12,textDecoration:s.done?"line-through":"none"}}>{s.text}</span>
                <button onClick={()=>removeSub(s.id)} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13,padding:0}}>×</button>
              </div>
            ))}
          </div>
          <AttachmentsField
            attachments={f.attachments||[]}
            onChange={v=>set("attachments", typeof v==="function"?v(f.attachments||[]):v)}
            inp={inp} lbl={lbl}
          />
          <div><label style={lbl}>NOTES</label><textarea style={{...inp,height:70,resize:"vertical",lineHeight:1.5}} value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="Additional notes…"/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"9px 20px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13}}>Cancel</button>
          {task&&task.id&&onDuplicate&&(
            <button onClick={()=>{onDuplicate(f);onClose();}} title="Duplicate this task"
              style={{padding:"9px 18px",borderRadius:8,border:"1.5px solid #475569",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13,fontWeight:700}}>
              📋 Duplicate
            </button>
          )}
          <button onClick={()=>{if(!f.title.trim())return;const payload={...f,progress:f.subtasks.length>0?autoProgress:f.progress,id:f.id||newId()};if(needsNextDue(payload, task?.status)){setPendingDone(payload);return;}onSave(payload);}} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800}}>Save Task</button>
          {pendingDone&&<NextDuePopup task={pendingDone} onCancel={()=>setPendingDone(null)}
            onConfirm={(meta)=>{const p={...pendingDone,...meta};setPendingDone(null);onSave(p);}}/>}
        </div>
      </div>
    </div>
  );
}

function PersonalModal({ task, onSave, onClose, allTasks, onDuplicate }) {
  const [colorTick, setColorTick] = useState(0); // N74: repaint after a colour change
  const blank = { title:"", description:"", cat:"Home", due:"", startDate:"", recur:"", status:"pending", isRecurring:false, location:"", attachments:[], priority:"Medium", pinned:false, deps:[], notes:"", originalDue:"", delayLabel:"", milestone:true, milestoneAt:"", subtasks:[] };
  // C1/N-Form: pre-populate ALL fields from saved task including startDate/due
  const [f, setF] = useState(task ? { ...blank, ...task, subtasks:(task.subtasks||[]) } : blank);
  const [showPostponedPopup, setShowPostponedPopup] = useState(false);
  const [customCat, setCustomCat] = useState("");
  const [customStatus, setCustomStatus] = useState("");
  const [showCustomCat, setShowCustomCat] = useState(false);
  const [showCustomStatus, setShowCustomStatus] = useState(false);
  const set = (k,v) => {
    if (k==="status" && v==="postponed") {
      setShowPostponedPopup(true); // N-Postponed: show popup before setting status
    }
    setF(p=>({...p,[k]:v}));
  };
  // N34: subtasks in Personal too — manual add/remove + AI, max 20 total
  const [newSub, setNewSub] = useState("");
  const MAX_SUBS = 20;
  const [pendingDone, setPendingDone] = useState(null); // N37: next-due popup payload
  const addSub = () => { if(!newSub.trim()||f.subtasks.length>=MAX_SUBS) return; set("subtasks",[...f.subtasks,{id:Date.now(),text:newSub.trim(),done:false}]); setNewSub(""); };
  const toggleSub = id => set("subtasks", f.subtasks.map(s=>s.id===id?{...s,done:!s.done}:s));
  const removeSub = id => set("subtasks", f.subtasks.filter(s=>s.id!==id));
  const doneSubs = f.subtasks.filter(s=>s.done).length;
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const aiGenerateSubtasks = async () => {
    if (!f.title.trim()) { setAiErr("Enter a task title first"); return; }
    if (f.subtasks.length>=MAX_SUBS) { setAiErr(`Limit of ${MAX_SUBS} reached`); return; }
    setAiBusy(true); setAiErr("");
    try {
      const prompt = `Break this goal into 3-7 concrete, actionable subtasks. Goal: "${f.title}"${f.description?` (details: ${f.description})`:""}. Reply ONLY with a JSON array of short strings, no other text. Example: ["Step one","Step two"]. Reply in the same language as the goal.`;
      const out = await callClaude(prompt, 600);
      let arr; try { arr = JSON.parse(out.replace(/```json|```/g,"").trim()); } catch { arr = out.split("\n").map(l=>l.replace(/^[-*\d.\s]+/,"").trim()).filter(Boolean); }
      if (Array.isArray(arr) && arr.length) {
        const room = MAX_SUBS - f.subtasks.length;
        const subs = arr.slice(0,room).map((t,i)=>({id:Date.now()+i,text:String(t).slice(0,120),done:false}));
        set("subtasks",[...f.subtasks,...subs]);
      } else setAiErr("Could not break it down — try again");
    } catch { setAiErr("AI only works when published as an artifact"); }
    setAiBusy(false);
  };

  // derive all categories from existing personal tasks
  const existingCats = useMemo(()=>{
    const base = Object.keys(CAT_COLOR);
    const extra = (allTasks||[]).map(t=>t.cat).filter(c=>c&&!base.includes(c));
    return [...base,...new Set(extra)];
  },[allTasks]);

  // derive all statuses
  const existingStatuses = useMemo(()=>{
    const base = ["pending","overdue","postponed","done"];
    const extra = (allTasks||[]).map(t=>t.status).filter(s=>s&&!base.includes(s));
    return [...base,...new Set(extra)];
  },[allTasks]);

  const inp = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1.5px solid var(--c-border)", background:"var(--c-surface)", color:"var(--c-text)", fontSize:13, outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:11, color:"var(--c-text-muted)", marginBottom:4, fontWeight:700, letterSpacing:"0.06em" };

  const handleAddCat = () => {
    const v = customCat.trim();
    if (!v) return;
    set("cat", v);
    setCustomCat("");
    setShowCustomCat(false);
  };
  const handleAddStatus = () => {
    const v = customStatus.trim();
    if (!v) return;
    set("status", v);
    setCustomStatus("");
    setShowCustomStatus(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:520,boxShadow:"0 25px 60px rgba(0,0,0,.7)",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <h3 style={{margin:0,color:"var(--c-text)",fontSize:17,fontWeight:800}}>{task?"✏️ Edit Task":"➕ New Personal Task"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"grid",gap:13}}>
          <div><label style={lbl}>TITLE</label><input style={inp} value={f.title} onChange={e=>set("title",e.target.value)} placeholder="Task description…"/></div>
          <div><label style={lbl}>DESCRIPTION <span style={{fontWeight:500,color:"var(--c-text-muted)"}}>· type @ to link</span></label><MentionTextarea style={{...inp,height:72,resize:"vertical",lineHeight:1.6}} value={f.description||""} onChange={v=>set("description",v)} placeholder="Add more detail…  type @ to link a task/note/event"/></div>
          {/* N34: SUBTASKS for Personal (manual + AI, max 20) */}
          <div>
            <label style={lbl}>SUBTASKS {f.subtasks.length>0&&`(${doneSubs}/${f.subtasks.length})`} <span style={{fontWeight:500,color:"var(--c-text-muted)"}}>· max {MAX_SUBS}</span></label>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              <input style={{...inp,flex:1}} value={newSub} onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSub()} placeholder={f.subtasks.length>=MAX_SUBS?`Limit of ${MAX_SUBS} reached`:"Add subtask… (Enter)"} disabled={f.subtasks.length>=MAX_SUBS}/>
              <button onClick={addSub} disabled={f.subtasks.length>=MAX_SUBS} style={{background:f.subtasks.length>=MAX_SUBS?"#94a3b8":"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:f.subtasks.length>=MAX_SUBS?"not-allowed":"pointer",fontWeight:700,fontSize:13}}>+</button>
              <button onClick={aiGenerateSubtasks} disabled={aiBusy||f.subtasks.length>=MAX_SUBS} title="Let AI break this into subtasks"
                style={{background:(aiBusy||f.subtasks.length>=MAX_SUBS)?"#94a3b8":"#8b5cf6",border:"none",borderRadius:8,color:"#fff",padding:"0 12px",cursor:aiBusy?"wait":"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>
                {aiBusy?"⏳":"✨ AI"}</button>
            </div>
            {aiErr&&<div style={{fontSize:11,color:"#f59e0b",marginBottom:8}}>{aiErr}</div>}
            {f.subtasks.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:4}}>
                {f.subtasks.map(s=>(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--c-surface2)",borderRadius:8,border:"1px solid var(--c-border)"}}>
                    <span onClick={()=>toggleSub(s.id)} style={{cursor:"pointer",fontSize:14,color:s.done?"#22c55e":"var(--c-text-muted)"}}>{s.done?"☑":"☐"}</span>
                    <span style={{flex:1,fontSize:12,color:"var(--c-text)",textDecoration:s.done?"line-through":"none",opacity:s.done?0.6:1}}>{s.text}</span>
                    <span onClick={()=>removeSub(s.id)} style={{cursor:"pointer",fontSize:12,color:"var(--c-text-muted)",opacity:0.6}}>✕</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>📍 LOCATION</label>
            <div style={{position:"relative"}}>
              <input style={{...inp,paddingRight:90}} value={f.location||""} onChange={e=>set("location",e.target.value)} placeholder="e.g. Siam Paragon, Bangkok or paste an address…"/>
              {f.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.location)}`} target="_blank" rel="noopener noreferrer" style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"#1e40af",color:"#93c5fd",fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:6,textDecoration:"none",whiteSpace:"nowrap"}}>Open Map ↗</a>}
            </div>
          </div>

          {/* Category with custom add */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <label style={{...lbl,marginBottom:0}}>CATEGORY</label>
              <button onClick={()=>setShowCustomCat(v=>!v)} style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f133",borderRadius:20,padding:"2px 8px",cursor:"pointer"}}>
                {showCustomCat?"✕ Cancel":"＋ New category"}
              </button>
            </div>
            {showCustomCat?(
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp,flex:1}} value={customCat} onChange={e=>setCustomCat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddCat()} placeholder="Category name… (Enter to add)"/>
                <button onClick={handleAddCat} style={{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:"pointer",fontWeight:800,fontSize:13}}>Add</button>
              </div>
            ):(
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {existingCats.map(c=>{
                  const cc = CAT_COLOR[c]||"#94a3b8";
                  return (
                    <button key={c} onClick={()=>set("cat",c)} style={{padding:"4px 12px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",
                      borderColor:f.cat===c?cc:"var(--c-border)",background:f.cat===c?cc+"22":"transparent",color:f.cat===c?cc:"var(--c-text-muted)"}}>
                      {c}
                    </button>
                  );
                })}
                {f.cat&&!existingCats.includes(f.cat)&&(
                  <button style={{padding:"4px 12px",borderRadius:20,border:"1px solid #a78bfa",background:"#a78bfa22",fontSize:11,fontWeight:700,color:"#a78bfa",cursor:"default"}}>
                    ✦ {f.cat}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* N4: Milestone checkbox — default ON */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,
            border:`1.5px solid ${f.milestone?"#f59e0b55":"var(--c-border)"}`,
            background:f.milestone?"#f59e0b11":"transparent"}}>
            <button onClick={()=>set("milestone",!f.milestone)} style={{
              width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",
              border:`2px solid ${f.milestone?"#f59e0b":"var(--c-border)"}`,
              background:f.milestone?"#f59e0b":"transparent",color:"#fff",fontSize:14,fontWeight:900,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              {f.milestone?"✓":""}
            </button>
            <div style={{flex:1}}>
            {/* N74: the colour of this category, editable from the task itself */}
            <GroupColorPicker name={f.cat} current={groupColor(f.cat)}
              count={(typeof window!=="undefined"&&window.__groupColors)?window.__groupColors.countFor(f.cat):0}
              onPick={(n,c)=>{ window.__groupColors&&window.__groupColors.set(n,c); setColorTick(x=>x+1); }}
              label="CATEGORY COLOUR"/>

              <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>🏆 Track as Milestone</div>
              <div style={{fontSize:10,color:"var(--c-text-muted)"}}>When completed, saved to your Milestones timeline with a timestamp</div>
            </div>
          </div>

          {/* N13/N14: Editable milestone timestamp — shown when done + milestone tracked */}
          {f.milestone && f.status==="done" && (
            <div>
              <label style={lbl}>🏆 MILESTONE TIMESTAMP</label>
              <input type="datetime-local" style={inp}
                value={isoToLocalInput(f.milestoneAt)}
                onChange={e=>set("milestoneAt", localInputToIso(e.target.value))}/>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>Defaults to the task's due date — edit to record the actual completion time</div>
            </div>
          )}

          {/* Status with custom add */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <label style={{...lbl,marginBottom:0}}>STATUS</label>
              <button onClick={()=>setShowCustomStatus(v=>!v)} style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f133",borderRadius:20,padding:"2px 8px",cursor:"pointer"}}>
                {showCustomStatus?"✕ Cancel":"＋ New status"}
              </button>
            </div>
            {showCustomStatus?(
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp,flex:1}} value={customStatus} onChange={e=>setCustomStatus(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddStatus()} placeholder="Status name… (Enter to add)"/>
                <button onClick={handleAddStatus} style={{background:"#6366f1",border:"none",borderRadius:8,color:"#fff",padding:"0 14px",cursor:"pointer",fontWeight:800,fontSize:13}}>Add</button>
              </div>
            ):(
              <>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {existingStatuses.map(s=>{
                  const sc = s==="overdue"?"#ef4444":s==="done"?"#22c55e":s==="pending"?"var(--c-text-muted)":s==="postponed"?"#f59e0b":"#a78bfa";
                  return (
                    <button key={s} onClick={()=>set("status",s)} style={{padding:"4px 12px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",
                      borderColor:f.status===s?sc:"var(--c-border)",background:f.status===s?sc+"22":"transparent",color:f.status===s?sc:"var(--c-text-muted)",textTransform:"capitalize"}}>
                      {s==="postponed"?"🔶 Postponed":s}
                    </button>
                  );
                })}
                {f.status&&!existingStatuses.includes(f.status)&&(
                  <button style={{padding:"4px 12px",borderRadius:20,border:"1px solid #a78bfa",background:"#a78bfa22",fontSize:11,fontWeight:700,color:"#a78bfa",cursor:"default",textTransform:"capitalize"}}>
                    ✦ {f.status}
                  </button>
                )}
              </div>

              {/* N-Postponed: show delay popup when postponed selected */}
              {showPostponedPopup&&f.status==="postponed"&&(
                <PostponedPopup
                  currentDue={f.due}
                  originalDue={f.originalDue}
                  onConfirm={({originalDue,newDue,delayLabel})=>{
                    // N54: the new date IS the end date; start date follows it automatically
                    setF(p=>({...p, originalDue, due:newDue, startDate:newDue, delayLabel}));
                    setShowPostponedPopup(false);
                  }}
                  onCancel={()=>{
                    setF(p=>({...p, status:"pending"}));
                    setShowPostponedPopup(false);
                  }}
                />
              )}
              {/* N-Postponed: show delay duration if already postponed */}
              {!showPostponedPopup&&f.status==="postponed"&&f.delayLabel&&(
                <div style={{background:"#f59e0b11",border:"1px solid #f59e0b33",borderRadius:8,
                  padding:"6px 12px",fontSize:11,fontWeight:800,color:"#f59e0b",
                  display:"flex",alignItems:"center",gap:6}}>
                  🔶 Postponed {f.delayLabel} from {f.originalDue||"original date"}
                  <button onClick={()=>setShowPostponedPopup(true)}
                    style={{marginLeft:"auto",fontSize:9,padding:"2px 8px",borderRadius:5,
                      border:"1px solid #f59e0b44",background:"transparent",color:"#f59e0b",cursor:"pointer"}}>
                    Edit dates
                  </button>
                </div>
              )}
              </>
            )}
          </div>

          {/* 3B: NLP Date Parser */}
          <div>
            <label style={{...lbl,display:"flex",alignItems:"center",gap:6}}>
              🗓 QUICK DATE <span style={{fontSize:9,fontWeight:500,color:"var(--c-text-muted)"}}>type natural language → fills End Date</span>
            </label>
            <NLPDateInput onDateParsed={v=>{
              set("due",v);
              if(!f.startDate) set("startDate",v);
            }}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>START DATE</label><DateInput style={inp} value={f.startDate||""} onChange={val=>{
              const v=val||null;
              set("startDate",v);
              if(v && (!f.due || f.due===f.startDate)) set("due",v);
            }}/></div>
            <div>
              <label style={lbl}>END DATE</label>
              <DateInput style={inp} value={f.due||""} onChange={val=>set("due",val||null)}/>
              {f.due&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>same as due date</div>}
            </div>
          </div>
          <div><label style={lbl}>TYPE</label><div style={{display:"flex",gap:6,paddingTop:2}}>{[true,false].map(r=><button key={r} onClick={()=>set("isRecurring",r)} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid",borderColor:f.isRecurring===r?"var(--c-accent)":"var(--c-border)",background:f.isRecurring===r?"var(--c-accent)22":"transparent",color:f.isRecurring===r?"var(--c-accent)":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{r?"🔁 Recurring":"1️⃣ One-time"}</button>)}</div></div>
          {f.isRecurring&&<div>
            <label style={lbl}>RECURRENCE</label>
            <input style={inp} value={f.recur||""} onChange={e=>set("recur",e.target.value)} placeholder="e.g. annual, every 3 months…"/>
            {/* N-QuickRecur presets (7) + N19: custom "every X [unit]" builder */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:6}}>
              {[
                ["Daily","daily"],["Weekly","weekly"],["Monthly","monthly"],["Quarterly","every 3 months"],
                ["Annually","annually"],["Every 2 weeks","every 2 weeks"],["Weekdays","weekdays (Mon-Fri)"],
              ].map(([label,val])=>{
                const active=f.recur===val;
                return (
                  <button key={val} onClick={()=>set("recur",val)}
                    style={{padding:"5px 4px",borderRadius:7,fontSize:10,fontWeight:700,cursor:"pointer",
                      border:`1px solid ${active?"var(--c-accent)":"var(--c-border)"}`,
                      background:active?"var(--c-accent)22":"var(--c-surface2)",
                      color:active?"var(--c-accent)":"var(--c-text-muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {label}
                  </button>
                );
              })}
            </div>
            {/* N19: Every [N] [unit] — flexible custom builder */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:8,padding:"8px 10px",background:"var(--c-surface2)",borderRadius:8,border:"1px solid var(--c-border)"}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--c-text-muted)",whiteSpace:"nowrap"}}>Every</span>
              <input type="number" min="1" defaultValue="1" id="everyXNum"
                style={{width:50,padding:"5px 6px",borderRadius:6,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,textAlign:"center"}}/>
              <select id="everyXUnit" style={{flex:1,padding:"5px 8px",borderRadius:6,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12}}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
              <button onClick={()=>{
                const n=document.getElementById("everyXNum").value||"1";
                const u=document.getElementById("everyXUnit").value;
                set("recur",`every ${n} ${u}`);
              }} style={{padding:"5px 12px",borderRadius:6,border:"none",background:"var(--c-accent)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Set</button>
            </div>
          </div>}

          {/* Priority + Pin */}
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
            <div>
              <label style={lbl}>PRIORITY</label>
              <div style={{display:"flex",gap:6}}>
                {["High","Medium","Low"].map(p=>(
                  <button key={p} onClick={()=>set("priority",p)} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid",
                    borderColor:f.priority===p?PRIORITY_CFG[p].color:"var(--c-border)",
                    background:f.priority===p?PRIORITY_CFG[p].bg:"transparent",
                    color:f.priority===p?PRIORITY_CFG[p].color:"var(--c-text-muted)",
                    fontSize:11,fontWeight:700,cursor:"pointer"}}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>PIN TO TOP</label>
              <button onClick={()=>set("pinned",!f.pinned)} style={{
                display:"flex",alignItems:"center",gap:6,padding:"8px 14px",
                borderRadius:8,border:`1.5px solid ${f.pinned?"#f59e0b":"var(--c-border)"}`,
                background:f.pinned?"#f59e0b22":"transparent",
                color:f.pinned?"#fbbf24":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"
              }}>
                {f.pinned?"📌 Pinned":"📌 Pin"}
              </button>
            </div>
          </div>
          <AttachmentsField
            attachments={f.attachments||[]}
            onChange={v=>set("attachments", typeof v==="function"?v(f.attachments||[]):v)}
            inp={inp} lbl={lbl}
          />
        </div>
        <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"9px 20px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13}}>Cancel</button>
          {task&&task.id&&onDuplicate&&(
            <button onClick={()=>{onDuplicate(f);onClose();}} title="Duplicate this task"
              style={{padding:"9px 18px",borderRadius:8,border:"1.5px solid #475569",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13,fontWeight:700}}>
              📋 Duplicate
            </button>
          )}
          <button onClick={()=>{if(!f.title.trim())return;const payload={...f,id:f.id||newId()};if(needsNextDue(payload, task?.status)){setPendingDone(payload);return;}onSave(payload);}} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800}}>Save</button>
          {pendingDone&&<NextDuePopup task={pendingDone} onCancel={()=>setPendingDone(null)}
            onConfirm={(meta)=>{const p={...pendingDone,...meta};setPendingDone(null);onSave(p);}}/>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS — shared between Personal & Work
// ─────────────────────────────────────────────────────────────────────────────

// Detect what kind of attachment a URL/data is
// N97: turn whatever the user typed into a usable place. Supports raw "lat,lng",
// a pasted Google Maps URL, or a plain place name (opens a Maps search).
function parseLatLng(text) {
  const m = String(text||"").match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (m) { const lat=parseFloat(m[1]), lng=parseFloat(m[2]);
    if (lat>=-90&&lat<=90&&lng>=-180&&lng<=180) return { lat, lng }; }
  return null;
}
function buildMapsUrl(loc) {
  if (!loc) return "";
  if (loc.url) return loc.url;
  if (typeof loc.lat==="number" && typeof loc.lng==="number")
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  if (loc.name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;
  return "";
}
// a compact clickable place pin used on cards / timeline / gantt / calendar
function PlacePin({ loc, size=11, dark=false }) {
  if (!loc || (!loc.name && !loc.lat && !loc.url)) return null;
  const label = loc.name || (typeof loc.lat==="number" ? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}` : "Location");
  return (
    <a href={buildMapsUrl(loc)} target="_blank" rel="noopener noreferrer"
      onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}
      title={`Open in Google Maps: ${label}`}
      style={{display:"inline-flex",alignItems:"center",gap:2,textDecoration:"none",
        fontSize:size,fontWeight:700,color:dark?"#fff":"#ec4899",flexShrink:0,
        maxWidth:160,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",
        filter:dark?"drop-shadow(0 1px 1px rgba(0,0,0,.4))":"none"}}>
      <span style={{flexShrink:0}}>📍</span>
      <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
    </a>
  );
}

// N107: a content fingerprint. Any edit anywhere — a renamed task, a changed due
// date, a tweaked note — changes the digest, unlike a plain item count.
function payloadDigest(p) {
  if (!p) return "";
  const pick = (arr)=>Array.isArray(arr)?arr:[];
  const shape = JSON.stringify({
    personal: pick(p.personal), work: pick(p.work), events: pick(p.events),
    notes: pick(p.notes), customTabs: pick(p.customTabs),
    eventTypes: pick(p.eventTypes), calViews: pick(p.calViews),
    ganttViews: pick(p.ganttViews), timelineViews: pick(p.timelineViews),
    groupColors: p.groupColors||{},
  });
  // FNV-1a — small, fast, no dependencies, plenty for change detection.
  let h = 0x811c9dc5;
  for (let i=0;i<shape.length;i++){ h ^= shape.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h>>>0).toString(16) + ":" + shape.length;
}
function payloadCounts(p) {
  const n = (a)=>Array.isArray(a)?a.length:0;
  return { tasks: n(p?.personal)+n(p?.work), events: n(p?.events), notes: n(p?.notes) };
}

function detectAttachType(item) {
  if (item.type === "file") {
    const mime = item.mime || "";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "file";
  }
  // hyperlink
  const url = (item.url || "").toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/.test(url)) return "image";
  if (/\.(mp4|mov|webm|avi|mkv)(\?|$)/.test(url) || url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com")) return "video-link";
  return "link";
}

function attachIcon(kind) {
  return kind==="image"?"🖼️":kind==="video"?"🎬":kind==="video-link"?"▶️":kind==="file"?"📎":"🔗";
}

// the image/video source to show in a preview (base64 data URL for files, else the link)
function attachSrc(item) { return item.type==="file" ? item.data : item.url; }

// Everything the app is willing to render as an image source. The wrapper
// script (mtp-security-bootstrap) publishes the same sanitiser the rest of the
// page is hardened with, so use it when present and there is exactly one
// definition of "safe". The local fallback keeps dev builds and the render
// harness working, where the wrapper is not loaded.
function safeImageSrc(item) {
  const raw = item ? (item.type === "file" ? item.data : item.url) : "";
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  const S = (typeof window !== "undefined") && window.__MTP_SECURITY__;
  if (S && typeof S.safeURL === "function") return S.safeURL(v, "img") || "";
  if (/^data:image\//i.test(v) || /^blob:/i.test(v) || /^https:\/\//i.test(v)) return v;
  return "";
}

// The images a task actually owns: attachments carried by this exact task that
// really are images and resolve to a usable source. Every surface that shows
// image UI asks this first. Before this existed, a task holding only a PDF
// still got a badge, reserved image spacing and a clickable preview target,
// and counts came from attachments.length rather than from the images — so a
// task with three PDFs advertised three pictures that were never there.
// Note bodies are rich HTML the user built themselves, but they also arrive
// from imported files and from a synced cloud copy, so they are not trusted on
// the way out. The wrapper script installs a document-wide innerHTML sanitiser;
// this routes through the same one so there is a single set of rules. Anything
// written into a NEW document (print/export windows) must pass through here —
// the wrapper cannot reach inside a window the app opens itself.
function sanitizeNoteHTML(html) {
  const raw = typeof html === "string" ? html : "";
  if (!raw) return "";
  const S = (typeof window !== "undefined") && window.__MTP_SECURITY__;
  if (S && typeof S.sanitizeHTML === "function") return S.sanitizeHTML(raw);
  // No wrapper (dev server, tests): strip the tags that actually execute rather
  // than shipping the string through untouched.
  return raw
    .replace(/<\s*(script|iframe|object|embed|link|meta|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

function taskImages(task) {
  const list = Array.isArray(task && task.attachments) ? task.attachments : [];
  return list.filter(a => a && detectAttachType(a) === "image" && !!safeImageSrc(a));
}

// N101: a tiny image thumbnail used in place of the 🖼️ icon everywhere attachments
// appear. Falls back to the emoji icon if the image fails to load.
function AttachThumb({ item, px=22, radius=4 }) {
  const kind = detectAttachType(item);
  const [failed, setFailed] = React.useState(false);
  const src = safeImageSrc(item);
  if (kind==="image" && src && !failed) {
    return (
      <img src={src} alt="" loading="lazy"
        onError={()=>setFailed(true)}
        style={{width:px,height:px,objectFit:"cover",borderRadius:radius,
          border:"1px solid var(--c-border)",display:"inline-block",verticalAlign:"middle",flexShrink:0}}/>
    );
  }
  return <span style={{fontSize:px*0.7,lineHeight:1}}>{attachIcon(kind)}</span>;
}

// N89: a compact row of attachment icons for a Timeline banner. Clicking an image
// or video opens the shared MediaLightbox; a link opens in a new browser tab.
function TimelineAttachIcons({ attachments, onMedia, size=13, dark=false }) {
  if(!Array.isArray(attachments) || !attachments.length) return null;
  const fg = dark ? "#ffffff" : "var(--c-text)";
  return (
    <span style={{display:"inline-flex",gap:3,alignItems:"center",flexShrink:0}}>
      {attachments.slice(0,4).map((a,i)=>{
        const kind = detectAttachType(a);
        const name = a.name||a.label||a.url||kind;
        // Opening an attachment was mouse-only until 3.76: these are real
        // controls, so they take focus, announce themselves, and respond to
        // Enter/Space like any button would.
        const activate = () => {
          if(kind==="image" || kind==="video"){ onMedia && onMedia(a); }
          else { const u=a.url||a.data; if(u) window.open(u,"_blank","noopener"); }
        };
        return (
          <span key={a.id||i} title={name}
            role="button" tabIndex={0}
            aria-label={`Open ${kind==="image"?"image":kind==="video"?"video":"attachment"}: ${String(name).slice(0,80)}`}
            onMouseDown={e=>{ e.stopPropagation(); }}
            onClick={e=>{ e.stopPropagation(); activate(); }}
            onKeyDown={e=>{
              if(e.key==="Enter" || e.key===" " || e.key==="Spacebar"){
                e.preventDefault(); e.stopPropagation(); activate();
              }
            }}
            onDoubleClick={e=>e.stopPropagation()}
            style={{cursor:"pointer",fontSize:size,lineHeight:1,opacity:dark?0.95:0.85,display:"inline-flex",alignItems:"center",
              filter:dark?"drop-shadow(0 1px 1px rgba(0,0,0,.4))":"none"}}>
            {kind==="image" ? <AttachThumb item={a} px={size+5} radius={3}/> : attachIcon(kind)}
          </span>
        );
      })}
      {attachments.length>4 && (
        <span style={{fontSize:size-3,fontWeight:800,color:fg,opacity:0.7}}>+{attachments.length-4}</span>
      )}
    </span>
  );
}

// Render a single attachment pill on the card
function AttachPill({ item, small }) {
  const kind = detectAttachType(item);
  const label = item.label || item.name || item.url || "attachment";
  const isLink = kind==="link"||kind==="video-link"||kind==="image"&&item.type!=="file";

  if (item.type==="file") {
    // Base64 stored file — open in new tab
    const href = item.data; // data URL
    return (
      <a href={href} download={item.name} target="_blank" rel="noopener noreferrer"
        style={{display:"inline-flex",alignItems:"center",gap:5,
          background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:6,
          padding:kind==="image"?(small?"2px 7px 2px 3px":"3px 9px 3px 3px"):(small?"2px 7px":"3px 9px"),textDecoration:"none",
          color:"var(--c-text-muted)",fontSize:small?10:11,fontWeight:600,maxWidth:200,flexShrink:0}}>
        <AttachThumb item={item} px={small?18:22}/>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</span>
      </a>
    );
  }
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      style={{display:"inline-flex",alignItems:"center",gap:5,
        background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:6,
        padding:kind==="image"?(small?"2px 7px 2px 3px":"3px 9px 3px 3px"):(small?"2px 7px":"3px 9px"),textDecoration:"none",
        color:"var(--c-text-muted)",fontSize:small?10:11,fontWeight:600,maxWidth:220,flexShrink:0}}>
      <AttachThumb item={item} px={small?18:22}/>
      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      <span style={{fontSize:9,opacity:0.5,flexShrink:0}}>↗</span>
    </a>
  );
}

// Inline image/video preview
function AttachPreview({ item }) {
  const kind = detectAttachType(item);
  const src = item.type==="file" ? item.data : item.url;
  if (kind==="image") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" style={{display:"block",marginTop:6}}>
        <img src={src} alt={item.name||item.label||""}
          style={{maxWidth:"100%",maxHeight:160,borderRadius:8,objectFit:"cover",
            border:"1px solid var(--c-border)",display:"block"}}
          onError={e=>{e.target.style.display="none";}}/>
      </a>
    );
  }
  if (kind==="video") {
    return (
      <video controls src={src} style={{maxWidth:"100%",maxHeight:160,borderRadius:8,marginTop:6,display:"block"}}/>
    );
  }
  return null;
}

// Full attachment manager used inside modals
function AttachmentsField({ attachments=[], onChange, inp, lbl }) {
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addMode, setAddMode] = useState(null); // null | "link" | "file"

  const addLink = () => {
    let url = newUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const label = newLabel.trim() || url;
    onChange([...attachments, { id:newId(), type:"link", url, label }]);
    setNewUrl(""); setNewLabel(""); setAddMode(null);
  };

  const addFile = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach(file => {
      // 5 MB limit per file
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name} is too large (max 5 MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        onChange(prev => [...(prev||[]), {
          id: newId(),
          type: "file",
          name: file.name,
          mime: file.type,
          data: ev.target.result,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
    setAddMode(null);
  };

  const remove = (id) => onChange(attachments.filter(a=>a.id!==id));

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <label style={{...lbl,marginBottom:0}}>📎 ATTACHMENTS {attachments.length>0&&`(${attachments.length})`}</label>
        <div style={{display:"flex",gap:5}}>
          {[["link","🔗 Link / URL"],["file","🖼️ File / Image / VDO"]].map(([m,l])=>(
            <button key={m} onClick={()=>setAddMode(addMode===m?null:m)} style={{
              fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:20,cursor:"pointer",
              border:`1px solid ${addMode===m?"#6366f1":"var(--c-border)"}`,
              background:addMode===m?"#6366f122":"transparent",
              color:addMode===m?"#a5b4fc":"var(--c-text-muted)"
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Link input */}
      {addMode==="link"&&(
        <div style={{background:"var(--c-surface2)",borderRadius:9,padding:"10px 12px",marginBottom:8,border:"1px solid var(--c-border)"}}>
          <div style={{display:"grid",gap:7}}>
            <input style={inp} value={newUrl} onChange={e=>setNewUrl(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addLink()}
              placeholder="https://example.com or YouTube/Vimeo URL…"/>
            <input style={inp} value={newLabel} onChange={e=>setNewLabel(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addLink()}
              placeholder="Label (optional) e.g. 'Reference doc', 'Tutorial video'"/>
            <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              <button onClick={()=>setAddMode(null)} style={{padding:"5px 14px",borderRadius:7,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:12,cursor:"pointer"}}>Cancel</button>
              <button onClick={addLink} style={{padding:"5px 14px",borderRadius:7,border:"none",background:"#6366f1",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Add Link</button>
            </div>
          </div>
        </div>
      )}

      {/* File input */}
      {addMode==="file"&&(
        <div style={{background:"var(--c-surface2)",borderRadius:9,padding:"10px 12px",marginBottom:8,border:"1px solid var(--c-border)"}}>
          <p style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:7}}>Supported: images (JPG, PNG, GIF, WebP), video (MP4, MOV, WebM), PDF, and other files — up to 5 MB per file</p>
          <input type="file" multiple accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={addFile}
            style={{...inp,cursor:"pointer",padding:"8px 10px",fontSize:12}}/>
          <button onClick={()=>setAddMode(null)} style={{marginTop:7,padding:"4px 12px",borderRadius:7,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:11,cursor:"pointer"}}>Cancel</button>
        </div>
      )}

      {/* Existing attachments */}
      {attachments.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {attachments.map(a=>{
            const kind = detectAttachType(a);
            const label = a.label||a.name||a.url||"";
            return (
              <div key={a.id} style={{background:"var(--c-surface2)",borderRadius:8,padding:"7px 10px",border:"1px solid var(--c-border)"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:15,flexShrink:0}}>{attachIcon(kind)}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:"var(--c-text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                    {a.url&&<div style={{fontSize:10,color:"var(--c-text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.url}</div>}
                    {a.mime&&<div style={{fontSize:10,color:"var(--c-text-muted)"}}>{a.mime} · {a.data?Math.round(a.data.length*0.75/1024)+"KB":""}</div>}
                  </div>
                  {(a.url||a.data)&&(
                    <a href={a.data||a.url} target="_blank" rel="noopener noreferrer" download={a.type==="file"?a.name:undefined}
                      style={{fontSize:11,color:"#60a5fa",fontWeight:700,textDecoration:"none",flexShrink:0,padding:"2px 7px",background:"#1e40af22",border:"1px solid #1e40af44",borderRadius:5}}>
                      {a.type==="file"?"↓ Open":"↗ Open"}
                    </a>
                  )}
                  <button onClick={()=>remove(a.id)} style={{background:"#7f1d1d22",border:"1px solid #7f1d1d44",borderRadius:5,padding:"2px 7px",color:"#f87171",fontSize:11,cursor:"pointer",flexShrink:0}}>✕</button>
                </div>
                {/* Inline image preview */}
                {(kind==="image")&&<AttachPreview item={a}/>}
              </div>
            );
          })}
        </div>
      )}

      {attachments.length===0&&addMode===null&&(
        <div style={{fontSize:11,color:"var(--c-text-muted)",fontStyle:"italic",padding:"4px 0"}}>
          No attachments yet — use 🔗 Link or 🖼️ File to add one
        </div>
      )}
    </div>
  );
}

// Compact display of attachments on cards
function AttachmentsList({ attachments }) {
  if (!attachments||!attachments.length) return null;
  return (
    <div style={{marginTop:7,display:"flex",flexWrap:"wrap",gap:5}}>
      {attachments.map(a=><AttachPill key={a.id} item={a} small/>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA CARD STRIP — shared thumbnail strip for Personal & Work cards
// ─────────────────────────────────────────────────────────────────────────────
function MediaCardStrip({ attachments, onLightbox }) {
  if (!attachments||!attachments.length) return null;
  const media = attachments.filter(a=>{
    const k=detectAttachType(a);
    return k==="image"||k==="video"||k==="video-link";
  });
  if (!media.length) return null;
  return (
    <div style={{
      display:"flex",gap:2,marginTop:8,marginBottom:2,
      height: media.length===1?100:70,
      borderRadius:6,overflow:"hidden",background:"var(--c-card2)",
    }}>
      {media.slice(0,3).map((a,ai)=>{
        const kind=detectAttachType(a);
        const src=a.type==="file"?a.data:a.url;
        const isOverflow=ai===2&&media.length>3;
        return (
          <div key={a.id} style={{flex:1,position:"relative",overflow:"hidden",cursor:"pointer"}}
            onClick={e=>{e.stopPropagation();onLightbox(a);}}>
            {kind==="image"?(
              <img src={src} alt={a.name||a.label||""} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",transition:"transform .2s"}}
                onMouseEnter={e=>e.target.style.transform="scale(1.06)"}
                onMouseLeave={e=>e.target.style.transform=""}
                onError={e=>{e.target.style.display="none";}}/>
            ):(
              <div style={{width:"100%",height:"100%",background:"var(--c-surface)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
                <span style={{fontSize:18}}>▶️</span>
                <span style={{fontSize:9,color:"var(--c-text-muted)",maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name||a.label||"video"}</span>
              </div>
            )}
            {isOverflow&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800}}>+{media.length-2}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARDS
// ─────────────────────────────────────────────────────────────────────────────
function WorkCard({ t, onEdit, onDelete, onToggleDone, onLightbox, onTogglePin, onDuplicate }) {
  const pc = PRIORITY_CFG[t.priority]||PRIORITY_CFG.Medium;
  const cc = WORK_CAT_COLOR[t.cat]||"#94a3b8";
  const isDone = t.status==="done";
  const prog = t.subtasks?.length>0 ? Math.round(t.subtasks.filter(s=>s.done).length/t.subtasks.length*100) : (t.progress||0);
  return (
    <div style={{background:isDone?"var(--c-card2)":"var(--c-surface)",border:`1px solid ${isDone?"var(--c-surface)":t.pinned?"#f59e0b55":"var(--c-border)"}`,borderLeft:`3px solid ${t.pinned?"#f59e0b":cc}`,borderRadius:10,overflow:"hidden",opacity:isDone?0.65:1}}>
      {/* Media strip */}
      {!isDone&&<div style={{padding:"0 0 0 0"}}><MediaCardStrip attachments={t.attachments} onLightbox={onLightbox||((a)=>window.open(a.data||a.url,"_blank"))}/></div>}
      <div style={{padding:"12px 14px"}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <button onClick={()=>onToggleDone(t.id)} style={{width:20,height:20,borderRadius:5,flexShrink:0,marginTop:1,border:`2px solid ${isDone?"#22c55e":"var(--c-text-muted)"}`,background:isDone?"#22c55e22":"transparent",cursor:"pointer",color:"#22c55e",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{isDone?"✓":""}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:isDone?"var(--c-text-muted)":"var(--c-text)",fontSize:14,fontWeight:600,lineHeight:1.4,textDecoration:isDone?"line-through":"none",marginBottom:t.description?4:7,display:"flex",alignItems:"flex-start",gap:4}}>
            {t.pinned&&<span style={{fontSize:12,flexShrink:0,marginTop:1}}>📌</span>}
            <span>{t.title}</span>
          </div>
          {t.description&&<div style={{fontSize:12,color:isDone?"var(--c-border)":"var(--c-text-muted)",lineHeight:1.5,marginBottom:7,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{renderMentions(t.description)}</div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>
            <Chip color={cc}>{t.cat}</Chip>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority}</span>
            {t.project&&<Chip color="#818cf8">📁 {t.project}</Chip>}
            {t.assignee&&<Chip color="#22d3ee">👤 {t.assignee}</Chip>}
            {!isDone&&t.due&&<span style={{fontSize:10,fontWeight:700,color:urgency(t).color}}>{urgency(t).label}</span>}
            {!isDone&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:t.status==="inprogress"?"#1e40af22":t.status==="review"?"#7c3aed22":"var(--c-border)",color:t.status==="inprogress"?"#60a5fa":t.status==="review"?"#a78bfa":"var(--c-text-muted)"}}>{t.status==="todo"?"To Do":t.status==="inprogress"?"In Progress":t.status==="review"?"Review":"Done"}</span>}
          </div>
          {!isDone&&<div><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:10,color:"var(--c-text-muted)"}}>{t.subtasks?.length>0?`${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length} subtasks`:"Progress"}</span><span style={{fontSize:10,fontWeight:700,color:prog===100?"#22c55e":prog>50?"#6366f1":"var(--c-text-muted)"}}>{prog}%</span></div><div style={{height:4,background:"var(--c-card2)",borderRadius:99,overflow:"hidden",border:"1px solid var(--c-border)"}}><div style={{height:"100%",borderRadius:99,width:`${prog}%`,background:prog===100?"#22c55e":prog>50?"#6366f1":"var(--c-text-muted)",transition:"width .3s"}}/></div></div>}
          {(t.startDate||t.due)&&(
            <div style={{display:"flex",gap:12,marginTop:6,alignItems:"center"}}>
              {t.startDate&&<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:9,fontWeight:700,color:"var(--c-text-muted)",letterSpacing:"0.06em"}}>START</span><span style={{fontSize:10,color:"var(--c-text-muted)",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:5,padding:"1px 6px"}}>{fmtDate(t.startDate)}</span></div>}
              {t.startDate&&t.due&&<span style={{fontSize:9,color:"var(--c-text-muted)"}}>→</span>}
              {t.due&&<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:9,fontWeight:700,color:"var(--c-text-muted)",letterSpacing:"0.06em"}}>END / DUE</span><span style={{fontSize:10,fontWeight:700,color:urgency(t).color,background:urgency(t).color+"18",border:`1px solid ${urgency(t).color}33`,borderRadius:5,padding:"1px 6px"}}>{fmtDate(t.due)}</span></div>}
            </div>
          )}
          {t.notes&&<div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:5,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:400}}>{t.notes}</div>}
          {t.location&&(
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,textDecoration:"none",color:"#60a5fa",fontSize:11,fontWeight:600,background:"#1e40af18",border:"1px solid #1e40af44",borderRadius:6,padding:"3px 8px",maxWidth:"100%"}}>
              <span style={{fontSize:13}}>📍</span>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.location}</span>
              <span style={{flexShrink:0,fontSize:10,opacity:0.7}}>↗</span>
            </a>
          )}
          <AttachmentsList attachments={t.attachments}/>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>onTogglePin&&onTogglePin(t.id)} title={t.pinned?"Unpin":"Pin to Overview"}
            style={{background:t.pinned?"#f59e0b22":"var(--c-surface)",border:`1px solid ${t.pinned?"#f59e0b55":"var(--c-border)"}`,borderRadius:6,padding:"4px 7px",color:t.pinned?"#fbbf24":"var(--c-text-muted)",cursor:"pointer",fontSize:12}}>📌</button>
          <button onClick={()=>onDuplicate&&onDuplicate(t)} title="Duplicate task"
            style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:6,padding:"4px 8px",color:"var(--c-text-muted)",cursor:"pointer",fontSize:12}}>📋</button>
          <button onClick={()=>onEdit(t)} style={{background:"#1e40af22",border:"1px solid #1e40af55",borderRadius:6,padding:"4px 8px",color:"#60a5fa",cursor:"pointer",fontSize:12}}>✏️</button>
          <button onClick={()=>onDelete(t.id)} style={{background:"#7f1d1d22",border:"1px solid #7f1d1d55",borderRadius:6,padding:"4px 8px",color:"#f87171",cursor:"pointer",fontSize:12}}>🗑️</button>
        </div>
      </div>
      </div>
    </div>
  );
}

function PersonalCard({ t, onEdit, onDelete, onToggleDone, onLightbox, onTogglePin, onDuplicate }) {
  const urg = urgency(t);
  const cc = CAT_COLOR[t.cat]||"#6b7280";
  const done = t.status==="done";
  const pc = PRIORITY_CFG[t.priority||"Medium"];
  return (
    <div style={{background:done?"var(--c-card2)":"var(--c-surface)",border:`1px solid ${done?"var(--c-surface)":t.pinned?"#f59e0b55":t.status==="overdue"?"#7f1d1d":"var(--c-border)"}`,borderLeft:`3px solid ${done?"var(--c-border)":t.pinned?"#f59e0b":cc}`,borderRadius:10,overflow:"hidden",opacity:done?0.55:1}}>
      {!done&&<MediaCardStrip attachments={t.attachments} onLightbox={onLightbox||((a)=>window.open(a.data||a.url,"_blank"))}/>}
      <div style={{padding:"11px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
        <button onClick={()=>onToggleDone(t.id)} style={{width:20,height:20,borderRadius:5,flexShrink:0,marginTop:1,border:`2px solid ${done?"#22c55e":"var(--c-text-muted)"}`,background:done?"#22c55e22":"transparent",cursor:"pointer",color:"#22c55e",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{done?"✓":""}</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:5,marginBottom:2}}>
            {t.pinned&&<span title="Pinned" style={{fontSize:12,flexShrink:0,marginTop:1}}>📌</span>}
            <div className="lp-scale-data" style={{color:done?"var(--c-text-muted)":"var(--c-text)",fontSize:13,lineHeight:1.4,textDecoration:done?"line-through":"none",flex:1}}>{t.title}</div>
          </div>
          {t.description&&<div style={{fontSize:11,color:done?"var(--c-border)":"var(--c-text-muted)",lineHeight:1.5,marginTop:2,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{renderMentions(t.description)}</div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:5,alignItems:"center"}}>
            <Chip color={cc}>{t.cat}</Chip>
            {t.priority&&<span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority}</span>}
            {t.recur&&<Chip color="#818cf8">🔁 {t.recur}</Chip>}
            {urg&&!done&&<span style={{fontSize:10,fontWeight:700,color:urg.color}}>{urg.label}</span>}
          </div>
          {t.location&&(
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,textDecoration:"none",color:"#60a5fa",fontSize:11,fontWeight:600,background:"#1e40af18",border:"1px solid #1e40af44",borderRadius:6,padding:"3px 8px",maxWidth:"100%"}}>
              <span style={{fontSize:13}}>📍</span>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.location}</span>
              <span style={{flexShrink:0,fontSize:10,opacity:0.7}}>↗</span>
            </a>
          )}
          <AttachmentsList attachments={t.attachments}/>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0,flexDirection:"column",alignItems:"flex-end"}}>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>onTogglePin&&onTogglePin(t.id)} title={t.pinned?"Unpin":"Pin to Overview"}
              style={{background:t.pinned?"#f59e0b22":"var(--c-surface)",border:`1px solid ${t.pinned?"#f59e0b55":"var(--c-border)"}`,borderRadius:6,padding:"4px 7px",color:t.pinned?"#fbbf24":"var(--c-text-muted)",cursor:"pointer",fontSize:12}}>📌</button>
            <button onClick={()=>onDuplicate&&onDuplicate(t)} title="Duplicate task"
              style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:6,padding:"4px 8px",color:"var(--c-text-muted)",cursor:"pointer",fontSize:12}}>📋</button>
            <button onClick={()=>onEdit(t)} style={{background:"#1e40af22",border:"1px solid #1e40af55",borderRadius:6,padding:"4px 8px",color:"#60a5fa",cursor:"pointer",fontSize:12}}>✏️</button>
            <button onClick={()=>onDelete(t.id)} style={{background:"#7f1d1d22",border:"1px solid #7f1d1d55",borderRadius:6,padding:"4px 8px",color:"#f87171",cursor:"pointer",fontSize:12}}>🗑️</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GANTT TAB
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS — local bell system with due-date alarms
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_KEY = "lifeplanner-notifications-v1";
const TABREADS_KEY = "lifeplanner-tabreads-v1"; // Q6: per-tab last-read counts
const TABORDER_KEY = "lifeplanner-taborder-v1"; // N9: custom tab order

function buildNotifications(personal, work) {
  const all = [
    ...personal.map(t=>({...t,_type:"personal"})),
    ...work.map(t=>({...t,_type:"work"})),
  ];
  const notifs = [];
  all.forEach(t => {
    if (t.status==="done" || !t.due) return;
    const d = daysUntil(t.due);
    if (d === null) return;
    let level=null, msg="";
    if (d<0)       { level="overdue"; msg=`Overdue by ${Math.abs(d)}d`; }
    else if (d===0){ level="today";   msg="Due TODAY"; }
    else if (d<=3) { level="urgent";  msg=`Due in ${d}d`; }
    else if (d<=7) { level="soon";    msg=`Due in ${d}d`; }
    if (level) notifs.push({id:`${t._type}-${t.id}-${level}`,taskId:t.id,type:t._type,title:t.title,cat:t.cat||"",due:t.due,level,msg,read:false});
  });
  const order={overdue:0,today:1,urgent:2,soon:3};
  return notifs.sort((a,b)=>(order[a.level]??9)-(order[b.level]??9));
}

function NotificationPanel({ personal, work, onClose }) {
  const [readSet, setReadSet] = useState(()=>{
    try{return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY)||"[]"));}catch{return new Set();}
  });
  const allNotifs = useMemo(()=>buildNotifications(personal,work),[personal,work]);
  const unreadCount = allNotifs.filter(n=>!readSet.has(n.id)).length;
  const markRead = (id) => setReadSet(prev=>{
    const next=new Set(prev);next.add(id);
    try{localStorage.setItem(NOTIF_KEY,JSON.stringify([...next]));}catch{}
    return next;
  });
  const markAllRead = () => {
    const next=new Set(allNotifs.map(n=>n.id));
    setReadSet(next);
    try{localStorage.setItem(NOTIF_KEY,JSON.stringify([...next]));}catch{}
  };
  const lc = l=>l==="overdue"?"#ef4444":l==="today"?"#f97316":l==="urgent"?"#f59e0b":"#6366f1";
  const lb = l=>l==="overdue"?"#7f1d1d22":l==="today"?"#43140722":l==="urgent"?"#78350f22":"#6366f118";
  const li = l=>l==="overdue"?"🚨":l==="today"?"🔥":l==="urgent"?"⚠️":"📅";
  return (
    <div style={{position:"fixed",inset:0,zIndex:4000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",paddingTop:56,paddingRight:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:14,width:360,maxHeight:"80vh",boxShadow:"0 20px 60px rgba(0,0,0,.8)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 16px",borderBottom:"1px solid var(--c-border)"}}>
          <span style={{fontSize:18}}>🔔</span>
          <span style={{fontSize:14,fontWeight:800,color:"var(--c-text)",flex:1}}>Notifications</span>
          {unreadCount>0&&<span style={{fontSize:11,fontWeight:800,color:"#fff",background:"#ef4444",borderRadius:99,padding:"1px 8px"}}>{unreadCount} new</span>}
          {allNotifs.length>0&&<button onClick={markAllRead} style={{fontSize:11,color:"#6366f1",background:"transparent",border:"none",cursor:"pointer",fontWeight:700}}>Mark all read</button>}
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {allNotifs.length===0&&<div style={{padding:"40px 16px",textAlign:"center",color:"var(--c-text-muted)"}}><div style={{fontSize:28,marginBottom:8}}>🎉</div><div style={{fontSize:13}}>No upcoming due dates!</div></div>}
          {allNotifs.map(n=>{
            const isRead=readSet.has(n.id);const c=lc(n.level);
            return (
              <div key={n.id} onClick={()=>!isRead&&markRead(n.id)} style={{display:"flex",gap:12,padding:"12px 16px",borderBottom:"1px solid var(--c-border)",background:isRead?"transparent":lb(n.level),cursor:isRead?"default":"pointer",transition:"background .15s"}}>
                <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{li(n.level)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                    <span style={{fontSize:10,fontWeight:800,padding:"1px 6px",borderRadius:20,background:c+"22",color:c}}>{n.msg}</span>
                    <span style={{fontSize:10,color:"var(--c-text-muted)"}}>{fmtDate(n.due)}</span>
                    {!isRead&&<div style={{width:6,height:6,borderRadius:"50%",background:c,marginLeft:"auto",flexShrink:0}}/>}
                  </div>
                  <div style={{fontSize:12,fontWeight:600,color:isRead?"var(--c-text-muted)":"var(--c-text)",lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.title}</div>
                  <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:2}}>{n.cat} · {n.type==="work"?"💼 Work":"🏠 Personal"}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid var(--c-border)",fontSize:10,color:"var(--c-border)",textAlign:"center"}}>Click to mark read · messages remain · counter decreases</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GANTT TOOLTIP  (with media preview)
// ─────────────────────────────────────────────────────────────────────────────
function GanttTooltip({ t, x, y, isWork }) {
  const cc=isWork?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
  const urg=urgency(t);const pc=PRIORITY_CFG[t.priority||"Medium"];
  const imgs=taskImages(t);
  const mediaAttach=(t.attachments||[]).filter(a=>{const k=detectAttachType(a);return k==="video"||k==="video-link";}).concat(imgs);
  const firstImg=imgs[0]||null;
  const firstVid=!firstImg&&mediaAttach.find(a=>detectAttachType(a)==="video");
  return (
    <div style={{position:"fixed",left:Math.min(x+14,window.innerWidth-300),top:Math.max(y-20,10),zIndex:9000,background:"var(--c-card2)",border:`1px solid ${cc}55`,borderRadius:12,padding:"12px 14px",pointerEvents:"none",boxShadow:"0 12px 40px rgba(0,0,0,.8)",maxWidth:280,minWidth:200}}>
      {firstImg&&<img src={safeImageSrc(firstImg)} alt="" style={{width:"100%",height:120,objectFit:"cover",borderRadius:8,marginBottom:10,display:"block"}} onError={e=>{e.target.style.display="none";}}/>}
      {firstVid&&<div style={{width:"100%",height:80,background:"var(--c-surface)",borderRadius:8,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}><span style={{fontSize:24}}>▶️</span><span style={{fontSize:10,color:"var(--c-text-muted)"}}>{firstVid.name||firstVid.label||"video"}</span></div>}
      {mediaAttach.length>1&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginBottom:8,textAlign:"right"}}>+{mediaAttach.length-1} more media</div>}
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}><Chip color={cc}>{t.cat}</Chip><span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority||"Medium"}</span>{isWork&&<span style={{fontSize:9,background:"#818cf822",color:"#818cf8",borderRadius:3,padding:"1px 4px",fontWeight:700}}>Work</span>}</div>
      <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",lineHeight:1.4,marginBottom:6}}>{t.title}</div>
      {t.description&&<div style={{fontSize:10,color:"var(--c-text-muted)",lineHeight:1.4,marginBottom:6,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{t.description}</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {t.due&&<span style={{fontSize:10,color:urg.color,fontWeight:700,background:urg.color+"18",padding:"2px 7px",borderRadius:20}}>{urg.label} · {fmtDate(t.due)}</span>}
        {isWork&&t.progress!=null&&<span style={{fontSize:10,color:"var(--c-text-muted)"}}>{t.progress}%</span>}
      </div>
      {t.location&&<div style={{fontSize:10,color:"#60a5fa",marginTop:5}}>📍 {t.location}</div>}
      {(t.attachments||[]).length>0&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:5}}>📎 {(t.attachments||[]).length} attachment{(t.attachments||[]).length!==1?"s":""}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GANTT TAB  — category/project sub-tabs + week numbers + media hover
// ─────────────────────────────────────────────────────────────────────────────
function GanttTab({ personal, work, setPersonal, setWork, events=[], setEvents, eventTypes=DEFAULT_EVENT_TYPES, setEventTypes,
                    defaultZoom="2y", defaultWeeks=true, defaultDates=false, defaultBarLines=false,
                    ganttFontSize=11, ganttFontFamily="system",
                    cfgCustomStart="", cfgCustomDur=6, cfgCustomUnit="m", savedViewId="", onPatchConfig }) {
  // N48: 3-line bars toggle
  const [barLines,setBarLines]=useState(defaultBarLines);
  // N50: custom view window (start + duration → end auto-calculated)
  const [cStart,setCStart]=useState(cfgCustomStart);
  const [cDur,setCDur]    =useState(cfgCustomDur);
  const [cUnit,setCUnit]  =useState(cfgCustomUnit);
  // N43: font settings for this page (persisted in config)
  const G_FONTS = { system:"inherit", rounded:"'Trebuchet MS','Segoe UI',sans-serif", serif:"Georgia,'Times New Roman',serif", mono:"'Courier New',monospace", thai:"'Noto Sans Thai','Leelawadee UI',sans-serif" };
  const gFF = G_FONTS[ganttFontFamily] || "inherit";
  const gFS = Math.max(8, Math.min(18, Number(ganttFontSize)||11));
  const [showFontCfg,setShowFontCfg]=useState(false);
  // N45: short dd/mm date labels
  const [showDates,setShowDates]=useState(defaultDates);
  // N44: custom hover tooltip for event bars (shows that window's own description)
  const [hoverEv,setHoverEv]=useState(null);
  // N47: Thai public holiday hover tooltip (bands memo lives after viewStart/viewEnd)
  const [hoverHol,setHoverHol]=useState(null);
  // N55: saved views for the Gantt page
  const [gViews, setGViews] = useSavedViews(GANTT_VIEWS_KEY);
  const [gViewId, setGViewId] = useState(null);
  // N37: event controls inside Gantt (mirrors Calendar)
  const [editingEvent, setEditingEvent] = useState(null);
  const [evTypeFilter, setEvTypeFilter] = useState([]); // [] = all types
  const [showEventsRow, setShowEventsRow] = useState(true);
  const toggleEvType = (id)=>setEvTypeFilter(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
  // N55: snapshot / restore the Gantt page's filters + display options
  const captureGView = () => ({
    zoom, statusFilter, sourceFilter, activeGroup,
    showEventsRow, evTypeFilter:[...evTypeFilter],
    showTasksRows, taskGroupFilter:[...taskGroupFilter],
    showWeeks, showDates, barLines, cStart, cDur, cUnit,
  });
  const applyGView = (v) => {
    const s=v.state||{};
    if(s.zoom) setZoom(s.zoom);
    if(s.statusFilter) setStatusFilter(s.statusFilter);
    if(s.sourceFilter) setSourceFilter(s.sourceFilter);
    if(s.activeGroup)  setActiveGroup(s.activeGroup);
    if("showEventsRow" in s) setShowEventsRow(!!s.showEventsRow);
    setEvTypeFilter(Array.isArray(s.evTypeFilter)?s.evTypeFilter:[]);
    if("showTasksRows" in s) setShowTasksRows(!!s.showTasksRows);
    setTaskGroupFilter(Array.isArray(s.taskGroupFilter)?s.taskGroupFilter:[]);
    if("showWeeks" in s) setShowWeeks(!!s.showWeeks);
    if("showDates" in s) setShowDates(!!s.showDates);
    if("barLines" in s)  setBarLines(!!s.barLines);
    if("cStart" in s) setCStart(s.cStart||"");
    if(s.cDur)  setCDur(s.cDur);
    if(s.cUnit) setCUnit(s.cUnit);
    setGViewId(v.id);
    onPatchConfig&&onPatchConfig({ganttActiveView:v.id}); // N59
  };
  const saveGView = (name) => {
    const v={ id:"gv"+Date.now(), name, state:captureGView() };
    setGViews([...gViews, v]); setGViewId(v.id);
    onPatchConfig&&onPatchConfig({ganttActiveView:v.id});
  };
  const updateGView = (id) => {
    setGViews(gViews.map(v=>v.id===id?{...v,state:captureGView()}:v));
  };
  const deleteGView = (id) => {
    setGViews(gViews.filter(v=>v.id!==id));
    if(gViewId===id){ setGViewId(null); onPatchConfig&&onPatchConfig({ganttActiveView:""}); }
  };
  const gRestored = useRef(false);
  useEffect(()=>{
    if(gRestored.current || !gViews.length || !savedViewId) return;
    const v = gViews.find(x=>x.id===savedViewId);
    if(v){ gRestored.current = true; applyGView(v); }
  },[gViews, savedViewId]);

  const saveEventG = (ev)=>{
    if(!setEvents) return;
    const existed = events.some(e=>e.id===ev.id);
    logAct(existed?"edit":"create", `${existed?"Edited":"Added"} event: ${ev.title}`, "gantt");
    setEvents(existed ? events.map(e=>e.id===ev.id?ev:e) : [...events, ev]);
    setEditingEvent(null);
  };
  const deleteEventG = (id)=>{
    if(!setEvents) return;
    const ev=events.find(e=>e.id===id);
    logAct("delete", `Deleted event: ${ev?.title||id}`, "gantt");
    setEvents(events.filter(e=>e.id!==id)); setEditingEvent(null);
  };
  const [zoom,setZoom]=useState(defaultZoom);
  const [statusFilter,setStatusFilter]=useState("active");
  const [sourceFilter,setSourceFilter]=useState("all");
  // N42: task visibility in the Gantt chart — hide all tasks, or keep only chosen groups
  const [showTasksRows,setShowTasksRows]=useState(true);
  const [taskGroupFilter,setTaskGroupFilter]=useState([]); // [] = every category/project
  const toggleTaskGroup=(g)=>setTaskGroupFilter(a=>a.includes(g)?a.filter(x=>x!==g):[...a,g]);
  const [activeGroup,setActiveGroup]=useState("All");
  const [tooltip,setTooltip]=useState(null);
  const [showWeeks,setShowWeeks]=useState(defaultWeeks); // ON by default
  const [editingTask,setEditingTask]=useState(null);   // task being edited
  const [addingType,setAddingType]=useState(null);     // N1: "personal"|"work" when adding new task from Gantt
  const [dragTaskId,setDragTaskId]=useState(null);     // N-Gantt-Reorder: task id being dragged
  const [dragOverId,setDragOverId]=useState(null);     // N-Gantt-Reorder: drop target hover

  // ── Save handler: routes back to correct list + storage (add OR edit) ─────
  const [recurGantt, setRecurGantt] = useState(null); // N12: recurring task pending confirm in Gantt

  const handleSaveTask = async (updated) => {
    const list = updated._type==="work" ? work : personal;
    const prev = list.find(t=>t.id===updated.id);
    // N12: if editing set status→done on a recurring task, show the recurring popup
    if (prev && prev.status!=="done" && updated.status==="done" && (updated.isRecurring||updated.recur)) {
      setEditingTask(null); setAddingType(null);
      setRecurGantt(updated);
      return;
    }
    if (updated._type==="work") {
      const exists=work.some(t=>t.id===updated.id);
      const next = exists ? applyEditWithRecur(work, updated, "todo") : [...work, updated];
      setWork&&setWork(next);
      try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    } else {
      const exists=personal.some(t=>t.id===updated.id);
      const next = exists ? applyEditWithRecur(personal, updated, "pending") : [...personal, updated];
      setPersonal&&setPersonal(next);
      try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
    setEditingTask(null);
    setAddingType(null);
  };

  // N12: Gantt recurring popup handlers
  const ganttRecurConfirm = async ({nextDue,nextStart,nextTitle}) => {
    const t=recurGantt;
    const isWork=t._type==="work";
    const list=isWork?work:personal;
    const setList=isWork?setWork:setPersonal;
    const KEY=isWork?W_KEY:P_KEY;
    const defaultStatus=isWork?"todo":"pending";
    const doneList=list.map(x=>x.id===t.id?stampMilestone(x,{...x,status:"done"}):x);
    const nextTask={...t,id:newId(),status:defaultStatus,due:nextDue,startDate:nextStart||nextDue,title:nextTitle,pinned:false,milestoneAt:"",createdAt:new Date().toISOString().slice(0,10)};
    const finalList=[...doneList,nextTask];
    setList(finalList); try{await window.storage.set(pkG(KEY),JSON.stringify(finalList));}catch{}
    setRecurGantt(null);
  };
  const ganttRecurDoneOnly = async () => {
    const t=recurGantt;
    const isWork=t._type==="work";
    const list=isWork?work:personal;
    const setList=isWork?setWork:setPersonal;
    const KEY=isWork?W_KEY:P_KEY;
    const doneList=list.map(x=>x.id===t.id?stampMilestone(x,{...x,status:"done"}):x);
    setList(doneList); try{await window.storage.set(pkG(KEY),JSON.stringify(doneList));}catch{}
    setRecurGantt(null);
  };

  const LABEL_W=210;
  const ROW_H = barLines ? Math.max(58, gFS*3 + 26) : 34; // N48: taller rows for 3-line bars
  // M2: adaptive minWidth — narrower on tablet/iPad portrait
  const ganttMinW = typeof window!=="undefined"&&window.innerWidth<1024 ? 560 : 780;
  // N50: "custom" zoom = user-typed start date + a duration; the end date is derived.
  const isCustomZoom = zoom==="custom" && !!cStart;
  const viewStart=useMemo(()=>{
    if (isCustomZoom){ const d=new Date(cStart+"T00:00:00"); return isNaN(d)?new Date(TODAY):d; }
    if (zoom==="1mo"){ const d=new Date(TODAY); d.setDate(d.getDate()-3); d.setHours(0,0,0,0); return d; } // day view: start 3 days before today
    const d=new Date(TODAY);d.setDate(1);return d;
  },[zoom,isCustomZoom,cStart]);
  const viewEnd=useMemo(()=>{
    if (isCustomZoom){
      const n=Math.max(1,Number(cDur)||1); const d=new Date(viewStart);
      if(cUnit==="d") d.setDate(d.getDate()+n);
      else if(cUnit==="w") d.setDate(d.getDate()+n*7);
      else if(cUnit==="y") d.setFullYear(d.getFullYear()+n);
      else d.setMonth(d.getMonth()+n);
      return d;
    }
    if (zoom==="1mo"){ const d=new Date(viewStart); d.setDate(d.getDate()+35); return d; } // ~5 weeks
    const months=zoom==="3m"?3:zoom==="6m"?6:zoom==="1y"?12:zoom==="2y"?24:zoom==="3y"?36:60;
    const d=new Date(viewStart);d.setMonth(d.getMonth()+months);return d;
  },[zoom,viewStart,isCustomZoom,cDur,cUnit]);
  const totalMs=viewEnd.getTime()-viewStart.getTime();
  // N50: day view is decided by the ACTUAL span, so short custom ranges get it too
  const isDayMode = zoom==="1mo" || (isCustomZoom && totalMs <= 45*86400000);

  // N47: Thai public holiday bands — MUST come after viewStart/viewEnd exist.
  // (Declaring this above them caused a temporal-dead-zone crash on the Gantt tab.)
  const holidayBands=useMemo(()=>{
    const MS=86400000;
    const days=Math.round((viewEnd-viewStart)/MS);
    if(days>800) return []; // too zoomed-out: bands would be hairlines packed together
    const out=[];const cur=new Date(viewStart);cur.setHours(0,0,0,0);
    let guard=0;
    while(cur<viewEnd && guard++<2500){
      const iso=fmtLocal(cur); const h=isThaiHoliday(iso);
      if(h) out.push({iso,name:h,t:cur.getTime()});
      cur.setDate(cur.getDate()+1);
    }
    return out;
  },[viewStart,viewEnd]);
  const viewStartMs=viewStart.getTime();
  const monthCols=useMemo(()=>{const cols=[];let cur=new Date(viewStart.getFullYear(),viewStart.getMonth(),1);while(cur<viewEnd){cols.push(new Date(cur));cur.setMonth(cur.getMonth()+1);}return cols;},[viewStart,viewEnd]);

  // N11: daily columns for 1-month day view — with weekend + Thai holiday flags
  const dayCols=useMemo(()=>{
    if(!isDayMode)return[];
    const days=[];let cur=new Date(viewStart);
    while(cur<viewEnd){
      const dow=cur.getDay();
      const iso=fmtLocal(cur);
      const hol=(typeof THAI_HOLIDAYS!=="undefined"&&THAI_HOLIDAYS[iso])||null;
      days.push({date:new Date(cur),dow,isWeekend:dow===0||dow===6,holiday:hol,iso});
      cur.setDate(cur.getDate()+1);
    }
    return days;
  },[isDayMode,viewStart,viewEnd]);

  const isoWk=(d)=>{const tmp=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=tmp.getUTCDay()||7;tmp.setUTCDate(tmp.getUTCDate()+4-day);const yr=new Date(Date.UTC(tmp.getUTCFullYear(),0,1));return Math.ceil(((tmp-yr)/86400000+1)/7);};

  const weekCols=useMemo(()=>{
    if(!showWeeks)return[];
    const weeks=[];let cur=new Date(viewStart);
    const dow=(cur.getDay()+6)%7;cur.setDate(cur.getDate()-dow);
    while(cur<viewEnd){weeks.push({date:new Date(cur),wn:isoWk(cur)});cur.setDate(cur.getDate()+7);}
    return weeks;
  },[showWeeks,viewStart,viewEnd]);

  // N45: short dd/mm labels. Density guard — at wide zooms a label per week
  // would collide, so we thin them out (every Nth week) instead of hiding.
  const dateCols=useMemo(()=>{
    if(!showDates) return [];
    const days=[];const cur=new Date(viewStart);cur.setHours(0,0,0,0);
    let guard=0;
    while(cur<viewEnd && guard++<2500){days.push(new Date(cur));cur.setDate(cur.getDate()+1);}
    // N46: pick the smallest step whose labels still fit. "dd/mm" is ~2.8×fontSize wide.
    const chartPx = Math.max(ganttMinW - LABEL_W, 320);
    const pxPerDay = chartPx / Math.max(1, days.length);
    const labelPx  = gFS * 2.8 + 6;
    const need = Math.ceil(labelPx / Math.max(pxPerDay, 0.01));
    const step = [1,2,3,7,14,28,56,112].find(s=>s>=need) || 168;
    return days.map((d,i)=>({
      date:d,
      show:i%step===0,
      isWeekend:d.getDay()===0||d.getDay()===6,
      hol:isThaiHoliday(fmtLocal(d)),
      isToday:fmtLocal(d)===fmtLocal(TODAY),
    }));
  },[showDates,viewStart,viewEnd,gFS,ganttMinW]);

  const allItems=useMemo(()=>{
    let list=[];
    if(sourceFilter!=="work")     personal.forEach(t=>list.push({...t,_type:"personal",_group:t.cat||"Other"}));
    if(sourceFilter!=="personal") work.forEach(t=>list.push({...t,_type:"work",_group:t.project||"(No Project)"}));
    if(statusFilter==="active")   list=list.filter(t=>t.status!=="done");
    if(statusFilter==="done")     list=list.filter(t=>t.status==="done");
    return list;
  },[personal,work,sourceFilter,statusFilter]);

  const groupLabels=useMemo(()=>{const gs=new Set(allItems.map(t=>t._group));return["All",...[...gs].sort()];},[allItems]);
  const filtered=useMemo(()=>{
    if(!showTasksRows) return [];                                    // N42: tasks hidden entirely
    let l = activeGroup==="All" ? allItems : allItems.filter(t=>t._group===activeGroup);
    if (taskGroupFilter.length) l = l.filter(t=>taskGroupFilter.includes(t._group)); // N42: only chosen types
    return l;
  },[allItems,activeGroup,showTasksRows,taskGroupFilter]);

  const rows=useMemo(()=>{
    const g={};
    filtered.forEach(t=>{const k=t._group||"Other";if(!g[k])g[k]=[];g[k].push(t);});
    const r=[];
    // N24: Events group first (timespan bars, no status)
    if (events && events.length && (statusFilter!=="done")) {
      const evInRange = events.filter(e=>{
        // N37: event type filter (chips + active view)
        if (evTypeFilter.length && !evTypeFilter.includes(e.typeId)) return false;
        if (!showEventsRow) return false;
        return eventWindows(e).some(w=>{
          const s=parseDateLocal(w.start), en=parseDateLocal(w.end||w.start);
          return en>=viewStart && s<viewEnd;
        });
      });
      if (evInRange.length) {
        r.push({type:"header",grp:"📅 Events",count:evInRange.length,isEvent:true});
        evInRange.sort((a,b)=>new Date(a.start)-new Date(b.start)).forEach(e=>r.push({type:"event",event:e}));
      }
    }
    Object.entries(g).forEach(([grp,items])=>{
      r.push({type:"header",grp,count:items.length});
      // N-Gantt-Reorder: if any task in group has manual sortOrder, use it; else sort by due date
      const hasManualOrder = items.some(t=>t.sortOrder!=null);
      const sorted = hasManualOrder
        ? [...items].sort((a,b)=>(a.sortOrder??9999)-(b.sortOrder??9999))
        : [...items].sort((a,b)=>a.due&&b.due?new Date(a.due)-new Date(b.due):a.due?-1:1);
      sorted.forEach(t=>r.push({type:"task",task:t}));
    });
    return r;
  },[filtered,events,statusFilter,viewStart,viewEnd,evTypeFilter,showEventsRow]);

  // ── N-Gantt-Reorder: persist new order within the same group ──────────────
  const handleReorder = async (draggedId, draggedType, targetId, targetType, groupKey) => {
    if (draggedId===targetId) return;
    // Get current group's tasks in display order
    const groupTasks = rows.filter(r=>r.type==="task" && r.task._group===groupKey).map(r=>r.task);
    const fromIdx = groupTasks.findIndex(t=>t.id===draggedId && t._type===draggedType);
    const toIdx   = groupTasks.findIndex(t=>t.id===targetId  && t._type===targetType);
    if (fromIdx===-1||toIdx===-1) return;
    const reordered = [...groupTasks];
    const [moved] = reordered.splice(fromIdx,1);
    reordered.splice(toIdx,0,moved);
    // Assign sequential sortOrder to this group's tasks
    const updates = reordered.map((t,idx)=>({...t, sortOrder:idx}));

    // Split back into personal/work updates
    const personalUpdates = updates.filter(t=>t._type==="personal");
    const workUpdates     = updates.filter(t=>t._type==="work");

    if (personalUpdates.length) {
      const next = personal.map(p=>{
        const u = personalUpdates.find(x=>x.id===p.id);
        return u ? {...p, sortOrder:u.sortOrder} : p;
      });
      setPersonal&&setPersonal(next);
      try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
    if (workUpdates.length) {
      const next = work.map(w=>{
        const u = workUpdates.find(x=>x.id===w.id);
        return u ? {...w, sortOrder:u.sortOrder} : w;
      });
      setWork&&setWork(next);
      try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    }
  };

  const todayPct=((TODAY.getTime()-viewStartMs)/totalMs)*100;
  const headerGroupLabel=sourceFilter==="work"?"PROJECT":sourceFilter==="personal"?"CATEGORY":"CATEGORY / PROJECT";

  return (
    <div style={{position:"relative"}}>
      {/* Edit modal — appears when a task row is clicked */}
      {editingTask&&(
        <TaskDetailModal
          task={editingTask}
          onSave={handleSaveTask}
          onClose={()=>setEditingTask(null)}
          onDuplicate={t=>{
            const copy = duplicateTask(t);
            if (copy._type==="work") { const next=[...work,copy]; setWork&&setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{}); }
            else { const next=[...personal,copy]; setPersonal&&setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{}); }
          }}
        />
      )}
      {tooltip&&<GanttTooltip t={tooltip.task} x={tooltip.x} y={tooltip.y} isWork={tooltip.task._type==="work"}/>}
      {recurGantt && <RecurringDoneModal task={recurGantt} onConfirmAndSave={ganttRecurConfirm} onMarkDoneOnly={ganttRecurDoneOnly} onCancel={()=>setRecurGantt(null)}/>}

      {/* Controls */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
        <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
          {[["1mo","1 Mo"],["3m","3 Mo"],["6m","6 Mo"],["1y","1 Yr"],["2y","2 Yr"],["3y","3 Yr"],["5y","5 Yr"],["custom","🗓 Custom"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setZoom(v); if(v==="custom"&&!cStart){const s=fmtLocal(TODAY);setCStart(s);onPatchConfig&&onPatchConfig({ganttZoom:v,ganttCustomStart:s});} else onPatchConfig&&onPatchConfig({ganttZoom:v});}} style={{padding:"5px 10px",borderRadius:6,border:"none",background:zoom===v?"#6366f1":"transparent",color:zoom===v?"#fff":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
          {[["active","Active"],["all","All"],["done","Done"]].map(([v,l])=>(
            <button key={v} onClick={()=>setStatusFilter(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:statusFilter===v?"var(--c-border)":"transparent",color:statusFilter===v?"var(--c-text)":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
          {[["all","All"],["personal","🏠 Personal"],["work","💼 Work"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setSourceFilter(v);setActiveGroup("All");}} style={{padding:"5px 12px",borderRadius:6,border:"none",background:sourceFilter===v?"var(--c-border)":"transparent",color:sourceFilter===v?"var(--c-text)":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <button onClick={()=>setShowWeeks(v=>!v)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showWeeks?"#6366f1":"var(--c-border)"}`,background:showWeeks?"#6366f122":"transparent",color:showWeeks?"#a5b4fc":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>W# Weeks</button>
        {/* N45: short dd/mm date labels */}
        <button onClick={()=>{const v=!showDates;setShowDates(v);onPatchConfig&&onPatchConfig({ganttDates:v});}}
          title="Show short dd/mm dates — spacing adapts automatically at wide zooms"
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showDates?"#0ea5e9":"var(--c-border)"}`,background:showDates?"#0ea5e922":"transparent",color:showDates?"#0284c7":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>📅 Dates</button>
        {/* N48: 1-line vs 3-line bars */}
        <button onClick={()=>{const v=!barLines;setBarLines(v);onPatchConfig&&onPatchConfig({ganttBarLines:v});}}
          title="Show dates + description inside each bar"
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${barLines?"#22c55e":"var(--c-border)"}`,background:barLines?"#22c55e22":"transparent",color:barLines?"#16a34a":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>≡ Details</button>
        {/* N43: font settings for the Gantt page */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowFontCfg(s=>!s)} title="Adjust Gantt font size and family"
            style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showFontCfg?"var(--c-accent)":"var(--c-border)"}`,background:showFontCfg?"var(--c-accent)22":"transparent",color:showFontCfg?"var(--c-accent)":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>🔤 Font</button>
          {showFontCfg && (
            <div style={{position:"absolute",top:"115%",left:0,zIndex:600,background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:12,padding:14,width:260,boxShadow:"0 16px 40px rgba(0,0,0,.3)"}}>
              <div style={{fontSize:12,fontWeight:800,color:"var(--c-text)",marginBottom:10}}>🔤 Gantt Font</div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Size: {gFS}px</div>
              <input type="range" min={8} max={18} value={gFS}
                onChange={e=>onPatchConfig&&onPatchConfig({ganttFontSize:Number(e.target.value)})}
                style={{width:"100%",marginBottom:6,accentColor:"var(--c-accent)"}}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {[9,11,13,15,17].map(s=>(
                  <button key={s} onClick={()=>onPatchConfig&&onPatchConfig({ganttFontSize:s})}
                    style={{padding:"3px 9px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                      border:gFS===s?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:gFS===s?"var(--c-accent)18":"var(--c-surface)",color:gFS===s?"var(--c-accent)":"var(--c-text-muted)"}}>{s}</button>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Font family</div>
              <div style={{display:"grid",gap:4}}>
                {[["system","Default (System)"],["rounded","Rounded"],["serif","Serif"],["mono","Monospace"],["thai","Thai (Noto Sans Thai)"]].map(([v,l])=>(
                  <button key={v} onClick={()=>onPatchConfig&&onPatchConfig({ganttFontFamily:v})}
                    style={{padding:"7px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:G_FONTS[v],
                      border:ganttFontFamily===v?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:ganttFontFamily===v?"var(--c-accent)18":"var(--c-surface)",
                      color:ganttFontFamily===v?"var(--c-accent)":"var(--c-text)"}}>{l}</button>
                ))}
              </div>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:8,lineHeight:1.4}}>💾 Saved automatically for the Gantt page</div>
            </div>
          )}
        </div>
        {/* N1: Add Task button in Gantt */}
        <button onClick={()=>setAddingType("choose")} style={{marginLeft:"auto",padding:"6px 14px",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add Task</button>
      </div>

      {/* N1: Add Task type chooser for Gantt */}
      {addingType==="choose"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:4500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={e=>e.target===e.currentTarget&&setAddingType(null)}>
          <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,maxWidth:300,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>+ Add Task to Timeline</div>
            <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:16}}>Choose a task type</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={()=>setEditingTask({_type:"personal"})}
                style={{padding:"13px 0",borderRadius:10,border:"1.5px solid #34d39955",background:"#34d39915",color:"#065f46",fontWeight:800,fontSize:13,cursor:"pointer"}}>🏠 Personal Task</button>
              <button onClick={()=>setEditingTask({_type:"work"})}
                style={{padding:"13px 0",borderRadius:10,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4338ca",fontWeight:800,fontSize:13,cursor:"pointer"}}>💼 Work Task</button>
              <button onClick={()=>setAddingType(null)}
                style={{padding:"10px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* N55: saved views for the Gantt page */}
      <SavedViewBar views={gViews} activeId={gViewId} label="VIEW"
        onApply={applyGView} onSave={saveGView} onUpdate={updateGView} onDelete={deleteGView}
        isDirty={(()=>{ const a=gViews.find(v=>v.id===gViewId); return a ? JSON.stringify(captureGView())!==JSON.stringify(a.state) : false; })()}
        onDiscard={applyGView}/>

      {/* N37: EVENT controls — type filter chips, show/hide event rows, add event */}
      {setEvents && (
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:12,
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginRight:2}}>📅 EVENTS</span>
          <button onClick={()=>setShowEventsRow(s=>!s)}
            style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
              border:showEventsRow?"1.5px solid #8b5cf6":"1px solid var(--c-border)",
              background:showEventsRow?"#8b5cf622":"var(--c-surface)",color:showEventsRow?"#7c3aed":"var(--c-text-muted)"}}>
            {showEventsRow?"✓ Shown in chart":"Hidden from chart"}
          </button>
          <div style={{width:1,height:18,background:"var(--c-border)",margin:"0 4px"}}/>
          <button onClick={()=>setEvTypeFilter([])}
            style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
              border:evTypeFilter.length===0?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
              background:evTypeFilter.length===0?"var(--c-accent)22":"var(--c-surface)",
              color:evTypeFilter.length===0?"var(--c-accent)":"var(--c-text-muted)"}}>All types</button>
          {eventTypes.map(t=>{const on=evTypeFilter.includes(t.id);return(
            <button key={t.id} onClick={()=>toggleEvType(t.id)}
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:16,cursor:"pointer",
                border:on?`1.5px solid ${t.color}`:"1px solid var(--c-border)",
                background:on?t.color+"22":"var(--c-surface)",fontSize:11,fontWeight:700,
                color:on?t.color:"var(--c-text-muted)"}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:t.color}}/>{t.name}</button>
          )})}
          <div style={{flex:1}}/>
          <button onClick={()=>setEditingEvent({id:newId(),title:"",start:fmtLocal(TODAY),end:fmtLocal(TODAY),typeId:(eventTypes[0]?.id)||"personal",color:(eventTypes[0]?.color)||"#8b5cf6",note:""})}
            style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#8b5cf6",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
            + Add Event
          </button>
        </div>
      )}
      {editingEvent&&<EventModal event={editingEvent} onSave={saveEventG} onDelete={deleteEventG} onClose={()=>setEditingEvent(null)} eventTypes={eventTypes} setEventTypes={setEventTypes}/>}

      {/* N47: Thai holiday tooltip */}
      {hoverHol && (
        <div style={{position:"fixed",left:Math.min(hoverHol.x+14,(typeof window!=="undefined"?window.innerWidth:1200)-260),
          top:hoverHol.y+16,zIndex:9500,pointerEvents:"none",maxWidth:240,
          background:"var(--c-card2)",border:"1.5px solid #a855f7",borderRadius:10,padding:"8px 12px",
          boxShadow:"0 10px 30px rgba(0,0,0,.35)"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#a855f7",marginBottom:2}}>🎌 {hoverHol.name}</div>
          <div style={{fontSize:10.5,color:"var(--c-text-muted)",fontWeight:700}}>{hoverHol.iso}</div>
        </div>
      )}

      {/* N44: hover tooltip for an event bar — shows THAT window's own description */}
      {hoverEv && (
        <div style={{position:"fixed",left:Math.min(hoverEv.x+14, (typeof window!=="undefined"?window.innerWidth:1200)-300),
          top:hoverEv.y+16,zIndex:9500,pointerEvents:"none",maxWidth:290,
          background:"var(--c-card2)",border:`1.5px solid ${hoverEv.ev.color||"#8b5cf6"}`,borderRadius:10,
          padding:"9px 12px",boxShadow:"0 10px 30px rgba(0,0,0,.35)"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:hoverEv.ev.color||"#8b5cf6",flexShrink:0}}/>
            <span style={{fontSize:12.5,fontWeight:800,color:"var(--c-text)"}}>{hoverEv.ev.title}</span>
            {hoverEv.total>1&&<span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",background:"var(--c-surface2)",borderRadius:4,padding:"0 5px"}}>Window {hoverEv.idx}/{hoverEv.total}</span>}
          </div>
          <div style={{fontSize:10.5,color:"var(--c-text-muted)",fontWeight:700,marginBottom:hoverEv.w.desc?5:0}}>
            📅 {hoverEv.w.start}{hoverEv.w.end&&hoverEv.w.end!==hoverEv.w.start?` → ${hoverEv.w.end}`:""}
          </div>
          {hoverEv.w.desc
            ? <div style={{fontSize:11.5,color:"var(--c-text)",lineHeight:1.55,whiteSpace:"pre-wrap"}}>{hoverEv.w.desc}</div>
            : (hoverEv.ev.note
                ? <div style={{fontSize:11.5,color:"var(--c-text-muted)",lineHeight:1.55,fontStyle:"italic"}}>{hoverEv.ev.note}</div>
                : <div style={{fontSize:10.5,color:"var(--c-text-muted)",fontStyle:"italic"}}>No description for this window yet — click to add one</div>)}
        </div>
      )}

      {/* N50: custom view window — type a start date, pick a duration, end is derived */}
      {zoom==="custom" && (
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12,
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>🗓 VIEW WINDOW</span>
          <span style={{fontSize:11,fontWeight:700,color:"var(--c-text-muted)"}}>Start</span>
          <div style={{width:170}}>
            <DateInput value={cStart} onChange={v=>{setCStart(v);onPatchConfig&&onPatchConfig({ganttCustomStart:v});}}
              style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,width:"100%",boxSizing:"border-box"}}/>
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"var(--c-text-muted)"}}>Duration</span>
          <input type="number" min={1} max={999} value={cDur}
            onChange={e=>{let v=parseInt(e.target.value,10);if(isNaN(v)||v<1)v=1;if(v>999)v=999;setCDur(v);onPatchConfig&&onPatchConfig({ganttCustomDur:v});}}
            style={{width:70,padding:"6px 8px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,fontWeight:700,textAlign:"center"}}/>
          <div style={{display:"flex",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:8,padding:2,gap:1}}>
            {[["d","Days"],["w","Weeks"],["m","Months"],["y","Years"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setCUnit(v);onPatchConfig&&onPatchConfig({ganttCustomUnit:v});}}
                style={{padding:"4px 9px",borderRadius:6,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",
                  background:cUnit===v?"#6366f1":"transparent",color:cUnit===v?"#fff":"var(--c-text-muted)"}}>{l}</button>
            ))}
          </div>
          <span style={{fontSize:11,fontWeight:700,color:"var(--c-text-muted)"}}>→ End</span>
          <span title="Calculated automatically from start + duration"
            style={{fontSize:12,fontWeight:800,color:"#166534",background:"#16653418",border:"1px solid #16653444",
              borderRadius:8,padding:"6px 12px",whiteSpace:"nowrap"}}>
            {fmtLocal(new Date(viewEnd.getTime()-86400000))} <span style={{fontWeight:600,opacity:0.7}}>(auto)</span>
          </span>
          {isDayMode&&<span style={{fontSize:10,color:"#0284c7",fontWeight:700}}>· day view</span>}
        </div>
      )}

      {/* N42: TASK controls — hide all tasks, or show only chosen categories/projects */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:12,
        background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
        <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginRight:2}}>📋 TASKS</span>
        <button onClick={()=>setShowTasksRows(s=>!s)}
          style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
            border:showTasksRows?"1.5px solid #6366f1":"1px solid var(--c-border)",
            background:showTasksRows?"#6366f122":"var(--c-surface)",color:showTasksRows?"#6366f1":"var(--c-text-muted)"}}>
          {showTasksRows?"✓ Shown in chart":"Hide all tasks"}
        </button>
        {showTasksRows && (<>
          <div style={{width:1,height:18,background:"var(--c-border)",margin:"0 4px"}}/>
          <button onClick={()=>setTaskGroupFilter([])}
            style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
              border:taskGroupFilter.length===0?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
              background:taskGroupFilter.length===0?"var(--c-accent)22":"var(--c-surface)",
              color:taskGroupFilter.length===0?"var(--c-accent)":"var(--c-text-muted)"}}>All categories</button>
          {groupLabels.filter(g=>g!=="All").map(g=>{
            const on=taskGroupFilter.includes(g);
            const col=groupColor(g);
            const cnt=allItems.filter(t=>t._group===g).length;
            return (
              <button key={g} onClick={()=>toggleTaskGroup(g)}
                style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:16,cursor:"pointer",
                  border:on?`1.5px solid ${col}`:"1px solid var(--c-border)",
                  background:on?col+"22":"var(--c-surface)",fontSize:11,fontWeight:700,
                  color:on?col:"var(--c-text-muted)",whiteSpace:"nowrap"}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:col}}/>{g}
                <span style={{opacity:0.6,fontSize:10}}>{cnt}</span>
              </button>
            );
          })}
          {taskGroupFilter.length>0 && (
            <button onClick={()=>setTaskGroupFilter([])}
              style={{padding:"4px 10px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
                border:"1px solid #ef444455",background:"#ef444418",color:"#ef4444"}}>✕ Clear ({taskGroupFilter.length})</button>
          )}
        </>)}
      </div>

      {/* Category / Project sub-tabs */}
      <div style={{display:"flex",alignItems:"center",gap:0,borderBottom:"1px solid var(--c-border)",marginBottom:14,overflowX:"auto"}}>
        <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",paddingRight:10,flexShrink:0,whiteSpace:"nowrap"}}>{headerGroupLabel}</span>
        {groupLabels.map(g=>{
          const isAct=activeGroup===g;
          const cnt=g==="All"?filtered.length:allItems.filter(t=>t._group===g).length;
          const cc=CAT_COLOR[g]||WORK_CAT_COLOR[g]||"#6366f1";
          return (
            <button key={g} onClick={()=>setActiveGroup(g)} style={{padding:"7px 13px",background:"none",border:"none",borderBottom:`2px solid ${isAct?(g==="All"?"#6366f1":cc):"transparent"}`,color:isAct?(g==="All"?"#a5b4fc":cc):"var(--c-text-muted)",fontWeight:isAct?800:600,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
              {g==="All"?"🗂 All":g}
              <span style={{background:isAct?(g==="All"?"#6366f1":cc):"var(--c-border)",color:isAct?"#fff":"var(--c-text-muted)",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 5px"}}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Gantt table */}
      <div style={{overflowX:"auto",border:"1px solid var(--c-border)",borderRadius:12}}>
        <div style={{minWidth:ganttMinW,position:"relative"}}>
          {/* Month header */}
          <div style={{display:"flex",position:"sticky",top:0,zIndex:10,background:"var(--c-surface2)",borderBottom:"1px solid var(--c-border)"}}>
            <div style={{width:LABEL_W,flexShrink:0,padding:"7px 8px",fontSize:gFS,fontFamily:gFF,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",borderRight:"1px solid var(--c-border)"}}>TASK</div>
            <div style={{flex:1,display:"flex"}}>
              {monthCols.map((m,i)=>{
                const isCur=m.getFullYear()===THIS_YEAR&&m.getMonth()===THIS_MONTH;
                return <div key={i} style={{flex:1,padding:"7px 3px",fontSize:gFS+1,fontFamily:gFF,fontWeight:isCur?900:700,color:isCur?"#818cf8":"var(--c-text-muted)",letterSpacing:"0.05em",borderRight:"1px solid var(--c-border)",textAlign:"center",background:isCur?"#6366f108":"transparent"}}>{fmtMonthLabel(m.getFullYear(),m.getMonth())}</div>;
              })}
            </div>
          </div>

          {/* Week number sub-header */}
          {showWeeks&&(
            <div style={{display:"flex",borderBottom:"1px solid var(--c-border)",background:"var(--c-bg)"}}>
              <div style={{width:LABEL_W,flexShrink:0,padding:"3px 8px",fontSize:Math.max(8,gFS-2),fontFamily:gFF,fontWeight:700,color:"var(--c-text-muted)",borderRight:"1px solid var(--c-border)"}}>W#</div>
              <div style={{flex:1,position:"relative",height:Math.max(18,gFS+7)}}>
                {weekCols.map((wk,wi)=>{
                  const lp=((wk.date.getTime()-viewStartMs)/totalMs)*100;
                  const wp=(7*MS_DAY/totalMs)*100;
                  if(lp>100||lp+wp<0)return null;
                  const isCurWk=wk.wn===isoWk(TODAY);
                  return <div key={wi} style={{position:"absolute",left:`${Math.max(0,lp)}%`,width:`${wp}%`,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid var(--c-border)",background:isCurWk?"#6366f118":"transparent"}}><span style={{fontSize:Math.max(8,gFS-2),fontFamily:gFF,fontWeight:isCurWk?800:600,color:isCurWk?"#6366f1":"var(--c-text-muted)",whiteSpace:"nowrap"}}>W{wk.wn}</span></div>;
                })}
              </div>
            </div>
          )}

          {/* N45: short dd/mm date row */}
          {showDates&&!isDayMode&&(
            <div style={{display:"flex",borderBottom:"1px solid var(--c-border)",background:"var(--c-bg)"}}>
              <div style={{width:LABEL_W,flexShrink:0,padding:"3px 8px",fontSize:Math.max(8,gFS-2),fontFamily:gFF,fontWeight:700,color:"var(--c-text-muted)",borderRight:"1px solid var(--c-border)"}}>DATE</div>
              <div style={{flex:1,position:"relative",height:Math.max(17,gFS+7)}}>
                {dateCols.map((c,ci)=>{
                  if(!c.show) return null;
                  const lp=((c.date.getTime()-viewStartMs)/totalMs)*100;
                  if(lp>100||lp<0) return null;
                  const dd=String(c.date.getDate()).padStart(2,"0");
                  const mm=String(c.date.getMonth()+1).padStart(2,"0");
                  const col = c.hol ? "#a855f7" : c.isToday ? "#6366f1" : c.isWeekend ? "#f472b6" : "var(--c-text-muted)";
                  return (
                    <span key={ci}
                      onMouseEnter={c.hol?e=>setHoverHol({name:c.hol,iso:fmtLocal(c.date),x:e.clientX,y:e.clientY}):undefined}
                      onMouseLeave={c.hol?()=>setHoverHol(null):undefined}
                      style={{position:"absolute",left:`${lp}%`,top:2,transform:"translateX(-50%)",
                        fontSize:Math.max(8,gFS-2),fontWeight:c.hol||c.isToday?800:600,color:col,
                        whiteSpace:"nowrap",fontFamily:gFF,cursor:c.hol?"help":"default"}}>
                      {c.hol?"🎌 ":""}{dd}/{mm}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* N11: Daily header (1-month day view) — with weekend + Thai holiday highlight */}
          {isDayMode&&(
            <div style={{display:"flex",borderBottom:"1px solid var(--c-border)",background:"var(--c-bg)"}}>
              <div style={{width:LABEL_W,flexShrink:0,padding:"3px 8px",fontSize:8,fontWeight:700,color:"var(--c-text-muted)",borderRight:"1px solid var(--c-border)"}}>DAY</div>
              <div style={{flex:1,display:"flex"}}>
                {dayCols.map((dc,di)=>{
                  const isToday=dc.iso===fmtLocal(TODAY);
                  const bg = isToday?"var(--c-accent)22":dc.holiday?"#a855f718":dc.isWeekend?"#f472b612":"transparent";
                  const col = isToday?"var(--c-accent)":dc.holiday?"#a855f7":dc.isWeekend?"#f472b6":"var(--c-text-muted)";
                  return (
                    <div key={di} title={dc.holiday||undefined}
                      style={{flex:1,padding:"3px 1px",textAlign:"center",borderRight:"1px solid var(--c-border)",
                        background:bg,minWidth:20,cursor:dc.holiday?"help":"default"}}>
                      <div style={{fontSize:7,fontWeight:600,color:col,lineHeight:1.1}}>{["Su","Mo","Tu","We","Th","Fr","Sa"][dc.dow]}</div>
                      <div style={{fontSize:9,fontWeight:isToday?900:700,color:col,lineHeight:1.2}}>{dc.date.getDate()}</div>
                      {dc.holiday&&<div style={{fontSize:6,color:"#a855f7",lineHeight:1}}>●</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rows */}
          <div style={{position:"relative"}}>
            {/* N11: weekend/holiday column shading behind bars (day view) */}
            {isDayMode&&dayCols.map((dc,di)=>{
              if(!dc.isWeekend&&!dc.holiday)return null;
              const lp=((dc.date.getTime()-viewStartMs)/totalMs)*100;
              const wp=(MS_DAY/totalMs)*100;
              return <div key={`shade-${di}`} style={{position:"absolute",left:`calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${lp/100})`,width:`calc((100% - ${LABEL_W}px) * ${wp/100})`,top:0,bottom:0,background:dc.holiday?"#a855f70a":"#f472b608",zIndex:0,pointerEvents:"none"}}/>;
            })}
            {todayPct>=0&&todayPct<=100&&(
              <div style={{position:"absolute",left:`calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${todayPct/100})`,top:0,bottom:0,width:1.5,background:"#6366f1",zIndex:5,pointerEvents:"none"}}>
                <div style={{position:"sticky",top:0,background:"#6366f1",color:"#fff",fontSize:8,fontWeight:800,padding:"1px 4px",borderRadius:3,whiteSpace:"nowrap",transform:"translateX(-50%)",letterSpacing:"0.06em"}}>TODAY</div>
              </div>
            )}
            {rows.length===0&&<div style={{padding:"40px 0",textAlign:"center",color:"var(--c-text-muted)",fontSize:13}}>No tasks match filters.</div>}
            {rows.length===0 && (
              <div style={{padding:"40px 20px",textAlign:"center",color:"var(--c-text-muted)",fontSize:12.5,lineHeight:1.7}}>
                Nothing to show in the chart<br/>
                <span style={{fontSize:11}}>Turn on "📋 TASKS → Shown in chart" or "📅 EVENTS → Shown in chart", or clear the category filters</span>
              </div>
            )}
            {rows.map((row,i)=>{
              if(row.type==="header"){
                const cc=CAT_COLOR[row.grp]||WORK_CAT_COLOR[row.grp]||"var(--c-text-muted)";
                return <div key={`h-${row.grp}-${i}`} style={{display:"flex",height:26,alignItems:"center",background:"var(--c-card2)",borderBottom:"1px solid var(--c-border)"}}>
                  <div style={{width:LABEL_W,flexShrink:0,paddingLeft:8,paddingRight:12,display:"flex",alignItems:"center",gap:6,borderRight:"1px solid var(--c-border)"}}>
                    <div style={{width:7,height:7,borderRadius:2,background:cc,flexShrink:0}}/>
                    <span style={{fontSize:9,fontWeight:800,color:cc,letterSpacing:"0.08em",textTransform:"uppercase"}}>{row.grp}</span>
                    <span style={{fontSize:8,color:"var(--c-text-muted)",marginLeft:"auto"}}>({row.count})</span>
                  </div>
                  <div style={{flex:1}}/>
                </div>;
              }
              // N24: Event row — timespan bar, no status/diamond
              if(row.type==="event"){
                const ev=row.event;
                const evColor=ev.color||"#8b5cf6";
                // N37: one row, ONE bar per time window (same event id)
                const bars = eventWindows(ev).map(w=>{
                  const sMs=parseDateLocal(w.start).getTime();
                  const eMs=parseDateLocal(w.end||w.start).getTime();
                  const bS=Math.max(viewStartMs,sMs);const bE=Math.min(viewEnd.getTime(),eMs+MS_DAY);
                  if(!(bE>=viewStartMs&&bS<=viewEnd.getTime())) return null;
                  return { left:((bS-viewStartMs)/totalMs)*100, width:Math.max(((bE-bS)/totalMs)*100,0.5), w };
                }).filter(Boolean);
                return (
                  <div key={`ev-${ev.id}`} style={{display:"flex",height:ROW_H,alignItems:"center",borderBottom:"1px solid var(--c-border)",background:i%2===0?"transparent":"var(--c-row-odd)"}}>
                    <div onClick={()=>setEvents&&setEditingEvent(ev)} title="Click to edit this event"
                      style={{width:LABEL_W,flexShrink:0,paddingLeft:14,paddingRight:12,display:"flex",alignItems:"center",gap:6,borderRight:"1px solid var(--c-border)",overflow:"hidden",cursor:setEvents?"pointer":"default"}}>
                      <span style={{fontSize:10}}>📅</span>
                      <span style={{fontSize:gFS,fontFamily:gFF,color:"var(--c-text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.title}</span>
                      {bars.length>1&&<span style={{fontSize:8,fontWeight:800,color:evColor,background:evColor+"22",borderRadius:4,padding:"0 4px",flexShrink:0}}>×{bars.length}</span>}
                      {setEvents&&<span style={{fontSize:9,opacity:0.5,marginLeft:"auto",flexShrink:0}}>✏️</span>}
                    </div>
                    <div style={{flex:1,position:"relative",height:"100%"}}>
                      {bars.map((b,bi)=>(
                        <div key={bi}
                          onClick={()=>setEvents&&setEditingEvent(ev)}
                          onMouseEnter={e=>setHoverEv({ev,w:b.w,idx:bi+1,total:bars.length,x:e.clientX,y:e.clientY})}
                          onMouseMove={e=>setHoverEv(h=>h?{...h,x:e.clientX,y:e.clientY}:h)}
                          onMouseLeave={()=>setHoverEv(null)}
                          style={{position:"absolute",left:`${b.left}%`,width:`${b.width}%`,top:"50%",transform:"translateY(-50%)",
                            height:barLines?ROW_H-10:Math.max(14,gFS+5),background:evColor,borderRadius:barLines?9:7,opacity:0.9,minWidth:6,
                            cursor:setEvents?"pointer":"default",boxSizing:"border-box",
                            display:"flex",flexDirection:"column",justifyContent:"center",gap:1,padding:barLines?"4px 8px":"0 0 0 6px",overflow:"hidden"}}>
                          <span style={{fontSize:gFS,fontFamily:gFF,color:"#fff",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>{ev.title}</span>
                          {barLines && (<>
                            <span style={{fontSize:Math.max(8,gFS-2),fontFamily:gFF,color:"#ffffffdd",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>
                              {b.w.start}{b.w.end&&b.w.end!==b.w.start?` → ${b.w.end}`:""}
                            </span>
                            <span style={{fontSize:Math.max(8,gFS-2),fontFamily:gFF,color:"#ffffffbb",fontStyle:b.w.desc?"normal":"italic",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>
                              {b.w.desc || ev.note || "—"}
                            </span>
                          </>)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              const t=row.task;const isWork=t._type==="work";
              const cc=isWork?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
              const isDone=t.status==="done";const isOverdue=t.status==="overdue";
              const barColor=isDone?"#22c55e":isOverdue?"#ef4444":cc;
              const isEven=i%2===0;
              const hasMedia=(t.attachments||[]).some(a=>{const k=detectAttachType(a);return k==="image"||k==="video"||k==="video-link";});
              const dueMs=t.due?parseDateLocal(t.due).getTime():null;
              let barLeftPct=null,barWidthPct=null;
              if(dueMs){
                const hasStart=t.startDate; // N-PersonalDates: both personal + work use startDate
                const barStartRaw=hasStart?parseDateLocal(t.startDate).getTime():dueMs; // B4 fix: no startDate → point bar at due date
                const bS=Math.max(viewStartMs,barStartRaw);const bE=Math.min(viewEnd.getTime(),dueMs);
                if(bE>=viewStartMs&&bS<=viewEnd.getTime()){barLeftPct=((bS-viewStartMs)/totalMs)*100;barWidthPct=hasStart?Math.max(((bE-bS)/totalMs)*100,0.3):0.5;/* B4: point-width when no startDate */}
              }
              const duePct=dueMs?((dueMs-viewStartMs)/totalMs)*100:null;
              const showDiamond=duePct!==null&&duePct>=0&&duePct<=100;
              const daysLeft=dueMs?Math.ceil((dueMs-TODAY.getTime())/MS_DAY):null;
              const isRecurringTask = !!(t.recur||t.isRecurring); // N-Gantt-Reorder: lock indicator for Phase 2
              const isDraggingThis = dragTaskId===`${t._type}-${t.id}`;
              const isDragOverThis = dragOverId===`${t._type}-${t.id}`;
              return (
                <div key={`${t._type}-${t.id}`}
                  draggable
                  onDragStart={e=>{e.stopPropagation();setDragTaskId(`${t._type}-${t.id}`);e.dataTransfer.effectAllowed="move";}}
                  onDragEnd={()=>{setDragTaskId(null);setDragOverId(null);}}
                  onDragOver={e=>{e.preventDefault();if(dragTaskId&&dragTaskId!==`${t._type}-${t.id}`)setDragOverId(`${t._type}-${t.id}`);}}
                  onDragLeave={()=>setDragOverId(null)}
                  onDrop={e=>{
                    e.preventDefault();
                    if(dragTaskId&&dragTaskId!==`${t._type}-${t.id}`){
                      const [dType,...dIdParts]=dragTaskId.split("-");
                      const dId=Number(dIdParts.join("-"));
                      handleReorder(dId,dType,t.id,t._type,t._group);
                    }
                    setDragTaskId(null);setDragOverId(null);
                  }}
                  style={{display:"flex",height:ROW_H,alignItems:"center",
                    background:isDragOverThis?"#6366f122":isEven?"var(--c-surface)":"var(--c-row-odd)",
                    borderBottom:"1px solid var(--c-border)",cursor:"pointer",transition:"background .12s",
                    opacity:isDraggingThis?0.4:1,
                    borderTop:isDragOverThis?"2px solid #6366f1":"none"}}
                  onClick={()=>setEditingTask(t)}
                  onMouseMove={e=>{setTooltip({task:t,x:e.clientX,y:e.clientY});if(!isDragOverThis)e.currentTarget.style.background="var(--c-hover)";}}
                  onMouseLeave={e=>{setTooltip(null);if(!isDragOverThis)e.currentTarget.style.background=isEven?"var(--c-surface)":"var(--c-row-odd)";}}>
                  {/* Drag handle — N-Gantt-Reorder */}
                  <div onClick={e=>e.stopPropagation()}
                    onMouseDown={e=>e.stopPropagation()}
                    title="Drag to reorder"
                    style={{width:16,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                      cursor:"grab",color:"var(--c-text-muted)",fontSize:11,height:"100%"}}>
                    ⠿
                  </div>
                  {/* Label column */}
                  <div style={{width:LABEL_W-16,flexShrink:0,paddingLeft:6,paddingRight:8,display:"flex",alignItems:"center",gap:5,borderRight:"1px solid var(--c-border)",height:"100%",overflow:"hidden",position:"relative"}}>
                    <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:barColor,boxShadow:isOverdue?`0 0 5px ${barColor}`:"none"}}/>
                    {isWork&&<span style={{fontSize:8,background:"#818cf822",color:"#818cf8",borderRadius:3,padding:"1px 4px",flexShrink:0,fontWeight:700}}>W</span>}
                    {isRecurringTask&&<span style={{fontSize:9,flexShrink:0}} title="Recurring task — bar drag not available">🔁</span>}
                    {hasMedia&&<span style={{fontSize:10,flexShrink:0}} title="Has media — hover to preview">🖼</span>}
                    <span className="lp-scale-sub" style={{fontSize:11,lineHeight:1.3,color:isDone?"var(--c-border)":isOverdue?"#fca5a5":"var(--c-text)",fontWeight:isOverdue?700:400,textDecoration:isDone?"line-through":"none",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",flex:1}}>{t.title}</span>
                    {/* ✏️ edit hint — appears on hover */}
                    <span style={{fontSize:10,color:"var(--c-text-muted)",flexShrink:0,opacity:0.6}} title="Click to edit">✏️</span>
                  </div>
                  <div style={{flex:1,position:"relative",height:"100%",overflow:"hidden"}}>
                    {monthCols.map((m,mi)=>{const lp=((m.getTime()-viewStartMs)/totalMs)*100;return <div key={mi} style={{position:"absolute",left:`${lp}%`,top:0,bottom:0,width:1,background:"var(--c-border)",zIndex:0}}/>;  })}
                    {/* N47: Thai public holiday bands (one day wide, min 2px so they stay visible) */}
                    {holidayBands.map(h=>{
                      const lp=((h.t-viewStartMs)/totalMs)*100;
                      const wp=(86400000/totalMs)*100;
                      if(lp>100||lp+wp<0) return null;
                      return <div key={h.iso} title={h.name}
                        onMouseEnter={e=>setHoverHol({name:h.name,iso:h.iso,x:e.clientX,y:e.clientY})}
                        onMouseLeave={()=>setHoverHol(null)}
                        style={{position:"absolute",left:`${Math.max(0,lp)}%`,width:`${Math.max(wp,0.12)}%`,minWidth:2,
                          top:0,bottom:0,background:"#a855f71f",borderLeft:"1px solid #a855f755",zIndex:0,cursor:"help"}}/>;
                    })}
                    {showWeeks&&weekCols.map((wk,wi)=>{const lp=((wk.date.getTime()-viewStartMs)/totalMs)*100;if(lp<0||lp>100)return null;return <div key={wi} style={{position:"absolute",left:`${lp}%`,top:0,bottom:0,width:1,background:"var(--c-border)",zIndex:0}}/>;})}
                    {barLeftPct!==null&&<div style={{position:"absolute",zIndex:1,left:`${barLeftPct}%`,width:`${barWidthPct}%`,top:"50%",transform:"translateY(-50%)",height:8,borderRadius:3,background:`${barColor}cc`,border:`1px solid ${barColor}`}}/>}
                    {showDiamond&&<div style={{position:"absolute",zIndex:2,left:`${duePct}%`,top:"50%",transform:"translate(-50%,-50%) rotate(45deg)",width:9,height:9,background:barColor,borderRadius:2,boxShadow:isOverdue?`0 0 7px ${barColor}`:`0 0 3px ${barColor}88`}}/>}
                    {showDiamond&&daysLeft!==null&&!isDone&&<div style={{position:"absolute",zIndex:3,left:`${duePct}%`,top:"calc(50% - 13px)",transform:"translateX(-50%)",fontSize:8,fontWeight:800,color:daysLeft<0?"#f87171":daysLeft<=14?"#fb923c":daysLeft<=60?"#fbbf24":"var(--c-text-muted)",whiteSpace:"nowrap",textShadow:"none"}}>{daysLeft<0?`${Math.abs(daysLeft)}d ago`:daysLeft===0?"TODAY":`${daysLeft}d`}</div>}
                    {!showDiamond&&dueMs&&dueMs>viewEnd.getTime()&&<div style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>→ {new Date(dueMs).toLocaleDateString("en-GB",{month:"short",year:"numeric"})}</div>}
                    {!dueMs&&<div style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:9,color:"#ef444455",fontWeight:700}}>NO DATE</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{padding:"10px 14px",borderTop:"1px solid var(--c-border)",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",background:"var(--c-surface2)"}}>
            <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em"}}>LEGEND</span>
            {[{l:"Overdue",c:"#ef4444"},{l:"Due ≤14d",c:"#fb923c"},{l:"Upcoming",c:"#6366f1"},{l:"Done",c:"#22c55e"}].map(({l,c})=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,transform:"rotate(45deg)",background:c}}/><span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>{l}</span></div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:20,height:7,borderRadius:2,background:"#6366f128",border:"1px solid #6366f140"}}/><span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>Work: start→end · Personal: 28d lead-up</span></div>
            <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:10}}>🖼</span><span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>Has media (hover to preview)</span></div>
            {showWeeks&&<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:9,background:"#6366f118",color:"#a5b4fc",padding:"1px 5px",borderRadius:3,fontWeight:700}}>W26</span><span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>ISO week number</span></div>}
          </div>
        </div>
      </div>
      <div style={{marginTop:8,fontSize:10,color:"var(--c-text-muted)",textAlign:"right"}}>{filtered.length} tasks · hover row for details &amp; media preview · <strong style={{color:"var(--c-accent)"}}>click row to edit ✏️</strong> · <strong style={{color:"var(--c-accent)"}}>drag ⠿ to reorder</strong></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK TAB  — sub-tabs by Project Name
// ─────────────────────────────────────────────────────────────────────────────
function WorkTab({ tasks, setTasks, knownProjects=[], onForgetProject, mentionTarget, clearMentionTarget }) {
  const [modal, setModal]           = useState(null);
  const [activeProject, setActiveProject] = useState("All");
  const [search, setSearch]         = useState("");
  const [filterPri, setFilterPri]   = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy]         = useState("due");
  const [lightbox, setLightbox]     = useState(null);
  // N33: open the task modal when navigated here via an @mention link
  useEffect(()=>{
    if (mentionTarget?.type==="task" && mentionTarget.item) {
      const t = tasks.find(x=>String(x.id)===String(mentionTarget.item.id));
      if (t) { setModal({task:t}); clearMentionTarget && clearMentionTarget(); }
    }
  }, [mentionTarget]);
  const [recurringDone, setRecurringDone] = useState(null); // N-Rec: task pending confirmation

  // Derive projects dynamically (including blank = "No Project")
  // N60: used names ∪ remembered names — a project stays selectable after its
  // last task is deleted, until you explicitly forget it.
  const [forgetTarget, setForgetTarget] = useState(null); // N60
  const usedProjects = useMemo(()=>new Set(tasks.map(t=>(t.project||"").trim()).filter(Boolean)),[tasks]);
  const projects = useMemo(()=>{
    const all = new Set([...usedProjects, ...knownProjects.filter(Boolean)]);
    return ["All","(No Project)",...[...all].sort()];
  },[usedProjects,knownProjects]);

  const filtered = useMemo(()=>{
    let l=[...tasks];
    if(activeProject==="All") { /* no filter */ }
    else if(activeProject==="(No Project)") l=l.filter(t=>!t.project);
    else l=l.filter(t=>t.project===activeProject);
    if(filterPri!=="All") l=l.filter(t=>t.priority===filterPri);
    if(filterStatus!=="All") l=l.filter(t=>t.status===filterStatus);
    if(search){const q=search.toLowerCase();l=l.filter(t=>t.title.toLowerCase().includes(q)||t.project?.toLowerCase().includes(q)||t.assignee?.toLowerCase().includes(q));}
    l.sort((a,b)=>{
      if(sortBy==="priority"){const o={High:0,Medium:1,Low:2};return(o[a.priority]??1)-(o[b.priority]??1);}
      if(sortBy==="project") return (a.project||"").localeCompare(b.project||"");
      if(sortBy==="status"){const o={todo:0,inprogress:1,review:2,done:3};return(o[a.status]??0)-(o[b.status]??0);}
      const aD=a.status==="done"?9999:(a.due?daysUntil(a.due):8888);
      const bD=b.status==="done"?9999:(b.due?daysUntil(b.due):8888);
      return aD-bD;
    });
    return l;
  },[tasks,activeProject,filterPri,filterStatus,search,sortBy]);

  const save=async(list)=>{setTasks(list);try{await window.storage.set(pkG(W_KEY),JSON.stringify(list));}catch{}};
  const handleSave=(form)=>{
    if(modal.mode==="edit"){
      const prev=tasks.find(t=>t.id===form.id);
      if(prev && prev.status!=="done" && form.status==="done" && (form.isRecurring||form.recur)){
        setModal(null);
        setRecurringDone(form);
        return;
      }
      save(tasks.map(t=>t.id===form.id?stampMilestone(t,form):t));
    } else save([...tasks,form]);
    setModal(null);
  };

  // N-Rec: check if task is recurring before marking done
  const toggleDone=(id)=>{
    const t=tasks.find(x=>x.id===id);
    if(!t) return;
    if(t.status!=="done" && (t.isRecurring||t.recur)) {
      setRecurringDone(t);
      return;
    }
    save(tasks.map(x=>x.id===id?stampMilestone(x,{...x,status:x.status==="done"?"todo":"done"}):x));
  };
  const handleRecurConfirm=({nextDue,nextStart,nextTitle})=>{
    const t=recurringDone;
    const donedList=tasks.map(x=>x.id===t.id?stampMilestone(x,{...x,status:"done"}):x);
    const nextTask={...t,id:newId(),status:"todo",due:nextDue,startDate:nextStart||nextDue,title:nextTitle,pinned:false,milestoneAt:"",createdAt:new Date().toISOString().slice(0,10)};
    save([...donedList,nextTask]);
    setRecurringDone(null);
  };
  const handleRecurDoneOnly=()=>{
    save(tasks.map(x=>x.id===recurringDone.id?stampMilestone(x,{...x,status:"done"}):x));
    setRecurringDone(null);
  };
  const togglePin=(id)=>save(tasks.map(t=>t.id===id?{...t,pinned:!t.pinned}:t));
  const del=(id)=>save(tasks.filter(t=>t.id!==id));
  // N-DuplicateTask: copy task with new id, reset status/pin/delay
  const dup=(t)=>{ const copy=duplicateTask({...t,_type:"work"}); save([...tasks,copy]); };

  const stats={total:tasks.length,todo:tasks.filter(t=>t.status==="todo").length,inprogress:tasks.filter(t=>t.status==="inprogress").length,review:tasks.filter(t=>t.status==="review").length,done:tasks.filter(t=>t.status==="done").length,high:tasks.filter(t=>t.priority==="High"&&t.status!=="done").length};
  const inp={padding:"7px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,outline:"none"};

  // N-NowComingSoonTabs: compute upcoming work tasks for the section
  const [editingTask, setEditingTask] = useState(null);
  const nowComingSoonWork = useMemo(()=>{
    const inRange = tasks.filter(t=>{
      if (!t.due || t.status==="overdue") return false;
      const d = daysUntil(t.due);
      return d!==null && d>=0 && d<=28;
    }).sort((a,b)=>new Date(a.due)-new Date(b.due));
    const bucket = d => d<=0?"today":d<=7?"week":"next4";
    const groups = {today:[],week:[],next4:[]};
    inRange.forEach(t=>{ groups[bucket(daysUntil(t.due))].push(t); });
    return { personal:{today:[],week:[],next4:[]}, work:groups };
  },[tasks]);

  const handleSaveEdited = async (updated) => {
    const next = tasks.some(t=>t.id===updated.id)
      ? tasks.map(t=>t.id===updated.id?updated:t)
      : [...tasks, updated];
    save(next);
    setEditingTask(null);
  };

  // Per-project counts (active tasks only)
  const projCount = (p) => {
    if(p==="All") return tasks.filter(t=>t.status!=="done").length;
    if(p==="(No Project)") return tasks.filter(t=>!t.project&&t.status!=="done").length;
    return tasks.filter(t=>t.project===p&&t.status!=="done").length;
  };

  return (
    <div>
      {editingTask&&<TaskDetailModal task={editingTask} onSave={handleSaveEdited} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{const copy=duplicateTask({...t,_type:"work"});save([...tasks,copy]);}}/>}
      {recurringDone&&<RecurringDoneModal task={recurringDone} onConfirmAndSave={handleRecurConfirm} onMarkDoneOnly={handleRecurDoneOnly} onCancel={()=>setRecurringDone(null)}/>}
      {/* N-NowComingSoonTabs: Work upcoming tasks */}
      <NowComingSoonSection data={nowComingSoonWork} onTaskClick={setEditingTask} singleType="work"/>
      {/* Stat row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:16}}>
        {[{l:"Total",v:stats.total,c:"#6366f1"},{l:"To Do",v:stats.todo,c:"var(--c-text-muted)"},{l:"In Progress",v:stats.inprogress,c:"#60a5fa"},{l:"Review",v:stats.review,c:"#a78bfa"},{l:"Done",v:stats.done,c:"#22c55e"},{l:"🔴 High",v:stats.high,c:"#ef4444"}].map(s=>(
          <div key={s.l} style={{background:"var(--c-card2)",borderRadius:10,padding:"10px 12px",borderTop:`3px solid ${s.c}`}}>
            <div style={{fontSize:20,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:3,fontWeight:700,letterSpacing:"0.04em"}}>{s.l.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Project sub-tabs */}
      <div style={{display:"flex",alignItems:"center",gap:0,borderBottom:"1px solid var(--c-border)",marginBottom:16,overflowX:"auto"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",whiteSpace:"nowrap",paddingRight:10,flexShrink:0}}>📁 PROJECT</span>
        {projects.map(p=>{
          const isActive = activeProject===p;
          const cnt = projCount(p);
          // N60: an empty remembered project can be forgotten on purpose
          const orphan = p!=="All" && p!=="(No Project)" && !usedProjects.has(p);
          if (orphan) return (
            <span key={p} style={{display:"inline-flex",alignItems:"center",flexShrink:0}}>
              <button onClick={()=>setActiveProject(p)} style={{
                padding:"8px 6px 8px 14px",background:"none",border:"none",
                borderBottom:`2px solid ${isActive?"#818cf8":"transparent"}`,
                color:isActive?"#c4b5fd":"var(--c-text-muted)",fontWeight:isActive?800:600,
                fontSize:12,cursor:"pointer",whiteSpace:"nowrap",opacity:0.75,
              }} title="No tasks use this project right now — it is kept so you can pick it again">
                📁 {p} <span style={{fontSize:9,opacity:0.7}}>(empty)</span>
              </button>
              <button onClick={()=>setForgetTarget(p)} title={`Forget project "${p}"`}
                style={{padding:"8px 8px 8px 2px",background:"none",border:"none",
                  borderBottom:`2px solid ${isActive?"#818cf8":"transparent"}`,
                  color:"var(--c-text-muted)",fontSize:10,cursor:"pointer",opacity:0.6}}>✕</button>
            </span>
          );
          return (
            <button key={p} onClick={()=>setActiveProject(p)} style={{
              padding:"8px 14px",background:"none",border:"none",
              borderBottom:`2px solid ${isActive?"#818cf8":"transparent"}`,
              color:isActive?"#c4b5fd":"var(--c-text-muted)",fontWeight:isActive?800:600,
              fontSize:12,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
              display:"flex",alignItems:"center",gap:5,
            }}>
              {p==="All"?"🗂 All":p==="(No Project)"?"📋 No Project":`📁 ${p}`}
              {cnt>0&&<span style={{background:isActive?"#818cf8":"var(--c-border)",color:isActive?"#fff":"var(--c-text-muted)",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 6px"}}>{cnt}</span>}
            </button>
          );
        })}
        <button onClick={()=>setModal({mode:"add",task:activeProject!=="All"&&activeProject!=="(No Project)"?{project:activeProject}:null})} data-fab-work style={{marginLeft:"auto",flexShrink:0,padding:"6px 14px",background:"#6366f1",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add Task</button>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks, project, assignee…" style={{...inp,flex:"1 1 200px",maxWidth:280}}/>
        <select style={inp} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="project">Sort: Project</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Filter pills */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {["All","High","Medium","Low"].map(p=><button key={p} onClick={()=>setFilterPri(p)} style={{padding:"3px 10px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:filterPri===p?(PRIORITY_CFG[p]?.color||"#6366f1"):"var(--c-border)",background:filterPri===p?(PRIORITY_CFG[p]?.bg||"#312e8133"):"transparent",color:filterPri===p?(PRIORITY_CFG[p]?.color||"#a5b4fc"):"var(--c-text-muted)"}}>{p==="All"?"All priority":p}</button>)}
        {["All","todo","inprogress","ontrack","review","delayed","done"].map(s=><button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"3px 10px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:filterStatus===s?"#6366f1":"var(--c-border)",background:filterStatus===s?"#312e8133":"transparent",color:filterStatus===s?"#a5b4fc":"var(--c-text-muted)"}}>{s==="All"?"All status":s==="todo"?"To Do":s==="inprogress"?"In Progress":s==="ontrack"?"🟢 On Track":s==="review"?"Review":s==="delayed"?"🔴 Delayed":"Done"}</button>)}
      </div>

      {/* Cards */}
      <div style={{display:"grid",gap:8}}>
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:"60px 0",color:"var(--c-text-muted)"}}>
            <div style={{fontSize:32,marginBottom:12}}>💼</div>
            <div style={{fontSize:14,color:"var(--c-text-muted)",marginBottom:16}}>{tasks.length===0?"No work tasks yet.":"No tasks match this filter."}</div>
            <button onClick={()=>setModal({mode:"add",task:activeProject!=="All"&&activeProject!=="(No Project)"?{project:activeProject}:null})} style={{padding:"10px 24px",background:"#6366f1",border:"none",borderRadius:10,color:"#fff",fontWeight:800,cursor:"pointer",fontSize:14}}>+ Add your first work task</button>
          </div>
        )}
        {filtered.map(t=><WorkCard key={t.id} t={t} onEdit={t=>setModal({mode:"edit",task:t})} onDelete={del} onToggleDone={toggleDone} onLightbox={setLightbox} onTogglePin={togglePin} onDuplicate={dup}/>)}
      </div>
      {lightbox&&<MediaLightbox item={lightbox} onClose={()=>setLightbox(null)}/>}
      {forgetTarget && <ConfirmDialog
        title={`Forget project "${forgetTarget}"?`}
        body="No tasks use it right now. The name disappears from the list — tasks are not affected. Using the name again re-adds it."
        confirmLabel="Forget"
        onConfirm={()=>{ onForgetProject&&onForgetProject(forgetTarget); if(activeProject===forgetTarget) setActiveProject("All"); setForgetTarget(null); }}
        onCancel={()=>setForgetTarget(null)}/>}
      {modal&&<WorkModal task={modal.task||null} onSave={handleSave} onClose={()=>setModal(null)} allTasks={tasks}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL TAB  — sub-tabs by Category
// ─────────────────────────────────────────────────────────────────────────────
function PersonalTab({ tasks, setTasks, mentionTarget, clearMentionTarget }) {
  const [modal, setModal]             = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy]           = useState("due");
  const [lightbox, setLightbox]       = useState(null);
  const [recurringDone, setRecurringDone] = useState(null); // N-Rec
  // N33: open the task modal when navigated here via an @mention link
  useEffect(()=>{
    if (mentionTarget?.type==="task" && mentionTarget.item) {
      const t = tasks.find(x=>String(x.id)===String(mentionTarget.item.id));
      if (t) { setModal({task:t}); clearMentionTarget && clearMentionTarget(); }
    }
  }, [mentionTarget]);

  // Derive categories dynamically from tasks + base set
  const categories = useMemo(()=>{
    const base = Object.keys(CAT_COLOR);
    const extra = tasks.map(t=>t.cat).filter(c=>c&&!base.includes(c));
    const all = [...base,...new Set(extra)].filter(c=>tasks.some(t=>t.cat===c));
    return ["All",...all.sort()];
  },[tasks]);

  const filtered = useMemo(()=>{
    let l=[...tasks];
    if(activeCategory!=="All") l=l.filter(t=>t.cat===activeCategory);
    if(statusFilter!=="All") l=l.filter(t=>t.status===statusFilter);
    if(search){const q=search.toLowerCase();l=l.filter(t=>t.title.toLowerCase().includes(q)||t.cat.toLowerCase().includes(q));}
    l.sort((a,b)=>{
      if(sortBy==="cat") return a.cat.localeCompare(b.cat);
      if(sortBy==="status"){const o={overdue:0,pending:1,done:2};return(o[a.status]??1)-(o[b.status]??1);}
      const aD=a.status==="done"?9999:a.status==="overdue"?-1:(a.due?daysUntil(a.due):8888);
      const bD=b.status==="done"?9999:b.status==="overdue"?-1:(b.due?daysUntil(b.due):8888);
      return aD-bD;
    });
    return l;
  },[tasks,activeCategory,statusFilter,search,sortBy]);

  const save=async(list)=>{setTasks(list);try{await window.storage.set(pkG(P_KEY),JSON.stringify(list));}catch{}};
  const handleSave=(form)=>{
    if(modal.mode==="edit"){
      const prev=tasks.find(t=>t.id===form.id);
      if(prev && prev.status!=="done" && form.status==="done" && (form.isRecurring||form.recur)){
        setModal(null);
        setRecurringDone(form);
        return;
      }
      save(tasks.map(t=>t.id===form.id?stampMilestone(t,form):t));
    } else save([...tasks,form]);
    setModal(null);
  };

  // N-Rec: intercept done toggle for recurring tasks
  const toggleDone=(id)=>{
    const t=tasks.find(x=>x.id===id);
    if(!t) return;
    if(t.status!=="done" && (t.isRecurring||t.recur)) {
      setRecurringDone(t);
      return;
    }
    save(tasks.map(x=>x.id===id?stampMilestone(x,{...x,status:x.status==="done"?"pending":"done"}):x));
  };
  const handleRecurConfirm=({nextDue,nextStart,nextTitle})=>{
    const t=recurringDone;
    const doneList=tasks.map(x=>x.id===t.id?stampMilestone(x,{...x,status:"done"}):x);
    const nextTask={...t,id:newId(),status:"pending",due:nextDue,startDate:nextStart||nextDue,title:nextTitle,pinned:false,milestoneAt:"",createdAt:new Date().toISOString().slice(0,10)};
    save([...doneList,nextTask]);
    setRecurringDone(null);
  };
  const handleRecurDoneOnly=()=>{
    save(tasks.map(x=>x.id===recurringDone.id?stampMilestone(x,{...x,status:"done"}):x));
    setRecurringDone(null);
  };
  const togglePin=(id)=>save(tasks.map(t=>t.id===id?{...t,pinned:!t.pinned}:t));
  const del=(id)=>save(tasks.filter(t=>t.id!==id));
  // N-DuplicateTask: copy task with new id, reset status/pin/delay
  const dup=(t)=>{ const copy=duplicateTask({...t,_type:"personal"}); save([...tasks,copy]); };

  const stats={pending:tasks.filter(t=>t.status==="pending").length,overdue:tasks.filter(t=>t.status==="overdue").length,done:tasks.filter(t=>t.status==="done").length};
  const inp={padding:"7px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,outline:"none"};

  // N-NowComingSoonTabs: compute upcoming personal tasks
  const [editingTask, setEditingTask] = useState(null);
  const nowComingSoonPersonal = useMemo(()=>{
    const inRange = tasks.filter(t=>{
      if (!t.due || t.status==="overdue") return false;
      const d = daysUntil(t.due);
      return d!==null && d>=0 && d<=28;
    }).sort((a,b)=>new Date(a.due)-new Date(b.due));
    const bucket = d => d<=0?"today":d<=7?"week":"next4";
    const groups = {today:[],week:[],next4:[]};
    inRange.forEach(t=>{ groups[bucket(daysUntil(t.due))].push(t); });
    return { personal:groups, work:{today:[],week:[],next4:[]} };
  },[tasks]);

  const handleSaveEdited = async (updated) => {
    const next = tasks.some(t=>t.id===updated.id)
      ? tasks.map(t=>t.id===updated.id?updated:t)
      : [...tasks, updated];
    save(next);
    setEditingTask(null);
  };

  // Per-category counts (active tasks only)
  const catCount = (c) => {
    if(c==="All") return tasks.filter(t=>t.status!=="done").length;
    return tasks.filter(t=>t.cat===c&&t.status!=="done").length;
  };

  return (
    <div>
      {editingTask&&<TaskDetailModal task={editingTask} onSave={handleSaveEdited} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{const copy=duplicateTask({...t,_type:"personal"});save([...tasks,copy]);}}/>}
      {recurringDone&&<RecurringDoneModal task={recurringDone} onConfirmAndSave={handleRecurConfirm} onMarkDoneOnly={handleRecurDoneOnly} onCancel={()=>setRecurringDone(null)}/>}
      {/* N-NowComingSoonTabs: Personal upcoming tasks */}
      <NowComingSoonSection data={nowComingSoonPersonal} onTaskClick={setEditingTask} singleType="personal"/>
      {/* Stat row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[{l:"Total",v:tasks.length,c:"#6366f1"},{l:"Pending",v:stats.pending,c:"var(--c-text-muted)"},{l:"Overdue",v:stats.overdue,c:"#ef4444"},{l:"Done",v:stats.done,c:"#22c55e"}].map(s=>(
          <div key={s.l} style={{background:"var(--c-card2)",borderRadius:10,padding:"10px 12px",borderTop:`3px solid ${s.c}`}}>
            <div style={{fontSize:20,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:3,fontWeight:700,letterSpacing:"0.04em"}}>{s.l.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Category sub-tabs */}
      <div style={{display:"flex",alignItems:"center",gap:0,borderBottom:"1px solid var(--c-border)",marginBottom:16,overflowX:"auto"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",whiteSpace:"nowrap",paddingRight:10,flexShrink:0}}>🏷 CATEGORY</span>
        {categories.map(c=>{
          const cc = CAT_COLOR[c]||"#6366f1";
          const isActive = activeCategory===c;
          const cnt = catCount(c);
          return (
            <button key={c} onClick={()=>setActiveCategory(c)} style={{
              padding:"8px 14px",background:"none",border:"none",
              borderBottom:`2px solid ${isActive?cc:"transparent"}`,
              color:isActive?cc:"var(--c-text-muted)",fontWeight:isActive?800:600,
              fontSize:12,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
              display:"flex",alignItems:"center",gap:5,
            }}>
              {c==="All"?"🗂 All":c}
              {cnt>0&&<span style={{background:isActive?cc:"var(--c-border)",color:isActive?"#fff":"var(--c-text-muted)",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 6px"}}>{cnt}</span>}
            </button>
          );
        })}
        <button onClick={()=>setModal({mode:"add",task:activeCategory!=="All"?{cat:activeCategory}:null})} data-fab-personal style={{marginLeft:"auto",flexShrink:0,padding:"6px 14px",background:"#6366f1",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add Task</button>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...inp,flex:"1 1 160px",maxWidth:240}}/>
        <select style={inp} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="due">Sort: Due date</option>
          <option value="cat">Sort: Category</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Status filter pills */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {["All","pending","overdue","postponed","done"].map(s=><button key={s} onClick={()=>setStatusFilter(s)} style={{padding:"3px 10px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:statusFilter===s?"#6366f1":"var(--c-border)",background:statusFilter===s?"#312e8133":"transparent",color:statusFilter===s?"#a5b4fc":"var(--c-text-muted)"}}>{s==="All"?"All status":s==="postponed"?"🔶 Postponed":s}</button>)}
      </div>

      {/* Cards */}
      <div style={{display:"grid",gap:7}}>
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"var(--c-text-muted)"}}>
            <div style={{fontSize:28,marginBottom:8}}>📋</div>
            <div style={{fontSize:13,color:"var(--c-text-muted)"}}>{tasks.length===0?"No personal tasks yet.":"No tasks in this category."}</div>
          </div>
        )}
        {filtered.map(t=><PersonalCard key={t.id} t={t} onEdit={t=>setModal({mode:"edit",task:t})} onDelete={del} onToggleDone={toggleDone} onLightbox={setLightbox} onTogglePin={togglePin} onDuplicate={dup}/>)}
      </div>
      {lightbox&&<MediaLightbox item={lightbox} onClose={()=>setLightbox(null)}/>}
      {modal&&<PersonalModal task={modal.task||null} onSave={handleSave} onClose={()=>setModal(null)} allTasks={tasks}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA LIGHTBOX  — fullscreen image / video popup
// ─────────────────────────────────────────────────────────────────────────────
function MediaLightbox({ item, onClose }) {
  const kind = detectAttachType(item);
  const src  = item.type === "file" ? item.data : item.url;
  const name = item.name || item.label || "attachment";

  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:5000,
        background:"rgba(0,0,0,.92)",
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:24,
      }}
    >
      {/* Toolbar */}
      <div style={{
        position:"fixed", top:0, left:0, right:0,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 20px",
        background:"rgba(0,0,0,.7)",
        backdropFilter:"blur(8px)",
        zIndex:5001,
      }} onClick={e=>e.stopPropagation()}>
        <span style={{color:"var(--c-text)",fontSize:13,fontWeight:600,maxWidth:"60%",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
        <div style={{display:"flex",gap:8}}>
          {/* Open with default program (downloads the file / opens in new tab) */}
          <a
            href={src}
            download={item.type==="file" ? name : undefined}
            target="_blank"
            rel="noopener noreferrer"
            title="Open / download with default program"
            style={{
              display:"flex",alignItems:"center",gap:5,
              padding:"6px 14px",borderRadius:8,
              background:"#6366f1",color:"#fff",
              fontSize:12,fontWeight:700,textDecoration:"none",
            }}
          >
            {item.type==="file" ? "⬇️ Download" : "↗ Open in browser"}
          </a>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width:34,height:34,borderRadius:8,border:"1px solid #475569",
              background:"var(--c-surface)",color:"var(--c-text-muted)",
              fontSize:18,cursor:"pointer",lineHeight:1,
              display:"flex",alignItems:"center",justifyContent:"center",
            }}
          >×</button>
        </div>
      </div>

      {/* Media content */}
      <div onClick={e=>e.stopPropagation()} style={{marginTop:52,maxWidth:"90vw",maxHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {kind==="image" ? (
          <img
            src={src}
            alt={name}
            style={{
              maxWidth:"90vw", maxHeight:"80vh",
              objectFit:"contain",
              borderRadius:10,
              boxShadow:"0 20px 60px rgba(0,0,0,.8)",
            }}
          />
        ) : kind==="video" ? (
          <video
            src={src}
            controls
            autoPlay
            style={{
              maxWidth:"90vw", maxHeight:"80vh",
              borderRadius:10,
              boxShadow:"0 20px 60px rgba(0,0,0,.8)",
            }}
          />
        ) : kind==="video-link" ? (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:16}}>▶️</div>
            <p style={{color:"var(--c-text-muted)",fontSize:14,marginBottom:16}}>{name}</p>
            <a href={src} target="_blank" rel="noopener noreferrer"
              style={{padding:"10px 24px",background:"#6366f1",color:"#fff",
                borderRadius:8,textDecoration:"none",fontWeight:700,fontSize:14}}>
              Open video link ↗
            </a>
          </div>
        ) : (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:16}}>📎</div>
            <p style={{color:"var(--c-text-muted)",fontSize:14,marginBottom:16}}>{name}</p>
            <a href={src} download={name} target="_blank" rel="noopener noreferrer"
              style={{padding:"10px 24px",background:"#6366f1",color:"#fff",
                borderRadius:8,textDecoration:"none",fontWeight:700,fontSize:14}}>
              ⬇️ Download file
            </a>
          </div>
        )}
      </div>

      <p style={{color:"var(--c-text-muted)",fontSize:11,marginTop:16,position:"fixed",bottom:16}}>
        Click outside or press Esc to close
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK DETAIL + EDIT MODAL  (used from Timeline Up Next)
// ─────────────────────────────────────────────────────────────────────────────
function TaskDetailModal({ task, onSave, onClose, onDuplicate }) {
  const isWork = task._type === "work";
  // Delegate to the right modal, pre-populated with the task
  if (isWork) return <WorkModal task={task} onSave={onSave} onClose={onClose} allTasks={[task]} onDuplicate={onDuplicate}/>;
  return <PersonalModal task={task} onSave={onSave} onClose={onClose} allTasks={[task]} onDuplicate={onDuplicate}/>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🗃️ N38: DATA LIST TAB — one spreadsheet-like grid holding EVERY task + event.
// Inline-editable cells (like Microsoft Lists / Excel), multi-filter, sort,
// add rows, delete rows, and "open full editor" for anything a modal can do.
// ─────────────────────────────────────────────────────────────────────────────
function DataListTab({ personal, work, setPersonal, setWork, events=[], setEvents,
                       eventTypes=DEFAULT_EVENT_TYPES, setEventTypes, lang="EN" }) {
  const [q, setQ]               = useState("");
  const [kind, setKind]         = useState("all");    // all | personal | work | event
  const [fStatus, setFStatus]   = useState("all");
  const [fPrio, setFPrio]       = useState("all");
  const [fCat, setFCat]         = useState("all");
  const [sortKey, setSortKey]   = useState("due");
  const [sortDir, setSortDir]   = useState("asc");
  const [editingTask, setEditingTask]   = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [density, setDensity]   = useState("comfy"); // comfy | compact
  const [pendingDone, setPendingDone] = useState(null); // N38: next-due popup from inline checkbox
  const [confirmDel, setConfirmDel]   = useState(null); // N59: row pending deletion

  // ── persistence helpers (profile-scoped — never raw keys) ──
  const writeP = (next)=>{ setPersonal(next); try{window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{} };
  const writeW = (next)=>{ setWork(next);     try{window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{} };

  // ── unified row model ──
  const rows = useMemo(()=>{
    const out = [];
    personal.forEach(t=>out.push({...t,_kind:"personal"}));
    work.forEach(t=>out.push({...t,_kind:"work"}));
    events.forEach(e=>{
      const w = eventWindows(e)[0] || {start:"",end:""};
      out.push({...e,_kind:"event",_winStart:w.start,_winEnd:w.end,_winCount:eventWindows(e).length});
    });
    return out;
  },[personal,work,events]);

  const categories = useMemo(()=>{
    const s = new Set();
    personal.forEach(t=>t.cat&&s.add(t.cat));
    work.forEach(t=>(t.project||t.cat)&&s.add(t.project||t.cat));
    return [...s].sort();
  },[personal,work]);

  const statuses = useMemo(()=>{
    const s = new Set();
    personal.forEach(t=>t.status&&s.add(t.status));
    work.forEach(t=>t.status&&s.add(t.status));
    return [...s].sort();
  },[personal,work]);

  // ── filter + sort ──
  const view = useMemo(()=>{
    const ql = q.trim().toLowerCase();
    let l = rows.filter(r=>{
      if (kind!=="all" && r._kind!==kind) return false;
      if (r._kind!=="event") {
        if (fStatus!=="all" && r.status!==fStatus) return false;
        if (fPrio!=="all" && r.priority!==fPrio) return false;
        const c = r._kind==="work" ? (r.project||r.cat) : r.cat;
        if (fCat!=="all" && c!==fCat) return false;
      } else if (fStatus!=="all"||fPrio!=="all"||fCat!=="all") {
        return false; // events carry no status/priority/category
      }
      if (!ql) return true;
      return [r.title,r.description,r.note,r.cat,r.project,r.recur].some(v=>(v||"").toLowerCase().includes(ql));
    });
    const val = (r)=>{
      switch(sortKey){
        case "title":  return (r.title||"").toLowerCase();
        case "kind":   return r._kind;
        case "status": return r.status||"";
        case "prio":   return {High:0,Medium:1,Low:2}[r.priority] ?? 3;
        case "cat":    return (r._kind==="work"?(r.project||r.cat):r.cat)||"";
        case "start":  return (r._kind==="event"?r._winStart:r.startDate)||"9999";
        default:       return (r._kind==="event"?r._winEnd:r.due)||"9999";
      }
    };
    l.sort((a,b)=>{ const x=val(a),y=val(b); const c = x<y?-1:x>y?1:0; return sortDir==="asc"?c:-c; });
    return l;
  },[rows,q,kind,fStatus,fPrio,fCat,sortKey,sortDir]);

  // ── inline cell commit ──
  const patchRow = (r, patch)=>{
    if (r._kind==="event") {
      if (!setEvents) return;
      const next = events.map(e=>{
        if (e.id!==r.id) return e;
        const merged = {...e,...patch};
        // keep windows[0] in sync when start/end edited from the grid
        if ("start" in patch || "end" in patch) {
          const wins = eventWindows(e);
          const w0 = {start: patch.start ?? wins[0]?.start, end: patch.end ?? wins[0]?.end};
          if (w0.end && w0.start && w0.end < w0.start) w0.end = w0.start;
          merged.windows = [w0, ...wins.slice(1)];
          merged.start = w0.start; merged.end = w0.end;
        }
        if ("typeId" in patch) {
          const ty = eventTypes.find(t=>t.id===patch.typeId);
          if (ty) merged.color = ty.color;
        }
        return merged;
      });
      setEvents(next);
      logAct("edit", `Edited event: ${r.title}`, "list");
      return;
    }
    const list = r._kind==="work" ? work : personal;
    const prev = list.find(t=>t.id===r.id);
    const updated = {...prev, ...patch};
    const becameDone = prev && prev.status!=="done" && updated.status==="done";
    // N38: a recurring task ticked Done must ask for the next due date, same as the modal
    if (becameDone && (updated.isRecurring||updated.recur) && !patch._meta) {
      setPendingDone({...updated, _kind:r._kind});
      return;
    }
    const next = applyEditWithRecur(list, updated, r._kind==="work"?"todo":"pending");
    (r._kind==="work"?writeW:writeP)(next);
    logAct(becameDone?"done":"edit", `${becameDone?"Completed":"Edited"}: ${updated.title}`, r._kind, "from List");
  };

  const deleteRow = (r)=>{ setConfirmDel(r); };
  const reallyDeleteRow = (r)=>{
    if (r._kind==="event") { setEvents&&setEvents(events.filter(e=>e.id!==r.id)); logAct("delete",`Deleted event: ${r.title}`,"list"); return; }
    const list = r._kind==="work"?work:personal;
    (r._kind==="work"?writeW:writeP)(list.filter(t=>t.id!==r.id));
    logAct("delete", `Deleted: ${r.title}`, r._kind, "from List");
  };

  const saveTaskModal = (updated)=>{
    const list = updated._type==="work"?work:personal;
    const exists = list.some(t=>t.id===updated.id);
    const next = exists ? applyEditWithRecur(list, updated, updated._type==="work"?"todo":"pending") : [...list, updated];
    (updated._type==="work"?writeW:writeP)(next);
    logAct(exists?"edit":"create", `${exists?"Edited":"Added"}: ${updated.title}`, updated._type, "from List");
    setEditingTask(null);
  };
  const saveEventModal = (ev)=>{
    if(!setEvents) return;
    const exists = events.some(e=>e.id===ev.id);
    setEvents(exists ? events.map(e=>e.id===ev.id?ev:e) : [...events, ev]);
    logAct(exists?"edit":"create", `${exists?"Edited":"Added"} event: ${ev.title}`, "list");
    setEditingEvent(null);
  };

  const addRow = (k)=>{
    const base = { id: newId(), title:"", description:"",
      due:fmtLocal(TODAY), startDate:"", priority:"Medium", location:"", attachments:[],
      pinned:false, milestone:true, milestoneAt:"", recur:"", isRecurring:false, subtasks:[] };
    if (k==="event") setEditingEvent({ id:base.id, title:"", start:fmtLocal(TODAY), end:fmtLocal(TODAY),
      typeId:(eventTypes[0]?.id)||"personal", color:(eventTypes[0]?.color)||"#8b5cf6", note:"" });
    else if (k==="work") setEditingTask({...base, _type:"work", cat:"Other", project:"", status:"todo", progress:0});
    else setEditingTask({...base, _type:"personal", cat:"Home", status:"pending"});
  };

  // ── styles ──
  const PAD = density==="compact" ? "4px 8px" : "8px 10px";
  const FS  = density==="compact" ? 11 : 12;
  const th = (key,label,w)=>(
    <th onClick={()=>{ if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortKey(key);setSortDir("asc");} }}
      style={{padding:PAD,fontSize:10,fontWeight:800,letterSpacing:"0.05em",color:"var(--c-text-muted)",
        textAlign:"left",cursor:"pointer",whiteSpace:"nowrap",borderBottom:"2px solid var(--c-border)",
        background:"var(--c-surface2)",position:"sticky",top:0,zIndex:2,width:w,userSelect:"none"}}>
      {label}{sortKey===key?(sortDir==="asc"?" ▲":" ▼"):""}
    </th>
  );
  const cellInp = {width:"100%",border:"1px solid transparent",borderRadius:5,background:"transparent",
    color:"var(--c-text)",fontSize:FS,padding:"3px 5px",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const focusable = {
    onFocus:e=>{e.target.style.border="1px solid var(--c-accent)";e.target.style.background="var(--c-surface)";},
    onBlur:e=>{e.target.style.border="1px solid transparent";e.target.style.background="transparent";},
  };
  const chip = (active,color="#6366f1")=>({padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
    whiteSpace:"nowrap",border:active?`1.5px solid ${color}`:"1px solid var(--c-border)",
    background:active?color+"22":"var(--c-surface)",color:active?color:"var(--c-text-muted)"});

  const rowColor = (r)=> r._kind==="event" ? (r.color||"#8b5cf6")
    : r._kind==="work" ? groupColor(r.project) : groupColor(r.cat);

  const exportCsv = ()=>{
    const head = ["id","kind","title","status","priority","category","start","end/due","recurrence","description"];
    const esc = v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const lines = [head.join(",")].concat(view.map(r=>[
      r.id, r._kind, r.title, r._kind==="event"?"":r.status, r._kind==="event"?"":r.priority,
      r._kind==="event"?(eventTypes.find(t=>t.id===r.typeId)?.name||""):(r._kind==="work"?(r.project||r.cat):r.cat),
      r._kind==="event"?r._winStart:r.startDate, r._kind==="event"?r._winEnd:r.due,
      r._kind==="event"?"":r.recur, r._kind==="event"?r.note:r.description,
    ].map(esc).join(",")));
    const blob=new Blob(["\uFEFF"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`My-Todo-Planner-List-${fmtLocal(new Date())}.csv`; a.click();
  };

  const activeFilters = (kind!=="all")+(fStatus!=="all")+(fPrio!=="all")+(fCat!=="all")+(q.trim()?1:0);

  return (
    <div>
      {editingTask && <TaskDetailModal task={editingTask} onSave={saveTaskModal} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{const copy=duplicateTask(t);const list=copy._type==="work"?work:personal;
          (copy._type==="work"?writeW:writeP)([...list,copy]);}}/>}
      {confirmDel && <ConfirmDialog
        title={`Delete "${confirmDel.title||"Untitled"}"?`}
        body={confirmDel._kind==="event" ? "This removes the event and all of its time windows." : "This removes the task permanently."}
        onConfirm={()=>{ const r=confirmDel; setConfirmDel(null); reallyDeleteRow(r); }}
        onCancel={()=>setConfirmDel(null)}/>}
      {pendingDone && <NextDuePopup task={pendingDone} onCancel={()=>setPendingDone(null)}
        onConfirm={(meta)=>{
          const k = pendingDone._kind;
          const list = k==="work"?work:personal;
          const payload = {...pendingDone, ...meta, _meta:true};
          delete payload._kind; delete payload._meta;
          const next = applyEditWithRecur(list, {...payload, ...meta}, k==="work"?"todo":"pending");
          (k==="work"?writeW:writeP)(next);
          logAct("done", `Completed: ${pendingDone.title}`, k, "from List");
          setPendingDone(null);
        }}/>}
      {editingEvent && <EventModal event={editingEvent} onSave={saveEventModal}
        onDelete={id=>{setEvents&&setEvents(events.filter(e=>e.id!==id));setEditingEvent(null);}}
        onClose={()=>setEditingEvent(null)} eventTypes={eventTypes} setEventTypes={setEventTypes}/>}

      {/* Header */}
      <div style={{marginBottom:14,padding:"14px 18px",background:"linear-gradient(135deg,#6366f118,#6366f108)",
        border:"1px solid #6366f133",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:17,fontWeight:800,color:"var(--c-text)",marginBottom:3}}>🗃️ {lang==="TH"?"ฐานข้อมูลทั้งหมด":"All Data"}</div>
          <div style={{fontSize:11.5,color:"var(--c-text-muted)"}}>
            {view.length} / {rows.length} {lang==="TH"?"รายการ":"rows"} · {lang==="TH"?"แก้ไขในช่องได้เลย · กด ✏️ เพื่อเปิดฟอร์มเต็ม":"edit cells inline · ✏️ opens the full editor"}
          </div>
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <button onClick={()=>addRow("personal")} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid #34d39955",background:"#34d39915",color:"#059669",fontSize:12,fontWeight:800,cursor:"pointer"}}>+ 🏠 Personal</button>
          <button onClick={()=>addRow("work")} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4f46e5",fontSize:12,fontWeight:800,cursor:"pointer"}}>+ 💼 Work</button>
          <button onClick={()=>addRow("event")} style={{padding:"7px 13px",borderRadius:8,border:"1.5px solid #8b5cf655",background:"#8b5cf615",color:"#7c3aed",fontSize:12,fontWeight:800,cursor:"pointer"}}>+ 📅 Event</button>
          <button onClick={exportCsv} style={{padding:"7px 13px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>⬇ CSV</button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:12,
        background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"10px 12px"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder={lang==="TH"?"🔍 ค้นหาทุกช่อง…":"🔍 Search all fields…"}
          style={{flex:"1 1 200px",minWidth:170,padding:"7px 11px",borderRadius:8,border:"1.5px solid var(--c-border)",
            background:"var(--c-surface)",color:"var(--c-text)",fontSize:12.5,outline:"none"}}/>
        {[["all","All"],["personal","🏠 Personal"],["work","💼 Work"],["event","📅 Event"]].map(([v,l])=>(
          <button key={v} onClick={()=>setKind(v)} style={chip(kind===v)}>{l}</button>
        ))}
        <div style={{width:1,height:18,background:"var(--c-border)"}}/>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{...chip(fStatus!=="all","#22c55e"),padding:"5px 9px"}}>
          <option value="all">Status: All</option>
          {statuses.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fPrio} onChange={e=>setFPrio(e.target.value)} style={{...chip(fPrio!=="all","#f59e0b"),padding:"5px 9px"}}>
          <option value="all">Priority: All</option>
          {["High","Medium","Low"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fCat} onChange={e=>setFCat(e.target.value)} style={{...chip(fCat!=="all","#8b5cf6"),padding:"5px 9px"}}>
          <option value="all">Category: All</option>
          {categories.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {activeFilters>0 && (
          <button onClick={()=>{setQ("");setKind("all");setFStatus("all");setFPrio("all");setFCat("all");}}
            style={{...chip(true,"#ef4444")}}>✕ Clear filters ({activeFilters})</button>
        )}
        <div style={{flex:1}}/>
        <button onClick={()=>setDensity(d=>d==="comfy"?"compact":"comfy")} style={chip(density==="compact","#64748b")}>
          {density==="compact"?"▤ Compact":"▥ Comfortable"}
        </button>
      </div>

      {/* Grid */}
      <div style={{border:"1px solid var(--c-border)",borderRadius:12,overflow:"auto",maxHeight:"68vh",background:"var(--c-surface)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1050}}>
          <thead>
            <tr>
              <th style={{padding:PAD,background:"var(--c-surface2)",position:"sticky",top:0,zIndex:2,width:34,borderBottom:"2px solid var(--c-border)"}}/>
              {th("kind","TYPE",70)}
              {th("title","TITLE",260)}
              {th("status","STATUS",118)}
              {th("prio","PRIORITY",100)}
              {th("cat","CATEGORY / PROJECT",150)}
              {th("start","START",120)}
              {th("due","DUE / END",120)}
              <th style={{padding:PAD,fontSize:10,fontWeight:800,letterSpacing:"0.05em",color:"var(--c-text-muted)",textAlign:"left",
                background:"var(--c-surface2)",position:"sticky",top:0,zIndex:2,width:120,borderBottom:"2px solid var(--c-border)"}}>RECURRENCE</th>
              <th style={{padding:PAD,fontSize:10,fontWeight:800,color:"var(--c-text-muted)",textAlign:"center",
                background:"var(--c-surface2)",position:"sticky",top:0,zIndex:2,width:78,borderBottom:"2px solid var(--c-border)"}}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {view.length===0 && (
              <tr><td colSpan={10} style={{padding:"44px 20px",textAlign:"center",color:"var(--c-text-muted)",fontSize:13}}>
                {rows.length===0 ? (lang==="TH"?"ยังไม่มีข้อมูล — กดปุ่ม + ด้านบนเพื่อเพิ่ม":"No data yet — use the + buttons above")
                                 : (lang==="TH"?"ไม่มีรายการตรงกับตัวกรอง":"Nothing matches these filters")}
              </td></tr>
            )}
            {view.map((r,i)=>{
              const isEv = r._kind==="event";
              const cc = rowColor(r);
              const done = !isEv && r.status==="done";
              return (
                <tr key={`${r._kind}-${r.id}`} style={{background:i%2?"var(--c-row-odd)":"transparent",
                  borderBottom:"1px solid var(--c-border)",opacity:done?0.62:1}}>
                  <td style={{padding:PAD,borderLeft:`4px solid ${cc}`}}>
                    {!isEv && (
                      <span onClick={()=>patchRow(r,{status:done?(r._kind==="work"?"todo":"pending"):"done"})}
                        title={done?"Mark as not done":"Mark as done"}
                        style={{cursor:"pointer",fontSize:14,color:done?"#22c55e":"var(--c-text-muted)"}}>{done?"☑":"☐"}</span>
                    )}
                    {isEv && <span style={{fontSize:12}}>📅</span>}
                  </td>
                  <td style={{padding:PAD,fontSize:10,fontWeight:800,color:cc,whiteSpace:"nowrap"}}>
                    {isEv?"EVENT":r._kind==="work"?"WORK":"PERSONAL"}
                    {isEv&&r._winCount>1&&<span style={{marginLeft:4,background:cc+"22",borderRadius:4,padding:"0 4px"}}>×{r._winCount}</span>}
                  </td>
                  <td style={{padding:PAD}}>
                    <input {...focusable} style={{...cellInp,fontWeight:600,textDecoration:done?"line-through":"none"}}
                      defaultValue={r.title} onBlur={e=>{e.target.style.border="1px solid transparent";e.target.style.background="transparent";
                        if(e.target.value!==r.title) patchRow(r,{title:e.target.value});}}
                      onKeyDown={e=>e.key==="Enter"&&e.target.blur()}/>
                  </td>
                  <td style={{padding:PAD}}>
                    {isEv ? (
                      <select value={r.typeId||""} onChange={e=>patchRow(r,{typeId:e.target.value})}
                        style={{...cellInp,fontWeight:700,color:cc}}>
                        {eventTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <select value={r.status||""} onChange={e=>patchRow(r,{status:e.target.value})} {...focusable}
                        style={{...cellInp,fontWeight:700,color:done?"#22c55e":r.status==="overdue"?"#ef4444":"var(--c-text)"}}>
                        {[...new Set([...statuses,"pending","todo","done","overdue","postponed"])].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{padding:PAD}}>
                    {isEv ? <span style={{fontSize:FS,color:"var(--c-text-muted)"}}>—</span> : (
                      <select value={r.priority||"Medium"} onChange={e=>patchRow(r,{priority:e.target.value})} {...focusable}
                        style={{...cellInp,fontWeight:700,color:r.priority==="High"?"#ef4444":r.priority==="Low"?"#64748b":"#f59e0b"}}>
                        {["High","Medium","Low"].map(p=><option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{padding:PAD}}>
                    {isEv ? <span style={{fontSize:FS,color:"var(--c-text-muted)"}}>{eventTypes.find(t=>t.id===r.typeId)?.name||"—"}</span> : (
                      <input {...focusable} style={cellInp}
                        defaultValue={r._kind==="work"?(r.project||r.cat||""):(r.cat||"")}
                        onBlur={e=>{e.target.style.border="1px solid transparent";e.target.style.background="transparent";
                          const v=e.target.value;
                          if(r._kind==="work"){ if(v!==(r.project||r.cat)) patchRow(r,{project:v}); }
                          else if(v!==r.cat) patchRow(r,{cat:v});}}
                        onKeyDown={e=>e.key==="Enter"&&e.target.blur()}/>
                    )}
                  </td>
                  <td style={{padding:PAD}}>
                    <DateInput style={cellInp} placeholder="—"
                      value={(isEv?r._winStart:r.startDate)||""}
                      onChange={v=>patchRow(r, isEv?{start:v}:{startDate:v})}/>
                  </td>
                  <td style={{padding:PAD}}>
                    <DateInput style={cellInp} placeholder="—"
                      value={(isEv?r._winEnd:r.due)||""}
                      onChange={v=>patchRow(r, isEv?{end:v}:{due:v})}/>
                  </td>
                  <td style={{padding:PAD}}>
                    {isEv ? <span style={{fontSize:FS,color:"var(--c-text-muted)"}}>—</span> : (
                      <input {...focusable} style={cellInp} defaultValue={r.recur||""} placeholder="—"
                        onBlur={e=>{e.target.style.border="1px solid transparent";e.target.style.background="transparent";
                          if(e.target.value!==(r.recur||"")) patchRow(r,{recur:e.target.value,isRecurring:!!e.target.value});}}
                        onKeyDown={e=>e.key==="Enter"&&e.target.blur()}/>
                    )}
                  </td>
                  <td style={{padding:PAD,textAlign:"center",whiteSpace:"nowrap"}}>
                    <span onClick={()=>isEv?setEditingEvent(r):setEditingTask({...r,_type:r._kind})}
                      title="Open the full editor" style={{cursor:"pointer",fontSize:13,marginRight:8}}>✏️</span>
                    <span onClick={()=>deleteRow(r)} title="Delete" style={{cursor:"pointer",fontSize:12,opacity:0.55}}>🗑</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:10.5,color:"var(--c-text-muted)",marginTop:9,lineHeight:1.6}}>
        💡 {lang==="TH"
          ? "คลิกหัวคอลัมน์เพื่อเรียงลำดับ · แก้ในช่องแล้วกด Enter หรือคลิกที่อื่นเพื่อบันทึก · ติ๊ก ☐ เพื่อทำเครื่องหมายเสร็จ (งานวนซ้ำจะถามวันถัดไป) · ✏️ เปิดฟอร์มเต็มสำหรับ subtask, ไฟล์แนบ, AI"
          : "Click a header to sort · edit a cell then press Enter or click away to save · ✏️ opens the full editor"}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE TAB
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// N-NowComingSoon: Overview section — Today / This Week / Next 2-4 Weeks
// Split into Personal | Work columns. Done tasks shown with strikethrough.
// Empty groups show "No tasks" for consistent layout. Click any task to edit.
// singleType: "personal" | "work" | null (null = both columns for Overview)
// ─────────────────────────────────────────────────────────────────────────────
function NowComingSoonSection({ data, onTaskClick, singleType=null }) {
  const SUBGROUPS = [
    { key:"today", label:"TODAY",            icon:"🔥" },
    { key:"week",  label:"THIS WEEK",        icon:"📅" },
    { key:"next4", label:"NEXT 2–4 WEEKS",   icon:"🗓️" },
  ];

  const Column = ({ title, icon, color, groups }) => (
    <div style={{flex:1,minWidth:0,background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:12,padding:"14px 16px"}}>
      {!singleType&&(
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
          <span style={{fontSize:14}}>{icon}</span>
          <span style={{fontSize:11,fontWeight:800,color,letterSpacing:"0.06em"}}>{title}</span>
        </div>
      )}
      {SUBGROUPS.map(sg=>{
        const items = groups[sg.key]||[];
        return (
          <div key={sg.key} style={{marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:6,display:"flex",alignItems:"center",gap:4}}>
              <span>{sg.icon}</span>{sg.label}
              {items.length>0&&<span style={{fontSize:8,color:"var(--c-text-muted)"}}>({items.length})</span>}
            </div>
            {items.length===0 ? (
              <div style={{fontSize:10,color:"var(--c-surface)",fontStyle:"italic",padding:"4px 0"}}>No tasks</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {items.map(t=>{
                  const cc = t._type==="work" ? (WORK_CAT_COLOR[t.cat]||"#94a3b8") : groupColor(t.cat);
                  const isDone = t.status==="done";
                  return (
                    <div key={`${t._type}-${t.id}`}
                      onClick={()=>onTaskClick(t)}
                      style={{display:"flex",alignItems:"center",gap:7,background:"var(--c-card2)",borderRadius:7,
                        padding:"6px 9px",cursor:"pointer",transition:"background .12s",
                        borderLeft:`3px solid ${cc}`,opacity:isDone?0.65:1}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--c-card2)"}>
                      <span style={{fontSize:11,color:isDone?"var(--c-text-muted)":"var(--c-text)",flex:1,
                        textDecoration:isDone?"line-through":"none",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {isDone&&"✓ "}{t.title}
                      </span>
                      <span style={{fontSize:9,color:"var(--c-text-muted)",flexShrink:0,whiteSpace:"nowrap"}}>{fmtShort(t.due)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        📅 NOW &amp; COMING SOON <span style={{fontWeight:500,color:"var(--c-text-muted)",fontSize:10}}>· next 4 weeks</span>
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        {(!singleType||singleType==="personal")&&<Column title="PERSONAL" icon="🏠" color="#34d399" groups={data.personal}/>}
        {(!singleType||singleType==="work")    &&<Column title="WORK"     icon="💼" color="#818cf8" groups={data.work}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📝 N26/N29: NOTES — Word-like rich text editor (contentEditable) with pages,
//   font/size/bold/italic/color, images (add/delete/align/resize), undo/redo,
//   print to PDF (A4/A3), and full-text search. Saved in the same JSON as todos.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// N33: MENTION DROPDOWN — shared autocomplete for @-mentions in contentEditable
//   and textareas. Shows matching tasks/notes/events; onPick inserts a link.
// ─────────────────────────────────────────────────────────────────────────────
function MentionDropdown({ query, x, y, onPick, onClose }) {
  const index = (typeof window!=="undefined" && window.__mentionIndex) || [];
  const q = (query||"").toLowerCase();
  const results = index.filter(i=>i.label.toLowerCase().includes(q)).slice(0, 8);
  const [sel, setSel] = React.useState(0);

  React.useEffect(()=>{ setSel(0); }, [query]);
  React.useEffect(()=>{
    const onKey = (e)=>{
      if (e.key==="ArrowDown"){ e.preventDefault(); setSel(s=>Math.min(s+1,results.length-1)); }
      else if (e.key==="ArrowUp"){ e.preventDefault(); setSel(s=>Math.max(s-1,0)); }
      else if (e.key==="Enter"||e.key==="Tab"){ if(results[sel]){ e.preventDefault(); onPick(results[sel]); } }
      else if (e.key==="Escape"){ onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    return ()=>document.removeEventListener("keydown", onKey, true);
  }, [results, sel, onPick, onClose]);

  if (!results.length) return null;
  return (
    <div style={{position:"fixed",left:Math.min(x,window.innerWidth-260),top:y+4,zIndex:9500,
      background:"var(--c-card2)",border:"1px solid var(--c-accent)",borderRadius:10,
      boxShadow:"0 12px 40px rgba(0,0,0,.3)",width:250,maxHeight:280,overflow:"auto",padding:4}}>
      {results.map((r,i)=>(
        <div key={`${r.type}-${r.id}`} onMouseDown={e=>{e.preventDefault();onPick(r);}}
          onMouseEnter={()=>setSel(i)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,cursor:"pointer",
            background:i===sel?"#6366f122":"transparent"}}>
          <span style={{fontSize:13}}>{r.icon}</span>
          <span style={{fontSize:12,color:"var(--c-text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{r.label}</span>
          <span style={{fontSize:8,color:"var(--c-text-muted)",fontWeight:700,textTransform:"uppercase"}}>{r.type}</span>
        </div>
      ))}
    </div>
  );
}

// N33: textarea with @mention autocomplete. Stores mentions inline as tokens
//   [[type:id|label]] so they can be rendered as clickable links in read view.
function MentionTextarea({ value, onChange, placeholder, style }) {
  const ref = React.useRef(null);
  const [mention, setMention] = React.useState(null); // {query, x, y, start}

  const detect = () => {
    const el = ref.current; if (!el) return;
    const caret = el.selectionStart;
    const upto = (value||"").slice(0, caret);
    const m = upto.match(/@([^\s@]{0,40})$/);
    if (m) {
      const rect = el.getBoundingClientRect();
      setMention({ query:m[1], x:rect.left+12, y:rect.top+24, start:caret-m[0].length, end:caret });
    } else setMention(null);
  };
  const pick = (item) => {
    if (!mention) return;
    const token = `[[${item.type}:${item.id}|${item.label}]]`;
    const next = (value||"").slice(0,mention.start) + token + " " + (value||"").slice(mention.end);
    onChange(next);
    setMention(null);
    setTimeout(()=>ref.current&&ref.current.focus(),0);
  };
  // N33: parse tokens for the clickable preview + remove one when its ✕ is clicked
  const tokenRe = /\[\[(task|note|event):([^\|\]]+)\|([^\]]+)\]\]/g;
  const links = [];
  let mm; while((mm=tokenRe.exec(value||""))!==null){ links.push({full:mm[0],type:mm[1],id:mm[2],label:mm[3]}); }
  const removeToken = (full) => onChange((value||"").replace(full,"").replace(/\s{2,}/g," ").trim());

  return (
    <>
      <textarea ref={ref} style={style} value={value||""}
        onChange={e=>{onChange(e.target.value);}}
        onKeyUp={detect} onClick={detect}
        placeholder={placeholder}/>
      {mention && <MentionDropdown query={mention.query} x={mention.x} y={mention.y} onPick={pick} onClose={()=>setMention(null)}/>}
      {/* N33: clickable preview of linked items (tokens become chips you can click to navigate) */}
      {links.length>0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
          <span style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:700,alignSelf:"center"}}>🔗 LINKS:</span>
          {links.map((l,i)=>{
            const icon=l.type==="task"?"🔗":l.type==="note"?"📝":"📅";
            return (
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,
                background:"#6366f118",color:"#6366f1",borderRadius:6,padding:"3px 8px"}}>
                <span onClick={(e)=>{e.preventDefault();e.stopPropagation();window.__navigateMention&&window.__navigateMention(l.type,l.id);}}
                  style={{color:"#6366f1",textDecoration:"none",cursor:"pointer"}}>{icon} {l.label}</span>
                <span onClick={()=>removeToken(l.full)} style={{cursor:"pointer",opacity:0.6,fontSize:10}} title="Remove link">✕</span>
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

// N33: render a description string with [[type:id|label]] tokens as clickable links
function renderMentions(text) {
  if (!text) return null;
  const parts = [];
  const re = /\[\[(task|note|event):([^\|\]]+)\|([^\]]+)\]\]/g;
  let last = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, type, id, label] = m;
    const icon = type==="task"?"🔗":type==="note"?"📝":"📅";
    parts.push(
      <a key={`m${key++}`} href="#" data-mention-type={type} data-mention-id={id}
        style={{color:"#6366f1",fontWeight:600,background:"#6366f118",borderRadius:4,padding:"0 4px",textDecoration:"none",cursor:"pointer"}}>{icon} {label}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function NotesTab({ notes, setNotes, lang="EN", mentionTarget, clearMentionTarget }) {
  const [lightbox, setLightbox] = useState(null); // N86: enlarged image pop-up
  const [activeId, setActiveId] = useState(notes[0]?.id || null);
  const [search, setSearch] = useState("");
  const [paper, setPaper] = useState("a4"); // a4 | a3
  const [aiSumBusy, setAiSumBusy] = useState(false); // C7: AI summarize
  const editorRef = React.useRef(null);
  const savingRef = React.useRef(false);

  // Undo/redo stacks (per active page). Keep last ~20 (≥3 required).
  const undoStack = React.useRef([]);
  const redoStack = React.useRef([]);

  // N33: open the target note page when navigated here via an @mention link
  React.useEffect(()=>{
    if (mentionTarget?.type==="note" && mentionTarget.id!=null) {
      const target = notes.find(n=>String(n.id)===String(mentionTarget.id));
      if (target) { setActiveId(target.id); setSearch(""); clearMentionTarget && clearMentionTarget(); }
    }
  }, [mentionTarget]);

  const active = notes.find(n=>n.id===activeId) || null;

  const addPage = () => {
    const p = { id:newId(), title:"Untitled", emoji:"📄", html:"", updatedAt:new Date().toISOString() };
    setNotes([...notes, p]); setActiveId(p.id);
    undoStack.current=[]; redoStack.current=[];
  };
  const updatePage = (id, patch) => {
    setNotes(notes.map(n=>n.id===id?{...n,...patch,updatedAt:new Date().toISOString()}:n));
  };
  const deletePage = (id) => {
    const next = notes.filter(n=>n.id!==id);
    setNotes(next);
    if (activeId===id){ setActiveId(next[0]?.id||null); undoStack.current=[]; redoStack.current=[]; }
  };

  // ── contentEditable sync ────────────────────────────────────────────────
  // Load page html into the editor when the active page changes
  React.useEffect(()=>{
    if (editorRef.current && active) {
      // N29: migrate old block-based notes → html (one-time)
      let html = active.html;
      if (html == null && Array.isArray(active.blocks)) {
        html = active.blocks.map(b=>{
          if (b.type==="text") return `<p>${(b.content||"").replace(/\n/g,"<br/>")}</p>`;
          if (b.type==="image"&&b.content) return `<div class="note-img-wrap" style="text-align:left;margin:8px 0"><img src="${b.content}" style="width:${b.width||50}%;max-width:100%" data-note-img="1"/></div>`;
          if (b.type==="link"&&b.content) return `<p><a href="${b.content}">${b.content}</a></p>`;
          if (b.type==="video"&&b.content) return `<p>🎥 ${b.content}</p>`;
          return "";
        }).join("");
        updatePage(active.id, { html, blocks: undefined });
      }
      if (editorRef.current.innerHTML !== (html||"")) {
        editorRef.current.innerHTML = html || "";
      }
      undoStack.current = [html||""];
      redoStack.current = [];
    }
  }, [activeId]);

  const pushUndo = (html) => {
    const st = undoStack.current;
    if (st[st.length-1] !== html) {
      st.push(html);
      if (st.length > 20) st.shift();
      redoStack.current = [];
    }
  };

  const saveEditor = () => {
    if (!editorRef.current || !active) return;
    const html = editorRef.current.innerHTML;
    pushUndo(html);
    updatePage(active.id, { html });
  };

  // C7: AI — summarize the current note, insert a summary box at the top
  const summarizeNote = async () => {
    if (!active || !editorRef.current) return;
    const plain = editorRef.current.innerText.trim();
    if (plain.length < 40) { alert(lang==="TH"?"โน้ตสั้นเกินไป":"Note too short to summarize"); return; }
    setAiSumBusy(true);
    try {
      const prompt = `Summarize the following note into 3-5 concise bullet points. Reply ONLY with the bullets (each starting with "• "), in the same language as the note.\n\nNOTE:\n${plain.slice(0,4000)}`;
      const out = await callClaude(prompt, 500);
      const box = `<div style="background:#8b5cf615;border-left:4px solid #8b5cf6;border-radius:8px;padding:12px 16px;margin-bottom:16px"><div style="font-weight:800;color:#7c3aed;font-size:13px;margin-bottom:6px">✨ AI Summary</div><div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${out.replace(/</g,"&lt;")}</div></div>`;
      editorRef.current.innerHTML = box + editorRef.current.innerHTML;
      saveEditor();
    } catch {
      alert(lang==="TH"?"AI only works when published as an artifact":"AI only works when published as an artifact");
    }
    setAiSumBusy(false);
  };

  const exec = (cmd, val=null) => {
    document.execCommand(cmd, false, val);
    editorRef.current && editorRef.current.focus();
    saveEditor();
  };

  const doUndo = () => {
    const st = undoStack.current;
    if (st.length <= 1) return;
    const cur = st.pop();
    redoStack.current.push(cur);
    const prev = st[st.length-1];
    if (editorRef.current) editorRef.current.innerHTML = prev;
    updatePage(active.id, { html: prev });
  };
  const doRedo = () => {
    const r = redoStack.current;
    if (!r.length) return;
    const html = r.pop();
    undoStack.current.push(html);
    if (editorRef.current) editorRef.current.innerHTML = html;
    updatePage(active.id, { html });
  };

  // ── Images ───────────────────────────────────────────────────────────────
  const fileToDataURL = (file) => new Promise((res)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
  const insertImageHTML = (dataUrl) => {
    // insert a resizable, alignable image wrapped in a div for centering
    const html = `<div class="note-img-wrap" style="text-align:left;margin:8px 0"><img src="${dataUrl}" style="width:50%;max-width:100%;border-radius:6px" data-note-img="1"/></div>`;
    document.execCommand("insertHTML", false, html);
    saveEditor();
  };
  const attachImage = async (file) => { if(file){ const d=await fileToDataURL(file); insertImageHTML(d);} };

  // Paste image from clipboard
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items; if(!items) return;
    for (const it of items){ if(it.type.startsWith("image/")){ e.preventDefault(); const f=it.getAsFile(); if(f) await attachImage(f); return; } }
  };

  // Click an image → select it (store ref) so toolbar can align/resize/delete
  const [selImg, setSelImg] = useState(null);
  const onEditorClick = (e) => {
    if (e.target.closest("[data-mention-type]")) return; // let global handler navigate
    if (e.target.tagName==="IMG" && e.target.dataset.noteImg) setSelImg(e.target);
    else setSelImg(null);
  };
  // N86: double-click an image → open it big, movable and resizable
  const onEditorDblClick = (e) => {
    if (e.target.tagName==="IMG" && e.target.dataset.noteImg) {
      e.preventDefault();
      setLightbox(e.target.src);
    }
  };

  // N33: @mention autocomplete in the note editor
  const [mention, setMention] = useState(null); // {query, x, y, range}
  const detectMention = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setMention(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== 3) { setMention(null); return; } // text node only
    const text = node.textContent.slice(0, range.startOffset);
    const m = text.match(/@([^\s@]{0,40})$/);
    if (m) {
      const rect = range.getBoundingClientRect();
      setMention({ query: m[1], x: rect.left, y: rect.bottom, node, offset: range.startOffset, atLen: m[0].length });
    } else {
      setMention(null);
    }
  };
  const insertMention = (item) => {
    if (!mention) return;
    const { node, offset, atLen } = mention;
    // remove the "@query" text
    const before = node.textContent.slice(0, offset - atLen);
    const after = node.textContent.slice(offset);
    node.textContent = before + after;
    // place caret where @ was
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(node, before.length); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    // insert the link chip
    const safe = (item.label||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const chip = `<a href="#" data-mention-type="${item.type}" data-mention-id="${item.id}" contenteditable="false" style="color:#6366f1;font-weight:600;background:#6366f118;border-radius:4px;padding:0 4px;text-decoration:none;cursor:pointer">${item.icon} ${safe}</a>&nbsp;`;
    document.execCommand("insertHTML", false, chip);
    setMention(null);
    saveEditor();
  };

  const alignImg = (align) => {
    if (!selImg) return;
    const wrap = selImg.closest(".note-img-wrap");
    if (wrap) wrap.style.textAlign = align;
    saveEditor();
  };
  const resizeImg = (pct) => {
    if (!selImg) return;
    selImg.style.width = pct+"%";
    saveEditor();
  };
  const deleteImg = () => {
    if (!selImg) return;
    const wrap = selImg.closest(".note-img-wrap") || selImg;
    wrap.remove(); setSelImg(null); saveEditor();
  };

  // ── Print to PDF (A4/A3) ──────────────────────────────────────────────────
  const printPDF = () => {
    if (!active) return;
    const size = paper==="a3" ? "A3" : "A4";
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow popups to print"); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${(active.title||"Note").replace(/</g,"")}</title>
      <style>
        @page { size: ${size}; margin: 18mm; }
        body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color:#1a1a1a; line-height:1.6; }
        h1 { font-size: 22px; margin-bottom: 16px; }
        img { max-width: 100%; }
        .note-img-wrap { margin: 8px 0; }
      </style></head><body>
      <h1>${active.emoji||""} ${(active.title||"Untitled").replace(/</g,"&lt;")}</h1>
      ${sanitizeNoteHTML(active.html)}
      <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
      </body></html>`);
    w.document.close();
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const stripHtml = (h)=>(h||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ");
  const searchResults = search.trim() ? notes.filter(n=>{
    const q=search.toLowerCase();
    return n.title.toLowerCase().includes(q) || stripHtml(n.html).toLowerCase().includes(q);
  }) : null;

  const inp = {width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const tbBtn = {padding:"5px 9px",borderRadius:6,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,fontWeight:700,cursor:"pointer",lineHeight:1};
  const FONTS = ["Default","Arial","Georgia","Courier New","Times New Roman","Tahoma","Verdana"];
  const SIZES = [["1","XS"],["2","S"],["3","M"],["4","L"],["5","XL"],["6","XXL"],["7","Huge"]];

  return (
    <div style={{padding:"16px 0",display:"flex",gap:16,minHeight:560}}>
      {/* Sidebar */}
      <div style={{width:220,flexShrink:0,borderRight:"1px solid var(--c-border)",paddingRight:14}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search notes…" style={{...inp,marginBottom:10,fontSize:12}}/>
        <button onClick={addPage} style={{width:"100%",padding:"8px 0",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",marginBottom:12}}>+ New Page</button>
        {searchResults ? (
          <div>
            <div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",marginBottom:6,letterSpacing:"0.06em"}}>RESULTS ({searchResults.length})</div>
            {searchResults.map(n=>(
              <div key={n.id} onClick={()=>{setActiveId(n.id);setSearch("");}} style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",fontSize:12,color:"var(--c-text)",marginBottom:2,background:"var(--c-surface2)"}}>{n.emoji} {n.title}</div>
            ))}
            {searchResults.length===0&&<div style={{fontSize:11,color:"var(--c-text-muted)",padding:"8px 0"}}>No matches</div>}
          </div>
        ) : (
          <div>
            {notes.length===0&&<div style={{fontSize:11,color:"var(--c-text-muted)",padding:"8px 0",lineHeight:1.6}}>No pages yet.<br/>Click + New Page.</div>}
            {notes.map(n=>(
              <div key={n.id} onClick={()=>setActiveId(n.id)} style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",fontSize:12,marginBottom:2,background:activeId===n.id?"#6366f122":"transparent",color:activeId===n.id?"var(--c-text)":"var(--c-text-muted)",fontWeight:activeId===n.id?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.emoji} {n.title}</div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <div style={{flex:1,minWidth:0}}>
        {!active ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:"var(--c-text-muted)"}}>
            <div style={{fontSize:40,marginBottom:12}}>📝</div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:6,color:"var(--c-text)"}}>{lang==="TH"?"สมุดโน้ตของคุณ":"Your Notes"}</div>
            <div style={{fontSize:12,lineHeight:1.6}}>{lang==="TH"?"สร้างหน้าใหม่ — พิมพ์ ใส่รูป จัดฟอนต์ พิมพ์เป็น PDF ได้ บันทึกในไฟล์เดียวกับ Todo":"Create a page — rich text, images, print to PDF. Saved in your Todo file."}</div>
          </div>
        ) : (
          <div>
            {/* Title row */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <input value={active.emoji} onChange={e=>updatePage(active.id,{emoji:e.target.value.slice(0,2)})} style={{width:44,fontSize:26,textAlign:"center",background:"transparent",border:"none",outline:"none",cursor:"pointer"}}/>
              <input value={active.title} onChange={e=>updatePage(active.id,{title:e.target.value})} placeholder="Untitled" style={{flex:1,fontSize:24,fontWeight:800,background:"transparent",border:"none",outline:"none",color:"var(--c-text)"}}/>
              <button onClick={()=>{if(confirm("Delete this page?"))deletePage(active.id);}} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--c-border)",background:"transparent",color:"#f87171",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button>
            </div>

            {/* Toolbar */}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",padding:"8px 10px",background:"var(--c-surface2)",borderRadius:8,marginBottom:8,position:"sticky",top:0,zIndex:5}}>
              <button style={tbBtn} onClick={doUndo} title="Undo">↶</button>
              <button style={tbBtn} onClick={doRedo} title="Redo">↷</button>
              <span style={{width:1,height:20,background:"var(--c-border)",margin:"0 2px"}}/>
              <select onChange={e=>{exec("fontName",e.target.value==="Default"?"":e.target.value);e.target.selectedIndex=0;}} style={{...tbBtn,padding:"5px 6px"}} title="Font">
                <option>Font</option>{FONTS.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
              <select onChange={e=>{exec("fontSize",e.target.value);e.target.selectedIndex=0;}} style={{...tbBtn,padding:"5px 6px"}} title="Size">
                <option>Size</option>{SIZES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
              <button style={{...tbBtn,fontWeight:900}} onClick={()=>exec("bold")} title="Bold">B</button>
              <button style={{...tbBtn,fontStyle:"italic"}} onClick={()=>exec("italic")} title="Italic">I</button>
              <button style={{...tbBtn,textDecoration:"underline"}} onClick={()=>exec("underline")} title="Underline">U</button>
              <button style={{...tbBtn,textDecoration:"line-through"}} onClick={()=>exec("strikeThrough")} title="Strikethrough">S</button>
              <label style={{...tbBtn,display:"flex",alignItems:"center",gap:3}} title="Text color">🎨<input type="color" onChange={e=>exec("foreColor",e.target.value)} style={{width:16,height:16,border:"none",background:"none",cursor:"pointer",padding:0}}/></label>
              <label style={{...tbBtn,display:"flex",alignItems:"center",gap:3}} title="Highlight">🖍<input type="color" onChange={e=>exec("hiliteColor",e.target.value)} style={{width:16,height:16,border:"none",background:"none",cursor:"pointer",padding:0}}/></label>
              <span style={{width:1,height:20,background:"var(--c-border)",margin:"0 2px"}}/>
              <button style={tbBtn} onClick={()=>exec("insertUnorderedList")} title="Bullet list">• List</button>
              <button style={tbBtn} onClick={()=>exec("justifyLeft")} title="Align left">⇤</button>
              <button style={tbBtn} onClick={()=>exec("justifyCenter")} title="Align center">↔</button>
              <button style={tbBtn} onClick={()=>exec("justifyRight")} title="Align right">⇥</button>
              <span style={{width:1,height:20,background:"var(--c-border)",margin:"0 2px"}}/>
              <label style={{...tbBtn,background:"#6366f1",color:"#fff",border:"none"}} title="Insert image">🖼 Image<input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files[0];await attachImage(f);e.target.value="";}}/></label>
              <span style={{width:1,height:20,background:"var(--c-border)",margin:"0 2px"}}/>
              <select value={paper} onChange={e=>setPaper(e.target.value)} style={{...tbBtn,padding:"5px 6px"}} title="Paper size"><option value="a4">A4</option><option value="a3">A3</option></select>
              <button style={{...tbBtn,background:"#dc2626",color:"#fff",border:"none"}} onClick={printPDF} title="Print / Save PDF">📄 PDF</button>
              <button style={{...tbBtn,background:aiSumBusy?"#94a3b8":"#8b5cf6",color:"#fff",border:"none",cursor:aiSumBusy?"wait":"pointer"}} onClick={summarizeNote} disabled={aiSumBusy} title="Summarize this note with AI">{aiSumBusy?"⏳":"✨ Summarize"}</button>
            </div>

            {/* Image controls (when an image is selected) */}
            {selImg && (
              <div style={{display:"flex",gap:6,alignItems:"center",padding:"6px 10px",background:"#6366f118",border:"1px solid #6366f144",borderRadius:8,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--c-text)"}}>🖼 Image:</span>
                <button style={tbBtn} onClick={()=>alignImg("left")}>⇤ Left</button>
                <button style={tbBtn} onClick={()=>alignImg("center")}>↔ Center</button>
                <button style={tbBtn} onClick={()=>alignImg("right")}>⇥ Right</button>
                <span style={{fontSize:10,color:"var(--c-text-muted)",fontWeight:700}}>Size</span>
                {[25,50,75,100].map(p=><button key={p} style={tbBtn} onClick={()=>resizeImg(p)}>{p}%</button>)}
                <button style={{...tbBtn,background:"#dc2626",color:"#fff",border:"none"}} onClick={deleteImg}>🗑 Delete</button>
              </div>
            )}

            {/* The editable "paper" */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={()=>{saveEditor();detectMention();}}
              onKeyUp={detectMention}
              onBlur={saveEditor}
              onPaste={handlePaste}
              onClick={onEditorClick}
              onDoubleClick={onEditorDblClick}
              style={{
                minHeight:480, maxWidth: paper==="a3"?"1100px":"820px",
                margin:"0 auto", padding:"48px 56px", background:"#ffffff", color:"#1a1a1a",
                border:"1px solid var(--c-border)", borderRadius:8, outline:"none",
                boxShadow:"0 2px 12px rgba(0,0,0,.08)", lineHeight:1.7, fontSize:15,
              }}
              data-placeholder="Start writing…  (type @ to link a task, note, or event)"
            />
              {lightbox && <ImageLightbox src={lightbox} onClose={()=>setLightbox(null)}/>}
            {mention && <MentionDropdown query={mention.query} x={mention.x} y={mention.y} onPick={insertMention} onClose={()=>setMention(null)}/>}
            <div style={{textAlign:"center",fontSize:10,color:"var(--c-text-muted)",marginTop:8}}>
              {paper.toUpperCase()} · {lang==="TH"?"วางรูป Ctrl+V · คลิกรูปเพื่อจัด · พิมพ์ @ เพื่อลิงก์ · ↶↷ ย้อน/ทำซ้ำ":"Paste Ctrl+V · click image · type @ to link · ↶↷ undo/redo"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// N30: FLOATING NOTE — small draggable/resizable panel that stays on top within
//   the app, so you can jot notes while viewing any other tab. Saves to a
//   dedicated "📌 Quick Note" page in the notes list (persists in the JSON file).
// ─────────────────────────────────────────────────────────────────────────────
function FloatingNote({ notes, setNotes, pinned, onTogglePin, onClose, noteId, lang="EN" }) {
  const [pos, setPos] = React.useState({ x: Math.max(20, window.innerWidth-380), y: 90 });
  const [size, setSize] = React.useState({ w: 340, h: 340 });
  const edRef = React.useRef(null);

  const page = notes.find(n=>n.id===noteId);

  React.useEffect(()=>{
    if (edRef.current && page) {
      const html = page.html || "";
      if (edRef.current.innerHTML !== html) edRef.current.innerHTML = html;
    }
  },[noteId]);

  const save = () => {
    if (!edRef.current) return;
    const html = edRef.current.innerHTML;
    setNotes(notes.map(n=>n.id===noteId?{...n,html,updatedAt:new Date().toISOString()}:n));
  };
  const rename = (title) => {
    setNotes(notes.map(n=>n.id===noteId?{...n,title,updatedAt:new Date().toISOString()}:n));
  };

  const onHeaderDown = (e) => {
    if (e.target.tagName==="INPUT"||e.target.tagName==="BUTTON") return;
    const startX=e.clientX, startY=e.clientY, ox=pos.x, oy=pos.y;
    const move=(ev)=>setPos({x:Math.max(0,ox+ev.clientX-startX), y:Math.max(0,oy+ev.clientY-startY)});
    const up=()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);
  };
  const onResizeDown = (e) => {
    e.stopPropagation();
    const startX=e.clientX, startY=e.clientY, ow=size.w, oh=size.h;
    const move=(ev)=>setSize({w:Math.max(240,ow+ev.clientX-startX), h:Math.max(180,oh+ev.clientY-startY)});
    const up=()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);
  };

  if (!page) return null;
  return (
    <div style={{position:"fixed",left:pos.x,top:pos.y,width:size.w,height:size.h,
      zIndex:pinned?9999:200,background:"var(--c-card2)",border:"1px solid var(--c-accent)",
      borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div onMouseDown={onHeaderDown}
        style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"var(--c-surface2)",
          borderBottom:"1px solid var(--c-border)",cursor:"grab",userSelect:"none"}}>
        <span style={{fontSize:13}}>📌</span>
        <input value={page.title} onChange={e=>rename(e.target.value)}
          style={{flex:1,fontSize:12,fontWeight:800,color:"var(--c-text)",background:"transparent",border:"none",outline:"none",minWidth:0}}/>
        <button onClick={onTogglePin} title={pinned?"On top (click to unpin)":"Pin on top"}
          style={{fontSize:12,background:"transparent",border:"none",cursor:"pointer",opacity:pinned?1:0.4}}>📌</button>
        <button onClick={onClose} title="Close" style={{fontSize:13,background:"transparent",border:"none",cursor:"pointer",color:"var(--c-text-muted)"}}>✕</button>
      </div>
      <div ref={edRef} contentEditable suppressContentEditableWarning
        onInput={save} onBlur={save}
        data-placeholder={lang==="TH"?"จดที่นี่ได้เลย…":"Jot anything here…"}
        style={{flex:1,padding:"12px 14px",overflow:"auto",outline:"none",fontSize:13,lineHeight:1.6,
          color:"var(--c-text)",background:"var(--c-surface)"}}/>
      <div onMouseDown={onResizeDown}
        style={{position:"absolute",right:0,bottom:0,width:16,height:16,cursor:"nwse-resize",
          background:"linear-gradient(135deg,transparent 50%,var(--c-accent) 50%)"}}/>
    </div>
  );
}

function StatsTab({ personal, work, lang="EN" }) {
  const stats = useMemo(()=>{
    const all = [...personal.map(t=>({...t,_type:"personal"})),...work.map(t=>({...t,_type:"work"}))];
    const total = all.length;
    const done = all.filter(t=>t.status==="done").length;
    const overdue = all.filter(t=>isOverdue(t)).length;
    const active = total - done;
    const completionRate = total>0 ? Math.round((done/total)*100) : 0;

    // by category (personal) / project (work)
    const byGroup = {};
    all.forEach(t=>{
      const key = t._type==="work" ? (t.project||"(No Project)") : (t.cat||"Other");
      if (!byGroup[key]) byGroup[key]={total:0,done:0,type:t._type};
      byGroup[key].total++;
      if (t.status==="done") byGroup[key].done++;
    });
    const groups = Object.entries(byGroup).map(([name,v])=>({name,...v,rate:v.total>0?Math.round((v.done/v.total)*100):0}))
      .sort((a,b)=>b.total-a.total);

    // by priority
    const byPriority = {High:0,Medium:0,Low:0};
    all.filter(t=>t.status!=="done").forEach(t=>{if(byPriority[t.priority]!=null)byPriority[t.priority]++;});

    // milestones done
    const milestonesDone = all.filter(t=>t.status==="done"&&t.milestone!==false&&t.milestoneAt).length;

    // completed by month (last 6 months)
    const now = new Date();
    const months = [];
    for (let i=5;i>=0;i--){
      const d = new Date(now.getFullYear(),now.getMonth()-i,1);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
      const label = d.toLocaleDateString("en-GB",{month:"short"});
      const count = all.filter(t=>{
        if(t.status!=="done"||!t.milestoneAt) return false;
        const md = new Date(t.milestoneAt);
        return md.getFullYear()===d.getFullYear()&&md.getMonth()===d.getMonth();
      }).length;
      months.push({label,count,key});
    }
    const maxMonth = Math.max(1,...months.map(m=>m.count));

    return {total,done,overdue,active,completionRate,groups,byPriority,milestonesDone,months,maxMonth,
      personalTotal:personal.length,workTotal:work.length};
  },[personal,work]);

  const Card = ({label,value,color,sub}) => (
    <div style={{flex:1,minWidth:120,background:"var(--c-surface)",border:"1px solid var(--c-border)",
      borderRadius:12,padding:"16px 18px",boxShadow:"var(--c-shadow)"}}>
      <div style={{fontSize:26,fontWeight:800,color,lineHeight:1.1}}>{value}</div>
      <div style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:700,marginTop:4}}>{label}</div>
      {sub&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:2}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{padding:"16px 0"}}>
      <div style={{marginBottom:18,padding:"16px 20px",background:"linear-gradient(135deg,#6366f118,#6366f108)",
        border:"1px solid #6366f133",borderRadius:12}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>
          📊 {lang==="TH"?"สถิติและภาพรวม":"Statistics Dashboard"}
        </div>
        <div style={{fontSize:12,color:"var(--c-text-muted)"}}>
          {lang==="TH"?"ภาพรวมความคืบหน้าและประสิทธิภาพ":"Your productivity at a glance"}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:22}}>
        <Card label={lang==="TH"?"ทั้งหมด":"Total Tasks"} value={stats.total} color="var(--c-text)"
          sub={`🏠 ${stats.personalTotal} · 💼 ${stats.workTotal}`}/>
        <Card label={lang==="TH"?"เสร็จแล้ว":"Completed"} value={stats.done} color="#22c55e"/>
        <Card label={lang==="TH"?"กำลังทำ":"Active"} value={stats.active} color="#6366f1"/>
        <Card label={lang==="TH"?"เกินกำหนด":"Overdue"} value={stats.overdue} color="#ef4444"/>
        <Card label={lang==="TH"?"หมุดหมาย":"Milestones"} value={stats.milestonesDone} color="#f59e0b"/>
      </div>

      {/* Completion rate ring */}
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:22}}>
        <div style={{flex:"1 1 240px",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:12,padding:"18px 20px"}}>
          <div style={{fontSize:12,fontWeight:800,color:"var(--c-text-muted)",marginBottom:14,letterSpacing:"0.05em"}}>COMPLETION RATE</div>
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            {(()=>{
              const r=42,circ=2*Math.PI*r,off=circ*(1-stats.completionRate/100);
              return (
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={r} fill="none" stroke="var(--c-border)" strokeWidth="10"/>
                  <circle cx="50" cy="50" r={r} fill="none" stroke="#22c55e" strokeWidth="10"
                    strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
                    transform="rotate(-90 50 50)"/>
                  <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                    fontSize="22" fontWeight="800" fill="var(--c-text)">{stats.completionRate}%</text>
                </svg>
              );
            })()}
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:"var(--c-text)",fontWeight:700,marginBottom:4}}>{stats.done} / {stats.total} done</div>
              <div style={{fontSize:11,color:"var(--c-text-muted)"}}>
                {stats.completionRate>=70?"🎉 Great progress!":stats.completionRate>=40?"💪 Keep going!":"🚀 Just getting started"}
              </div>
            </div>
          </div>
        </div>

        {/* Completed per month bar chart */}
        <div style={{flex:"1 1 300px",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:12,padding:"18px 20px"}}>
          <div style={{fontSize:12,fontWeight:800,color:"var(--c-text-muted)",marginBottom:14,letterSpacing:"0.05em"}}>COMPLETED — LAST 6 MONTHS</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
            {stats.months.map((m,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--c-text)"}}>{m.count||""}</div>
                <div style={{width:"100%",height:`${(m.count/stats.maxMonth)*70}%`,minHeight:m.count>0?4:0,
                  background:"linear-gradient(to top,#6366f1,#818cf8)",borderRadius:"4px 4px 0 0",transition:"height .3s"}}/>
                <div style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:600}}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By category/project */}
      <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:12,padding:"18px 20px",marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:800,color:"var(--c-text-muted)",marginBottom:14,letterSpacing:"0.05em"}}>BY CATEGORY / PROJECT</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {stats.groups.slice(0,10).map(g=>{
            const cc = groupColor(g.name);
            return (
              <div key={g.name} style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:11}}>{g.type==="work"?"💼":"🏠"}</span>
                <div style={{width:120,fontSize:12,color:"var(--c-text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</div>
                <div style={{flex:1,height:18,background:"var(--c-surface2)",borderRadius:9,overflow:"hidden",position:"relative"}}>
                  <div style={{width:`${g.rate}%`,height:"100%",background:cc,borderRadius:9,transition:"width .3s"}}/>
                </div>
                <div style={{width:80,fontSize:11,color:"var(--c-text-muted)",textAlign:"right",fontWeight:700}}>{g.done}/{g.total} · {g.rate}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DoneListTab({ personal, work, setPersonal, setWork, lang="EN" }) {
  const [editingTask, setEditingTask] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const doneTasks = useMemo(()=>{
    const all = [
      ...personal.map(t=>({...t,_type:"personal"})),
      ...work.map(t=>({...t,_type:"work"})),
    ].filter(t=>t.status==="done");
    // Sort by completion time — use milestoneAt if present, else due date as fallback
    return all.sort((a,b)=>{
      const at = a.milestoneAt ? new Date(a.milestoneAt).getTime() : (a.due?new Date(a.due).getTime():0);
      const bt = b.milestoneAt ? new Date(b.milestoneAt).getTime() : (b.due?new Date(b.due).getTime():0);
      return bt-at; // most recent first
    });
  },[personal,work]);

  const filtered = useMemo(()=>{
    let l = doneTasks;
    if (filterType!=="all") l = l.filter(t=>t._type===filterType);
    if (search){const q=search.toLowerCase();l=l.filter(t=>t.title.toLowerCase().includes(q)||(t.cat||"").toLowerCase().includes(q)||(t.project||"").toLowerCase().includes(q));}
    return l;
  },[doneTasks,filterType,search]);

  const handleSave = async (updated) => {
    if (updated._type==="work") {
      const next = applyEditWithRecur(work, updated, "todo");
      setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    } else {
      const next = applyEditWithRecur(personal, updated, "pending");
      setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
    setEditingTask(null);
  };

  const reopenTask = async (t) => {
    // un-complete: back to todo/pending + clear milestone timestamp
    const newStatus = t._type==="work" ? "todo" : "pending";
    const updated = {...t, status:newStatus, milestoneAt:""};
    if (t._type==="work") {
      const next = work.map(x=>x.id===t.id?updated:x);
      setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    } else {
      const next = personal.map(x=>x.id===t.id?updated:x);
      setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
  };

  const pill = (active,color)=>({
    padding:"5px 12px",borderRadius:20,border:"1px solid",fontSize:12,fontWeight:700,cursor:"pointer",
    borderColor:active?color:"var(--c-border)",background:active?color+"22":"transparent",
    color:active?color:"var(--c-text-muted)",whiteSpace:"nowrap",
  });

  const th = {padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",
    letterSpacing:"0.06em",borderBottom:"2px solid var(--c-border)",whiteSpace:"nowrap"};
  const td = {padding:"10px 12px",fontSize:12,color:"var(--c-text)",borderBottom:"1px solid var(--c-border)",verticalAlign:"middle"};

  return (
    <div style={{padding:"16px 0"}}>
      {editingTask&&<TaskDetailModal task={editingTask} onSave={handleSave} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{const copy=duplicateTask(t);
          if(copy._type==="work"){const n=[...work,copy];setWork(n);window.storage.set(pkG(W_KEY),JSON.stringify(n)).catch(()=>{});}
          else{const n=[...personal,copy];setPersonal(n);window.storage.set(pkG(P_KEY),JSON.stringify(n)).catch(()=>{});}
        }}/>}

      {/* Header */}
      <div style={{marginBottom:16,padding:"16px 20px",background:"linear-gradient(135deg,#22c55e15,#22c55e05)",
        border:"1px solid #22c55e33",borderRadius:12}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>
          ✅ {lang==="TH"?"งานที่เสร็จแล้ว":"Completed Tasks"}
        </div>
        <div style={{fontSize:12,color:"var(--c-text-muted)"}}>
          {doneTasks.length} {lang==="TH"?"งานเสร็จสิ้น · เรียงตามที่ทำล่าสุด":"completed · sorted by most recent"}
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
        <button onClick={()=>setFilterType("all")} style={pill(filterType==="all","#6366f1")}>All</button>
        <button onClick={()=>setFilterType("personal")} style={pill(filterType==="personal","#34d399")}>🏠 Personal</button>
        <button onClick={()=>setFilterType("work")} style={pill(filterType==="work","#818cf8")}>💼 Work</button>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search done tasks…"
          style={{flex:1,minWidth:160,padding:"6px 12px",borderRadius:8,border:"1px solid var(--c-border)",
            background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,outline:"none"}}/>
      </div>

      {/* Table */}
      {filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"50px 20px",color:"var(--c-text-muted)"}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)"}}>
            {doneTasks.length===0?(lang==="TH"?"ยังไม่มีงานที่เสร็จ":"No completed tasks yet"):(lang==="TH"?"ไม่พบในตัวกรองนี้":"None match filter")}
          </div>
        </div>
      ) : (
        <div style={{overflowX:"auto",border:"1px solid var(--c-border)",borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
            <thead>
              <tr style={{background:"var(--c-surface2)"}}>
                <th style={{...th,width:34}}></th>
                <th style={th}>TASK</th>
                <th style={th}>{lang==="TH"?"ประเภท":"TYPE"}</th>
                <th style={th}>{lang==="TH"?"หมวด/โปรเจกต์":"CATEGORY / PROJECT"}</th>
                <th style={th}>{lang==="TH"?"ทำเสร็จเมื่อ":"COMPLETED"}</th>
                <th style={{...th,width:80,textAlign:"center"}}>{lang==="TH"?"จัดการ":"ACTIONS"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t,i)=>{
                const isWork = t._type==="work";
                const cc = isWork?groupColor(t.project):groupColor(t.cat);
                const doneAt = t.milestoneAt ? new Date(t.milestoneAt) : (t.due?new Date(t.due.slice(0,10)+"T12:00:00"):null);
                return (
                  <tr key={`${t._type}-${t.id}`}
                    style={{background:i%2===0?"var(--c-surface)":"var(--c-surface2)",transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"var(--c-surface)":"var(--c-surface2)"}>
                    <td style={{...td,textAlign:"center"}}>
                      <span style={{color:"#22c55e",fontSize:14,fontWeight:900}}>✓</span>
                    </td>
                    <td style={{...td,cursor:"pointer",fontWeight:600,borderLeft:`3px solid ${cc}`}} onClick={()=>setEditingTask(t)}>
                      <span style={{textDecoration:"line-through",opacity:0.75}}>{t.title}</span>
                      {t.milestone!==false&&t.milestoneAt&&<span title="Milestone" style={{marginLeft:6}}>🏆</span>}
                    </td>
                    <td style={td}><span style={{fontSize:11}}>{isWork?"💼 Work":"🏠 Personal"}</span></td>
                    <td style={td}>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:cc+"22",color:cc,fontWeight:700}}>
                        {isWork?(t.project||"(No Project)"):(t.cat||"—")}
                      </span>
                    </td>
                    <td style={{...td,color:"var(--c-text-muted)",fontSize:11,whiteSpace:"nowrap"}}>
                      {doneAt ? doneAt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                      {t.milestoneAt&&<span style={{color:"#22c55e",marginLeft:5}}>{new Date(t.milestoneAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>}
                    </td>
                    <td style={{...td,textAlign:"center",whiteSpace:"nowrap"}}>
                      <button onClick={()=>setEditingTask(t)} title="Edit" style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>✏️</button>
                      <button onClick={()=>reopenTask(t)} title="Reopen (mark as not done)" style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,padding:"2px 4px"}}>↩️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏆 N4: MILESTONES TAB — graphic timeline of completed milestone tasks
// Horizontal timeline grouped by month, each dot = an achievement with timestamp
// ─────────────────────────────────────────────────────────────────────────────
function MilestonesTab({ personal, work, setPersonal, setWork, events=[], setEvents, eventTypes=DEFAULT_EVENT_TYPES, setEventTypes,
                        tlFontSize=12, tlFontFamily="system", tlTheme="classic", tlDetailsCfg=false, tlCompactCfg=false,
                        savedViewId="", onPatchConfig, lang="EN" }) {
  // ── N53: this tab is now a general TIMELINE, not just milestones ──
  const TL_FONTS = { system:"inherit", rounded:"'Trebuchet MS','Segoe UI',sans-serif", serif:"Georgia,'Times New Roman',serif", mono:"'Courier New',monospace", thai:"'Noto Sans Thai','Leelawadee UI',sans-serif" };
  const tFF = TL_FONTS[tlFontFamily] || "inherit";
  const tFS = Math.max(8, Math.min(20, Number(tlFontSize)||12));
  const [showFontCfg, setShowFontCfg] = useState(false);
  const [showThemeCfg, setShowThemeCfg] = useState(false); // N59
  const [fullScreen, setFullScreen] = useState(false);     // N59
  const [tlDetails, setTlDetails] = useState(tlDetailsCfg); // N62: 3-line bars
  const [tlCompact, setTlCompact] = useState(tlCompactCfg); // N88: dense mode
  // ── N63: drag a bar to move it, drag an end to resize it. Everything snaps to
  //    whole days. `drag` holds the live preview; nothing is written until mouseup.
  const [drag, setDrag] = useState(null);   // {id, mode:"move"|"start"|"end", at, end, dayMs, originX, origAt, origEnd}
  const [edits, setEdits] = useState({});           // N69: unsaved drag results
  const [undoStack, setUndoStack] = useState([]);   // N69
  const [redoStack, setRedoStack] = useState([]);   // N69
  const [confirmDiscard, setConfirmDiscard] = useState(false); // N69
  // N85: manual vertical placement. laneOv[itemId] = lane index the user chose by
  // dragging a banner up/down. Dates are locked during a vertical drag; the offset
  // is part of the view, so a saved view reopens with everything where you left it.
  const [laneOv, setLaneOv] = useState({});
  const dragRef = useRef(null);
  const DAY = 86400000;
  const snapDay = (ms)=>{ const d=new Date(ms); d.setHours(12,0,0,0); return d.getTime(); };
  // N66: "how far from today" in the same words everywhere (bar, card, tooltip)
  const countdownOf = (targetMs) => {
    // Items are anchored at NOON (drag snapping), so compare midnight-to-midnight
    // or "due tomorrow" reads as "in 2 days".
    const t0=new Date(); t0.setHours(0,0,0,0);
    const tgt=new Date(targetMs); tgt.setHours(0,0,0,0);
    const days=Math.round((tgt.getTime() - t0.getTime())/86400000);
    const abs=Math.abs(days), w=Math.floor(abs/7), d=abs%7;
    const parts=[]; if(w) parts.push(`${w}w`); if(d||!w) parts.push(`${d}d`);
    const short = days===0 ? "today" : days>0 ? `in ${parts.join(" ")}` : `${parts.join(" ")} ago`;
    const long  = days===0 ? "Today" : days>0 ? `in ${w?`${w} week${w!==1?"s":""} `:""}${d||!w?`${d} day${d!==1?"s":""}`:""}`.trim()
                                             : `${w?`${w} week${w!==1?"s":""} `:""}${d||!w?`${d} day${d!==1?"s":""}`:""} ago`.trim();
    const color = days===0 ? "#f59e0b" : days<0 ? "#ef4444" : "#16a34a";
    return {days, abs, short, long, color};
  };
  // N73: subtask progress, or null when the task has none
  const subsOf = (it) => {
    if(it.kind==="event") return null;
    const subs = it.raw?.subtasks;
    if(!Array.isArray(subs) || !subs.length) return null;
    const done = subs.filter(s=>s.done).length;
    return {subs, done, total:subs.length};
  };

  // ── N69: a drag never touches storage. It lands in `edits` (a draft), and the
  //    user decides when to keep it. Every step is undoable, because a stray drag
  //    silently rewriting a date is exactly the accident we are guarding against.
  const commitDrag = (d)=>{
    if(!d) return;
    const it = d.item;
    if (it.kind==="milestone") return;   // an achievement date is a historical fact
    // N85: a vertical drag only rearranges the lane — dates never change
    if (d.axis==="y"){
      if (d.lane===d.origLane) return;
      setLaneOv(prev=>({...prev, [it.id]: d.lane}));
      return;
    }
    if (d.at===d.origAt && d.end===d.origEnd) return;  // nothing actually moved
    const key = it.kind==="event" ? `e:${it.raw.id}:${it.winIdx-1}` : `t:${it._type}:${it.raw.id}`;
    const entry = {
      key, kind:it.kind, winIdx:it.winIdx, _type:it._type, id:it.raw.id, title:it.title,
      span:it.span, at:d.at, end:d.end, origAt:d.origAt, origEnd:d.origEnd,
    };
    setEdits(prev=>{
      const next = {...prev, [key]: {...(prev[key]||entry), ...entry,
        // keep the ORIGINAL value from the first time this item was touched
        origAt: prev[key]?.origAt ?? d.origAt, origEnd: prev[key]?.origEnd ?? d.origEnd}};
      setUndoStack(u=>[...u.slice(-49), prev]);
      setRedoStack([]);
      return next;
    });
  };

  // apply the draft over the stored value so the chart shows what you dragged
  const editFor = (it)=>{
    const key = it.kind==="event" ? `e:${it.raw.id}:${it.winIdx-1}` : `t:${it._type}:${it.raw.id}`;
    return edits[key] || null;
  };

  const discardEdits = ()=>{
    setUndoStack(u=>[...u.slice(-49), edits]);
    setRedoStack([]);
    setEdits({});
  };
  const undoEdit = ()=>{
    setUndoStack(u=>{
      if(!u.length) return u;
      setRedoStack(r=>[...r.slice(-49), edits]);
      setEdits(u[u.length-1]);
      return u.slice(0,-1);
    });
  };
  const redoEdit = ()=>{
    setRedoStack(r=>{
      if(!r.length) return r;
      setUndoStack(u=>[...u.slice(-49), edits]);
      setEdits(r[r.length-1]);
      return r.slice(0,-1);
    });
  };

  // N69: the only place a dragged date is written to disk
  const saveEdits = async ()=>{
    const list = Object.values(edits);
    if(!list.length) return;
    let nextPersonal = personal, nextWork = work, nextEvents = events;
    list.forEach(e=>{
      const startIso = fmtLocal(new Date(e.at));
      const endIso   = fmtLocal(new Date(e.end));
      if(e.kind==="event"){
        nextEvents = nextEvents.map(ev=>{
          if(ev.id!==e.id) return ev;
          const wins = eventWindows(ev).map((w,i)=> i===e.winIdx-1 ? {...w, start:startIso, end:endIso} : w);
          return {...ev, windows:wins, start:wins[0].start, end:wins[0].end};
        });
      } else if(e._type==="work"){
        nextWork = nextWork.map(t=>t.id!==e.id ? t
          : (e.span ? {...t, startDate:startIso, due:endIso} : {...t, due:endIso, startDate:t.startDate?endIso:t.startDate}));
      } else {
        nextPersonal = nextPersonal.map(t=>t.id!==e.id ? t
          : (e.span ? {...t, startDate:startIso, due:endIso} : {...t, due:endIso, startDate:t.startDate?endIso:t.startDate}));
      }
    });
    if(nextWork!==work){ setWork(nextWork); try{await window.storage.set(pkG(W_KEY),JSON.stringify(nextWork));}catch{} }
    if(nextPersonal!==personal){ setPersonal(nextPersonal); try{await window.storage.set(pkG(P_KEY),JSON.stringify(nextPersonal));}catch{} }
    if(nextEvents!==events && setEvents){ setEvents(nextEvents); }
    logAct("edit", `Saved ${list.length} rescheduled item${list.length!==1?"s":""}`, "timeline", "from Timeline");
    try{ window.__toast && window.__toast(`✅ Saved ${list.length} change${list.length!==1?"s":""}`); }catch{}
    setEdits({}); setUndoStack([]); setRedoStack([]);
  };

  // N69: Ctrl+Z / Ctrl+Shift+Z, and a browser warning if you try to leave dirty
  const dirtyCount = Object.keys(edits).length;
  useEffect(()=>{
    const onKey=(e)=>{
      const mod = e.ctrlKey || e.metaKey;
      if(!mod || e.key.toLowerCase()!=="z") return;
      const tag=(e.target?.tagName||"").toLowerCase();
      if(tag==="input"||tag==="textarea"||e.target?.isContentEditable) return;
      e.preventDefault();
      if(e.shiftKey) redoEdit(); else undoEdit();
    };
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  });
  useEffect(()=>{
    if(!dirtyCount) return;
    const warn=(e)=>{ e.preventDefault(); e.returnValue=""; };
    window.addEventListener("beforeunload", warn);
    return ()=>window.removeEventListener("beforeunload", warn);
  },[dirtyCount]);

  useEffect(()=>{
    if(!drag) return;
    const onMove = (e)=>{
      const d = dragRef.current; if(!d) return;
      const dx = e.clientX - d.originX, dy = e.clientY - d.originY;
      // N85: the FIRST dominant direction locks the axis for this whole drag —
      // vertical rearranges lanes (dates untouched), horizontal moves dates.
      let axis = d.axis;
      if(!axis){
        if(Math.abs(dx)<4 && Math.abs(dy)<4){ return; }
        axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      }
      let next;
      if(axis==="y"){
        const dLanes = Math.round(dy / Math.max(24, d.laneH));
        next = {...d, axis, lane: Math.max(0, d.origLane + dLanes)};
      } else {
        const deltaDays = Math.round(dx / d.pxPerDay);
        let at=d.origAt, end=d.origEnd;
        if(d.mode==="move"){ at = d.origAt + deltaDays*DAY; end = d.origEnd + deltaDays*DAY; }
        else if(d.mode==="start"){ at = Math.min(d.origAt + deltaDays*DAY, d.origEnd); }
        else { end = Math.max(d.origEnd + deltaDays*DAY, d.origAt); }
        next = {...d, axis, at:snapDay(at), end:snapDay(end)};
      }
      dragRef.current = next; setDrag(next);
    };
    const onUp = ()=>{ commitDrag(dragRef.current); dragRef.current=null; setDrag(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, {once:true});
    return ()=>{ window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  },[drag?.id, drag?.mode]);

  const beginDrag = (e, it, mode, pxPerDay, laneH=48)=>{
    if(it.kind==="milestone") return;      // achievements are historical facts
    if(it.kind==="event" && !setEvents) return;
    e.stopPropagation(); e.preventDefault();
    const d = { id:it.id, item:it, mode, pxPerDay, laneH,
                originX:e.clientX, originY:e.clientY,
                axis: mode==="move" ? null : "x",   // N85: body drags pick an axis on first movement
                origAt:it.at, origEnd:it.span?it.end:it.at,
                at:it.at, end:it.span?it.end:it.at,
                origLane:it._lane, lane:it._lane };
    dragRef.current = d; setDrag(d);
  };
  const TH = TL_THEMES[tlTheme] || TL_THEMES.classic;      // N59
  // what to plot
  const [showMilestones, setShowMilestones] = useState(true);
  const [showTasks, setShowTasks]           = useState(false);
  const [showEvents, setShowEvents]         = useState(false);
  // task filters (mirror the Gantt page)
  const [tStatus, setTStatus]   = useState("active");   // active | all | done
  const [tSource, setTSource]   = useState("all");      // all | personal | work
  const [tGroups, setTGroups]   = useState([]);         // [] = every category/project
  // event filters
  const [evTypes, setEvTypes]   = useState([]);         // [] = every type
  // hover tooltip
  const [hoverItem, setHoverItem] = useState(null);
  const [hoverHolT, setHoverHolT] = useState(null); // N68: Thai holiday tooltip
  const [hoverAxis, setHoverAxis] = useState(null); // N71: date under the cursor
  const [tlMedia, setTlMedia] = useState(null); // N89: attachment popup
  // N81: the chart fills the page instead of living in a scrolling box, so we
  // measure the width we actually have and let the labels adapt to it.
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(1100);
  useEffect(()=>{
    const el = wrapRef.current; if(!el || typeof ResizeObserver==="undefined") return;
    const ro = new ResizeObserver(es=>{ const w=es[0]?.contentRect?.width; if(w) setWrapW(w); });
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  // N58: events are editable straight from the timeline, same as Gantt/Calendar
  const [editingEvent, setEditingEvent] = useState(null);
  const saveEventT = (ev)=>{
    if(!setEvents) return;
    const existed = events.some(e=>e.id===ev.id);
    logAct(existed?"edit":"create", `${existed?"Edited":"Added"} event: ${ev.title}`, "timeline");
    setEvents(existed ? events.map(e=>e.id===ev.id?ev:e) : [...events, ev]);
    setEditingEvent(null);
  };
  const deleteEventT = (id)=>{
    if(!setEvents) return;
    const ev=events.find(e=>e.id===id);
    logAct("delete", `Deleted event: ${ev?.title||id}`, "timeline");
    setEvents(events.filter(e=>e.id!==id));
    setEditingEvent(null);
  };
  const newEvent = ()=>setEditingEvent({ id:newId(), title:"",
    start:fmtLocal(TODAY), end:fmtLocal(TODAY),
    typeId:(eventTypes[0]?.id)||"personal", color:(eventTypes[0]?.color)||"#8b5cf6", note:"" });
  const newTask = (kind)=>setEditingTask({
    id:newId(), title:"", description:"",
    due:fmtLocal(TODAY), startDate:"", priority:"Medium",
    cat: kind==="work"?"Other":"Home", project: kind==="work"?"":undefined,
    status: kind==="work"?"todo":"pending",
    location:"", attachments:[], pinned:false, milestone:true, milestoneAt:"",
    recur:"", isRecurring:false, subtasks:[], _type:kind, _isNew:true,
  });
  // N56 fix: declared BEFORE tlItems/captureTlView read them (temporal dead zone).
  const [editingTask, setEditingTask] = useState(null);
  const [filterType, setFilterType] = useState("all"); // all|personal|work
  const [filterYear, setFilterYear] = useState("all");
  const [mView, setMView] = useState("gantt"); // N36: "gantt" timeline | "list"
  const [mRange, setMRange] = useState("auto"); // N37: auto | 3m | 6m | 1y | 2y | custom
  const [mFrom, setMFrom] = useState("");       // N37: custom range (ISO date)
  const [mTo, setMTo] = useState("");
  const [mSeg, setMSeg] = useState("1"); // N41: timeline lines — "1".."5" | month | quarter | year

  // N55: saved views for this page
  const [tlViews, setTlViews] = useSavedViews(TL_VIEWS_KEY);
  const [activeViewId, setActiveViewId] = useState(null);

  // ── N53: build the item list from the three sources + their filters ──
  // N72: Personal is organised by category, Work by project. Mixing the two made
  // "Home" and "Tax" appear while the Work source was selected.
  const tlGroupLabels = useMemo(()=>{
    const s=new Set();
    if(tSource!=="work")     personal.forEach(t=>s.add(t.cat||"Other"));
    if(tSource!=="personal") work.forEach(t=>s.add(t.project||"(No Project)"));
    return [...s].sort();
  },[personal,work,tSource]);

  const tlItems = useMemo(()=>{
    const out=[];
    const passStatus=(t)=> tStatus==="all" ? true : tStatus==="done" ? t.status==="done" : t.status!=="done";
    const passSource=(k)=> tSource==="all" || tSource===k;
    const grp=(t,k)=> k==="work" ? (t.project||"(No Project)") : (t.cat||"Other");

    if (showMilestones) {
      [...personal.map(t=>({...t,_type:"personal"})), ...work.map(t=>({...t,_type:"work"}))]
        .filter(t=>t.status==="done" && t.milestone!==false && t.milestoneAt)
        // N55: these two chips used to be ignored entirely — now they filter for real
        .filter(t=> filterType==="all" || t._type===filterType)
        .filter(t=> filterYear==="all" || new Date(t.milestoneAt).getFullYear()===+filterYear)
        .forEach(t=>out.push({
          kind:"milestone", id:`m-${t._type}-${t.id}`, raw:t, _type:t._type,
          title:t.title, at:new Date(t.milestoneAt).getTime(), span:false,
          color: t.milestonePriority ? "#f59e0b" : (t._type==="work"?groupColor(t.project):groupColor(t.cat)),
          prio: !!t.milestonePriority,
        }));
    }
    if (showTasks) {
      [["personal",personal],["work",work]].forEach(([k,list])=>{
        if(!passSource(k)) return;
        list.forEach(t=>{
          if(!passStatus(t)) return;
          const g=grp(t,k);
          if(tGroups.length && !tGroups.includes(g)) return;
          if(!t.due) return;
          const due=parseDateLocal(t.due).getTime();
          const st = t.startDate ? parseDateLocal(t.startDate).getTime() : null;
          const isSpan = st!==null && st < due;
          // N76: still open, and its due date has already passed
          const t0=new Date(); t0.setHours(0,0,0,0);
          const overdue = t.status!=="done" && due < t0.getTime();
          out.push({
            kind:"task", id:`t-${k}-${t.id}`, raw:t, _type:k, title:t.title,
            at: isSpan?st:due, end: isSpan?due:due, span:isSpan, group:g,
            color: k==="work"?groupColor(t.project):groupColor(t.cat),
            prio: t.priority==="High", overdue,
            pinned: !!t.pinned, high: t.priority==="High",   // N78
            attachments: Array.isArray(t.attachments)?t.attachments:[],  // N89
          });
        });
      });
    }
    if (showEvents) {
      events.forEach(e=>{
        if(evTypes.length && !evTypes.includes(e.typeId)) return;
        eventWindows(e).forEach((w,wi)=>{
          const s=parseDateLocal(w.start).getTime();
          const en=parseDateLocal(w.end||w.start).getTime();
          out.push({
            kind:"event", id:`e-${e.id}-${wi}`, raw:e, win:w, winIdx:wi+1, winTotal:eventWindows(e).length,
            title:e.title, at:s, end:Math.max(en,s), span:en>s, color:e.color||"#8b5cf6",
            attachments: Array.isArray(e.attachments)?e.attachments:[],  // N89
            location: e.location,  // N97
          });
        });
      });
    }
    return out.sort((a,b)=>a.at-b.at);
  },[showMilestones,showTasks,showEvents,personal,work,events,tStatus,tSource,tGroups,evTypes,filterType,filterYear]);

  // ── N53: lane packing — items that don't overlap share a lane, so dense
  //    timelines stay compact and readable instead of one row per item.
  // N55: snapshot / restore every filter + display option on this page
  const captureTlView = () => ({
    laneOv: {...laneOv},
    showMilestones, showTasks, showEvents,
    tStatus, tSource, tGroups:[...tGroups], evTypes:[...evTypes],
    filterType, filterYear, mRange, mFrom, mTo, mSeg, mView,
  });
  const applyTlView = (v) => {
    const s=v.state||{};
    if("showMilestones" in s) setShowMilestones(!!s.showMilestones);
    if("showTasks" in s)      setShowTasks(!!s.showTasks);
    if("showEvents" in s)     setShowEvents(!!s.showEvents);
    if(s.tStatus)  setTStatus(s.tStatus);
    if(s.tSource)  setTSource(s.tSource);
    setTGroups(Array.isArray(s.tGroups)?s.tGroups:[]);
    setEvTypes(Array.isArray(s.evTypes)?s.evTypes:[]);
    if(s.filterType) setFilterType(s.filterType);
    if(s.filterYear) setFilterYear(s.filterYear);
    if(s.mRange) setMRange(s.mRange);
    if("mFrom" in s) setMFrom(s.mFrom||"");
    if("mTo" in s)   setMTo(s.mTo||"");
    if(s.mSeg)   setMSeg(s.mSeg);
    if(s.mView)  setMView(s.mView);
    setLaneOv(s.laneOv && typeof s.laneOv==="object" ? s.laneOv : {});   // N85
    setActiveViewId(v.id);
    onPatchConfig&&onPatchConfig({timelineActiveView:v.id}); // N59: sticky selection
  };
  const saveTlView = (name) => {
    const v={ id:"tv"+Date.now(), name, state:captureTlView() };
    setTlViews([...tlViews, v]); setActiveViewId(v.id);
    onPatchConfig&&onPatchConfig({timelineActiveView:v.id});
  };
  // N59: overwrite the view you are already on
  const updateTlView = (id) => {
    setTlViews(tlViews.map(v=>v.id===id?{...v,state:captureTlView()}:v));
  };
  const deleteTlView = (id) => {
    setTlViews(tlViews.filter(v=>v.id!==id));
    if(activeViewId===id){ setActiveViewId(null); onPatchConfig&&onPatchConfig({timelineActiveView:""}); }
  };
  // N59: re-apply the last used view when the page mounts (once views have loaded)
  const tlRestored = useRef(false);
  useEffect(()=>{
    if(tlRestored.current || !tlViews.length || !savedViewId) return;
    const v = tlViews.find(x=>x.id===savedViewId);
    if(v){ tlRestored.current = true; applyTlView(v); }
  },[tlViews, savedViewId]);

  // N77: a point still renders a ~230px card to its right, and a bar renders its
  // title inside. Pack against the LABEL footprint, not the bare date, or cards
  // land on top of each other (which is exactly what happened).
  const packLanes = (items, spanLo, spanHi, chartPx=800) => {
    const lanes=[];                       // lanes[i] = right-most % this lane reaches
    const width=Math.max(1,spanHi-spanLo);
    const pctOf=(t)=>((t-spanLo)/width)*100;
    const pxToPct = (px)=> (px / Math.max(chartPx,1)) * 100;
    const GAP = pxToPct(tlCompact ? 6 : 10);  // breathing room between neighbours
    const CARD_PX = 252;                  // point card: 240px maxWidth + margin — the
                                          // old 230 under-reserved and cards touched
    const barLabelPx = (it)=> Math.min(300, 40 + (it.title||"").length * (tFS*0.58));
    // earliest first — greedily drop each item into the first lane where it fits
    const sorted=[...items].sort((a,b)=>a.at-b.at);
    const out = sorted.map(it=>{
      const l = pctOf(it.at);
      const r = it.span ? Math.max(pctOf(it.end), l + pxToPct(16)) : l;
      // how far right does this item's INK actually reach?
      const inkRight = it.span
        ? Math.max(r, l + pxToPct(barLabelPx(it)))
        : l + pxToPct(CARD_PX);
      let lane = lanes.findIndex(edge => edge + GAP <= l);
      if (lane < 0) { lanes.push(inkRight); lane = lanes.length-1; }
      else lanes[lane] = inkRight;
      return {...it, _left:l, _right:r, _lane:lane};
    });
    // keep the caller's original ordering stable for React keys
    const byId = new Map(out.map(o=>[o.id,o]));
    // N85: apply the user's manual lane choices on top of the automatic packing
    return items.map(i=>{
      const o = byId.get(i.id);
      return laneOv[i.id]!=null ? {...o, _lane:laneOv[i.id], _manual:true} : o;
    });
  };


  // Collect all completed milestones (milestone flag on + done + has timestamp)
  const milestones = useMemo(()=>{
    const all = [
      ...personal.map(t=>({...t,_type:"personal"})),
      ...work.map(t=>({...t,_type:"work"})),
    ].filter(t=>t.status==="done" && t.milestone!==false && t.milestoneAt);
    return all.sort((a,b)=>new Date(b.milestoneAt)-new Date(a.milestoneAt)); // newest first
  },[personal,work]);

  const years = useMemo(()=>{
    const ys = new Set(milestones.map(m=>new Date(m.milestoneAt).getFullYear()));
    return [...ys].sort((a,b)=>b-a);
  },[milestones]);

  const filtered = useMemo(()=>{
    let l = milestones;
    if (filterType!=="all") l = l.filter(m=>m._type===filterType);
    if (filterYear!=="all") l = l.filter(m=>new Date(m.milestoneAt).getFullYear()===+filterYear);
    return l;
  },[milestones,filterType,filterYear]);

  // Group by "Month Year" for timeline sections
  const grouped = useMemo(()=>{
    const groups = {};
    filtered.forEach(m=>{
      const d = new Date(m.milestoneAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
      const label = d.toLocaleDateString("en-GB",{month:"long",year:"numeric"});
      if (!groups[key]) groups[key]={label,items:[]};
      groups[key].items.push(m);
    });
    return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,v])=>v);
  },[filtered]);

  const handleSave = async (updated) => {
    const isNew = updated._isNew;
    const clean = {...updated}; delete clean._isNew;
    if (updated._type==="work") {
      const next = isNew ? [...work, clean] : applyEditWithRecur(work, clean, "todo");
      setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    } else {
      const next = isNew ? [...personal, clean] : applyEditWithRecur(personal, clean, "pending");
      setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
    logAct(isNew?"create":"edit", `${isNew?"Added":"Edited"}: ${clean.title}`, updated._type, "from Timeline");
    setEditingTask(null);
  };

  const pill = (active,color)=>({
    padding:"5px 12px",borderRadius:20,border:"1px solid",fontSize:12,fontWeight:700,cursor:"pointer",
    borderColor:active?color:"var(--c-border)",background:active?color+"22":"transparent",
    color:active?color:"var(--c-text-muted)",whiteSpace:"nowrap",
  });

  return (
    <div style={fullScreen
      ? {position:"fixed",inset:0,zIndex:5000,background:"var(--c-bg)",overflowY:"auto",padding:"18px 22px"}
      : {padding:"16px 0"}}>  {/* N59: full-screen wrapper (padding preserved in normal mode) */}
      {confirmDiscard && <ConfirmDialog
        title={`Discard ${Object.keys(edits).length} unsaved change${Object.keys(edits).length!==1?"s":""}?`}
        body="Every item you dragged goes back to its stored dates. Nothing was written to disk yet."
        confirmLabel="Discard"
        onConfirm={()=>{ discardEdits(); setConfirmDiscard(false); }}
        onCancel={()=>setConfirmDiscard(false)}/>}
      {editingEvent&&<EventModal event={editingEvent} onSave={saveEventT} onDelete={deleteEventT}
        onClose={()=>setEditingEvent(null)} eventTypes={eventTypes} setEventTypes={setEventTypes}/>}
      {editingTask&&<TaskDetailModal task={editingTask} onSave={handleSave} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{const copy=duplicateTask(t);
          if(copy._type==="work"){const n=[...work,copy];setWork(n);window.storage.set(pkG(W_KEY),JSON.stringify(n)).catch(()=>{});}
          else{const n=[...personal,copy];setPersonal(n);window.storage.set(pkG(P_KEY),JSON.stringify(n)).catch(()=>{});}
        }}/>}

      {/* Header */}
      <div style={{marginBottom:18,padding:"16px 20px",background:"linear-gradient(135deg,#f59e0b18,#f59e0b08)",
        border:"1px solid #f59e0b33",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>
            📈 {lang==="TH"?"ไทม์ไลน์":"Timeline"}
          </div>
          <div style={{fontSize:12,color:"var(--c-text-muted)"}}>
            {lang==="TH"?"หมุดหมาย · งาน · อีเวนต์ บนแกนเวลาเดียวกัน":"Milestones, tasks and events on one time axis"}
          </div>
        </div>
        {/* N58: add any kind of item straight from the timeline */}
        <div style={{display:"flex",gap:7,flexWrap:"wrap",flexShrink:0}}>
          <button onClick={()=>newTask("personal")}
            style={{padding:"8px 13px",borderRadius:9,border:"1.5px solid #34d39955",background:"#34d39915",color:"#059669",
              fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ 🏠 Personal</button>
          <button onClick={()=>newTask("work")}
            style={{padding:"8px 13px",borderRadius:9,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4f46e5",
              fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ 💼 Work</button>
          {setEvents&&<button onClick={newEvent}
            style={{padding:"8px 13px",borderRadius:9,border:"1.5px solid #8b5cf655",background:"#8b5cf615",color:"#7c3aed",
              fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>+ 📅 Event</button>}
          <button onClick={()=>setEditingTask({
              id:newId(),
              title:"", description:"", due:fmtLocal(TODAY), startDate:"", priority:"Medium",
              cat:"Activity", status:"done", milestone:true, milestoneAt:new Date().toISOString(),
              location:"", attachments:[], pinned:false, recur:"", isRecurring:false,
              _type:"personal", _isNew:true,
            })}
            style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#f59e0b",color:"#fff",
              fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
            + ⭐ {lang==="TH"?"หมุดหมาย":"Milestone"}
          </button>
        </div>
      </div>

      {/* N55: milestone-scoped filters (they only affect the ⭐ Milestones source) */}
      {milestones.length>0 && showMilestones && mView==="gantt" && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10,alignItems:"center",
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>⭐ MILESTONES</span>
          <button onClick={()=>setFilterType("all")} style={pill(filterType==="all","#6366f1")}>All</button>
          <button onClick={()=>setFilterType("personal")} style={pill(filterType==="personal","#34d399")}>🏠 Personal</button>
          <button onClick={()=>setFilterType("work")} style={pill(filterType==="work","#818cf8")}>💼 Work</button>
          <div style={{width:1,height:20,background:"var(--c-border)",margin:"0 4px"}}/>
          <button onClick={()=>setFilterYear("all")} style={pill(filterYear==="all","#f59e0b")}>All years</button>
          {years.map(y=><button key={y} onClick={()=>setFilterYear(String(y))} style={pill(filterYear===String(y),"#f59e0b")}>{y}</button>)}
        </div>
      )}

      {/* view mode toggle lives with the page header now */}
      {mView!=="__never__" && (
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
            <button onClick={()=>setMView("gantt")} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:mView==="gantt"?"#f59e0b":"transparent",color:mView==="gantt"?"#fff":"var(--c-text-muted)"}}>📊 Timeline</button>
            <button onClick={()=>setMView("list")} style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",background:mView==="list"?"#f59e0b":"transparent",color:mView==="list"?"#fff":"var(--c-text-muted)"}}>☰ List</button>
          </div>
        </div>
      )}

      {/* N55: saved views for the Timeline page */}
      <SavedViewBar views={tlViews} activeId={activeViewId} label="VIEW"
        onApply={applyTlView} onSave={saveTlView} onUpdate={updateTlView} onDelete={deleteTlView}
        isDirty={(()=>{ const a=tlViews.find(v=>v.id===activeViewId); return a ? JSON.stringify(captureTlView())!==JSON.stringify(a.state) : false; })()}
        onDiscard={applyTlView}/>

      {/* N69: nothing you drag is written until you say so */}
      {(Object.keys(edits).length>0 || undoStack.length>0 || redoStack.length>0) && (
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10,
          background:"#f59e0b12",border:"1.5px solid #f59e0b66",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:11.5,fontWeight:800,color:"#b45309"}}>
            {Object.keys(edits).length>0
              ? `● ${Object.keys(edits).length} unsaved change${Object.keys(edits).length!==1?"s":""}`
              : "No unsaved changes"}
          </span>
          <span style={{fontSize:10.5,color:"var(--c-text-muted)"}}>Dragging never saves on its own.</span>
          <div style={{flex:1}}/>
          <button onClick={undoEdit} disabled={!undoStack.length} title="Undo (Ctrl+Z)"
            style={{padding:"5px 11px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",
              color:undoStack.length?"var(--c-text)":"var(--c-text-muted)",fontSize:12,fontWeight:800,
              cursor:undoStack.length?"pointer":"not-allowed",opacity:undoStack.length?1:0.5}}>↶ Undo</button>
          <button onClick={redoEdit} disabled={!redoStack.length} title="Redo (Ctrl+Shift+Z)"
            style={{padding:"5px 11px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",
              color:redoStack.length?"var(--c-text)":"var(--c-text-muted)",fontSize:12,fontWeight:800,
              cursor:redoStack.length?"pointer":"not-allowed",opacity:redoStack.length?1:0.5}}>↷ Redo</button>
          <button onClick={()=>setConfirmDiscard(true)} disabled={!Object.keys(edits).length}
            style={{padding:"5px 11px",borderRadius:8,border:"1px solid var(--c-border)",background:"transparent",
              color:"var(--c-text-muted)",fontSize:11.5,fontWeight:700,
              cursor:Object.keys(edits).length?"pointer":"not-allowed",opacity:Object.keys(edits).length?1:0.5}}>↺ Discard</button>
          <button onClick={saveEdits} disabled={!Object.keys(edits).length}
            style={{padding:"6px 15px",borderRadius:8,border:"none",background:Object.keys(edits).length?"#166534":"var(--c-border)",
              color:"#fff",fontSize:12,fontWeight:800,cursor:Object.keys(edits).length?"pointer":"not-allowed"}}>
            💾 Save changes
          </button>
        </div>
      )}

      {/* ── N53: SOURCE + FILTER CONTROLS ── */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10,
        background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",marginRight:2}}>SHOW ON TIMELINE</span>
        {[["m",showMilestones,setShowMilestones,"⭐ Milestones","#f59e0b"],
          ["t",showTasks,setShowTasks,"📋 All Tasks","#6366f1"],
          ["e",showEvents,setShowEvents,"📅 All Events","#8b5cf6"]].map(([k,on,setter,label,col])=>(
          <button key={k} onClick={()=>setter(v=>!v)}
            style={{padding:"5px 13px",borderRadius:18,fontSize:11.5,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",
              border:on?`1.5px solid ${col}`:"1px solid var(--c-border)",
              background:on?col+"22":"var(--c-surface)",color:on?col:"var(--c-text-muted)"}}>
            {on?"✓ ":""}{label}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* N59: theme picker for this page */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowThemeCfg(s=>!s)} title="Change how this dashboard looks"
            style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showThemeCfg?"var(--c-accent)":"var(--c-border)"}`,
              background:showThemeCfg?"var(--c-accent)22":"var(--c-surface)",color:showThemeCfg?"var(--c-accent)":"var(--c-text-muted)",
              fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>🎨 Theme</button>
          {showThemeCfg && (
            <div style={{position:"absolute",top:"115%",right:0,zIndex:600,background:"var(--c-card2)",border:"1px solid var(--c-border)",
              borderRadius:12,padding:14,width:230,boxShadow:"0 16px 40px rgba(0,0,0,.3)"}}>
              <div style={{fontSize:12,fontWeight:800,color:"var(--c-text)",marginBottom:10}}>🎨 Timeline theme</div>
              <div style={{display:"grid",gap:5}}>
                {Object.entries(TL_THEMES).map(([k,t])=>(
                  <button key={k} onClick={()=>onPatchConfig&&onPatchConfig({timelineTheme:k})}
                    style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",cursor:"pointer",textAlign:"left",
                      borderRadius:Math.min(10,t.radius),
                      border:tlTheme===k?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:tlTheme===k?"var(--c-accent)18":"var(--c-surface)"}}>
                    <span style={{width:22,height:8,borderRadius:t.barShape==="pill"?99:t.barShape==="round"?3:0,
                      background:t.barFill==="outline"?"transparent":t.badge,border:`1.5px solid ${t.badge}`,flexShrink:0}}/>
                    <span style={{minWidth:0}}>
                      <span style={{display:"block",fontSize:12,fontWeight:700,color:tlTheme===k?"var(--c-accent)":"var(--c-text)"}}>{t.name}</span>
                      <span style={{display:"block",fontSize:9,color:"var(--c-text-muted)"}}>{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:8,lineHeight:1.45}}>
                Item colours always follow their category / event type — only the frame changes.
              </div>
            </div>
          )}
        </div>
        {/* N62: 1-line vs 3-line bars, same idea as the Gantt page */}
        <button onClick={()=>{const v=!tlDetails;setTlDetails(v);onPatchConfig&&onPatchConfig({timelineDetails:v});}}
          title="Show dates and description inside each bar"
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${tlDetails?"#22c55e":"var(--c-border)"}`,
            background:tlDetails?"#22c55e22":"var(--c-surface)",color:tlDetails?"#16a34a":"var(--c-text-muted)",
            fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>≡ Details</button>

        {/* N88: dense overview ↔ comfortable spacing */}
        <button onClick={()=>{const v=!tlCompact;setTlCompact(v);onPatchConfig&&onPatchConfig({timelineCompact:v});}}
          title={tlCompact?"Back to normal spacing":"Squeeze lanes for a denser overview"}
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${tlCompact?"#8b5cf6":"var(--c-border)"}`,
            background:tlCompact?"#8b5cf622":"var(--c-surface)",color:tlCompact?"#7c3aed":"var(--c-text-muted)",
            fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>
          {tlCompact?"▧ Expand":"▤ Compact"}
        </button>

        {/* N59: presentation / full-screen mode */}
        <button onClick={()=>setFullScreen(f=>!f)} title={fullScreen?"Exit full screen":"Full screen"}
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${fullScreen?"#0ea5e9":"var(--c-border)"}`,
            background:fullScreen?"#0ea5e922":"var(--c-surface)",color:fullScreen?"#0284c7":"var(--c-text-muted)",
            fontSize:11,fontWeight:700,cursor:"pointer",marginRight:6}}>
          {fullScreen?"✕ Exit full screen":"⛶ Full screen"}
        </button>
        {/* N53: font settings for this page */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowFontCfg(s=>!s)} title="Adjust the timeline font"
            style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${showFontCfg?"var(--c-accent)":"var(--c-border)"}`,
              background:showFontCfg?"var(--c-accent)22":"var(--c-surface)",color:showFontCfg?"var(--c-accent)":"var(--c-text-muted)",
              fontSize:11,fontWeight:700,cursor:"pointer"}}>🔤 Font</button>
          {showFontCfg && (
            <div style={{position:"absolute",top:"115%",right:0,zIndex:600,background:"var(--c-card2)",border:"1px solid var(--c-border)",
              borderRadius:12,padding:14,width:260,boxShadow:"0 16px 40px rgba(0,0,0,.3)"}}>
              <div style={{fontSize:12,fontWeight:800,color:"var(--c-text)",marginBottom:10}}>🔤 Timeline Font</div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Size: {tFS}px</div>
              <input type="range" min={8} max={20} value={tFS}
                onChange={e=>onPatchConfig&&onPatchConfig({timelineFontSize:Number(e.target.value)})}
                style={{width:"100%",marginBottom:6,accentColor:"var(--c-accent)"}}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {[10,12,14,16,18].map(s=>(
                  <button key={s} onClick={()=>onPatchConfig&&onPatchConfig({timelineFontSize:s})}
                    style={{padding:"3px 9px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                      border:tFS===s?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:tFS===s?"var(--c-accent)18":"var(--c-surface)",color:tFS===s?"var(--c-accent)":"var(--c-text-muted)"}}>{s}</button>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Font family</div>
              <div style={{display:"grid",gap:4}}>
                {[["system","Default (System)"],["rounded","Rounded"],["serif","Serif"],["mono","Monospace"],["thai","Thai (Noto Sans Thai)"]].map(([v,l])=>(
                  <button key={v} onClick={()=>onPatchConfig&&onPatchConfig({timelineFontFamily:v})}
                    style={{padding:"7px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",fontFamily:TL_FONTS[v],
                      border:tlFontFamily===v?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:tlFontFamily===v?"var(--c-accent)18":"var(--c-surface)",
                      color:tlFontFamily===v?"var(--c-accent)":"var(--c-text)"}}>{l}</button>
                ))}
              </div>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:8}}>💾 Saved automatically for this page</div>
            </div>
          )}
        </div>
      </div>

      {/* N53: task filters (mirror the Gantt page) */}
      {showTasks && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10,
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>📋 TASKS</span>
          <div style={{display:"flex",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:8,padding:2,gap:1}}>
            {[["active","Active"],["all","All"],["done","Done"]].map(([v,l])=>(
              <button key={v} onClick={()=>setTStatus(v)} style={{padding:"4px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",
                background:tStatus===v?"#6366f1":"transparent",color:tStatus===v?"#fff":"var(--c-text-muted)"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:8,padding:2,gap:1}}>
            {[["all","All"],["personal","🏠 Personal"],["work","💼 Work"]].map(([v,l])=>(
              // N72: switching source invalidates the chip selection — clear it, or we
              // would silently filter on a name that is no longer even visible.
              <button key={v} onClick={()=>{setTSource(v);setTGroups([]);}} style={{padding:"4px 10px",borderRadius:6,border:"none",fontSize:11,fontWeight:700,cursor:"pointer",
                background:tSource===v?"#6366f1":"transparent",color:tSource===v?"#fff":"var(--c-text-muted)"}}>{l}</button>
            ))}
          </div>
          <div style={{width:1,height:18,background:"var(--c-border)",margin:"0 3px"}}/>
          <button onClick={()=>setTGroups([])}
            style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
              border:tGroups.length===0?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
              background:tGroups.length===0?"var(--c-accent)22":"var(--c-surface)",
              color:tGroups.length===0?"var(--c-accent)":"var(--c-text-muted)"}}>All categories</button>
          {tlGroupLabels.map(g=>{
            const on=tGroups.includes(g);
            const col=groupColor(g);
            return (
              <button key={g} onClick={()=>setTGroups(a=>a.includes(g)?a.filter(x=>x!==g):[...a,g])}
                style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:16,cursor:"pointer",
                  border:on?`1.5px solid ${col}`:"1px solid var(--c-border)",background:on?col+"22":"var(--c-surface)",
                  fontSize:11,fontWeight:700,color:on?col:"var(--c-text-muted)",whiteSpace:"nowrap"}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:col}}/>{g}
              </button>
            );
          })}
          {tGroups.length>0&&<button onClick={()=>setTGroups([])}
            style={{padding:"4px 10px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
              border:"1px solid #ef444455",background:"#ef444418",color:"#ef4444"}}>✕ Clear ({tGroups.length})</button>}
        </div>
      )}

      {/* N53: event filters */}
      {showEvents && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10,
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>📅 EVENTS</span>
          <button onClick={()=>setEvTypes([])}
            style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
              border:evTypes.length===0?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
              background:evTypes.length===0?"var(--c-accent)22":"var(--c-surface)",
              color:evTypes.length===0?"var(--c-accent)":"var(--c-text-muted)"}}>All types</button>
          {eventTypes.map(t=>{
            const on=evTypes.includes(t.id);
            return (
              <button key={t.id} onClick={()=>setEvTypes(a=>a.includes(t.id)?a.filter(x=>x!==t.id):[...a,t.id])}
                style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:16,cursor:"pointer",
                  border:on?`1.5px solid ${t.color}`:"1px solid var(--c-border)",background:on?t.color+"22":"var(--c-surface)",
                  fontSize:11,fontWeight:700,color:on?t.color:"var(--c-text-muted)"}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:t.color}}/>{t.name}</button>
            );
          })}
        </div>
      )}

      {/* ── RANGE + LINE controls ── */}
      {mView==="gantt" && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:14,
          background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
          <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",marginRight:2}}>RANGE</span>
          {[["auto","🎯 Auto-fit"],["3m","3 Months"],["6m","6 Months"],["1y","1 Year"],["2y","2 Years"],["custom","🗓 Custom"]].map(([v,l])=>(
            <button key={v} onClick={()=>setMRange(v)}
              style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                border:mRange===v?"1.5px solid #f59e0b":"1px solid var(--c-border)",
                background:mRange===v?"#f59e0b22":"var(--c-surface)",
                color:mRange===v?"#b45309":"var(--c-text-muted)"}}>{l}</button>
          ))}
          {mRange==="custom" && (
            <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:4}}>
              <DateInput value={mFrom} onChange={setMFrom}
                style={{padding:"4px 8px",borderRadius:7,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:11}}/>
              <span style={{fontSize:11,color:"var(--c-text-muted)"}}>→</span>
              <DateInput value={mTo} onChange={setMTo}
                style={{padding:"4px 8px",borderRadius:7,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:11}}/>
            </div>
          )}
          <div style={{flexBasis:"100%",height:0}}/>
          <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",marginRight:2}}>TIMELINE LINES</span>
          {[["1","1 line"],["2","2"],["3","3"],["4","4"],["5","5"]].map(([v,l])=>(
            <button key={v} onClick={()=>setMSeg(v)}
              style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                border:mSeg===v?"1.5px solid #6366f1":"1px solid var(--c-border)",
                background:mSeg===v?"#6366f122":"var(--c-surface)",
                color:mSeg===v?"#6366f1":"var(--c-text-muted)"}}>{l}</button>
          ))}
          <div style={{width:1,height:18,background:"var(--c-border)",margin:"0 3px"}}/>
          {[["month","1 line = 1 month"],["quarter","= 3 months"],["year","= 1 year"]].map(([v,l])=>(
            <button key={v} onClick={()=>setMSeg(v)}
              style={{padding:"4px 11px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
                border:mSeg===v?"1.5px solid #0ea5e9":"1px solid var(--c-border)",
                background:mSeg===v?"#0ea5e922":"var(--c-surface)",
                color:mSeg===v?"#0284c7":"var(--c-text-muted)"}}>{l}</button>
          ))}
        </div>
      )}

      {/* ── N53: THE TIMELINE ── */}
      {mView==="gantt" && (()=>{
        const all = tlItems;
        if (!all.length) return (
          <div style={{textAlign:"center",padding:"50px 20px",color:"var(--c-text-muted)"}}>
            <div style={{fontSize:44,marginBottom:14}}>📈</div>
            <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>Nothing to plot</div>
            <div style={{fontSize:12}}>Pick at least one source above — Milestones, Tasks or Events.</div>
          </div>
        );

        // 1. overall range
        const nowT = Date.now();
        const monthsBack = {"3m":3,"6m":6,"1y":12,"2y":24}[mRange];
        let lo, hi;
        if (mRange==="custom" && mFrom && mTo) {
          lo = new Date(mFrom+"T00:00:00").getTime();
          hi = new Date(mTo+"T23:59:59").getTime();
        } else if (monthsBack) {
          const d = new Date(); d.setMonth(d.getMonth()-monthsBack);
          lo = d.getTime(); hi = nowT;
        } else {
          const lows = all.map(i=>i.at), highs = all.map(i=>i.span?i.end:i.at);
          const a2 = Math.min(...lows), b2 = Math.max(...highs, nowT);
          const pad = Math.max(86400000*3, (b2-a2)*0.04);
          lo = Math.min(a2, nowT)-pad; hi = b2+pad;
        }
        if (hi<=lo) hi = lo + 86400000;

        const inRange = all.filter(i=>{const s=i.at, e=i.span?i.end:i.at; return e>=lo && s<=hi;});
        if (!inRange.length) return (
          <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:14,padding:"28px 24px",marginBottom:20,textAlign:"center",color:"var(--c-text-muted)",fontSize:12}}>
            Nothing in the selected range — try switching to "Auto-fit"
          </div>
        );

        // 2. cut into spines
        const fmtMY = (d)=>`${MONTHS[d.getMonth()]} ${lang==="TH"?toThaiYear(d.getFullYear()):d.getFullYear()}`;
        const segments = [];
        if (mSeg==="month" || mSeg==="quarter" || mSeg==="year") {
          const step = mSeg==="month"?1 : mSeg==="quarter"?3 : 12;
          const c = new Date(lo);
          if (mSeg==="year") c.setMonth(0);
          else if (mSeg==="quarter") c.setMonth(Math.floor(c.getMonth()/3)*3);
          c.setDate(1); c.setHours(0,0,0,0);
          let guard=0;
          while (c.getTime() <= hi && guard++ < 200) {
            const s=c.getTime();
            const e=new Date(c); e.setMonth(e.getMonth()+step);
            const label = mSeg==="year" ? String(lang==="TH"?toThaiYear(c.getFullYear()):c.getFullYear())
                        : mSeg==="quarter" ? `${fmtMY(c)} – ${fmtMY(new Date(e.getTime()-86400000))}`
                        : fmtMY(c);
            segments.push({lo:s, hi:e.getTime()-1, label});
            c.setMonth(c.getMonth()+step);
          }
        } else {
          const n=Math.max(1,Math.min(5,Number(mSeg)||1));
          const step=(hi-lo)/n;
          for (let i=0;i<n;i++){
            const s=lo+step*i, e=(i===n-1)?hi:lo+step*(i+1)-1;
            segments.push({lo:s,hi:e,label:`${new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} – ${new Date(e).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}`});
          }
        }
        // N57: every segment is drawn, even when it holds nothing. An empty month
        // is information too — hiding it silently breaks the time scale.
        const shown = segments;

        // N73/N88: with Details on, a bar carries title + dates + description +
        // subtasks. Compact mode squeezes everything to the thinnest readable size.
        const LANE_H = tlDetails
          ? (tlCompact ? Math.max(58, tFS*3.6 + 18) : Math.max(78, tFS*4.4 + 30))
          : (tlCompact ? Math.max(26, tFS*1.8 + 8)  : Math.max(40, tFS*2.6 + 16));
        const BAR_PAD = tlCompact ? 6 : 14;   // bar = LANE_H - BAR_PAD

        return (
          <div style={{display:"grid",gap:16,marginBottom:20,fontFamily:tFF}}>
            {shown.map((sg,si)=>{
              const raw = inRange.filter(i=>{const s=i.at,e=i.span?i.end:i.at;return e>=sg.lo&&s<=sg.hi;});
              const span = Math.max(1, sg.hi-sg.lo);
              const pct = (t)=>((t-sg.lo)/span)*100;
              const todayIn = nowT>=sg.lo && nowT<=sg.hi;
              const marks=[];
              const c=new Date(sg.lo); c.setDate(1);
              for(let d=new Date(c); d.getTime()<=sg.hi; d.setMonth(d.getMonth()+1)){
                if(d.getTime()<sg.lo) continue;
                marks.push({label:fmtMY(d), pos:pct(d.getTime())});
              }
              // N57: a proper time axis — day ticks thinned to fit, ISO week numbers
              // and Thai public holidays. Drawn whether or not the line holds items.
              const spineW = Math.max(360, wrapW - 48);   // N81: real usable width, no forced scroll
              // N77: packing needs the real pixel width to reserve label room
              const items = packLanes(raw, sg.lo, sg.hi, spineW);   // includes N85 manual lanes
              const laneCount = Math.max(1, ...items.map(i=>i._lane+1));
              const dayCount = Math.max(1, Math.round(span/86400000));
              // N61: with a month (or a quarter) per line there is room for EVERY day,
              // so try the narrow "12 Mo" form first and only thin out when it won't fit.
              const pxPerDay = spineW / dayCount;
              const compactPx = tFS * 1.9 + 4;   // "12" + weekday letter, stacked
              const fullPx    = tFS * 2.6 + 8;   // "12/09"
              // N70: with one month or one quarter per line the user asked for EVERY
              // day. When the labels would collide we rotate them instead of dropping
              // them — vertical text needs only ~tFS+4 px of width.
              // N70/N81: prefer every day. Horizontal if it fits, else rotated 90°.
              // If even rotated labels would collide, thin them out rather than force
              // the user to scroll sideways.
              const forceDaily = (mSeg==="month" || mSeg==="quarter");
              const rotatePx   = tFS + 5;
              const perDayFits = pxPerDay >= compactPx;
              const rotateFits = pxPerDay >= rotatePx;
              const rotate     = !perDayFits && rotateFits;
              const dayStep = (perDayFits || rotate) ? 1
                : ([2,3,7,14,28,56,112].find(s=>s*pxPerDay >= (forceDaily?rotatePx:fullPx)) || 168);
              const showDayName = perDayFits || rotate;
              const showShortDate = perDayFits || rotate;
              const ticks=[]; const hols=[]; const weekEdges=[];
              const DOW = ["Su","M","T","W","Th","F","S"];
              const cur=new Date(sg.lo); cur.setHours(0,0,0,0);
              let g=0, di=0, lastWk=null;
              while(cur.getTime()<=sg.hi && g++<2000){
                const iso=fmtLocal(cur);
                const h=isThaiHoliday(iso);
                const wk=isoWeekNum(cur);
                if(h && dayCount<=500) hols.push({iso,name:h,pos:pct(cur.getTime())});
                // N61: a Monday starts a new ISO week — draw the boundary once
                if(cur.getDay()===1 && dayCount<=800) weekEdges.push({pos:pct(cur.getTime()), wk});
                if(di % dayStep === 0){
                  // N61: print the week number only when it CHANGES, never twice in a row
                  const newWeek = wk!==lastWk;
                  ticks.push({pos:pct(cur.getTime()),
                    dd:String(cur.getDate()).padStart(2,"0"), mm:String(cur.getMonth()+1).padStart(2,"0"),
                    dow:DOW[cur.getDay()], wk, showWk:newWeek, hol:h, isMon:cur.getDay()===1,
                    weekend:cur.getDay()===0||cur.getDay()===6,
                    isToday: iso===fmtLocal(TODAY)});
                  lastWk = wk;
                }
                cur.setDate(cur.getDate()+1); di++;
              }
              const AXIS_TOP = rotate ? 74 : showDayName ? 44 : 30;  // rotated labels need more headroom
              return (
                <div key={si} ref={si===0?wrapRef:undefined}
                  style={{background:TH.card,border:`1px solid ${TH.border}`,borderRadius:TH.radius,padding:"16px 22px 22px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:10,fontWeight:900,color:"#fff",background:TH.badge,borderRadius:20,padding:"2px 10px",whiteSpace:"nowrap"}}>
                      Line {si+1}/{shown.length}
                    </span>
                    <span style={{fontSize:tFS-1,fontWeight:700,color:"var(--c-text-muted)",whiteSpace:"nowrap"}}>{sg.label}</span>
                    <span style={{fontSize:10,color:"var(--c-text-muted)",marginLeft:"auto"}}>
                      {raw.length===0 ? <span style={{opacity:0.55}}>empty</span> : `${raw.length} item${raw.length!==1?"s":""}`}
                    </span>
                  </div>
                  <div
                    // N71: hovering anywhere on the line reveals the exact day under the cursor
                    onMouseMove={e=>{
                      if(dragRef.current) return;
                      const r=e.currentTarget.getBoundingClientRect();
                      const f=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
                      const t=sg.lo + f*span;
                      const d=new Date(t); d.setHours(12,0,0,0);
                      setHoverAxis({si, xPct:f*100, date:d});
                    }}
                    onMouseLeave={()=>setHoverAxis(h=>h&&h.si===si?null:h)}
                    style={{position:"relative",width:"100%",
                    minHeight:(raw.length? 62+laneCount*LANE_H : 96),paddingTop:AXIS_TOP+30}}>

                    {/* N71: crosshair + floating day label */}
                    {hoverAxis && hoverAxis.si===si && !hoverItem && !drag && (()=>{
                      const d=hoverAxis.date;
                      const iso=fmtLocal(d); const hol=isThaiHoliday(iso);
                      const flip = hoverAxis.xPct > 78;
                      return (
                        <>
                          <div style={{position:"absolute",left:`${hoverAxis.xPct}%`,top:AXIS_TOP+4,bottom:0,width:1,
                            background:"var(--c-text-muted)",opacity:0.45,zIndex:4,pointerEvents:"none"}}/>
                          <div style={{position:"absolute",left:`${hoverAxis.xPct}%`,top:AXIS_TOP-2,zIndex:5,
                            transform:flip?"translateX(-100%)":"none",marginLeft:flip?-6:6,pointerEvents:"none",
                            background:"var(--c-card2)",border:`1px solid ${hol?"#a855f7":"var(--c-border)"}`,
                            borderRadius:7,padding:"3px 8px",whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(0,0,0,.28)"}}>
                            <span style={{fontSize:10.5,fontWeight:800,color:"var(--c-text)"}}>
                              {d.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}
                            </span>
                            <span style={{fontSize:9.5,fontWeight:800,color:"var(--c-accent)",marginLeft:6}}>W{isoWeekNum(d)}</span>
                            {hol && <span style={{display:"block",fontSize:9.5,fontWeight:700,color:"#a855f7"}}>🎌 {hol}</span>}
                          </div>
                        </>
                      );
                    })()}

                    {/* N57/N68: holiday bands. When they aren't packed together we also
                        print the name + date so you don't have to hover to know what it is. */}
                    {hols.map(h=>{
                      // one whole day wide, never thinner than 3px so it stays visible
                      const wPct = Math.max((86400000/span)*100, 0.3);
                      return (
                        <div key={h.iso} title={h.name}
                          onMouseEnter={e=>setHoverHolT({name:h.name,iso:h.iso,x:e.clientX,y:e.clientY})}
                          onMouseLeave={()=>setHoverHolT(null)}
                          style={{position:"absolute",left:`${h.pos}%`,width:`${wPct}%`,minWidth:3,
                            transform:"translateX(-50%)",top:AXIS_TOP+18,bottom:0,
                            background:"#a855f7",opacity:0.13,borderRadius:3,zIndex:0,cursor:"help"}}/>
                      );
                    })}

                    {/* month gridlines */}
                    {marks.map((m,i)=>(
                      <div key={i} style={{position:"absolute",left:`${m.pos}%`,top:AXIS_TOP+22,bottom:0,width:1,background:TH.grid,opacity:TH.gridOp,zIndex:0}}/>
                    ))}
                    {marks.map((m,i)=>(
                      <span key={"lbl"+i} style={{position:"absolute",left:`${m.pos}%`,top:0,marginLeft:4,
                        fontSize:Math.max(9,tFS-2),color:"var(--c-text)",fontWeight:800,whiteSpace:"nowrap",opacity:0.8}}>{m.label}</span>
                    ))}

                    {/* N61: week boundaries — a full-height rule every Monday */}
                    {weekEdges.map((w,i)=>(
                      <div key={"we"+i} style={{position:"absolute",left:`${w.pos}%`,top:AXIS_TOP-4,bottom:0,width:1,
                        background:TH.grid,opacity:Math.min(1,TH.gridOp+0.25),zIndex:0}}/>
                    ))}

                    {/* N57/N61/N70: day · weekday · week number. One W# badge per week only. */}
                    {ticks.map((t,i)=>{
                      // N82: crisp, plain numerals. Colour carries ONE meaning only —
                      // weekend or public holiday. Everything else is normal text.
                      const dayColor = t.hol ? "#a855f7"
                                     : t.weekend ? "#e11d48"
                                     : "var(--c-text)";
                      return (
                        <div key={"tk"+i} style={{position:"absolute",left:`${t.pos}%`,
                          top:AXIS_TOP-(rotate?60:showDayName?30:16),transform:"translateX(-50%)",
                          textAlign:"center",whiteSpace:"nowrap",zIndex:1}}>
                          {/* the week number is printed once, at the start of its week */}
                          <div style={{height:11,overflow:"visible"}}>
                            {t.showWk && (
                              <span style={{fontSize:Math.max(7,tFS-4),fontWeight:900,color:"#fff",background:TH.badge,
                                borderRadius:8,padding:"0 5px",letterSpacing:"0.02em"}}>W{t.wk}</span>
                            )}
                          </div>
                          {rotate ? (
                            // N70: vertical label — only used when horizontal text will not fit
                            <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",
                              margin:"3px auto 0",fontSize:Math.max(9,tFS-2),lineHeight:1,
                              fontWeight:600, color:dayColor}}>
                              {t.hol?"🎌 ":""}{t.dd} {t.dow}
                            </div>
                          ) : (<>
                            <div style={{fontSize:Math.max(9,tFS-2),fontWeight:600,color:dayColor,
                              fontVariantNumeric:"tabular-nums"}}>
                              {t.hol?"🎌":""}{showShortDate ? t.dd : `${t.dd}/${t.mm}`}
                            </div>
                            {showDayName && (
                              <div style={{fontSize:Math.max(8,tFS-3),fontWeight:600,color:dayColor}}>{t.dow}</div>
                            )}
                          </>)}
                        </div>
                      );
                    })}
                    {ticks.map((t,i)=>(
                      <div key={"tm"+i} style={{position:"absolute",left:`${t.pos}%`,top:AXIS_TOP+14,
                        width:t.isMon?1.5:1,height:t.isMon?10:6,
                        background:t.hol?"#a855f7":t.weekend?"#e11d48":t.isMon?TH.grid:"var(--c-border)",
                        opacity:t.hol||t.weekend?0.75:t.isMon?0.9:0.5,zIndex:1}}/>
                    ))}

                    {/* the spine */}
                    <div style={{position:"absolute",left:0,right:0,top:AXIS_TOP+22,height:TH.spineH,background:TH.spine,borderRadius:2,zIndex:1}}/>

                    {raw.length===0 && (
                      <div style={{position:"absolute",left:0,right:0,top:AXIS_TOP+40,textAlign:"center",
                        fontSize:Math.max(9,tFS-3),color:"var(--c-text-muted)",opacity:0.55}}>no items in this period</div>
                    )}

                    {/* N53: TODAY marker */}
                    {todayIn && (
                      <div style={{position:"absolute",left:`${pct(nowT)}%`,top:AXIS_TOP+10,bottom:0,width:2,
                        background:`linear-gradient(180deg,${TH.today},${TH.today}55)`,zIndex:3,transform:"translateX(-1px)",
                        boxShadow:`0 0 8px ${TH.today}88`}}>
                        <span style={{position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",
                          fontSize:9,fontWeight:900,color:"#fff",background:TH.today,borderRadius:9,
                          padding:"2px 9px",whiteSpace:"nowrap",letterSpacing:"0.04em",textAlign:"center",
                          lineHeight:1.25,boxShadow:`0 3px 10px ${TH.today}66`}}>
                          TODAY
                          <span style={{display:"block",fontSize:8.5,fontWeight:700,opacity:0.92,letterSpacing:0}}>
                            {new Date(nowT).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} · W{isoWeekNum(new Date(nowT))}
                          </span>
                        </span>
                      </div>
                    )}

                    {items.map(it0=>{
                      // N63: while dragging, draw the preview position instead of the stored one
                      const dg = drag && drag.id===it0.id ? drag : null;
                      // N69: an unsaved edit wins over the stored dates; a live drag wins over both
                      const ed = editFor(it0);
                      const shownAt  = dg && dg.axis!=="y" ? dg.at  : ed ? ed.at  : it0.at;
                      const shownEnd = dg && dg.axis!=="y" ? dg.end : ed ? ed.end : (it0.span?it0.end:it0.at);
                      const shownLane = dg && dg.axis==="y" ? dg.lane : it0._lane;   // N85
                      const it = (dg||ed) ? {...it0, at:shownAt, end:shownEnd, _lane:shownLane,
                                       _left: ((shownAt - sg.lo)/span)*100,
                                       _right: ((shownEnd - sg.lo)/span)*100} : it0;
                      const isDirty = !!ed;
                      const pxPerDay = Math.max(0.001, spineW / dayCount);
                      const top = AXIS_TOP + 44 + it._lane*LANE_H;
                      const BS = tlBarStyle(TH, it.color, (hoverItem&&hoverItem.it.id===it0.id)||!!dg); // N64
                      const isPoint = !it.span;
                      const flip = it._left > 62;
                      const hoverOn = (e)=>{ if(!dragRef.current) setHoverItem({it,x:e.clientX,y:e.clientY}); };
                      const hoverMv = (e)=>setHoverItem(h=>h&&!dragRef.current?{...h,x:e.clientX,y:e.clientY}:h);
                      const hoverOff = ()=>setHoverItem(null);
                      const open = ()=>{ if(it.kind==="event"){ if(setEvents) setEditingEvent(it.raw); } else setEditingTask(it.raw); }; // N58

                      // N56: when something is hovered, it lifts above everything and
                      // the rest fades, so an overlapped item is still readable.
                      // N75: hovering lifts the item and adds a glow. The others keep their
                      // colour — dimming everything made the chart flicker and hurt scanning.
                      const hovered = (hoverItem && hoverItem.it.id===it.id) || !!dg;
                      const zTop    = hovered ? 60 : 1;
                      const OVERDUE = "#dc2626";

                      if (isPoint) {
                        return (
                          <div key={it.id}>
                            <div style={{position:"absolute",left:`${it._left}%`,top:AXIS_TOP+22,width:hovered?3:2,height:top-(AXIS_TOP+22),
                              background:hovered?it.color:(it.prio?it.color:"var(--c-border)"),transform:"translateX(-1px)",
                              boxShadow:hovered?`0 0 8px ${it.color}`:"none",zIndex:hovered?zTop:0}}/>
                            <div style={{position:"absolute",left:`${it._left}%`,top:AXIS_TOP+22,
                              transform:`translate(-50%,-50%) scale(${hovered?1.5:1}) ${TH.nodeShape==="diamond"?"rotate(45deg)":""}`,
                              width:it.prio?18:12,height:it.prio?18:12,
                              borderRadius:TH.nodeShape==="circle"?"50%":TH.nodeShape==="square"?3:2,
                              background:it.overdue?OVERDUE:it.color,
                              border:"2px solid var(--c-surface)",transition:"transform .12s",
                              boxShadow:hovered?`0 0 0 5px ${it.color}66, 0 0 14px ${it.color}`:(it.prio?`0 0 0 3px ${it.color}55`:"none"),
                              zIndex:hovered?zTop+1:2}}/>
                            {hovered && (
                              <div style={{position:"absolute",left:`${it._left}%`,top:AXIS_TOP-2,transform:"translateX(-50%)",zIndex:zTop+2,
                                fontSize:10,fontWeight:900,color:"#fff",background:it.color,borderRadius:20,padding:"2px 9px",
                                whiteSpace:"nowrap",boxShadow:`0 3px 10px ${it.color}77`}}>
                                {new Date(it.at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                              </div>
                            )}
                            <div onDoubleClick={()=>open()} title="Double-click to edit" onMouseEnter={hoverOn} onMouseMove={hoverMv} onMouseLeave={hoverOff}
                              onMouseDown={e=>beginDrag(e,it,"move",pxPerDay,LANE_H)}
                              style={{position:"absolute",left:`${it._left}%`,top,transform:flip?"translateX(-100%)":"none",
                                marginLeft:flip?-10:10,cursor:it.kind==="milestone"?"pointer":(dg?"grabbing":"grab"),
                                background:hovered?it.color+"26":(it.prio?it.color+"18":"var(--c-surface2)"),
                                border: it.overdue ? `2px solid ${OVERDUE}`
                                      : TH.cardBorder==="full"?`1.5px solid ${it.color}`
                                      : (hovered?`2px solid ${it.color}`:(it.prio?`1.5px solid ${it.color}`:"1px solid var(--c-border)")),
                                borderLeft:TH.cardBorder==="none"&&!it.overdue?undefined:`4px solid ${it.overdue?OVERDUE:it.color}`,
                                borderRadius:tlCompact?8:Math.min(12,TH.radius),
                                padding:tlCompact?"3px 9px":"6px 11px",maxWidth:240,
                                boxShadow:hovered?`0 8px 26px ${it.color}66`:(it.prio?`0 3px 12px ${it.color}33`:"var(--c-shadow)"),zIndex:zTop,
                                display:"flex",alignItems:"center",gap:7,transition:"transform .1s"}}
                              onMouseOver={e=>e.currentTarget.style.transform=(flip?"translateX(-100%) ":"")+"translateY(-1px)"}
                              onMouseOut={e=>e.currentTarget.style.transform=flip?"translateX(-100%)":"none"}>
                              <span style={{fontSize:it.prio?15:12,flexShrink:0}}>
                                {it.kind==="milestone"?(it.prio?"⭐":"🏆"):it.kind==="event"?"📅":(it._type==="work"?"💼":"🏠")}
                              </span>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:tFS,fontWeight:it.prio?900:700,color:it.overdue?OVERDUE:(it.prio?it.color:"var(--c-text)"),
                                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {it.overdue&&<span style={{fontSize:Math.max(7,tFS-4),fontWeight:900,color:"#fff",background:OVERDUE,
                                    borderRadius:4,padding:"0 4px",marginRight:5,letterSpacing:"0.03em"}}>OVERDUE</span>}
                                  {it.pinned&&<span title="Pinned" style={{marginRight:3}}>📌</span>}
                                  {it.high&&<span title="High priority" style={{fontSize:Math.max(7,tFS-4),fontWeight:900,color:"#fff",
                                    background:"#ef4444",borderRadius:4,padding:"0 4px",marginRight:5}}>HIGH</span>}
                                  {it.title}
                                  {it.attachments&&it.attachments.length>0 && (
                                    <span style={{marginLeft:5}}>
                                      <TimelineAttachIcons attachments={it.attachments} onMedia={setTlMedia} size={Math.max(10,tFS-2)}/>{it.location&&<PlacePin loc={it.location} size={Math.max(9,tFS-3)}/>}
                                    </span>
                                  )}
                                </div>
                                <div style={{fontSize:Math.max(8,tFS-3),color:"var(--c-text-muted)",display:"flex",gap:5,alignItems:"center"}}>
                                  <span>{new Date(it.at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span>
                                  <span style={{fontWeight:800,color:"var(--c-accent)",background:"var(--c-accent)15",borderRadius:4,padding:"0 4px"}}>W{isoWeekNum(new Date(it.at))}</span>
                                </div>
                                {tlDetails && (()=>{ const cd=countdownOf(it.at); const sp=subsOf(it);
                                  return (
                                    <>
                                      <div style={{fontSize:Math.max(8,tFS-3),fontWeight:800,color:cd.color,marginTop:1}}>⏳ {cd.long}</div>
                                      {it.raw?.description && (
                                        <div style={{fontSize:Math.max(7,tFS-4),color:"var(--c-text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                          {it.raw.description}
                                        </div>
                                      )}
                                      {sp && (
                                        <div style={{marginTop:2}}>
                                          <div style={{fontSize:Math.max(7,tFS-4),fontWeight:700,color:"var(--c-text-muted)"}}>☑ {sp.done}/{sp.total} subtasks</div>
                                          {sp.subs.slice(0,3).map((s,si2)=>(
                                            <div key={si2} style={{fontSize:Math.max(7,tFS-4),color:s.done?"var(--c-text-muted)":"var(--c-text)",
                                              textDecoration:s.done?"line-through":"none",opacity:s.done?0.6:1,
                                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                              {s.done?"✓":"☐"} {s.text||s.title}
                                            </div>
                                          ))}
                                          {sp.total>3 && <div style={{fontSize:Math.max(7,tFS-4),color:"var(--c-text-muted)",opacity:0.7}}>+{sp.total-3} more</div>}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // duration → capsule
                      const l=Math.max(0,it._left), r=Math.min(100,it._right);
                      const w=Math.max(r-l,0.8);
                      return (
                        <div key={it.id}>
                          {/* connectors down from the spine at BOTH ends when hovered */}
                          <div style={{position:"absolute",left:`${l+w/2}%`,top:AXIS_TOP+22,width:hovered?3:2,height:top-(AXIS_TOP+22),
                            background:hovered?it.color:"var(--c-border)",transform:"translateX(-1px)",
                            opacity:hovered?1:0.6,boxShadow:hovered?`0 0 8px ${it.color}`:"none",zIndex:hovered?zTop:0}}/>
                          {hovered && (<>
                            <div style={{position:"absolute",left:`${l}%`,top:AXIS_TOP+16,bottom:0,width:2,background:it.color,opacity:0.5,zIndex:zTop}}/>
                            <div style={{position:"absolute",left:`${r}%`,top:AXIS_TOP+16,bottom:0,width:2,background:it.color,opacity:0.5,zIndex:zTop}}/>
                            <div style={{position:"absolute",left:`${l}%`,top:AXIS_TOP-2,transform:"translateX(-50%)",zIndex:zTop+2,
                              fontSize:9.5,fontWeight:900,color:"#fff",background:it.color,borderRadius:20,padding:"2px 8px",
                              whiteSpace:"nowrap",boxShadow:`0 3px 10px ${it.color}77`}}>
                              {new Date(it.at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                            </div>
                            <div style={{position:"absolute",left:`${r}%`,top:AXIS_TOP-2,transform:"translateX(-50%)",zIndex:zTop+2,
                              fontSize:9.5,fontWeight:900,color:"#fff",background:it.color,borderRadius:20,padding:"2px 8px",
                              whiteSpace:"nowrap",boxShadow:`0 3px 10px ${it.color}77`}}>
                              {new Date(it.end).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                            </div>
                          </>)}
                          {/* N63: resize handles — each end moves independently */}
                          {it.kind!=="milestone" && (
                            <>
                              <div onMouseDown={e=>beginDrag(e,it,"start",pxPerDay,LANE_H)} title="Drag to change the start date"
                                style={{position:"absolute",left:`${l}%`,top,width:10,height:LANE_H-BAR_PAD,marginLeft:-5,
                                  cursor:"ew-resize",zIndex:zTop+3,borderRadius:6,
                                  background:hovered||dg?`${it.color}`:"transparent",opacity:hovered||dg?0.9:0}}/>
                              <div onMouseDown={e=>beginDrag(e,it,"end",pxPerDay,LANE_H)} title="Drag to change the end date"
                                style={{position:"absolute",left:`${r}%`,top,width:10,height:LANE_H-BAR_PAD,marginLeft:-5,
                                  cursor:"ew-resize",zIndex:zTop+3,borderRadius:6,
                                  background:hovered||dg?`${it.color}`:"transparent",opacity:hovered||dg?0.9:0}}/>
                            </>
                          )}
                          <div onDoubleClick={()=>open()} title="Double-click to edit" onMouseEnter={hoverOn} onMouseMove={hoverMv} onMouseLeave={hoverOff}
                            onMouseDown={e=>beginDrag(e,it,"move",pxPerDay,LANE_H)}
                            style={{position:"absolute",left:`${l}%`,width:`${w}%`,top,minWidth:16,
                              height:LANE_H-BAR_PAD,borderRadius:tlCompact?Math.min(BS.radius,7):BS.radius,cursor:dg?"grabbing":"grab",zIndex:zTop,
                              background:BS.background,
                              boxShadow: isDirty ? `0 0 0 2px #f59e0b, ${BS.shadow}`
                                       : it.overdue ? `0 0 0 2px ${OVERDUE}66, ${BS.shadow}`
                                       : BS.shadow,
                              border: isDirty ? `2px dashed #f59e0b`
                                    : it.overdue ? `2px solid ${OVERDUE}`
                                    : BS.border,
                              transform:hovered&&TH.shadow!=="hard"?"translateY(-2px)":"none",
                              display:"flex",flexDirection:"column",justifyContent:"center",gap:tlCompact?0:1,
                              padding:tlDetails?(tlCompact?"2px 9px":"4px 11px"):(tlCompact?"0 8px":"0 10px"),overflow:"hidden",
                              transition:"transform .12s,box-shadow .12s"}}>
                            <span style={{fontSize:Math.max(8,tFS-1),fontWeight:800,color:BS.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>
                              {it.overdue&&<span style={{fontSize:Math.max(7,tFS-4),fontWeight:900,color:OVERDUE,background:"#fff",
                                borderRadius:4,padding:"0 4px",marginRight:5}}>OVERDUE</span>}
                              {/* N78: pin and priority must be visible without hovering */}
                              {it.pinned&&<span title="Pinned" style={{marginRight:3}}>📌</span>}
                              {it.high&&<span title="High priority" style={{fontSize:Math.max(7,tFS-4),fontWeight:900,color:"#fff",
                                background:"#ef4444",borderRadius:4,padding:"0 4px",marginRight:5}}>HIGH</span>}
                              {it.kind==="event"?"📅 ":it._type==="work"?"💼 ":"🏠 "}{it.title}
                              {it.attachments&&it.attachments.length>0 && (
                                <span style={{marginLeft:6}}>
                                  <TimelineAttachIcons attachments={it.attachments} onMedia={setTlMedia} size={Math.max(10,tFS-1)} dark/>{it.location&&<PlacePin loc={it.location} size={Math.max(9,tFS-2)} dark/>}
                                </span>
                              )}
                            </span>
                            {tlDetails && (<>
                              <span style={{fontSize:Math.max(7,tFS-3),fontWeight:600,color:BS.textColor,opacity:0.85,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>
                                {new Date(it.at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} → {new Date(it.end).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                                {" · "}{Math.max(1,Math.round((it.end-it.at)/86400000))}d
                                {" · ⏳ "}{countdownOf(it.end).short}
                              </span>
                              <span style={{fontSize:Math.max(7,tFS-3),color:BS.textColor,opacity:0.7,fontStyle:(it.kind==="event"?(it.win.desc||it.raw.note):it.raw.description)?"normal":"italic",
                                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>
                                {(it.kind==="event" ? (it.win.desc||it.raw.note) : it.raw.description) || "—"}
                              </span>
                              {/* N73: subtask progress right on the bar */}
                              {(()=>{ const sp=subsOf(it); if(!sp) return null;
                                return (
                                  <span style={{display:"flex",alignItems:"center",gap:5,marginTop:1}}>
                                    <span style={{flex:"0 0 46px",height:4,borderRadius:2,background:`${BS.textColor}33`,overflow:"hidden"}}>
                                      <span style={{display:"block",height:"100%",width:`${(sp.done/sp.total)*100}%`,background:BS.textColor,opacity:0.9}}/>
                                    </span>
                                    <span style={{fontSize:Math.max(7,tFS-4),fontWeight:700,color:BS.textColor,opacity:0.85,whiteSpace:"nowrap"}}>
                                      ☑ {sp.done}/{sp.total}
                                      {sp.total<=2 ? ` · ${sp.subs.map(s=>(s.done?"✓":"☐")+" "+(s.text||s.title||"")).join(" · ")}` : ""}
                                    </span>
                                  </span>
                                );
                              })()}
                            </>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{fontSize:10,color:"var(--c-text-muted)",textAlign:"center"}}>
              ⭐ = critical milestone · capsules = durations, dots = single points · hover for full details · lanes pack automatically
            </div>
          </div>
        );
      })()}

      {/* N89: attachment popup (image / video) */}
      {tlMedia && <MediaLightbox item={tlMedia} onClose={()=>setTlMedia(null)}/>}

      {/* N68: holiday tooltip */}
      {hoverHolT && (
        <div style={{position:"fixed",left:Math.min(hoverHolT.x+14,(typeof window!=="undefined"?window.innerWidth:1200)-260),
          top:hoverHolT.y+16,zIndex:9500,pointerEvents:"none",maxWidth:240,
          background:"var(--c-card2)",border:"1.5px solid #a855f7",borderRadius:10,padding:"8px 12px",
          boxShadow:"0 10px 30px rgba(0,0,0,.35)"}}>
          <div style={{fontSize:12,fontWeight:800,color:"#a855f7",marginBottom:2}}>🎌 {hoverHolT.name}</div>
          <div style={{fontSize:10.5,color:"var(--c-text-muted)",fontWeight:700}}>
            {new Date(hoverHolT.iso+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
          </div>
        </div>
      )}

      {/* N53: hover tooltip — full details for any item on the timeline */}
      {hoverItem && (()=>{
        const it=hoverItem.it, r=it.raw;
        const dt=(ms)=>new Date(ms).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
        return (
          <div style={{position:"fixed",left:Math.min(hoverItem.x+14,(typeof window!=="undefined"?window.innerWidth:1200)-310),
            top:hoverItem.y+16,zIndex:9500,pointerEvents:"none",maxWidth:300,
            background:"var(--c-card2)",border:`1.5px solid ${it.color}`,borderRadius:11,padding:"10px 13px",
            boxShadow:"0 12px 34px rgba(0,0,0,.38)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:it.color,flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:800,color:"var(--c-text)"}}>{it.title}</span>
            </div>
            {it.overdue && (
              <div style={{fontSize:10,fontWeight:900,color:"#fff",background:"#dc2626",borderRadius:5,
                padding:"2px 7px",display:"inline-block",marginBottom:6,letterSpacing:"0.04em"}}>⚠ OVERDUE</div>
            )}
            <div style={{fontSize:9.5,fontWeight:800,letterSpacing:"0.06em",color:"var(--c-text-muted)",marginBottom:6}}>
              {it.kind==="milestone"?"MILESTONE":it.kind==="event"?"EVENT":(it._type==="work"?"WORK TASK":"PERSONAL TASK")}
              {it.kind==="event"&&it.winTotal>1?` · WINDOW ${it.winIdx}/${it.winTotal}`:""}
            </div>
            <div style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:700,marginBottom:5}}>
              📅 {dt(it.at)}{it.span?` → ${dt(it.end)}`:""} · W{isoWeekNum(new Date(it.at))}
              {it.span?<span style={{marginLeft:6,color:"var(--c-text)"}}>({Math.max(1,Math.round((it.end-it.at)/86400000))}d)</span>:null}
            </div>
            {/* N62: how far away is this from today? */}
            {(()=>{
              const cd = countdownOf(it.span ? it.end : it.at);
              return (
                <div style={{fontSize:11,fontWeight:800,color:cd.color,marginBottom:6,
                  background:cd.color+"18",border:`1px solid ${cd.color}44`,borderRadius:7,padding:"3px 8px",display:"inline-block"}}>
                  ⏳ {cd.long}{cd.days!==0?` (${cd.abs} day${cd.abs!==1?"s":""})`:""}
                </div>
              );
            })()}
            {/* N89: attachments (click an icon to open) */}
            {it.attachments&&it.attachments.length>0 && (
              <div style={{display:"flex",gap:6,alignItems:"center",margin:"2px 0 6px"}}>
                <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)"}}>ATTACHMENTS</span>
                <TimelineAttachIcons attachments={it.attachments} onMedia={setTlMedia} size={14}/>{it.location&&<PlacePin loc={it.location} size={12}/>}
              </div>
            )}
            {/* N73: full subtask list with status */}
            {(()=>{ const sp=subsOf(it); if(!sp) return null;
              return (
                <div style={{borderTop:"1px solid var(--c-border)",paddingTop:6,marginTop:2,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)"}}>☑ {sp.done}/{sp.total} SUBTASKS</span>
                    <span style={{flex:1,height:4,borderRadius:2,background:"var(--c-surface2)",overflow:"hidden"}}>
                      <span style={{display:"block",height:"100%",width:`${(sp.done/sp.total)*100}%`,background:it.color}}/>
                    </span>
                  </div>
                  {sp.subs.slice(0,7).map((s,i2)=>(
                    <div key={i2} style={{fontSize:11,lineHeight:1.5,color:s.done?"var(--c-text-muted)":"var(--c-text)",
                      textDecoration:s.done?"line-through":"none",opacity:s.done?0.65:1}}>
                      {s.done?"✓":"☐"} {s.text||s.title}
                    </div>
                  ))}
                  {sp.total>7 && <div style={{fontSize:10,color:"var(--c-text-muted)",opacity:0.7}}>+{sp.total-7} more</div>}
                </div>
              );
            })()}
            {it.kind!=="event" && (
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
                {r.status&&<span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"1px 7px",background:"var(--c-surface2)",color:"var(--c-text-muted)"}}>{r.status}</span>}
                {r.priority&&<span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"1px 7px",background:"var(--c-surface2)",color:r.priority==="High"?"#ef4444":r.priority==="Low"?"#64748b":"#f59e0b"}}>{r.priority}</span>}
                {r.pinned&&<span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"1px 7px",background:"var(--c-surface2)",color:"var(--c-accent)"}}>📌 Pinned</span>}
                {(r.project||r.cat)&&<span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"1px 7px",background:it.color+"22",color:it.color}}>{r.project||r.cat}</span>}
                {r.recur&&<span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"1px 7px",background:"var(--c-surface2)",color:"var(--c-text-muted)"}}>🔁 {r.recur}</span>}
              </div>
            )}
            {(it.kind==="event" ? (it.win.desc||r.note) : r.description) && (
              <div style={{fontSize:11.5,color:"var(--c-text)",lineHeight:1.55,whiteSpace:"pre-wrap",
                borderTop:"1px solid var(--c-border)",paddingTop:6,marginTop:2}}>
                {it.kind==="event" ? (it.win.desc||r.note) : r.description}
              </div>
            )}
          </div>
        );
      })()}

      {/* Timeline (vertical list — only in list mode) */}
      {mView==="list" && grouped.length===0 ? (
        <div style={{textAlign:"center",padding:"50px 20px",color:"var(--c-text-muted)"}}>
          <div style={{fontSize:44,marginBottom:14}}>🏆</div>
          <div style={{fontSize:15,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>
            {milestones.length===0?(lang==="TH"?"เริ่มสะสมหมุดหมายของคุณ":"Start collecting your milestones"):(lang==="TH"?"ไม่มีในตัวกรองนี้":"None match this filter")}
          </div>
          <div style={{fontSize:12}}>
            {lang==="TH"?"ทุกงานจะติ๊ก 🏆 ไว้อัตโนมัติ — พอทำเสร็จจะมาโชว์ที่นี่":"Every task is marked 🏆 by default — complete it to see it here"}
          </div>
        </div>
      ) : mView==="list" ? (
        <div style={{position:"relative",paddingLeft:8}}>
          {/* Vertical timeline spine */}
          <div style={{position:"absolute",left:16,top:8,bottom:8,width:2,background:"linear-gradient(to bottom,#f59e0b,#f59e0b33)"}}/>

          {grouped.map((group,gi)=>(
            <div key={gi} style={{marginBottom:28,position:"relative"}}>
              {/* Month label */}
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"#f59e0b",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,zIndex:1,
                  boxShadow:"0 2px 8px #f59e0b66"}}>🏆</div>
                <div style={{fontSize:14,fontWeight:800,color:"var(--c-text)"}}>{group.label}</div>
                <div style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:600}}>
                  {group.items.length} {lang==="TH"?"รายการ":"done"}
                </div>
              </div>

              {/* Milestone cards */}
              <div style={{marginLeft:44,display:"flex",flexDirection:"column",gap:8}}>
                {group.items.map(m=>{
                  const isWork = m._type==="work";
                  const cc = isWork?projectColor(m.project):(CAT_COLOR[m.cat]||"#94a3b8");
                  const doneDate = new Date(m.milestoneAt);
                  const isPrio = !!m.milestonePriority; // N35: priority milestone stands out
                  const togglePrio = (e) => {
                    e.stopPropagation();
                    if (isWork) {
                      const next = work.map(t=>t.id===m.id?{...t,milestonePriority:!isPrio}:t);
                      setWork(next); try{window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
                    } else {
                      const next = personal.map(t=>t.id===m.id?{...t,milestonePriority:!isPrio}:t);
                      setPersonal(next); try{window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
                    }
                  };
                  return (
                    <div key={`${m._type}-${m.id}`}
                      onClick={()=>setEditingTask(m)}
                      style={{display:"flex",alignItems:"center",gap:12,padding:isPrio?"15px 16px":"12px 16px",
                        background:isPrio?"#f59e0b16":"var(--c-surface)",
                        border:isPrio?"1.5px solid #f59e0b":"1px solid var(--c-border)",borderRadius:10,
                        borderLeft:isPrio?"6px solid #f59e0b":`4px solid ${cc}`,cursor:"pointer",transition:"all .12s",
                        boxShadow:isPrio?"0 3px 14px #f59e0b33":"var(--c-shadow)"}}
                      onMouseEnter={e=>{e.currentTarget.style.transform="translateX(3px)";e.currentTarget.style.borderLeftColor="#f59e0b";}}
                      onMouseLeave={e=>{e.currentTarget.style.transform="translateX(0)";e.currentTarget.style.borderLeftColor=isPrio?"#f59e0b":cc;}}>
                      <span style={{fontSize:isPrio?22:18,flexShrink:0}}>{isPrio?"⭐":(isWork?"💼":"🏠")}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:isPrio?15.5:13,fontWeight:isPrio?900:700,color:isPrio?"#b45309":"var(--c-text)",marginBottom:3,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          ✓ {m.title}
                        </div>
                        <div style={{fontSize:11,color:"var(--c-text-muted)",display:"flex",gap:8,flexWrap:"wrap"}}>
                          {isWork&&m.project&&<span>📁 {m.project}</span>}
                          {!isWork&&m.cat&&<span>{m.cat}</span>}
                          <span>·</span>
                          <span>✅ {doneDate.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span>
                          <span style={{color:"#f59e0b",fontWeight:700}}>at {doneDate.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                      </div>
                      <span onClick={togglePrio} title={isPrio?"Remove from priority":"Mark as a priority milestone"}
                        style={{fontSize:17,flexShrink:0,cursor:"pointer",opacity:isPrio?1:0.35,transition:"opacity .12s"}}
                        onMouseEnter={e=>e.currentTarget.style.opacity=1}
                        onMouseLeave={e=>e.currentTarget.style.opacity=isPrio?1:0.35}>{isPrio?"⭐":"☆"}</span>
                      <span style={{fontSize:11,color:"var(--c-text-muted)",flexShrink:0}}>✏️</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3A. TODAY TAB — shows overdue + due today tasks (Personal + Work)
// Focus mode: what needs attention RIGHT NOW
// ─────────────────────────────────────────────────────────────────────────────
function TodayTab({ personal, work, setPersonal, setWork, lang="EN" }) {
  const todayIso = fmtLocal(TODAY);
  const [editingTask, setEditingTask] = useState(null);

  const allTasks = useMemo(()=>[
    ...personal.map(t=>({...t,_type:"personal"})),
    ...work.map(t=>({...t,_type:"work"})),
  ],[personal,work]);

  const overdue = useMemo(()=>
    allTasks.filter(t=>isOverdue(t)).sort((a,b)=>new Date(a.due)-new Date(b.due))
  ,[allTasks]);

  const dueToday = useMemo(()=>
    allTasks.filter(t=>t.due===todayIso&&t.status!=="done"&&t.status!=="overdue")
      .sort((a,b)=>new Date(a.due)-new Date(b.due))
  ,[allTasks,todayIso]);

  const doneToday = useMemo(()=>
    allTasks.filter(t=>t.due===todayIso&&t.status==="done")
  ,[allTasks,todayIso]);

  const handleSave = async (updated) => {
    if (updated._type==="work") {
      const next = applyEditWithRecur(work, updated, "todo");
      setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    } else {
      const next = applyEditWithRecur(personal, updated, "pending");
      setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}
    }
    setEditingTask(null);
  };

  const TaskRow = ({t}) => {
    const isWork = t._type==="work";
    const cc = isWork?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
    const isDone = t.status==="done";
    const isOverdue = t.status==="overdue";
    return (
      <div onClick={()=>setEditingTask(t)}
        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
          borderLeft:`3px solid ${cc}`,borderBottom:`1px solid var(--c-border)`,
          background:"var(--c-surface)",cursor:"pointer",transition:"background .1s",
          opacity:isDone?0.6:1}}
        onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
        onMouseLeave={e=>e.currentTarget.style.background="var(--c-surface)"}>
        <span style={{fontSize:13,flexShrink:0}}>{isWork?"💼":"🏠"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div className="lp-scale-data" style={{fontSize:13,fontWeight:600,color:"var(--c-text)",
            textDecoration:isDone?"line-through":"none",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {isDone&&"✓ "}{t.title}
          </div>
          <div className="lp-scale-sub" style={{fontSize:10,color:"var(--c-text-muted)",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
            {t.cat&&<span>{t.cat}</span>}
            {t.project&&<span>📁 {t.project}</span>}
            {t.priority&&<span style={{color:PRIORITY_CFG[t.priority]?.color||"var(--c-text-muted)",fontWeight:700}}>{t.priority}</span>}
          </div>
        </div>
        {isOverdue&&t.due&&<span style={{fontSize:10,fontWeight:800,color:"#ef4444",flexShrink:0,whiteSpace:"nowrap"}}>{Math.abs(daysUntil(t.due))}d overdue</span>}
        <span style={{fontSize:10,color:"var(--c-text-muted)",flexShrink:0}}>✏️</span>
      </div>
    );
  };

  const Section = ({title,icon,tasks,emptyMsg,accent}) => (
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:16}}>{icon}</span>
        <span style={{fontSize:12,fontWeight:800,color:accent,letterSpacing:"0.06em"}}>{title}</span>
        <span style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:600}}>({tasks.length})</span>
      </div>
      {tasks.length===0?(
        <div style={{padding:"14px 16px",background:"var(--c-surface2)",borderRadius:10,
          fontSize:12,color:"var(--c-text-muted)",textAlign:"center",fontStyle:"italic"}}>
          {emptyMsg}
        </div>
      ):(
        <div style={{borderRadius:10,overflow:"hidden",border:`1px solid var(--c-border)`}}>
          {tasks.map(t=><TaskRow key={`${t._type}-${t.id}`} t={t}/>)}
        </div>
      )}
    </div>
  );

  const totalActionable = overdue.length + dueToday.length;

  return (
    <div style={{padding:"16px 0"}}>
      {editingTask&&<TaskDetailModal task={editingTask} onSave={handleSave} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{
          const copy=duplicateTask(t);
          if(copy._type==="work"){const n=[...work,copy];setWork(n);window.storage.set(pkG(W_KEY),JSON.stringify(n)).catch(()=>{});}
          else{const n=[...personal,copy];setPersonal(n);window.storage.set(pkG(P_KEY),JSON.stringify(n)).catch(()=>{});}
        }}/>}

      {/* Header */}
      <div style={{marginBottom:20,padding:"16px 20px",background:"var(--c-surface)",
        border:`1px solid var(--c-border)`,borderRadius:12}}>
        <div style={{fontSize:18,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>
          🔥 {lang==="TH"?"วันนี้":"Today"} — {TODAY.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}
        </div>
        <div style={{fontSize:12,color:"var(--c-text-muted)"}}>
          {totalActionable===0
            ? "🎉 All clear! No overdue or due-today tasks."
            : `${totalActionable} task${totalActionable!==1?"s":""} need your attention`}
        </div>
      </div>

      <Section title="OVERDUE" icon="🚨" tasks={overdue} accent="#ef4444"
        emptyMsg="✅ No overdue tasks — you're on track!"/>
      <Section title="DUE TODAY" icon="📅" tasks={dueToday} accent="#f59e0b"
        emptyMsg="Nothing due today — check Tomorrow or This Week in Overview"/>
      {doneToday.length>0&&(
        <Section title="COMPLETED TODAY" icon="✅" tasks={doneToday} accent="#22c55e"
          emptyMsg=""/>
      )}

      {totalActionable===0&&doneToday.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:"var(--c-text-muted)"}}>
          <div style={{fontSize:40,marginBottom:12}}>🎯</div>
          <div style={{fontSize:14,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>You're all caught up!</div>
          <div style={{fontSize:12}}>Check the Overview tab for upcoming tasks</div>
        </div>
      )}
    </div>
  );
}

function TimelineTab({ personal, work, setPersonal, setWork, events=[], widgetOrder=DEFAULT_WIDGETS, onReorderWidgets, lang="EN", onTaskSave }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [filterCat, setFilterCat]         = useState("All");
  const [filterLoc, setFilterLoc]         = useState("All");
  const [filterSrc, setFilterSrc]         = useState("All");
  const [filterStatus, setFilterStatus]   = useState("All");
  const [editingTask, setEditingTask]      = useState(null);
  const [lightboxItem, setLightboxItem]    = useState(null);

  // Save handler
  const handleSaveTask = async (updated) => {
    const prevT = (updated._type==="work"?work:personal).find(t=>t.id===updated.id);
    const isDone = prevT && prevT.status!=="done" && updated.status==="done";
    if (updated._type === "work") {
      const next = applyEditWithRecur(work, updated, "todo");
      setWork(next);
      try { await window.storage.set(pkG(W_KEY), JSON.stringify(next)); } catch {}
    } else {
      const next = applyEditWithRecur(personal, updated, "pending");
      setPersonal(next);
      try { await window.storage.set(pkG(P_KEY), JSON.stringify(next)); } catch {}
    }
    logAct(isDone?"done":"edit", `${isDone?"Completed":"Edited"}: ${updated.title}`, updated._type, "from Overview");
    setEditingTask(null);
  };

  // Toggle pin from Overview
  const handleTogglePin = async (t) => {
    if (t._type === "work") {
      const next = work.map(x => x.id===t.id ? {...x, pinned:!x.pinned} : x);
      setWork(next);
      try { await window.storage.set(pkG(W_KEY), JSON.stringify(next)); } catch {}
    } else {
      const next = personal.map(x => x.id===t.id ? {...x, pinned:!x.pinned} : x);
      setPersonal(next);
      try { await window.storage.set(pkG(P_KEY), JSON.stringify(next)); } catch {}
    }
  };

  const allActive = useMemo(()=>[
    ...personal.map(t=>({...t,_type:"personal"})),
    ...work.map(t=>({...t,_type:"work",_status:t.status==="todo"||t.status==="inprogress"||t.status==="review"?"pending":"done"})),
  ],[personal,work]);

  // Pinned tasks — all pinned regardless of filters
  const pinnedTasks = useMemo(()=>[
    ...personal.filter(t=>t.pinned&&t.status!=="done").map(t=>({...t,_type:"personal"})),
    ...work.filter(t=>t.pinned&&t.status!=="done").map(t=>({...t,_type:"work"})),
  ].sort((a,b)=>{
    // High first, then by due date
    const po={High:0,Medium:1,Low:2};
    const pd=(po[a.priority??'Medium']??1)-(po[b.priority??'Medium']??1);
    if(pd!==0) return pd;
    const aD=a.due?daysUntil(a.due):9999;
    const bD=b.due?daysUntil(b.due):9999;
    return aD-bD;
  }),[personal,work]);

  // derive unique locations
  const allLocations = useMemo(()=>{
    const locs = new Set();
    allActive.forEach(t=>{ if(t.location&&t.location.trim()) locs.add(t.location.trim()); });
    return ["All",...[...locs].sort()];
  },[allActive]);

  // derive unique categories
  const allCats = useMemo(()=>{
    const cats = new Set();
    allActive.forEach(t=>{ if(t.cat) cats.add(t.cat); });
    return ["All",...[...cats].sort()];
  },[allActive]);

  // derive unique statuses across personal + work
  const allStatuses = useMemo(()=>{
    const ss = new Set();
    allActive.forEach(t=>{ if(t.status) ss.add(t.status); });
    // canonical order first
    const order = ["pending","overdue","done","todo","inprogress","review"];
    const ordered = order.filter(s=>ss.has(s));
    const extra = [...ss].filter(s=>!order.includes(s)).sort();
    return ["All",...ordered,...extra];
  },[allActive]);

  // apply filters
  const filtered = useMemo(()=>{
    let l = allActive;
    if(filterSrc==="Personal")  l=l.filter(t=>t._type==="personal");
    if(filterSrc==="Work")      l=l.filter(t=>t._type==="work");
    if(filterCat!=="All")       l=l.filter(t=>t.cat===filterCat);
    if(filterLoc!=="All")       l=l.filter(t=>t.location===filterLoc);
    if(filterStatus!=="All")    l=l.filter(t=>t.status===filterStatus);
    return l;
  },[allActive,filterSrc,filterCat,filterLoc,filterStatus]);

  const activeOnly = filtered.filter(t=>t.status!=="done");
  const years = useMemo(()=>{const ys=new Set();filtered.forEach(t=>{if(t.due)ys.add(new Date(t.due).getFullYear());});return[...ys].filter(y=>y>=THIS_YEAR).sort();},[filtered]);
  const overdues = filtered.filter(t=>isOverdue(t));
  const upNext = useMemo(()=>filtered.filter(t=>t.due&&!isOverdue(t)&&t.status!=="done").map(t=>({...t,days:daysUntil(t.due)})).filter(t=>t.days>=0&&t.days<=90).sort((a,b)=>a.days-b.days),[filtered]);

  // N-NowComingSoon: Today / This Week / Next 2-4 Weeks — split Personal vs Work, includes done (strikethrough)
  const nowComingSoon = useMemo(()=>{
    const inRange = filtered.filter(t=>{
      if (!t.due || t.status==="overdue") return false;
      const d = daysUntil(t.due);
      return d!==null && d>=0 && d<=28; // today through 4 weeks ahead
    }).sort((a,b)=>new Date(a.due)-new Date(b.due));

    const bucket = (d) => d<=0 ? "today" : d<=7 ? "week" : "next4";
    const build = (type) => {
      const items = inRange.filter(t=>t._type===type);
      const groups = { today:[], week:[], next4:[] };
      items.forEach(t=>{ groups[bucket(daysUntil(t.due))].push(t); });
      return groups;
    };
    return { personal: build("personal"), work: build("work") };
  },[filtered]);
  const monthItems = selectedMonth ? filtered.filter(t=>{if(!t.due)return false;const d=new Date(t.due);return d.getFullYear()===selectedMonth.year&&d.getMonth()===selectedMonth.month;}).sort((a,b)=>new Date(a.due)-new Date(b.due)) : [];

  // Pre-compute noDate tasks for inline panel (avoids IIFE in JSX)
  const noDateTasks = useMemo(()=>
    filtered.filter(t=>!t.due&&t.status!=="done"&&t.status!=="overdue")
  ,[filtered]);

  const activeFilters = (filterCat!=="All"?1:0)+(filterLoc!=="All"?1:0)+(filterSrc!=="All"?1:0)+(filterStatus!=="All"?1:0);

  const statusColor = s => s==="overdue"?"#ef4444":s==="done"?"#22c55e":s==="pending"?"#94a3b8":s==="inprogress"?"#60a5fa":s==="review"?"#a78bfa":s==="todo"?"var(--c-text-muted)":s==="postponed"?"#f59e0b":s==="delayed"?"#ef4444":s==="ontrack"?"#22c55e":"#818cf8";
  const statusLabel = s => s==="todo"?"To Do":s==="inprogress"?"In Progress":s==="review"?"Review":s.charAt(0).toUpperCase()+s.slice(1);

  const tl = i18n[lang]||i18n.EN;

  // Widget drag-drop reorder helper (simple up/down arrows)
  const moveWidget = (id, dir) => {
    if (!onReorderWidgets) return;
    const arr = [...widgetOrder];
    const i = arr.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onReorderWidgets(arr);
  };
  // B5: hide a widget (remove from order); restore-all lives in Config
  const hideWidget = (id) => {
    if (!onReorderWidgets) return;
    onReorderWidgets(widgetOrder.filter(w=>w!==id));
  };
  const isWidgetOn = (id) => widgetOrder.includes(id);

  const pillBtn = (active, color="#6366f1") => ({
    padding:"3px 11px", borderRadius:20, border:"1px solid",
    fontSize:11, fontWeight:700, cursor:"pointer",
    borderColor: active ? color : "var(--c-surface)",
    background:  active ? color+"22" : "transparent",
    color:       active ? color : "var(--c-text-muted)",
  });


  return (
    <div>
      {editingTask && <TaskDetailModal task={editingTask} onSave={handleSaveTask} onClose={()=>{setEditingTask(null);setAddingType(null);}}
        onDuplicate={t=>{
          const copy = duplicateTask(t);
          if (copy._type==="work") { const next=[...work,copy]; setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{}); }
          else { const next=[...personal,copy]; setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{}); }
        }}/>}
      {lightboxItem && <MediaLightbox item={lightboxItem} onClose={()=>setLightboxItem(null)}/>}

      {/* ── Overdue banner ── */}
      {/* ── Overdue banner — N1: clickable to edit ── */}
      {overdues.length>0&&(
        <div style={{background:"linear-gradient(135deg,#7f1d1d,#450a0a)",border:"1px solid #ef444433",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
          <div style={{color:"#fca5a5",fontWeight:800,fontSize:12,letterSpacing:"0.06em",marginBottom:10}}>🚨 {overdues.length} OVERDUE — click to edit</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {overdues.map(t=>{
              const cc=CAT_COLOR[t.cat]||WORK_CAT_COLOR[t.cat]||"#ef4444";
              return(
                <div key={`${t._type}-${t.id}`}
                  onClick={()=>setEditingTask(t)}
                  style={{display:"flex",gap:8,alignItems:"center",background:"#ffffff08",borderRadius:8,
                    padding:"8px 10px",cursor:"pointer",transition:"background .15s",
                    borderLeft:`3px solid ${cc}`}}
                  onMouseEnter={e=>e.currentTarget.style.background="#ffffff18"}
                  onMouseLeave={e=>e.currentTarget.style.background="#ffffff08"}>
                  <Chip color={cc}>{t.cat}</Chip>
                  <span style={{fontSize:11,color:"#fecaca",flex:1,fontWeight:600}}>{t.title}</span>
                  {t.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:"#60a5fa",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>📍 {t.location}</a>}
                  <Chip color={t._type==="work"?"#818cf8":"#34d399"} small>{t._type==="work"?"Work":"Personal"}</Chip>
                  <span style={{fontSize:10,color:"#f87171",flexShrink:0}}>✏️</span>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ── Now & Coming Soon — N-NowComingSoon ── */}
      <NowComingSoonSection data={nowComingSoon} onTaskClick={setEditingTask}/>

      {/* ── Filters ── */}
      <div style={{background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:12,padding:"12px 16px",marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em"}}>🔍 VIEW FILTERS</span>
          {activeFilters>0&&<button onClick={()=>{setFilterCat("All");setFilterLoc("All");setFilterSrc("All");setFilterStatus("All");}} style={{fontSize:10,fontWeight:700,color:"#f87171",background:"#7f1d1d22",border:"1px solid #7f1d1d44",borderRadius:20,padding:"2px 10px",cursor:"pointer"}}>✕ Clear {activeFilters}</button>}
          {onReorderWidgets&&<span style={{marginLeft:"auto",fontSize:9,color:"var(--c-text-muted)"}}>↑↓ reorder · ✕ hide panels</span>}
          {onReorderWidgets&&widgetOrder.length<DEFAULT_WIDGETS.length&&(
            <button onClick={()=>onReorderWidgets(DEFAULT_WIDGETS)} style={{fontSize:9,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f144",borderRadius:20,padding:"2px 10px",cursor:"pointer"}}>↺ Restore hidden widgets</button>
          )}
        </div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:5}}>SOURCE</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{["All","Personal","Work"].map(s=><button key={s} onClick={()=>setFilterSrc(s)} style={pillBtn(filterSrc===s,s==="Work"?"#818cf8":s==="Personal"?"#34d399":"#6366f1")}>{s==="All"?"🗂 All":s==="Personal"?"🏠 Personal":"💼 Work"}</button>)}</div>
        </div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:5}}>STATUS</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allStatuses.map(s=><button key={s} onClick={()=>setFilterStatus(s)} style={pillBtn(filterStatus===s,s==="All"?"#6366f1":statusColor(s))}>{s==="All"?"All status":statusLabel(s)}</button>)}</div>
        </div>
        <div style={{marginBottom:allLocations.length>1?8:0}}>
          <div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:5}}>CATEGORY</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allCats.map(c=><button key={c} onClick={()=>setFilterCat(c)} style={pillBtn(filterCat===c,c==="All"?"#6366f1":CAT_COLOR[c]||WORK_CAT_COLOR[c]||"#6366f1")}>{c==="All"?"All categories":c}</button>)}</div>
        </div>
        {allLocations.length>1&&(<div><div style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:5}}>📍 LOCATION</div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allLocations.map(l=><button key={l} onClick={()=>setFilterLoc(l)} style={pillBtn(filterLoc===l,"#60a5fa")}>{l==="All"?"All locations":`📍 ${l}`}</button>)}</div></div>)}
      </div>

      {/* N40: widgets render in widgetOrder sequence — this is what makes ↑↓ work.
           Previously the JSX order was hardcoded, so reordering changed nothing. */}
      {(()=>{
        const WIDGETS = {
          pinned: (<>
        {/* ── PINNED PANEL ── */}
        {pinnedTasks.length>0&&isWidgetOn("pinned")&&(
          <div style={{background:"linear-gradient(135deg,#f59e0b18,#f59e0b08)",border:"1px solid #f59e0b44",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:16}}>📌</span>
              <span style={{color:"#fbbf24",fontWeight:800,fontSize:13,letterSpacing:"0.06em"}}>
                {(i18n[lang]||i18n.EN).pinned} — {pinnedTasks.length} task{pinnedTasks.length!==1?"s":""}
              </span>
              <span style={{fontSize:10,color:"#78716c",marginLeft:"auto"}}>sorted by priority · click to edit · 📌 to unpin</span>
              {onReorderWidgets&&<div style={{display:"flex",gap:3}}>
                <button onClick={()=>moveWidget("pinned",-1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↑</button>
                <button onClick={()=>moveWidget("pinned",1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↓</button>
                <button onClick={()=>hideWidget("pinned")} title="Hide this widget" style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>✕</button>
              </div>}
            </div>
            <div style={{display:"grid",gap:8}}>
              {pinnedTasks.map(t=>{
                const isWork=t._type==="work";
                const cc=isWork?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
                const urg=urgency(t); const pc=PRIORITY_CFG[t.priority||"Medium"];
                return (
                  <div key={`pin-${t._type}-${t.id}`} style={{background:"var(--c-card2)",border:`1px solid ${cc}44`,borderLeft:`4px solid ${cc}`,borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}} onClick={()=>setEditingTask(t)}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                        <Chip color={cc}>{t.cat}</Chip>
                        <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority||"Medium"}</span>
                        <Chip color={isWork?"#818cf8":"#34d399"} small>{isWork?"💼 Work":"🏠 Personal"}</Chip>
                        {urg.label!=="No date"&&<span style={{fontSize:10,fontWeight:700,color:urg.color,background:urg.color+"18",padding:"2px 7px",borderRadius:20}}>{urg.label}</span>}
                      </div>
                      <div style={{color:"var(--c-text)",fontSize:13,fontWeight:600,lineHeight:1.4}}>{t.title}</div>
                      {t.description&&<div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:3}}>{renderMentions(t.description)}</div>}
                      {t.due&&<div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:4}}>📅 {fmtDate(t.due)}</div>}
                    </div>
                    <button title="Unpin" onClick={e=>{e.stopPropagation();handleTogglePin(t);}} style={{flexShrink:0,background:"#f59e0b22",border:"1px solid #f59e0b44",borderRadius:6,padding:"4px 8px",color:"#fbbf24",cursor:"pointer",fontSize:12}}>📌</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </>),
          twoweek: (<>
        {/* ── N39: TWO-WEEK CALENDAR WIDGET ── */}
        {isWidgetOn("twoweek") && (()=>{
          const start = new Date(TODAY); start.setHours(0,0,0,0);
          start.setDate(start.getDate() - ((start.getDay()+6)%7)); // back to Monday
          const days = Array.from({length:14},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
          const todayIso = fmtLocal(TODAY);
          const all = [...personal.map(t=>({...t,_type:"personal"})), ...work.map(t=>({...t,_type:"work"}))];
          const onDay = (iso)=>all.filter(t=>{
            if(!t.due) return false;
            const due=t.due.slice(0,10);
            const st=t.startDate?t.startDate.slice(0,10):due;
            return iso>=st && iso<=due;
          });
          const evOnDay = (iso)=>events.filter(e=>eventWindows(e).some(w=>iso>=w.start.slice(0,10) && iso<=(w.end||w.start).slice(0,10)));
          const DOW = lang==="TH" ? ["จ","อ","พ","พฤ","ศ","ส","อา"] : ["MON","TUE","WED","THU","FRI","SAT","SUN"];
          return (
            <div style={{background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:14,padding:"18px 20px",marginBottom:22}}>
              <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:14}}>
                <span style={{fontSize:13,fontWeight:900,letterSpacing:"0.08em",color:"#0ea5e9"}}>
                  🗓 {lang==="TH"?"ปฏิทิน 2 สัปดาห์":"NEXT 2 WEEKS"}
                </span>
                <span style={{fontSize:12,color:"var(--c-text-muted)",fontWeight:700}}>
                  {days[0].toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} – {days[13].toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
                </span>
                {onReorderWidgets&&<div style={{marginLeft:"auto",display:"flex",gap:3}}>
                  <button onClick={()=>moveWidget("twoweek",-1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↑</button>
                  <button onClick={()=>moveWidget("twoweek",1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↓</button>
                  <button onClick={()=>hideWidget("twoweek")} title="Hide this widget" style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>✕</button>
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
                {DOW.map(d=><div key={d} style={{fontSize:11,fontWeight:800,color:"var(--c-text-muted)",textAlign:"center",letterSpacing:"0.06em"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                {days.map(d=>{
                  const iso = fmtLocal(d);
                  const isToday = iso===todayIso;
                  const tasks = onDay(iso);
                  const evs = evOnDay(iso);
                  const isWeekend = d.getDay()===0||d.getDay()===6;
                  const overdue = tasks.some(t=>t.status!=="done" && iso<todayIso);
                  return (
                    <div key={iso}
                      style={{minHeight:118,borderRadius:10,padding:"8px 9px",overflow:"hidden",
                        background:isToday?"#0ea5e918":isWeekend?"var(--c-surface)":"var(--c-card,var(--c-surface))",
                        border:isToday?"2px solid #0ea5e9":"1px solid var(--c-border)",
                        boxShadow:isToday?"0 2px 12px #0ea5e933":"none"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:isToday?17:15,fontWeight:isToday?900:800,lineHeight:1,color:isToday?"#0284c7":isWeekend?"#f472b6":"var(--c-text)"}}>{d.getDate()}</span>
                        {tasks.length+evs.length>0&&<span style={{fontSize:10,fontWeight:800,borderRadius:10,padding:"1px 6px",color:overdue?"#fff":"var(--c-text-muted)",background:overdue?"#ef4444":"var(--c-surface2)"}}>{tasks.length+evs.length}</span>}
                      </div>
                      {evs.slice(0,2).map(e=>(
                        <div key={e.id} title={e.title} style={{fontSize:11,fontWeight:700,color:"#fff",background:e.color||"#8b5cf6",
                          borderRadius:5,padding:"3px 6px",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.title}</div>
                      ))}
                      {tasks.slice(0,3).map(t=>{
                        const cc = t._type==="work"?groupColor(t.project):groupColor(t.cat);
                        return (
                          <div key={`${t._type}-${t.id}`} onClick={()=>setEditingTask(t)} title={t.title}
                            style={{fontSize:11,fontWeight:600,color:"var(--c-text)",background:cc+"26",borderLeft:`3px solid ${cc}`,
                              borderRadius:5,padding:"3px 6px",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",
                              whiteSpace:"nowrap",cursor:"pointer",opacity:t.status==="done"?0.45:1,
                              textDecoration:t.status==="done"?"line-through":"none"}}>{t.title}</div>
                        );
                      })}
                      {tasks.length+evs.length>5&&<div style={{fontSize:10,color:"var(--c-text-muted)",fontWeight:800,paddingLeft:2}}>+{tasks.length+evs.length-5} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
          </>),
          upnext: (<>
        {/* ── UP NEXT 90 days ── */}
        {isWidgetOn("upnext") && <div style={{marginBottom:22}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"#6366f1"}}>{(i18n[lang]||i18n.EN).upNext} ({upNext.length})</span>
            <span style={{fontSize:10,color:"var(--c-text-muted)",fontWeight:600}}>— click to view &amp; edit</span>
            {onReorderWidgets&&<div style={{marginLeft:"auto",display:"flex",gap:3}}>
              <button onClick={()=>moveWidget("upnext",-1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↑</button>
              <button onClick={()=>moveWidget("upnext",1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↓</button>
              <button onClick={()=>hideWidget("upnext")} title="Hide this widget" style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>✕</button>
            </div>}
          </div>
          {upNext.length===0
            ? <p style={{color:"var(--c-text-muted)",fontSize:13}}>Nothing due in the next 90 days.</p>
            : <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8}}>
                {upNext.map(t=>{
                  const urg=urgency(t);
                  const cc=t._type==="work"?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
                  const mAttach=(t.attachments||[]).filter(a=>{const k=detectAttachType(a);return k==="image"||k==="video"||k==="video-link";});
                  return (
                    <div key={`${t._type}-${t.id}`} onClick={()=>setEditingTask(t)} style={{flexShrink:0,width:205,cursor:"pointer",background:t.days===0?"#f9731615":"var(--c-surface)",border:`1px solid ${t.days===0?"#f9731688":"var(--c-border)"}`,borderTop:`3px solid ${cc}`,borderRadius:10,overflow:"hidden",transition:"transform .15s,box-shadow .15s,border-color .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 24px ${cc}33`;e.currentTarget.style.borderColor=cc;}}
                      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";e.currentTarget.style.borderColor=t.days===0?"#f9731688":"var(--c-border)";}}>
                      {mAttach.length>0&&(
                        <div style={{display:"flex",gap:2,height:80,overflow:"hidden",background:"var(--c-card2)"}}>
                          {mAttach.slice(0,2).map((a,ai)=>{
                            const kind=detectAttachType(a);const src=a.type==="file"?a.data:a.url;
                            return (
                              <div key={a.id} style={{flex:1,overflow:"hidden",cursor:"pointer"}} onClick={e=>{e.stopPropagation();setLightboxItem(a);}}>
                                {kind==="image"
                                  ? <img src={src} alt={a.name||""} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.target.style.display="none";}}/>
                                  : <div style={{width:"100%",height:"100%",background:"var(--c-surface)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:20}}>▶️</span></div>}
                              </div>
                            );
                          })}
                          {mAttach.length>2&&<div style={{flex:1,background:"var(--c-card2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--c-text-muted)",fontSize:13,fontWeight:800}}>+{mAttach.length-2}</div>}
                        </div>
                      )}
                      <div style={{padding:"11px 13px",position:"relative"}}>
                        <div style={{position:"absolute",top:8,right:8,fontSize:10,color:cc,opacity:0.6,fontWeight:700}}>✏️</div>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,paddingRight:16}}>
                          <Chip color={cc}>{t.cat}</Chip>
                          <span style={{color:urg.color,fontSize:11,fontWeight:800,background:urg.color+"18",padding:"2px 7px",borderRadius:20}}>{urg.label}</span>
                        </div>
                        <div style={{color:"var(--c-text)",fontSize:12,lineHeight:1.4,marginBottom:4,fontWeight:600}}>{t.title}</div>
                        {t.description&&<div style={{fontSize:11,color:"var(--c-text-muted)",lineHeight:1.4,marginBottom:4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{t.description}</div>}
                        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{color:"var(--c-text-muted)",fontSize:10}}>{fmtDate(t.due)}</span>
                          <Chip color={t._type==="work"?"#818cf8":"#34d399"} small>{t._type==="work"?"Work":"Personal"}</Chip>
                        </div>
                        {t.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:"inline-flex",alignItems:"center",gap:3,marginTop:5,color:"#60a5fa",fontSize:10,textDecoration:"none",fontWeight:600}}>📍 <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{t.location}</span></a>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>}
          </>),
          yearband: (<>
        {/* ── YEAR BAND ── */}
        {isWidgetOn("yearband") && <div style={{background:"var(--c-surface2)",borderRadius:14,padding:"16px 18px",border:"1px solid var(--c-border)",marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:"var(--c-text-muted)"}}>📆 YEAR OVERVIEW — click month to see details</span>
            {activeFilters>0&&<span style={{color:"#6366f1",fontSize:10}}>({filtered.filter(t=>t.due).length} shown)</span>}
            {onReorderWidgets&&<div style={{marginLeft:"auto",display:"flex",gap:3}}>
              <button onClick={()=>moveWidget("yearband",-1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↑</button>
              <button onClick={()=>moveWidget("yearband",1)} style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>↓</button>
              <button onClick={()=>hideWidget("yearband")} title="Hide this widget" style={{padding:"1px 5px",borderRadius:4,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:10}}>✕</button>
            </div>}
          </div>
          {years.length===0&&<p style={{color:"var(--c-text-muted)",fontSize:13,margin:0}}>No tasks match filters.</p>}
          {years.map(year=>{
            const monthCounts=MONTHS.map((_,mi)=>filtered.filter(t=>{if(!t.due)return false;const [yy,mm,dd]=t.due.slice(0,10).split("-").map(Number);const d=new Date(yy,(mm||1)-1,dd||1,12,0,0);return d.getFullYear()===year&&d.getMonth()===mi;}).length);
            const maxC=Math.max(1,...monthCounts);const isCY=year===THIS_YEAR;
            const displayYear=lang==="TH"?toThaiYear(year):year;
            return (
              <div key={year} style={{marginBottom:6}}>
                <div style={{display:"grid",gridTemplateColumns:"48px repeat(12,1fr)",gap:4,alignItems:"end"}}>
                  <div style={{color:"var(--c-text-muted)",fontSize:12,fontWeight:800,letterSpacing:"0.06em",display:"flex",alignItems:"flex-end",paddingBottom:4}}>{displayYear}</div>
                  {MONTHS.map((m,mi)=>{
                    const count=monthCounts[mi];const isPast=isCY&&mi<THIS_MONTH;const isCur=isCY&&mi===THIS_MONTH;
                    const isSel=selectedMonth?.year===year&&selectedMonth?.month===mi;
                    const barH=count>0?Math.max(8,Math.round((count/maxC)*52)):3;
                    return (
                      <button key={m} onClick={()=>count>0&&setSelectedMonth(isSel?null:{year,month:mi})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:count>0?"pointer":"default",padding:"0 2px"}}>
                        <div style={{width:"100%",height:56,display:"flex",alignItems:"flex-end",justifyContent:"center"}}><div style={{width:"80%",height:barH,borderRadius:4,background:isSel?"#a5b4fc":isCur?"#6366f1":isPast?"var(--c-surface)":count>0?"var(--c-border)":"var(--c-surface)",opacity:isPast&&!isSel?0.4:1,outline:isSel?"2px solid #6366f1":"none",outlineOffset:2}}/></div>
                        <span style={{fontSize:10,fontWeight:isCur?800:600,color:isSel?"#a5b4fc":isCur?"#6366f1":isPast?"var(--c-border)":count>0?"var(--c-text-muted)":"var(--c-surface)"}}>{m}</span>
                        <span style={{fontSize:10,fontWeight:700,color:isSel?"#a5b4fc":isCur?"#818cf8":count>0?"var(--c-text-muted)":"transparent"}}>{count>0?count:"·"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>}
          </>),
        };
        const order = widgetOrder.filter(id=>WIDGETS[id]);
        return order.map(id=><React.Fragment key={id}>{WIDGETS[id]}</React.Fragment>);
      })()}
      {/* ── Month drill-down ── */}
      {selectedMonth&&monthItems.length>0&&(
        <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:14,padding:"16px 18px",marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{color:"#a5b4fc",fontWeight:800,fontSize:14}}>📅 {MONTHS[selectedMonth.month]} {lang==="TH"?toThaiYear(selectedMonth.year):selectedMonth.year} — {monthItems.length} tasks</span>
            <button onClick={()=>setSelectedMonth(null)} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:18}}>×</button>
          </div>
          <div style={{fontSize:10,color:"var(--c-text-muted)",marginBottom:8}}>Click any task to edit ✏️</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {monthItems.map(t=>{
              const urg=urgency(t);
              const cc=t._type==="work"?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
              const pc=PRIORITY_CFG[t.priority||"Medium"];
              return (
                <div key={`${t._type}-${t.id}`}
                  onClick={()=>setEditingTask(t)}
                  style={{display:"flex",gap:10,alignItems:"flex-start",padding:"9px 12px",
                    background:"var(--c-card2)",borderRadius:9,borderLeft:`3px solid ${cc}`,
                    cursor:"pointer",transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                  onMouseLeave={e=>e.currentTarget.style.background="var(--c-card2)"}>
                  <div style={{flex:1}}>
                    <div style={{color:"var(--c-text)",fontSize:13,lineHeight:1.4}}>{t.title}</div>
                    <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                      <Chip color={cc}>{t.cat}</Chip>
                      <Chip color={t._type==="work"?"#818cf8":"#34d399"} small>{t._type==="work"?"💼 Work":"🏠 Personal"}</Chip>
                      {t.priority&&<span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority}</span>}
                      {urg.label!=="No date"&&<span style={{fontSize:10,fontWeight:700,color:urg.color}}>{urg.label}</span>}
                      {t.status==="postponed"&&t.delayLabel&&<span style={{fontSize:9,fontWeight:800,color:"#f59e0b"}}>🔶 {t.delayLabel}</span>}
                      {t.status==="delayed"&&t.delayLabel&&<span style={{fontSize:9,fontWeight:800,color:"#ef4444"}}>🔴 {t.delayLabel}</span>}
                    </div>
                    {t.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:"inline-flex",alignItems:"center",gap:3,marginTop:5,color:"#60a5fa",fontSize:10,textDecoration:"none",fontWeight:600}}>📍 {t.location}</a>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                    <span style={{color:"var(--c-text-muted)",fontSize:11,whiteSpace:"nowrap"}}>{fmtDate(t.due)}</span>
                    <span style={{fontSize:10,color:"var(--c-text-muted)"}}>✏️</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── No Date Tasks (inline, editable) ── */}
      {noDateTasks.length>0&&(
        <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:12,padding:"14px 16px",marginTop:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:13}}>📋</span>
            <span style={{fontSize:11,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em"}}>NO DATE ({noDateTasks.length})</span>
            <span style={{fontSize:10,color:"var(--c-text-muted)"}}>— click ✏️ to add a due date</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {noDateTasks.map(t=>{
              const cc=t._type==="work"?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
              const pc=PRIORITY_CFG[t.priority||"Medium"];
              return(
                <div key={`${t._type}-${t.id}`} style={{display:"flex",gap:8,alignItems:"center",padding:"7px 10px",background:"var(--c-surface2)",borderRadius:8,borderLeft:`2px solid ${cc}`}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:cc,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:"var(--c-text)",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  </div>
                  <Chip color={cc}>{t.cat}</Chip>
                  <span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:20,background:pc.bg,color:pc.color,flexShrink:0}}>{t.priority||"M"}</span>
                  <Chip color={t._type==="work"?"#818cf8":"#34d399"} small>{t._type==="work"?"W":"P"}</Chip>
                  <button onClick={()=>setEditingTask(t)} style={{flexShrink:0,background:"#1e40af22",border:"1px solid #1e40af55",borderRadius:5,padding:"3px 8px",color:"#60a5fa",cursor:"pointer",fontSize:10,fontWeight:700}}>✏️ Add Date</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit modal for no-date tasks */}
      {editingTask&&<TaskDetailModal task={editingTask} onSave={t=>{onTaskSave&&onTaskSave(t);setEditingTask(null);}} onClose={()=>setEditingTask(null)}
        onDuplicate={t=>{
          const copy = duplicateTask(t);
          if (copy._type==="work") { const next=[...work,copy]; setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{}); }
          else { const next=[...personal,copy]; setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{}); }
        }}/>}
    </div>
  );
}

function DataModal({ personal, work, customTabs, onImport, onImportAppend, onClose }) {
  const [mode, setMode]             = useState("export");
  const [importText, setImportText]  = useState("");
  const [importError, setImportError]= useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [csvText, setCsvText]        = useState(""); // Q3 CSV import
  const [csvMsg, setCsvMsg]          = useState("");
  const [copied, setCopied]         = useState(false);
  const [zipping, setZipping]       = useState(false);
  const [zipProgress, setZipProgress] = useState("");
  const [sizeWarning, setSizeWarning] = useState(null); // {sizeMB, action, msg}

  const today = fmtLocal(new Date());

  // ─── Size helpers ─────────────────────────────────────────────────────────
  const countAttach = (list) =>
    list.reduce((s, t) => s + ((t.attachments||[]).filter(a=>a.type==="file").length), 0);
  const totalFileAttach = countAttach(personal) + countAttach(work);
  const totalLinkAttach = [...personal,...work].reduce((s,t)=>s+((t.attachments||[]).filter(a=>a.type!=="file").length),0);

  // Estimate JSON size in bytes
  const estimateJSONSize = () => {
    const payload = { personal, work, customTabs: customTabs||[], exportedAt: new Date().toISOString(), version: 4 };
    return new Blob([JSON.stringify(payload)]).size;
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/1024/1024).toFixed(1) + " MB";
  };

  // ─── Full JSON payload (with config) ─────────────────────────────────────
  const makeFullPayload = () => JSON.stringify({
    personal,
    work,
    customTabs: customTabs || [],
    exportedAt: new Date().toISOString(),
    version: 4,
  }, null, 2);

  // ─── Size warning gate ────────────────────────────────────────────────────
  const checkSizeAndRun = (actionFn, actionLabel) => {
    const bytes = estimateJSONSize();
    const mb = bytes / (1024 * 1024);
    if (mb > 50) {
      setSizeWarning({ sizeMB: mb.toFixed(1), action: actionFn, label: actionLabel, level: "critical" });
    } else if (mb > 10) {
      setSizeWarning({ sizeMB: mb.toFixed(1), action: actionFn, label: actionLabel, level: "warn" });
    } else {
      actionFn();
    }
  };

  // ─── JSON download ────────────────────────────────────────────────────────
  const doDownloadJSON = () => {
    const data = makeFullPayload();
    const blob = new Blob([data], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `My-Todo-Planner-v${APP_VERSION}-Backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSizeWarning(null);
  };
  const handleDownloadJSON = () => checkSizeAndRun(doDownloadJSON, "Download JSON");

  // ─── ZIP ──────────────────────────────────────────────────────────────────
  const doZIP = async () => {
    setSizeWarning(null);
    setZipping(true);
    setZipProgress("Preparing files…");

    const buildZIP = (files) => {
      const enc = new TextEncoder();
      const toU8 = (s) => (typeof s === "string") ? enc.encode(s) : s;
      const crc32 = (() => {
        const table = new Uint32Array(256);
        for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);table[i]=c;}
        return (data) => { let crc=0xFFFFFFFF; for(let i=0;i<data.length;i++)crc=table[(crc^data[i])&0xFF]^(crc>>>8); return(crc^0xFFFFFFFF)>>>0; };
      })();
      const u16=(n)=>{const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b;};
      const u32=(n)=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;};
      const concat=(...arrs)=>{const total=arrs.reduce((s,a)=>s+a.length,0);const out=new Uint8Array(total);let pos=0;for(const a of arrs){out.set(a,pos);pos+=a.length;}return out;};
      const lhs=[]; const cd=[]; let offset=0;
      for(const{name,data}of files){
        const nameB=enc.encode(name); const fileB=toU8(data); const crc=crc32(fileB);
        const lh=concat(new Uint8Array([0x50,0x4B,0x03,0x04]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(fileB.length),u32(fileB.length),u16(nameB.length),u16(0),nameB,fileB);
        lhs.push(lh);
        cd.push(concat(new Uint8Array([0x50,0x4B,0x01,0x02]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(fileB.length),u32(fileB.length),u16(nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameB));
        offset+=lh.length;
      }
      const cdOffset=offset; const cdData=concat(...cd);
      const eocd=concat(new Uint8Array([0x50,0x4B,0x05,0x06]),u16(0),u16(0),u16(cd.length),u16(cd.length),u32(cdData.length),u32(cdOffset),u16(0));
      return concat(...lhs,cdData,eocd);
    };

    try {
      const files = [];
      setZipProgress("Creating JSON backup…");
      files.push({ name:"My-Todo-Planner-Backup.json", data: makeFullPayload() });

      setZipProgress("Creating Excel summary…");
      const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const makeSheet=(cols,rows,sn)=>{
        const h=`<Row ss:StyleID="hdr">${cols.map(c=>`<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`;
        const d=rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==="number"?"Number":"String"}">${esc(v)}</Data></Cell>`).join("")}</Row>`).join("\n");
        return `<Worksheet ss:Name="${esc(sn)}"><Table>${h}${d}</Table></Worksheet>`;
      };
      const pCols=["ID","Title","Category","Status","Start Date","End Date","Recurrence","Type","Priority","Pinned","Description","Location","Notes","Attachments"];
      const wCols=["ID","Title","Category","Status","Priority","Pinned","Project","Assignee","Start Date","End Date/Due","Progress%","Description","Location","Notes","Subtasks","Attachments"];
      const attachSummary=t=>{const f_=(t.attachments||[]).filter(a=>a.type==="file").map(a=>`[file] task${t.id}/${a.name||"file"}`);const l_=(t.attachments||[]).filter(a=>a.type!=="file").map(a=>`[link] ${a.url||""}`);return[...f_,...l_].join(" | ");};
      const pRows=personal.map(t=>[t.id,t.title||"",t.cat||"",t.status||"",t.due||"",t.recur||"",t.isRecurring?"Recurring":"One-time",t.priority||"Medium",t.pinned?"Yes":"No",t.description||"",t.location||"",t.notes||"",attachSummary(t)]);
      const wRows=work.map(t=>{const d=(t.subtasks||[]).filter(s=>s.done).length,tot=(t.subtasks||[]).length;return[t.id,t.title||"",t.cat||"",t.status||"",t.priority||"",t.pinned?"Yes":"No",t.project||"",t.assignee||"",t.startDate||"",t.due||"",tot>0?Math.round(d/tot*100):(t.progress||0),t.description||"",t.location||"",t.notes||"",tot>0?`${d}/${tot}`:"",attachSummary(t)];});

      // Custom tabs sheet
      const ctCols=["ID","Label","Emoji","Source","Categories","Hide Status"];
      const ctRows=(customTabs||[]).map(ct=>[ct.id,ct.label||"",ct.emoji||"",ct.source||"all",(ct.cats||[]).join(", "),(ct.hideStatus||[]).join(", ")]);

      const xlsXml=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6366F1" ss:Pattern="Solid"/></Style></Styles>${makeSheet(pCols,pRows,"Personal Tasks")}${makeSheet(wCols,wRows,"Work Tasks")}${makeSheet(ctCols,ctRows,"Custom Tabs")}</Workbook>`;
      files.push({ name:"My-Todo-Planner-Tasks.xls", data:xlsXml });

      const readme=`MY TODO PLANNER BACKUP\n========================\nExported: ${new Date().toLocaleString("en-GB")}\nPersonal tasks: ${personal.length}\nWork tasks: ${work.length}\nCustom tabs: ${(customTabs||[]).length}\nFile attachments: ${totalFileAttach}\nLink attachments: ${totalLinkAttach}\n\nFILES IN THIS ZIP:\n- My-Todo-Planner-Backup.json    Full backup (tasks + config + attachments) — use to RESTORE\n- My-Todo-Planner-Tasks.xls     Readable Excel (Personal, Work, Custom Tabs sheets)\n- attachments/          Real attachment files organised by task ID\n- README.txt            This file\n\nHOW TO RESTORE:\n1. Open My-Todo-Planner.html\n2. Click \uD83D\uDCBE Backup \u2192 Import / Restore\n3. Select My-Todo-Planner-Backup.json\n4. All tasks, attachments, and custom tabs will be restored.`;
      files.push({ name:"README.txt", data:readme });

      setZipProgress("Extracting attachment files…");
      const allTasks=[...personal.map(t=>({...t,_type:"personal"})),...work.map(t=>({...t,_type:"work"}))];
      let fc=0;
      for(const t of allTasks){
        for(const a of (t.attachments||[])){
          if(a.type==="file"&&a.data){
            try {
              const base64=a.data.split(",")[1]||a.data;
              const bin=atob(base64);
              const bytes=new Uint8Array(bin.length);
              for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
              const safeName=(a.name||"file").replace(/[^a-zA-Z0-9._\-\u0E00-\u0E7F]/g,"_");
              files.push({name:`attachments/task${t.id}/${safeName}`,data:bytes});
              fc++;
              if(fc%3===0)setZipProgress(`Packing ${fc} files…`);
            } catch(e) {
              console.warn(`Skipping corrupt attachment ${a.name} on task ${t.id}:`, e.message);
            }
          }
        }
      }

      setZipProgress("Building ZIP…");
      await new Promise(r=>setTimeout(r,50));
      const zipBytes=buildZIP(files);
      const blob=new Blob([zipBytes],{type:"application/zip"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download=`My-Todo-Planner-v${APP_VERSION}-Backup-${today}.zip`; a.click();
      URL.revokeObjectURL(url);
      setZipProgress("✅ Done!");
      setTimeout(()=>{ setZipping(false); setZipProgress(""); },2000);
    } catch(err){ setZipping(false); setZipProgress(""); alert("ZIP error: "+err.message); }
  };
  const handleZIP = () => checkSizeAndRun(doZIP, "Download ZIP");

  // ─── Excel only ────────────────────────────────────────────────────────────
  const handleExcel = () => {
    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const makeSheet=(cols,rows,sn)=>{const h=`<Row ss:StyleID="hdr">${cols.map(c=>`<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")}</Row>`;const d=rows.map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="${typeof v==="number"?"Number":"String"}">${esc(v)}</Data></Cell>`).join("")}</Row>`).join("\n");return`<Worksheet ss:Name="${esc(sn)}"><Table>${h}${d}</Table></Worksheet>`;};
    const pCols=["ID","Title","Category","Status","Start Date","End Date","Recurrence","Type","Priority","Pinned","Description","Location","Notes"];
    const wCols=["ID","Title","Category","Status","Priority","Pinned","Project","Assignee","Start Date","End Date/Due","Progress%","Description","Location","Notes","Subtasks"];
    const ctCols=["ID","Label","Emoji","Source","Categories","Hide Status"];
    const pRows=personal.map(t=>[t.id,t.title||"",t.cat||"",t.status||"",t.due||"",t.recur||"",t.isRecurring?"Recurring":"One-time",t.priority||"Medium",t.pinned?"Yes":"No",t.description||"",t.location||"",t.notes||""]);
    const wRows=work.map(t=>{const d=(t.subtasks||[]).filter(s=>s.done).length,tot=(t.subtasks||[]).length;return[t.id,t.title||"",t.cat||"",t.status||"",t.priority||"",t.pinned?"Yes":"No",t.project||"",t.assignee||"",t.startDate||"",t.due||"",tot>0?Math.round(d/tot*100):(t.progress||0),t.description||"",t.location||"",t.notes||"",tot>0?`${d}/${tot}`:""];});
    const ctRows=(customTabs||[]).map(ct=>[ct.id,ct.label||"",ct.emoji||"",ct.source||"all",(ct.cats||[]).join(", "),(ct.hideStatus||[]).join(", ")]);
    const xml=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6366F1" ss:Pattern="Solid"/></Style></Styles>${makeSheet(pCols,pRows,"Personal Tasks")}${makeSheet(wCols,wRows,"Work Tasks")}${makeSheet(ctCols,ctRows,"Custom Tabs")}</Workbook>`;
    const blob=new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`My-Todo-Planner-v${APP_VERSION}-Tasks-${today}.xls`; a.click(); URL.revokeObjectURL(url);
  };

  // ─── Copy JSON ─────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    const data = makeFullPayload();
    try { await navigator.clipboard.writeText(data); }
    catch { const ta=document.createElement("textarea");ta.value=data;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta); }
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  // ─── Import ────────────────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>setImportText(ev.target.result);
    reader.readAsText(file);
    setImportError(""); setImportSuccess(false);
  };
  const handleImport = () => {
    setImportError("");
    try {
      const parsed=JSON.parse(importText);
      if(!parsed.personal||!Array.isArray(parsed.personal)) throw new Error("No personal tasks found in this file");
      onImport({
        personal: parsed.personal,
        work: Array.isArray(parsed.work)?parsed.work:[],
        customTabs: Array.isArray(parsed.customTabs)?parsed.customTabs:[],
      });
      setImportSuccess(true);
      setTimeout(()=>{ setImportSuccess(false); onClose(); },1500);
    } catch(err){ setImportError("❌ Invalid file: "+err.message); }
  };

  // Q3: CSV import — parse and APPEND tasks (does not replace existing data)
  const handleCSVFile = (e) => {
    const file=e.target.files[0]; if(!file) return;
    const name=(file.name||"").toLowerCase();
    // N20: Excel .xlsx/.xls → load SheetJS from CDN, convert first sheet to CSV
    if (name.endsWith(".xlsx")||name.endsWith(".xls")){
      setCsvMsg("⏳ Reading Excel file…");
      const loadXLSX = () => new Promise((resolve,reject)=>{
        if (window.XLSX) return resolve(window.XLSX);
        const s=document.createElement("script");
        s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload=()=>resolve(window.XLSX);
        s.onerror=()=>reject(new Error("Could not load the Excel reader — internet is required the first time"));
        document.head.appendChild(s);
      });
      loadXLSX().then(XLSX=>{
        const reader=new FileReader();
        reader.onload=ev=>{
          try{
            const wb=XLSX.read(ev.target.result,{type:"array"});
            const sheet=wb.Sheets[wb.SheetNames[0]];
            const csv=XLSX.utils.sheet_to_csv(sheet);
            setCsvText(csv); setCsvMsg("✅ Excel read successfully — click Add Tasks to import");
          }catch(err){ setCsvMsg("❌ Could not read the Excel file: "+err.message); }
        };
        reader.readAsArrayBuffer(file);
      }).catch(err=>setCsvMsg("❌ "+err.message));
      return;
    }
    // CSV (plain text)
    const reader=new FileReader();
    reader.onload=ev=>{setCsvText(ev.target.result);setCsvMsg("");};
    reader.readAsText(file);
  };
  const parseCSV = (text) => {
    // Simple CSV parser supporting quoted fields
    const lines = text.split(/\r?\n/).filter(l=>l.trim());
    if (lines.length<2) return null;
    const splitRow = (row) => {
      const out=[]; let cur=""; let q=false;
      for (let i=0;i<row.length;i++){
        const c=row[i];
        if (c==='"'){ if(q&&row[i+1]==='"'){cur+='"';i++;} else q=!q; }
        else if (c===","&&!q){ out.push(cur); cur=""; }
        else cur+=c;
      }
      out.push(cur);
      return out.map(s=>s.trim());
    };
    const headers = splitRow(lines[0]).map(h=>h.toLowerCase());
    const idx = (name)=>headers.indexOf(name);
    const iTitle=idx("title"), iType=idx("type"), iCat=idx("category"), iDue=idx("due"), iPrio=idx("priority");
    const iId=idx("id"), iDesc=idx("description"), iStatus=idx("status"), iStart=idx("start"), iRecur=idx("recurrence");
    if (iTitle<0) return null;
    const rows = lines.slice(1).map(splitRow);
    return rows.map(r=>({
      id: iId>=0?String(r[iId]||"").trim():"",              // N34: ID present → update that task
      title: r[iTitle]||"",
      type: (iType>=0?(r[iType]||"").toLowerCase():"personal")==="work"?"work":"personal",
      cat: iCat>=0?r[iCat]:"",
      due: iDue>=0?r[iDue]:"",
      startDate: iStart>=0?r[iStart]:"",
      description: iDesc>=0?r[iDesc]:"",
      status: iStatus>=0?(r[iStatus]||"").toLowerCase():"",
      recur: iRecur>=0?r[iRecur]:"",
      priority: (()=>{const p=iPrio>=0?(r[iPrio]||"").toLowerCase():"";return p==="high"?"High":p==="low"?"Low":"Medium";})(),
    })).filter(t=>t.title);
  };
  const handleCSVImport = () => {
    setCsvMsg("");
    const parsed = parseCSV(csvText);
    if (!parsed || parsed.length===0){ setCsvMsg("❌ No data — needs a title column and at least one row"); return; }
    // N34: rows WITH a matching ID update that task; rows without ID are added new
    const newPersonal=[], newWork=[];
    let updP=0, updW=0;
    const mergedP=[...personal], mergedW=[...work];
    const applyRow = (t) => {
      const upd = (task) => ({
        ...task,
        title: t.title||task.title,
        cat: t.cat||task.cat,
        due: t.due||task.due,
        startDate: t.startDate||task.startDate,
        description: t.description!==""?t.description:task.description,
        priority: t.priority||task.priority,
        status: t.status||task.status,
        recur: t.recur!==""?t.recur:task.recur,
        isRecurring: t.recur!==""?true:task.isRecurring,
      });
      if (t.id) {
        const ip = mergedP.findIndex(x=>String(x.id)===t.id);
        if (ip>=0){ mergedP[ip]=upd(mergedP[ip]); updP++; return; }
        const iw = mergedW.findIndex(x=>String(x.id)===t.id);
        if (iw>=0){ mergedW[iw]=upd(mergedW[iw]); updW++; return; }
      }
      const base={
        id: newId(),
        title: t.title, description:t.description||"", due:t.due||"", startDate:t.startDate||"", priority:t.priority,
        location:"", attachments:[], pinned:false, deps:[], notes:"",
        originalDue:"", delayLabel:"", milestone:true, milestoneAt:"",
      };
      if (t.type==="work"){
        newWork.push({...base, project:t.cat||"", assignee:"", cat:t.cat||"Other", progress:0, subtasks:[], status:t.status||"todo", recur:t.recur||"", isRecurring:!!t.recur});
      } else {
        newPersonal.push({...base, cat:t.cat||"Home", recur:t.recur||"", isRecurring:!!t.recur, status:t.status||"pending"});
      }
    };
    parsed.forEach(applyRow);
    const nUpd = updP+updW;
    if (nUpd>0) {
      // replace lists (updates applied) + append new rows
      onImport&&onImport({ personal:[...mergedP,...newPersonal], work:[...mergedW,...newWork] });
    } else {
      onImportAppend&&onImportAppend({personal:newPersonal, work:newWork});
    }
    setCsvMsg(`✅ Added ${newPersonal.length+newWork.length} · updated ${nUpd} by ID`);
    setCsvText("");
    setTimeout(()=>{ setCsvMsg(""); onClose(); },1800);
  };

  // N34: Export all tasks as Excel (.xlsx) — same columns the importer reads,
  // WITH the ID column so re-importing the edited file updates by ID.
  const exportExcel = () => {
    const loadX = () => new Promise((res,rej)=>{
      if (window.XLSX) return res(window.XLSX);
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload=()=>res(window.XLSX); s.onerror=rej; document.head.appendChild(s);
    });
    loadX().then(XLSX=>{
      const row = (t,type)=>({
        id: t.id, type, title: t.title||"", description: t.description||"",
        category: type==="work"?(t.project||t.cat||""):(t.cat||""),
        priority: t.priority||"", status: t.status||"",
        start: t.startDate||"", due: t.due||"", recurrence: t.recur||"",
      });
      const rows=[...personal.map(t=>row(t,"personal")), ...work.map(t=>row(t,"work"))];
      const ws=XLSX.utils.json_to_sheet(rows);
      ws["!cols"]=[{wch:14},{wch:9},{wch:36},{wch:32},{wch:14},{wch:9},{wch:10},{wch:11},{wch:11},{wch:16}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,"Tasks");
      const d=new Date();
      const st=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}-${String(d.getMinutes()).padStart(2,"0")}`;
      XLSX.writeFile(wb,`My-Todo-Planner-Tasks-${st}.xlsx`);
      setCsvMsg("✅ Excel exported — edit it and import back (same ID = update in place)");
    }).catch(()=>setCsvMsg("❌ Could not load the Excel helper (internet required)"));
  };

  const inp={width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-card2)",color:"var(--c-text)",fontSize:12,outline:"none",boxSizing:"border-box"};
  const btn=(bg,col)=>({display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"11px 0",borderRadius:9,border:"none",background:bg,color:col,fontWeight:800,fontSize:13,cursor:"pointer",width:"100%"});

  // ─── Estimated size display ────────────────────────────────────────────────
  const estBytes = estimateJSONSize();
  const estMB = estBytes/(1024*1024);
  const sizeColor = estMB>50?"#ef4444":estMB>10?"#f59e0b":"#22c55e";
  const sizeLabel = estMB>50?"⚠️ Very large":estMB>10?"⚡ Large":"✅ Normal";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,
        padding:26,width:"100%",maxWidth:560,boxShadow:"0 25px 60px rgba(0,0,0,.8)",
        maxHeight:"92vh",overflowY:"auto"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,color:"var(--c-text)",fontSize:17,fontWeight:800}}>💾 Data Backup</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {/* Size Warning Overlay */}
        {sizeWarning && (
          <div style={{background:"#1c1917",border:`1px solid ${sizeWarning.level==="critical"?"#ef444455":"#f59e0b55"}`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
              <span style={{fontSize:22,flexShrink:0}}>{sizeWarning.level==="critical"?"🚨":"⚠️"}</span>
              <div>
                <div style={{color:sizeWarning.level==="critical"?"#f87171":"#fbbf24",fontWeight:800,fontSize:14,marginBottom:4}}>
                  {sizeWarning.level==="critical"?"Very large file — about "+sizeWarning.sizeMB+" MB":"Fairly large file — about "+sizeWarning.sizeMB+" MB"}
                </div>
                {sizeWarning.level==="critical"?(
                  <div style={{fontSize:12,color:"var(--c-text-muted)",lineHeight:1.7}}>
                    A file this size can freeze the browser or fail to download in some cases<br/>
                    <strong style={{color:"var(--c-text)"}}>Recommended options:</strong><br/>
                    1️⃣ <strong style={{color:"#60a5fa"}}>Download ZIP</strong> instead — attachments are split out and handled better<br/>
                    2️⃣ <strong style={{color:"#60a5fa"}}>Trim attachments</strong> — delete unneeded images or files, then back up again<br/>
                    3️⃣ <strong style={{color:"#60a5fa"}}>Continue anyway</strong> — if you are confident your browser can handle it
                  </div>
                ):(
                  <div style={{fontSize:12,color:"var(--c-text-muted)",lineHeight:1.7}}>
                    Normal for a file with several attachments — it should download fine<br/>
                    If you plan to share or email it, ZIP is a better choice
                  </div>
                )}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={()=>setSizeWarning(null)} style={{padding:"9px 0",borderRadius:8,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                ← Cancel
              </button>
              <button onClick={()=>sizeWarning.action()} style={{padding:"9px 0",borderRadius:8,border:"none",background:sizeWarning.level==="critical"?"#7f1d1d":"#78350f",color:sizeWarning.level==="critical"?"#fca5a5":"#fde68a",fontSize:13,fontWeight:800,cursor:"pointer"}}>
                ⚠️ Continue ({sizeWarning.label})
              </button>
            </div>
          </div>
        )}

        {/* Mode tabs */}
        <div style={{display:"flex",background:"var(--c-surface)",borderRadius:10,padding:4,gap:4,marginBottom:16}}>
          {[["export","📤 Export"],["import","📥 Restore from Local File"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setMode(v);setImportError("");setImportSuccess(false);setSizeWarning(null);}} style={{
              flex:1,padding:"8px 12px",borderRadius:7,border:"none",
              background:mode===v?"#6366f1":"transparent",
              color:mode===v?"#fff":"var(--c-text-muted)",fontWeight:700,fontSize:13,cursor:"pointer"}}>{l}</button>
          ))}
        </div>

        {mode==="export" ? (
          <div>
            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7,marginBottom:12}}>
              {[
                {l:"Personal",v:personal.length,c:"#34d399"},
                {l:"Work",v:work.length,c:"#818cf8"},
                {l:"Custom Tabs",v:(customTabs||[]).length,c:"#6366f1"},
                {l:"File attach",v:totalFileAttach,c:"#60a5fa"},
                {l:"Links",v:totalLinkAttach,c:"#f59e0b"},
              ].map(s=>(
                <div key={s.l} style={{background:"var(--c-surface)",borderRadius:9,padding:"8px 10px",borderLeft:`3px solid ${s.c}`}}>
                  <div style={{fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
                  <div style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:700,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Size indicator */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"var(--c-surface2)",borderRadius:8,marginBottom:14,border:`1px solid ${sizeColor}33`}}>
              <span style={{fontSize:11,fontWeight:800,color:sizeColor}}>{sizeLabel}</span>
              <span style={{fontSize:11,color:"var(--c-text-muted)",flex:1}}>Estimated backup size: <strong style={{color:sizeColor}}>{fmtSize(estBytes)}</strong></span>
              {estMB>10&&<span style={{fontSize:10,color:"var(--c-text-muted)"}}>ZIP is recommended at this size</span>}
            </div>

            {/* What's included note */}
            <div style={{background:"var(--c-surface2)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"var(--c-text-muted)",lineHeight:1.7,border:"1px solid var(--c-border)"}}>
              ✅ The JSON backup includes: all tasks · attachments (base64) · custom tab configurations · export timestamp
            </div>

            {/* Option 1B — JSON full backup */}
            <div style={{background:"var(--c-surface2)",borderRadius:12,padding:"14px 16px",marginBottom:10,border:"1px solid var(--c-border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:16}}>🗄️</span>
                <div>
                  <div style={{color:"var(--c-text)",fontSize:13,fontWeight:800}}>JSON — Full Backup + Config</div>
                  <div style={{color:"var(--c-text-muted)",fontSize:11,marginTop:1}}>tasks + attachments + custom tabs in one file · use this to restore</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleDownloadJSON} style={{...btn("linear-gradient(135deg,#312e81,#4338ca)","#fff"),flex:3}}>
                  ⬇️ Download JSON (Full + Config)
                </button>
                <button onClick={handleCopy} title="Copy JSON to clipboard" style={{...btn(copied?"#22c55e22":"var(--c-surface)",copied?"#86efac":"#94a3b8"),flex:1,border:`1.5px solid ${copied?"#22c55e44":"var(--c-border)"}`}}>
                  {copied?"✓":"📋"}
                </button>
              </div>
            </div>

            {/* Option 2 — ZIP */}
            <div style={{background:"var(--c-surface2)",borderRadius:12,padding:"14px 16px",marginBottom:10,border:"1px solid var(--c-border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:16}}>📦</span>
                <div>
                  <div style={{color:"var(--c-text)",fontSize:13,fontWeight:800}}>ZIP — Full Package (Excel + JSON + real files)</div>
                  <div style={{color:"var(--c-text-muted)",fontSize:11,marginTop:1}}>Excel readable (3 sheets) + JSON backup + the real attachment files + Custom Tabs sheet</div>
                </div>
              </div>
              {zipping ? (
                <div style={{padding:"10px 14px",background:"var(--c-surface)",borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:16,height:16,border:"2px solid #6366f1",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                  <span style={{color:"#a5b4fc",fontSize:12,fontWeight:600}}>{zipProgress}</span>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <button onClick={handleZIP} style={btn("linear-gradient(135deg,#7c2d12,#c2410c)","#fff")}>
                  📦 Download ZIP (Excel + JSON + {totalFileAttach} file{totalFileAttach!==1?"s":""})
                </button>
              )}
              {zipProgress==="✅ Done!"&&<div style={{color:"#86efac",fontSize:12,fontWeight:700,marginTop:6,textAlign:"center"}}>✅ ZIP downloaded!</div>}
            </div>

            {/* Excel only */}
            <div style={{background:"var(--c-surface2)",borderRadius:12,padding:"14px 16px",border:"1px solid var(--c-border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:16}}>📊</span>
                <div>
                  <div style={{color:"var(--c-text)",fontSize:13,fontWeight:800}}>Excel — Readable Table (3 sheets)</div>
                  <div style={{color:"var(--c-text-muted)",fontSize:11,marginTop:1}}>Personal Tasks + Work Tasks + Custom Tabs · attachment files not included · read/print only</div>
                </div>
              </div>
              <button onClick={handleExcel} style={btn("linear-gradient(135deg,#166534,#15803d)","#fff")}>
                📊 Download Excel (.xls)
              </button>
            </div>

            {/* Q3: PDF Export */}
            <div style={{background:"var(--c-surface2)",borderRadius:10,padding:"14px 16px",marginTop:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:16}}>📄</span>
                <div>
                  <div style={{color:"var(--c-text)",fontSize:13,fontWeight:800}}>PDF — Printable Report</div>
                  <div style={{color:"var(--c-text-muted)",fontSize:11,marginTop:1}}>Task summary with completion stats · opens the print dialog → choose "Save as PDF"</div>
                </div>
              </div>
              <button onClick={()=>exportToPDF({personal,work,profileName:""})} style={btn("linear-gradient(135deg,#dc2626,#b91c1c)","#fff")}>
                📄 Export PDF Report
              </button>
            </div>

            <div style={{marginTop:10,fontSize:10,color:"var(--c-text-muted)",lineHeight:1.6,textAlign:"center"}}>
              💡 Keep a copy in OneDrive / Google Drive · only JSON can be restored
            </div>
          </div>
        ) : (
          <div>
            <div style={{background:"var(--c-surface)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"var(--c-text-muted)",lineHeight:1.6}}>
              ⚠️ Import will <strong style={{color:"#f87171"}}>replace all current data</strong>, including attachments and custom tabs<br/>
              Only <strong style={{color:"var(--c-text-muted)"}}>.json</strong> files exported from this dashboard are supported
            </div>
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:11,color:"var(--c-text-muted)",fontWeight:700,letterSpacing:"0.06em",marginBottom:6}}>Choose a .json file</label>
              <input type="file" accept=".json,application/json" onChange={handleFile} style={{...inp,cursor:"pointer",padding:"10px 12px"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:11,color:"var(--c-text-muted)",fontWeight:700,letterSpacing:"0.06em",marginBottom:6}}>Or paste JSON here</label>
              <textarea value={importText} onChange={e=>{setImportText(e.target.value);setImportError("");}}
                placeholder='{"personal":[...],"work":[...],"customTabs":[...]}'
                style={{...inp,height:90,resize:"vertical",lineHeight:1.5,fontFamily:"monospace",fontSize:11}}/>
            </div>
            {importError&&<div style={{background:"#7f1d1d22",border:"1px solid #ef444444",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#f87171"}}>{importError}</div>}
            {importSuccess&&<div style={{background:"#14532d22",border:"1px solid #22c55e44",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#86efac",fontWeight:700}}>✅ Import สำเร็จ! กำลังโหลดข้อมูล…</div>}
            <button onClick={handleImport} disabled={!importText.trim()}
              style={{width:"100%",padding:"11px 0",borderRadius:9,border:"none",
                background:importText.trim()?"#6366f1":"var(--c-surface)",
                color:importText.trim()?"#fff":"var(--c-text-muted)",
                fontWeight:800,fontSize:14,cursor:importText.trim()?"pointer":"default"}}>
              📥 Restore from Local File
            </button>

            {/* Q3+N34: CSV/Excel Import — appends new tasks; rows with ID update that task */}
            <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--c-border)"}}>
              <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)",marginBottom:6}}>📥 Import / 📤 Export Excel</div>
              <div style={{background:"var(--c-surface)",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:11,color:"var(--c-text-muted)",lineHeight:1.6}}>
                <strong style={{color:"#22c55e"}}>Pick a .xlsx / .xls / .csv file directly</strong> — no conversion needed<br/>
                Columns: <strong>id</strong>, <strong>title</strong>, type, category, due, priority, status, start, description, recurrence<br/>
                <strong style={{color:"#f59e0b"}}>A matching id updates that task</strong> · no id = added as new · tip: Export first, edit, then import back
              </div>
              <button onClick={exportExcel} style={{...btn("#166534","#fff"),marginBottom:10}}>📤 Export Excel (.xlsx) — every task, with IDs</button>
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={handleCSVFile}
                style={{...inp,cursor:"pointer",padding:"10px 12px",marginBottom:10}}/>
              <textarea value={csvText} onChange={e=>{setCsvText(e.target.value);setCsvMsg("");}}
                placeholder={"title,type,category,due,priority\nRenew passport,personal,Admin,2026-08-15,High\nQ3 report,work,Lotus General,2026-07-31,Medium"}
                style={{...inp,height:80,resize:"vertical",lineHeight:1.5,fontFamily:"monospace",fontSize:11,marginBottom:10}}/>
              {csvMsg&&<div style={{background:csvMsg.startsWith("✅")?"#14532d22":"#7f1d1d22",border:`1px solid ${csvMsg.startsWith("✅")?"#22c55e44":"#ef444444"}`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:csvMsg.startsWith("✅")?"#86efac":"#f87171",fontWeight:700}}>{csvMsg}</div>}
              <button onClick={handleCSVImport} disabled={!csvText.trim()}
                style={{width:"100%",padding:"11px 0",borderRadius:9,border:"none",
                  background:csvText.trim()?"#22c55e":"var(--c-surface)",
                  color:csvText.trim()?"#fff":"var(--c-text-muted)",
                  fontWeight:800,fontSize:14,cursor:csvText.trim()?"pointer":"default"}}>
                ➕ Add Tasks from CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// CALENDAR TAB  — Week & Month views with week numbers
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// N24: EVENT MODAL — create/edit a timespan Event (no status/done; calendar+gantt only)
// ─────────────────────────────────────────────────────────────────────────────
function EventModal({ event, onSave, onDelete, onClose, eventTypes=DEFAULT_EVENT_TYPES, setEventTypes }) {
  const [f, setF] = useState(()=>{
    const base = event || {
      id: newId(),
      title:"", start:fmtLocal(TODAY), end:fmtLocal(TODAY),
      typeId: (eventTypes[0]?.id)||"personal",
      color: (eventTypes[0]?.color)||"#8b5cf6", note:"",
    };
    return { ...base, windows: eventWindows(base) }; // N37: always edit as windows[]
  });
  // N37: multi-window helpers — one event id can span several start→end periods
  const setWin = (i,k,v)=>setF(p=>{
    const w=[...p.windows];
    w[i]={...w[i],[k]:v};
    if(k==="start"&&v&&(!w[i].end||w[i].end<v)) w[i].end=v;   // end follows start
    if(k==="end"&&v&&w[i].start&&v<w[i].start) w[i].end=w[i].start;
    return {...p,windows:w};
  });
  const addWin = ()=>setF(p=>p.windows.length>=6?p:({...p,windows:[...p.windows,{start:fmtLocal(TODAY),end:fmtLocal(TODAY),desc:""}]}));
  const removeWin = (i)=>setF(p=>p.windows.length<=1?p:({...p,windows:p.windows.filter((_,x)=>x!==i)}));
  const set = (k,v)=>setF(p=>{
    const next = {...p,[k]:v};
    // N36: when start moves past end, push end to match (end follows start)
    if (k==="start" && v && (!p.end || p.end < v)) next.end = v;
    // if end set before start, clamp end up to start
    if (k==="end" && v && next.start && v < next.start) next.end = next.start;
    return next;
  });
  const inp = {width:"100%",padding:"9px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",
    background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl = {display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:5};
  const PALETTE = ["#ef4444","#f59e0b","#eab308","#22c55e","#10b981","#3b82f6","#6366f1","#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b"];
  // N35: manage event types inline
  const [manageTypes, setManageTypes] = useState(false);
  const [confirmDel, setConfirmDel]   = useState(false); // N59
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("#8b5cf6");
  const addType = () => {
    if (!newTypeName.trim() || !setEventTypes) return;
    const id = "t"+Date.now();
    const next = [...eventTypes, { id, name:newTypeName.trim(), color:newTypeColor }];
    setEventTypes(next); setNewTypeName(""); set("typeId",id); set("color",newTypeColor);
  };
  const updateType = (id, patch) => setEventTypes && setEventTypes(eventTypes.map(t=>t.id===id?{...t,...patch}:t));
  const removeType = (id) => { if(setEventTypes && eventTypes.length>1) setEventTypes(eventTypes.filter(t=>t.id!==id)); };

  const chooseType = (t) => { set("typeId",t.id); set("color",t.color); };
  const save = ()=>{
    if(!f.title.trim())return;
    const wins = (f.windows||[]).filter(w=>w.start||w.end).map(w=>({start:w.start||w.end,end:w.end||w.start,desc:(w.desc||"").trim()}))
                 .sort((a,b)=>a.start.localeCompare(b.start));
    if(!wins.length) return;
    // mirror the first window onto start/end so older views keep working
    onSave({...f, windows:wins, start:wins[0].start, end:wins[0].end});
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:6500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>📅 {event?"Edit Event":"New Event"}</div>
        <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:16}}>Events show on Calendar &amp; Gantt only — not tracked as todos</div>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lbl}>EVENT TITLE</label><input style={inp} value={f.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Company trip, Holiday, Conference…" autoFocus/></div>
          {/* N37: one or more time windows for this same event */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
              <label style={{...lbl,marginBottom:0}}>TIME WINDOWS ({f.windows.length}) <span style={{fontWeight:500}}>· several windows share one Gantt row</span></label>
              {f.windows.length<6&&<button onClick={addWin} style={{fontSize:10,fontWeight:800,color:"#166534",background:"#16653418",border:"1px solid #16653444",borderRadius:6,padding:"2px 9px",cursor:"pointer"}}>+ Add window</button>}
            </div>
            <div style={{display:"grid",gap:7}}>
              {f.windows.map((w,i)=>(
                <div key={i} style={{border:"1px solid var(--c-border)",borderRadius:9,padding:"8px 9px",background:"var(--c-surface)"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:7,alignItems:"center",marginBottom:6}}>
                    <DateInput style={inp} value={w.start||""} onChange={v=>setWin(i,"start",v)}/>
                    <DateInput style={inp} value={w.end||""} onChange={v=>setWin(i,"end",v)}/>
                    <button onClick={()=>removeWin(i)} disabled={f.windows.length<=1}
                      style={{background:"transparent",border:"none",fontSize:14,cursor:f.windows.length<=1?"not-allowed":"pointer",opacity:f.windows.length<=1?0.25:0.7,color:"var(--c-text-muted)"}}>🗑</button>
                  </div>
                  {/* N44: description for THIS window — shown on hover in the Gantt chart */}
                  <input value={w.desc||""} onChange={e=>setWin(i,"desc",e.target.value)}
                    placeholder={`Description for window ${i+1}… (shown on hover in Gantt)`}
                    style={{...inp,fontSize:12,padding:"7px 10px"}}/>
                </div>
              ))}
            </div>
          </div>
          {/* N35: event TYPE picker (color follows the type) */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
              <label style={{...lbl,marginBottom:0}}>EVENT TYPE <span style={{fontWeight:500}}>· color follows the type</span></label>
              {setEventTypes&&<button onClick={()=>setManageTypes(m=>!m)} style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"#6366f118",border:"1px solid #6366f144",borderRadius:6,padding:"2px 8px",cursor:"pointer"}}>{manageTypes?"Done":"⚙ Manage types"}</button>}
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {eventTypes.map(t=>(
                <button key={t.id} onClick={()=>chooseType(t)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 11px",borderRadius:20,cursor:"pointer",
                  border:f.typeId===t.id?`2px solid ${t.color}`:"1.5px solid var(--c-border)",
                  background:f.typeId===t.id?t.color+"22":"transparent",fontSize:12,fontWeight:700,
                  color:f.typeId===t.id?t.color:"var(--c-text-muted)"}}>
                  <span style={{width:11,height:11,borderRadius:"50%",background:t.color,display:"inline-block"}}/>{t.name}
                </button>
              ))}
            </div>
          </div>
          {/* N35: inline type manager */}
          {manageTypes&&setEventTypes&&(
            <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:10,padding:12,display:"grid",gap:8}}>
              {eventTypes.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="color" value={t.color} onChange={e=>updateType(t.id,{color:e.target.value})} style={{width:30,height:30,border:"none",borderRadius:6,cursor:"pointer",background:"none",padding:0}}/>
                  <input value={t.name} onChange={e=>updateType(t.id,{name:e.target.value})} style={{...inp,flex:1,padding:"6px 10px",fontSize:12}}/>
                  <button onClick={()=>removeType(t.id)} disabled={eventTypes.length<=1} style={{background:"transparent",border:"none",color:"var(--c-text-muted)",cursor:eventTypes.length<=1?"not-allowed":"pointer",fontSize:14,opacity:eventTypes.length<=1?0.3:0.7}}>🗑</button>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:8,borderTop:"1px dashed var(--c-border)",paddingTop:8}}>
                <input type="color" value={newTypeColor} onChange={e=>setNewTypeColor(e.target.value)} style={{width:30,height:30,border:"none",borderRadius:6,cursor:"pointer",background:"none",padding:0}}/>
                <input value={newTypeName} onChange={e=>setNewTypeName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addType()} placeholder="New type name…" style={{...inp,flex:1,padding:"6px 10px",fontSize:12}}/>
                <button onClick={addType} style={{background:"#6366f1",border:"none",borderRadius:7,color:"#fff",padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Add</button>
              </div>
            </div>
          )}
          {/* override color (optional, still available) */}
          <div>
            <label style={lbl}>COLOR (override)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {PALETTE.map(c=>(
                <button key={c} onClick={()=>set("color",c)} style={{width:26,height:26,borderRadius:7,cursor:"pointer",
                  border:f.color===c?"3px solid var(--c-text)":"2px solid var(--c-border)",background:c}}/>
              ))}
            </div>
          </div>
          <div><label style={lbl}>NOTE (optional)</label><input style={inp} value={f.note} onChange={e=>set("note",e.target.value)} placeholder="Extra detail…"/></div>
          {/* N97: optional place — shows as a 📍 pin on calendar / timeline / gantt */}
          <div>
            <label style={lbl}>📍 LOCATION (optional)</label>
            <input style={{...inp,marginBottom:6}} value={f.location?.name||""}
              onChange={e=>set("location",{ ...(f.location||{}), name:e.target.value })}
              placeholder="Place name — e.g. ลำพูน, Central World"/>
            <input style={{...inp,fontSize:12}} value={f.location?._raw??(f.location&&typeof f.location.lat==="number"?`${f.location.lat},${f.location.lng}`:(f.location?.url||""))}
              onChange={e=>{
                const raw=e.target.value; const ll=parseLatLng(raw);
                const isUrl=/^https?:\/\//i.test(raw.trim());
                set("location",{ ...(f.location||{}), _raw:raw,
                  lat: ll?ll.lat:undefined, lng: ll?ll.lng:undefined,
                  url: isUrl?raw.trim():undefined });
              }}
              placeholder="Paste Google Maps link, or 13.7563,100.5018"/>
            {(f.location?.name||f.location?.lat||f.location?.url) &&
              <div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
                <PlacePin loc={f.location}/>
                <button onClick={()=>set("location",undefined)}
                  style={{padding:"2px 8px",borderRadius:6,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text-muted)",fontSize:10,fontWeight:700,cursor:"pointer"}}>Clear</button>
              </div>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          {event&&<button onClick={()=>setConfirmDel(true)} style={{padding:"11px 16px",borderRadius:10,border:"none",background:"#7f1d1d",color:"#fca5a5",fontSize:13,fontWeight:800,cursor:"pointer"}}>🗑️ Delete</button>}
          {confirmDel&&<ConfirmDialog title={`Delete event "${f.title||"Untitled"}"?`}
            body="This removes the event and all of its time windows. It cannot be undone."
            onConfirm={()=>{setConfirmDel(false);onDelete(f.id);}} onCancel={()=>setConfirmDel(false)}/>}
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancel</button>
          <button onClick={save} disabled={!f.title.trim()} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:f.title.trim()?(f.color||"#8b5cf6"):"var(--c-border)",color:"#fff",fontSize:13,fontWeight:800,cursor:f.title.trim()?"pointer":"default"}}>Save Event</button>
        </div>
      </div>
    </div>
  );
}

// ─── N86: double-click an image in a note → a bigger, resizable pop-up window.
// The note canvas is narrow; screenshots and receipts need a real look sometimes.
function ImageLightbox({ src: imgSrc, onClose }) {
  const [pos, setPos]   = useState({x: Math.max(20,(window.innerWidth-720)/2), y: 60});
  const [size, setSize] = useState({w: Math.min(720, window.innerWidth-40), h: Math.min(540, window.innerHeight-120)});
  const [zoom, setZoom] = useState(1);
  useEffect(()=>{
    const onKey=(e)=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[onClose]);
  const startMove=(e)=>{
    e.preventDefault();
    const sx=e.clientX-pos.x, sy=e.clientY-pos.y;
    const mv=(ev)=>setPos({x:ev.clientX-sx, y:ev.clientY-sy});
    const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);
  };
  const startResize=(e)=>{
    e.preventDefault(); e.stopPropagation();
    const sx=e.clientX, sy=e.clientY, ow=size.w, oh=size.h;
    const mv=(ev)=>setSize({w:Math.max(280,ow+ev.clientX-sx), h:Math.max(200,oh+ev.clientY-sy)});
    const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);
  };
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9600}}>
      <div style={{position:"fixed",left:pos.x,top:pos.y,width:size.w,height:size.h,
        background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:12,
        boxShadow:"0 30px 80px rgba(0,0,0,.55)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div onMouseDown={startMove}
          style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",cursor:"move",
            background:"var(--c-surface2)",borderBottom:"1px solid var(--c-border)",userSelect:"none"}}>
          <span style={{fontSize:12,fontWeight:800,color:"var(--c-text)"}}>🖼 Image</span>
          <div style={{flex:1}}/>
          {[["−",()=>setZoom(z=>Math.max(0.25,+(z-0.25).toFixed(2)))],
            [`${Math.round(zoom*100)}%`,()=>setZoom(1)],
            ["+",()=>setZoom(z=>Math.min(6,+(z+0.25).toFixed(2)))]].map(([l,fn],i)=>(
            <button key={i} onClick={fn} style={{padding:"3px 10px",borderRadius:7,border:"1px solid var(--c-border)",
              background:"var(--c-surface)",color:"var(--c-text)",fontSize:11,fontWeight:800,cursor:"pointer",minWidth:i===1?52:0}}>{l}</button>
          ))}
          <button onClick={onClose} style={{padding:"3px 10px",borderRadius:7,border:"none",
            background:"#dc2626",color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer",marginLeft:4}}>✕</button>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:zoom<=1?"center":"flex-start",
          justifyContent:zoom<=1?"center":"flex-start",background:"#00000022"}}>
          <img src={imgSrc} alt="" draggable={false}
            onDoubleClick={()=>setZoom(z=>z===1?2:1)}
            style={{width:`${zoom*100}%`,maxWidth:zoom<=1?"100%":"none",maxHeight:zoom<=1?"100%":"none",
              objectFit:"contain",cursor:"zoom-in",userSelect:"none"}}/>
        </div>
        <div onMouseDown={startResize} title="Drag to resize"
          style={{position:"absolute",right:0,bottom:0,width:18,height:18,cursor:"nwse-resize",
            background:"linear-gradient(135deg,transparent 50%,var(--c-text-muted) 50%)",opacity:0.55,borderBottomRightRadius:12}}/>
      </div>
    </div>
  );
}

// ─── N74: pick the colour of a category / project, from inside a task ───────
// The colour belongs to the group, so this repaints every task in that group.
// We say so explicitly rather than surprising the user afterwards.
function GroupColorPicker({ name, count, current, onPick, label="CATEGORY COLOUR" }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex]   = useState(current || "#94a3b8");
  useEffect(()=>{ setHex(current || "#94a3b8"); },[current, name]);
  if(!name) return null;
  return (
    <div style={{marginTop:8}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 11px",borderRadius:8,cursor:"pointer",
          border:"1px solid var(--c-border)",background:"var(--c-surface2)",color:"var(--c-text-muted)",fontSize:11,fontWeight:700}}>
        <span style={{width:13,height:13,borderRadius:4,background:current,border:"1px solid rgba(0,0,0,.2)"}}/>
        🎨 {open?"Close":`Colour of "${name}"`}
      </button>
      {open && (
        <div style={{marginTop:8,padding:12,borderRadius:10,border:"1px solid var(--c-border)",background:"var(--c-surface2)"}}>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.07em",color:"var(--c-text-muted)",marginBottom:7}}>{label}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
            {GROUP_SWATCHES.map(c=>(
              <button key={c} onClick={()=>{setHex(c);onPick(name,c);}}
                title={c} style={{width:22,height:22,borderRadius:6,background:c,cursor:"pointer",
                  border:current===c?"2.5px solid var(--c-text)":"1px solid rgba(0,0,0,.2)"}}/>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input type="color" value={hex} onChange={e=>{setHex(e.target.value);onPick(name,e.target.value);}}
              style={{width:38,height:30,padding:0,border:"1px solid var(--c-border)",borderRadius:7,background:"transparent",cursor:"pointer"}}/>
            <input value={hex} onChange={e=>setHex(e.target.value)}
              onBlur={()=>/^#[0-9a-fA-F]{6}$/.test(hex)&&onPick(name,hex)}
              style={{width:92,padding:"6px 8px",borderRadius:7,border:"1px solid var(--c-border)",
                background:"var(--c-surface)",color:"var(--c-text)",fontSize:11,fontFamily:"monospace"}}/>
            <button onClick={()=>onPick(name,null)}
              style={{padding:"6px 10px",borderRadius:7,border:"1px solid var(--c-border)",background:"transparent",
                color:"var(--c-text-muted)",fontSize:10.5,fontWeight:700,cursor:"pointer"}}>↺ Reset</button>
          </div>
          <div style={{fontSize:9.5,color:"#b45309",marginTop:8,lineHeight:1.5}}>
            ⚠️ This changes the colour for {count===1?"the 1 task":`all ${count} tasks`} in "{name}" — everywhere: Timeline, Gantt, Calendar and List.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── N59: Timeline visual themes ────────────────────────────────────────────
// Each theme only changes chrome (card, spine, gridlines, today marker). Item
// colours still come from the task category / event type so meaning is kept.
const TL_THEMES = {
  classic:  { name:"Classic",   desc:"Warm, rounded, colourful",
              card:"var(--c-surface)", border:"var(--c-border)",
              spine:"linear-gradient(90deg,#f59e0b33,#f59e0b,#f59e0b33)", spineH:3,
              grid:"var(--c-border)", gridOp:0.5, today:"#ef4444", badge:"#f59e0b", radius:14,
              barShape:"pill", barFill:"gradient", nodeShape:"circle",
              cardBorder:"left", shadow:"soft", axisWeight:600, weekendTint:true },
  formal:   { name:"Formal",    desc:"Slate, square corners, print-friendly",
              card:"var(--c-surface)", border:"#94a3b855",
              spine:"linear-gradient(90deg,#33415522,#334155,#33415522)", spineH:2,
              grid:"#94a3b8", gridOp:0.32, today:"#b91c1c", badge:"#334155", radius:4,
              barShape:"square", barFill:"solid", nodeShape:"square",
              cardBorder:"full", shadow:"none", axisWeight:700, weekendTint:false },
  mono:     { name:"Mono",      desc:"Greyscale, minimal ink",
              card:"var(--c-surface)", border:"var(--c-border)",
              spine:"linear-gradient(90deg,#64748b22,#64748b,#64748b22)", spineH:2,
              grid:"#64748b", gridOp:0.28, today:"#0f172a", badge:"#64748b", radius:8,
              barShape:"round", barFill:"outline", nodeShape:"circle",
              cardBorder:"left", shadow:"none", axisWeight:600, weekendTint:false },
  contrast: { name:"Contrast",  desc:"Heavy lines, projector-safe",
              card:"var(--c-card2)", border:"var(--c-text-muted)",
              spine:"linear-gradient(90deg,#111827,#111827)", spineH:4,
              grid:"var(--c-text-muted)", gridOp:0.55, today:"#dc2626", badge:"#111827", radius:6,
              barShape:"square", barFill:"solid", nodeShape:"diamond",
              cardBorder:"full", shadow:"hard", axisWeight:800, weekendTint:true },
  pastel:   { name:"Pastel",    desc:"Soft indigo, very rounded",
              card:"var(--c-surface)", border:"#c7d2fe",
              spine:"linear-gradient(90deg,#c4b5fd55,#a5b4fc,#c4b5fd55)", spineH:3,
              grid:"#c7d2fe", gridOp:0.6, today:"#fb7185", badge:"#818cf8", radius:18,
              barShape:"pill", barFill:"gradient", nodeShape:"circle",
              cardBorder:"none", shadow:"soft", axisWeight:500, weekendTint:true },
  blueprint:{ name:"Blueprint", desc:"Grid-first, engineering look",
              card:"var(--c-surface2)", border:"#38bdf866",
              spine:"linear-gradient(90deg,#0ea5e9,#0ea5e9)", spineH:2,
              grid:"#38bdf8", gridOp:0.4, today:"#f97316", badge:"#0284c7", radius:2,
              barShape:"square", barFill:"outline", nodeShape:"square",
              cardBorder:"full", shadow:"none", axisWeight:700, weekendTint:false },
};
// N64: helper — derive the visual style of one bar/node from the active theme
function tlBarStyle(TH, color, hovered) {
  const radius = TH.barShape==="pill" ? 99 : TH.barShape==="round" ? 8 : 3;
  const background = TH.barFill==="gradient" ? `linear-gradient(90deg,${color}${hovered?"ff":"ee"},${color}${hovered?"dd":"aa"})`
                   : TH.barFill==="outline"  ? `${color}22`
                   : color;
  const border = TH.barFill==="outline" ? `2px solid ${color}` : `${hovered?2:1}px solid ${color}`;
  const shadow = TH.shadow==="none" ? (hovered?`0 0 0 2px ${color}44`:"none")
               : TH.shadow==="hard" ? (hovered?`4px 4px 0 ${color}88`:`2px 2px 0 ${color}55`)
               : (hovered?`0 8px 26px ${color}88, 0 0 0 2px var(--c-surface)`:`0 2px 10px ${color}44`);
  const textColor = TH.barFill==="outline" ? color : "#fff";
  return {radius, background, border, shadow, textColor};
}

// ─── N59: one confirmation dialog for every destructive action ───────────────
// window.confirm() is easy to dismiss by muscle memory and looks foreign; this
// keeps the app's styling and always defaults focus to the safe choice.
// N107: the file you opened and the file on Drive hold different data. Show both
// sides side by side and make the user choose a direction — nothing is written
// until they do.
// ── Two-way "which copy wins" dialog ───────────────────────────────────────
// One component, two callers: an opened local file that disagrees with Drive
// (N107), and a real sync conflict where both sides moved since the last sync
// (3.75). Keeping them identical matters — the same icons, the same arrow
// direction and the same wording mean the decision reads the same way wherever
// it appears, instead of being a different puzzle each time.
//
//   📄 = this device      ☁️ = Google Drive      arrow = where data travels
//
// Nothing is written until the second confirmation. The newer copy is marked
// and recommended, but both directions stay available: "newer" is a good
// default, not always the right answer — a device can be newer precisely
// because something was deleted on it by mistake.
function DirectionDialog({
  title, intro,
  localName, localPayload, localStamp,
  cloudName, cloudPayload, cloudStamp,
  localAction, localHint,
  cloudAction, cloudHint,
  onUseLocal, onUseCloud, onCancel,
}) {
  const [pending, setPending] = useState(null);   // null | "local" | "cloud"

  useEffect(()=>{
    const onKey=(e)=>{ if(e.key==="Escape"){ if(pending) setPending(null); else onCancel(); } };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[onCancel,pending]);

  const lc = payloadCounts(localPayload), cc = payloadCounts(cloudPayload);
  const ms = (v)=>{ const t = v ? new Date(v).getTime() : 0; return Number.isFinite(t) ? t : 0; };
  const lt = ms(localStamp), ct = ms(cloudStamp);
  // Only claim one side is newer when both timestamps are actually usable.
  const newer = (lt && ct && lt !== ct) ? (lt > ct ? "local" : "cloud") : null;

  const when = (v)=>{ try{ return v ? new Date(v).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "—"; }catch{ return "—"; } };
  const diff = (a,b)=> a===b ? {color:"var(--c-text-muted)"} : {color:"var(--c-accent)",fontWeight:800};

  const badge = (text,bg,fg)=>(
    <span style={{fontSize:8.5,fontWeight:800,letterSpacing:".05em",background:bg,color:fg,
      borderRadius:20,padding:"2px 7px",marginLeft:6,whiteSpace:"nowrap"}}>{text}</span>
  );

  const side = (which,icon,label,name,counts,stamp,other) => (
    <div style={{flex:1,minWidth:0,background:"var(--c-surface2)",
      border:`1px solid ${newer===which?"#16653480":"var(--c-border)"}`,borderRadius:10,padding:"11px 12px"}}>
      <div style={{fontSize:10,fontWeight:800,letterSpacing:".04em",color:"var(--c-text-muted)",marginBottom:5,display:"flex",alignItems:"center",flexWrap:"wrap"}}>
        <span>{icon} {label}</span>
        {newer===which && badge("NEWER","#16653422","#166534")}
      </div>
      <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",wordBreak:"break-all",marginBottom:7}}>{name}</div>
      <div style={{fontSize:11,lineHeight:1.7}}>
        <div style={diff(counts.tasks,other.tasks)}>{counts.tasks} tasks</div>
        <div style={diff(counts.events,other.events)}>{counts.events} events</div>
        <div style={diff(counts.notes,other.notes)}>{counts.notes} notes</div>
      </div>
      <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:7}}>{stamp}</div>
    </div>
  );

  const shell = (children)=>(
    <div style={{position:"fixed",inset:0,zIndex:9800,background:"rgba(0,0,0,.45)",display:"flex",
      alignItems:"center",justifyContent:"center",padding:16}}
      onClick={()=>{ if(pending) setPending(null); else onCancel(); }}>
      <div onClick={e=>e.stopPropagation()}
        style={{width:520,maxWidth:"96vw",maxHeight:"90vh",overflowY:"auto",background:"var(--c-card,#fff)",
          border:"1px solid var(--c-border)",borderRadius:14,boxShadow:"0 20px 60px rgba(0,0,0,.35)",padding:"18px 18px 16px"}}>
        {children}
      </div>
    </div>
  );

  // ── step 2: final confirmation. Spells out what is about to be destroyed,
  //    because this is the only irreversible moment in the whole flow.
  if (pending) {
    const toCloud = pending === "local";
    const loser   = toCloud ? `Google Drive (${cloudName||"cloud file"})` : `this device`;
    const winner  = toCloud ? `this device` : `Google Drive`;
    const loserCounts = toCloud ? cc : lc;
    return shell(<>
      <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:6}}>
        {toCloud ? "📄 → ☁️" : "☁️ → 📄"}&nbsp;&nbsp;Confirm overwrite
      </div>
      <p style={{fontSize:12.5,color:"var(--c-text)",lineHeight:1.65,marginBottom:10}}>
        The copy on <strong>{winner}</strong> will replace the copy on <strong>{loser}</strong>.
      </p>
      <div style={{background:"#9f2d2d14",border:"1px solid #9f2d2d44",borderRadius:10,padding:"11px 13px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:800,color:"#9f2d2d",marginBottom:5}}>This will be discarded:</div>
        <div style={{fontSize:11.5,color:"var(--c-text)",lineHeight:1.7}}>
          {loserCounts.tasks} tasks · {loserCounts.events} events · {loserCounts.notes} notes
        </div>
        <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:6}}>
          This cannot be undone from here. Cancel and use Backup to Local Drive first if you are unsure.
        </div>
      </div>
      <button onClick={()=>{ setPending(null); (toCloud?onUseLocal:onUseCloud)(); }}
        style={{width:"100%",padding:"11px 14px",borderRadius:9,border:"none",background:"#9f2d2d",color:"#fff",
          fontSize:12.5,fontWeight:800,cursor:"pointer",marginBottom:8}}>
        Yes, overwrite {loser}
      </button>
      <button onClick={()=>setPending(null)}
        style={{width:"100%",padding:"9px 0",borderRadius:9,border:"none",background:"transparent",
          color:"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        Back
      </button>
    </>);
  }

  // ── step 1: show both sides, recommend the newer one, decide nothing yet.
  const actionBtn = (recommended)=>({width:"100%",padding:"11px 14px",borderRadius:9,
    border: recommended ? "none" : "1px solid var(--c-border)",
    background: recommended ? "#166534" : "var(--c-surface)",
    color: recommended ? "#fff" : "var(--c-text)",
    fontSize:12.5,fontWeight:800,cursor:"pointer",textAlign:"left",marginBottom:8});

  const localBtn = (
    <button key="local" onClick={()=>setPending("local")} style={actionBtn(newer==="local")}>
      📄 → ☁️&nbsp;&nbsp;{localAction}
      {newer==="local" && badge("RECOMMENDED","#ffffff2e","#fff")}
      <div style={{fontSize:10,fontWeight:600,opacity:.85,marginTop:2,
        color: newer==="local" ? "#fff" : "var(--c-text-muted)"}}>{localHint}</div>
    </button>
  );
  const cloudBtn = (
    <button key="cloud" onClick={()=>setPending("cloud")} style={actionBtn(newer==="cloud")}>
      ☁️ → 📄&nbsp;&nbsp;{cloudAction}
      {newer==="cloud" && badge("RECOMMENDED","#ffffff2e","#fff")}
      <div style={{fontSize:10,fontWeight:600,opacity:.85,marginTop:2,
        color: newer==="cloud" ? "#fff" : "var(--c-text-muted)"}}>{cloudHint}</div>
    </button>
  );

  return shell(<>
    <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>{title}</div>
    <p style={{fontSize:12,color:"var(--c-text-muted)",lineHeight:1.6,marginBottom:14}}>{intro}</p>

    <div style={{display:"flex",gap:10,alignItems:"stretch",marginBottom:14}}>
      {side("local","📄","THIS DEVICE",localName||"local copy",lc,`saved ${when(localStamp)}`,cc)}
      <div style={{display:"flex",alignItems:"center",fontSize:18,color:"var(--c-text-muted)"}}>⇄</div>
      {side("cloud","☁️","GOOGLE DRIVE",cloudName||"cloud file",cc,`synced ${when(cloudStamp)}`,lc)}
    </div>

    {newer
      ? <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:10,lineHeight:1.6}}>
          The {newer==="local"?"copy on this device":"copy on Drive"} was saved more recently, so that direction is
          recommended — but check the counts above before deciding.
        </div>
      : <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:10,lineHeight:1.6}}>
          The save times are not comparable, so neither side is recommended. Use the counts above to choose.
        </div>}

    {/* recommended direction first, so the safe choice is the one under the thumb */}
    {newer==="cloud" ? [cloudBtn, localBtn] : [localBtn, cloudBtn]}

    <button onClick={onCancel} style={{width:"100%",padding:"9px 0",borderRadius:9,border:"none",background:"transparent",
      color:"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
      Cancel — change nothing
    </button>
  </>);
}

// N107 wrapper: opening a local file that disagrees with the linked Drive file.
function ImportDirectionDialog({ fileName, localPayload, cloudPayload, cloudModified, onUseLocal, onUseCloud, onCancel }) {
  return (
    <DirectionDialog
      title="⚠️ These two copies differ"
      intro="The file you opened does not match what is on Google Drive. Choose which one to keep — nothing has been changed yet."
      localName={fileName||"opened file"}   localPayload={localPayload} localStamp={localPayload?.savedAt}
      cloudName={cloudPayload?.fileName||"cloud file"} cloudPayload={cloudPayload} cloudStamp={cloudModified}
      localAction="Use the local file"  localHint="Loads this file and overwrites the copy on Drive"
      cloudAction="Keep what is on Drive" cloudHint="Discards the opened file and loads the cloud copy"
      onUseLocal={onUseLocal} onUseCloud={onUseCloud} onCancel={onCancel}
    />
  );
}

function ConfirmDialog({ title, body, confirmLabel="Delete", cancelLabel="Cancel", danger=true, onConfirm, onCancel }) {
  useEffect(()=>{
    const onKey=(e)=>{ if(e.key==="Escape") onCancel(); };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[onCancel]);
  return (
    <div onClick={e=>e.target===e.currentTarget&&onCancel()}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:9800,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:15,padding:"22px 24px",
        width:"100%",maxWidth:400,boxShadow:"0 24px 60px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:11,marginBottom:6}}>
          <span style={{fontSize:20,lineHeight:1}}>{danger?"🗑️":"❓"}</span>
          <div style={{fontSize:15,fontWeight:800,color:"var(--c-text)",lineHeight:1.35}}>{title}</div>
        </div>
        {body && <div style={{fontSize:12,color:"var(--c-text-muted)",lineHeight:1.6,marginBottom:18,paddingLeft:31}}>{body}</div>}
        <div style={{display:"flex",gap:8}}>
          <button autoFocus onClick={onCancel}
            style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",
              color:"var(--c-text)",fontSize:13,fontWeight:800,cursor:"pointer"}}>{cancelLabel}</button>
          <button onClick={onConfirm}
            style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",
              background:danger?"#dc2626":"#166534",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── N55: SAVED VIEWS — one reusable bar for Gantt and Timeline ──────────────
// A "view" is just a snapshot of that page's filter + display state. Saving one
// stores the object; clicking a tab applies it back. Max 10 per page.
const MAX_SAVED_VIEWS = 10;
function useSavedViews(storageKey) {
  const [views, setViews] = useState([]);
  const mirror = (list)=>{ try{ if(!window.__viewsMirror) window.__viewsMirror={}; window.__viewsMirror[storageKey]=list; }catch{} };
  useEffect(()=>{ (async()=>{
    try{ const r=await window.storage.get(pkG(storageKey)); if(r?.value){const p=JSON.parse(r.value); if(Array.isArray(p)){ setViews(p); mirror(p);} } }catch{}
  })(); },[storageKey]);
  const persist = (list)=>{ setViews(list); mirror(list); try{ window.storage.set(pkG(storageKey), JSON.stringify(list)); }catch{} };
  return [views, persist];
}
function SavedViewBar({ views, onApply, onSave, onUpdate, onDelete, activeId, label="VIEW", isDirty=false, onDiscard }) {
  const [naming, setNaming] = useState(false);
  const [name, setName]     = useState("");
  const [confirmDel, setConfirmDel] = useState(null); // N59: never delete on a single click
  const [saveState, setSaveState] = useState("idle");  // N65: idle | saving | saved
  const commit = ()=>{ const n=name.trim(); if(!n) return; onSave(n); setName(""); setNaming(false); };
  const active = views.find(v=>v.id===activeId);
  // N65: a silent button feels broken. Show it was pressed, then confirm it worked.
  useEffect(()=>{
    if(saveState!=="saved") return;
    const t=setTimeout(()=>setSaveState("idle"), 1600);
    return ()=>clearTimeout(t);
  },[saveState]);
  const doUpdate = ()=>{
    if(!onUpdate || !active || saveState!=="idle") return;
    setSaveState("saving");
    onUpdate(active.id);
    setSaveState("saved");
    try{ window.__toast && window.__toast(`✅ View "${active.name}" updated`); }catch{}
  };
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10,
      background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:10,padding:"9px 12px"}}>
      <span style={{fontSize:9,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>💾 SAVED {label}S</span>
      {views.length===0 && !naming && (
        <span style={{fontSize:10.5,color:"var(--c-text-muted)"}}>No saved {label.toLowerCase()}s yet — set your filters, then save them.</span>
      )}
      {views.map(v=>(
        <span key={v.id} style={{display:"inline-flex",alignItems:"center",gap:0}}>
          <button onClick={()=>onApply(v)}
            style={{padding:"4px 11px",borderRadius:"16px 0 0 16px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",
              border:activeId===v.id?"1.5px solid #6366f1":"1px solid var(--c-border)",borderRight:"none",
              background:activeId===v.id?"#6366f122":"var(--c-surface)",
              color:activeId===v.id?"#6366f1":"var(--c-text-muted)"}}>👁 {v.name}</button>
          <button onClick={()=>setConfirmDel(v)} title="Delete this view"
            style={{padding:"4px 8px",borderRadius:"0 16px 16px 0",fontSize:10,cursor:"pointer",
              border:activeId===v.id?"1.5px solid #6366f1":"1px solid var(--c-border)",
              background:activeId===v.id?"#6366f122":"var(--c-surface)",color:"var(--c-text-muted)",opacity:0.65}}>✕</button>
        </span>
      ))}
      <div style={{flex:1}}/>
      {/* N59/N94: the view is only "dirty" (worth saving) if the live filters no longer
          match what was captured last time — otherwise there's nothing to update. */}
      {active && !naming && isDirty && (
        <>
          <button onClick={doUpdate} disabled={saveState!=="idle"}
            title={`Overwrite "${active.name}" with the current filters`}
            onMouseDown={e=>e.currentTarget.style.transform="scale(0.96)"}
            onMouseUp={e=>e.currentTarget.style.transform="none"}
            onMouseLeave={e=>e.currentTarget.style.transform="none"}
            style={{padding:"5px 13px",borderRadius:8,border:"none",
              background:saveState==="saved"?"#22c55e":"#166534",color:"#fff",
              fontSize:11,fontWeight:800,cursor:saveState==="idle"?"pointer":"default",whiteSpace:"nowrap",marginRight:6,
              transition:"transform .08s, background .18s",
              boxShadow:saveState==="saved"?"0 0 0 3px #22c55e44":"none"}}>
            {saveState==="saved" ? `✓ Saved` : saveState==="saving" ? "Saving…" : `💾 Update "${active.name}"`}
          </button>
          <button onClick={()=>onDiscard&&onDiscard(active)} disabled={saveState!=="idle"}
            title="Revert to the last saved version of this view — discard your unsaved changes"
            style={{padding:"5px 12px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",
              color:"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:saveState==="idle"?"pointer":"default",
              whiteSpace:"nowrap",marginRight:6}}>
            ↺ Discard changes
          </button>
        </>
      )}
      {active && !naming && !isDirty && (
        <span style={{fontSize:10.5,color:"var(--c-text-muted)",marginRight:6,whiteSpace:"nowrap"}}>✓ Up to date</span>
      )}
      {naming ? (
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          <input autoFocus value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape"){setNaming(false);setName("");} }}
            placeholder={`Name this ${label.toLowerCase()}…`}
            style={{padding:"5px 10px",borderRadius:8,border:"1.5px solid var(--c-accent)",background:"var(--c-surface)",
              color:"var(--c-text)",fontSize:11.5,outline:"none",width:180}}/>
          <button onClick={commit} style={{padding:"5px 12px",borderRadius:8,border:"none",background:"#166534",color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer"}}>Save</button>
          <button onClick={()=>{setNaming(false);setName("");}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>Cancel</button>
        </div>
      ) : (
        <button onClick={()=>setNaming(true)} disabled={views.length>=MAX_SAVED_VIEWS}
          title={views.length>=MAX_SAVED_VIEWS?`Limit of ${MAX_SAVED_VIEWS} reached`:"Save the current filters as a view"}
          style={{padding:"5px 13px",borderRadius:8,border:"1px dashed var(--c-border)",background:"var(--c-surface)",
            color:views.length>=MAX_SAVED_VIEWS?"var(--c-text-muted)":"var(--c-accent)",fontSize:11,fontWeight:800,
            cursor:views.length>=MAX_SAVED_VIEWS?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
          + Save current {label.toLowerCase()} ({views.length}/{MAX_SAVED_VIEWS})
        </button>
      )}

      {/* N59: yes/no confirmation before a view is destroyed */}
      {confirmDel && (
        <ConfirmDialog
          title={`Delete ${label.toLowerCase()} "${confirmDel.name}"?`}
          body="The saved filters will be removed. Your tasks and events are not affected."
          confirmLabel="Delete"
          onConfirm={()=>{ onDelete(confirmDel.id); setConfirmDel(null); }}
          onCancel={()=>setConfirmDel(null)}/>
      )}
    </div>
  );
}

// N35 item2: editor for a custom calendar view (filter by type/category)
function CalViewEditor({ view, eventTypes=[], allCategories=[], onSave, onDelete, onClose }) {
  const [confirmDel, setConfirmDel] = useState(false); // N59
  const [f, setF] = useState(view || {
    id:"v"+Date.now(), name:"", icon:"👁", color:"#6366f1",
    showPersonal:true, showWork:true, showEvents:true, showHolidays:true,
    eventTypeIds:[], categories:[],
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleArr=(k,val)=>setF(p=>{const a=p[k]||[];return {...p,[k]:a.includes(val)?a.filter(x=>x!==val):[...a,val]};});
  const inp={width:"100%",padding:"9px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl={display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:5};
  const ICONS=["👁","🏠","💼","🎌","✈️","📌","⭐","🎯","📚","💰"];
  const COLORS=["#ef4444","#f59e0b","#22c55e","#3b82f6","#6366f1","#8b5cf6","#ec4899","#14b8a6"];
  const Toggle=({k,label})=>(
    <button onClick={()=>set(k,!f[k])} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",background:f[k]?"#22c55e18":"var(--c-surface)",cursor:"pointer",width:"100%"}}>
      <span style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>{label}</span>
      <span style={{fontSize:12,fontWeight:800,color:f[k]?"#22c55e":"var(--c-text-muted)"}}>{f[k]?"✓ Shown":"Hidden"}</span>
    </button>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:6600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:16}}>🗂 {view?"Edit view":"New calendar view"}</div>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lbl}>VIEW NAME</label><input style={inp} value={f.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Work only, Holidays + Personal…" autoFocus/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>ICON</label>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {ICONS.map(ic=><button key={ic} onClick={()=>set("icon",ic)} style={{fontSize:16,padding:"3px 6px",borderRadius:7,cursor:"pointer",border:f.icon===ic?"2px solid var(--c-accent)":"1.5px solid var(--c-border)",background:f.icon===ic?"var(--c-accent)18":"transparent"}}>{ic}</button>)}
              </div>
            </div>
            <div>
              <label style={lbl}>TAB COLOR</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {COLORS.map(c=><button key={c} onClick={()=>set("color",c)} style={{width:24,height:24,borderRadius:7,cursor:"pointer",border:f.color===c?"3px solid var(--c-text)":"2px solid var(--c-border)",background:c}}/>)}
              </div>
            </div>
          </div>
          <div style={{display:"grid",gap:7}}>
            <label style={lbl}>WHAT TO SHOW</label>
            <Toggle k="showPersonal" label="🏠 Personal tasks"/>
            <Toggle k="showWork" label="💼 Work tasks"/>
            <Toggle k="showEvents" label="📅 Events"/>
          </div>
          {f.showEvents && eventTypes.length>0 && (
            <div>
              <label style={lbl}>ONLY THESE EVENT TYPES (empty = all)</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {eventTypes.map(t=>{const on=(f.eventTypeIds||[]).includes(t.id);return(
                  <button key={t.id} onClick={()=>toggleArr("eventTypeIds",t.id)} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:16,cursor:"pointer",border:on?`2px solid ${t.color}`:"1.5px solid var(--c-border)",background:on?t.color+"22":"transparent",fontSize:11,fontWeight:700,color:on?t.color:"var(--c-text-muted)"}}>
                    <span style={{width:9,height:9,borderRadius:"50%",background:t.color}}/>{t.name}</button>
                )})}
              </div>
            </div>
          )}
          {allCategories.length>0 && (f.showPersonal||f.showWork) && (
            <div>
              <label style={lbl}>ONLY THESE TASK CATEGORIES (empty = all)</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {allCategories.map(cat=>{const on=(f.categories||[]).includes(cat);return(
                  <button key={cat} onClick={()=>toggleArr("categories",cat)} style={{padding:"5px 10px",borderRadius:16,cursor:"pointer",border:on?"2px solid #6366f1":"1.5px solid var(--c-border)",background:on?"#6366f122":"transparent",fontSize:11,fontWeight:700,color:on?"#6366f1":"var(--c-text-muted)"}}>{cat}</button>
                )})}
              </div>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          {view&&<button onClick={()=>setConfirmDel(true)} style={{padding:"11px 16px",borderRadius:10,border:"none",background:"#7f1d1d",color:"#fca5a5",fontSize:13,fontWeight:800,cursor:"pointer"}}>🗑️ Delete</button>}
          {confirmDel&&<ConfirmDialog title={`Delete calendar view "${f.name||"Untitled"}"?`}
            body="Only the saved filters are removed — your tasks and events stay."
            onConfirm={()=>{setConfirmDel(false);onDelete(f.id);}} onCancel={()=>setConfirmDel(false)}/>}
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancel</button>
          <button onClick={()=>f.name.trim()&&onSave(f)} disabled={!f.name.trim()} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:f.name.trim()?(f.color||"#6366f1"):"var(--c-border)",color:"#fff",fontSize:13,fontWeight:800,cursor:f.name.trim()?"pointer":"default"}}>Save view</button>
        </div>
      </div>
    </div>
  );
}

function CalendarTab({ personal, work, setPersonal, setWork, events=[], setEvents, eventTypes=DEFAULT_EVENT_TYPES, setEventTypes, calViews=[], setCalViews, calFontSize=12, calFontFamily="system", onPatchConfig, lang, mentionTarget, clearMentionTarget }) {
  const FONT_STACKS = { system:"inherit", serif:"Georgia, 'Times New Roman', serif", mono:"'Courier New', monospace", rounded:"'Trebuchet MS', 'Segoe UI', sans-serif", thai:"'Noto Sans Thai', 'Leelawadee UI', sans-serif" };
  const calFF = FONT_STACKS[calFontFamily] || "inherit";
  const [showFontCfg, setShowFontCfg] = useState(false);
  const [view, setView]           = useState("month");
  const [cursor, setCursor]       = useState(() => { const d=new Date(TODAY); d.setDate(1); return d; });
  const [editingTask, setEditingTask] = useState(null);
  const [addingDate, setAddingDate] = useState(null); // N-CalendarClickAdd: ISO date clicked on empty cell area
  const [hoveredTask, setHoveredTask] = useState(null); // {task, x, y}
  const [hoveredHol, setHoveredHol]   = useState(null); // {name, dateIso, x, y}
  const [editingEvent, setEditingEvent] = useState(null); // N24: event being added/edited ("new" or event obj)
  const [fullScreen, setFullScreen] = useState(false);   // N35 item1: presentation view (hide menus/chrome)
  const [activeViewId, setActiveViewId] = useState("all"); // N35 item2: active custom calendar view filter
  const [showViewEditor, setShowViewEditor] = useState(false); // N35: add/edit custom view modal
  const [editingView, setEditingView] = useState(null); // the custom view being edited
  // N33: open the event editor when navigated here via an @mention link
  useEffect(()=>{
    if (mentionTarget?.type==="event" && mentionTarget.id!=null) {
      const ev = events.find(e=>String(e.id)===String(mentionTarget.id));
      if (ev) { setEditingEvent(ev); clearMentionTarget && clearMentionTarget(); }
    }
  }, [mentionTarget]);
  const saveEvent = (ev)=>{
    const existed = events.some(e=>e.id===ev.id);
    logAct(existed?"edit":"create", `${existed?"Edited":"Added"} event: ${ev.title}`, "calendar", `${ev.start}${ev.end&&ev.end!==ev.start?" → "+ev.end:""}`);
    const exists = events.some(e=>e.id===ev.id);
    setEvents(exists ? events.map(e=>e.id===ev.id?ev:e) : [...events, ev]);
    setEditingEvent(null);
  };
  const deleteEvent = (id)=>{ const ev=events.find(e=>e.id===id); logAct("delete", `Deleted event: ${ev?.title||id}`, "calendar"); setEvents(events.filter(e=>e.id!==id)); setEditingEvent(null); };
  // N24: events active on a given ISO date (start<=date<=end)
  const eventsOnDay = (iso)=>events.filter(e=>{
    // N35: apply custom view filter (by event type + showEvents toggle)
    if (activeView) {
      if (!activeView.showEvents) return false;
      if (activeView.eventTypeIds && activeView.eventTypeIds.length && !activeView.eventTypeIds.includes(e.typeId)) return false;
    }
    const d=parseDateLocal(iso);
    // N37: match ANY of the event's time windows
    return eventWindows(e).some(w=>{
      const s=parseDateLocal(w.start), en=parseDateLocal(w.end||w.start);
      s.setHours(0,0,0,0);en.setHours(23,59,59,0);
      return d>=s&&d<=en;
    });
  });

  // ── helpers ──────────────────────────────────────────────────────────────
  // ISO week number (Mon-based)
  const isoWeek = (d) => {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  };
  const isoWeekYear = (d) => {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    return tmp.getUTCFullYear();
  };
  const sameDay = (a,b) => a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  // N2 FIX: use LOCAL date parts, not toISOString() (which is UTC and shifts the day in +7 timezone)
  const fmt = d => {
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };

  // ── merged task list ──────────────────────────────────────────────────────
  // N35 item2: the currently active custom view (or null = show all)
  const activeView = useMemo(()=> activeViewId==="all" ? null : (calViews.find(v=>v.id===activeViewId)||null), [activeViewId, calViews]);

  const allTasks = useMemo(()=>[
    ...personal.map(t=>({...t,_type:"personal"})),
    ...work.map(t=>({...t,_type:"work"})),
  ],[personal,work]);

  const tasksOnDay = (d) => {
    const iso = fmt(d);
    return allTasks.filter(t => {
      if (!t.due) return false;
      // N35: apply custom view filter
      if (activeView) {
        if (t._type==="personal" && !activeView.showPersonal) return false;
        if (t._type==="work" && !activeView.showWork) return false;
        if (activeView.categories && activeView.categories.length && !activeView.categories.includes(t.cat)) return false;
      }
      const due = t.due.slice(0,10);
      const start = t.startDate ? t.startDate.slice(0,10) : due;
      return iso >= start && iso <= due;
    });
  };

  // ── save edit ─────────────────────────────────────────────────────────────
  const handleSaveTask = async (updated) => {
    const listRef = updated._type==="work"?work:personal;
    const prevT = listRef.find(t=>t.id===updated.id);
    const isNew = !prevT;
    const isDone = prevT && prevT.status!=="done" && updated.status==="done";
    if (updated._type === "work") {
      const next = prevT ? applyEditWithRecur(work, updated, "todo") : [...work, updated];
      setWork(next);
      try { await window.storage.set(pkG(W_KEY), JSON.stringify(next)); } catch {}
    } else {
      const next = prevT ? applyEditWithRecur(personal, updated, "pending") : [...personal, updated];
      setPersonal(next);
      try { await window.storage.set(pkG(P_KEY), JSON.stringify(next)); } catch {}
    }
    logAct(isNew?"create":isDone?"done":"edit", `${isNew?"Added":isDone?"Completed":"Edited"}: ${updated.title}`, updated._type, "from Calendar");
    setEditingTask(null);
    setAddingDate(null); // N-CalendarClickAdd: close chooser after saving new task
  };

  // ── navigation ────────────────────────────────────────────────────────────
  const navigate = (dir) => {
    const d = new Date(cursor);
    if (view==="month") d.setMonth(d.getMonth()+dir);
    else d.setDate(d.getDate() + dir*7);
    setCursor(d);
  };
  const goToday = () => {
    const d = new Date(TODAY);
    if (view==="month") d.setDate(1);
    setCursor(d);
  };

  // ── MONTH grid ────────────────────────────────────────────────────────────
  const monthGrid = useMemo(()=>{
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    // Start from Monday (ISO week)
    const startDow = (firstDay.getDay()+6)%7; // 0=Mon
    const start = new Date(firstDay);
    start.setDate(start.getDate()-startDow);
    const cells = [];
    for(let i=0;i<42;i++){
      const d = new Date(start);
      d.setDate(d.getDate()+i);
      cells.push(d);
    }
    return cells;
  },[cursor]);

  // ── WEEK grid ─────────────────────────────────────────────────────────────
  const weekDays = useMemo(()=>{
    // Find Monday of cursor's week
    const d = new Date(cursor);
    const dow = (d.getDay()+6)%7;
    d.setDate(d.getDate()-dow);
    return Array.from({length:7},(_,i)=>{ const x=new Date(d); x.setDate(d.getDate()+i); return x; });
  },[cursor]);

  // ── shared styles ─────────────────────────────────────────────────────────
  const DOW_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const CAT_C = t => t._type==="work"?(WORK_CAT_COLOR[t.cat]||"#818cf8"):(CAT_COLOR[t.cat]||"#6366f1");
  const headerLabel = view==="month"
    ? (lang==="TH"
        ? `${cursor.toLocaleDateString("th-TH",{month:"long"})} ${toThaiYear(cursor.getFullYear())}`
        : cursor.toLocaleDateString("en-GB",{month:"long",year:"numeric"}))
    : `W${isoWeek(weekDays[0])} · ${weekDays[0].toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} – ${weekDays[6].toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}`;

  // ── Task pill ─────────────────────────────────────────────────────────────
  const TaskPill = ({ t, compact, big }) => {
    const cc = CAT_C(t);
    const fs = big ? calFontSize+1 : compact ? Math.max(9,calFontSize-2) : calFontSize;
    return (
      <div onClick={e=>{e.stopPropagation();setEditingTask(t);}}
        title={t.title}
        style={{display:"flex",alignItems:"center",gap:3,background:cc+"28",borderLeft:`${big?3:2}px solid ${cc}`,borderRadius:4,padding:big?"3px 7px":compact?"1px 4px":"2px 6px",cursor:"pointer",marginBottom:big?3:2,opacity:t.status==="done"?0.5:1,transition:"background .1s",overflow:"hidden",minWidth:0,maxWidth:"100%",boxSizing:"border-box",fontFamily:calFF}}
        onMouseEnter={e=>{e.currentTarget.style.background=cc+"50";setHoveredTask({task:t,x:e.clientX,y:e.clientY});}}
        onMouseLeave={e=>{e.currentTarget.style.background=cc+"28";setHoveredTask(null);}}
      >
        <span style={{fontSize:fs,color:cc,fontWeight:800,flexShrink:0}}>{t._type==="work"?"W":"P"}</span>
        <span style={{fontSize:fs,color:"var(--c-text)",lineHeight:1.25,fontWeight:big?700:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:t.status==="done"?"line-through":"none",minWidth:0}}>{t.title}</span>
      </div>
    );
  };

  // ── Calendar Task Tooltip with media ──────────────────────────────────────
  const CalTaskTooltip = () => {
    if (!hoveredTask) return null;
    const {task,x,y} = hoveredTask;
    const isWork=task._type==="work";
    const cc=isWork?(WORK_CAT_COLOR[task.cat]||"#94a3b8"):(CAT_COLOR[task.cat]||"#94a3b8");
    const pc=PRIORITY_CFG[task.priority||"Medium"];
    const urg=urgency(task);
    const imgs=taskImages(task);
    const mediaAttach=(task.attachments||[]).filter(a=>{const k=detectAttachType(a);return k==="video"||k==="video-link";}).concat(imgs);
    const firstImg=imgs[0]||null;
    const firstVid=!firstImg&&mediaAttach.find(a=>detectAttachType(a)==="video");
    const left=Math.min(x+14,window.innerWidth-290);
    const top=Math.max(y-10,10);
    return (
      <div style={{position:"fixed",left,top,zIndex:8000,background:"var(--c-card2)",border:`1px solid ${cc}55`,borderRadius:12,padding:"12px 14px",pointerEvents:"none",boxShadow:"0 12px 40px rgba(0,0,0,.85)",maxWidth:280,minWidth:200}}>
        {firstImg&&<img src={safeImageSrc(firstImg)} alt="" style={{width:"100%",height:110,objectFit:"cover",borderRadius:8,marginBottom:10,display:"block"}} onError={e=>{e.target.style.display="none";}}/>}
        {firstVid&&<div style={{width:"100%",height:70,background:"var(--c-surface)",borderRadius:8,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><span style={{fontSize:20}}>▶️</span><span style={{fontSize:10,color:"var(--c-text-muted)"}}>{firstVid.name||"video"}</span></div>}
        {mediaAttach.length>1&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginBottom:8,textAlign:"right"}}>+{mediaAttach.length-1} more media</div>}
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
          <Chip color={cc}>{task.cat}</Chip>
          <span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:20,background:pc.bg,color:pc.color}}>{task.priority||"Medium"}</span>
          <Chip color={isWork?"#818cf8":"#34d399"} small>{isWork?"Work":"Personal"}</Chip>
        </div>
        <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",lineHeight:1.4,marginBottom:task.description?6:0}}>{task.title}</div>
        {task.description&&<div style={{fontSize:10,color:"var(--c-text-muted)",lineHeight:1.4,marginBottom:6,display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{task.description}</div>}
        {task.due&&<div style={{fontSize:10,color:urg.color,fontWeight:700,background:urg.color+"18",padding:"2px 8px",borderRadius:20,display:"inline-block"}}>{urg.label} · {fmtDate(task.due)}</div>}
        {task.location&&<div style={{fontSize:10,color:"#60a5fa",marginTop:5}}>📍 {task.location}</div>}
        {(task.attachments||[]).length>0&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:5}}>📎 {(task.attachments||[]).length} attachment{(task.attachments||[]).length!==1?"s":""} — click to open</div>}
      </div>
    );
  };

  // ── Holiday Tooltip ────────────────────────────────────────────────────────
  const HolTooltip = () => {
    if (!hoveredHol) return null;
    const {name,dateIso,x,y} = hoveredHol;
    const date = new Date(dateIso+"T00:00:00");
    const left=Math.min(x+14,window.innerWidth-240);
    return (
      <div style={{position:"fixed",left,top:Math.max(y-10,10),zIndex:8001,background:"var(--c-surface)",border:"1px solid #a855f755",borderRadius:10,padding:"10px 14px",pointerEvents:"none",boxShadow:"0 8px 30px rgba(0,0,0,.25)",maxWidth:220}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><span style={{fontSize:14}}>🇹🇭</span><span style={{fontSize:11,fontWeight:800,color:"#c084fc"}}>Thai Holiday</span></div>
        <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>{name}</div>
        <div style={{fontSize:10,color:"#9333ea"}}>{date.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        {lang==="TH"&&<div style={{fontSize:10,color:"#7c3aed",marginTop:2}}>{date.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long"})} {toThaiYear(date.getFullYear())}</div>}
        <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:5}}>Public holiday</div>
      </div>
    );
  };

  // ── MONTH VIEW ─────────────────────────────────────────────────────────────
  const MonthView = () => {
    const month = cursor.getMonth();
    const [expandDay, setExpandDay] = useState(null);
    const SHOW_MAX = 3;

    return (
      <div>
        {/* Day-of-week headers */}
        <div style={{display:"grid",gridTemplateColumns:"36px repeat(7,1fr)",gap:1,marginBottom:1}}>
          <div style={{fontSize:9,color:"var(--c-text-muted)",fontWeight:800,textAlign:"center",padding:"5px 0",letterSpacing:"0.06em"}}>WK</div>
          {DOW_LABELS.map(d=>(
            <div key={d} style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",textAlign:"center",padding:"5px 0",letterSpacing:"0.06em"}}>{d.toUpperCase()}</div>
          ))}
        </div>

        {/* Rows — 6 weeks */}
        {Array.from({length:6},(_,wi)=>{
          const weekStart = monthGrid[wi*7];
          const wn = isoWeek(weekStart);
          const wy = isoWeekYear(weekStart);
          const isCurrentWk = wn===isoWeek(TODAY) && wy===isoWeekYear(TODAY);
          return (
            <div key={wi} style={{display:"grid",gridTemplateColumns:"36px repeat(7,1fr)",gap:1,marginBottom:1}}>
              {/* Week number cell */}
              <div style={{
                display:"flex",alignItems:"flex-start",justifyContent:"center",
                padding:"6px 0",
                fontSize:9,fontWeight:800,letterSpacing:"0.06em",
                color:isCurrentWk?"#a5b4fc":"var(--c-border)",
                background:isCurrentWk?"#6366f112":"transparent",
                borderRadius:4,
              }}>W{wn}</div>

              {/* 7 day cells */}
              {monthGrid.slice(wi*7,wi*7+7).map((d,di)=>{
                const isThisMonth = d.getMonth()===month;
                const isToday     = sameDay(d,TODAY);
                const isSat = di===5, isSun = di===6;
                const thaiHol = (!activeView || activeView.showHolidays!==false) ? isThaiHoliday(fmt(d)) : null;
                const tasks = tasksOnDay(d);
                const visible = tasks.slice(0, expandDay===fmt(d)?999:SHOW_MAX);
                const hidden  = Math.max(0, tasks.length - SHOW_MAX);
                return (
                  <div key={di}
                    onClick={()=>setAddingDate(fmt(d))}
                    title="Click to add a task on this day"
                    style={{
                    minHeight:activeView?120:90,
                    minWidth:0, overflow:"hidden", boxSizing:"border-box",
                    background: isToday?"var(--c-hover)":thaiHol?"#a855f712":isThisMonth?"var(--c-surface)":"var(--c-surface2)",
                    border:`1px solid ${isToday?"var(--c-accent)":thaiHol?"#a855f733":"var(--c-surface)"}`,
                    borderRadius:6,padding:"5px 5px 4px",
                    outline: isToday?"2px solid var(--c-accent)":"none",
                    outlineOffset:-1,
                    cursor:"pointer",
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2,alignItems:"flex-start"}}>
                      <span style={{fontSize:9,color:"#a855f7",fontWeight:700,lineHeight:1.2,maxWidth:"65%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:thaiHol?"help":"default"}}
                        onMouseEnter={thaiHol?e=>setHoveredHol({name:thaiHol,dateIso:fmt(d),x:e.clientX,y:e.clientY}):undefined}
                        onMouseLeave={thaiHol?()=>setHoveredHol(null):undefined}>
                        {thaiHol?`🎌 ${lang==="TH"?thaiHol:thaiHol}`:""}
                      </span>
                      <span style={{
                        fontSize:11,fontWeight:isToday?900:isThisMonth?600:400,
                        color:isToday?"#fff":thaiHol?"#c084fc":isThisMonth?(isSat||isSun?"#f472b688":"var(--c-text-muted)"):"var(--c-border)",
                        background:isToday?"var(--c-accent)":"transparent",
                        borderRadius:"50%",width:20,height:20,
                        display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,flexShrink:0,
                      }}>{d.getDate()}</span>
                    </div>
                    {/* N24/N35: event chips — bigger + type color when a custom view is active */}
                    {eventsOnDay(fmt(d)).map(ev=>(
                      <div key={ev.id} onClick={e=>{e.stopPropagation();setEditingEvent(ev);}}
                        title={(()=>{const w=eventWindows(ev).find(x=>fmt(d)>=x.start&&fmt(d)<=(x.end||x.start));return (w&&w.desc)||ev.note||ev.title;})()}
                        style={{fontSize:activeView?calFontSize+1:Math.max(8,calFontSize-3),fontWeight:800,color:"#fff",background:ev.color||"#8b5cf6",
                          borderRadius:4,padding:activeView?"3px 7px":"1px 4px",marginBottom:activeView?3:1,cursor:"pointer",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.3,fontFamily:calFF,
                          display:"flex",alignItems:"center",gap:3}}>
                        <span style={{fontSize:activeView?11:7}}>📅</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</span>{ev.location&&<span style={{flexShrink:0,marginLeft:2}}>📍</span>}
                      </div>
                    ))}
                    {/* Task pills */}
                    {visible.map(t=><TaskPill key={`${t._type}-${t.id}`} t={t} compact={!activeView} big={!!activeView}/>)}
                    {hidden>0&&expandDay!==fmt(d)&&(
                      <div onClick={e=>{e.stopPropagation();setExpandDay(fmt(d));}}
                        style={{fontSize:9,color:"#6366f1",fontWeight:700,cursor:"pointer",padding:"1px 4px",
                          background:"#6366f118",borderRadius:3,display:"inline-block",marginTop:1}}>
                        +{hidden} more
                      </div>
                    )}
                    {expandDay===fmt(d)&&tasks.length>SHOW_MAX&&(
                      <div onClick={e=>{e.stopPropagation();setExpandDay(null);}}
                        style={{fontSize:9,color:"var(--c-text-muted)",cursor:"pointer",padding:"1px 4px",
                          marginTop:1,display:"inline-block"}}>
                        show less ▲
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ── WEEK VIEW ──────────────────────────────────────────────────────────────
  const WeekView = () => {
    const wn = isoWeek(weekDays[0]);
    return (
      <div>
        {/* Header row */}
        <div style={{display:"grid",gridTemplateColumns:"36px repeat(7,1fr)",gap:4,marginBottom:4}}>
          <div style={{
            fontSize:9,color:"#a5b4fc",fontWeight:900,
            display:"flex",alignItems:"center",justifyContent:"center",
            background:"#6366f118",borderRadius:6,padding:"4px 0",letterSpacing:"0.06em"
          }}>W{wn}</div>
          {weekDays.map((d,i)=>{
            const isToday = sameDay(d,TODAY);
            const isSat = i===5, isSun = i===6;
            return (
              <div key={i} style={{
                textAlign:"center",padding:"6px 4px",borderRadius:8,
                background:isToday?"var(--c-hover)":"var(--c-surface2)",
                border:`1px solid ${isToday?"var(--c-accent)":"var(--c-surface)"}`,
                outline:isToday?"2px solid var(--c-accent)":"none",outlineOffset:-1,
              }}>
                <div style={{fontSize:10,fontWeight:800,color:isToday?"var(--c-accent)":isSat||isSun?"#f472b688":"var(--c-text-muted)",letterSpacing:"0.06em"}}>
                  {DOW_LABELS[i].toUpperCase()}
                </div>
                <div style={{fontSize:20,fontWeight:900,color:isToday?"var(--c-accent)":isSat||isSun?"#f472b6aa":"var(--c-text)",lineHeight:1.1,margin:"2px 0"}}>
                  {d.getDate()}
                </div>
                <div style={{fontSize:10,color:"var(--c-text-muted)"}}>
                  {d.toLocaleDateString("en-GB",{month:"short"})}
                </div>
              </div>
            );
          })}
        </div>

        {/* Task rows */}
        <div style={{display:"grid",gridTemplateColumns:"36px repeat(7,1fr)",gap:4}}>
          <div/> {/* week number spacer */}
          {weekDays.map((d,i)=>{
            const tasks = tasksOnDay(d);
            const isToday = sameDay(d,TODAY);
            return (
              <div key={i}
                onClick={()=>setAddingDate(fmt(d))}
                title="Click to add a task on this day"
                style={{
                minHeight:120,padding:"6px 5px",
                background:isToday?"var(--c-surface)":"var(--c-surface2)",
                border:`1px solid ${isToday?"var(--c-accent)":"var(--c-surface)"}`,
                borderRadius:8,
                cursor:"pointer",
              }}>
                {/* N24 fix: event chips in week view */}
                {eventsOnDay(fmt(d)).map(ev=>(
                  <div key={ev.id} onClick={e=>{e.stopPropagation();setEditingEvent(ev);}}
                    title={ev.note||ev.title}
                    style={{fontSize:9,fontWeight:700,color:"#fff",background:ev.color||"#8b5cf6",
                      borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      display:"flex",alignItems:"center",gap:2}}>
                    <span style={{fontSize:8}}>📅</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</span>{ev.location&&<span style={{flexShrink:0,marginLeft:2}}>📍</span>}
                  </div>
                ))}
                {tasks.length===0&&eventsOnDay(fmt(d)).length===0?(
                  <div style={{fontSize:10,color:"var(--c-surface)",textAlign:"center",marginTop:16}}>—</div>
                ):tasks.map(t=>(
                  <TaskPill key={`${t._type}-${t.id}`} t={t} compact={false}/>
                ))}
              </div>
            );
          })}
        </div>

        {/* Summary: overdue + no-date */}
        {(allTasks.filter(t=>isOverdue(t)).length>0||allTasks.filter(t=>!t.due&&t.status!=="done"&&!isOverdue(t)).length>0)&&(()=>{
          const overdue=allTasks.filter(t=>isOverdue(t));
          const noDate=allTasks.filter(t=>!t.due&&t.status!=="done"&&t.status!=="overdue");
          return(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:16}}>
              {overdue.length>0&&(
                <div style={{background:"#7f1d1d22",border:"1px solid #ef444433",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#f87171",letterSpacing:"0.07em",marginBottom:8}}>🚨 OVERDUE ({overdue.length})</div>
                  {overdue.map(t=><TaskPill key={`${t._type}-${t.id}`} t={t} compact/>)}
                </div>
              )}
              {noDate.length>0&&(
                <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em",marginBottom:8}}>❓ NO DATE ({noDate.length})</div>
                  {noDate.slice(0,8).map(t=><TaskPill key={`${t._type}-${t.id}`} t={t} compact/>)}
                  {noDate.length>8&&<div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>+{noDate.length-8} more…</div>}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={fullScreen?{position:"fixed",inset:0,zIndex:9000,background:"var(--c-bg)",overflow:"auto",padding:"12px 16px"}:undefined}>
      {editingTask&&(
        <TaskDetailModal task={editingTask} onSave={handleSaveTask} onClose={()=>{setEditingTask(null);setAddingDate(null);}}
          onDuplicate={t=>{
            const copy = duplicateTask(t);
            if (copy._type==="work") { const next=[...work,copy]; setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{}); }
            else { const next=[...personal,copy]; setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{}); }
          }}/>
      )}
      {/* N-CalendarClickAdd: quick chooser after clicking empty day cell + N5 view tasks */}
      {addingDate&&!editingTask&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:3500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={e=>e.target===e.currentTarget&&setAddingDate(null)}>
          <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:14,padding:22,maxWidth:340,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)",marginBottom:4}}>📅 {fmtDate(addingDate)}</div>
            {(()=>{
              const dayTasks = tasksOnDay(new Date(addingDate+"T00:00:00"));
              return (
                <>
                  <div style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:14}}>
                    {dayTasks.length>0 ? `${dayTasks.length} task${dayTasks.length!==1?"s":""} on this day` : "No tasks yet — add one below"}
                  </div>
                  {/* N5: task list for this day */}
                  {dayTasks.length>0&&(
                    <div style={{marginBottom:14,maxHeight:180,overflowY:"auto",border:"1px solid var(--c-border)",borderRadius:9}}>
                      {dayTasks.map(t=>{
                        const isWork=t._type==="work";
                        const cc=isWork?groupColor(t.project):groupColor(t.cat);
                        const isDone=t.status==="done";
                        return (
                          <div key={`${t._type}-${t.id}`}
                            onClick={()=>{setEditingTask(t);}}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"8px 11px",cursor:"pointer",
                              borderLeft:`3px solid ${cc}`,borderBottom:"1px solid var(--c-border)",
                              background:"var(--c-surface)",opacity:isDone?0.55:1}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--c-hover)"}
                            onMouseLeave={e=>e.currentTarget.style.background="var(--c-surface)"}>
                            <span style={{fontSize:11}}>{isWork?"💼":"🏠"}</span>
                            <span style={{fontSize:12,color:"var(--c-text)",flex:1,textDecoration:isDone?"line-through":"none",
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isDone&&"✓ "}{t.title}</span>
                            <span style={{fontSize:10,color:"var(--c-text-muted)"}}>✏️</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.06em",marginBottom:6}}>+ ADD NEW TASK</div>
                </>
              );
            })()}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={()=>setEditingTask({_type:"personal",due:addingDate,startDate:addingDate})}
                style={{padding:"11px 0",borderRadius:9,border:"1.5px solid #34d39955",background:"#34d39915",color:"#059669",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                🏠 Personal Task
              </button>
              <button onClick={()=>setEditingTask({_type:"work",due:addingDate,startDate:addingDate})}
                style={{padding:"11px 0",borderRadius:9,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4f46e5",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                💼 Work Task
              </button>
              {/* N37: add an Event straight from the day popup */}
              <button onClick={()=>{const d=addingDate;setAddingDate(null);setEditingEvent({id:newId(),title:"",start:d,end:d,typeId:(eventTypes[0]?.id)||"personal",color:(eventTypes[0]?.color)||"#8b5cf6",note:""});}}
                style={{padding:"11px 0",borderRadius:9,border:"1.5px solid #8b5cf655",background:"#8b5cf615",color:"#7c3aed",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                📅 Add Event
              </button>
              <button onClick={()=>setAddingDate(null)}
                style={{padding:"9px 0",borderRadius:9,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating hover tooltips */}
      <CalTaskTooltip/>
      <HolTooltip/>

      {/* N35 item2: Custom calendar view tabs */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={()=>setActiveViewId("all")} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:800,cursor:"pointer",
          border:activeViewId==="all"?"2px solid var(--c-accent)":"1.5px solid var(--c-border)",
          background:activeViewId==="all"?"var(--c-accent)22":"transparent",
          color:activeViewId==="all"?"var(--c-accent)":"var(--c-text-muted)"}}>🗂 All</button>
        {calViews.map(v=>(
          <button key={v.id} onClick={()=>setActiveViewId(v.id)}
            onDoubleClick={()=>{setEditingView(v);setShowViewEditor(true);}}
            title="Double-click to edit"
            style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:800,cursor:"pointer",
            border:activeViewId===v.id?`2px solid ${v.color||"#6366f1"}`:"1.5px solid var(--c-border)",
            background:activeViewId===v.id?(v.color||"#6366f1")+"22":"transparent",
            color:activeViewId===v.id?(v.color||"#6366f1"):"var(--c-text-muted)"}}>{v.icon||"👁"} {v.name}</button>
        ))}
        {calViews.length<10&&(
          <button onClick={()=>{setEditingView(null);setShowViewEditor(true);}} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:800,cursor:"pointer",
            border:"1.5px dashed var(--c-border)",background:"transparent",color:"var(--c-text-muted)"}}>+ View</button>
        )}
        <div style={{flex:1}}/>
        {/* N36: in-page calendar font settings */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setShowFontCfg(s=>!s)} title="Adjust the calendar font"
            style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--c-border)",background:showFontCfg?"var(--c-accent)22":"var(--c-surface)",color:"var(--c-text)",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
            🔤 Font
          </button>
          {showFontCfg && (
            <div style={{position:"absolute",top:"110%",right:0,zIndex:500,background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:12,padding:14,width:260,boxShadow:"0 16px 40px rgba(0,0,0,.3)"}}>
              <div style={{fontSize:12,fontWeight:800,color:"var(--c-text)",marginBottom:10}}>🔤 Calendar Font</div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Size: {calFontSize}px</div>
              <input type="range" min={9} max={20} value={calFontSize}
                onChange={e=>onPatchConfig&&onPatchConfig({calFontSize:Number(e.target.value)})}
                style={{width:"100%",marginBottom:6,accentColor:"var(--c-accent)"}}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {[10,12,14,16,18].map(s=>(
                  <button key={s} onClick={()=>onPatchConfig&&onPatchConfig({calFontSize:s})}
                    style={{padding:"3px 9px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                      border:calFontSize===s?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:calFontSize===s?"var(--c-accent)18":"var(--c-surface)",color:calFontSize===s?"var(--c-accent)":"var(--c-text-muted)"}}>{s}</button>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:"var(--c-text-muted)",marginBottom:5}}>Font family</div>
              <div style={{display:"grid",gap:4}}>
                {[["system","Default (System)"],["rounded","Rounded"],["serif","Serif"],["mono","Monospace"],["thai","Thai (Noto Sans Thai)"]].map(([v,l])=>(
                  <button key={v} onClick={()=>onPatchConfig&&onPatchConfig({calFontFamily:v})}
                    style={{padding:"7px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"left",
                      fontFamily:FONT_STACKS[v],
                      border:calFontFamily===v?"1.5px solid var(--c-accent)":"1px solid var(--c-border)",
                      background:calFontFamily===v?"var(--c-accent)18":"var(--c-surface)",
                      color:calFontFamily===v?"var(--c-accent)":"var(--c-text)"}}>{l}</button>
                ))}
              </div>
              <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:8,lineHeight:1.4}}>💾 Saved automatically for the calendar page</div>
            </div>
          )}
        </div>
        {/* Item 1: fullscreen / presentation toggle */}
        <button onClick={()=>setFullScreen(f=>!f)} title="Presentation / full-screen view"
          style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
          {fullScreen?"✕ Exit full screen":"⛶ Full screen"}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        {/* Prev / Today / Next */}
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>navigate(-1)} style={{padding:"6px 13px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text-muted)",cursor:"pointer",fontSize:14,fontWeight:700}}>‹</button>
          <button onClick={goToday} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #6366f133",background:"#6366f112",color:"#a5b4fc",cursor:"pointer",fontSize:12,fontWeight:700}}>Today</button>
          <button onClick={()=>navigate(1)} style={{padding:"6px 13px",borderRadius:8,border:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text-muted)",cursor:"pointer",fontSize:14,fontWeight:700}}>›</button>
        </div>

        {/* Header label */}
        <span style={{fontSize:16,fontWeight:900,color:"var(--c-text)",letterSpacing:"-0.01em",flex:1}}>{headerLabel}</span>

        {/* Week / Month toggle */}
        <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
          {[["month","📅 Month"],["week","🗓 Week"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setView(v);goToday();}} style={{
              padding:"6px 16px",borderRadius:6,border:"none",
              background:view===v?"#6366f1":"transparent",
              color:view===v?"#fff":"var(--c-text-muted)",
              fontSize:12,fontWeight:700,cursor:"pointer",
            }}>{l}</button>
          ))}
        </div>
        {/* N24: Add Event */}
        <button onClick={()=>setEditingEvent("new")} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#8b5cf6",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:800,whiteSpace:"nowrap"}}>+ 📅 Event</button>
      </div>

      {/* N24: Event modal */}
      {editingEvent&&<EventModal event={editingEvent==="new"?null:editingEvent} onSave={saveEvent} onDelete={deleteEvent} onClose={()=>setEditingEvent(null)} eventTypes={eventTypes} setEventTypes={setEventTypes}/>}

      {/* N35 item2: Calendar View editor */}
      {showViewEditor && (
        <CalViewEditor
          view={editingView}
          eventTypes={eventTypes}
          allCategories={[...new Set([...personal.map(t=>t.cat),...work.map(t=>t.cat)].filter(Boolean))]}
          onSave={(v)=>{
            let next;
            if (editingView) next = calViews.map(x=>x.id===v.id?v:x);
            else next = [...calViews, v];
            setCalViews(next); setActiveViewId(v.id); setShowViewEditor(false); setEditingView(null);
          }}
          onDelete={(id)=>{ setCalViews(calViews.filter(x=>x.id!==id)); if(activeViewId===id)setActiveViewId("all"); setShowViewEditor(false); setEditingView(null); }}
          onClose={()=>{setShowViewEditor(false);setEditingView(null);}}
        />
      )}

      {/* Legend */}
      <div style={{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.07em"}}>LEGEND</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,background:"#6366f128",borderLeft:"2px solid #6366f1",padding:"1px 6px",borderRadius:3,color:"#a5b4fc",fontWeight:700}}>P</span><span style={{fontSize:10,color:"var(--c-text-muted)"}}>Personal</span></div>
        <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,background:"#818cf828",borderLeft:"2px solid #818cf8",padding:"1px 6px",borderRadius:3,color:"#a5b4fc",fontWeight:700}}>W</span><span style={{fontSize:10,color:"var(--c-text-muted)"}}>Work</span></div>
        <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,background:"var(--c-accent)",border:"2px solid var(--c-accent)",borderRadius:4,padding:"0 5px",color:"#fff",fontWeight:700}}>25</span><span style={{fontSize:10,color:"var(--c-text-muted)"}}>Today</span></div>
        <span style={{fontSize:10,color:"var(--c-text-muted)",fontStyle:"italic"}}>— click any task pill to view &amp; edit</span>
      </div>

      {view==="month" ? <MonthView/> : <WeekView/>}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM TAB VIEW
// ─────────────────────────────────────────────────────────────────────────────
function CustomTabView({ tabCfg, personal, work, setPersonal, setWork }) {
  const [lightbox, setLightbox] = useState(null);
  const [modal, setModal]       = useState(null);

  const allTasks = useMemo(()=>[
    ...personal.map(t=>({...t,_type:"personal"})),
    ...work.map(t=>({...t,_type:"work"})),
  ],[personal,work]);

  const filtered = useMemo(()=>{
    let l = allTasks;
    if (tabCfg.source==="personal") l=l.filter(t=>t._type==="personal");
    if (tabCfg.source==="work")     l=l.filter(t=>t._type==="work");
    if (tabCfg.cats&&tabCfg.cats.length>0) l=l.filter(t=>tabCfg.cats.includes(t.cat));
    if (tabCfg.hideStatus&&tabCfg.hideStatus.length>0) l=l.filter(t=>!tabCfg.hideStatus.includes(t.status));
    return l.sort((a,b)=>{
      const aD=a.status==="done"?9999:a.status==="overdue"?-1:(a.due?daysUntil(a.due):8888);
      const bD=b.status==="done"?9999:b.status==="overdue"?-1:(b.due?daysUntil(b.due):8888);
      return aD-bD;
    });
  },[allTasks,tabCfg]);

  const saveWork = async (next) => { setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{} };
  const savePersonal = async (next) => { setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{} };

  const handleSave = async (updated) => {
    if (updated._type==="work") saveWork(applyEditWithRecur(work, updated, "todo"));
    else savePersonal(applyEditWithRecur(personal, updated, "pending"));
    setModal(null);
  };

  return (
    <div>
      {lightbox&&<MediaLightbox item={lightbox} onClose={()=>setLightbox(null)}/>}
      {modal&&<TaskDetailModal task={modal} onSave={handleSave} onClose={()=>setModal(null)}
        onDuplicate={t=>{
          const copy = duplicateTask(t);
          if (copy._type==="work") saveWork([...work,copy]);
          else savePersonal([...personal,copy]);
        }}/>}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,color:"var(--c-text-muted)"}}>{filtered.length} tasks</span>
        {tabCfg.cats&&tabCfg.cats.map(c=>{const cc=CAT_COLOR[c]||WORK_CAT_COLOR[c]||"#94a3b8";return<Chip key={c} color={cc}>{c}</Chip>;})}
        {tabCfg.source&&tabCfg.source!=="all"&&<Chip color={tabCfg.source==="work"?"#818cf8":"#34d399"}>{tabCfg.source==="work"?"💼 Work":"🏠 Personal"}</Chip>}
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"var(--c-text-muted)"}}><div style={{fontSize:32,marginBottom:12}}>📋</div><div style={{fontSize:14,color:"var(--c-text-muted)"}}>No tasks match this tab's filters.</div></div>}
      <div style={{display:"grid",gap:8}}>
        {filtered.map(t=>{
          if(t._type==="work") return <WorkCard key={`w-${t.id}`} t={t}
            onEdit={t=>setModal(t)}
            onDelete={id=>saveWork(work.filter(x=>x.id!==id))}
            onToggleDone={id=>saveWork(work.map(x=>x.id===id?stampMilestone(x,{...x,status:x.status==="done"?"todo":"done"}):x))}
            onLightbox={setLightbox}
            onDuplicate={t=>saveWork([...work,duplicateTask({...t,_type:"work"})])}/>;
          return <PersonalCard key={`p-${t.id}`} t={t}
            onEdit={t=>setModal(t)}
            onDelete={id=>savePersonal(personal.filter(x=>x.id!==id))}
            onToggleDone={id=>savePersonal(personal.map(x=>x.id===id?stampMilestone(x,{...x,status:x.status==="done"?"pending":"done"}):x))}
            onLightbox={setLightbox}
            onDuplicate={t=>savePersonal([...personal,duplicateTask({...t,_type:"personal"})])}/>;
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD / EDIT TAB MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AddTabModal({ personal, work, onSave, onClose, existing }) {
  const [label, setLabel]   = useState(existing?.label||"");
  const [emoji, setEmoji]   = useState(existing?.emoji||"📌");
  const [source, setSource] = useState(existing?.source||"all");
  const [cats, setCats]     = useState(existing?.cats||[]);
  const [hideDone, setHideDone] = useState(existing?.hideStatus?.includes("done")??true);

  const allCats = useMemo(()=>{
    const s=new Set(); [...personal,...work].forEach(t=>{if(t.cat)s.add(t.cat);}); return [...s].sort();
  },[personal,work]);
  const toggleCat = c => setCats(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c]);
  const EMOJIS = ["📌","⭐","🔥","💡","🚀","🏷️","📎","🎯","🛠️","📂","🧩","💼","🏠","🚗","💊","📅","🔔","✅","⚡","🌟"];

  const inp={width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl={display:"block",fontSize:11,color:"var(--c-text-muted)",marginBottom:4,fontWeight:700,letterSpacing:"0.06em"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:500,boxShadow:"0 25px 60px rgba(0,0,0,.8)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <h3 style={{margin:0,color:"var(--c-text)",fontSize:17,fontWeight:800}}>{existing?"✏️ Edit Tab":"➕ Add Custom Tab"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"grid",gap:14}}>
          <div>
            <label style={lbl}>EMOJI</label>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
              {EMOJIS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{width:34,height:34,borderRadius:8,border:`2px solid ${emoji===e?"#6366f1":"var(--c-border)"}`,background:emoji===e?"#6366f122":"var(--c-surface)",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>)}
            </div>
            <input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder="or type any emoji" maxLength={2} style={{...inp,width:160,textAlign:"center",fontSize:18}}/>
          </div>
          <div><label style={lbl}>TAB NAME</label><input style={inp} value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Insurance, Urgent, My Tasks…"/></div>
          <div>
            <label style={lbl}>SHOW TASKS FROM</label>
            <div style={{display:"flex",gap:6}}>
              {[["all","🗂 All"],["personal","🏠 Personal"],["work","💼 Work"]].map(([v,l_])=>(
                <button key={v} onClick={()=>setSource(v)} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid",borderColor:source===v?"#6366f1":"var(--c-border)",background:source===v?"#312e81":"transparent",color:source===v?"#c7d2fe":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l_}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>FILTER BY CATEGORY <span style={{color:"var(--c-text-muted)",fontWeight:400}}>(empty = all categories)</span></label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {allCats.map(c=>{const cc=CAT_COLOR[c]||WORK_CAT_COLOR[c]||"#94a3b8";const sel=cats.includes(c);return(
                <button key={c} onClick={()=>toggleCat(c)} style={{padding:"4px 12px",borderRadius:20,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:sel?cc:"var(--c-border)",background:sel?cc+"22":"transparent",color:sel?cc:"var(--c-text-muted)"}}>{c}</button>
              );})}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setHideDone(!hideDone)} style={{width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:hideDone?"#6366f1":"var(--c-border)",position:"relative",transition:"background .2s",padding:0,flexShrink:0}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,transition:"left .2s",left:hideDone?18:2}}/>
            </button>
            <span style={{fontSize:13,color:"var(--c-text-muted)"}}>Hide completed tasks</span>
          </div>
          {/* Preview */}
          <div style={{padding:"10px 14px",background:"var(--c-surface2)",borderRadius:8,border:"1px solid var(--c-border)"}}>
            <span style={{fontSize:11,color:"var(--c-text-muted)"}}>Preview tab: </span>
            <span style={{fontSize:13,color:"#a5b4fc",fontWeight:700}}>{emoji} {label||"Tab Name"}</span>
            {cats.length>0&&<span style={{fontSize:11,color:"var(--c-text-muted)",marginLeft:8}}>· {cats.join(", ")}</span>}
            {source!=="all"&&<span style={{fontSize:11,color:"var(--c-text-muted)",marginLeft:8}}>· {source} only</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"9px 20px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={()=>{if(!label.trim())return;onSave({id:existing?.id||`custom-${Date.now()}`,label:label.trim(),emoji:emoji||"📌",source,cats:cats.length>0?cats:[],hideStatus:hideDone?["done"]:[]});}} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800}}>{existing?"Save Changes":"Add Tab"}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TAB  — recent changes with Undo/Redo
// ─────────────────────────────────────────────────────────────────────────────
function ActivityTab({ activity, onUndo, onRedo, undoStack, redoStack, onJumpTo }) {
  const [filter, setFilter] = useState("task"); // N-Activity: default = Tasks

  const actionColor = t => ({add:"#22c55e",delete:"#ef4444",done:"#22c55e",undone:"#f59e0b",edit:"#6366f1",pin:"#f59e0b",unpin:"var(--c-text-muted)",config:"#818cf8",profile:"#a78bfa",import:"#06b6d4",export:"#06b6d4",tab:"#f472b6"})[t]||"#6366f1";
  const actionIcon  = t => ({add:"➕",delete:"🗑️",done:"✅",undone:"↩️",edit:"✏️",pin:"📌",unpin:"📍",config:"⚙️",profile:"👤",import:"📥",export:"📤",tab:"🏷️"})[t]||"✏️";
  const actionLabel = t => ({add:"Added",delete:"Deleted",done:"Completed",undone:"Restored",edit:"Edited",pin:"Pinned",unpin:"Unpinned",config:"Config changed",profile:"Profile",import:"Imported",export:"Saved",tab:"Tab changed"})[t]||t;
  const isTaskAct   = t => ["add","delete","done","undone","edit","pin","unpin"].includes(t);

  const filtered = useMemo(()=>{
    if(filter==="task")   return activity.filter(a=>isTaskAct(a.type));
    if(filter==="config") return activity.filter(a=>!isTaskAct(a.type));
    return activity;
  },[activity,filter]);

  const grouped = useMemo(()=>{
    // N-Activity: newest first — activity array is already newest-first
    // so we iterate forward, each date group has newest entry at top
    const g={};
    filtered.forEach(a=>{
      const d=new Date(a.ts).toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
      if(!g[d])g[d]=[];g[d].push(a);
    });
    // Sort date groups: most recent date first
    return Object.entries(g).sort((a,b)=>{
      const da=new Date(g[a[0]]?.[0]?.ts||0);
      const db=new Date(g[b[0]]?.[0]?.ts||0);
      return db-da;
    });
  },[filtered]);

  return (
    <div style={{maxWidth:780}}>
      {/* Controls */}
      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={onUndo} disabled={!undoStack.length}
          style={{display:"flex",alignItems:"center",gap:5,padding:"7px 16px",borderRadius:9,border:`1.5px solid ${undoStack.length?"#6366f1":"var(--c-surface)"}`,background:undoStack.length?"#6366f122":"transparent",color:undoStack.length?"#a5b4fc":"var(--c-border)",fontWeight:700,fontSize:12,cursor:undoStack.length?"pointer":"default"}}>
          ↩️ Undo {undoStack.length>0&&`(${undoStack.length})`}
        </button>
        <button onClick={onRedo} disabled={!redoStack.length}
          style={{display:"flex",alignItems:"center",gap:5,padding:"7px 16px",borderRadius:9,border:`1.5px solid ${redoStack.length?"#f59e0b":"var(--c-surface)"}`,background:redoStack.length?"#f59e0b22":"transparent",color:redoStack.length?"#fbbf24":"var(--c-border)",fontWeight:700,fontSize:12,cursor:redoStack.length?"pointer":"default"}}>
          ↪️ Redo {redoStack.length>0&&`(${redoStack.length})`}
        </button>
        <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
          {[["All","All"],["task","Tasks"],["config","System"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid",fontSize:11,fontWeight:700,cursor:"pointer",borderColor:filter===v?"#6366f1":"var(--c-border)",background:filter===v?"#6366f122":"transparent",color:filter===v?"#a5b4fc":"var(--c-text-muted)"}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{background:"var(--c-surface)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:11,color:"var(--c-text-muted)",lineHeight:1.5}}>
        🕐 <strong style={{color:"var(--c-text-muted)"}}>{activity.length}</strong> events tracked ·
        Click <strong style={{color:"#a5b4fc"}}>↩ Restore</strong> on any task action to jump back to that exact state ·
        Max 20 undo steps
      </div>

      {activity.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"var(--c-text-muted)"}}><div style={{fontSize:32,marginBottom:10}}>📋</div><div style={{fontSize:14,color:"var(--c-text-muted)"}}>No activity yet — all task and config changes will appear here.</div></div>}

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {grouped.map(([date,entries])=>(
          <div key={date}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:1,background:"var(--c-surface)"}}/>{date.toUpperCase()}<div style={{flex:1,height:1,background:"var(--c-surface)"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {entries.map((a,ei)=>{
                const cc=actionColor(a.type);
                const isTask=isTaskAct(a.type);
                const hasSnap=!!(a.snapshot);
                const isLatest=ei===0&&grouped[0][1]===entries;
                return (
                  <div key={a.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 13px",borderRadius:10,background:isLatest?"var(--c-surface)":"var(--c-surface2)",border:`1px solid ${isLatest?"var(--c-border)":"var(--c-surface)"}`,borderLeft:`3px solid ${cc}`}}>
                    <span style={{fontSize:15,flexShrink:0,marginTop:1}}>{actionIcon(a.type)}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontWeight:800,padding:"1px 6px",borderRadius:20,background:cc+"22",color:cc}}>{actionLabel(a.type)}</span>
                        {a.module&&<span style={{fontSize:9,color:"var(--c-text-muted)",background:"var(--c-surface)",padding:"1px 6px",borderRadius:20}}>{a.module==="work"?"💼 Work":a.module==="config"?"⚙️ Config":a.module==="profile"?"👤 Profile":"🏠 Personal"}</span>}
                        {isLatest&&<span style={{fontSize:9,color:"#6366f1",fontWeight:800,letterSpacing:"0.06em"}}>LATEST</span>}
                      </div>
                      <div style={{color:"var(--c-text)",fontSize:12,fontWeight:600,lineHeight:1.4}}>{a.title}</div>
                      {a.detail&&<div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:2,fontStyle:"italic"}}>{a.detail}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      <div style={{fontSize:10,color:"var(--c-text-muted)"}}>{new Date(a.ts).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
                      {isTask&&hasSnap&&onJumpTo&&(
                        <button onClick={()=>onJumpTo(a)} title="Restore data to this exact state"
                          style={{fontSize:9,padding:"3px 9px",borderRadius:6,border:`1px solid ${cc}44`,background:cc+"11",color:cc,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",transition:"all .1s"}}
                          onMouseEnter={e=>{e.currentTarget.style.background=cc+"30";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=cc+"11";}}>
                          ↩ Restore
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG TAB  — themes, fonts
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// N-FileNameDisplay: standardized clickable filename — used in header + Config
// Desktop: shows full name, wraps if long. Mobile/Tablet: middle-truncates.
// Click anywhere on it → opens file picker → loads the chosen file immediately.
// ─────────────────────────────────────────────────────────────────────────────
function middleTruncate(name, maxLen=28) {
  if (!name || name.length <= maxLen) return name || "";
  const keep = Math.floor((maxLen - 3) / 2);
  return `${name.slice(0, keep)}...${name.slice(-keep)}`;
}

function FileNameDisplay({ fileName, onPickFile, isCompact=false, statusColor, statusIcon, size="normal" }) {
  const display = isCompact ? middleTruncate(fileName, 24) : fileName;
  const fontSize = size==="small" ? "0.62em" : "0.8em";
  return (
    <button
      onClick={onPickFile}
      title={fileName ? `${fileName} — click to change file` : "No file yet — click to choose one"}
      style={{
        display:"flex", alignItems:"center", gap:4,
        background:"transparent", border:"none", padding:0, margin:0,
        cursor:"pointer", textAlign:"left",
        color: statusColor || "inherit",
        fontSize, fontWeight:600,
        maxWidth: isCompact ? 170 : 320,
        whiteSpace: isCompact ? "nowrap" : "normal",
        wordBreak: isCompact ? "normal" : "break-all",
        lineHeight:1.3,
      }}
      onMouseEnter={e=>e.currentTarget.style.opacity=0.75}
      onMouseLeave={e=>e.currentTarget.style.opacity=1}>
      {statusIcon&&<span style={{flexShrink:0}}>{statusIcon}</span>}
      <span style={{overflow:isCompact?"hidden":"visible",textOverflow:isCompact?"ellipsis":"clip",textDecoration:"underline",textDecorationStyle:"dotted",textDecorationColor:"currentColor",textUnderlineOffset:2}}>
        {display || "Not saved to file"}
      </span>
    </button>
  );
}

function ConfigTab({ config, onSave }) {
  const [draft, setDraft] = useState({...DEFAULT_CONFIG, ...config});
  const set = (k,v) => setDraft(d=>({...d,[k]:v}));
  const lbl = {display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:6};
  const rowStyle = {padding:"10px 14px",borderRadius:10,background:"var(--c-surface)",border:"1px solid var(--c-border)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,marginBottom:8};
  const toggleBtn = (active) => ({padding:"6px 16px",borderRadius:8,border:`1.5px solid ${active?"#22c55e":"var(--c-border)"}`,background:active?"#22c55e22":"transparent",color:active?"#86efac":"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0});

  return (
    <div style={{maxWidth:700}}>
      <div style={{fontSize:13,fontWeight:800,color:"var(--c-text-muted)",letterSpacing:"0.08em",marginBottom:22}}>⚙️ CONFIGURATION — set all app defaults here</div>

      {/* ── Theme ── */}
      <div style={{marginBottom:26}}>
        <label style={lbl}>🎨 THEME</label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {Object.entries(THEMES).map(([id,th])=>{
            const isActive=draft.themeId===id;
            return (
              <button key={id} onClick={()=>set("themeId",id)} style={{padding:"13px 15px",borderRadius:12,cursor:"pointer",textAlign:"left",border:`2px solid ${isActive?th.accent:th.border}`,background:th.surface,outline:isActive?`3px solid ${th.accent}44`:"none",outlineOffset:2,transition:"all .15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>{th.emoji}</span>
                  <span style={{fontSize:12,fontWeight:800,color:th.text}}>{th.name}</span>
                  {id==="claude"&&<span style={{marginLeft:"auto",fontSize:9,fontWeight:800,background:th.accent+"22",color:th.accent,borderRadius:20,padding:"1px 6px"}}>✦ DEFAULT</span>}
                  {isActive&&id!=="claude"&&<span style={{marginLeft:"auto",fontSize:10,color:th.accentText,fontWeight:800}}>✓</span>}
                </div>
                <div style={{display:"flex",gap:4}}>{[th.bg,th.surface,th.border,th.accent,th.text].map((c,i)=>(<div key={i} style={{width:16,height:16,borderRadius:4,background:c,border:`1px solid ${th.border}`}}/>))}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Font family ── */}
      <div style={{marginBottom:22}}>
        <label style={lbl}>🔡 FONT FAMILY</label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
          {FONT_FAMILIES.map(f=>(
            <button key={f.id} onClick={()=>set("fontFamily",f.id)} style={{padding:"9px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",border:`1.5px solid ${draft.fontFamily===f.id?"#6366f1":"var(--c-border)"}`,background:draft.fontFamily===f.id?"#6366f122":"var(--c-surface2)",color:draft.fontFamily===f.id?"#a5b4fc":"#94a3b8",fontSize:12,fontFamily:f.value,fontWeight:600,transition:"all .15s"}}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* ── Font size ── */}
      <div style={{marginBottom:22}}>
        <label style={lbl}>🔤 FONT SIZE</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[12,13,14,15,16,17,18,20,22].map(s=>(
            <button key={s} onClick={()=>set("fontSize",s)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${draft.fontSize===s?"#6366f1":"var(--c-border)"}`,background:draft.fontSize===s?"#6366f122":"var(--c-surface2)",color:draft.fontSize===s?"#a5b4fc":"var(--c-text-muted)",fontSize:s-2,fontWeight:draft.fontSize===s?800:600,cursor:"pointer",minWidth:42}}>{s}px</button>
          ))}
        </div>
      </div>

      {/* ── Language ── */}
      <div style={{marginBottom:22}}>
        <label style={lbl}>🌐 LANGUAGE</label>
        <div style={{display:"flex",gap:8}}>
          {[["EN","🇬🇧 English"],["TH","🇹🇭 ภาษาไทย"]].map(([v,l])=>(
            <button key={v} onClick={()=>set("lang",v)} style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${draft.lang===v?"#6366f1":"var(--c-border)"}`,background:draft.lang===v?"#6366f122":"var(--c-surface2)",color:draft.lang===v?"#a5b4fc":"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Gantt defaults ── */}
      <div style={{marginBottom:22}}>
        <label style={lbl}>📊 GANTT DEFAULTS</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:11,color:"var(--c-text-muted)",minWidth:90,flexShrink:0}}>Default zoom:</span>
          {[["3m","3 Mo"],["6m","6 Mo"],["1y","1 Yr"],["2y","2 Yr"],["5y","5 Yr"]].map(([v,l])=>(
            <button key={v} onClick={()=>set("ganttZoom",v)} style={{padding:"5px 12px",borderRadius:7,border:`1.5px solid ${draft.ganttZoom===v?"#6366f1":"var(--c-border)"}`,background:draft.ganttZoom===v?"#6366f122":"var(--c-surface2)",color:draft.ganttZoom===v?"#a5b4fc":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={rowStyle}>
          <div><div style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>Week Numbers ON by default</div><div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:2}}>Show W26/W27… ISO week header in Gantt</div></div>
          <button onClick={()=>set("ganttWeeks",!draft.ganttWeeks)} style={toggleBtn(draft.ganttWeeks)}>{draft.ganttWeeks?"✓ ON":"OFF"}</button>
        </div>
      </div>

      {/* ── Default opening tab ── */}
      <div style={{marginBottom:22}}>
        <label style={lbl}>🏠 DEFAULT OPENING TAB</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[["timeline","🏠 Overview"],["calendar","🗓 Calendar"],["gantt","📊 Gantt"],["personal","👤 Personal"],["work","💼 Work"]].map(([v,l])=>(
            <button key={v} onClick={()=>set("defaultTab",v)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${draft.defaultTab===v?"#6366f1":"var(--c-border)"}`,background:draft.defaultTab===v?"#6366f122":"var(--c-surface2)",color:draft.defaultTab===v?"#a5b4fc":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Save behaviour ── */}
      <div style={{marginBottom:30}}>
        <label style={lbl}>💾 SAVE BEHAVIOUR</label>
        <div style={rowStyle}>
          <div><div style={{fontSize:12,fontWeight:700,color:"var(--c-text)"}}>Confirm before overwriting file</div><div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:2}}>Show Yes/No popup when ⌘S would overwrite an existing file</div></div>
          <button onClick={()=>set("autoSavePrompt",!draft.autoSavePrompt)} style={toggleBtn(draft.autoSavePrompt!==false)}>{draft.autoSavePrompt!==false?"✓ ON":"OFF"}</button>
        </div>
        {/* Q2: Default filename */}
        <div style={{marginTop:12,background:"var(--c-surface2)",borderRadius:10,border:"1px solid var(--c-border)",padding:"14px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>Default file name</div>
          <div style={{fontSize:10,color:"var(--c-text-muted)",marginBottom:8,lineHeight:1.5}}>
            Used when saving a new file. Leave blank to auto-generate from your profile name.
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input value={draft.defaultFileName||""} onChange={e=>set("defaultFileName",e.target.value)}
              placeholder="e.g. My-Todo-Personal"
              style={{flex:1,padding:"8px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",
                background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,outline:"none"}}/>
            <span style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:700}}>.json</span>
          </div>
          <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:8,lineHeight:1.5}}>
            💡 On Chrome/Edge, the app remembers the last folder you saved to — next save goes to the same place automatically.
          </div>
          {/* N25: default start folder for open/save dialogs */}
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--c-border)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>Default folder for Open/Save</div>
            <div style={{fontSize:10,color:"var(--c-text-muted)",marginBottom:8,lineHeight:1.5}}>
              Which system folder the file dialog opens in the first time (before it remembers your last file).
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["documents","📄 Documents"],["desktop","🖥️ Desktop"],["downloads","⬇️ Downloads"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("defaultStartFolder",v)}
                  style={{padding:"6px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${(draft.defaultStartFolder||"documents")===v?"#6366f1":"var(--c-border)"}`,
                    background:(draft.defaultStartFolder||"documents")===v?"#6366f122":"var(--c-surface2)",
                    color:(draft.defaultStartFolder||"documents")===v?"#a5b4fc":"var(--c-text-muted)"}}>{l}</button>
              ))}
            </div>
          </div>
          {/* A1: backup reminder interval (weeks, editable) */}
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--c-border)"}}>
            {/* N56: default data-file path */}
            <div style={{marginBottom:18,paddingBottom:18,borderBottom:"1px solid var(--c-border)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>📁 Default data file</div>
              <div style={{fontSize:10.5,color:"var(--c-text-muted)",marginBottom:8,lineHeight:1.55}}>
                Where your <code>.json</code> lives. The file name here is used when saving, and the folder is shown next to the
                Open button as a reminder. Browsers can't open an absolute path on their own — you pick the file once, then
                Chrome/Edge remember it for the whole session.
              </div>
              <input value={draft.defaultFilePath??""} onChange={e=>setDraft({...draft, defaultFilePath:e.target.value})}
                placeholder="My-Todo-Planner.json" spellCheck={false}
                style={{width:"100%",padding:"9px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",
                  background:"var(--c-input)",color:"var(--c-text)",fontSize:11.5,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
              <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:6}}>
                File name detected: <strong style={{color:"var(--c-text)"}}>{(draft.defaultFilePath||"").split(/[\\/]/).pop()||"—"}</strong>
              </div>
            </div>

            <div style={{fontSize:12,fontWeight:700,color:"var(--c-text)",marginBottom:4}}>💾 Backup reminder interval</div>
            <div style={{fontSize:10,color:"var(--c-text-muted)",marginBottom:8,lineHeight:1.5}}>
              If you haven\u2019t exported within this many weeks, a reminder banner appears at the top (1–16, type any value)
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min={1} max={16} value={draft.backupReminderWeeks??1}
                onChange={e=>{ let v=parseInt(e.target.value,10); if(isNaN(v))v=1; v=Math.max(1,Math.min(16,v)); set("backupReminderWeeks",v); }}
                style={{width:80,padding:"8px 10px",borderRadius:8,border:"1.5px solid var(--c-border)",
                  background:"var(--c-surface2)",color:"var(--c-text)",fontSize:14,fontWeight:700,textAlign:"center"}}/>
              <span style={{fontSize:12,color:"var(--c-text-muted)"}}>week(s) = {((draft.backupReminderWeeks??1)*7)} days</span>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
              {[1,2,4,8,12,16].map(w=>(
                <button key={w} onClick={()=>set("backupReminderWeeks",w)}
                  style={{padding:"4px 10px",borderRadius:7,fontSize:10,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${(draft.backupReminderWeeks??1)===w?"#166534":"var(--c-border)"}`,
                    background:(draft.backupReminderWeeks??1)===w?"#16653422":"var(--c-surface2)",
                    color:(draft.backupReminderWeeks??1)===w?"#166534":"var(--c-text-muted)"}}>{w}w</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Credentials (removed in 3.77.0) ──────────────────────────────
          These panels used to accept an Anthropic API key, a Google API key,
          an OAuth client ID and a Microsoft app ID. Shipped builds hid them
          again from outside the bundle (mtp-security-ui) *after* React had
          already painted them, so the inputs briefly existed in the DOM.
          They are now simply not rendered. Drive access uses the signed-in
          Google account; nothing here needs a pasted secret. The wrapper
          script stays in place as a second line of defence. */}
      <div style={{marginBottom:28}}>
        <label style={lbl}>🔐 CREDENTIALS</label>
        <div style={{background:"var(--c-surface2)",borderRadius:10,border:"1px solid var(--c-border)",padding:"14px 16px",display:"grid",gap:8}}>
          <div style={{fontSize:11,color:"var(--c-text-muted)",lineHeight:1.7}}>
            Google Drive sync uses the Google account you sign in with — there are no keys to paste here.
          </div>
          <div style={{fontSize:11,color:"var(--c-text-muted)",lineHeight:1.7}}>
            Secrets are never stored in your profile file. Anything found in an older file is stripped on import.
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <button onClick={()=>onSave(draft)} style={{padding:"11px 32px",borderRadius:10,border:"none",background:"#6366f1",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>✓ Apply Settings</button>
        <button onClick={()=>setDraft({...DEFAULT_CONFIG})} style={{padding:"11px 22px",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>↺ Reset to defaults</button>
      </div>
    </div>
  );
}

function AboutTab({ dataLastUpdated }) {
  const latest = CHANGELOG[0];  // always first entry = current version
  const prevVersion = latest.prev || "—";

  return (
    <div style={{maxWidth:700}}>
      {/* Software version card */}
      <div style={{
        background:"linear-gradient(135deg,var(--c-surface) 0%,var(--c-surface2) 100%)",
        border:"1px solid var(--c-accent)33",borderRadius:16,padding:"20px 24px",marginBottom:20,
      }}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.12em",color:"var(--c-text-muted)",marginBottom:4}}>MY TODO PLANNER</div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <div style={{fontSize:32,fontWeight:900,color:"var(--c-accent)",letterSpacing:"-0.02em",lineHeight:1}}>v{APP_VERSION}</div>
              <div style={{fontSize:13,color:"var(--c-text-muted)"}}>
                <span style={{background:"var(--c-accent)22",color:"var(--c-accent)",borderRadius:6,padding:"2px 8px",fontWeight:700}}>CURRENT</span>
                <span style={{marginLeft:8}}>Released {APP_BUILD}</span>
              </div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"var(--c-text-muted)",marginBottom:4,letterSpacing:"0.06em"}}>DATA LAST UPDATED</div>
            <div style={{fontSize:13,fontWeight:700,color:"var(--c-text)"}}>
              {dataLastUpdated
                ? new Date(dataLastUpdated).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
                : "—  (using original data)"}
            </div>
          </div>
        </div>
      </div>

      {/* N17: Developer contact */}
      <div style={{background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>👨‍💻</span>
        <div>
          <div style={{fontSize:11,color:"var(--c-text-muted)",fontWeight:700,letterSpacing:"0.05em"}}>DEVELOPER</div>
          <a href="mailto:champbanyat@gmail.com" style={{fontSize:13,color:"var(--c-accent)",fontWeight:700,textDecoration:"none"}}>champbanyat@gmail.com</a>
        </div>
      </div>

      {/* N34: Keyboard shortcuts reference */}
      <div style={{background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"12px 20px",borderBottom:"1px solid var(--c-border)",fontSize:12,fontWeight:800,color:"var(--c-text)",letterSpacing:"0.04em"}}>⌨️ KEYBOARD SHORTCUTS</div>
        <div style={{padding:"6px 0"}}>
          {[
            ["Ctrl + K","Search everything (tasks / notes / events) — Cmd+K on Mac"],
            ["Ctrl + S","Save your data file — Cmd+S on Mac"],
            ["@","Type in a note or Description to link a task / note / event"],
            ["↑ ↓","Move through search / @mention results"],
            ["Enter or Tab","Pick the highlighted @mention"],
            ["Esc","Close a dropdown or the search overlay"],
            ["Enter (Quick Add)","Add the typed sentence as a Personal task"],
            ["Enter (Subtask field)","Add the subtask"],
            ["Ctrl + V (in Notes)","Paste an image / screenshot straight into the note"],
            ["Ctrl + B / I / U (in Notes)","Bold / italic / underline"],
          ].map(([key,desc],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"7px 20px",borderBottom:i<9?"1px solid var(--c-border)":"none"}}>
              <kbd style={{flexShrink:0,minWidth:120,textAlign:"center",background:"var(--c-surface)",border:"1px solid var(--c-border)",borderBottom:"2px solid var(--c-border)",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:800,color:"var(--c-accent)",fontFamily:"monospace"}}>{key}</kbd>
              <span style={{fontSize:12,color:"var(--c-text-muted)",lineHeight:1.5}}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What's new: v(prev) → v(current) */}
      <div style={{background:"var(--c-surface2)",border:"1px solid var(--c-border)",borderRadius:14,overflow:"hidden",marginBottom:16}}>
        <div style={{
          padding:"14px 20px",
          background:"linear-gradient(90deg,var(--c-accent)22,transparent)",
          borderBottom:"1px solid var(--c-border)",
          display:"flex",alignItems:"center",gap:10,
        }}>
          <span style={{fontSize:16}}>🆕</span>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"var(--c-text)"}}>What's new in v{APP_VERSION}</div>
            <div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:2}}>Changes from v{prevVersion} → v{APP_VERSION}</div>
          </div>
        </div>
        <div style={{padding:"14px 20px"}}>
          {latest.changes.map((c,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:i<latest.changes.length-1?8:0,alignItems:"flex-start"}}>
              <span style={{color:"#6366f1",flexShrink:0,fontSize:14,marginTop:1}}>✦</span>
              <span style={{fontSize:13,color:"var(--c-text)",lineHeight:1.5}}>{c}</span>
            </div>
          ))}
          {latest.breaking&&latest.breaking.length>0&&(
            <div style={{marginTop:14,padding:"10px 14px",background:"#7f1d1d22",border:"1px solid #ef444433",borderRadius:8}}>
              <div style={{fontSize:11,fontWeight:800,color:"#f87171",marginBottom:6,letterSpacing:"0.06em"}}>⚠️ BREAKING CHANGES</div>
              {latest.breaking.map((b,i)=><div key={i} style={{fontSize:12,color:"#fca5a5",lineHeight:1.5}}>• {b}</div>)}
            </div>
          )}
        </div>
      </div>

      {/* System info */}
      <div style={{padding:"12px 16px",background:"var(--c-card2)",borderRadius:10,border:"1px solid var(--c-border)",fontSize:11,color:"var(--c-text-muted)",lineHeight:1.8}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px"}}>
          <span>📦 Runtime: React 18 + Vite bundle</span>
          <span>💾 Storage: localStorage (browser)</span>
          <span>🌐 Offline: fully supported</span>
          <span>🔒 Privacy: no data leaves your device</span>
          <span>📁 File: My-Todo-Planner-v{APP_VERSION}.html</span>
          <span>🏗️ Build: {APP_BUILD}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING SCREEN — shown when no profile exists
// ─────────────────────────────────────────────────────────────────────────────
function OnboardingScreen({ onCreateProfile, onOpenFile, onOpenDrive, isIOS=false, openFileRef }) {
  const [name, setName]   = useState("");
  const [emoji, setEmoji] = useState("👤");
  const [step, setStep]   = useState("welcome"); // "welcome" | "create"

  // Auto-detect language from browser
  const browserLang = navigator.language?.startsWith("th") ? "TH" : "EN";
  const txt = {
    EN: {
      welcome:    "Welcome to My Todo Planner",
      sub:        "Your personal productivity dashboard",
      create:     "Create New Profile",
      open:       "Open Existing Data File",
      nameLabel:  "Your name",
      namePh:     "e.g. John, Work, Family…",
      start:      "Get Started",
      back:       "Back",
      or:         "or",
      openHint:   "Load a previously saved .json file",
      openDrive:  "Open from Google Drive",
      driveHint:  "Recommended on iPad / iPhone — syncs across devices",
      localInstead:"or open a local file instead",
    },
    TH: {
      welcome:    "ยินดีต้อนรับสู่ My Todo Planner",
      sub:        "แดชบอร์ดการจัดการชีวิตส่วนตัวของคุณ",
      create:     "สร้างโปรไฟล์ใหม่",
      open:       "เปิดไฟล์ข้อมูลที่มีอยู่",
      nameLabel:  "ชื่อของคุณ",
      namePh:     "เช่น สมชาย, งาน, ครอบครัว…",
      start:      "เริ่มใช้งาน",
      back:       "ย้อนกลับ",
      or:         "หรือ",
      openHint:   "โหลดไฟล์ .json ที่บันทึกไว้ก่อนหน้า",
      openDrive:  "เปิดจาก Google Drive",
      driveHint:  "แนะนำสำหรับ iPad / iPhone — ซิงค์ข้ามอุปกรณ์",
      localInstead:"หรือเปิดไฟล์ในเครื่องแทน",
    },
  }[browserLang];

  const emojis = ["👤","🧑","👨","👩","🧔","🎯","⭐","🔥","🚀","🌟","💎","🦁","🐯","🌿","🏄","🎸","👨‍💼","👩‍💼"];

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreateProfile({ name: name.trim(), emoji });
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#f9f7f5",padding:24,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <div style={{width:"100%",maxWidth:420,textAlign:"center"}}>

        {/* App icon placeholder */}
        <div style={{width:80,height:80,borderRadius:20,background:"#d97706",margin:"0 auto 20px",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,
          boxShadow:"0 8px 24px rgba(217,119,6,.3)"}}>
          📅
        </div>

        {step==="welcome"&&(
          <>
            <h1 style={{fontSize:24,fontWeight:900,color:"#1a1714",marginBottom:8,letterSpacing:"-0.02em"}}>
              {txt.welcome}
            </h1>
            <p style={{fontSize:14,color:"#7d7168",marginBottom:36,lineHeight:1.6}}>{txt.sub}</p>

            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button onClick={()=>setStep("create")}
                style={{padding:"14px 24px",borderRadius:12,border:"none",
                  background:"#d97706",color:"#fff",fontSize:15,fontWeight:800,
                  cursor:"pointer",boxShadow:"0 4px 12px rgba(217,119,6,.35)",
                  transition:"transform .1s"}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
                onMouseLeave={e=>e.currentTarget.style.transform=""}>
                ＋ {txt.create}
              </button>

              <div style={{display:"flex",alignItems:"center",gap:12,color:"#c5bdb4",fontSize:12}}>
                <div style={{flex:1,height:1,background:"#e8e4df"}}/>{txt.or}<div style={{flex:1,height:1,background:"#e8e4df"}}/>
              </div>

              {isIOS ? (
                <>
                  {/* N102: on iPad/iPhone there is no real folder to browse, so lead
                      with Google Drive — it doubles as starting cloud sync. */}
                  <button onClick={onOpenDrive}
                    style={{padding:"13px 24px",borderRadius:12,border:"2px solid #1a73e8",
                      background:"#1a73e8",color:"#fff",fontSize:14,fontWeight:800,
                      cursor:"pointer",transition:"all .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity="0.92"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    ☁️ {txt.openDrive}
                  </button>
                  <p style={{fontSize:11,color:"#c5bdb4",marginTop:-4}}>{txt.driveHint}</p>
                  <button onClick={onOpenFile}
                    style={{padding:"4px",border:"none",background:"transparent",color:"#a89e94",
                      fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"underline"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#d97706"}
                    onMouseLeave={e=>e.currentTarget.style.color="#a89e94"}>
                    {txt.localInstead}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onOpenFile}
                    style={{padding:"13px 24px",borderRadius:12,border:"2px solid #e8e4df",
                      background:"#fff",color:"#7d7168",fontSize:14,fontWeight:700,
                      cursor:"pointer",transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#d97706";e.currentTarget.style.color="#d97706";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e4df";e.currentTarget.style.color="#7d7168";}}>
                    📂 {txt.open}
                  </button>
                  <p style={{fontSize:11,color:"#c5bdb4",marginTop:-4}}>{txt.openHint}</p>
                </>
              )}
            </div>
          </>
        )}

        {step==="create"&&(
          <>
            <h2 style={{fontSize:20,fontWeight:800,color:"#1a1714",marginBottom:6}}>{txt.create}</h2>
            <p style={{fontSize:13,color:"#7d7168",marginBottom:24}}>{txt.sub}</p>

            {/* Emoji picker */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:48,marginBottom:10}}>{emoji}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
                {emojis.map(e=>(
                  <button key={e} onClick={()=>setEmoji(e)}
                    style={{width:38,height:38,borderRadius:10,border:`2px solid ${emoji===e?"#d97706":"#e8e4df"}`,
                      background:emoji===e?"#fef3c7":"#fff",fontSize:20,cursor:"pointer",
                      transition:"all .1s"}}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div style={{marginBottom:24,textAlign:"left"}}>
              <label style={{display:"block",fontSize:11,fontWeight:800,color:"#7d7168",
                letterSpacing:"0.08em",marginBottom:6}}>{txt.nameLabel.toUpperCase()}</label>
              <input
                autoFocus
                value={name}
                onChange={e=>setName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleCreate()}
                placeholder={txt.namePh}
                style={{width:"100%",padding:"12px 14px",borderRadius:10,
                  border:`2px solid ${name.trim()?"#d97706":"#e8e4df"}`,
                  background:"#fff",fontSize:15,color:"#1a1714",outline:"none",
                  boxSizing:"border-box",transition:"border-color .15s"}}
              />
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep("welcome")}
                style={{flex:1,padding:"12px 0",borderRadius:10,border:"2px solid #e8e4df",
                  background:"#fff",color:"#7d7168",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                ← {txt.back}
              </button>
              <button onClick={handleCreate} disabled={!name.trim()}
                style={{flex:2,padding:"12px 0",borderRadius:10,border:"none",
                  background:name.trim()?"#d97706":"#e8e4df",
                  color:name.trim()?"#fff":"#c5bdb4",fontSize:14,fontWeight:800,
                  cursor:name.trim()?"pointer":"default",transition:"all .15s"}}>
                {txt.start} →
              </button>
            </div>
          </>
        )}

        <p style={{marginTop:28,fontSize:11,color:"#c5bdb4",lineHeight:1.6}}>
          My Todo Planner v{APP_VERSION}<br/>
          Data stored locally · No account required
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// N-POSTPONED: POSTPONED/DELAYED INLINE POPUP — set original + new due date
// ─────────────────────────────────────────────────────────────────────────────
function PostponedPopup({ currentDue, originalDue, onConfirm, onCancel, isWork=false }) {
  const [origDate, setOrigDate] = useState(originalDue || currentDue || "");
  const [newDate,  setNewDate]  = useState(currentDue || "");

  const calcDelay = () => {
    if (!origDate || !newDate) return null;
    const orig = new Date(origDate);
    const next = new Date(newDate);
    const diff = Math.round((next - orig) / 86400000);
    if (diff <= 0) return null;
    const months = Math.floor(diff / 30);
    const days   = diff % 30;
    if (months > 0 && days > 0) return `+${months}m ${days}d`;
    if (months > 0)              return `+${months} month${months>1?"s":""}`;
    return `+${days} day${days>1?"s":""}`;
  };

  const delay = calcDelay();
  const inp = {width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",
    background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl = {display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",
    letterSpacing:"0.07em",marginBottom:5};

  return (
    <div style={{background:"var(--c-card2)",border:`1.5px solid ${isWork?"#ef4444":"#f59e0b"}`,
      borderRadius:12,padding:"16px",marginTop:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:18}}>{isWork?"🔴":"🔶"}</span>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)"}}>
            {isWork?"Mark as Delayed":"Mark as Postponed"}
          </div>
          <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:1}}>
            Set original and new due dates to track delay duration
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={lbl}>ORIGINAL DUE DATE</label>
          <DateInput style={{...inp,borderColor:origDate?"#6366f1":"var(--c-border)"}}
            value={origDate} onChange={setOrigDate}/>
          <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>First planned date</div>
        </div>
        <div>
          <label style={lbl}>NEW DUE DATE</label>
          <DateInput style={{...inp,borderColor:newDate?"#f59e0b":"var(--c-border)"}}
            value={newDate} onChange={setNewDate}/>
          <div style={{fontSize:9,color:"var(--c-text-muted)",marginTop:3}}>Rescheduled to</div>
        </div>
      </div>
      {delay&&(
        <div style={{background:isWork?"#ef444411":"#f59e0b11",border:`1px solid ${isWork?"#ef444433":"#f59e0b33"}`,
          borderRadius:8,padding:"6px 12px",marginBottom:10,
          fontSize:12,fontWeight:800,color:isWork?"#ef4444":"#f59e0b"}}>
          {isWork?"🔴":"🔶"} Delayed by {delay} from original date
        </div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onCancel}
          style={{padding:"6px 16px",borderRadius:7,border:"1px solid var(--c-border)",
            background:"transparent",color:"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          Cancel
        </button>
        <button onClick={()=>onConfirm({originalDue:origDate, newDue:newDate, delayLabel:delay})}
          disabled={!origDate||!newDate}
          style={{padding:"6px 18px",borderRadius:7,border:"none",fontSize:12,fontWeight:800,
            cursor:origDate&&newDate?"pointer":"default",
            background:origDate&&newDate?(isWork?"#ef4444":"#f59e0b"):"var(--c-border)",
            color:origDate&&newDate?"#fff":"var(--c-text-muted)"}}>
          Confirm {delay||""}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// N-REC: RECURRING DONE MODAL — confirm next occurrence before saving
// ─────────────────────────────────────────────────────────────────────────────
function RecurringDoneModal({ task, onConfirmAndSave, onMarkDoneOnly, onCancel }) {
  // N18: Calculate suggested next due AND start date. If task has both start+due,
  // shift both by the recurrence interval (preserving the gap between them).
  // If only one exists, default both to the same computed date.
  const shiftByRecur = (baseDate, recur) => {
    const r = (recur||"").toLowerCase();
    const d = new Date(baseDate);
    const genericMatch = r.match(/every\s+(\d+)\s*(day|week|month|year)/);
    if (genericMatch) {
      const n = parseInt(genericMatch[1],10), unit = genericMatch[2];
      if (unit==="day") d.setDate(d.getDate()+n);
      else if (unit==="week") d.setDate(d.getDate()+n*7);
      else if (unit==="month") d.setMonth(d.getMonth()+n);
      else if (unit==="year") d.setFullYear(d.getFullYear()+n);
      return d;
    }
    if (r.includes("daily") || r.includes("day"))        d.setDate(d.getDate()+1);
    else if (r.includes("2 week") || r.includes("fortnight")) d.setDate(d.getDate()+14);
    else if (r.includes("week"))                          d.setDate(d.getDate()+7);
    else if (r.includes("quarter"))                       d.setMonth(d.getMonth()+3);
    else if (r.includes("6 month") || r.includes("half")) d.setMonth(d.getMonth()+6);
    else if (r.includes("month")) {
      const m = parseInt(r.match(/(\d+)\s*month/)?.[1]||"1");
      d.setMonth(d.getMonth()+m);
    }
    else if (r.includes("3 year"))                        d.setFullYear(d.getFullYear()+3);
    else if (r.includes("annual") || r.includes("year") || r.includes("yearly")) d.setFullYear(d.getFullYear()+1);
    else d.setMonth(d.getMonth()+1); // default: 1 month
    return d;
  };

  // Parse "YYYY-MM-DD" as LOCAL noon to avoid UTC-midnight day-shift (timezone bug)
  const parseLocal = (s) => {
    if (!s) return new Date();
    const [y,m,d] = s.slice(0,10).split("-").map(Number);
    return new Date(y, (m||1)-1, d||1, 12, 0, 0);
  };

  const calcNext = (t) => {
    const hasStart = !!t.startDate, hasDue = !!t.due;
    if (!hasStart && !hasDue) return { nextDue:"", nextStart:"" };
    if (hasStart && hasDue) {
      // shift both independently by recurrence, preserving the original gap
      const newDue = fmtLocal(shiftByRecur(parseLocal(t.due), t.recur));
      const newStart = fmtLocal(shiftByRecur(parseLocal(t.startDate), t.recur));
      return { nextDue:newDue, nextStart:newStart };
    }
    // Only one exists → compute it, default the other to match (N18 rule)
    const base = hasDue ? t.due : t.startDate;
    const computed = fmtLocal(shiftByRecur(parseLocal(base), t.recur));
    return { nextDue:computed, nextStart:computed };
  };

  const initial = calcNext(task);
  const [nextDue, setNextDue] = useState(initial.nextDue);
  const [nextStart, setNextStart] = useState(initial.nextStart);
  const [nextTitle, setNextTitle] = useState(task.title);

  const inp = {width:"100%",padding:"9px 12px",borderRadius:9,border:"1.5px solid var(--c-border)",
    background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl = {display:"block",fontSize:10,fontWeight:800,color:"var(--c-text-muted)",
    letterSpacing:"0.07em",marginBottom:5};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.80)",zIndex:6500,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,
        padding:24,width:"100%",maxWidth:420,boxShadow:"0 25px 60px rgba(0,0,0,.8)"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <span style={{fontSize:24}}>🔁</span>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"var(--c-text)"}}>Recurring Task Completed</div>
            <div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:2}}>Set up the next occurrence below</div>
          </div>
        </div>

        {/* Completed task info */}
        <div style={{background:"#22c55e11",border:"1px solid #22c55e33",borderRadius:9,
          padding:"10px 14px",marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:800,color:"#22c55e",letterSpacing:"0.07em",marginBottom:3}}>✅ MARKING DONE</div>
          <div style={{fontSize:13,color:"var(--c-text)",fontWeight:600}}>{task.title}</div>
          {task.due&&<div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:2}}>Due: {task.due} · Recurs: {task.recur||"custom"}</div>}
        </div>

        {/* Next occurrence editor */}
        <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:9,
          padding:"12px 14px",marginBottom:20,display:"grid",gap:10}}>
          <div style={{fontSize:10,fontWeight:800,color:"var(--c-accent)",letterSpacing:"0.07em",marginBottom:2}}>🔄 NEXT OCCURRENCE</div>
          <div>
            <label style={lbl}>TASK TITLE</label>
            <input style={inp} value={nextTitle} onChange={e=>setNextTitle(e.target.value)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={lbl}>NEXT START DATE</label>
              <DateInput style={inp} value={nextStart} onChange={setNextStart}/>
            </div>
            <div>
              <label style={lbl}>NEXT DUE DATE</label>
              <DateInput style={inp} value={nextDue} onChange={setNextDue}/>
            </div>
          </div>
          {nextDue&&<div style={{fontSize:10,color:"var(--c-text-muted)"}}>
            {Math.round((new Date(nextDue)-new Date())/86400000)} days from today
          </div>}
        </div>

        {/* 3 buttons */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>onConfirmAndSave({nextDue, nextStart, nextTitle})}
            disabled={!nextTitle.trim()}
            style={{padding:"12px 0",borderRadius:10,border:"none",
              background:nextTitle.trim()?"var(--c-accent)":"var(--c-border)",
              color:nextTitle.trim()?"#fff":"var(--c-text-muted)",
              fontSize:14,fontWeight:800,cursor:nextTitle.trim()?"pointer":"default",
              transition:"all .15s"}}>
            ✅ Confirm &amp; Save — Create Next Task
          </button>
          <button onClick={onMarkDoneOnly}
            style={{padding:"10px 0",borderRadius:10,border:"1.5px solid var(--c-border)",
              background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            ⏭ Mark Done Only — No Next Task
          </button>
          <button onClick={onCancel}
            style={{padding:"10px 0",borderRadius:10,border:"1.5px solid var(--c-border)",
              background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            ✕ Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD SYNC MODAL — Google Drive / OneDrive instructions + file picker
// ─────────────────────────────────────────────────────────────────────────────
// ─── Floating Sync Panel — always-on-top, draggable, minimizable ─────────────
// Shows both sides of the sync pair (Google Drive + local), lets the user manage
// everything from one place: link/relink/rename files, open the Drive location,
// toggle auto-sync, push/pull now, and watch live status.
function SyncPanel({
  gsync, gsyncStatus, gsyncError, gsyncSignedIn, gsyncAuto,
  onConnect, onDisconnect, onSyncNow, onSetAuto, onOpenFolder,
  onRename, onRelink, onUnlink, listFiles, onClose, minimized, onToggleMin,
}) {
  const [pos, setPos] = React.useState(()=>({ x: Math.max(12, window.innerWidth - 372), y: 76 }));
  const [busy, setBusy] = React.useState(false);
  const [files, setFiles] = React.useState(null);
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const linked = !!gsync?.fileId;

  const startMove = (e) => {
    if (e.target.closest("button,input")) return;
    e.preventDefault();
    const sx = (e.touches?e.touches[0].clientX:e.clientX) - pos.x;
    const sy = (e.touches?e.touches[0].clientY:e.clientY) - pos.y;
    const move = (ev) => {
      const cx = ev.touches?ev.touches[0].clientX:ev.clientX;
      const cy = ev.touches?ev.touches[0].clientY:ev.clientY;
      setPos({ x: Math.min(Math.max(4, cx-sx), window.innerWidth-60), y: Math.min(Math.max(4, cy-sy), window.innerHeight-40) });
    };
    const up = () => {
      document.removeEventListener("mousemove",move); document.removeEventListener("mouseup",up);
      document.removeEventListener("touchmove",move); document.removeEventListener("touchend",up);
    };
    document.addEventListener("mousemove",move); document.addEventListener("mouseup",up);
    document.addEventListener("touchmove",move,{passive:false}); document.addEventListener("touchend",up);
  };

  const relTime = (ms) => {
    if(!ms) return "never";
    const s=Math.floor((Date.now()-ms)/1000);
    if(s<60) return "just now"; if(s<3600) return `${Math.floor(s/60)} min ago`;
    if(s<86400) return `${Math.floor(s/3600)} hr ago`; return new Date(ms).toLocaleDateString();
  };

  // N95: "Synced" requires being signed in AND linked — a leftover fileId from a
  // past session must not read as connected.
  const online = gsyncSignedIn;
  const dotColor = gsyncStatus==="syncing"?"#f59e0b":gsyncStatus==="error"?"#ef4444":(online&&linked)?"#22c55e":"#94a3b8";
  const statusLine = gsyncStatus==="syncing"?"Syncing…":gsyncStatus==="error"?(gsyncError||"Error")
                    : (online&&linked)?`Synced · ${relTime(gsync.lastSyncAt)}`
                    : linked?"Linked — not connected":"Not connected";

  const doConnect = async()=>{ setBusy(true); await onConnect(); setBusy(false); };
  const loadList  = async()=>{ setBusy(true); try{ setFiles(await listFiles()); }catch{} setBusy(false); };
  const pick      = async(f)=>{ await onRelink(f.id,f.name); setFiles(null); };
  const createNew = async()=>{ setBusy(true); await onPushNow(); setBusy(false); };
  const openDrive = ()=>{ onOpenFolder && onOpenFolder(); };
  const saveName  = async()=>{ await onRename(nameDraft); setRenaming(false); };

  const box = { background:"var(--c-surface2)", border:"1px solid var(--c-border)", borderRadius:9, padding:"9px 11px", marginBottom:9 };
  const smallBtn = (bg,fg,bd)=>({ padding:"6px 10px", borderRadius:7, border:bd||"none", background:bg, color:fg, fontSize:11, fontWeight:700, cursor:"pointer" });
  const label = { fontSize:9.5, fontWeight:800, letterSpacing:".04em", color:"var(--c-text-muted)", textTransform:"uppercase", marginBottom:3 };

  // minimized pill
  if (minimized) {
    return (
      <div onMouseDown={startMove} onTouchStart={startMove}
        style={{position:"fixed",left:pos.x,top:pos.y,zIndex:9700,display:"flex",alignItems:"center",gap:8,
          padding:"8px 12px",borderRadius:22,background:"var(--c-card2)",border:"1px solid var(--c-border)",
          boxShadow:"0 8px 28px rgba(0,0,0,.28)",cursor:"move",userSelect:"none"}}>
        <span style={{width:9,height:9,borderRadius:"50%",background:dotColor,
          animation:gsyncStatus==="syncing"?"pulse 1s infinite":"none"}}/>
        <span style={{fontSize:12,fontWeight:800,color:"var(--c-text)"}}>☁️ Sync</span>
        <button onClick={onToggleMin} style={smallBtn("var(--c-surface)","var(--c-text)","1px solid var(--c-border)")}>▢</button>
        <button onClick={onClose} style={smallBtn("transparent","var(--c-text-muted)","none")}>✕</button>
      </div>
    );
  }

  return (
    <div style={{position:"fixed",left:pos.x,top:pos.y,zIndex:9700,width:352,maxWidth:"94vw",
      background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:14,
      boxShadow:"0 18px 50px rgba(0,0,0,.34)",overflow:"hidden"}}>
      {/* draggable header */}
      <div onMouseDown={startMove} onTouchStart={startMove}
        style={{display:"flex",alignItems:"center",gap:8,padding:"11px 13px",cursor:"move",userSelect:"none",
          background:"var(--c-surface)",borderBottom:"1px solid var(--c-border)"}}>
        <span style={{width:10,height:10,borderRadius:"50%",background:dotColor,flexShrink:0,
          animation:gsyncStatus==="syncing"?"pulse 1s infinite":"none"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)"}}>☁️ Sync Manager</div>
          <div style={{fontSize:10,color:"var(--c-text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{statusLine}</div>
        </div>
        <button onClick={onToggleMin} title="Minimize" style={smallBtn("var(--c-surface2)","var(--c-text)","1px solid var(--c-border)")}>—</button>
        <button onClick={onClose} title="Close" style={smallBtn("transparent","var(--c-text-muted)","none")}>✕</button>
      </div>

      <div style={{padding:"12px 13px",maxHeight:"70vh",overflowY:"auto"}}>
        {!gsyncSignedIn ? (
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <p style={{fontSize:12,color:"var(--c-text-muted)",marginBottom:12,lineHeight:1.6}}>
              Connect Google Drive to sync this dashboard across devices.
            </p>
            <button onClick={doConnect} disabled={busy}
              style={{width:"100%",padding:"11px 0",borderRadius:9,border:"none",background:"#1a73e8",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",opacity:busy?.6:1}}>
              {busy?"Connecting…":"🔗 Connect Google Drive"}
            </button>
          </div>
        ) : (
          <>
            {/* GOOGLE DRIVE SIDE */}
            <div style={box}>
              <div style={label}>☁️ Google Drive</div>
              {linked ? (
                <>
                  {renaming ? (
                    <div style={{display:"flex",gap:6,marginBottom:6}}>
                      <input value={nameDraft} autoFocus onChange={e=>setNameDraft(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter")saveName();if(e.key==="Escape")setRenaming(false);}}
                        style={{flex:1,padding:"6px 8px",borderRadius:6,border:"1px solid var(--c-border)",background:"var(--c-input)",color:"var(--c-text)",fontSize:12,fontFamily:"monospace"}}/>
                      <button onClick={saveName} style={smallBtn("#166534","#fff")}>✓</button>
                    </div>
                  ) : (
                    <div style={{fontSize:12.5,fontWeight:700,color:"var(--c-text)",wordBreak:"break-all",marginBottom:7}}>📄 {gsync.fileName||"—"}</div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={openDrive} style={smallBtn("var(--c-surface)","var(--c-text)","1px solid var(--c-border)")}>📁 Open folder</button>
                    {!renaming && <button onClick={()=>{setNameDraft(gsync.fileName||"");setRenaming(true);}} style={smallBtn("var(--c-surface)","var(--c-text)","1px solid var(--c-border)")}>✏️ Rename</button>}
                    <button onClick={loadList} style={smallBtn("var(--c-surface)","var(--c-text)","1px solid var(--c-border)")}>🔄 Change file</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{fontSize:11,color:"var(--c-text-muted)",marginBottom:8}}>This profile has no sync file yet. Create one or link an existing file — each profile syncs to its own file.</p>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={createNew} disabled={busy} style={smallBtn("#166534","#fff")}>✨ Create new file</button>
                    <button onClick={loadList} style={smallBtn("var(--c-surface)","var(--c-text)","1px solid var(--c-border)")}>📂 Link existing</button>
                  </div>
                </>
              )}
              {files && (
                <div style={{marginTop:8,border:"1px solid var(--c-border)",borderRadius:7,overflow:"hidden",maxHeight:150,overflowY:"auto"}}>
                  {files.length===0 && <div style={{padding:9,fontSize:11,color:"var(--c-text-muted)",textAlign:"center"}}>No .json files on Drive.</div>}
                  {files.map(f=>(
                    <button key={f.id} onClick={()=>pick(f)}
                      style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",borderBottom:"1px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:11,cursor:"pointer"}}>
                      📄 {f.name}<span style={{display:"block",fontSize:9,color:"var(--c-text-muted)"}}>{new Date(f.modifiedTime).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* LOCAL SIDE */}
            <div style={box}>
              <div style={label}>💻 This device (local)</div>
              <div style={{fontSize:12.5,fontWeight:700,color:"var(--c-text)",wordBreak:"break-all"}}>📄 {gsync.localName||gsync.fileName||"My-Todo-Planner.json"}</div>
              <div style={{fontSize:10,color:"var(--c-text-muted)",marginTop:4,lineHeight:1.5}}>
                Data lives in this browser. The name mirrors the Drive file. (Browsers can't open a local folder path for security reasons.)
              </div>
            </div>

            {/* SYNC CONTROLS */}
            {linked && (
              <>
                <button onClick={async()=>{setBusy(true);await onSyncNow();setBusy(false);}} disabled={busy||gsyncStatus==="syncing"}
                  style={{width:"100%",marginBottom:9,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                    ...smallBtn("#166534","#fff"),padding:"10px 0",fontSize:12.5,opacity:(busy||gsyncStatus==="syncing")?.75:1}}>
                  <span style={{display:"inline-block",fontSize:15,
                    animation:(busy||gsyncStatus==="syncing")?"spin 0.9s linear infinite":"none"}}>🔄</span>
                  {(busy||gsyncStatus==="syncing")?"Syncing…":"Save to Cloud"}
                </button>
                {/* auto toggle */}
                <div style={{...box,display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:800,color:"var(--c-text)"}}>Auto-sync</div>
                    <div style={{fontSize:10,color:"var(--c-text-muted)"}}>{gsyncAuto?"Saves to Cloud ~15s after each edit":"Manual only"}</div>
                  </div>
                  <button onClick={()=>onSetAuto(!gsyncAuto)}
                    style={{width:44,height:25,borderRadius:14,border:"none",cursor:"pointer",position:"relative",
                      background:gsyncAuto?"#22c55e":"var(--c-border)",transition:"background .2s"}}>
                    <span style={{position:"absolute",top:3,left:gsyncAuto?22:3,width:19,height:19,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                  </button>
                </div>
                <button onClick={onUnlink} style={{width:"100%",...smallBtn("transparent","var(--c-text-muted)","1px solid var(--c-border)"),padding:"8px 0"}}>Unlink file</button>
              </>
            )}
            <button onClick={onDisconnect} style={{width:"100%",...smallBtn("transparent","#ef4444","1px solid var(--c-border)"),padding:"8px 0",marginTop:8}}>Disconnect Google account</button>
          </>
        )}
        {gsyncError && <div style={{marginTop:9,fontSize:10.5,color:"#fca5a5",background:"#7f1d1d22",border:"1px solid #7f1d1d55",borderRadius:7,padding:"7px 9px"}}>⚠️ {gsyncError}</div>}
      </div>
    </div>
  );
}

function CloudSyncModal({ onClose, openFileRef, gsync, gsyncStatus, gsyncError, gsyncSignedIn,
                          onConnect, onDisconnect, onPushNow, onPullNow, onLinkFile, listFiles }) {
  const [busy, setBusy] = React.useState(false);
  const [files, setFiles] = React.useState(null); // null = not loaded, [] = loaded empty
  const linked = !!gsync?.fileId;
  const lastSync = gsync?.lastSyncAt ? new Date(gsync.lastSyncAt) : null;

  const relTime = (d) => {
    if(!d) return "never";
    const s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<60) return "just now";
    if(s<3600) return `${Math.floor(s/60)} min ago`;
    if(s<86400) return `${Math.floor(s/3600)} hr ago`;
    return d.toLocaleDateString();
  };

  const doConnect = async () => { setBusy(true); await onConnect(); setBusy(false); };
  const doPickFile = async () => {
    setBusy(true);
    try { const list = await listFiles(); setFiles(list); }
    catch(e){ /* surfaced via status */ }
    setBusy(false);
  };
  const chooseFile = async (f) => { await onLinkFile(f.id, f.name); setFiles(null); };
  const startFresh = async () => { setBusy(true); await onPushNow(); setBusy(false); };

  const statusColor = gsyncStatus==="syncing"?"#f59e0b":gsyncStatus==="error"?"#ef4444":linked?"#22c55e":"var(--c-text-muted)";
  const statusText = gsyncStatus==="syncing"?"Syncing…":gsyncStatus==="error"?(gsyncError||"Sync error")
                    : linked?`Synced · last ${relTime(lastSync)}`:"Not linked yet";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:5500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{padding:"18px 20px",borderBottom:"1px solid var(--c-border)",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>☁️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:"var(--c-text)"}}>Google Drive Sync</div>
            <div style={{fontSize:11,color:"var(--c-text-muted)"}}>Keep one data file in sync across all your devices</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--c-text-muted)",cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        <div style={{padding:"16px 20px"}}>
          {/* Live status */}
          <div style={{display:"flex",alignItems:"center",gap:9,padding:"11px 14px",borderRadius:10,
            background:"var(--c-surface2)",border:"1px solid var(--c-border)",marginBottom:16}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:statusColor,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12.5,fontWeight:800,color:"var(--c-text)"}}>{statusText}</div>
              {linked && <div style={{fontSize:10.5,color:"var(--c-text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {gsync.fileName}</div>}
            </div>
          </div>

          {gsyncError && (
            <div style={{fontSize:11.5,color:"#fca5a5",background:"#7f1d1d22",border:"1px solid #7f1d1d55",borderRadius:8,padding:"8px 11px",marginBottom:14}}>
              ⚠️ {gsyncError}
            </div>
          )}

          {!gsyncSignedIn ? (
            <>
              <p style={{fontSize:13,color:"var(--c-text-muted)",lineHeight:1.6,marginBottom:14}}>
                Connect your Google account to sync this dashboard's data. Access is limited to files this app creates or you pick — never your whole Drive.
              </p>
              <button onClick={doConnect} disabled={busy}
                style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:"#1a73e8",color:"#fff",
                  fontSize:14,fontWeight:800,cursor:busy?"default":"pointer",opacity:busy?0.6:1}}>
                {busy?"Connecting…":"🔗 Connect Google Drive"}
              </button>
            </>
          ) : !linked ? (
            <>
              <p style={{fontSize:13,color:"var(--c-text-muted)",lineHeight:1.6,marginBottom:12}}>
                Connected ✓ Now choose where your data lives on Drive:
              </p>
              <button onClick={startFresh} disabled={busy}
                style={{width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:"#166534",color:"#fff",
                  fontSize:13.5,fontWeight:800,cursor:"pointer",marginBottom:9,opacity:busy?0.6:1}}>
                ✨ Create a new sync file (recommended)
              </button>
              <button onClick={doPickFile} disabled={busy}
                style={{width:"100%",padding:"11px 0",borderRadius:10,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",
                  color:"var(--c-text)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                📂 Link an existing file
              </button>
              {files && (
                <div style={{marginTop:12,border:"1px solid var(--c-border)",borderRadius:9,overflow:"hidden"}}>
                  {files.length===0 && <div style={{padding:"12px",fontSize:12,color:"var(--c-text-muted)",textAlign:"center"}}>No .json files found on Drive yet.</div>}
                  {files.map(f=>(
                    <button key={f.id} onClick={()=>chooseFile(f)}
                      style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",borderBottom:"1px solid var(--c-border)",
                        background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,cursor:"pointer"}}>
                      📄 {f.name}
                      <span style={{display:"block",fontSize:9.5,color:"var(--c-text-muted)"}}>{new Date(f.modifiedTime).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <button onClick={async()=>{setBusy(true);await onPushNow();setBusy(false);}} disabled={busy||gsyncStatus==="syncing"}
                  style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"#166534",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",opacity:(busy||gsyncStatus==="syncing")?0.6:1}}>
                  ⬆️ Save to cloud now
                </button>
                <button onClick={async()=>{setBusy(true);await onPullNow();setBusy(false);}} disabled={busy||gsyncStatus==="syncing"}
                  style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:13,fontWeight:800,cursor:"pointer",opacity:(busy||gsyncStatus==="syncing")?0.6:1}}>
                  ⬇️ Load from cloud
                </button>
              </div>
              <div style={{fontSize:11,color:"var(--c-text-muted)",lineHeight:1.6,marginBottom:14,padding:"9px 12px",background:"var(--c-surface2)",borderRadius:8}}>
                ℹ️ Changes auto-save to Drive ~15 seconds after you edit. Use these buttons to sync immediately.
              </div>
              <button onClick={onDisconnect}
                style={{width:"100%",padding:"9px 0",borderRadius:9,border:"1px solid var(--c-border)",background:"transparent",
                  color:"var(--c-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Disconnect Google Drive
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function NoDueDateTab({ personal, work, setPersonal, setWork }) {
  const [lightbox, setLightbox] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [filter, setFilter] = useState("All"); // "All" | "personal" | "work"
  const [sortBy, setSortBy] = useState("priority");

  const allNoDate = useMemo(()=>{
    const p = personal.filter(t=>!t.due&&t.status!=="done").map(t=>({...t,_type:"personal"}));
    const w = work.filter(t=>!t.due&&t.status!=="done"&&t.status!=="done").map(t=>({...t,_type:"work"}));
    let list = filter==="personal"?p:filter==="work"?w:[...p,...w];
    list.sort((a,b)=>{
      if(sortBy==="priority"){const o={High:0,Medium:1,Low:2};return(o[a.priority??'Medium']??1)-(o[b.priority??'Medium']??1);}
      if(sortBy==="cat") return (a.cat||"").localeCompare(b.cat||"");
      return (a.title||"").localeCompare(b.title||"");
    });
    return list;
  },[personal,work,filter,sortBy]);

  const saveWork = async (next) => { setWork(next); try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{} };
  const savePersonal = async (next) => { setPersonal(next); try{await window.storage.set(pkG(P_KEY),JSON.stringify(next));}catch{}; };

  const handleSave = async (updated) => {
    if(updated._type==="work") saveWork(applyEditWithRecur(work, updated, "todo"));
    else savePersonal(applyEditWithRecur(personal, updated, "pending"));
    setEditModal(null);
  };

  const inp = {padding:"7px 12px",borderRadius:8,border:"1.5px solid var(--c-border)",background:"var(--c-surface)",color:"var(--c-text)",fontSize:12,outline:"none"};

  return (
    <div>
      {lightbox&&<MediaLightbox item={lightbox} onClose={()=>setLightbox(null)}/>}
      {editModal&&<TaskDetailModal task={editModal} onSave={handleSave} onClose={()=>setEditModal(null)}
        onDuplicate={t=>{
          const copy = duplicateTask(t);
          if (copy._type==="work") saveWork([...work,copy]);
          else savePersonal([...personal,copy]);
        }}/>}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,var(--c-surface),var(--c-surface2))",border:"1px solid var(--c-border)",borderRadius:12,padding:"14px 18px",marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:20}}>📋</span>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"var(--c-text)"}}>Tasks Without Due Date</div>
            <div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:2}}>These tasks have no deadline — consider scheduling them</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",background:"#6366f133",padding:"6px 14px",borderRadius:20}}>
            <span style={{fontSize:18,fontWeight:900,color:"#a5b4fc"}}>{allNoDate.length}</span>
            <span style={{fontSize:11,color:"#6366f1",fontWeight:700}}>tasks need dates</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",background:"var(--c-surface2)",borderRadius:8,padding:3,gap:2}}>
          {[["All","🗂 All"],["personal","🏠 Personal"],["work","💼 Work"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{padding:"5px 12px",borderRadius:6,border:"none",background:filter===v?"#6366f1":"transparent",color:filter===v?"#fff":"var(--c-text-muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={inp}>
          <option value="priority">Sort: Priority</option>
          <option value="cat">Sort: Category</option>
          <option value="alpha">Sort: A–Z</option>
        </select>
        <span style={{fontSize:11,color:"var(--c-text-muted)",marginLeft:"auto"}}>{allNoDate.length} tasks</span>
      </div>

      {/* Tip */}
      {allNoDate.length>0&&(
        <div style={{background:"var(--c-surface)",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:11,color:"var(--c-text-muted)",lineHeight:1.6,border:"1px solid var(--c-border)"}}>
          💡 Click <strong style={{color:"var(--c-text)"}}>✏️ Edit</strong> to add a due date — task will move to the appropriate tabs automatically
        </div>
      )}

      {/* No tasks */}
      {allNoDate.length===0&&(
        <div style={{textAlign:"center",padding:"80px 0"}}>
          <div style={{fontSize:40,marginBottom:12}}>🎉</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--c-text)",marginBottom:6}}>All tasks have due dates!</div>
          <div style={{fontSize:13,color:"var(--c-text-muted)"}}>Great organisation — keep it up.</div>
        </div>
      )}

      {/* Task list */}
      <div style={{display:"grid",gap:8}}>
        {allNoDate.map(t=>{
          const isWork=t._type==="work";
          const cc=isWork?(WORK_CAT_COLOR[t.cat]||"#94a3b8"):groupColor(t.cat);
          const pc=PRIORITY_CFG[t.priority||"Medium"];
          const mediaAttach=(t.attachments||[]).filter(a=>{const k=detectAttachType(a);return k==="image"||k==="video"||k==="video-link";});
          return (
            <div key={`${t._type}-${t.id}`} style={{background:"var(--c-surface)",border:`1px solid var(--c-border)`,borderLeft:`3px solid ${cc}`,borderRadius:10,overflow:"hidden"}}>
              {mediaAttach.length>0&&<MediaCardStrip attachments={t.attachments} onLightbox={setLightbox}/>}
              <div style={{padding:"11px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,flexWrap:"wrap"}}>
                    <Chip color={cc}>{t.cat}</Chip>
                    <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:20,background:pc.bg,color:pc.color}}>{t.priority||"Medium"}</span>
                    <Chip color={isWork?"#818cf8":"#34d399"} small>{isWork?"💼 Work":"🏠 Personal"}</Chip>
                    {isWork&&t.project&&<Chip color="#818cf8" small>📁 {t.project}</Chip>}
                    <span style={{fontSize:9,fontWeight:800,color:"#ef4444",background:"#ef444422",padding:"2px 7px",borderRadius:20}}>❌ No Date</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--c-text)",lineHeight:1.4}}>{t.title}</div>
                  {t.description&&<div style={{fontSize:11,color:"var(--c-text-muted)",marginTop:3,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{renderMentions(t.description)}</div>}
                  {t.location&&<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:5,color:"#60a5fa",fontSize:10,textDecoration:"none",fontWeight:600}}>📍 {t.location}</a>}
                </div>
                <button onClick={()=>setEditModal(t)} style={{background:"#1e40af22",border:"1px solid #1e40af55",borderRadius:6,padding:"6px 10px",color:"#60a5fa",cursor:"pointer",fontSize:12,flexShrink:0,fontWeight:700,whiteSpace:"nowrap"}}>✏️ Add Date</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
// Error boundary — shows the actual error on screen instead of a blank page,
// so a runtime problem is diagnosable rather than silent.
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={ error:null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ /* swallow: shown in UI below */ }
  render(){
    if(this.state.error){
      return (
        <div style={{padding:24,maxWidth:720,margin:"40px auto",fontFamily:"system-ui,sans-serif"}}>
          <h2 style={{color:"#dc2626",marginBottom:12}}>⚠️ Something went wrong</h2>
          <p style={{color:"#555",marginBottom:14,fontSize:14}}>The app hit an error while loading. Details below — this usually means a data or display bug, not lost data.</p>
          <pre style={{background:"#1a1714",color:"#fca5a5",padding:14,borderRadius:8,fontSize:12,overflow:"auto",whiteSpace:"pre-wrap"}}>{String(this.state.error?.message||this.state.error)}
{this.state.error?.stack?.split("\n").slice(0,6).join("\n")}</pre>
          <button onClick={()=>{ this.setState({error:null}); location.reload(); }}
            style={{marginTop:14,padding:"9px 18px",borderRadius:8,border:"none",background:"#166534",color:"#fff",fontWeight:700,cursor:"pointer"}}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tab, setTab]               = useState("milestones"); // N59: Timeline is the landing page
  const [personal, setPersonal]     = useState([]);
  const [events, setEvents]         = useState([]); // N24: Event items
  const [eventTypes, setEventTypes] = useState(DEFAULT_EVENT_TYPES); // N35: named event types w/ colors
  const [calViews, setCalViews]     = useState([]); // N35: saved custom calendar view filters
  const [notes, setNotes]           = useState([]); // N26: Notion-style notes
  const [work, setWork]             = useState([]);
  const [loaded, setLoaded]         = useState(false);
  // Q6: notification badge read-tracking — {tabId: countAtLastRead}. Persisted per profile.
  const [tabReads, setTabReads]     = useState({});
  // N9: custom tab order (array of tab ids). Persisted. Empty = default order.
  const [tabOrder, setTabOrder]     = useState([]);
  const [dragTab, setDragTab]       = useState(null);
  const [showDataModal, setShowDataModal] = useState(false);
  const [showSearch, setShowSearch]  = useState(false);
  const [showFAB, setShowFAB]        = useState(false);     // Phase2: FAB Quick Add chooser
  const [zenMode, setZenMode]        = useState(false);     // N35 item1: hide header+tabs (presentation mode)
  // N52: which of the three data slots currently hold loaded file data.
  // A slot that is false must NEVER be written back to disk.
  const [slots, setSlots] = useState({ work:false, personal:false, core:false });
  const [slotFiles, setSlotFiles] = useState({ work:"", personal:"", core:"" });
  const [showSplit, setShowSplit] = useState(false);
  const [splitMsg, setSplitMsg]   = useState("");
  const splitInputRef = useRef(null);
  const splitKindRef  = useRef(null);
  const [quickAddText, setQuickAddText] = useState("");     // B3: natural-language quick add
  const [floatNoteId, setFloatNoteId] = useState(null);   // N32: id of the open floating note (null=closed)
  const [floatPin, setFloatPin]      = useState(true);      // N30: keep panel on top within app
  const [mentionTarget, setMentionTarget] = useState(null); // N33: pending navigation target from a clicked @mention
  const [fabType, setFabType]        = useState(null);      // "personal" | "work"
  const [toast, setToast]            = useState(null);      // Phase2: toast {msg, type}
  const toastTimer = useRef(null);

  // Phase2: show toast for 2.5s then auto-dismiss
  const showToast = (msg, type="success") => {
    setToast({msg, type});
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast(null), 2500);
  };
  // N65: expose the toast so deep components (SavedViewBar) can confirm a save
  useEffect(()=>{ window.__toast = (m,t)=>showToast(m,t); return ()=>{ delete window.__toast; }; });
  // N74: task modals live far from App; give them a tiny bridge instead of six props
  useEffect(()=>{
    window.__groupColors = {
      get: (n)=>groupColors[n] || null,
      set: (n,c)=>setGroupColor(n,c),
      countFor: (n)=>personal.filter(t=>t.cat===n).length + work.filter(t=>t.project===n).length,
    };
    return ()=>{ delete window.__groupColors; };
  });
  const [showNotifs, setShowNotifs]  = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [showCloudSync, setShowCloudSync] = useState(false);
  // ── Google Drive sync state ────────────────────────────────────────────────
  const [gsync, setGsync] = useState({ fileId:null, fileName:"", localName:"", lastSyncAt:0, lastCloudModified:"" });
  const gsyncProfRef = useRef(null); // set once activeProfileId exists (below)
  const gsyncAutoRef = useRef(false); // N93: guards one silent auto-signin per mount
  const [gsyncSignedIn, setGsyncSignedIn] = useState(false);
  const [gsyncStatus, setGsyncStatus] = useState("idle"); // idle | syncing | synced | error | offline
  const [gsyncError, setGsyncError] = useState("");
  const [gsyncConflict, setGsyncConflict] = useState(null); // {cloudText, cloudModified}
  const [importConflict, setImportConflict] = useState(null); // N107: {parsed, fileName, handle, cloud:{payload,modifiedTime}}
  const [gsyncAuto, setGsyncAuto] = useState(true);      // auto-push on edits
  const [gsyncPanel, setGsyncPanel] = useState(false);   // floating panel open
  const [gsyncPanelMin, setGsyncPanelMin] = useState(false); // minimized
  const gsyncTimer = useRef(null);
  const gsyncBusy = useRef(false);
  const [fontSize, setFontSize]     = useState(14);
  const [customTabs, setCustomTabs] = useState([]);
  const [projectReg, setProjectReg] = useState([]); // N60: remembered work project names
  // N90: these were mistakenly spliced into NoDueDateTab, so App rendered <WorkTab
  //      setTasks={saveWork} …> with saveWork undefined → the Work tab threw and
  //      showed a blank screen. They belong to App, next to the work/personal state.
  const saveWork = async (next) => {
    setWork(next);
    try{await window.storage.set(pkG(W_KEY),JSON.stringify(next));}catch{}
    try{
      const names = [...new Set(next.map(t=>(t.project||"").trim()).filter(Boolean))];
      const merged = [...new Set([...projectReg, ...names])].sort();
      if (merged.length !== projectReg.length) {
        setProjectReg(merged);
        await window.storage.set(pkG(PROJECTS_KEY), JSON.stringify(merged));
      }
    }catch{}
  };
  const forgetProject = async (name) => {
    const merged = projectReg.filter(p=>p!==name);
    setProjectReg(merged);
    try{await window.storage.set(pkG(PROJECTS_KEY), JSON.stringify(merged));}catch{}
  };
  const [groupColors, setGroupColors] = useState({}); // N74: category / project colour overrides
  const setGroupColor = async (name, color) => {
    const next = {...groupColors};
    if(color) next[name]=color; else delete next[name];
    setGroupColors(next); setGroupColorCache(next);
    try{ await window.storage.set(pkG(GROUP_COLORS_KEY), JSON.stringify(next)); }catch{}
  };
  const [showAddTab, setShowAddTab] = useState(false);
  const [editingTab, setEditingTab] = useState(null);
  const [activity, setActivity]     = useState([]);
  const [ganttViewsBk, setGanttViewsBk] = useState([]);
  const [tlViewsBk, setTlViewsBk] = useState([]);
  const [undoStack, setUndoStack]   = useState([]);
  const [redoStack, setRedoStack]   = useState([]);
  const [config, setConfig]         = useState({...DEFAULT_CONFIG});
  const [dataLastUpdated, setDataLastUpdated] = useState(null);
  const [lang, setLang]             = useState("EN");
  const [widgetOrder, setWidgetOrder] = useState(DEFAULT_WIDGETS);
  const [showBackupNudge, setShowBackupNudge] = useState(false); // A1: backup reminder banner

  // ── Profile state ──────────────────────────────────────────────────────────
  const [activeProfileId, setActiveProfileId] = useState(getActiveProfileId);
  useEffect(()=>{ if(gsyncProfRef.current===null) gsyncProfRef.current = activeProfileId; }, []); // N-fix: init after activeProfileId exists
  const [profileList, setProfileList] = useState(getProfiles);
  const activeProfile = profileList.find(p=>p.id===activeProfileId) || null;

  // Profile-scoped storage key — every localStorage key is namespaced by profile
  const pk = (key) => activeProfileId ? profKey(activeProfileId, key) : key;

  // ── Handle first-run: create profile from onboarding ──────────────────────
  const handleCreateFirstProfile = ({ name, emoji }) => {
    const id = `profile-${Date.now()}`;
    const newProf = { id, name, emoji, createdAt: new Date().toISOString().slice(0,10) };
    const newList = [...profileList, newProf];
    saveProfiles(newList);
    setProfileList(newList);
    try { localStorage.setItem(ACTIVE_PROF_KEY, id); } catch {}
    setActiveProfileId(id);
  };

  const bp          = useBreakpoint();            // "mobile" | "tablet" | "desktop"
  const isMobile    = bp === "mobile";
  const isTablet    = bp === "tablet";
  // iOS has no real filesystem folder to browse — Google Drive is the natural
  // "Open" target there, so the file menu leads with Drive instead of a picker.
  const isIOSDevice = typeof navigator!=="undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isCompact   = isMobile || isTablet;       // both phone + iPad get touch UI
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const FONT_STEPS = [12,13,14,15,16,17,18,20,22];
  const fontIdx = FONT_STEPS.indexOf(fontSize);
  const canDec = fontIdx>0, canInc = fontIdx<FONT_STEPS.length-1;
  const theme = THEMES[config.themeId]||THEMES.claude;
  const fontFamily = FONT_FAMILIES.find(f=>f.id===config.fontFamily)?.value||FONT_FAMILIES[0].value;
  const t = i18n[lang]||i18n.EN;

  // ── N-ThemeSystem: inject CSS variables from active theme into :root ────────
  // All hardcoded dark colors in components map to these variables.
  // Light themes → light values. Dark themes → their own dark values.
  useEffect(()=>{
    const root = document.documentElement;
    const isLight = ["claude","light","sky","rose","sage"].includes(config.themeId||"claude");
    // Component-level surface colors (used for cards, panels, modals, inputs)
    const cv = isLight ? {
      // Light theme component colors
      "--c-bg":        theme.bg,
      "--c-surface":   theme.surface,
      "--c-surface2":  theme.surface2,
      "--c-border":    theme.border,
      "--c-text":      theme.text,
      "--c-text-muted":theme.textMuted,
      "--c-text-dim":  theme.textMuted+"99",
      "--c-card":      theme.surface,
      "--c-card2":     theme.surface2,
      "--c-input":     theme.surface2,
      "--c-accent":    theme.accent,
      "--c-accent-bg": theme.accentBg||theme.accent+"22",
      "--c-accent-text":theme.accentText,
      "--c-chip":      theme.chip||theme.surface2,
      "--c-chip-text": theme.chipText||theme.textMuted,
      "--c-shadow":    theme.shadow,
      // Row alternating colors (for Gantt, task lists)
      "--c-row-even":  theme.surface,
      "--c-row-odd":   theme.surface2,
      "--c-hover":     theme.accent+"18",
      // Status/semantic
      "--c-danger":    "#dc2626",
      "--c-danger-bg": "#fee2e2",
      "--c-success":   "#16a34a",
      "--c-success-bg":"#dcfce7",
    } : {
      // Dark theme component colors — keep existing dark values
      "--c-bg":        theme.bg,
      "--c-surface":   theme.surface,
      "--c-surface2":  theme.surface2||"var(--c-surface2)",
      "--c-border":    theme.border,
      "--c-text":      theme.text,
      "--c-text-muted":theme.textMuted,
      "--c-text-dim":  theme.textMuted+"99",
      "--c-card":      theme.cardBg||theme.surface,
      "--c-card2":     theme.surface2||"var(--c-card2)",
      "--c-input":     theme.inputBg||theme.surface2||"var(--c-card2)",
      "--c-accent":    theme.accent,
      "--c-accent-bg": theme.accentBg||theme.accent+"22",
      "--c-accent-text":theme.accentText,
      "--c-chip":      theme.chip||theme.border,
      "--c-chip-text": theme.chipText||theme.textMuted,
      "--c-shadow":    theme.shadow,
      "--c-row-even":  theme.surface,
      "--c-row-odd":   theme.surface2||"var(--c-surface2)",
      "--c-hover":     theme.accent+"22",
      "--c-danger":    "#f87171",
      "--c-danger-bg": "#7f1d1d44",
      "--c-success":   "#4ade80",
      "--c-success-bg":"#14532d44",
    };
    Object.entries(cv).forEach(([k,v])=>{ if(v) root.style.setProperty(k,v); });
  },[config.themeId, theme]);

  // ISO week number of today
  const todayWeekNum = useMemo(()=>{
    const tmp=new Date(Date.UTC(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()));
    const day=tmp.getUTCDay()||7; tmp.setUTCDate(tmp.getUTCDate()+4-day);
    const yr=new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    return Math.ceil(((tmp-yr)/86400000+1)/7);
  },[]);

  // ── Load all state from profile-scoped storage ────────────────────────────
  useEffect(()=>{
    setLoaded(false);
    setPersonal([]); setWork([]); setCustomTabs([]); setActivity([]);
    setUndoStack([]); setRedoStack([]); setDataLastUpdated(null);
    setWidgetOrder(DEFAULT_WIDGETS);
    (async()=>{
      try{const pr=await window.storage.get(pk(P_KEY));setPersonal(pr?.value?JSON.parse(pr.value):PERSONAL_TASKS);if(!pr?.value)await window.storage.set(pk(P_KEY),JSON.stringify(PERSONAL_TASKS));}catch{setPersonal(PERSONAL_TASKS);}
      try{const wr=await window.storage.get(pk(W_KEY));setWork(wr?.value?JSON.parse(wr.value):WORK_TASKS_SEED);if(!wr?.value)await window.storage.set(pk(W_KEY),JSON.stringify(WORK_TASKS_SEED));}catch{setWork(WORK_TASKS_SEED);}
      try{const er=await window.storage.get(pk(EVENTS_KEY));setEvents(er?.value?JSON.parse(er.value):[]);}catch{setEvents([]);}
      try{const etr=await window.storage.get(pk(EVENT_TYPES_KEY));if(etr?.value){const p=JSON.parse(etr.value);if(Array.isArray(p)&&p.length)setEventTypes(p);}}catch{}
      try{const cvr=await window.storage.get(pk(CAL_VIEWS_KEY));if(cvr?.value){const p=JSON.parse(cvr.value);if(Array.isArray(p))setCalViews(p);}}catch{}
      try{const nr=await window.storage.get(pk(NOTES_KEY));setNotes(nr?.value?JSON.parse(nr.value):[]);}catch{setNotes([]);}
      try{const cr=await window.storage.get(pk(CUSTOM_TABS_KEY));if(cr?.value)setCustomTabs(JSON.parse(cr.value));}catch{}
      try{const pr=await window.storage.get(pk(PROJECTS_KEY));if(pr?.value){const p=JSON.parse(pr.value);if(Array.isArray(p))setProjectReg(p);}}catch{}
      try{const gc=await window.storage.get(pk(GROUP_COLORS_KEY));if(gc?.value){const m=JSON.parse(gc.value);if(m&&typeof m==="object"){setGroupColors(m);setGroupColorCache(m);}}}catch{}
      try{const ar=await window.storage.get(pk(ACTIVITY_KEY));if(ar?.value){const parsed=JSON.parse(ar.value);setActivity(parsed.activity||[]);setUndoStack(parsed.undo||[]);setRedoStack(parsed.redo||[]);}}catch{}
      try{const cfr=await window.storage.get(pk(CONFIG_KEY));if(cfr?.value){const c={...DEFAULT_CONFIG,...JSON.parse(cfr.value)};setConfig(c);setFontSize(c.fontSize||14);if(c.lang)setLang(c.lang);}}catch{}
      try{const wor=await window.storage.get(pk(WIDGET_KEY));if(wor?.value)setWidgetOrder(JSON.parse(wor.value));}catch{}
      try{const trr=await window.storage.get(pk(TABREADS_KEY));if(trr?.value)setTabReads(JSON.parse(trr.value));}catch{}
      try{const tor=await window.storage.get(pk(TABORDER_KEY));if(tor?.value)setTabOrder(JSON.parse(tor.value));}catch{}
      try{const gvr=await window.storage.get(pk(GANTT_VIEWS_KEY));if(gvr?.value){const p=JSON.parse(gvr.value);if(Array.isArray(p))setGanttViewsBk(p);}}catch{}
      try{const tvr=await window.storage.get(pk(TL_VIEWS_KEY));if(tvr?.value){const p=JSON.parse(tvr.value);if(Array.isArray(p))setTlViewsBk(p);}}catch{}
      try{const pr=await window.storage.get(pk(P_KEY));if(pr?.value){const tasks=JSON.parse(pr.value);const ts=tasks.find(t=>t._updated)?._updated;if(ts)setDataLastUpdated(ts);}}catch{}
      setLoaded(true);
    })();
  },[activeProfileId]); // reload when profile changes

  // N7: badge stays until user explicitly acknowledges. Compute current notif counts,
  // and expose markAllRead() to clear all badges at once (via bell dropdown button).
  const notifCounts = () => {
    const iso = fmtLocal(TODAY);
    return {
      today: personal.filter(t=>isOverdue(t)).length + work.filter(t=>isOverdue(t)).length +
             personal.filter(t=>t.due===iso&&t.status!=="done").length + work.filter(t=>t.due===iso&&t.status!=="done").length,
      milestones: personal.filter(t=>t.status==="done"&&t.milestone!==false&&t.milestoneAt).length +
                  work.filter(t=>t.status==="done"&&t.milestone!==false&&t.milestoneAt).length,
      donelist: personal.filter(t=>t.status==="done").length + work.filter(t=>t.status==="done").length,
    };
  };
  const markAllRead = () => {
    const c = notifCounts();
    const updated = { ...tabReads, ...c };
    setTabReads(updated);
    window.storage.set(pk(TABREADS_KEY), JSON.stringify(updated)).catch(()=>{});
  };
  // N7: mark a single tab read (used when badge is clicked / tab acknowledged)
  const markTabRead = (tabId) => {
    const c = notifCounts();
    if (c[tabId]==null) return;
    const updated = { ...tabReads, [tabId]: c[tabId] };
    setTabReads(updated);
    window.storage.set(pk(TABREADS_KEY), JSON.stringify(updated)).catch(()=>{});
  };

  // ── File save state ────────────────────────────────────────────────────────
  const [fileHandle, setFileHandle]       = useState(null);
  const [lastFileName, setLastFileName]   = useState(null);
  const [lastSavedTime, setLastSavedTime] = useState(null); // N-FileInfo
  const [saveStatus, setSaveStatus]       = useState("saved");
  const [openMenu, setOpenMenu]           = useState(null);
  const [pendingSaveData, setPendingSaveData] = useState(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const autoSaveTimer = useRef(null);

  // ── localStorage warning banner (R1) ─────────────────────────────────────
  const [showStorageWarning, setShowStorageWarning] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(()=>{
    // M1: use localStorage so dismiss persists across sessions (not just tab)
    try { return localStorage.getItem("lp-banner-dismissed")==="1"; } catch { return false; }
  });

  // Show banner when: loaded, no file saved yet, not dismissed this session
  useEffect(()=>{
    if (loaded && !fileHandle && !lastFileName && !bannerDismissed) {
      setShowStorageWarning(true);
    } else {
      setShowStorageWarning(false);
    }
  },[loaded, fileHandle, lastFileName, bannerDismissed]);

  const dismissBanner = () => {
    setBannerDismissed(true);
    setShowStorageWarning(false);
    try { localStorage.setItem("lp-banner-dismissed","1"); } catch {}
  };

  // ── Offline indicator (R5) ────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(()=>typeof navigator!=="undefined"?navigator.onLine:true);
  useEffect(()=>{
    const on  = ()=>setIsOnline(true);
    const off = ()=>setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  // Close dropdown on outside click
  useEffect(()=>{
    const close = () => setOpenMenu(null);
    if (openMenu) { setTimeout(()=>document.addEventListener("click", close), 0); }
    return ()=>document.removeEventListener("click", close);
  },[openMenu]);

  // ── Build COMPLETE payload (everything = same as full backup) ─────────────
  // Save = Backup. No difference. Always includes all data + config + meta.
  // ── N52: split-file save / load ───────────────────────────────────────────
  const splitPayload = (kind) => {
    if (kind==="work")     return work;
    if (kind==="personal") return personal;
    return { config:{...DEFAULT_CONFIG, ...config, lang}, events, eventTypes, calViews, notes, customTabs, widgetOrder };
  };
  const saveSplit = (kind) => {
    // GUARD 1: refuse to write an EMPTY slot that was never loaded — that is the
    // exact path that silently blanks out a file you didn't even open.
    const isEmpty = kind==="work" ? work.length===0
                  : kind==="personal" ? personal.length===0
                  : (events.length===0 && notes.length===0);
    if (!slots[kind] && isEmpty) {
      setSplitMsg(`⚠️ The ${kind.toUpperCase()} slot is empty and was never loaded — refusing to write an empty file over your data.`);
      return;
    }
    const prof = { id: activeProfileId, name: activeProfile?.name||"", emoji: activeProfile?.emoji||"👤" };
    downloadJSON(buildSplitFile(kind, splitPayload(kind), prof), splitFileName(kind, prof.name));
    setSlots(s=>({...s,[kind]:true}));
    pushActivity("export", `Saved ${kind} file`, "config");
    setSplitMsg(`✅ ${kind.toUpperCase()} file saved.`);
  };
  const saveAllSplit = () => {
    const loaded = SPLIT_KINDS.filter(k=>slots[k]);
    if (!loaded.length) { setSplitMsg("⚠️ No slot is loaded — nothing was written."); return; }
    loaded.forEach((k,i)=>setTimeout(()=>saveSplit(k), i*350)); // stagger so browsers allow 3 downloads
    setSplitMsg(`✅ Saving ${loaded.length} loaded slot(s): ${loaded.join(", ")}. Unloaded slots were skipped.`);
  };
  const saveCombined = () => {
    const missing = SPLIT_KINDS.filter(k=>!slots[k]);
    if (missing.length && !window.confirm(`These slots are not loaded: ${missing.join(", ")}.\nThe combined file will contain whatever is currently in memory for them. Continue?`))
      return;
    const payload = buildSavePayload();
    downloadJSON(payload, `My-Todo-Planner-Combined-${fmtLocal(TODAY)}.json`);
    setSplitMsg("✅ Combined file saved (all three parts in one file).");
  };
  const openSplitPicker = (kind) => { splitKindRef.current = kind; splitInputRef.current?.click(); };
  const handleSplitFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    const kind = splitKindRef.current;
    if (!file || !kind) return;
    try {
      const parsed = JSON.parse(await file.text());
      const res = readSplitFile(parsed, kind);
      if (!res.ok) {
        setSplitMsg(res.combined
          ? "⚠️ That is a combined file — use File → Open to load it."
          : `❌ ${res.error}`);
        return;
      }
      // GUARD 3: clear this slot's keys before writing, so old rows can't survive
      if (kind==="work") {
        setWork(res.data||[]);
        await window.storage.set(pk(W_KEY), JSON.stringify(res.data||[]));
      } else if (kind==="personal") {
        setPersonal(res.data||[]);
        await window.storage.set(pk(P_KEY), JSON.stringify(res.data||[]));
      } else {
        const d = res.data||{};
        if (d.config)     { const merged={...DEFAULT_CONFIG,...d.config}; setConfig(merged); await window.storage.set(pk(CONFIG_KEY),JSON.stringify(merged)); if(merged.lang) setLang(merged.lang); }
        if (Array.isArray(d.events))     { setEvents(d.events);         await window.storage.set(pk(EVENTS_KEY),JSON.stringify(d.events)); }
        if (Array.isArray(d.eventTypes)) { setEventTypes(d.eventTypes); await window.storage.set(pk(EVENT_TYPES_KEY),JSON.stringify(d.eventTypes)); }
        if (Array.isArray(d.calViews))   { setCalViews(d.calViews);     await window.storage.set(pk(CAL_VIEWS_KEY),JSON.stringify(d.calViews)); }
        if (Array.isArray(d.notes))      { setNotes(d.notes);           await window.storage.set(pk(NOTES_KEY),JSON.stringify(d.notes)); }
        if (Array.isArray(d.customTabs)) { setCustomTabs(d.customTabs); }
        if (Array.isArray(d.widgetOrder)){ setWidgetOrder(d.widgetOrder); }
      }
      setSlots(s=>({...s,[kind]:true}));
      setSlotFiles(f=>({...f,[kind]:file.name}));
      setDataLastUpdated(new Date().toISOString());
      pushActivity("import", `Loaded ${kind} file: ${file.name}`, "config");
      setSplitMsg(`✅ ${kind.toUpperCase()} loaded from ${file.name}`);
    } catch(err) {
      setSplitMsg("❌ Could not read that file: "+err.message);
    }
  };

  // ── Apply a parsed payload straight into the live app (used by cloud pull) ──
  const applyPayloadLive = async (parsed) => {
    if (!parsed || !Array.isArray(parsed.personal)) throw new Error("File is not a valid backup.");
    const w = (key, val) => window.storage.set(pk(key), JSON.stringify(val)).catch(()=>{});
    await w(P_KEY, parsed.personal);
    await w(W_KEY, parsed.work || []);
    const fileHasData = (arr) => Array.isArray(arr) && arr.length > 0;
    const isV7 = (parsed.version||0) >= 7;   // v7 files intend to carry every field
    // Never let an old/empty backup blank out events or notes that already exist.
    if (fileHasData(parsed.events) || (isV7 && Array.isArray(parsed.events))) await w(EVENTS_KEY, parsed.events);
    if (fileHasData(parsed.notes)  || (isV7 && Array.isArray(parsed.notes)))  await w(NOTES_KEY, parsed.notes);
    if (parsed.customTabs) await w(CUSTOM_TABS_KEY, parsed.customTabs);
    if (parsed.config)     await w(CONFIG_KEY, parsed.config);
    if (parsed.widgetOrder)await w(WIDGET_KEY, parsed.widgetOrder);
    // v7: restore everything that used to be lost
    if (parsed.eventTypes)    await w(EVENT_TYPES_KEY, parsed.eventTypes);
    if (parsed.calViews)      await w(CAL_VIEWS_KEY, parsed.calViews);
    if (parsed.ganttViews)    await w(GANTT_VIEWS_KEY, parsed.ganttViews);
    if (parsed.timelineViews) await w(TL_VIEWS_KEY, parsed.timelineViews);
    if (parsed.groupColors)   await w(GROUP_COLORS_KEY, parsed.groupColors);
    if (parsed.tabOrder)      await w(TABORDER_KEY, parsed.tabOrder);
    if (parsed.tabReads)      await w(TABREADS_KEY, parsed.tabReads);
    if (parsed.activity)      await w(ACTIVITY_KEY, parsed.activity);
    setPersonal(parsed.personal);
    setWork(parsed.work || []);
    if (fileHasData(parsed.events) || (isV7 && Array.isArray(parsed.events))) setEvents(parsed.events);
    if (fileHasData(parsed.notes)  || (isV7 && Array.isArray(parsed.notes)))  setNotes(parsed.notes);
    if (Array.isArray(parsed.customTabs)) setCustomTabs(parsed.customTabs);
    if (parsed.config) {
      const c = { ...DEFAULT_CONFIG, ...parsed.config };
      if (!c.defaultTab || c.defaultTab==="timeline") c.defaultTab = "milestones";
      setConfig(c); setFontSize(c.fontSize||14); if (c.lang) setLang(c.lang);
    }
    if (Array.isArray(parsed.widgetOrder)) setWidgetOrder(parsed.widgetOrder);
    if (Array.isArray(parsed.eventTypes)) setEventTypes(parsed.eventTypes);
    if (Array.isArray(parsed.calViews))   setCalViews(parsed.calViews);
    if (Array.isArray(parsed.ganttViews)) setGanttViewsBk(parsed.ganttViews);
    if (Array.isArray(parsed.timelineViews)) setTlViewsBk(parsed.timelineViews);
    if (parsed.groupColors && typeof parsed.groupColors==="object"){ setGroupColors(parsed.groupColors); setGroupColorCache(parsed.groupColors); }
    if (Array.isArray(parsed.tabOrder))   setTabOrder(parsed.tabOrder);
    if (parsed.tabReads && typeof parsed.tabReads==="object") setTabReads(parsed.tabReads);
    if (Array.isArray(parsed.activity))   setActivity(parsed.activity);
    setDataLastUpdated(new Date().toISOString());
  };

  // ── Google Drive sync: load state, push, pull, auto-schedule ───────────────
  useEffect(()=>{ (async()=>{
    // Switching profile means a different data set → drop the old file pairing and
    // load whatever pairing this profile saved. Each profile keeps its own file pair.
    if (gsyncProfRef.current !== activeProfileId) {
      gsyncProfRef.current = activeProfileId;
      if (gsyncTimer.current) clearTimeout(gsyncTimer.current);
      setGsync({ fileId:null, fileName:"", localName:"", lastSyncAt:0, lastCloudModified:"" });
      setGsyncStatus("idle");
      gsyncAutoRef.current = false;
      // N96: keep the Google login across profiles (same person, different data).
      // We do NOT sign out — the token is shared, so the new profile is already
      // connected; only its linked file differs.
      setGsyncSignedIn(GDrive.isSignedIn());
    }
    try{
      const r=await window.storage.get(pk(GSYNC_KEY));
      if(r?.value){ const s=JSON.parse(r.value); if(s&&s.fileId) setGsync(s); }
      const cr=await window.storage.get(pk(CONFIG_KEY));
      if(cr?.value){ const c=JSON.parse(cr.value); if(typeof c.gsyncAuto==="boolean") setGsyncAuto(c.gsyncAuto); }
    }catch{}
  })(); }, [activeProfileId]);

  // remember the auto on/off choice with the profile's config
  const setGsyncAutoPersist = (on) => {
    setGsyncAuto(on);
    try{ patchConfig({ gsyncAuto:on }); }catch{}
  };

  const persistGsync = async (next) => {
    setGsync(next);
    try{ await window.storage.set(pk(GSYNC_KEY), JSON.stringify(next)); }catch{}
  };

  // Preload the Google sign-in script as soon as the app opens (not on click) —
  // otherwise the network fetch happens between the user's click and the popup
  // call, and Safari/iOS silently blocks popups that aren't triggered synchronously
  // within the click. Warming this up ahead of time keeps Connect fast + reliable.
  useEffect(()=>{ GDrive.loadGIS().catch(()=>{}); }, []);

  const gsyncConnect = async () => {
    try {
      setGsyncStatus("syncing"); setGsyncError("");
      await GDrive.signIn({});
      GDrive.rememberAccount();   // A: learn the email so next Connect is one tap
      setGsyncSignedIn(true);
      setGsyncStatus("idle");
      try{ patchConfig({ gsyncConnected:true }); }catch{}  // N93: remember for next session
      return true;
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Sign-in failed"); return false; }
  };

  const gsyncDisconnect = () => {
    GDrive.signOut({forget:true}); setGsyncSignedIn(false); setGsyncStatus("idle");
    try{ patchConfig({ gsyncConnected:false }); }catch{}   // N93: stop auto sign-in
  };

  // N93: on app open, if this profile was connected before and still has a Google
  // session, sign in silently (no popup) and pull the latest — like "remember me".
  useEffect(()=>{
    if (gsyncAutoRef.current) return;      // once per mount
    if (!config.gsyncConnected) return;    // user never opted in on this profile
    if (!gsync.fileId) return;             // nothing linked yet
    if (typeof navigator!=="undefined" && navigator.onLine===false) return;  // offline: work locally
    if (!GDrive.hasRememberedAccount()) return;  // no account to resume — don't even try
    gsyncAutoRef.current = true;
    const timer = setTimeout(async ()=>{
      const tok = await GDrive.trySilent();
      if (tok) {
        setGsyncSignedIn(true);
        gsyncNow();                        // two-way, not a blind pull
      }
    }, 1200);                              // let the first paint finish first
    return ()=>clearTimeout(timer);
  }, [config.gsyncConnected, gsync.fileId]);

  // push local → cloud (create file first time, else overwrite)
  const gsyncPush = async ({silent=false}={}) => {
    if (gsyncBusy.current) return;
    if (!GDrive.isSignedIn()) { const ok=await gsyncConnect(); if(!ok) return; }
    gsyncBusy.current = true;
    if (!silent) setGsyncStatus("syncing");
    try {
      const content = JSON.stringify(buildSavePayload(), null, 2);
      let meta;
      if (gsync.fileId) meta = await GDrive.updateFile(gsync.fileId, content);
      else {
        const name = (config.defaultFilePath?.split(/[\\/]/).pop()) || "My-Todo-Planner.json";
        meta = await GDrive.createFile(name, content);
      }
      await persistGsync({ ...gsync, fileId:meta.id, fileName:meta.name,
        localName: gsync.localName || meta.name,   // keep both sides on the same name
        lastSyncAt:Date.now(), lastCloudModified:meta.modifiedTime||"" });
      setGsyncStatus("synced"); setGsyncError("");
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Sync failed"); }
    finally { gsyncBusy.current = false; }
  };

  // pull cloud → local. If cloud is newer than our last sync, ask before overwriting.
  const gsyncPull = async ({force=false}={}) => {
    if (!gsync.fileId) return;
    if (gsyncBusy.current) return;
    if (!GDrive.isSignedIn()) { const ok=await gsyncConnect(); if(!ok) return; }
    gsyncBusy.current = true; setGsyncStatus("syncing");
    try {
      const meta = await GDrive.getMeta(gsync.fileId);
      if (meta.trashed) throw new Error("The cloud file was deleted.");
      const cloudNewer = meta.modifiedTime && meta.modifiedTime !== gsync.lastCloudModified;
      if (cloudNewer && !force) {
        const text = await GDrive.download(gsync.fileId);
        setGsyncConflict({ cloudText:text, cloudModified:meta.modifiedTime });
        setGsyncStatus("idle");
        return;
      }
      const text = await GDrive.download(gsync.fileId);
      await applyPayloadLive(JSON.parse(text));
      await persistGsync({ ...gsync, lastSyncAt:Date.now(), lastCloudModified:meta.modifiedTime||"" });
      setGsyncStatus("synced");
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Pull failed"); }
    finally { gsyncBusy.current = false; }
  };

  // accept the conflicting cloud copy the user was warned about
  // rename the synced file — Drive side is renamed for real, local reference follows,
  // so both ends stay on one shared name.
  const gsyncRename = async (newName) => {
    const name = (newName||"").trim();
    if (!name) return;
    const finalName = name.endsWith(".json") ? name : name + ".json";
    try {
      setGsyncStatus("syncing");
      let meta = null;
      if (gsync.fileId) meta = await GDrive.renameFile(gsync.fileId, finalName);
      await persistGsync({ ...gsync, fileName: meta?.name || finalName, localName: finalName,
        lastCloudModified: meta?.modifiedTime || gsync.lastCloudModified });
      setGsyncStatus("synced");
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Rename failed"); }
  };

  // switch the linked file to a different one the user picks (keeps auth)
  const gsyncRelink = async (fileId, fileName) => {
    await persistGsync({ ...gsync, fileId, fileName, localName: fileName,
      lastSyncAt:0, lastCloudModified:"" });
  };

  // fully unlink the file (but stay signed in)
  // open the Drive folder that contains the synced file (falls back to My Drive)
  const gsyncOpenFolder = async () => {
    if (!gsync.fileId) { window.open("https://drive.google.com/drive/my-drive","_blank","noopener"); return; }
    try {
      if (!GDrive.isSignedIn()) await gsyncConnect();
      const folderId = await GDrive.getParentFolder(gsync.fileId);
      const url = folderId ? `https://drive.google.com/drive/folders/${folderId}` : "https://drive.google.com/drive/my-drive";
      window.open(url,"_blank","noopener");
    } catch { window.open("https://drive.google.com/drive/my-drive","_blank","noopener"); }
  };

  const gsyncUnlink = async () => {
    if (gsyncTimer.current) clearTimeout(gsyncTimer.current);
    await persistGsync({ fileId:null, fileName:"", localName:"", lastSyncAt:0, lastCloudModified:"" });
    setGsyncStatus("idle");
  };

  // B: one button that does the right thing — push, pull, or ask only when both
  // sides changed since the last sync (a real conflict). This replaces having to
  // pick "Save now" vs "Load now" yourself.
  const gsyncNow = async () => {
    if (gsyncBusy.current) return;
    if (!GDrive.isSignedIn()) { const ok = await gsyncConnect(); if (!ok) return; }
    if (!gsync.fileId) { await gsyncPush({}); return; }  // first time — just create the file
    gsyncBusy.current = true; setGsyncStatus("syncing"); setGsyncError("");
    try {
      const meta = await GDrive.getMeta(gsync.fileId);
      if (meta.trashed) throw new Error("The cloud file was deleted.");
      const cloudChanged = !!meta.modifiedTime && meta.modifiedTime !== gsync.lastCloudModified;
      // Small tolerance: applying a pulled payload also stamps dataLastUpdated, and
      // that stamp lands a few ms before lastSyncAt. Without the margin a fresh pull
      // could immediately look like a local edit and bounce straight back up.
      const localChanged = !!dataLastUpdated && (!gsync.lastSyncAt || new Date(dataLastUpdated).getTime() > gsync.lastSyncAt + 1500);

      if (cloudChanged && localChanged) {
        // Genuine conflict — both sides moved since the last sync. Ask once,
        // same dialog as before, rather than silently picking a winner.
        const text = await GDrive.download(gsync.fileId);
        // Carry both sides into the dialog. The counts shown must come from the
        // payloads themselves, not from a remembered summary, or the dialog can
        // describe data that is no longer there.
        let cloudPayload = null;
        try { cloudPayload = JSON.parse(text); } catch { cloudPayload = null; }
        setGsyncConflict({
          cloudText: text,
          cloudModified: meta.modifiedTime,
          cloudPayload,
          cloudName: gsync.fileName || "cloud file",
          localPayload: buildSavePayload(),
          localStamp: dataLastUpdated || null,
        });
        setGsyncStatus("idle");
      } else if (cloudChanged) {
        // Only the cloud moved — safe to pull, nothing local to lose.
        const text = await GDrive.download(gsync.fileId);
        await applyPayloadLive(JSON.parse(text));
        await persistGsync({ ...gsync, lastSyncAt: Date.now(), lastCloudModified: meta.modifiedTime || "" });
        setGsyncStatus("synced");
      } else if (localChanged) {
        // Only local moved — safe to push, nothing cloud-side to lose.
        const content = JSON.stringify(buildSavePayload(), null, 2);
        const updated = await GDrive.updateFile(gsync.fileId, content);
        await persistGsync({ ...gsync, lastSyncAt: Date.now(), lastCloudModified: updated.modifiedTime || "" });
        setGsyncStatus("synced");
      } else {
        // Nothing changed on either side.
        setGsyncStatus("synced");
      }
    } catch (e) { setGsyncStatus("error"); setGsyncError(e.message || "Sync failed"); }
    finally { gsyncBusy.current = false; }
  };

  const gsyncAcceptCloud = async () => {
    if (!gsyncConflict) return;
    try {
      await applyPayloadLive(JSON.parse(gsyncConflict.cloudText));
      await persistGsync({ ...gsync, lastSyncAt:Date.now(), lastCloudModified:gsyncConflict.cloudModified });
      setGsyncStatus("synced");
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Load failed"); }
    setGsyncConflict(null);
  };

  // The other direction: keep what is on this device and overwrite Drive.
  // Before 3.75 the conflict dialog only offered the cloud copy, so the only
  // way to keep local work was to cancel and hope the next sync went the right
  // way. Re-reads the payload at the moment of the click rather than reusing
  // the snapshot taken when the dialog opened, in case anything changed while
  // it was on screen.
  const gsyncAcceptLocal = async () => {
    if (!gsyncConflict) return;
    try {
      const content = JSON.stringify(buildSavePayload(), null, 2);
      const updated = await GDrive.updateFile(gsync.fileId, content);
      await persistGsync({ ...gsync, lastSyncAt:Date.now(), lastCloudModified:updated.modifiedTime||"" });
      setGsyncStatus("synced");
    } catch(e){ setGsyncStatus("error"); setGsyncError(e.message||"Save to Cloud failed"); }
    setGsyncConflict(null);
  };

  // B: debounced auto-SYNC (two-way) whenever data changes — safer than a plain
  // auto-push, because it checks the cloud first instead of blindly overwriting it.
  useEffect(()=>{
    if (!gsyncAuto || !gsync.fileId || !GDrive.isSignedIn()) return;
    if (gsyncTimer.current) clearTimeout(gsyncTimer.current);
    gsyncTimer.current = setTimeout(()=>{ gsyncNow(); }, 15000);
    return ()=>{ if(gsyncTimer.current) clearTimeout(gsyncTimer.current); };
  }, [personal, work, events, notes, gsyncAuto]);   // data signals

  // B: also sync when the tab/app regains focus — catches changes made on
  // another device while this one was in the background, without a fixed poll.
  useEffect(()=>{
    if (!gsyncAuto) return;
    const onFocus = () => { if (gsync.fileId && GDrive.isSignedIn() && !gsyncBusy.current) gsyncNow(); };
    const onVis = () => { if (document.visibilityState==="visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [gsyncAuto, gsync.fileId]);

  const buildSavePayload = () => ({
    version: 7,
    appVersion: APP_VERSION,
    profile: { id: activeProfileId, name: activeProfile?.name||"", emoji: activeProfile?.emoji||"👤" },
    savedAt: new Date().toISOString(),
    fileName: lastFileName,
    personal,
    work,
    events,
    notes,
    customTabs,
    config: { ...DEFAULT_CONFIG, ...config, lang },
    widgetOrder,
    // Previously LOST on backup/restore — now included:
    eventTypes,
    calViews,
    ganttViews: (typeof window!=="undefined" && window.__viewsMirror?.[GANTT_VIEWS_KEY]) || ganttViewsBk,
    timelineViews: (typeof window!=="undefined" && window.__viewsMirror?.[TL_VIEWS_KEY]) || tlViewsBk,
    groupColors,
    tabOrder,
    tabReads,
    activity,
    summary: {
      personalCount: personal.length,
      workCount: work.length,
      doneCount: [...personal,...work].filter(t=>t.status==="done").length,
      overdueCount: [...personal,...work].filter(t=>isOverdue(t)).length,
    },
  });

  // ── Write JSON to file (File System Access API or download fallback) ───────
  const writeToHandle = async (handle, payload) => {
    const json = JSON.stringify(payload, null, 2);
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
  };

  const doSaveCore = async (payload, fname, handle=null) => {
    setSaveStatus("saving");
    try {
      if (handle) {
        await writeToHandle(handle, payload);
        setFileHandle(handle);
        setLastFileName(handle.name || fname);
      } else {
        downloadJSON(payload, fname);
        setLastFileName(fname);
      }
      setSaveStatus("saved");
      setLastSavedTime(new Date()); // N-FileInfo: record save time
      showToast(`✅ Saved — ${handle?.name||fname}`);
      pushActivity("export", `Saved: ${handle?.name||fname}`, "config",
        `${personal.length} personal · ${work.length} work · full backup`);
    } catch (err) {
      if (err.name !== "AbortError") {
        setSaveStatus("unsaved");
        console.warn("Save error:", err);
      }
    }
    setOpenMenu(null);
  };

  // ── SAVE — opens file picker (File System Access API) ────────────────────
  // On Chrome/Edge: opens "Save to folder" native dialog (same folder as before if fileHandle exists)
  // On Safari/Firefox: falls back to download
  const handleSave = async () => {
    const payload = buildSavePayload();
    // N56: prefer the file name from the configured default path
    const pathName = (config.defaultFilePath||"").split(/[\\/]/).pop();
    const fname   = lastFileName
      || (pathName ? `${pathName.replace(/\.json$/i,"")}.json` : null)
      || (config.defaultFileName ? `${config.defaultFileName.replace(/\.json$/i,"")}.json` : null)
      || `My-Todo-Planner-v${APP_VERSION}-${(activeProfile?.name||"profile").replace(/[^a-zA-Z0-9]/g,"-")}-${new Date().toISOString().slice(0,10)}.json`;

    // Try File System Access API (Chrome/Edge on desktop — opens folder picker)
    if (fileHandle && typeof fileHandle.createWritable === "function") {
      // Already have a handle — write directly (same file, same folder, no dialog)
      await doSaveCore(payload, fname, fileHandle);
      return;
    }
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          startIn: fileHandle || (config.defaultStartFolder||"documents"), // open SAME folder as last opened/saved file
          types: [{ description:"My Todo Planner JSON", accept:{"application/json":[".json"]} }],
        });
        await doSaveCore(payload, handle.name, handle);
        return;
      } catch(err) {
        if (err.name === "AbortError") return; // user cancelled
        // fall through to download
      }
    }
    // Fallback: download (Safari / Firefox)
    doSaveCore(payload, fname);
  };

  // ── SAVE AS — always opens "Save to folder" dialog ───────────────────────
  const handleSaveAs = async () => {
    const payload = buildSavePayload();
    // N56: prefer the file name from the configured default path
    const pathName = (config.defaultFilePath||"").split(/[\\/]/).pop();
    const fname   = lastFileName
      || (pathName ? `${pathName.replace(/\.json$/i,"")}.json` : null)
      || (config.defaultFileName ? `${config.defaultFileName.replace(/\.json$/i,"")}.json` : null)
      || `My-Todo-Planner-v${APP_VERSION}-${(activeProfile?.name||"profile").replace(/[^a-zA-Z0-9]/g,"-")}-${new Date().toISOString().slice(0,10)}.json`;

    if (typeof window.showSaveFilePicker === "function") {
      try {
        // Always show dialog even if we have an existing handle
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          startIn: fileHandle || (config.defaultStartFolder||"documents"),
          types: [{ description:"My Todo Planner JSON", accept:{"application/json":[".json"]} }],
        });
        await doSaveCore(payload, handle.name, handle);
        return;
      } catch(err) {
        if (err.name === "AbortError") return;
      }
    }
    // Fallback: prompt for filename then download
    const name = window.prompt("Save file as:", fname);
    if (!name) return;
    const finalName = name.endsWith(".json") ? name : name + ".json";
    doSaveCore(payload, finalName);
  };

  // ── BACKUP — save a DATED copy for history (never overwrites the working file) ──
  // Q3=B: Backup is the 3rd button. Same payload as Save, but filename always gets
  // a date+time suffix and it always downloads a new file (no handle reuse).
  const handleBackup = async () => {
    const payload = buildSavePayload();
    const base = (lastFileName || `My-Todo-Planner-${(activeProfile?.name||"profile").replace(/[^a-zA-Z0-9]/g,"-")}`).replace(/\.json$/i,"").replace(/-backup-[\dT:-]+$/i,"");
    const dN = new Date(); // local (Thai) time, not UTC
    const stamp = `${dN.getFullYear()}-${String(dN.getMonth()+1).padStart(2,"0")}-${String(dN.getDate()).padStart(2,"0")}-${String(dN.getHours()).padStart(2,"0")}-${String(dN.getMinutes()).padStart(2,"0")}`;
    const fname = `${base}-backup-${stamp}.json`;

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fname,
          startIn: fileHandle || (config.defaultStartFolder||"documents"),
          types: [{ description:"My Todo Planner Backup", accept:{"application/json":[".json"]} }],
        });
        // Write but DON'T adopt this handle as the working file — backup is a side copy
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(payload, null, 2));
        await writable.close();
        setLastSavedTime(new Date());
        showToast(`📦 Backup saved — ${handle.name}`);
        pushActivity("export", `Backup created: ${handle.name}`, "config", "Dated history copy");
        return;
      } catch(err) {
        if (err.name === "AbortError") return;
      }
    }
    // Fallback: download dated copy
    downloadJSON(payload, fname);
    pushActivity("export", `Backup created: ${fname}`, "config", "Dated history copy");
  };

  // ── AUTO-SAVE: debounced 3s after any data change ─────────────────────────
  // I2: only runs when loaded + has fileHandle. No JSON.stringify until timer fires.
  useEffect(()=>{
    if (!loaded) return;
    setSaveStatus("unsaved");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (!fileHandle && !lastFileName) return;
    autoSaveTimer.current = setTimeout(async ()=>{
      const payload = buildSavePayload();
      const fname   = lastFileName || `My-Todo-Planner-v${APP_VERSION}-${activeProfile.name.replace(/[^a-zA-Z0-9]/g,"-")}-auto.json`;
      if (fileHandle && typeof fileHandle.createWritable === "function") {
        // Chrome/Edge: silently write to same file — NO popup, NO dialog
        try {
          await writeToHandle(fileHandle, payload);
          setSaveStatus("saved");
          pushActivity("export", `Auto-saved: ${fileHandle.name}`, "config",
            `${personal.length}P + ${work.length}W (auto)`);
        } catch(e) {
          if (e.name !== "AbortError") setSaveStatus("unsaved");
        }
      } else {
        // Safari fallback: just mark as saved in browser storage
        // (can't silently download on Safari — would flood Downloads folder)
        setSaveStatus("unsaved"); // keep unsaved indicator, user can manual-save
      }
    }, 3000); // 3 second debounce
    return ()=>{ if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  },[personal, work, customTabs, config, widgetOrder, loaded]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(()=>{
    const handler = (e) => {
      if ((e.metaKey||e.ctrlKey)&&e.key==="s") { e.preventDefault(); handleSave(); }
      if ((e.metaKey||e.ctrlKey)&&e.key==="k") { e.preventDefault(); setShowSearch(s=>!s); }
    };
    window.addEventListener("keydown", handler);
    return ()=>window.removeEventListener("keydown", handler);
  },[personal, work, customTabs, config, lang, widgetOrder, activeProfileId, fileHandle, lastFileName]);





  // ── Profile switch ────────────────────────────────────────────────────────
  const switchProfile = (newId) => {
    const targetProf = profileList.find(p=>p.id===newId)||{name:newId};
    // I3: reset file handle so auto-save doesn't overwrite old profile's file
    setFileHandle(null);
    setLastFileName(null);
    setSaveStatus("unsaved");
    try { localStorage.setItem(ACTIVE_PROF_KEY, newId); } catch {}
    pushActivity("profile", `Switched to profile: ${targetProf.name}`, "profile", `From: ${activeProfile?.name||""}`);
    setActiveProfileId(newId);
    setTab("milestones");   // N79: same landing page after a profile switch
    setShowProfileSwitcher(false);
  };

  const toggleLang = async () => {
    const next = lang==="EN"?"TH":"EN";
    setLang(next);
    const newCfg = {...config, lang:next};
    setConfig(newCfg);
    pushActivity("config", `Language changed to ${next}`, "config");
    try{await window.storage.set(pk(CONFIG_KEY),JSON.stringify(newCfg));}catch{}
  };
  const handleSaveProfiles = (list) => {
    saveProfiles(list);
    setProfileList(list);
  };

  // ── Activity tracker — keeps snapshot per entry for per-entry undo/redo ────
  const pushActivity = (type, title, module, detail="", snap=null) => {
    const entry = {
      id: Date.now(),
      type, title, module, detail,
      ts: new Date().toISOString(),
      // Lean snapshot: store full data for restore capability
      // Cap personal+work at their current state (not cloned repeatedly in closure)
      snapshot: snap || null,
    };
    setActivity(prev => {
      const next = [entry,...prev].slice(0,100); // N-Activity: 100-event circular buffer
      window.storage.set(pk(ACTIVITY_KEY), JSON.stringify({
        activity: next.map(a=>({...a, snapshot: a.snapshot ? {
          // Store lean refs — full data stored separately in P_KEY/W_KEY
          hasSnapshot: true,
          personal: a.snapshot.personal,
          work: a.snapshot.work,
        } : null})),
        undo:undoStack,
        redo:redoStack,
      })).catch(()=>{});
      return next;
    });
  };

  // N37: publish the logger so tab components can record activity too
  useEffect(()=>{ window.__pushActivity = pushActivity; return ()=>{ delete window.__pushActivity; }; });

  const saveActivityState = (undo, redo, act) => {
    window.storage.set(pk(ACTIVITY_KEY), JSON.stringify({activity:act||activity,undo,redo})).catch(()=>{});
  };

  // ── Save wrappers with undo support + recurring auto-renewal ─────────────
  const savePersonalWithUndo = async (next, actType, title, detail="", renewedTask=null) => {
    const snapBefore = {personal:[...personal],work:[...work]};
    const snap = {personal:[...personal],work:[...work],desc:title};
    setUndoStack(prev=>{const u=[snap,...prev].slice(0,20);saveActivityState(u,redoStack);return u;});
    setRedoStack([]);
    let finalList = next;
    if (renewedTask && renewedTask.isRecurring && actType==="done") {
      const renewed = renewRecurringTask(renewedTask);
      if (renewed) finalList = [...next, renewed];
    }
    setPersonal(finalList);
    setDataLastUpdated(new Date().toISOString());
    pushActivity(actType, title, "personal", detail, snapBefore);
    try{await window.storage.set(pk(P_KEY),JSON.stringify(finalList));}catch{}
  };

  const saveWorkWithUndo = async (next, actType, title, detail="", renewedTask=null) => {
    const snapBefore = {personal:[...personal],work:[...work]};
    const snap = {personal:[...personal],work:[...work],desc:title};
    setUndoStack(prev=>{const u=[snap,...prev].slice(0,20);saveActivityState(u,redoStack);return u;});
    setRedoStack([]);
    let finalList = next;
    if (renewedTask && (renewedTask.recur||renewedTask.isRecurring) && actType==="done") {
      const renewed = renewRecurringTask(renewedTask);
      if (renewed) finalList = [...next, renewed];
    }
    setWork(finalList);
    setDataLastUpdated(new Date().toISOString());
    pushActivity(actType, title, "work", detail, snapBefore);
    try{await window.storage.set(pk(W_KEY),JSON.stringify(finalList));}catch{}
  };

  // ── Open profile data file (same as importing + switching profile) ───────
  const openFileRef = useRef(null);

  // ── N-DefaultFile + N-OpenFile: shared logic to load parsed JSON into a profile ──
  // ── OPEN FILE — loads data into CURRENT profile (same proven path as Restore) ──
  // Q1=A: no profile switching → no setActiveProfileId → no reload race condition.
  // Q2=A: profile is decoupled from files entirely. Open just replaces current data.
  // Q4=A: if there is NO profile yet (first run), auto-create one from the file name.
  const applyOpenedFile = async (parsed, fileName, handle=null) => {
    // Q5=A: keep validation — must look like a real backup
    if (!parsed.personal || !Array.isArray(parsed.personal)) {
      alert("❌ Invalid file — must be a My Todo Planner JSON backup.");
      return false;
    }

    // Q4=A: first-run only — if no active profile exists, create one from the file
    const isFirstRun = !activeProfileId || profileList.length === 0;
    let profileIdToUse = activeProfileId;
    if (isFirstRun) {
      const fileProf = parsed.profile || {};
      profileIdToUse = `profile-${Date.now()}`;
      // CRITICAL: write all data to the new profile's storage keys FIRST,
      // so when setActiveProfileId triggers the [activeProfileId] load effect,
      // the data is already present (no seed-data race).
      const wPre = (key, val) => window.storage.set(profKey(profileIdToUse, key), JSON.stringify(val));
      try {
        await wPre(P_KEY, parsed.personal);
        await wPre(W_KEY, parsed.work || []);
        // events + notes were being dropped here — a new profile lost them entirely
        if (Array.isArray(parsed.events)) await wPre(EVENTS_KEY, parsed.events);
        if (Array.isArray(parsed.notes))  await wPre(NOTES_KEY, parsed.notes);
        if (parsed.customTabs)  await wPre(CUSTOM_TABS_KEY, parsed.customTabs);
        if (parsed.config) {
          // N79: normalise the legacy "timeline" tab id (that id is the Overview page)
          const pc = {...parsed.config};
          if (!pc.defaultTab || pc.defaultTab==="timeline") pc.defaultTab = "milestones";
          await wPre(CONFIG_KEY, pc);
        }
        if (parsed.widgetOrder) await wPre(WIDGET_KEY, parsed.widgetOrder);
        if (parsed.eventTypes)    await wPre(EVENT_TYPES_KEY, parsed.eventTypes);
        if (parsed.calViews)      await wPre(CAL_VIEWS_KEY, parsed.calViews);
        if (parsed.ganttViews)    await wPre(GANTT_VIEWS_KEY, parsed.ganttViews);
        if (parsed.timelineViews) await wPre(TL_VIEWS_KEY, parsed.timelineViews);
        if (parsed.groupColors)   await wPre(GROUP_COLORS_KEY, parsed.groupColors);
        if (parsed.tabOrder)      await wPre(TABORDER_KEY, parsed.tabOrder);
        if (parsed.tabReads)      await wPre(TABREADS_KEY, parsed.tabReads);
        if (parsed.activity)      await wPre(ACTIVITY_KEY, parsed.activity);
      } catch {}
      const newProf = {
        id: profileIdToUse,
        name: fileProf.name || fileName.replace(/\.json$/i, "") || "My Profile",
        emoji: fileProf.emoji || "📂",
        createdAt: new Date().toISOString().slice(0,10),
      };
      const newList = [...getProfiles(), newProf];
      saveProfiles(newList);
      setProfileList(newList);
      try { localStorage.setItem(ACTIVE_PROF_KEY, profileIdToUse); } catch {}
      setLastFileName(parsed.fileName || fileName);
      setFileHandle(handle || null);
      setActiveProfileId(profileIdToUse); // load effect will now read the data we just wrote
      setTab("milestones");   // N79: opening a file lands on the Timeline
      setOpenMenu(null);
      pushActivity("import", `Opened file: ${fileName}`, "personal",
        `Created profile + loaded ${parsed.personal.length} personal + ${(parsed.work||[]).length} work tasks`);
      return true;
    }

    // ── Normal case: a profile already exists → load into it WITHOUT switching ──
    // Write straight into the CURRENT profile's storage keys (like Restore does)
    const w = (key, val) => window.storage.set(profKey(profileIdToUse, key), JSON.stringify(val)).catch(()=>{});
    await w(P_KEY, parsed.personal);
    await w(W_KEY, parsed.work || []);
    // events + notes were missing here too. Guard against an old empty backup
    // ([] is truthy) silently wiping events/notes that already exist.
    const _hasData = (arr)=>Array.isArray(arr)&&arr.length>0;
    const _v7 = (parsed.version||0)>=7;
    if (_hasData(parsed.events) || (_v7 && Array.isArray(parsed.events))) await w(EVENTS_KEY, parsed.events);
    if (_hasData(parsed.notes)  || (_v7 && Array.isArray(parsed.notes)))  await w(NOTES_KEY, parsed.notes);
    if (parsed.customTabs)  await w(CUSTOM_TABS_KEY, parsed.customTabs);
    if (parsed.config)      await w(CONFIG_KEY, parsed.config);
    if (parsed.widgetOrder) await w(WIDGET_KEY, parsed.widgetOrder);
    if (parsed.eventTypes)    await w(EVENT_TYPES_KEY, parsed.eventTypes);
    if (parsed.calViews)      await w(CAL_VIEWS_KEY, parsed.calViews);
    if (parsed.ganttViews)    await w(GANTT_VIEWS_KEY, parsed.ganttViews);
    if (parsed.timelineViews) await w(TL_VIEWS_KEY, parsed.timelineViews);
    if (parsed.groupColors)   await w(GROUP_COLORS_KEY, parsed.groupColors);
    if (parsed.tabOrder)      await w(TABORDER_KEY, parsed.tabOrder);
    if (parsed.tabReads)      await w(TABREADS_KEY, parsed.tabReads);
    if (parsed.activity)      await w(ACTIVITY_KEY, parsed.activity);

    // Update live React state directly — exactly like handleImport (Restore), no reload race
    setPersonal(parsed.personal);
    setWork(parsed.work || []);
    if (_hasData(parsed.events) || (_v7 && Array.isArray(parsed.events))) setEvents(parsed.events);
    if (_hasData(parsed.notes)  || (_v7 && Array.isArray(parsed.notes)))  setNotes(parsed.notes);
    if (Array.isArray(parsed.customTabs)) setCustomTabs(parsed.customTabs);
    if (parsed.config) {
      const c = { ...DEFAULT_CONFIG, ...parsed.config };
      // N79: files exported before v3.40 carry defaultTab:"timeline", which is the
      // OVERVIEW page's id. Normalise it so opening an old file still lands on Timeline.
      if (!c.defaultTab || c.defaultTab==="timeline") c.defaultTab = "milestones";
      setConfig(c); setFontSize(c.fontSize||14); if (c.lang) setLang(c.lang);
    }
    if (Array.isArray(parsed.widgetOrder)) setWidgetOrder(parsed.widgetOrder);
    if (Array.isArray(parsed.eventTypes)) setEventTypes(parsed.eventTypes);
    if (Array.isArray(parsed.calViews))   setCalViews(parsed.calViews);
    if (Array.isArray(parsed.ganttViews)) setGanttViewsBk(parsed.ganttViews);
    if (Array.isArray(parsed.timelineViews)) setTlViewsBk(parsed.timelineViews);
    if (parsed.groupColors && typeof parsed.groupColors==="object"){ setGroupColors(parsed.groupColors); setGroupColorCache(parsed.groupColors); }
    if (Array.isArray(parsed.tabOrder))   setTabOrder(parsed.tabOrder);
    if (parsed.tabReads && typeof parsed.tabReads==="object") setTabReads(parsed.tabReads);
    if (Array.isArray(parsed.activity))   setActivity(parsed.activity);
    setDataLastUpdated(new Date().toISOString());

    // File tracking (decoupled from profile)
    setLastFileName(parsed.fileName || fileName);
    setFileHandle(handle || null);

    setTab("milestones");   // N79: a freshly opened file always lands on the Timeline
    setOpenMenu(null);
    pushActivity("import", `Opened file: ${fileName}`, "personal",
      `Loaded ${parsed.personal.length} personal + ${(parsed.work||[]).length} work tasks into current profile`);
    return true;
  };

  // ── OPEN FILE — primary handler using File System Access API when available ──
  // Chrome/Edge: showOpenFilePicker returns a FileSystemFileHandle → stored so
  // Save/Backup can use startIn:handle to open the SAME folder automatically.
  // Safari/Firefox: falls back to the hidden <input type=file> (no handle = no folder memory).
  const handleOpenFilePicker = async () => {
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description:"My Todo Planner JSON", accept:{"application/json":[".json"]} }],
          // startIn: use existing fileHandle to reopen same folder; else "documents"
          ...(fileHandle ? {startIn: fileHandle} : {startIn:(config.defaultStartFolder||"documents")}),
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        // Pass the real handle so Save/Backup know which folder to startIn.
        // N107: routed through the guard so a cloud mismatch is confirmed first.
        await openLocalPayloadGuarded(parsed, handle.name, handle);
        return;
      } catch(err) {
        if (err.name === "AbortError") return; // user cancelled
        console.warn("showOpenFilePicker failed, falling back:", err);
        // Fall through to hidden input
      }
    }
    // Safari / Firefox fallback
    openFileRef.current?.click();
  };

  const handleOpenFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        await openLocalPayloadGuarded(parsed, file.name, null);
      } catch (err) {
        alert("❌ Failed to open file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // N107: opening a local file while a cloud file is linked is a two-sided decision.
  // Compare content first and touch nothing until the user picks a direction.
  const openLocalPayloadGuarded = async (parsed, fileName, handle) => {
    const linked = !!gsync.fileId && (gsyncSignedIn || GDrive.isSignedIn());
    if (!linked) { await applyOpenedFile(parsed, fileName, handle); return; }
    try {
      const meta = await GDrive.getMeta(gsync.fileId);
      // Fast path: identical save stamp means it is literally the same snapshot.
      if (meta.modifiedTime && parsed.savedAt && gsync.lastCloudModified === meta.modifiedTime
          && payloadDigest(parsed) === (gsync._lastDigest || payloadDigest(parsed))) {
        await applyOpenedFile(parsed, fileName, handle); return;
      }
      const cloudText = await GDrive.download(gsync.fileId);
      const cloudPayload = JSON.parse(cloudText);
      // Same content, different timestamps → nothing to decide, just open it.
      if (payloadDigest(parsed) === payloadDigest(cloudPayload)) {
        await applyOpenedFile(parsed, fileName, handle); return;
      }
      setImportConflict({ parsed, fileName, handle,
        cloud: { payload: cloudPayload, modifiedTime: meta.modifiedTime || "" } });
    } catch (err) {
      // Cloud unreachable — fall back to plain local open rather than blocking work.
      await applyOpenedFile(parsed, fileName, handle);
    }
  };

  // direction 1: the local file wins — load it, then overwrite the cloud copy
  const importUseLocal = async () => {
    const ic = importConflict; if (!ic) return;
    setImportConflict(null);
    await applyOpenedFile(ic.parsed, ic.fileName, ic.handle);
    setDataLastUpdated(new Date().toISOString());
    setTimeout(()=>{ gsyncPush({}); }, 400);   // let state settle, then push up
  };

  // direction 2: the cloud wins — ignore the file, load what is on Drive
  const importUseCloud = async () => {
    const ic = importConflict; if (!ic) return;
    setImportConflict(null);
    await applyPayloadLive(ic.cloud.payload);
    await persistGsync({ ...gsync, lastSyncAt: Date.now(), lastCloudModified: ic.cloud.modifiedTime });
    setGsyncStatus("synced");
  };

  // ── Jump to activity snapshot (per-entry undo) ────────────────────────────
  const handleJumpToActivity = async (actEntry) => {
    if (!actEntry.snapshot) return;
    const { personal: p, work: w } = actEntry.snapshot;
    // Save current as redo point
    const redoSnap = { personal:[...personal], work:[...work], desc:"Before jump to: "+actEntry.title };
    setRedoStack(prev=>[redoSnap,...prev].slice(0,20));
    // Add to undo for the jump itself
    const undoSnap = { personal:[...personal], work:[...work], desc:"Undo jump" };
    setUndoStack(prev=>[undoSnap,...prev].slice(0,20));
    setPersonal(p);
    setWork(w);
    setDataLastUpdated(new Date().toISOString());
    pushActivity("undone", `Jumped to: ${actEntry.title}`, actEntry.module, "Restored state from activity");
    try {
      await window.storage.set(pk(P_KEY), JSON.stringify(p));
      await window.storage.set(pk(W_KEY), JSON.stringify(w));
    } catch {}
  };

  // ── Widget order save ─────────────────────────────────────────────────────
  const saveWidgetOrder = async (order) => {
    setWidgetOrder(order);
    setDataLastUpdated(new Date().toISOString());   // N106
    try{await window.storage.set(pk(WIDGET_KEY),JSON.stringify(order));}catch{}
  };

  // ── Save task from Overview (no-date edits) ───────────────────────────────
  const handleTaskSaveFromOverview = async (updated) => {
    if (updated._type==="work") {
      await saveWorkWithUndo(applyEditWithRecur(work, updated, "todo"), "edit", updated.title, "Edited from Overview");
    } else {
      await savePersonalWithUndo(applyEditWithRecur(personal, updated, "pending"), "edit", updated.title, "Edited from Overview");
    }
  };

  // ── Language toggle ───────────────────────────────────────────────────────
  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const handleUndo = async () => {
    if(!undoStack.length) return;
    const [snap,...rest] = undoStack;
    const redoSnap = {personal:[...personal],work:[...work],desc:"Redo "+snap.desc};
    setRedoStack(prev=>{const r=[redoSnap,...prev].slice(0,10);saveActivityState(rest,r);return r;});
    setUndoStack(rest);
    setPersonal(snap.personal);
    setWork(snap.work);
    pushActivity("undone","Undo: "+snap.desc,"personal");
    try{await window.storage.set(pk(P_KEY),JSON.stringify(snap.personal));await window.storage.set(pk(W_KEY),JSON.stringify(snap.work));}catch{}
  };

  const handleRedo = async () => {
    if(!redoStack.length) return;
    const [snap,...rest] = redoStack;
    const undoSnap = {personal:[...personal],work:[...work],desc:"Undo "+snap.desc};
    setUndoStack(prev=>{const u=[undoSnap,...prev].slice(0,10);saveActivityState(u,rest);return u;});
    setRedoStack(rest);
    setPersonal(snap.personal);
    setWork(snap.work);
    pushActivity("edit","Redo: "+snap.desc,"personal");
    try{await window.storage.set(pk(P_KEY),JSON.stringify(snap.personal));await window.storage.set(pk(W_KEY),JSON.stringify(snap.work));}catch{}
  };

  // ── Config save — includes AI + Cloud keys ───────────────────────────────
  const handleSaveConfig = async (newCfg) => {
    const merged = {...DEFAULT_CONFIG, ...newCfg};
    setConfig(merged);
    setFontSize(merged.fontSize||14);
    if (merged.lang) setLang(merged.lang);
    try{await window.storage.set(pk(CONFIG_KEY),JSON.stringify(merged));}catch{}
    pushActivity("config","Configuration changed","config",
      `Theme: ${THEMES[merged.themeId]?.name||merged.themeId} · Font: ${merged.fontSize}px · Lang: ${merged.lang||"EN"}${merged.anthropicKey?" · AI: ✅":""}${merged.googleApiKey?" · Drive: ✅":""}${merged.msAppId?" · OneDrive: ✅":""}`);
  };

  // N36: patch a few config keys (used by in-page Calendar font settings)
  const patchConfig = async (patch) => {
    const merged = {...DEFAULT_CONFIG, ...config, ...patch};
    setConfig(merged);
    try{await window.storage.set(pk(CONFIG_KEY),JSON.stringify(merged));}catch{}
  };

  const saveCustomTabs = async (tabs) => {
    setCustomTabs(tabs);
    setDataLastUpdated(new Date().toISOString());   // N106
    try { await window.storage.set(pk(CUSTOM_TABS_KEY), JSON.stringify(tabs)); } catch {}
  };

  const handleSaveCustomTab = (cfg) => {
    const existing = customTabs.find(t=>t.id===cfg.id);
    const next = existing ? customTabs.map(t=>t.id===cfg.id?cfg:t) : [...customTabs,cfg];
    saveCustomTabs(next);
    setShowAddTab(false);
    setEditingTab(null);
    setTab(cfg.id);
  };

  const handleDeleteTab = (id) => {
    saveCustomTabs(customTabs.filter(t=>t.id!==id));
    setTab("milestones");   // N79: fall back to the Timeline, not Overview
  };

  const handleImport = async ({ personal: p, work: w, customTabs: ct, events: ev, notes: nt }) => {
    setPersonal(p); setWork(w);
    setDataLastUpdated(new Date().toISOString());
    if (Array.isArray(ct) && ct.length > 0) {
      setCustomTabs(ct);
      try { await window.storage.set(pk(CUSTOM_TABS_KEY), JSON.stringify(ct)); } catch {}
    }
    if (Array.isArray(ev)) {
      setEvents(ev);
      try { await window.storage.set(pk(EVENTS_KEY), JSON.stringify(ev)); } catch {}
    }
    if (Array.isArray(nt)) {
      setNotes(nt);
      try { await window.storage.set(pk(NOTES_KEY), JSON.stringify(nt)); } catch {}
    }
    try { await window.storage.set(pk(P_KEY), JSON.stringify(p)); await window.storage.set(pk(W_KEY), JSON.stringify(w)); } catch {}
    pushActivity("edit","Imported full backup","personal","All data restored");
  };

  // Q3: CSV import — APPEND new tasks to existing data (does not replace)
  // N24: persist events
  const saveEvents = async (list) => {
    setEvents(list);
    setDataLastUpdated(new Date().toISOString());   // N106: mark local as newer
    try{await window.storage.set(pk(EVENTS_KEY), JSON.stringify(list));}catch{}
  };
  // N35: persist event types + calendar views
  const saveEventTypes = async (list) => {
    setEventTypes(list);
    setDataLastUpdated(new Date().toISOString());   // N106
    try{await window.storage.set(pk(EVENT_TYPES_KEY), JSON.stringify(list));}catch{}
  };
  const saveCalViews = async (list) => {
    setCalViews(list);
    setDataLastUpdated(new Date().toISOString());   // N106
    try{await window.storage.set(pk(CAL_VIEWS_KEY), JSON.stringify(list));}catch{}
  };
  // N26: persist notes
  const saveNotes = async (list) => {
    setNotes(list);
    setDataLastUpdated(new Date().toISOString());   // N106: this was the notes-vanish bug
    try{await window.storage.set(pk(NOTES_KEY), JSON.stringify(list));}catch{}
  };

  // A1: check backup age on load — nudge if past the configured interval
  useEffect(()=>{
    if (!loaded) return;
    try{
      const weeks = Math.max(1, Math.min(16, Number(config.backupReminderWeeks)||1));
      const last = localStorage.getItem("lifeplanner-last-backup");
      const days = last ? (Date.now()-Number(last))/86400000 : 999;
      if (days >= weeks*7) setShowBackupNudge(true);
      else setShowBackupNudge(false);
    }catch{}
  }, [loaded, config.backupReminderWeeks]);
  // B3: create a task from a natural-language line, into personal or work
  const quickAddToList = (which) => {
    const parsed = parseQuickTask(quickAddText);
    if (!parsed || !parsed.title.trim()) return;
    const base = {
      id: newId(),
      title: parsed.title,
      description: "",
      cat: which==="work" ? "Other" : "Home",
      due: parsed.due || "",
      startDate: "",
      recur: parsed.recur || "",
      isRecurring: parsed.isRecurring,
      status: which==="work" ? "todo" : "pending",
      priority: "Medium",
      location:"", attachments:[], pinned:false, milestone:false, milestoneAt:"",
    };
    if (which==="work") {
      const next=[...work, base]; setWork(next);
      try{ window.storage.set(pk(W_KEY), JSON.stringify(next)); }catch{}
    } else {
      const next=[...personal, base]; setPersonal(next);
      try{ window.storage.set(pk(P_KEY), JSON.stringify(next)); }catch{}
    }
    setDataLastUpdated(new Date().toISOString());
    pushActivity("create", `Added: ${parsed.title}`, which, parsed.recur?`recurring: ${parsed.recur}`:"quick add");
    showToast&&showToast(`\u2705 Added "${parsed.title}"${parsed.recur?" ("+parsed.recur+")":""}`);
    setQuickAddText(""); setShowFAB(false);
  };

  // A2: one-click backup — downloads a dated .json and records the time
  const doBackupNow = () => {
    try{
      const payload = buildSavePayload();
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      downloadJSON(payload, `My-Todo-Planner-Backup-${stamp}.json`);
      localStorage.setItem("lifeplanner-last-backup", String(Date.now()));
      setShowBackupNudge(false);
      showToast&&showToast("\u2705 Backup downloaded \u2014 save it to Google Drive / OneDrive");
    }catch(e){}
  };

  // N33: @mention index — all linkable items (tasks, notes, events) by name
  const mentionIndex = useMemo(()=>{
    const items = [];
    personal.forEach(t=>items.push({ type:"task", id:t.id, label:t.title, icon:"🏠", _type:"personal" }));
    work.forEach(t=>items.push({ type:"task", id:t.id, label:t.title, icon:"💼", _type:"work" }));
    notes.forEach(n=>items.push({ type:"note", id:n.id, label:n.title, icon:"📝" }));
    events.forEach(e=>items.push({ type:"event", id:e.id, label:e.title, icon:"📅" }));
    return items.filter(i=>i.label && i.label.trim());
  },[personal,work,notes,events]);

  // N33: navigate to a mentioned item (open its modal / switch to its tab)
  const navigateMention = (type, id) => {
    const sid = String(id);
    if (type==="task") {
      const t = personal.find(x=>String(x.id)===sid) || work.find(x=>String(x.id)===sid);
      if (t) { const inWork = work.some(w=>String(w.id)===sid); setTab(inWork?"work":"personal"); setMentionTarget({type:"task", item:t, _k:Date.now()}); }
    } else if (type==="note") {
      setTab("notes"); setMentionTarget({type:"note", id:sid, _k:Date.now()});
    } else if (type==="event") {
      setTab("calendar"); setMentionTarget({type:"event", id:sid, _k:Date.now()});
    }
  };

  // N33: expose mention index + navigation globally so contentEditable links and
  // task descriptions can trigger navigation via a document click handler.
  // NOTE: these effects MUST be declared AFTER mentionIndex/navigateMention above
  // (const has a temporal dead zone — referencing them earlier crashes the render).
  useEffect(()=>{
    window.__mentionIndex = mentionIndex;
    window.__navigateMention = navigateMention;
  }, [mentionIndex]);
  useEffect(()=>{
    const onClick = (e)=>{
      const a = e.target.closest && e.target.closest("[data-mention-type]");
      if (a) {
        e.preventDefault(); e.stopPropagation();
        const nav = window.__navigateMention || navigateMention;
        nav(a.getAttribute("data-mention-type"), a.getAttribute("data-mention-id"));
      }
    };
    document.addEventListener("click", onClick, true);
    return ()=>document.removeEventListener("click", onClick, true);
  }, []);

  const handleImportAppend = async ({ personal: p, work: w }) => {
    const newP = [...personal, ...(p||[])];
    const newW = [...work, ...(w||[])];
    setPersonal(newP); setWork(newW);
    setDataLastUpdated(new Date().toISOString());
    try { await window.storage.set(pk(P_KEY), JSON.stringify(newP)); await window.storage.set(pk(W_KEY), JSON.stringify(newW)); } catch {}
    pushActivity("add",`Imported ${(p||[]).length+(w||[]).length} tasks from CSV`,"personal",`🏠 ${(p||[]).length} · 💼 ${(w||[]).length}`);
  };

  if(!loaded && activeProfileId) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:THEMES.claude.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:12}}>📅</div>
        <div style={{color:THEMES.claude.accent,fontSize:16,fontWeight:700}}>My Todo Planner</div>
        <div style={{color:THEMES.claude.textMuted,fontSize:12,marginTop:6}}>Loading your data…</div>
      </div>
    </div>
  );

  // ── No profile yet → show onboarding ─────────────────────────────────────
  if (!activeProfileId || profileList.length===0) {
    return (
      <>
        <input ref={openFileRef} type="file" accept=".json,application/json" style={{display:"none"}} onChange={handleOpenFile}/>
        <OnboardingScreen
          onCreateProfile={handleCreateFirstProfile}
          onOpenFile={handleOpenFilePicker}
          onOpenDrive={async()=>{ const ok=await gsyncConnect(); if(ok){ setGsyncPanel(true); setGsyncPanelMin(false); } }}
          isIOS={isIOSDevice}
          openFileRef={openFileRef}
        />
      </>
    );
  }

  const todayOverdueCount = personal.filter(t=>t.status==="overdue").length +
    work.filter(t=>t.status==="overdue").length +
    personal.filter(t=>t.due===fmtLocal(TODAY)&&t.status!=="done").length +
    work.filter(t=>t.due===fmtLocal(TODAY)&&t.status!=="done").length;

  const milestoneCount = personal.filter(t=>t.status==="done"&&t.milestone!==false&&t.milestoneAt).length +
    work.filter(t=>t.status==="done"&&t.milestone!==false&&t.milestoneAt).length;

  const FIXED_TABS = [
    { id:"timeline",  label:t.overview },
    { id:"today",     label:"🔥 "+t.today, count:todayOverdueCount, countColor:"#ef4444" },
    { id:"calendar",  label:t.calendar },
    { id:"list",      label:"🗃️ "+(lang==="TH"?"รายการทั้งหมด":"List"), count:personal.length+work.length+events.length, countColor:"#6366f1" },
    { id:"gantt",     label:t.gantt },
    { id:"milestones",label:"📈 "+(lang==="TH"?"ไทม์ไลน์":"Timeline"), count:milestoneCount, countColor:"#f59e0b" },
    { id:"donelist",  label:"✅ "+(lang==="TH"?"เสร็จแล้ว":"Done"), count:personal.filter(t=>t.status==="done").length+work.filter(t=>t.status==="done").length, countColor:"#22c55e" },
    { id:"stats",     label:"📊 "+(lang==="TH"?"สถิติ":"Stats") },
    { id:"notes",     label:"📝 "+(lang==="TH"?"โน้ต":"Notes") },
    { id:"personal",  label:t.personal, count:personal.filter(x=>x.status!=="done").length },
    { id:"work",      label:t.work,     count:work.filter(x=>x.status!=="done").length },
    { id:"activity",  label:t.activity },
    { id:"config",    label:t.config },
    { id:"about",     label:t.about },
  ];

  // Q6: Notification-badge tabs (read/acknowledge). Personal + Work keep plain live counts.
  const NOTIF_TABS = ["today","milestones","donelist","calendar","gantt","activity"];
  // For notif tabs, badge = items NEW since last read (count - lastReadCount), min 0.
  // Entering the tab marks it read (lastReadCount = current count → badge clears).
  const tabBadge = (tb) => {
    if (tb.count==null) return null;
    if (!NOTIF_TABS.includes(tb.id)) return tb.count>0 ? tb.count : null; // personal/work: plain count
    const lastRead = tabReads[tb.id] ?? 0;
    const unread = Math.max(0, tb.count - lastRead);
    return unread>0 ? unread : null;
  };
  const ALL_TABS_RAW = [
    ...FIXED_TABS,
    ...customTabs.map(ct=>({id:ct.id, label:`${ct.emoji} ${ct.label}`, custom:true, cfg:ct})),
  ];
  // N9: reorder tabs per saved tabOrder (unknown/new tabs appended in default order)
  const ALL_TABS = (()=>{
    if (!tabOrder.length) return ALL_TABS_RAW;
    const byId = Object.fromEntries(ALL_TABS_RAW.map(t=>[t.id,t]));
    const ordered = tabOrder.map(id=>byId[id]).filter(Boolean);
    const rest = ALL_TABS_RAW.filter(t=>!tabOrder.includes(t.id));
    return [...ordered, ...rest];
  })();
  // N9: persist a new order after drag-drop
  const reorderTabs = (fromId, toId) => {
    if (fromId===toId) return;
    const ids = ALL_TABS.map(t=>t.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from<0||to<0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setTabOrder(ids);
    window.storage.set(pk(TABORDER_KEY), JSON.stringify(ids)).catch(()=>{});
  };
  const appVersion = APP_VERSION;


  // N31: scale multiplier — 14px is the baseline; bumps data-field text proportionally
  const fontScale = (fontSize||14) / 14;
  return (
    <div data-fontscale={fontSize} style={{
      minHeight:"100vh", minHeight:"100dvh",
      background:theme.bg, color:theme.text, fontFamily:fontFamily,
      fontSize: isMobile ? Math.max(13,fontSize-1) : isTablet ? Math.max(13,fontSize) : fontSize,
      paddingBottom: isCompact ? 80 : 48,
    }}>
      {/* N31: scale small data-field fonts by the configured font size.
          Targets task list rows, pills, and detail fields so they respect Config font size. */}
      <style>{`
        .lp-scale-data { font-size: ${Math.round(13*fontScale)}px !important; }
        .lp-scale-title { font-size: ${Math.round(14*fontScale)}px !important; }
        .lp-scale-sub { font-size: ${Math.round(11*fontScale)}px !important; }
        ${zenMode ? '.lp-app-chrome{display:none !important;}' : ''}
      `}</style>

      {/* N35 item1: presentation/zen mode — floating show/hide chrome button */}
      <button onClick={()=>setZenMode(z=>!z)}
        title={zenMode?"Show menus & headers":"Hide menus & headers (presentation mode)"}
        style={{position:"fixed",top:zenMode?10:"auto",bottom:zenMode?"auto":88,right:14,zIndex:9999,
          width:40,height:40,borderRadius:"50%",border:"none",cursor:"pointer",
          background:zenMode?"#166534":"var(--c-surface2)",color:zenMode?"#fff":"var(--c-text-muted)",
          boxShadow:"0 4px 16px rgba(0,0,0,.25)",fontSize:16,opacity:zenMode?1:0.55}}>
        {zenMode?"👁":"⛶"}
      </button>

      {/* ── Modals & overlays ── */}
      {/* A1: backup reminder banner */}
      {showBackupNudge && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:300,background:"#f59e0b",
          color:"#3a1f00",padding:"10px 16px",display:"flex",alignItems:"center",gap:12,
          boxShadow:"0 4px 16px rgba(0,0,0,.2)",fontSize:13.5,fontWeight:600}}>
          <span style={{fontSize:17}}>💾</span>
          <span style={{flex:1}}>No backup for {Math.max(1,Math.min(16,Number(config.backupReminderWeeks)||1))} week(s) — export a copy to Drive to avoid losing data</span>
          <button onClick={doBackupNow} style={{background:"#166534",color:"#fff",border:"none",
            borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Back up now</button>
          <button onClick={()=>setShowBackupNudge(false)} style={{background:"transparent",border:"none",
            color:"#3a1f00",fontSize:18,cursor:"pointer",opacity:.6}}>✕</button>
        </div>
      )}
      {/* N52: split-file manager */}
      <input ref={splitInputRef} type="file" accept=".json,application/json" style={{display:"none"}} onChange={handleSplitFile}/>
      {showSplit && (
        <div onClick={e=>e.target===e.currentTarget&&setShowSplit(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:6800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"var(--c-card2)",border:"1px solid var(--c-border)",borderRadius:16,padding:24,width:"100%",maxWidth:560,maxHeight:"90vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,.5)"}}>
            <div style={{fontSize:16,fontWeight:800,color:"var(--c-text)",marginBottom:3}}>🗂 Split data files</div>
            <div style={{fontSize:11.5,color:"var(--c-text-muted)",marginBottom:16,lineHeight:1.6}}>
              Keep Work, Personal and Core data in separate files. Load one, two or all three —
              <strong style={{color:"var(--c-text)"}}> a slot that is not loaded is never written to disk</strong>, so opening one file can never blank out another.
            </div>
            <div style={{display:"grid",gap:10,marginBottom:16}}>
              {[["work","💼 Work","work[] — every work task"],
                ["personal","🏠 Personal","personal[] — every personal task"],
                ["core","⚙️ Core","config · events · event types · calendar views · notes · tabs"]].map(([k,label,desc])=>{
                const on=slots[k];
                return (
                  <div key={k} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:11,
                    background:"var(--c-surface)",border:`1.5px solid ${on?"#22c55e55":"var(--c-border)"}`}}>
                    <span style={{fontSize:14,color:on?"#22c55e":"var(--c-text-muted)"}}>{on?"🟢":"⚪"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:800,color:"var(--c-text)"}}>{label}</div>
                      <div style={{fontSize:10.5,color:"var(--c-text-muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {on ? `Loaded from ${slotFiles[k]||"file"}` : desc}
                      </div>
                    </div>
                    <button onClick={()=>openSplitPicker(k)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--c-border)",
                      background:"var(--c-surface2)",color:"var(--c-text)",fontSize:11.5,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>📂 Load</button>
                    <button onClick={()=>saveSplit(k)} style={{padding:"6px 12px",borderRadius:8,border:"none",
                      background:"#166534",color:"#fff",fontSize:11.5,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>💾 Save</button>
                  </div>
                );
              })}
            </div>
            {splitMsg && (
              <div style={{fontSize:11.5,fontWeight:700,padding:"9px 12px",borderRadius:9,marginBottom:14,lineHeight:1.5,
                background:splitMsg.startsWith("✅")?"#16653418":splitMsg.startsWith("⚠️")?"#f59e0b18":"#ef444418",
                color:splitMsg.startsWith("✅")?"#166534":splitMsg.startsWith("⚠️")?"#b45309":"#ef4444",
                border:`1px solid ${splitMsg.startsWith("✅")?"#16653444":splitMsg.startsWith("⚠️")?"#f59e0b44":"#ef444444"}`}}>{splitMsg}</div>
            )}
            <div style={{background:"var(--c-surface)",border:"1px solid var(--c-border)",borderRadius:9,padding:"10px 13px",fontSize:10.5,color:"var(--c-text-muted)",lineHeight:1.65,marginBottom:16}}>
              💡 <strong style={{color:"var(--c-text)"}}>Save All</strong> writes only the slots showing 🟢. Unloaded slots are skipped, never emptied.<br/>
              🔗 @mention links pointing at an unloaded file stay intact — they are never removed.<br/>
              ⚠️ A Work file cannot be loaded into the Personal slot; the app checks the file kind first.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setShowSplit(false);setSplitMsg("");}} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"transparent",color:"var(--c-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer"}}>Close</button>
              <button onClick={saveCombined} style={{flex:1.2,padding:"11px 0",borderRadius:10,border:"1px solid var(--c-border)",background:"var(--c-surface2)",color:"var(--c-text)",fontSize:13,fontWeight:800,cursor:"pointer"}}>📦 Save combined</button>
              <button onClick={saveAllSplit} style={{flex:1.2,padding:"11px 0",borderRadius:10,border:"none",background:"#166534",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>💾 Save all loaded</button>
            </div>
          </div>
        </div>
      )}

      {showDataModal&&<DataModal personal={personal} work={work} customTabs={customTabs} onImport={handleImport} onImportAppend={handleImportAppend} onClose={()=>setShowDataModal(false)}/>}

      {/* N30/N32: Floating quick-note panel + launcher */}
      {floatNoteId && <FloatingNote notes={notes} setNotes={saveNotes} pinned={floatPin} onTogglePin={()=>setFloatPin(p=>!p)} onClose={()=>setFloatNoteId(null)} noteId={floatNoteId} lang={lang}/>}
      {!floatNoteId && (
        <button onClick={()=>{
            // N32: create a fresh note titled with today's date (dd/mmm/yyyy)
            const d=new Date();
            const title=`${String(d.getDate()).padStart(2,"0")}/${d.toLocaleDateString("en-GB",{month:"short"})}/${d.getFullYear()}`;
            const id=newId();
            const newNote={ id, title, emoji:"📌", html:"", updatedAt:new Date().toISOString() };
            saveNotes([newNote, ...notes]);
            setFloatNoteId(id);
          }} title="New floating quick note (dated)"
          style={{position:"fixed",right:20,bottom:84,zIndex:150,width:48,height:48,borderRadius:"50%",
            border:"none",background:"#6366f1",color:"#fff",fontSize:20,cursor:"pointer",
            boxShadow:"0 6px 20px rgba(99,102,241,.5)"}}>📌</button>
      )}
      {showAddTab&&<AddTabModal personal={personal} work={work} onSave={handleSaveCustomTab} onClose={()=>setShowAddTab(false)}/>}
      {editingTab&&<AddTabModal personal={personal} work={work} existing={editingTab} onSave={handleSaveCustomTab} onClose={()=>setEditingTab(null)}/>}
      {showSearch&&<GlobalSearch personal={personal} work={work} notes={notes} events={events} lang={lang} onClose={()=>setShowSearch(false)}
        onNavigate={(type,id)=>{ setShowSearch(false); navigateMention(type,id); }}
        onSaveTask={updated=>{
          if (updated._type==="work") {
            const next = work.map(t=>t.id===updated.id?updated:t);
            setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{});
          } else {
            const next = personal.map(t=>t.id===updated.id?updated:t);
            setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{});
          }
          setDataLastUpdated(new Date().toISOString());
        }}
        onDuplicateTask={t=>{
          const copy = duplicateTask(t);
          if (copy._type==="work") { const next=[...work,copy]; setWork(next); window.storage.set(pkG(W_KEY),JSON.stringify(next)).catch(()=>{}); }
          else { const next=[...personal,copy]; setPersonal(next); window.storage.set(pkG(P_KEY),JSON.stringify(next)).catch(()=>{}); }
        }}/>}
      {showNotifs&&<NotificationPanel personal={personal} work={work} onClose={()=>setShowNotifs(false)}/>}
      {showCloudSync&&<CloudSyncModal onClose={()=>setShowCloudSync(false)} openFileRef={openFileRef}
        gsync={gsync} gsyncStatus={gsyncStatus} gsyncError={gsyncError} gsyncSignedIn={gsyncSignedIn||GDrive.isSignedIn()}
        onConnect={gsyncConnect} onDisconnect={gsyncDisconnect} onPushNow={()=>gsyncPush({})} onPullNow={()=>gsyncPull({})}
        onLinkFile={async(fileId,fileName)=>{ await persistGsync({...gsync,fileId,fileName}); }}
        listFiles={()=>GDrive.listFiles()} />}
      {gsyncPanel && <SyncPanel
        gsync={gsync} gsyncStatus={gsyncStatus} gsyncError={gsyncError}
        gsyncSignedIn={gsyncSignedIn||GDrive.isSignedIn()} gsyncAuto={gsyncAuto}
        onConnect={gsyncConnect} onDisconnect={()=>{gsyncDisconnect();setGsyncPanel(true);}}
        onSyncNow={gsyncNow}
        onSetAuto={setGsyncAutoPersist} onRename={gsyncRename} onRelink={gsyncRelink} onUnlink={gsyncUnlink} onOpenFolder={gsyncOpenFolder}
        listFiles={()=>GDrive.listFiles()}
        minimized={gsyncPanelMin} onToggleMin={()=>setGsyncPanelMin(m=>!m)}
        onClose={()=>setGsyncPanel(false)} />}
      {importConflict && <ImportDirectionDialog
        fileName={importConflict.fileName}
        localPayload={importConflict.parsed}
        cloudPayload={importConflict.cloud.payload}
        cloudModified={importConflict.cloud.modifiedTime}
        onUseLocal={importUseLocal}
        onUseCloud={importUseCloud}
        onCancel={()=>setImportConflict(null)} />}
      {gsyncConflict && <DirectionDialog
        title="⚠️ Both copies changed"
        intro="This device and Google Drive were both edited since the last sync, so one of them has to win. Nothing has been changed yet."
        localName="this device"            localPayload={gsyncConflict.localPayload} localStamp={gsyncConflict.localStamp}
        cloudName={gsyncConflict.cloudName} cloudPayload={gsyncConflict.cloudPayload} cloudStamp={gsyncConflict.cloudModified}
        localAction="Save to Cloud"          localHint="Keeps what is on this device and overwrites Drive"
        cloudAction="Load the Drive copy"    cloudHint="Keeps what is on Drive and replaces this device"
        onUseLocal={gsyncAcceptLocal} onUseCloud={gsyncAcceptCloud}
        onCancel={()=>setGsyncConflict(null)}/>}
      {showProfileSwitcher&&<ProfileSwitcher currentProfileId={activeProfileId} onSwitch={switchProfile} onClose={()=>setShowProfileSwitcher(false)} profiles={profileList} onSaveProfiles={handleSaveProfiles}/>}
      {showSaveConfirm&&pendingSaveData&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:6000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:14,padding:"24px 28px",maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.6)"}}>
            <div style={{fontSize:18,marginBottom:8}}>💾</div>
            <div style={{fontSize:15,fontWeight:800,color:theme.text,marginBottom:6}}>Save changes?</div>
            <div style={{fontSize:13,color:theme.textMuted,marginBottom:20,lineHeight:1.6}}>
              Overwrite <strong style={{color:theme.text}}>{pendingSaveData.fname}</strong>?<br/>
              <span style={{fontSize:11}}>Saves all tasks, config and attachments.</span>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowSaveConfirm(false);setPendingSaveData(null);}} style={{padding:"9px 22px",borderRadius:8,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,fontSize:13,fontWeight:700,cursor:"pointer",minHeight:44}}>No</button>
              <button onClick={()=>{doSaveCore(pendingSaveData.payload,pendingSaveData.fname);setShowSaveConfirm(false);setPendingSaveData(null);}} style={{padding:"9px 28px",borderRadius:8,border:"none",background:theme.accent,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",minHeight:44}}>Yes, Save</button>
            </div>
          </div>
        </div>
      )}
      <input ref={openFileRef} type="file" accept=".json,application/json" style={{display:"none"}} onChange={handleOpenFile}/>

      {/* ── Phase 2: Toast Notification ─────────────────────────────────────── */}
      {toast&&(
        <div style={{
          position:"fixed",bottom:isCompact?80:24,left:"50%",transform:"translateX(-50%)",
          zIndex:9000,background:toast.type==="error"?"#dc2626":"#166534",
          color:"#fff",padding:"10px 20px",borderRadius:99,fontSize:13,fontWeight:700,
          boxShadow:"0 4px 20px rgba(0,0,0,.25)",whiteSpace:"nowrap",
          pointerEvents:"none",display:"flex",alignItems:"center",gap:8,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Phase 2: FAB Quick Add Button ───────────────────────────────────── */}
      {!showFAB&&!showSearch&&(
        <button
          onClick={()=>setShowFAB(true)}
          title="Quick Add Task (＋)"
          style={{
            position:"fixed",
            bottom:isCompact?76:24,right:isCompact?16:28,
            zIndex:4000,width:54,height:54,borderRadius:"50%",
            background:theme.accent,color:"#fff",
            border:"none",fontSize:26,fontWeight:700,
            boxShadow:`0 4px 20px ${theme.accent}66`,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            transition:"transform .15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
        >＋</button>
      )}

      {/* ── Phase 2: FAB Personal/Work Chooser ──────────────────────────────── */}
      {showFAB&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:4500,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={e=>e.target===e.currentTarget&&setShowFAB(false)}>
          <div style={{background:theme.surface,border:`1px solid ${theme.border}`,
            borderRadius:16,padding:24,maxWidth:300,width:"100%",
            boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:13,fontWeight:800,color:theme.text,marginBottom:4}}>＋ Quick Add Task</div>
            <div style={{fontSize:11,color:theme.textMuted,marginBottom:12}}>Type one line, e.g. "pay electricity bill every month on the 5th"</div>
            {/* B3: natural-language quick add */}
            <input value={quickAddText} onChange={e=>setQuickAddText(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&quickAddText.trim()) quickAddToList("personal"); }}
              placeholder='Task + date / recurrence…'
              autoFocus
              style={{width:"100%",padding:"11px 12px",borderRadius:10,border:`1.5px solid ${theme.border}`,
                background:theme.bg,color:theme.text,fontSize:14,outline:"none",marginBottom:6}}/>
            {quickAddText.trim() && (()=>{ const p=parseQuickTask(quickAddText); return p ? (
              <div style={{fontSize:11,color:theme.textMuted,marginBottom:12,padding:"6px 10px",background:theme.bg,borderRadius:8,lineHeight:1.5}}>
                📋 <b style={{color:theme.text}}>{p.title}</b>
                {p.due&&<span> · 📅 {p.due}</span>}
                {p.recur&&<span> · 🔁 {p.recur}</span>}
              </div>
            ) : null; })()}
            {quickAddText.trim() ? (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:10,color:theme.textMuted,fontWeight:700}}>Add to:</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>quickAddToList("personal")}
                    style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid #34d39955",background:"#34d39915",color:"#065f46",fontWeight:800,fontSize:13,cursor:"pointer"}}>🏠 Personal</button>
                  <button onClick={()=>quickAddToList("work")}
                    style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4338ca",fontWeight:800,fontSize:13,cursor:"pointer"}}>💼 Work</button>
                </div>
                <button onClick={()=>{setQuickAddText("");setShowFAB(false);}}
                  style={{padding:"9px 0",borderRadius:10,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancel</button>
              </div>
            ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:10,color:theme.textMuted,fontWeight:700,textAlign:"center",margin:"2px 0"}}>— or open the full form —</div>
              <button onClick={()=>{setShowFAB(false);setTab("personal");setTimeout(()=>document.querySelector("[data-fab-personal]")?.click(),120);}}
                style={{padding:"13px 0",borderRadius:10,border:"1.5px solid #34d39955",background:"#34d39915",color:"#065f46",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                🏠 Personal Task
              </button>
              <button onClick={()=>{setShowFAB(false);setTab("work");setTimeout(()=>document.querySelector("[data-fab-work]")?.click(),120);}}
                style={{padding:"13px 0",borderRadius:10,border:"1.5px solid #818cf855",background:"#818cf815",color:"#4338ca",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                💼 Work Task
              </button>
              <button onClick={()=>setShowFAB(false)}
                style={{padding:"10px 0",borderRadius:10,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:4}}>
                Cancel
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* ── localStorage Warning Banner (R1) ── */}
      {showStorageWarning&&(
        <div style={{background:"#92400e",color:"#fef3c7",padding:"10px 16px",
          display:"flex",alignItems:"center",gap:10,fontSize:12,fontWeight:600,
          position:"sticky",top:0,zIndex:500,flexWrap:"wrap"}}>
          <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
          <span style={{flex:1,minWidth:200}}>
            {navigator.language?.startsWith("th")
              ? "ข้อมูลเก็บในเบราว์เซอร์เท่านั้น — กด 💾 Save เพื่อบันทึกไฟล์ไว้ป้องกันข้อมูลสูญหาย"
              : "Data is stored in browser only — click 💾 Save to back up your file and prevent data loss"}
          </span>
          <button onClick={handleSave}
            style={{padding:"5px 14px",borderRadius:7,border:"none",background:"#d97706",
              color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
            💾 Save Now
          </button>
          <button onClick={dismissBanner}
            style={{background:"transparent",border:"none",color:"#fef3c7",cursor:"pointer",
              fontSize:18,lineHeight:1,flexShrink:0,opacity:0.8}}>×</button>
        </div>
      )}

      {/* ── Offline Banner (R5) ── */}
      {!isOnline&&(
        <div style={{background:"var(--c-surface)",color:"var(--c-text-muted)",padding:"6px 16px",
          textAlign:"center",fontSize:11,fontWeight:600}}>
          🔴 Offline — all data saved locally, no internet required
        </div>
      )}
      {isCompact ? (
        <div>
          {/* Top bar */}
          <div className="lp-app-chrome" style={{
            position:"sticky", top:0, zIndex:200,
            background:theme.bg, borderBottom:`1px solid ${theme.border}`,
            padding: isTablet ? "11px 20px" : "10px 14px",
            display:"flex", alignItems:"center", gap:10,
          }}>
            {/* Profile avatar */}
            <button onClick={()=>setShowProfileSwitcher(true)}
              style={{display:"flex",alignItems:"center",gap:8,background:"transparent",border:"none",cursor:"pointer",padding:0,flexShrink:0,touchAction:"manipulation"}}>
              <span style={{fontSize: isTablet?26:22}}>{activeProfile?.emoji||"👤"}</span>
              {isTablet&&<div style={{textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:800,color:theme.text,lineHeight:1}}>{activeProfile?.name||""}</div>
                <div style={{fontSize:10,color:theme.textMuted,lineHeight:1.2}}>W{todayWeekNum}</div>
              </div>}
            </button>

            {/* App name + date — hide on small phone, show on tablet */}
            {!isMobile&&<div style={{fontSize:13,fontWeight:700,color:theme.text}}>My Todo Planner</div>}
            {isMobile&&<div style={{flex:1,minWidth:0,textAlign:"center"}}>
              <div style={{fontSize:12,fontWeight:800,color:theme.text,lineHeight:1}}>My Todo Planner</div>
              <div style={{fontSize:10,color:theme.textMuted,lineHeight:1.3}}>
                W{todayWeekNum} · {TODAY.toLocaleDateString(lang==="TH"?"th-TH":"en-GB",{day:"numeric",month:"short"})}
                {lang==="TH"?` ${toThaiYear(TODAY.getFullYear())}` : ""}
              </div>
            </div>}

            {isTablet&&<div style={{flex:1}}>
              <div style={{fontSize:11,color:theme.textMuted}}>
                W{todayWeekNum} · {lang==="TH"
                  ? `${TODAY.toLocaleDateString("th-TH",{weekday:"short",day:"numeric",month:"long"})} ${toThaiYear(TODAY.getFullYear())}`
                  : TODAY.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long",year:"numeric"})}
              </div>
            </div>}

            {/* Unsaved dot */}
            {saveStatus==="unsaved"&&<div style={{width:8,height:8,borderRadius:"50%",background:"#f59e0b",flexShrink:0}}/>}

            {/* Search (tablet only in header) */}
            {isTablet&&<button onClick={()=>setShowSearch(true)}
              style={{width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:10,cursor:"pointer",fontSize:18,flexShrink:0,touchAction:"manipulation"}}>
              🔍
            </button>}

            {/* Notification bell */}
            {(()=>{
              const nr=new Set();try{JSON.parse(localStorage.getItem(NOTIF_KEY)||"[]").forEach(id=>nr.add(id));}catch{}
              const nc=buildNotifications(personal,work).filter(n=>!nr.has(n.id)).length;
              return(
                <button onClick={()=>setShowNotifs(v=>!v)}
                  style={{position:"relative",width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",cursor:"pointer",fontSize:20,flexShrink:0,touchAction:"manipulation"}}>
                  🔔{nc>0&&<span style={{position:"absolute",top:2,right:2,fontSize:9,fontWeight:800,background:"#ef4444",color:"#fff",borderRadius:99,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{nc>9?"9+":nc}</span>}
                </button>
              );
            })()}

            {/* Hamburger */}
            <button onClick={()=>setMobileMenuOpen(v=>!v)}
              style={{width:40,height:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,background:"transparent",border:"none",cursor:"pointer",flexShrink:0,padding:0,touchAction:"manipulation"}}>
              <div style={{width:22,height:2.5,background:mobileMenuOpen?theme.accent:theme.textMuted,borderRadius:2,transition:"all .2s",transform:mobileMenuOpen?"rotate(45deg) translate(5.5px,5.5px)":"none"}}/>
              <div style={{width:22,height:2.5,background:mobileMenuOpen?theme.accent:theme.textMuted,borderRadius:2,transition:"all .2s",opacity:mobileMenuOpen?0:1}}/>
              <div style={{width:22,height:2.5,background:mobileMenuOpen?theme.accent:theme.textMuted,borderRadius:2,transition:"all .2s",transform:mobileMenuOpen?"rotate(-45deg) translate(5.5px,-5.5px)":"none"}}/>
            </button>
          </div>

          {/* Slide-down menu */}
          {mobileMenuOpen&&(
            <div style={{background:theme.surface,borderBottom:`1px solid ${theme.border}`,zIndex:199,
              display: isTablet ? "grid" : "block",
              gridTemplateColumns: isTablet ? "1fr 1fr" : undefined,
            }}>
              {[
                {icon:"🔍", label:"Search",              fn:()=>{setShowSearch(true);setMobileMenuOpen(false);}},
                {icon:"📂", label:"Open Local File",                fn:()=>{handleOpenFilePicker();setMobileMenuOpen(false);}},
                {icon:"💾", label:"Save  ⌘S",            fn:()=>{handleSave();setMobileMenuOpen(false);}},
                {icon:"📦", label:"Backup to Local Drive",              fn:()=>{handleBackup();setMobileMenuOpen(false);}},
                {icon:"☁️", label:"Sync Manager",     fn:()=>{setGsyncPanel(true);setGsyncPanelMin(false);setMobileMenuOpen(false);}},
                {icon:"🎨", label:"Theme & Settings",     fn:()=>{setTab("config");setMobileMenuOpen(false);}},
                {icon:lang==="EN"?"🇹🇭":"🇬🇧", label:lang==="EN"?"Thai Language":"English", fn:()=>{toggleLang();setMobileMenuOpen(false);}},
                {icon:"🗂", label:"Split files…",          fn:()=>{setShowSplit(true);setMobileMenuOpen(false);}},
                {icon:"⋯", label:"More export options",   fn:()=>{setShowDataModal(true);setMobileMenuOpen(false);}},
                {icon:"🕐", label:"Activity",             fn:()=>{setTab("activity");setMobileMenuOpen(false);}},
                {icon:"ℹ️", label:"About",                fn:()=>{setTab("about");setMobileMenuOpen(false);}},
              ].map(({icon,label,fn})=>(
                <button key={label} onClick={fn}
                  style={{width:"100%",textAlign:"left",padding:isTablet?"13px 20px":"12px 20px",
                    background:"transparent",border:"none",color:theme.text,
                    fontSize: isTablet?15:14,cursor:"pointer",display:"flex",alignItems:"center",
                    gap:14,fontWeight:600,minHeight:isTablet?52:48,borderBottom:`1px solid ${theme.border}22`,
                    touchAction:"manipulation"}}
                  onTouchStart={e=>e.currentTarget.style.background=theme.surface2}
                  onTouchEnd={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{fontSize:isTablet?20:18,width:isTablet?28:24,flexShrink:0}}>{icon}</span>{label}
                </button>
              ))}
            </div>
          )}

          {/* Horizontal secondary tab scroll (Activity, Config, custom tabs) */}
          <div style={{padding:isTablet?"6px 16px 0":"6px 10px 0",display:"flex",alignItems:"center",gap:6,overflowX:"auto",borderBottom:`1px solid ${theme.border}`}}>
            {ALL_TABS.filter(tb=>!BOTTOM_NAV.find(b=>b.id===tb.id)).map(tb=>{
              const isAct=tab===tb.id;
              return(
                <button key={tb.id} onClick={()=>{setTab(tb.id);setMobileMenuOpen(false);}}
                  style={{flexShrink:0,padding: isTablet?"7px 16px":"6px 12px",borderRadius:20,
                    border:`1px solid ${isAct?theme.accent:theme.border}`,
                    background:isAct?theme.accent+"22":theme.surface,
                    color:isAct?theme.accentText:theme.textMuted,
                    fontSize: isTablet?12:11,fontWeight:isAct?800:600,
                    cursor:"pointer",whiteSpace:"nowrap",minHeight:isTablet?36:30,
                    touchAction:"manipulation"}}>
                  {tb.label}
                  {(()=>{const b=tabBadge(tb);return b!=null&&<span style={{marginLeft:4,fontSize:9,fontWeight:800,background:isAct?theme.accent:tb.countColor||"var(--c-border)",color:"#fff",borderRadius:99,padding:"0 5px"}}>{b}</span>;})()}
                </button>
              );
            })}
          </div>
        </div>

      ) : (
      /* ════════════════════════════════════════════════════════
          DESKTOP HEADER — ≥ 1024px
          ════════════════════════════════════════════════════════ */
        <div style={{padding:"14px 24px 0",borderBottom:`1px solid ${theme.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {/* N51: discreet header — a small faint wordmark so the app is
                    not obvious to onlookers when opened in a public place. */}
                <span aria-hidden="true" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
                  width:20,height:20,borderRadius:6,background:"#16653422",color:"#166534",fontSize:12,flexShrink:0}}>✓</span>
                <h1 style={{margin:0,fontSize:"0.72em",fontWeight:400,color:theme.textMuted,opacity:0.42,
                  letterSpacing:"0.02em",textTransform:"lowercase"}}>my todo planner</h1>
                <span style={{fontSize:"0.55em",fontWeight:600,opacity:0.35,padding:"2px 8px",borderRadius:20,background:theme.accent+"14",color:theme.accentText,border:`1px solid ${theme.accent}44`}}>v{APP_VERSION}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3,flexWrap:"wrap"}}>
                <span style={{fontSize:"0.72em",fontWeight:900,padding:"2px 10px",borderRadius:20,background:theme.accent,color:"#fff",letterSpacing:"0.04em"}}>W{todayWeekNum}</span>
                <span style={{fontSize:"0.68em",color:theme.textMuted,opacity:0.6}}>
                  {lang==="TH"
                    ? `${TODAY.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long"})} ${toThaiYear(TODAY.getFullYear())}`
                    : TODAY.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </span>
                <span style={{fontSize:"0.58em",color:theme.textMuted,opacity:0.45}}>
                  {dataLastUpdated ? `· ${t.dataUpdated} ${new Date(dataLastUpdated).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}` : ` · ${t.dataOriginal}`}
                </span>
              </div>
            </div>
            <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
              {/* 🔍 Search */}
              <button onClick={()=>setShowSearch(true)} title="Search (Ctrl+K)"
                style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${theme.border}`,background:theme.surface,color:theme.textMuted,fontSize:"0.8em",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.accent;e.currentTarget.style.color=theme.accentText;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=theme.border;e.currentTarget.style.color=theme.textMuted;}}>
                🔍<kbd style={{background:theme.surface2,border:`1px solid ${theme.border}`,borderRadius:4,padding:"1px 4px",fontSize:"0.78em",color:theme.textMuted,marginLeft:2}}>⌘K</kbd>
              </button>
              {/* 🌙/☀️ Quick Theme Toggle — Phase 2 */}
              {(()=>{
                const isLight = ["claude","light","sky","rose","sage"].includes(config.themeId||"claude");
                const nextTheme = isLight ? "dark" : "claude";
                return (
                  <button
                    onClick={async()=>{
                      const newCfg={...config,themeId:nextTheme};
                      setConfig(newCfg);
                      try{await window.storage.set(pk(CONFIG_KEY),JSON.stringify(newCfg));}catch{}
                    }}
                    title={isLight?"Switch to Dark mode":"Switch to Light mode"}
                    style={{display:"flex",alignItems:"center",justifyContent:"center",width:34,height:34,
                      borderRadius:8,border:`1.5px solid ${theme.border}`,background:theme.surface,
                      cursor:"pointer",fontSize:16,transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.accent;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=theme.border;}}>
                    {isLight?"🌙":"☀️"}
                  </button>
                );
              })()}
              {/* 🔔 Bell */}
              {(()=>{
                const nr=new Set();try{JSON.parse(localStorage.getItem(NOTIF_KEY)||"[]").forEach(id=>nr.add(id));}catch{}
                const nc=buildNotifications(personal,work).filter(n=>!nr.has(n.id)).length;
                return(
                  <button onClick={()=>setShowNotifs(v=>!v)} title="Notifications"
                    style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:8,border:`1.5px solid ${showNotifs?theme.accent:theme.border}`,background:showNotifs?theme.accent+"22":theme.surface,cursor:"pointer",fontSize:17}}>
                    🔔{nc>0&&<span style={{position:"absolute",top:-4,right:-4,fontSize:9,fontWeight:800,background:"#ef4444",color:"#fff",borderRadius:99,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",border:"2px solid "+theme.bg}}>{nc>9?"9+":nc}</span>}
                  </button>
                );
              })()}
              {/* N7: Mark all read — clears all tab notification badges at once */}
              {(()=>{
                const c = notifCounts();
                const totalUnread = ["today","milestones","donelist"].reduce((s,id)=>s+Math.max(0,(c[id]||0)-(tabReads[id]??0)),0);
                if (totalUnread===0) return null;
                return (
                  <button onClick={markAllRead} title="Mark all tab badges as read"
                    style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${theme.border}`,background:theme.surface,color:theme.textMuted,fontSize:"0.78em",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.accent;e.currentTarget.style.color=theme.accentText;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=theme.border;e.currentTarget.style.color=theme.textMuted;}}>
                    ✓ Mark all read
                  </button>
                );
              })()}
              {/* B: unified Profile + Sync + File button */}
              <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                {(()=>{
                  const st=gsyncStatus, online=gsyncSignedIn||GDrive.isSignedIn(), linked=!!gsync.fileId;
                  const dot = st==="syncing"?"#f59e0b":st==="error"?"#ef4444":(online&&linked)?"#22c55e":theme.textMuted;
                  return (
                    <button onClick={()=>setOpenMenu(m=>m==="file"?null:"file")}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:9,border:`1.5px solid ${openMenu==="file"?theme.accent:theme.accent+"55"}`,background:openMenu==="file"?theme.accent+"22":theme.surface,color:theme.accent,fontSize:"0.85em",fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>
                      <span style={{fontSize:"1.1em"}}>{activeProfile?.emoji||"👤"}</span>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{activeProfile?.name||"Profile"}</span>
                      <span style={{width:7,height:7,borderRadius:"50%",background:dot,flexShrink:0,
                        animation:st==="syncing"?"pulse 1s infinite":"none"}}/>
                      {saveStatus==="unsaved"&&<span style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",flexShrink:0}}/>}
                      <span style={{fontSize:"0.75em",opacity:0.6}}>▾</span>
                    </button>
                  );
                })()}
                {openMenu==="file"&&(
                  <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:5000,background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,.3)",minWidth:250,overflow:"hidden"}}>
                    {/* B: Profile row */}
                    <button onClick={()=>{setShowProfileSwitcher(true);setOpenMenu(null);}}
                      style={{width:"100%",textAlign:"left",padding:"11px 14px",border:"none",borderBottom:`1px solid ${theme.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"14"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:20}}>{activeProfile?.emoji||"👤"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:theme.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeProfile?.name||"Profile"}</div>
                        <div style={{fontSize:10,color:theme.textMuted}}>Switch or create profile ▸</div>
                      </div>
                    </button>

                    {/* B: Google Drive sync row */}
                    {(()=>{
                      const online=gsyncSignedIn||GDrive.isSignedIn(), linked=!!gsync.fileId;
                      const dotc = gsyncStatus==="syncing"?"#f59e0b":gsyncStatus==="error"?"#ef4444":(online&&linked)?"#22c55e":theme.textMuted;
                      const stTxt = gsyncStatus==="syncing"?"Syncing…":gsyncStatus==="error"?"Sync error":(online&&linked)?"Synced":linked?"Not connected":"Not set up";
                      const rel = gsync.lastSyncAt ? (()=>{ const s=Math.floor((Date.now()-gsync.lastSyncAt)/1000); return s<60?"just now":s<3600?`${Math.floor(s/60)} min ago`:s<86400?`${Math.floor(s/3600)} hr ago`:new Date(gsync.lastSyncAt).toLocaleDateString(); })() : null;
                      return (
                        <div style={{padding:"10px 14px",borderBottom:`1px solid ${theme.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:linked?4:6}}>
                            <span style={{width:8,height:8,borderRadius:"50%",background:dotc,flexShrink:0,animation:gsyncStatus==="syncing"?"pulse 1s infinite":"none"}}/>
                            <span style={{fontSize:10,fontWeight:800,color:theme.textMuted,letterSpacing:"0.04em"}}>☁️ GOOGLE DRIVE</span>
                            <span style={{flex:1}}/>
                            <span style={{fontSize:10,fontWeight:700,color:(online&&linked)?"#16a34a":theme.textMuted}}>{stTxt}</span>
                          </div>
                          {linked ? (
                            <>
                              <div style={{fontSize:11.5,fontWeight:700,color:theme.text,wordBreak:"break-all",marginBottom:2}}>📄 {gsync.fileName}</div>
                              {rel&&<div style={{fontSize:9.5,color:theme.textMuted,marginBottom:7}}>Last sync · {rel}</div>}
                            </>
                          ) : (
                            <div style={{fontSize:10.5,color:theme.textMuted,marginBottom:7}}>No file linked for this profile yet.</div>
                          )}
                          <button onClick={()=>{setGsyncPanel(true);setGsyncPanelMin(false);setOpenMenu(null);}}
                            style={{width:"100%",padding:"7px 0",borderRadius:8,border:`1px solid ${theme.border}`,background:theme.surface,color:theme.accent,fontSize:11,fontWeight:800,cursor:"pointer"}}>
                            {linked?"⚙️ Manage sync":"🔗 Set up cloud sync"}
                          </button>
                        </div>
                      );
                    })()}

                    {/* File status header */}
                    <div style={{padding:"8px 14px",borderBottom:`1px solid ${theme.border}`,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:saveStatus==="saved"?"#22c55e":saveStatus==="saving"?"#f59e0b":"#ef4444"}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10,color:theme.textMuted,fontWeight:700}}>
                          {saveStatus==="saved"?"✓ All changes saved":saveStatus==="saving"?"Saving…":"● Unsaved changes"}
                        </div>
                        {(gsync.fileName||fileHandle||lastFileName)&&<div style={{fontSize:9,color:theme.textMuted,opacity:0.7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>
                          {gsync.fileName?"☁️ ":"📄 "}{gsync.fileName||fileHandle?.name||lastFileName}
                        </div>}
                        {!gsync.fileName&&!fileHandle&&!lastFileName&&<div style={{fontSize:9,color:theme.textMuted,opacity:0.6,marginTop:1}}>
                          No file yet — Save to choose a location
                        </div>}
                      </div>
                    </div>

                    {/* 1. OPEN — on iOS there's no real folder to browse, so lead with
                        Google Drive; a small link underneath still allows a local file. */}
                    {isIOSDevice ? (
                      <>
                        <button onClick={()=>{setGsyncPanel(true);setGsyncPanelMin(false);setOpenMenu(null);}}
                          style={{width:"100%",textAlign:"left",padding:"11px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                          onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <span style={{fontSize:15,width:22,flexShrink:0}}>☁️</span>
                          <div><div style={{fontWeight:800}}>Open from Google Drive…</div><div style={{fontSize:10,color:theme.textMuted}}>Recommended on iPad/iPhone</div></div>
                        </button>
                        <button onClick={()=>{handleOpenFilePicker();setOpenMenu(null);}}
                          style={{width:"100%",textAlign:"left",padding:"7px 16px 11px 48px",background:"transparent",border:"none",color:theme.textMuted,fontSize:"0.78em",cursor:"pointer"}}
                          onMouseEnter={e=>e.currentTarget.style.color=theme.accent}
                          onMouseLeave={e=>e.currentTarget.style.color=theme.textMuted}>
                          or open a local file instead
                        </button>
                      </>
                    ) : (
                      <button onClick={()=>{handleOpenFilePicker();setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"11px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                        onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:15,width:22,flexShrink:0}}>📂</span>
                        <div><div style={{fontWeight:800}}>Open Local File</div><div style={{fontSize:10,color:theme.textMuted}}>Reads a .json from this device into the current profile</div></div>
                      </button>
                    )}

                    <div style={{height:1,background:theme.border,margin:"0 14px"}}/>

                    {/* 2. SAVE — writes current data to the working file */}
                    <button onClick={()=>{handleSave();setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"11px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:15,width:22,flexShrink:0}}>💾</span>
                      <div><div style={{fontWeight:800}}>Save  <kbd style={{fontSize:9,opacity:0.6}}>⌘S</kbd></div><div style={{fontSize:10,color:theme.textMuted}}>{fileHandle||lastFileName?"Overwrite the current file":"Choose where to save"}</div></div>
                    </button>

                    {/* 3. BACKUP — dated history copy, never overwrites working file */}
                    <button onClick={()=>{handleBackup();setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"11px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:15,width:22,flexShrink:0}}>📦</span>
                      <div><div style={{fontWeight:800}}>Backup to Local Drive</div><div style={{fontSize:10,color:theme.textMuted}}>Writes a dated copy to this device for history</div></div>
                    </button>

                    <div style={{height:1,background:theme.border,margin:"0 14px"}}/>

                    {/* Export options (ZIP / Excel / paste-restore) — advanced */}
                    <button onClick={()=>{setShowSplit(true);setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"9px 16px",background:"transparent",border:"none",color:theme.textMuted,fontSize:"0.82em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.hover}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:15}}>🗂</span>
                      <div><div style={{fontWeight:800}}>Split files…</div><div style={{fontSize:10,color:theme.textMuted}}>Work / Personal / Core as separate files</div></div>
                    </button>
                    <button onClick={()=>{setShowDataModal(true);setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"9px 16px",background:"transparent",border:"none",color:theme.textMuted,fontSize:"0.82em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:13,width:22,flexShrink:0}}>⋯</span>
                      <div><div style={{fontWeight:700}}>More export options</div><div style={{fontSize:9,color:theme.textMuted}}>ZIP · Excel · paste-to-restore</div></div>
                    </button>
                  </div>
                )}
              </div>
              {/* ⚙️ Settings */}
              <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                <button onClick={()=>setOpenMenu(m=>m==="settings"?null:"settings")}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"6px 11px",borderRadius:8,border:`1.5px solid ${openMenu==="settings"?theme.accent:theme.border}`,background:openMenu==="settings"?theme.accent+"22":theme.surface,color:openMenu==="settings"?theme.accentText:theme.textMuted,fontSize:"0.82em",fontWeight:700,cursor:"pointer"}}>
                  ⚙️<span style={{fontSize:"0.75em",opacity:0.6,marginLeft:2}}>▾</span>
                </button>
                {openMenu==="settings"&&(
                  <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:5000,background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,.3)",minWidth:250,overflow:"hidden"}}>
                    <button onClick={()=>{setTab("config");setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"10px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:14,width:22,flexShrink:0}}>🎨</span>
                      <div><div style={{fontWeight:700}}>Theme &amp; Appearance</div><div style={{fontSize:10,color:theme.textMuted}}>Current: {THEMES[config.themeId]?.name||"Claude"}</div></div>
                    </button>
                    <div style={{padding:"10px 16px",borderTop:`1px solid ${theme.border}`,borderBottom:`1px solid ${theme.border}`}}>
                      <div style={{fontSize:10,fontWeight:700,color:theme.textMuted,marginBottom:6,letterSpacing:"0.06em"}}>FONT SIZE</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:10,color:theme.textMuted,fontWeight:700,flexShrink:0}}>A</span>
                        <div style={{display:"flex",background:theme.surface2,border:`1px solid ${theme.border}`,borderRadius:7,padding:2,gap:1,flex:1}}>
                          {FONT_STEPS.map(s=>(
                            <button key={s} onClick={()=>setFontSize(s)} style={{flex:1,padding:"3px 0",borderRadius:5,border:"none",background:fontSize===s?theme.accent:"transparent",color:fontSize===s?"#fff":theme.textMuted,fontSize:9,fontWeight:fontSize===s?800:500,cursor:"pointer"}}>{s}</button>
                          ))}
                        </div>
                        <span style={{fontSize:14,color:theme.textMuted,fontWeight:700,flexShrink:0}}>A</span>
                      </div>
                    </div>
                    <button onClick={()=>{toggleLang();setOpenMenu(null);}} style={{width:"100%",textAlign:"left",padding:"10px 16px",background:"transparent",border:"none",color:theme.text,fontSize:"0.88em",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontWeight:600}}
                      onMouseEnter={e=>e.currentTarget.style.background=theme.accent+"22"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:14,width:22,flexShrink:0}}>{lang==="EN"?"🇹🇭":"🇬🇧"}</span>
                      <div><div style={{fontWeight:700}}>Language: {lang}</div><div style={{fontSize:10,color:theme.textMuted}}>Switch to {lang==="EN"?"Thai (ภาษาไทย)":"English"}</div></div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Desktop tab bar */}
          <div className="lp-app-chrome" style={{display:"flex",gap:0,alignItems:"center",overflowX:"auto"}}>
            {ALL_TABS.map(tb=>{
              const isAct=tab===tb.id;
              const isCust=!!tb.custom;
              const isDragging=dragTab===tb.id;
              return(
                <div key={tb.id}
                  draggable
                  onDragStart={()=>setDragTab(tb.id)}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{reorderTabs(dragTab,tb.id);setDragTab(null);}}
                  onDragEnd={()=>setDragTab(null)}
                  title="Drag to reorder"
                  style={{display:"flex",alignItems:"center",flexShrink:0,opacity:isDragging?0.4:1,cursor:"grab"}}>
                  <button onClick={()=>setTab(tb.id)} style={{padding:"8px 13px",background:"none",border:"none",borderBottom:`2px solid ${isAct?theme.accent:"transparent"}`,color:isAct?theme.accentText:theme.textMuted,fontWeight:isAct?800:600,fontSize:"0.85em",cursor:"pointer",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                    {tb.label}
                    {(()=>{const b=tabBadge(tb);return b!=null&&<span style={{background:isAct?theme.accent:tb.countColor||theme.border,color:"#fff",borderRadius:99,fontSize:"0.72em",fontWeight:800,padding:"1px 6px"}}>{b}</span>;})()}
                  </button>
                  {isCust&&(
                    <div style={{display:"flex",gap:2,paddingRight:4,borderBottom:`2px solid ${isAct?theme.accent:"transparent"}`}}>
                      <button onClick={()=>setEditingTab(tb.cfg)} style={{padding:"2px 4px",borderRadius:4,border:`1px solid ${theme.border}`,background:"transparent",color:theme.textMuted,fontSize:9,cursor:"pointer",opacity:isAct?1:0.5}}>✏️</button>
                      <button onClick={()=>handleDeleteTab(tb.id)} style={{padding:"2px 4px",borderRadius:4,border:`1px solid ${theme.border}`,background:"transparent",color:"#f87171",fontSize:9,cursor:"pointer",opacity:isAct?1:0.5}}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={()=>setShowAddTab(true)}
              style={{flexShrink:0,margin:"0 6px",padding:"5px 10px",borderRadius:8,border:`1px dashed ${theme.border}`,background:"transparent",color:theme.textMuted,fontSize:"0.82em",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.accent;e.currentTarget.style.color=theme.accentText;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=theme.border;e.currentTarget.style.color=theme.textMuted;}}>
              {t.addTab}
            </button>
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <ErrorBoundary>
        <div style={{padding: isMobile ? "12px 12px" : isTablet ? "14px 18px" : "18px 24px"}}>
          {tab==="timeline" &&<TimelineTab personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} events={events} widgetOrder={widgetOrder} onReorderWidgets={saveWidgetOrder} lang={lang} onTaskSave={handleTaskSaveFromOverview}/>}
          {tab==="today"    &&<TodayTab    personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} lang={lang}/>}
          {tab==="milestones"&&<MilestonesTab personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} events={events} setEvents={saveEvents} eventTypes={eventTypes} setEventTypes={saveEventTypes} tlFontSize={config.timelineFontSize||12} tlFontFamily={config.timelineFontFamily||"system"} tlTheme={config.timelineTheme||"classic"} tlDetailsCfg={config.timelineDetails===true} tlCompactCfg={config.timelineCompact===true} savedViewId={config.timelineActiveView||""} onPatchConfig={patchConfig} lang={lang}/>}
          {tab==="donelist" &&<DoneListTab personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} lang={lang}/>}
          {tab==="stats"    &&<StatsTab personal={personal} work={work} lang={lang}/>}
          {tab==="notes"    &&<NotesTab notes={notes} setNotes={saveNotes} lang={lang} mentionTarget={mentionTarget} clearMentionTarget={()=>setMentionTarget(null)}/>}
          {tab==="calendar" &&<CalendarTab personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} events={events} setEvents={saveEvents} eventTypes={eventTypes} setEventTypes={saveEventTypes} calViews={calViews} setCalViews={saveCalViews} calFontSize={config.calFontSize||12} calFontFamily={config.calFontFamily||"system"} onPatchConfig={patchConfig} lang={lang} mentionTarget={mentionTarget} clearMentionTarget={()=>setMentionTarget(null)}/>}
          {tab==="list"     &&<DataListTab personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} events={events} setEvents={saveEvents} eventTypes={eventTypes} setEventTypes={saveEventTypes} lang={lang}/>}
          {tab==="gantt"    &&<GanttTab    personal={personal} work={work} setPersonal={setPersonal} setWork={setWork} events={events} setEvents={saveEvents} eventTypes={eventTypes} setEventTypes={saveEventTypes} defaultZoom={config.ganttZoom||DEFAULT_CONFIG.ganttZoom} defaultWeeks={config.ganttWeeks!==undefined?config.ganttWeeks:DEFAULT_CONFIG.ganttWeeks} defaultDates={config.ganttDates!==undefined?config.ganttDates:DEFAULT_CONFIG.ganttDates} defaultBarLines={config.ganttBarLines===true} ganttFontSize={config.ganttFontSize||11} ganttFontFamily={config.ganttFontFamily||"system"} cfgCustomStart={config.ganttCustomStart||""} cfgCustomDur={config.ganttCustomDur||6} cfgCustomUnit={config.ganttCustomUnit||"m"} savedViewId={config.ganttActiveView||""} onPatchConfig={patchConfig}/>}
          {tab==="personal" &&<PersonalTab tasks={personal} setTasks={setPersonal} mentionTarget={mentionTarget} clearMentionTarget={()=>setMentionTarget(null)}/>}
          {tab==="work"     &&<WorkTab tasks={work} setTasks={saveWork} knownProjects={projectReg} onForgetProject={forgetProject} mentionTarget={mentionTarget} clearMentionTarget={()=>setMentionTarget(null)}/>}
          {tab==="activity" &&<ActivityTab activity={activity} undoStack={undoStack} redoStack={redoStack} onUndo={handleUndo} onRedo={handleRedo} onJumpTo={handleJumpToActivity}/>}
          {tab==="config"   &&<ConfigTab config={config} onSave={handleSaveConfig}/>}
          {tab==="about"    &&<AboutTab dataLastUpdated={dataLastUpdated}/>}
          {customTabs.map(ct=>tab===ct.id&&<CustomTabView key={ct.id} tabCfg={ct} personal={personal} work={work} setPersonal={setPersonal} setWork={setWork}/>)}
        </div>
      </ErrorBoundary>

      {/* ════════════════════════════════════════════════════════
          BOTTOM NAVIGATION — Phone + iPad (isCompact)
          ════════════════════════════════════════════════════════ */}
      {isCompact&&!zenMode&&(
        <div style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:300,
          background:theme.surface, borderTop:`1px solid ${theme.border}`,
          display:"flex", alignItems:"stretch",
          paddingBottom:"env(safe-area-inset-bottom,0px)",
        }}>
          {BOTTOM_NAV.map(nav=>{
            const isAct=tab===nav.id;
            const navTab=FIXED_TABS.find(f=>f.id===nav.id);
            const cnt=navTab?tabBadge(navTab):null;
            const btnH = isTablet ? 64 : 56;
            const iconSz = isTablet ? 26 : 22;
            const lblSz  = isTablet ? 11 : 9;
            return(
              <button key={nav.id}
                onClick={()=>{setTab(nav.id);setMobileMenuOpen(false);}}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  padding: isTablet ? "12px 4px 10px" : "10px 4px 8px",
                  background:"transparent",border:"none",
                  color:isAct?theme.accent:theme.textMuted,
                  cursor:"pointer",position:"relative",minHeight:btnH,
                  borderTop:`3px solid ${isAct?theme.accent:"transparent"}`,
                  transition:"color .15s",touchAction:"manipulation"}}>
                <span style={{fontSize:iconSz,lineHeight:1,marginBottom:3}}>{nav.icon}</span>
                <span style={{fontSize:lblSz,fontWeight:isAct?800:600,letterSpacing:"0.02em",lineHeight:1}}>{nav.label}</span>
                {cnt!=null&&cnt>0&&(
                  <span style={{position:"absolute",top:isTablet?8:6,right:"50%",transform:"translateX(12px)",
                    fontSize:8,fontWeight:800,background:"#ef4444",color:"#fff",
                    borderRadius:99,minWidth:14,height:14,display:"flex",alignItems:"center",
                    justifyContent:"center",padding:"0 3px",border:`1.5px solid ${theme.surface}`}}>
                    {cnt>9?"9+":cnt}
                  </span>
                )}
              </button>
            );
          })}
          {/* More button */}
          <button onClick={()=>setMobileMenuOpen(v=>!v)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              padding: isTablet ? "12px 4px 10px" : "10px 4px 8px",
              background:"transparent",border:"none",
              color:mobileMenuOpen?theme.accent:theme.textMuted,
              cursor:"pointer",minHeight:isTablet?64:56,
              borderTop:`3px solid ${mobileMenuOpen?theme.accent:"transparent"}`,
              transition:"color .15s",touchAction:"manipulation"}}>
            <span style={{fontSize:isTablet?26:22,lineHeight:1,marginBottom:3}}>⋯</span>
            <span style={{fontSize:isTablet?11:9,fontWeight:600,letterSpacing:"0.02em",lineHeight:1}}>More</span>
          </button>
        </div>
      )}
    </div>
  );
}
