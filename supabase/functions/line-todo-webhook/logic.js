export const BANGKOK_TIME_ZONE = "Asia/Bangkok";
export const MAX_REPLY_CHARS = 4800;
export const MAX_REPLY_TASKS = 12;

export const HELP_TEXT_TH = [
  "คำสั่งที่ใช้ได้",
  "• งานวันนี้",
  "• 4 สัปดาห์ข้างหน้า",
  "• งานสัปดาห์นี้",
  "• งานเกินกำหนด",
  "• งานสำคัญ",
  "• งานไม่มีวันกำหนด",
  "• ค้นหา <คำ>",
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

  const search = text.match(/^(?:ค้นหา|หา|search)\s+(.+)$/iu);
  if (search) return { kind: "search", query: cleanText(search[1], 120) };
  return { kind: "unknown" };
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
    const aDue = isoDate(a?.due) || "9999-12-31";
    const bDue = isoDate(b?.due) || "9999-12-31";
    return aDue.localeCompare(bDue)
      || priorityRank(a?.priority) - priorityRank(b?.priority)
      || cleanText(a?.title).localeCompare(cleanText(b?.title), "th");
  });
}

function normalizeLanguage(language) {
  return language === "th" ? "th" : "en";
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
  const type = task?.type === "work"
    ? (lang === "th" ? "งาน" : "Work")
    : (lang === "th" ? "ส่วนตัว" : "Personal");
  const group = cleanText(task?.project || task?.category, 80);
  const due = formatDate(task?.due, lang);
  const status = isDone(task)
    ? (lang === "th" ? "เสร็จแล้ว" : "Done")
    : (lang === "th" ? "ค้าง" : "Pending");
  const meta = [type, group, due, status].filter(Boolean).join(" · ");
  return `${index + 1}. ${title}\n   ${meta}`;
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

function messageAction(item) {
  return {
    type: "action",
    action: {
      type: "message",
      label: item.label,
      text: item.text,
    },
  };
}

export function buildQuickReply(language = "en") {
  const lang = normalizeLanguage(language);
  return {
    items: MENU_ACTIONS[lang].map(messageAction),
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
        action: messageAction(item).action,
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
  const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
  const today = bangkokToday(now);
  const active = tasks.filter((task) => !isDone(task));
  const helpText = lang === "th" ? HELP_TEXT_TH : HELP_TEXT_EN;

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

  if (intent.kind === "today") {
    return listReply(
      lang === "th" ? "📅 งานวันนี้" : "📅 Today",
      active.filter((task) => isoDate(task?.due) === today),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "week") {
    const { start, end } = weekBounds(today);
    return listReply(
      lang === "th" ? "🗓 งานสัปดาห์นี้" : "🗓 This week",
      active.filter((task) => {
        const due = isoDate(task?.due);
        return due && due >= start && due <= end;
      }),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "next_four_weeks") {
    const end = addDaysISO(today, 28);
    return listReply(
      lang === "th" ? "🗓 วันนี้ถึง 4 สัปดาห์ข้างหน้า" : "🗓 Today through the next 4 weeks",
      active.filter((task) => {
        const due = isoDate(task?.due);
        return due && due >= today && due <= end;
      }),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "overdue") {
    return listReply(
      lang === "th" ? "⚠️ งานเกินกำหนด" : "⚠️ Overdue",
      active.filter((task) => isoDate(task?.due) && isoDate(task.due) < today),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "high_priority") {
    return listReply(
      lang === "th" ? "🔴 งานสำคัญสูง" : "🔴 High priority",
      active.filter(isHighPriority),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "no_date") {
    return listReply(
      lang === "th" ? "📌 งานไม่มีวันกำหนด" : "📌 No due date",
      active.filter((task) => !isoDate(task?.due)),
      snapshot,
      lang,
    );
  }
  if (intent.kind === "search") {
    const query = String(intent.query || "").toLocaleLowerCase("th-TH");
    const matches = tasks.filter((task) => [
      task?.title,
      task?.project,
      task?.category,
      task?.type,
    ].some((value) => String(value ?? "").toLocaleLowerCase("th-TH").includes(query)));
    return listReply(
      lang === "th"
        ? `🔎 ผลค้นหา “${cleanText(intent.query, 80)}”`
        : `🔎 Search results for “${cleanText(intent.query, 80)}”`,
      matches,
      snapshot,
      lang,
    );
  }
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
