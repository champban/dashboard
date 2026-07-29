export const BANGKOK_TIME_ZONE = "Asia/Bangkok";
export const MAX_REPLY_CHARS = 4800;
export const MAX_REPLY_TASKS = 12;

export const HELP_TEXT = [
  "คำสั่งที่ใช้ได้",
  "• งานวันนี้",
  "• งานสัปดาห์นี้",
  "• งานเกินกำหนด",
  "• งานไม่มีวันกำหนด",
  "• ค้นหา <คำ>",
  "• สถานะ",
  "• ช่วยเหลือ",
].join("\n");

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
  if (/^(?:งานเกินกำหนด|เกินกำหนด|overdue)$/u.test(folded)) {
    return { kind: "overdue" };
  }
  if (/^(?:งานไม่มีวันกำหนด|ไม่มีวันกำหนด|งานไม่มีวันที่|no date)$/u.test(folded)) {
    return { kind: "no_date" };
  }
  if (/^(?:สถานะ|status)$/u.test(folded)) return { kind: "status" };
  if (/^(?:ช่วยเหลือ|ช่วย|คำสั่ง|help)$/u.test(folded)) return { kind: "help" };

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

export function isDone(task) {
  return ["done", "complete", "completed", "closed"].includes(
    String(task?.status ?? "").toLocaleLowerCase("en-US"),
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

function formatDate(value) {
  const iso = isoDate(value);
  if (!iso) return "ไม่มีวันกำหนด";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00+07:00`));
}

function formatTask(task, index) {
  const title = cleanText(task?.title) || "(ไม่มีชื่อ)";
  const type = task?.type === "work" ? "งาน" : "ส่วนตัว";
  const group = cleanText(task?.project || task?.category, 80);
  const due = formatDate(task?.due);
  const status = isDone(task) ? "เสร็จแล้ว" : "ค้าง";
  const meta = [type, group, due, status].filter(Boolean).join(" · ");
  return `${index + 1}. ${title}\n   ${meta}`;
}

function dataTime(snapshot) {
  const raw = snapshot?.dataUpdatedAt || snapshot?.data_updated_at
    || snapshot?.syncedAt || snapshot?.updated_at;
  const time = Date.parse(raw || "");
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

export function truncateReply(value, max = MAX_REPLY_CHARS) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  const suffix = "\n…ตัดรายการที่เหลือ";
  return `${text.slice(0, Math.max(0, max - suffix.length)).trimEnd()}${suffix}`;
}

function listReply(title, tasks, snapshot) {
  if (!tasks.length) {
    return `${title}\nไม่พบงานในกลุ่มนี้\nข้อมูลล่าสุด ${dataTime(snapshot) || "ไม่ทราบเวลา"}`;
  }
  const shown = sortTasks(tasks).slice(0, MAX_REPLY_TASKS);
  const extra = tasks.length - shown.length;
  const lines = [
    `${title} (${tasks.length})`,
    ...shown.map(formatTask),
    extra > 0 ? `…และอีก ${extra} งาน` : "",
    `ข้อมูลล่าสุด ${dataTime(snapshot) || "ไม่ทราบเวลา"}`,
  ].filter(Boolean);
  return truncateReply(lines.join("\n"));
}

export function buildReply(intent, snapshot, { now = new Date() } = {}) {
  const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks : [];
  const today = bangkokToday(now);
  const active = tasks.filter((task) => !isDone(task));

  if (intent.kind === "help" || intent.kind === "unknown") {
    return intent.kind === "unknown"
      ? `ยังไม่เข้าใจคำถามนี้ครับ\n\n${HELP_TEXT}`
      : HELP_TEXT;
  }

  if (intent.kind === "status") {
    const done = tasks.filter(isDone).length;
    const overdue = active.filter((task) => isoDate(task?.due) && isoDate(task.due) < today).length;
    const dueToday = active.filter((task) => isoDate(task?.due) === today).length;
    const noDate = active.filter((task) => !isoDate(task?.due)).length;
    return [
      "📊 สถานะงาน",
      `ค้าง ${active.length} · เสร็จแล้ว ${done}`,
      `วันนี้ ${dueToday} · เกินกำหนด ${overdue} · ไม่มีวันกำหนด ${noDate}`,
      snapshot?.truncated ? `หมายเหตุ: snapshot แสดง ${tasks.length} จาก ${snapshot.taskCountTotal} งาน` : "",
      `ข้อมูลล่าสุด ${dataTime(snapshot) || "ไม่ทราบเวลา"}`,
    ].filter(Boolean).join("\n");
  }

  if (intent.kind === "today") {
    return listReply("📅 งานวันนี้", active.filter((task) => isoDate(task?.due) === today), snapshot);
  }
  if (intent.kind === "week") {
    const { start, end } = weekBounds(today);
    return listReply(
      "🗓 งานสัปดาห์นี้",
      active.filter((task) => {
        const due = isoDate(task?.due);
        return due && due >= start && due <= end;
      }),
      snapshot,
    );
  }
  if (intent.kind === "overdue") {
    return listReply(
      "⚠️ งานเกินกำหนด",
      active.filter((task) => isoDate(task?.due) && isoDate(task.due) < today),
      snapshot,
    );
  }
  if (intent.kind === "no_date") {
    return listReply("📌 งานไม่มีวันกำหนด", active.filter((task) => !isoDate(task?.due)), snapshot);
  }
  if (intent.kind === "search") {
    const query = String(intent.query || "").toLocaleLowerCase("th-TH");
    const matches = tasks.filter((task) => [
      task?.title,
      task?.project,
      task?.category,
      task?.type,
    ].some((value) => String(value ?? "").toLocaleLowerCase("th-TH").includes(query)));
    return listReply(`🔎 ผลค้นหา “${cleanText(intent.query, 80)}”`, matches, snapshot);
  }
  return HELP_TEXT;
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
