export const BANGKOK_TIME_ZONE = "Asia/Bangkok";
export const MAX_REPLY_CHARS = 4800;
export const MAX_REPLY_TASKS = 12;
export const MAX_FLEX_SUBTASKS = 5;
export const MAX_FLEX_CAROUSEL_BYTES = 50 * 1024;

export const HELP_TEXT_TH = [
  "คำสั่งที่ใช้ได้",
  "• งานวันนี้",
  "• 4 สัปดาห์ข้างหน้า",
  "• งานสัปดาห์นี้",
  "• งานเกินกำหนด",
  "• งานสำคัญ",
  "• งานไม่มีวันกำหนด",
  "• ค้นหา <คำ>",
  "• ค้นหา ธันวาคม 2026 / สัปดาห์ 49 ปี 2026",
  "• ค้นหา กิจกรรม 2026",
  "• add <ชื่อ>, DD-MM-YYYY",
  "  (หรือ today / beginning, middle, end of this หรือ next month/year)",
  "• สถานะ",
  "• เมนู",
  "• ช่วยเหลือ",
].join("\n");

export const HELP_TEXT_EN = [
  "Available commands",
  "• today",
  "• next 4 weeks",
  "• this week",
  "• overdue",
  "• high priority",
  "• no due date",
  "• search <text>",
  "• search December 2026 / week 49 2026",
  "• search events 2026",
  "• add <title>, DD-MM-YYYY",
  "  (or today / beginning, middle, end of this or next month/year)",
  "• status",
  "• menu",
  "• help",
].join("\n");

// Backwards-compatible export for the original Thai command suite.
export const HELP_TEXT = HELP_TEXT_TH;

const MENU_ACTIONS = {
  en: [
    { label: "Today", text: "today" },
    { label: "Next 4 weeks", text: "next 4 weeks" },
    { label: "Overdue", text: "overdue" },
    { label: "High priority", text: "high priority" },
    { label: "No due date", text: "no due date" },
    { label: "Search", kind: "search_prompt", language: "en" },
    { label: "Status", text: "status" },
    { label: "Help", text: "help" },
    { label: "ภาษาไทย", text: "เมนู" },
  ],
  th: [
    { label: "วันนี้", text: "งานวันนี้" },
    { label: "4 สัปดาห์", text: "4 สัปดาห์ข้างหน้า" },
    { label: "เกินกำหนด", text: "งานเกินกำหนด" },
    { label: "สำคัญสูง", text: "งานสำคัญ" },
    { label: "ไม่มีวันกำหนด", text: "งานไม่มีวันกำหนด" },
    { label: "ค้นหา", kind: "search_prompt", language: "th" },
    { label: "สถานะ", text: "สถานะ" },
    { label: "ช่วยเหลือ", text: "ช่วยเหลือ" },
    { label: "English", text: "menu" },
  ],
};

