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
    const query = String(intent.query || "").toLocaleLowerCase("th-TH");
    return {
      title: lang === "th"
        ? `🔎 ผลค้นหา “${cleanText(intent.query, 80)}”`
        : `🔎 Search results for “${cleanText(intent.query, 80)}”`,
      tasks: tasks.filter((task) => [
        task?.title,
        task?.project,
        task?.category,
        task?.type,
      ].some((value) => String(value ?? "").toLocaleLowerCase("th-TH").includes(query))),
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
  const type = task?.type === "work"
    ? (lang === "th" ? "งาน" : "Work")
    : (lang === "th" ? "ส่วนตัว" : "Personal");
  const group = cleanText(task?.project || task?.category, 80);
  const priority = cleanText(task?.priority, 24);
  const status = isDone(task)
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
      text: [formatDate(task?.due, lang), priority, status].filter(Boolean).join(" · "),
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
  const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
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
  const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
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