const cleanText = (value, max = 240) => String(value ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const isoDate = (value) => {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

export function normalizeCommand(value) {
  return cleanText(value, 500).replace(/[?？]+$/u, "").trim();
}

export function commandLanguage(value) {
  return /[\u0E00-\u0E7F]/u.test(normalizeCommand(value)) ? "th" : "en";
}

export function extractLinkCode(value) {
  const text = normalizeCommand(value).toUpperCase();
  const match = text.match(/^(?:เชื่อม(?:ต่อ)?|LINK)\s+(MTP)[-\s]?([A-HJ-NP-Z2-9]{4})[-\s]?([A-HJ-NP-Z2-9]{4})$/u);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function parseIntent(value) {
  const text = normalizeCommand(value);
  const folded = text.toLocaleLowerCase("th-TH");

  if (/^(?:งานวันนี้|วันนี้|วันนี้มีงานอะไร|มีงานอะไรวันนี้|today)$/u.test(folded)) {
    return { kind: "today" };
  }
  if (/^(?:งานสัปดาห์นี้|สัปดาห์นี้|อาทิตย์นี้|week|this week)$/u.test(folded)) {
    return { kind: "week" };
  }
  if (/^(?:4\s*สัปดาห์ข้างหน้า|งาน\s*4\s*สัปดาห์ข้างหน้า|วันนี้ถึง\s*4\s*สัปดาห์|next\s*4\s*weeks(?:\s*tasks)?)$/u.test(folded)) {
    return { kind: "next_four_weeks" };
  }
  if (/^(?:งานเกินกำหนด|เกินกำหนด|overdue)$/u.test(folded)) {
    return { kind: "overdue" };
  }
  if (/^(?:งานสำคัญ|งานความสำคัญสูง|ความสำคัญสูง|สำคัญสูง|high priority|urgent)$/u.test(folded)) {
    return { kind: "high_priority" };
  }
  if (/^(?:งานไม่มีวันกำหนด|ไม่มีวันกำหนด|งานไม่มีวันที่|no date|no due date)$/u.test(folded)) {
    return { kind: "no_date" };
  }
  if (/^(?:สถานะ|status)$/u.test(folded)) return { kind: "status" };
  if (/^(?:ช่วยเหลือ|ช่วย|คำสั่ง|help)$/u.test(folded)) return { kind: "help" };
  if (/^(?:เมนู|menu)$/u.test(folded)) return { kind: "menu" };
  if (/^(?:ค้นหา|หา|search)$/u.test(folded)) return { kind: "search_prompt" };

  const search = text.match(/^(?:ค้นหา|หา|search)\s+(.+)$/iu);
  if (search) return { kind: "search", query: cleanText(search[1], 120) };
  return { kind: "unknown" };
}

const mutationType = (value) => {
  const type=String(value||"").toLocaleLowerCase("en-US");
  return type==="work"||type==="business"?"work":type==="event"?"event":"personal";
};

const mutationDate = (value) => {
  const match=String(value||"").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if(!match)return "";
  const iso=`${match[3]}-${match[2]}-${match[1]}`;
  const date=new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:"";
};

const daysInMonth=(year,month)=>new Date(Date.UTC(year,month,0)).getUTCDate();
const isoFromParts=(year,month,day)=>
  `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

// Deterministic relative-date phrases for `add`, computed from bangkokToday().
// Only unambiguous phrases are matched. "mid of next N months" is intentionally
// NOT supported — it has no single agreed meaning yet (see PROJECT_CONTEXT.md
// open backlog); guessing would silently create a task on the wrong date.
const relativeMutationDate=(phrase,now=new Date())=>{
  const folded=String(phrase||"").toLocaleLowerCase("en-US").replace(/\s+/g," ").trim();
  const todayIso=bangkokToday(now);
  if(folded==="today")return todayIso;
  const match=folded.match(/^(beginning|middle|end) of (this|next) (month|year)$/);
  if(!match)return "";
  const [,part,when,unit]=match;
  const [y,m]=todayIso.split("-").map(Number);
  if(unit==="month"){
    const monthIndex=(m-1)+(when==="next"?1:0);
    const year=y+Math.floor(monthIndex/12);
    const month=(monthIndex%12)+1;
    const day=part==="beginning"?1:part==="middle"?15:daysInMonth(year,month);
    return isoFromParts(year,month,day);
  }
  const year=y+(when==="next"?1:0);
  const month=part==="beginning"?1:part==="middle"?7:12;
  const day=part==="beginning"?1:part==="middle"?1:31;
  return isoFromParts(year,month,day);
};

const resolveMutationDate=(value,now)=>mutationDate(value)||relativeMutationDate(value,now);
const MUTATION_DATE_TOKEN=String.raw`(?:\d{2}-\d{2}-\d{4}|today|(?:beginning|middle|end)\s+of\s+(?:this|next)\s+(?:month|year))`;

export function parseMutationCommand(value,now=new Date()){
  const text=normalizeCommand(value);
  const add=text.match(new RegExp(
    `^add(?:\\s+(personal|work|business|event))?\\s+(.+?)\\s*,\\s*(${MUTATION_DATE_TOKEN})$`,"iu"));
  if(add){
    const date=resolveMutationDate(add[3],now);
    if(!date)return null;
    return {action:"add",type:mutationType(add[1]),title:cleanText(add[2],240),date,
      category:"General",priority:"Medium"};
  }
  const edit=text.match(/^edit(?:\s+(personal|work|business|event))?\s+(.+?)\s*,\s*(.+?)\s*,\s*(\d{2}-\d{2}-\d{4})$/iu);
  if(edit){
    const date=mutationDate(edit[4]);
    if(!date)return null;
    return {action:"edit",type:mutationType(edit[1]),matchTitle:cleanText(edit[2],240),
      title:cleanText(edit[3],240),date};
  }
  // Shorter form: only the date changes, so the title is not repeated.
  const editDateOnly=text.match(/^edit(?:\s+(personal|work|business|event))?\s+(.+?)\s*,\s*(\d{2}-\d{2}-\d{4})$/iu);
  if(editDateOnly){
    const date=mutationDate(editDateOnly[3]);
    if(!date)return null;
    const title=cleanText(editDateOnly[2],240);
    return {action:"edit",type:mutationType(editDateOnly[1]),matchTitle:title,title,date};
  }
  const remove=text.match(/^delete(?:\s+(personal|work|business|event))?\s+(.+)$/iu);
  return remove?{action:"delete",type:mutationType(remove[1]),matchTitle:cleanText(remove[2],240)}:null;
}

export function parseMutationPostback(value){
  const match=String(value||"").match(/^mutation=(confirm|cancel)&id=([0-9a-f-]{36})$/);
  return match?{decision:match[1],id:match[2]}:null;
}

export function buildMutationConfirmation(operation,id,language="en"){
  const lang=normalizeLanguage(language);
  const label=operation.action==="add"?"Add":operation.action==="edit"?"Edit":"Delete";
  const summary=[`${label} ${operation.type}`,operation.matchTitle?`Match: ${operation.matchTitle}`:"",
    operation.title?`Title: ${operation.title}`:"",operation.date?`Date: ${operation.date}`:"",
    operation.category?`Category: ${operation.category}`:"",operation.priority?`Priority: ${operation.priority}`:""].filter(Boolean).join("\n");
  return {type:"text",text:`${summary}\n\n${lang==="th"?"ยืนยันคำสั่งนี้หรือไม่?":"Confirm this change?"}`,
    quickReply:{items:["confirm","cancel"].map(decision=>({type:"action",action:{type:"postback",
      label:decision==="confirm"?(lang==="th"?"ยืนยัน":"Confirm"):(lang==="th"?"ยกเลิก":"Cancel"),
      data:`mutation=${decision}&id=${id}`}}))}};
}

// Public app URL, not a secret. Attached as a Quick Reply link on a confirmed
// mutation so the owner doesn't have to navigate there from memory.
export const PLANNER_URL = "https://champban.github.io/dashboard/";

export function buildMutationResultMessage(status,matched){
  if(!matched)return {type:"text",text:"This confirmation expired or was already used."};
  if(status!=="confirmed")return {type:"text",text:"Cancelled."};
  return {type:"text",text:"Confirmed. Open Planner and Save to Cloud to apply this change.",
    quickReply:{items:[{type:"action",action:{type:"uri",label:"Open Planner",uri:PLANNER_URL}}]}};
}

export function bangkokToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function weekBounds(today) {
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  const add = (days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  };
  return { start: add(1 - day), end: add(7 - day) };
}

export function addDaysISO(today, days) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function isDone(task) {
  return ["done", "complete", "completed", "closed"].includes(
    String(task?.status ?? "").toLocaleLowerCase("en-US"),
  );
}

export function isHighPriority(task) {
  return ["high", "urgent", "สูง", "ด่วน"].includes(
    String(task?.priority ?? "").trim().toLocaleLowerCase("en-US"),
  );
}

const priorityRank = (value) => {
  const priority = String(value ?? "").toLocaleLowerCase("en-US");
  return priority === "high" || priority === "urgent" ? 0
    : priority === "medium" ? 1 : 2;
};

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aDue = isoDate(a?.type === "event" ? a?.start : a?.due) || "9999-12-31";
    const bDue = isoDate(b?.type === "event" ? b?.start : b?.due) || "9999-12-31";
    return aDue.localeCompare(bDue)
      || priorityRank(a?.priority) - priorityRank(b?.priority)
      || cleanText(a?.title).localeCompare(cleanText(b?.title), "th");
  });
}

function normalizeLanguage(language) {
  return language === "th" ? "th" : "en";
}

export function parseSearchPromptPostback(value) {
  const match = String(value ?? "").match(/^action=search_prompt&lang=(en|th)$/);
  return match ? match[1] : "";
}

export function buildSearchPromptText(language = "en") {
  return normalizeLanguage(language) === "th"
    ? "พิมพ์คำที่ต้องการหลัง “ค้นหา ” แล้วกดส่ง\nตัวอย่าง: ค้นหา พาสปอร์ต"
    : "Type a keyword after “search ”, then send.\nExample: search passport";
}

function formatDate(value, language) {
  const lang = normalizeLanguage(language);
  const iso = isoDate(value);
  if (!iso) return lang === "th" ? "ไม่มีวันกำหนด" : "No due date";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00+07:00`));
}

function formatTask(task, index, language) {
  const lang = normalizeLanguage(language);
  const title = cleanText(task?.title) || (lang === "th" ? "(ไม่มีชื่อ)" : "(Untitled)");
  const type = task?.type === "event"
    ? (lang === "th" ? "กิจกรรม" : "Event")
    : task?.type === "work"
      ? (lang === "th" ? "งาน" : "Work")
      : (lang === "th" ? "ส่วนตัว" : "Personal");
  const group = cleanText(task?.project || task?.category, 80);
  const due = task?.type === "event"
    ? `${formatDate(task?.start, lang)}${task?.end && task.end !== task.start ? `–${formatDate(task.end, lang)}` : ""}`
    : formatDate(task?.due, lang);
  const status = task?.type === "event" ? "" : isDone(task)
    ? (lang === "th" ? "เสร็จแล้ว" : "Done")
    : (lang === "th" ? "ค้าง" : "Pending");
  const meta = [type, group, due, status].filter(Boolean).join(" · ");
  return `${index + 1}. ${title}\n   ${meta}`;
}

const MONTHS = {
  january:1,jan:1,มกราคม:1,มค:1, february:2,feb:2,กุมภาพันธ์:2,กพ:2,
  march:3,mar:3,มีนาคม:3,มีค:3, april:4,apr:4,เมษายน:4,เมย:4,
  may:5,พฤษภาคม:5,พค:5, june:6,jun:6,มิถุนายน:6,มิย:6,
  july:7,jul:7,กรกฎาคม:7,กค:7, august:8,aug:8,สิงหาคม:8,สค:8,
  september:9,sep:9,sept:9,กันยายน:9,กย:9, october:10,oct:10,ตุลาคม:10,ตค:10,
  november:11,nov:11,พฤศจิกายน:11,พย:11, december:12,dec:12,ธันวาคม:12,ธค:12,
};

function isoWeekRange(year,week){
  const jan4=new Date(Date.UTC(year,0,4));
  const monday=new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7)+(week-1)*7);
  // A week search is the requested ISO week plus the following nine weeks.
  const end=new Date(monday);end.setUTCDate(end.getUTCDate()+69);
  return {start:monday.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}

export function parseTemporalSearch(value){
  let text=cleanText(value,120).toLocaleLowerCase("th-TH");
  let start="",end="";
  const week=text.match(/(?:week|wk|สัปดาห์|อาทิตย์)\s*(\d{1,2})(?:\s*(?:of|ปี)?\s*(\d{4}))?/iu);
  if(week){
    const number=Number(week[1]),year=Number(week[2]);
    if(number>=1&&number<=53&&year>=2000&&year<=2100)({start,end}=isoWeekRange(year,number));
    text=text.replace(week[0]," ");
  }else{
    const yearMatch=text.match(/\b(20\d{2}|2100)\b/u);
    const year=Number(yearMatch?.[1]);
    const monthEntry=Object.entries(MONTHS).find(([name])=>new RegExp(`(?:^|\\s)${name}(?:\\s|$)`,`u`).test(text));
    const numericMonth=text.match(/(?:month|เดือน)\s*(1[0-2]|0?[1-9])(?:\s*(?:of|ปี)?\s*20\d{2})?/u);
    if(year>=2000&&year<=2100){
      if(monthEntry||numericMonth){
        const month=monthEntry?monthEntry[1]:Number(numericMonth[1]);
        start=`${year}-${String(month).padStart(2,"0")}-01`;
        end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
        text=monthEntry
          ?text.replace(new RegExp(monthEntry[0],"u")," ")
          :text.replace(numericMonth[0]," ");
      }else{start=`${year}-01-01`;end=`${year}-12-31`;}
      text=text.replace(yearMatch[0]," ");
    }
  }
  let scope="all";
  if(/(?:^|\s)(?:events?|กิจกรรม)(?:\s|$)/u.test(text)){scope="event";text=text.replace(/(?:^|\s)(?:events?|กิจกรรม)(?:\s|$)/gu," ");}
  else if(/(?:^|\s)(?:tasks?|งาน)(?:\s|$)/u.test(text)){scope="task";text=text.replace(/(?:^|\s)(?:tasks?|งาน)(?:\s|$)/gu," ");}
  return {query:cleanText(text,120).toLocaleLowerCase("th-TH"),start,end,scope};
}

function overlapsRange(item,start,end){
  if(!start||!end)return true;
  const itemStart=isoDate(item?.type==="event"?item?.start:item?.due);
  const itemEnd=isoDate(item?.type==="event"?(item?.end||item?.start):item?.due);
  return !!itemStart&&itemStart<=end&&itemEnd>=start;
}

function dataTime(snapshot, language) {
  const lang = normalizeLanguage(language);
  const raw = snapshot?.dataUpdatedAt || snapshot?.data_updated_at
    || snapshot?.syncedAt || snapshot?.updated_at;
  const time = Date.parse(raw || "");
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function truncateReply(value, max = MAX_REPLY_CHARS, language = "th") {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  const suffix = normalizeLanguage(language) === "th"
    ? "\n…ตัดรายการที่เหลือ"
    : "\n…remaining items omitted";
  return `${text.slice(0, Math.max(0, max - suffix.length)).trimEnd()}${suffix}`;
}

function listReply(title, tasks, snapshot, language) {
  const lang = normalizeLanguage(language);
  const latest = dataTime(snapshot, lang)
    || (lang === "th" ? "ไม่ทราบเวลา" : "unknown time");
  if (!tasks.length) {
    return lang === "th"
      ? `${title}\nไม่พบงานในกลุ่มนี้\nข้อมูลล่าสุด ${latest}`
      : `${title}\nNo tasks found in this group.\nLast updated ${latest}`;
  }
  const shown = sortTasks(tasks).slice(0, MAX_REPLY_TASKS);
  const extra = tasks.length - shown.length;
  const lines = [
    `${title} (${tasks.length})`,
    ...shown.map((task, index) => formatTask(task, index, lang)),
    extra > 0
      ? (lang === "th" ? `…และอีก ${extra} งาน` : `…and ${extra} more tasks`)
      : "",
    lang === "th" ? `ข้อมูลล่าสุด ${latest}` : `Last updated ${latest}`,
  ].filter(Boolean);
  return truncateReply(lines.join("\n"), MAX_REPLY_CHARS, lang);
}

function selectTaskList(intent, tasks, active, today, language) {
  const lang = normalizeLanguage(language);
  if (intent.kind === "today") {
    return {
      title: lang === "th" ? "📅 งานวันนี้" : "📅 Today",
      tasks: active.filter((task) => isoDate(task?.due) === today),
    };
  }
  if (intent.kind === "week") {
    const { start, end } = weekBounds(today);
    return {
      title: lang === "th" ? "🗓 งานสัปดาห์นี้" : "🗓 This week",
      tasks: active.filter((task) => {
        const due = isoDate(task?.due);
        return due && due >= start && due <= end;
      }),
    };
  }
  if (intent.kind === "next_four_weeks") {
    const end = addDaysISO(today, 28);
    return {
      title: lang === "th" ? "🗓 วันนี้ถึง 4 สัปดาห์ข้างหน้า" : "🗓 Today through the next 4 weeks",
      tasks: active.filter((task) => {
        const due = isoDate(task?.due);
        return due && due >= today && due <= end;
      }),
    };
  }
  if (intent.kind === "overdue") {
    return {
      title: lang === "th" ? "⚠️ งานเกินกำหนด" : "⚠️ Overdue",
      tasks: active.filter((task) => isoDate(task?.due) && isoDate(task.due) < today),
    };
  }
  if (intent.kind === "high_priority") {
    return {
      title: lang === "th" ? "🔴 งานสำคัญสูง" : "🔴 High priority",
      tasks: active.filter(isHighPriority),
    };
  }
  if (intent.kind === "no_date") {
    return {
      title: lang === "th" ? "📌 งานไม่มีวันกำหนด" : "📌 No due date",
      tasks: active.filter((task) => !isoDate(task?.due)),
    };
  }
  if (intent.kind === "search") {
    const temporal=parseTemporalSearch(intent.query);
    const query=temporal.query;
    return {
      title: lang === "th"
        ? `🔎 ผลค้นหา “${cleanText(intent.query, 80)}”`
        : `🔎 Search results for “${cleanText(intent.query, 80)}”`,
      tasks: tasks.filter((task) => (temporal.scope==="all"
        ||(temporal.scope==="event"&&task.type==="event")
        ||(temporal.scope==="task"&&task.type!=="event"))
        &&overlapsRange(task,temporal.start,temporal.end)
        &&(!query||[
        task?.title,
        task?.project,
        task?.category,
        task?.type,
      ].some((value) => String(value ?? "").toLocaleLowerCase("th-TH").includes(query)))),
    };
  }
  return null;
}

function safeAttachment(value) {
  const uri = String(value?.url ?? "").trim();
  if (!uri || uri.length > 1000) return null;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    const kind = ["image", "video", "link"].includes(value?.kind) ? value.kind : "link";
    return {
      kind,
      label: cleanText(value?.label, 80) || parsed.hostname,
      uri: parsed.href,
    };
  } catch {
    return null;
  }
}

function attachmentButton(item, language) {
  const lang = normalizeLanguage(language);
  const icon = item.kind === "image" ? "🖼️" : item.kind === "video" ? "▶️" : "🔗";
  const fallback = item.kind === "image"
    ? (lang === "th" ? "รูปภาพ" : "Picture")
    : item.kind === "video"
    ? (lang === "th" ? "วิดีโอ" : "Video")
    : (lang === "th" ? "ลิงก์" : "Link");
  return {
    type: "button",
    style: "link",
    height: "sm",
    action: {
      type: "uri",
      label: [...`${icon} ${cleanText(item.label, 16) || fallback}`].slice(0, 20).join(""),
      uri: item.uri,
      altUri: { desktop: item.uri },
    },
  };
}

function taskBubble(task, index, shownCount, totalCount, language, extraTaskCount = 0) {
  const lang = normalizeLanguage(language);
  const title = cleanText(task?.title) || (lang === "th" ? "(ไม่มีชื่อ)" : "(Untitled)");
  const type = task?.type === "event"
    ? (lang === "th" ? "กิจกรรม" : "Event")
    : task?.type === "work"
      ? (lang === "th" ? "งาน" : "Work")
      : (lang === "th" ? "ส่วนตัว" : "Personal");
  const group = cleanText(task?.project || task?.category, 80);
  const priority = cleanText(task?.priority, 24);
  const status = task?.type === "event" ? "" : isDone(task)
    ? (lang === "th" ? "เสร็จแล้ว" : "Done")
    : (lang === "th" ? "ค้าง" : "Pending");
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const subtaskTotal = Math.max(subtasks.length, Number(task?.subtaskCountTotal) || 0);
  const doneSubtasks = subtasks.filter((item) => item?.done === true).length;
  const shownSubtasks = subtasks.slice(0, MAX_FLEX_SUBTASKS);
  const remainingSubtasks = Math.max(0, subtaskTotal - shownSubtasks.length);
  const attachments = (Array.isArray(task?.attachments) ? task.attachments : [])
    .map(safeAttachment)
    .filter(Boolean)
    .slice(0, 3);

  const bodyContents = [
    {
      type: "text",
      text: title,
      weight: "bold",
      size: "lg",
      color: "#0F3D3E",
      wrap: true,
      maxLines: 2,
    },
    {
      type: "text",
      text: [type, group].filter(Boolean).join(" · "),
      size: "xs",
      color: "#64748B",
      margin: "sm",
      wrap: true,
      maxLines: 2,
    },
    {
      type: "text",
      text: [task?.type === "event"
        ? `${formatDate(task?.start, lang)}${task?.end && task.end !== task.start ? `–${formatDate(task.end, lang)}` : ""}`
        : formatDate(task?.due, lang), priority, status].filter(Boolean).join(" · "),
      size: "sm",
      color: isHighPriority(task) ? "#DC2626" : "#334155",
      margin: "sm",
      wrap: true,
    },
  ];

  if (subtaskTotal > 0) {
    bodyContents.push({
      type: "separator",
      margin: "md",
      color: "#D7E7E3",
    }, {
      type: "text",
      text: lang === "th"
        ? `งานย่อย ${doneSubtasks}/${subtaskTotal}`
        : `Subtasks ${doneSubtasks}/${subtaskTotal}`,
      size: "xs",
      weight: "bold",
      color: "#0F766E",
      margin: "md",
    });
    for (const item of shownSubtasks) {
      bodyContents.push({
        type: "text",
        text: `${item?.done === true ? "☑" : "☐"} ${cleanText(item?.text, 120) || (lang === "th" ? "(ไม่มีชื่อ)" : "(Untitled)")}`,
        size: "xs",
        color: item?.done === true ? "#94A3B8" : "#334155",
        margin: "sm",
        wrap: true,
        maxLines: 2,
      });
    }
    if (remainingSubtasks > 0) {
      bodyContents.push({
        type: "text",
        text: lang === "th"
          ? `+${remainingSubtasks} งานย่อยเพิ่มเติม`
          : `+${remainingSubtasks} more subtasks`,
        size: "xxs",
        color: "#64748B",
        margin: "sm",
      });
    }
  }

  if (attachments.length > 0) {
    bodyContents.push({
      type: "text",
      text: lang === "th"
        ? `📎 ${attachments.length} ลิงก์ไฟล์แนบ`
        : `📎 ${attachments.length} attachment links`,
      size: "xxs",
      color: "#B45309",
      margin: "md",
    });
  }
  if (extraTaskCount > 0) {
    bodyContents.push({
      type: "text",
      text: lang === "th"
        ? `…และอีก ${extraTaskCount} งาน`
        : `…and ${extraTaskCount} more tasks`,
      size: "xxs",
      color: "#64748B",
      margin: "md",
    });
  }

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#E7F6F2",
      paddingAll: "md",
      contents: [{
        type: "text",
        text: lang === "th"
          ? `Todo ${index + 1}/${shownCount} · ทั้งหมด ${totalCount}`
          : `Todo ${index + 1}/${shownCount} · ${totalCount} total`,
        size: "xs",
        weight: "bold",
        color: "#0F766E",
      }],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      contents: bodyContents,
    },
    ...(attachments.length > 0 ? {
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "sm",
        separator: true,
        contents: attachments.map((item) => attachmentButton(item, lang)),
      },
    } : {}),
  };
}

export function buildReplyMessages(
  intent,
  snapshot,
  { now = new Date(), language = "th" } = {},
) {
  const lang = normalizeLanguage(language);
  const plannerTasks=Array.isArray(snapshot?.tasks)?snapshot.tasks:[];
  const tasks=intent?.kind==="search"
    ?[...plannerTasks,...(Array.isArray(snapshot?.events)?snapshot.events:[])]
    :plannerTasks;
  const today = bangkokToday(now);
  const active = tasks.filter((task) => !isDone(task));
  const result = selectTaskList(intent, tasks, active, today, lang);

  if (!result || !result.tasks.length) {
    return [{
      type: "text",
      text: truncateReply(buildReply(intent, snapshot, { now, language: lang }), undefined, lang),
      quickReply: buildQuickReply(lang),
    }];
  }

  const ordered = sortTasks(result.tasks).slice(0, MAX_REPLY_TASKS);
  let visible = [...ordered];
  let bubbles = [];
  while (visible.length) {
    const omitted = result.tasks.length - visible.length;
    bubbles = visible.map((task, index) => taskBubble(
      task,
      index,
      visible.length,
      result.tasks.length,
      lang,
      index === visible.length - 1 ? omitted : 0,
    ));
    const contents = visible.length === 1
      ? bubbles[0]
      : { type: "carousel", contents: bubbles };
    if (new TextEncoder().encode(JSON.stringify(contents)).byteLength <= MAX_FLEX_CAROUSEL_BYTES) {
      const altText = truncateReply(`${result.title} (${result.tasks.length})`, 400, lang);
      return [{
        type: "flex",
        altText,
        contents,
        quickReply: buildQuickReply(lang),
      }];
    }
    visible.pop();
  }

  return [{
    type: "text",
    text: truncateReply(buildReply(intent, snapshot, { now, language: lang }), undefined, lang),
    quickReply: buildQuickReply(lang),
  }];
}

function lineAction(item) {
  if (item.kind === "search_prompt") {
    const lang = normalizeLanguage(item.language);
    return {
      type: "postback",
      label: item.label,
      data: `action=search_prompt&lang=${lang}`,
      inputOption: "openKeyboard",
      fillInText: lang === "th" ? "ค้นหา " : "search ",
    };
  }
  return {
    type: "message",
    label: item.label,
    text: item.text,
  };
}

function actionItem(item) {
  return {
    type: "action",
    action: lineAction(item),
  };
}

export function buildQuickReply(language = "en") {
  const lang = normalizeLanguage(language);
  return {
    items: MENU_ACTIONS[lang].map(actionItem),
  };
}

export function buildSearchPromptMessage(language = "en") {
  const lang = normalizeLanguage(language);
  return {
    type: "text",
    text: buildSearchPromptText(lang),
    quickReply: buildQuickReply(lang),
  };
}

export function buildMenuMessage(language = "en") {
  const lang = normalizeLanguage(language);
  const actions = MENU_ACTIONS[lang];
  const rows = [];
  for (let index = 0; index < actions.length; index += 2) {
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: actions.slice(index, index + 2).map((item) => ({
        type: "button",
        style: "secondary",
        height: "sm",
        flex: 1,
        action: lineAction(item),
      })),
    });
  }
  return {
    type: "flex",
    altText: lang === "th" ? "เมนูคำถาม Todo Planner" : "Todo Planner question menu",
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#EAF8EF",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "Todo Planner",
            weight: "bold",
            size: "xl",
            color: "#146C3A",
          },
          {
            type: "text",
            text: lang === "th" ? "เลือกคำถามด้านล่าง" : "Choose a question below",
            size: "sm",
            color: "#4B6355",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "lg",
        contents: rows,
      },
    },
    quickReply: buildQuickReply(lang),
  };
}

export function buildLinkReplyMessages(status) {
  if (status === "linked") {
    return [
      {
        type: "text",
        text: "My Todo Planner is connected. Choose a question from the menu below.",
      },
      buildMenuMessage("en"),
    ];
  }
  return [{
    type: "text",
    text: status === "line_in_use"
      ? "LINE บัญชีนี้เชื่อมกับ Planner บัญชีอื่นอยู่แล้ว"
      : "รหัสเชื่อมไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาสร้างรหัสใหม่ในหน้า Sync",
  }];
}

export function buildReply(
  intent,
  snapshot,
  { now = new Date(), language = "th" } = {},
) {
  const lang = normalizeLanguage(language);
  const plannerTasks=Array.isArray(snapshot?.tasks)?snapshot.tasks:[];
  const tasks=intent?.kind==="search"
    ?[...plannerTasks,...(Array.isArray(snapshot?.events)?snapshot.events:[])]
    :plannerTasks;
  const today = bangkokToday(now);
  const active = tasks.filter((task) => !isDone(task));
  const helpText = lang === "th" ? HELP_TEXT_TH : HELP_TEXT_EN;

  if (intent.kind === "search_prompt") return buildSearchPromptText(lang);

  if (intent.kind === "help" || intent.kind === "unknown") {
    return intent.kind === "unknown"
      ? (lang === "th"
        ? `ยังไม่เข้าใจคำถามนี้ครับ\n\n${helpText}`
        : `I don't understand that question yet.\n\n${helpText}`)
      : helpText;
  }

  if (intent.kind === "status") {
    const done = tasks.filter(isDone).length;
    const overdue = active.filter((task) => isoDate(task?.due) && isoDate(task.due) < today).length;
    const dueToday = active.filter((task) => isoDate(task?.due) === today).length;
    const noDate = active.filter((task) => !isoDate(task?.due)).length;
    if (lang === "th") {
      return [
        "📊 สถานะงาน",
        `ค้าง ${active.length} · เสร็จแล้ว ${done}`,
        `วันนี้ ${dueToday} · เกินกำหนด ${overdue} · ไม่มีวันกำหนด ${noDate}`,
        snapshot?.truncated ? `หมายเหตุ: snapshot แสดง ${tasks.length} จาก ${snapshot.taskCountTotal} งาน` : "",
        `ข้อมูลล่าสุด ${dataTime(snapshot, lang) || "ไม่ทราบเวลา"}`,
      ].filter(Boolean).join("\n");
    }
    return [
      "📊 Task status",
      `Pending ${active.length} · Done ${done}`,
      `Today ${dueToday} · Overdue ${overdue} · No due date ${noDate}`,
      snapshot?.truncated ? `Note: snapshot shows ${tasks.length} of ${snapshot.taskCountTotal} tasks` : "",
      `Last updated ${dataTime(snapshot, lang) || "unknown time"}`,
    ].filter(Boolean).join("\n");
  }

  const result = selectTaskList(intent, tasks, active, today, lang);
  if (result) return listReply(result.title, result.tasks, snapshot, lang);
  return helpText;
}

export async function sha256Hex(value, cryptoImpl = globalThis.crypto) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const constantTimeEqual = (left, right) => {
  const a = String(left ?? "");
  const b = String(right ?? "");
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

export async function verifyLineSignature(
  rawBody,
  signature,
  channelSecret,
  cryptoImpl = globalThis.crypto,
) {
  if (!signature || !channelSecret) return false;
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await cryptoImpl.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return constantTimeEqual(bytesToBase64(new Uint8Array(digest)), signature);
}
