import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import {
  HELP_TEXT,
  HELP_TEXT_EN,
  PLANNER_URL,
  addDaysISO,
  buildAddDatePrompt,
  buildEditDatePrompt,
  buildLinkReplyMessages,
  buildMenuMessage,
  buildMutationConfirmation,
  buildMutationPromptMessage,
  buildMutationResultMessage,
  buildQuickReply,
  buildReply,
  buildReplyMessages,
  buildSearchPromptMessage,
  buildSearchPromptText,
  buildStatusPrompt,
  commandLanguage,
  extractLinkCode,
  parseAddNeedsDate,
  parseEditNeedsDate,
  parseIntent,
  parseMutationCommand,
  parseMutationPostback,
  parseMutationPromptPostback,
  parseSearchPromptPostback,
  parseStatusNeedsValue,
  parseTemporalSearch,
  sha256Hex,
  truncateReply,
  verifyLineSignature,
  weekBounds,
} from "../supabase/functions/line-todo-webhook/logic.js";

const now = new Date("2026-07-28T02:00:00.000Z"); // 09:00 Asia/Bangkok
const snapshot = {
  dataUpdatedAt: "2026-07-28T01:30:00.000Z",
  tasks: [
    {
      type: "work",
      title: "ส่งรายงาน",
      status: "todo",
      due: "2026-07-28",
      project: "Alpha",
      priority: "High",
      subtasks: [
        { text: "ตรวจตัวเลข", done: true },
        { text: "ส่งให้ทีม", done: false },
      ],
      subtaskCountTotal: 2,
      attachments: [
        { kind: "image", label: "Diagram", url: "https://example.com/diagram.png" },
        { kind: "video", label: "Demo", url: "https://youtu.be/demo" },
        { kind: "link", label: "Spec", url: "https://example.com/spec" },
        { kind: "link", label: "Unsafe", url: "http://example.com/unsafe" },
      ],
    },
    { type: "personal", title: "จ่ายบิล", status: "pending", due: "2026-07-27", category: "Home" },
    { type: "work", title: "ประชุมปลายสัปดาห์", status: "todo", due: "2026-08-02", project: "Alpha" },
    { type: "work", title: "งานสัปดาห์หน้า", status: "todo", due: "2026-08-03", project: "Beta" },
    { type: "personal", title: "จัดโต๊ะ", status: "pending", due: "", category: "Home" },
    { type: "work", title: "งานที่จบแล้ว", status: "done", due: "2026-07-28", project: "Alpha" },
  ],
};

assert.deepEqual(parseIntent("งานวันนี้"), { kind: "today" });
assert.deepEqual(parseIntent("วันนี้มีงานอะไร?"), { kind: "today" });
assert.deepEqual(parseIntent("งานสัปดาห์นี้"), { kind: "week" });
assert.deepEqual(parseIntent("next 4 weeks"), { kind: "next_four_weeks" });
assert.deepEqual(parseIntent("4 สัปดาห์ข้างหน้า"), { kind: "next_four_weeks" });
assert.deepEqual(parseIntent("งานเกินกำหนด"), { kind: "overdue" });
assert.deepEqual(parseIntent("high priority"), { kind: "high_priority" });
assert.deepEqual(parseIntent("งานสำคัญ"), { kind: "high_priority" });
assert.deepEqual(parseIntent("งานไม่มีวันกำหนด"), { kind: "no_date" });
assert.deepEqual(parseIntent("no due date"), { kind: "no_date" });
assert.deepEqual(parseIntent("ค้นหา Alpha"), { kind: "search", query: "Alpha" });
assert.deepEqual(parseIntent("search"), { kind: "search_prompt" });
assert.deepEqual(parseIntent("ค้นหา"), { kind: "search_prompt" });
assert.deepEqual(parseIntent("สถานะ"), { kind: "status" });
assert.deepEqual(parseIntent("ช่วยเหลือ"), { kind: "help" });
assert.deepEqual(parseIntent("menu"), { kind: "menu" });
assert.deepEqual(parseIntent("เมนู"), { kind: "menu" });
assert.deepEqual(parseIntent("คำถามที่ไม่รู้จัก"), { kind: "unknown" });
assert.equal(commandLanguage("menu"), "en");
assert.equal(commandLanguage("เมนู"), "th");
assert.equal(parseSearchPromptPostback("action=search_prompt&lang=en"), "en");
assert.equal(parseSearchPromptPostback("action=search_prompt&lang=th"), "th");
assert.equal(parseSearchPromptPostback("action=search_prompt&lang=de"), "");
assert.equal(parseSearchPromptPostback("action=search_prompt&lang=en&extra=true"), "");
assert.equal(parseSearchPromptPostback("action=delete&lang=en"), "");
assert.deepEqual(parseMutationCommand("add Buy insurance, 01-12-2026"), {
  action:"add",type:"personal",title:"Buy insurance",date:"2026-12-01",category:"General",priority:"Medium",
});
assert.deepEqual(parseMutationCommand("add work Prepare report, 05-12-2026"), {
  action:"add",type:"work",title:"Prepare report",date:"2026-12-05",category:"General",priority:"Medium",
});
assert.deepEqual(parseMutationCommand("delete event Annual meeting"), {
  action:"delete",type:"event",matchTitle:"Annual meeting",
});
assert.equal(parseMutationCommand("add Bad date, 31-02-2026"),null);

// Relative date phrases, pinned against the fixed `now` above (2026-07-28 Bangkok).
assert.deepEqual(parseMutationCommand("add Party, today",now), {
  action:"add",type:"personal",title:"Party",date:"2026-07-28",category:"General",priority:"Medium",
});
assert.equal(parseMutationCommand("add Party, beginning of next month",now).date,"2026-08-01");
assert.equal(parseMutationCommand("add Party, middle of next month",now).date,"2026-08-15");
assert.equal(parseMutationCommand("add Party, end of next month",now).date,"2026-08-31");
assert.equal(parseMutationCommand("add Party, beginning of this year",now).date,"2026-01-01");
assert.equal(parseMutationCommand("add Party, middle of this year",now).date,"2026-07-01");
assert.equal(parseMutationCommand("add Party, end of this year",now).date,"2026-12-31");
assert.equal(parseMutationCommand("add Party, beginning of next year",now).date,"2027-01-01");
assert.equal(parseMutationCommand("add Party, middle of next year",now).date,"2027-07-01");
assert.equal(parseMutationCommand("add Party, end of next year",now).date,"2027-12-31");
// Case-insensitive and whitespace-tolerant, same as the rest of the parser.
assert.equal(parseMutationCommand("add Party, BEGINNING   OF   NEXT MONTH",now).date,"2026-08-01");
// Month rollover into the next year.
assert.equal(
  parseMutationCommand("add Party, beginning of next month", new Date("2026-12-15T02:00:00.000Z")).date,
  "2027-01-01",
);
// Leap-year month length ("end of next month" landing on February).
assert.equal(
  parseMutationCommand("add Party, end of next month", new Date("2028-01-15T02:00:00.000Z")).date,
  "2028-02-29",
);
// "mid of next N months": day 15 of the month N months from now (owner-defined 2026-08-11).
assert.equal(parseMutationCommand("add Party, mid of next 3 months",now).date,"2026-10-15");
assert.equal(parseMutationCommand("add Party, mid of next 1 month",now).date,"2026-08-15");
assert.equal(parseMutationCommand("add Party, MID OF NEXT 3 MONTHS",now).date,"2026-10-15");
// Year rollover.
assert.equal(parseMutationCommand("add Party, mid of next 6 months",now).date,"2027-01-15");
// Still no guessing for genuinely different phrasing.
assert.equal(parseMutationCommand("add Party, mid of the next 3 months",now),null);

// add <title> with no date attempt at all: offer a date picker instead of a
// generic unknown-command reply.
assert.deepEqual(parseAddNeedsDate("add Buy milk"), {type:"personal",title:"Buy milk"});
assert.deepEqual(parseAddNeedsDate("add work Buy milk"), {type:"work",title:"Buy milk"});
assert.deepEqual(parseAddNeedsDate("add Buy milk,"), {type:"personal",title:"Buy milk"});
assert.equal(parseAddNeedsDate("add"), null);
assert.equal(parseAddNeedsDate("add Buy milk, today"), null, "a valid full command must not be reinterpreted");
assert.equal(parseAddNeedsDate("add Buy milk, tmrw"), null, "a botched date attempt must not be guessed at");
assert.equal(parseAddNeedsDate("delete Buy milk"), null);

for (const language of ["en", "th"]) {
  const prompt = buildAddDatePrompt({type:"personal",title:"Buy milk"}, language);
  assert.equal(prompt.type, "text");
  assert.equal(prompt.quickReply.items.length, 13);
  assert.ok(prompt.quickReply.items.length <= 13);
  assert.match(prompt.text, /add Buy milk, DD-MM-YYYY/);
  for (const item of prompt.quickReply.items) {
    assert.equal(item.type, "action");
    assert.equal(item.action.type, "message");
    assert.ok(item.action.label.length <= 20);
    assert.ok(item.action.text.length <= 300);
    // Every shortcut must round-trip through the real command parser into a
    // fully-formed, ready-to-confirm add operation for the same title.
    const reparsed = parseMutationCommand(item.action.text);
    assert.equal(reparsed?.action, "add");
    assert.equal(reparsed?.title, "Buy milk");
    assert.ok(reparsed?.date);
  }
  // Labels must be unique — LINE would silently dedupe/confuse otherwise.
  assert.equal(new Set(prompt.quickReply.items.map(i => i.action.label)).size, 13);
}
// A non-default type is preserved into every reconstructed command.
const workPrompt = buildAddDatePrompt({type:"work",title:"Ship report"}, "en");
for (const item of workPrompt.quickReply.items) {
  assert.equal(parseMutationCommand(item.action.text)?.type, "work");
}

// edit <title> with no date attempt: same date-picker mechanism as add, but
// the reconstructed command keeps the title unchanged (short edit form).
assert.deepEqual(parseEditNeedsDate("edit Buy insurance"), {type:"personal",title:"Buy insurance"});
assert.equal(parseEditNeedsDate("edit Buy insurance, 15-12-2026"), null, "a valid full command must not be reinterpreted");
for (const language of ["en", "th"]) {
  const prompt = buildEditDatePrompt({type:"personal",title:"Buy insurance"}, language);
  assert.equal(prompt.quickReply.items.length, 13);
  // There is no server-side memory of the pending title between messages —
  // the prompt text must show the exact full command, not imply a bare
  // typed date alone would work (that silently went nowhere in production).
  assert.match(prompt.text, /edit Buy insurance, DD-MM-YYYY/);
  for (const item of prompt.quickReply.items) {
    const reparsed = parseMutationCommand(item.action.text);
    assert.equal(reparsed?.action, "edit");
    assert.equal(reparsed?.matchTitle, "Buy insurance");
    assert.equal(reparsed?.title, "Buy insurance", "short edit form must leave the title unchanged");
    assert.ok(reparsed?.date);
  }
}

// Edit now also accepts relative date phrases, same as add (both forms).
assert.equal(parseMutationCommand("edit Buy insurance, today",now).date, "2026-07-28");
assert.equal(
  parseMutationCommand("edit Buy insurance, Buy insurance policy, beginning of next month",now).date,
  "2026-08-01",
);

// status <title>, <value>: owner-requested feature. Personal tasks are a
// simple Pending/Done toggle; work tasks have the app's full four-state
// workflow. Events have no status and are never offered it.
assert.deepEqual(parseMutationCommand("status Buy insurance, done"), {
  action:"status",type:"personal",matchTitle:"Buy insurance",status:"done",
});
assert.deepEqual(parseMutationCommand("status work Ship report, in progress"), {
  action:"status",type:"work",matchTitle:"Ship report",status:"inprogress",
});
assert.deepEqual(parseMutationCommand("status work Ship report, review"), {
  action:"status",type:"work",matchTitle:"Ship report",status:"review",
});
// A work-only value must not silently apply to the personal default type.
assert.equal(parseMutationCommand("status Buy insurance, review"), null);
assert.equal(parseMutationCommand("status Buy insurance, not-a-status"), null);

assert.deepEqual(parseStatusNeedsValue("status Buy insurance"), {type:"personal",title:"Buy insurance"});
assert.deepEqual(parseStatusNeedsValue("status work Ship report"), {type:"work",title:"Ship report"});
assert.equal(parseStatusNeedsValue("status Buy insurance, done"), null, "a valid full command must not be reinterpreted");
// "event" is not a recognised type prefix here (status has no event support),
// so it is treated as leading title text — safe (resolves to not_found later)
// and never reachable via the UI anyway, since event cards never get a Status
// button (see the card-button test below).
assert.deepEqual(parseStatusNeedsValue("status event Trip"), {type:"personal",title:"event Trip"});

for (const language of ["en", "th"]) {
  const personalPrompt = buildStatusPrompt({type:"personal",title:"Buy insurance"}, language);
  assert.equal(personalPrompt.quickReply.items.length, 2);
  const workPromptStatus = buildStatusPrompt({type:"work",title:"Ship report"}, language);
  assert.equal(workPromptStatus.quickReply.items.length, 4);
  assert.match(personalPrompt.text, /status Buy insurance, pending/);
  assert.match(workPromptStatus.text, /status work Ship report, todo/);
  for (const prompt of [personalPrompt, workPromptStatus]) {
    for (const item of prompt.quickReply.items) {
      assert.equal(item.action.type, "message");
      assert.ok(item.action.label.length <= 20);
      const reparsed = parseMutationCommand(item.action.text);
      assert.equal(reparsed?.action, "status");
      assert.ok(reparsed?.status);
    }
    // Labels must be unique within one prompt.
    assert.equal(new Set(prompt.quickReply.items.map(i => i.action.label)).size, prompt.quickReply.items.length);
  }
}

// Confirmation display: status operations get their own label and field,
// not the add/edit/delete summary shape.
const statusConfirm = buildMutationConfirmation(
  {action:"status",type:"work",matchTitle:"Ship report",status:"inprogress"},
  "123e4567-e89b-12d3-a456-426614174000", "en",
);
assert.match(statusConfirm.text, /Update status/);
assert.match(statusConfirm.text, /New status: In Progress/);

// Menu prefill postbacks (Add/Edit/Set Status buttons): parse + instructional reply.
for (const kind of ["add","edit","status"]) {
  for (const language of ["en","th"]) {
    const parsed = parseMutationPromptPostback(`action=mutation_prompt&kind=${kind}&lang=${language}`);
    assert.deepEqual(parsed, {kind,language});
    const message = buildMutationPromptMessage(kind, language);
    assert.equal(message.type, "text");
    assert.ok(message.text.length > 0);
    assert.equal(message.quickReply.items.length, 13);
  }
}
assert.equal(parseMutationPromptPostback("action=search_prompt&lang=en"), null);
assert.equal(parseMutationPromptPostback("action=mutation_prompt&kind=bogus&lang=en"), null);

// Edit: full form (title change) and the shorter date-only form.
assert.deepEqual(parseMutationCommand("edit Buy insurance, Buy insurance policy, 15-12-2026"), {
  action:"edit",type:"personal",matchTitle:"Buy insurance",title:"Buy insurance policy",date:"2026-12-15",
});
assert.deepEqual(parseMutationCommand("edit work Buy insurance, 15-12-2026"), {
  action:"edit",type:"work",matchTitle:"Buy insurance",title:"Buy insurance",date:"2026-12-15",
});
assert.equal(parseMutationCommand("edit Bad date, 31-02-2026"),null);

// Confirmed-mutation reply: link only appears once matched and confirmed.
assert.equal(PLANNER_URL,"https://champban.github.io/dashboard/");
const confirmedReply=buildMutationResultMessage("confirmed",true,"en");
assert.match(confirmedReply.text,/Confirmed/);
assert.equal(confirmedReply.quickReply.items[0].action.uri,PLANNER_URL);
assert.equal(buildMutationResultMessage("cancelled",true,"en").quickReply,undefined);
assert.match(buildMutationResultMessage("cancelled",true,"en").text,/Cancelled/);
assert.match(buildMutationResultMessage("confirmed",false,"en").text,/expired|already used/);
const confirmedReplyTh=buildMutationResultMessage("confirmed",true,"th");
assert.match(confirmedReplyTh.text,/ยืนยันแล้ว/);
assert.equal(confirmedReplyTh.quickReply.items[0].action.label,"เปิด Planner");
assert.match(buildMutationResultMessage("cancelled",true,"th").text,/ยกเลิกแล้ว/);
assert.match(buildMutationResultMessage("confirmed",false,"th").text,/หมดอายุ|ถูกใช้/);

const mutationId="123e4567-e89b-12d3-a456-426614174000";
assert.deepEqual(
  parseMutationPostback(`mutation=confirm&id=${mutationId}&lang=th`),
  {decision:"confirm",id:mutationId,language:"th"},
);
assert.deepEqual(
  parseMutationPostback(`mutation=confirm&id=${mutationId}`),
  {decision:"confirm",id:mutationId,language:"en"},
  "legacy postbacks remain compatible and default to English",
);
const confirmation=buildMutationConfirmation(
  parseMutationCommand("add Buy insurance, 01-12-2026"),mutationId,"en",
);
assert.match(JSON.stringify(confirmation),/Confirm/);
assert.ok(confirmation.quickReply.items.every((item)=>item.action.data.endsWith("&lang=en")));
assert.deepEqual(parseTemporalSearch("Buy December 2026"), {
  query: "buy", start: "2026-12-01", end: "2026-12-31", scope: "all", status: "",
});
assert.deepEqual(parseTemporalSearch("กิจกรรม สัปดาห์ 49 ปี 2026"), {
  query: "", start: "2026-11-30", end: "2026-12-06", scope: "event", status: "",
});
assert.deepEqual(parseTemporalSearch("week36 2026"), {
  query: "", start: "2026-08-31", end: "2026-09-06", scope: "all", status: "",
});
assert.deepEqual(parseTemporalSearch("week 1 2026"), {
  query: "", start: "2025-12-29", end: "2026-01-04", scope: "all", status: "",
});
assert.deepEqual(parseTemporalSearch("week 53 2026"), {
  query: "", start: "2026-12-28", end: "2027-01-03", scope: "all", status: "",
});
for (const week of [1,36,49,53]) {
  const range=parseTemporalSearch(`week ${week} 2026`);
  const span=(Date.parse(range.end)-Date.parse(range.start))/86400000;
  assert.equal(span,6,`ISO week ${week} must cover exactly seven inclusive calendar days`);
  assert.equal(new Date(`${range.start}T00:00:00Z`).getUTCDay(),1,"starts Monday");
  assert.equal(new Date(`${range.end}T00:00:00Z`).getUTCDay(),0,"ends Sunday");
}
assert.deepEqual(parseTemporalSearch("งาน เดือน 12 ปี 2026"), {
  query: "", start: "2026-12-01", end: "2026-12-31", scope: "task", status: "",
});

// Search status filter: "search <text> <status>" — optional trailing status
// word, any status if omitted. Matches the owner's own phrasing exactly.
assert.deepEqual(parseTemporalSearch("ภาษี pending"), {
  query: "ภาษี", start: "", end: "", scope: "all", status: "pending",
});
assert.deepEqual(parseTemporalSearch("Fortuner done"), {
  query: "fortuner", start: "", end: "", scope: "all", status: "done",
});
assert.deepEqual(parseTemporalSearch("Fortuner in progress"), {
  query: "fortuner", start: "", end: "", scope: "all", status: "inprogress",
});
assert.deepEqual(parseTemporalSearch("Fortuner to do"), {
  query: "fortuner", start: "", end: "", scope: "all", status: "todo",
});
assert.deepEqual(parseTemporalSearch("Fortuner review"), {
  query: "fortuner", start: "", end: "", scope: "all", status: "review",
});
assert.deepEqual(parseTemporalSearch("ค่าไฟ ค้าง"), {
  query: "ค่าไฟ", start: "", end: "", scope: "all", status: "pending",
});
assert.deepEqual(parseTemporalSearch("ค่าไฟ เสร็จแล้ว"), {
  query: "ค่าไฟ", start: "", end: "", scope: "all", status: "done",
});
// No trailing status word at all: search every status, as before.
assert.deepEqual(parseTemporalSearch("Buy insurance"), {
  query: "buy insurance", start: "", end: "", scope: "all", status: "",
});
// Combines with the existing temporal/scope tokens.
assert.deepEqual(parseTemporalSearch("tax done December 2026"), {
  query: "tax", start: "2026-12-01", end: "2026-12-31", scope: "all", status: "done",
});

assert.equal(extractLinkCode("เชื่อม MTP-ABCD-2345"), "MTP-ABCD-2345");
assert.equal(extractLinkCode("link mtp abcd 2345"), "MTP-ABCD-2345");
assert.equal(extractLinkCode("เชื่อม MTP-ABCO-2345"), "", "ambiguous O must not be accepted");
assert.deepEqual(weekBounds("2026-07-28"), { start: "2026-07-27", end: "2026-08-02" });
assert.equal(addDaysISO("2026-07-28", 28), "2026-08-25");

const todayReply = buildReply(parseIntent("งานวันนี้"), snapshot, { now });
assert.match(todayReply, /ส่งรายงาน/);
assert.doesNotMatch(todayReply, /งานที่จบแล้ว/);
assert.doesNotMatch(todayReply, /จ่ายบิล/);

const todayMessages = buildReplyMessages(parseIntent("งานวันนี้"), snapshot, {
  now,
  language: "th",
});
assert.equal(todayMessages.length, 1);
assert.equal(todayMessages[0].type, "flex");
assert.equal(todayMessages[0].contents.type, "bubble");
assert.equal(todayMessages[0].quickReply.items.length, 13);
const todayFlexText = JSON.stringify(todayMessages[0]);
assert.match(todayFlexText, /ส่งรายงาน/);
assert.match(todayFlexText, /ตรวจตัวเลข/);
assert.match(todayFlexText, /ส่งให้ทีม/);
assert.match(todayFlexText, /https:\/\/example\.com\/diagram\.png/);
assert.match(todayFlexText, /https:\/\/youtu\.be\/demo/);
assert.doesNotMatch(todayFlexText, /http:\/\/example\.com\/unsafe/);
// LINE's Flex schema does not recognise `separator` as a field on the footer
// box itself — it only exists as bubble-level `styles.footer.separator`. A
// box-level `separator` field is REJECTED outright by LINE's reply API with
// a 400 ("unknown field"). The failure now surfaces as
// line_reply_failed -> failed -> HTTP 503 — the production incident this guards.
assert.equal(todayMessages[0].contents.footer.separator, undefined);
assert.equal(todayMessages[0].contents.styles?.footer?.separator, true);
const footerActions = todayMessages[0].contents.footer.contents.map((button) => button.action);
const attachmentActions = footerActions.filter((action) => action.type === "uri");
assert.ok(attachmentActions.every((action) => action.uri.startsWith("https://")));
assert.ok(attachmentActions.every((action) => action.altUri.desktop === action.uri));
// Edit/Delete/Status card buttons: a work task (this fixture's "ส่งรายงาน") gets
// all three; each reconstructs into a valid, re-parseable bare command.
const cardActions = footerActions.filter((action) => action.type === "message");
assert.equal(cardActions.length, 3);
const cardLabels = cardActions.map((action) => action.label).sort();
assert.deepEqual(cardLabels, ["ลบ", "สถานะ", "แก้ไข"], "Thai labels for this Thai-language reply");
for (const action of cardActions) {
  assert.equal(action.text.startsWith("edit work ") || action.text.startsWith("delete work ")
    || action.text.startsWith("status work "), true);
  assert.match(action.text, /ส่งรายงาน$/, "the exact title must be embedded verbatim");
}
assert.equal(parseEditNeedsDate(cardActions.find(a => a.text.startsWith("edit ")).text)?.title, "ส่งรายงาน");
assert.equal(parseStatusNeedsValue(cardActions.find(a => a.text.startsWith("status ")).text)?.type, "work");
assert.deepEqual(
  parseMutationCommand(cardActions.find(a => a.text.startsWith("delete ")).text),
  {action:"delete",type:"work",matchTitle:"ส่งรายงาน"},
);

// Event cards get Edit/Delete but never a Status button — events have no status.
const eventCardSnapshot = {
  dataUpdatedAt: "2026-07-28T01:30:00.000Z",
  tasks: [],
  events: [{ type: "event", title: "Trip", start: "2026-07-28", end: "2026-07-28", category: "Personal" }],
};
const eventCardMessages = buildReplyMessages(parseIntent("ค้นหา Trip"), eventCardSnapshot, { now, language: "en" });
const eventCardFooterActions = (eventCardMessages[0].contents.footer?.contents || []).map((b) => b.action);
assert.equal(eventCardFooterActions.filter((a) => a.type === "message").length, 2, "event cards get Edit+Delete only");
assert.ok(eventCardFooterActions.every((a) => !a.text?.startsWith("status ")));

const weekReply = buildReply(parseIntent("งานสัปดาห์นี้"), snapshot, { now });
assert.match(weekReply, /ส่งรายงาน/);
assert.match(weekReply, /ประชุมปลายสัปดาห์/);
assert.doesNotMatch(weekReply, /งานสัปดาห์หน้า/);

const overdueReply = buildReply(parseIntent("งานเกินกำหนด"), snapshot, { now });
assert.match(overdueReply, /จ่ายบิล/);
assert.doesNotMatch(overdueReply, /ส่งรายงาน/);

const noDateReply = buildReply(parseIntent("งานไม่มีวันกำหนด"), snapshot, { now });
assert.match(noDateReply, /จัดโต๊ะ/);

const searchReply = buildReply(parseIntent("ค้นหา Alpha"), snapshot, { now });
assert.match(searchReply, /ส่งรายงาน/);
assert.match(searchReply, /งานที่จบแล้ว/, "search intentionally includes completed tasks");

// "search <text> <status>" — owner-requested trailing status filter, e.g.
// "search ภาษี pending" / "search Fortuner done". No status word: every
// status still shows, unchanged from before this feature.
const searchAlphaPending = buildReply(parseIntent("ค้นหา Alpha ค้าง"), snapshot, { now });
assert.match(searchAlphaPending, /ส่งรายงาน/);
assert.match(searchAlphaPending, /ประชุมปลายสัปดาห์/);
assert.doesNotMatch(searchAlphaPending, /งานที่จบแล้ว/, "done task excluded by a pending filter");

const statusSearchSnapshot = {
  dataUpdatedAt: "2026-08-01T08:00:00.000Z",
  tasks: [
    { type: "personal", title: "Pay tax now", status: "pending", due: "2026-08-01", category: "Home" },
    { type: "personal", title: "Pay tax later", status: "done", due: "2026-07-01", category: "Home" },
    { type: "work", title: "Tax filing prep", status: "todo", due: "2026-08-05", project: "Alpha" },
    { type: "work", title: "Tax filing draft", status: "inprogress", due: "2026-08-06", project: "Alpha" },
    { type: "work", title: "Tax filing audit", status: "review", due: "2026-08-07", project: "Alpha" },
    { type: "work", title: "Tax filing archive", status: "done", due: "2026-08-08", project: "Alpha" },
  ],
  events: [
    { type: "event", title: "Tax filing deadline", start: "2026-08-09", end: "2026-08-09" },
  ],
};
const taxPending = buildReply(parseIntent("search tax pending"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxPending, /Pay tax now/);
assert.match(taxPending, /Tax filing prep/);
assert.match(taxPending, /Tax filing draft/);
assert.match(taxPending, /Tax filing audit/);
assert.doesNotMatch(taxPending, /Pay tax later/);
assert.doesNotMatch(taxPending, /Tax filing archive/);
assert.doesNotMatch(taxPending, /Tax filing deadline/, "events have no status concept and never match a status filter");

const taxDone = buildReply(parseIntent("search tax done"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxDone, /Pay tax later/);
assert.match(taxDone, /Tax filing archive/);
assert.doesNotMatch(taxDone, /Pay tax now/);
assert.doesNotMatch(taxDone, /Tax filing prep/);
assert.doesNotMatch(taxDone, /Tax filing deadline/);

const taxTodo = buildReply(parseIntent("search tax todo"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxTodo, /Tax filing prep/);
assert.doesNotMatch(taxTodo, /Tax filing draft/);
assert.doesNotMatch(taxTodo, /Pay tax now/, "personal 'pending' status never matches the work-only 'todo' filter");

const taxInProgress = buildReply(parseIntent("search tax in progress"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxInProgress, /Tax filing draft/);
assert.doesNotMatch(taxInProgress, /Tax filing prep/);

const taxReview = buildReply(parseIntent("search tax review"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxReview, /Tax filing audit/);
assert.doesNotMatch(taxReview, /Tax filing draft/);
assert.doesNotMatch(taxReview, /Tax filing archive/);

const taxAnyStatus = buildReply(parseIntent("search tax"), statusSearchSnapshot, { now, language: "en" });
assert.match(taxAnyStatus, /Pay tax now/);
assert.match(taxAnyStatus, /Pay tax later/);
assert.match(taxAnyStatus, /Tax filing archive/);
assert.match(taxAnyStatus, /Tax filing deadline/, "no status word: search still covers events, same as before");

const temporalSnapshot = {
  dataUpdatedAt: "2026-08-01T08:37:00.000Z",
  tasks: [
    { type: "personal", title: "Buy AIA", status: "pending", due: "2026-12-01" },
    { type: "work", title: "Buy supplies", status: "todo", due: "2027-01-02" },
  ],
  events: [
    { type: "event", title: "Annual planning", start: "2026-11-30", end: "2026-12-03" },
    { type: "event", title: "January kickoff", start: "2027-01-04", end: "2027-01-04" },
  ],
};
const monthReply=buildReply(parseIntent("search buy December 2026"),temporalSnapshot,{now,language:"en"});
assert.match(monthReply,/Buy AIA/);
assert.doesNotMatch(monthReply,/Buy supplies/);
const weekReplyWithEvent=buildReply(parseIntent("ค้นหา กิจกรรม สัปดาห์ 49 ปี 2026"),temporalSnapshot,{now});
assert.match(weekReplyWithEvent,/Annual planning/);
assert.doesNotMatch(weekReplyWithEvent,/Buy AIA/);
const yearReply=buildReply(parseIntent("search events 2027"),temporalSnapshot,{now,language:"en"});
assert.match(yearReply,/January kickoff/);
assert.doesNotMatch(yearReply,/Annual planning/);
const eventMessages=buildReplyMessages(parseIntent("search events 2026"),temporalSnapshot,{now,language:"en"});
const eventFlex=JSON.stringify(eventMessages[0].contents);
assert.match(eventFlex,/Annual planning/);
assert.match(eventFlex,/Event/);
assert.match(eventFlex,/30 Nov/);
assert.doesNotMatch(eventFlex,/No due date|Pending/);

const statusReply = buildReply(parseIntent("สถานะ"), snapshot, { now });
assert.match(statusReply, /ค้าง 5 · เสร็จแล้ว 1/);
assert.match(statusReply, /วันนี้ 1 · เกินกำหนด 1 · ไม่มีวันกำหนด 1/);
assert.equal(buildReply(parseIntent("ช่วยเหลือ"), snapshot, { now }), HELP_TEXT);
assert.equal(
  buildReply(parseIntent("help"), snapshot, { now, language: "en" }),
  HELP_TEXT_EN,
);
assert.equal(
  buildReply(parseIntent("search"), snapshot, { now, language: "en" }),
  buildSearchPromptText("en"),
);
assert.equal(
  buildReply(parseIntent("ค้นหา"), snapshot, { now, language: "th" }),
  buildSearchPromptText("th"),
);
assert.match(buildReply(parseIntent("ไม่รู้"), snapshot, { now }), /ยังไม่เข้าใจ/);
assert.ok(truncateReply("ก".repeat(6000)).length <= 4800);
const emptyMessages = buildReplyMessages(parseIntent("งานวันนี้"), { tasks: [] }, {
  now,
  language: "th",
});
assert.equal(emptyMessages[0].type, "text");
assert.match(emptyMessages[0].text, /ไม่พบงาน/);

const rangeSnapshot = {
  dataUpdatedAt: "2026-07-28T01:30:00.000Z",
  tasks: [
    { title: "Yesterday", status: "todo", due: "2026-07-27", priority: "High" },
    { title: "Today boundary", status: "todo", due: "2026-07-28", priority: "Medium" },
    { title: "End boundary", status: "todo", due: "2026-08-25", priority: "High" },
    { title: "After boundary", status: "todo", due: "2026-08-26", priority: "High" },
    { title: "High no date", status: "todo", due: "", priority: "High" },
    { title: "Done high", status: "done", due: "2026-08-10", priority: "High" },
  ],
};
const fourWeeksReply = buildReply(parseIntent("next 4 weeks"), rangeSnapshot, {
  now,
  language: "en",
});
assert.match(fourWeeksReply, /Today boundary/);
assert.match(fourWeeksReply, /End boundary/);
assert.doesNotMatch(fourWeeksReply, /Yesterday/);
assert.doesNotMatch(fourWeeksReply, /After boundary/);
assert.doesNotMatch(fourWeeksReply, /Done high/);

const highReply = buildReply(parseIntent("high priority"), rangeSnapshot, {
  now,
  language: "en",
});
assert.match(highReply, /Yesterday/);
assert.match(highReply, /End boundary/);
assert.match(highReply, /After boundary/);
assert.match(highReply, /High no date/);
assert.doesNotMatch(highReply, /Today boundary/);
assert.doesNotMatch(highReply, /Done high/);

const carouselSnapshot = {
  dataUpdatedAt: "2026-07-28T01:30:00.000Z",
  tasks: Array.from({ length: 16 }, (_, index) => ({
    type: "work",
    title: `Task ${index} ${"x".repeat(180)}`,
    status: "todo",
    due: "2026-07-28",
    project: "Travel",
    priority: "High",
    subtasks: Array.from({ length: 20 }, (_, subIndex) => ({
      text: `Subtask ${subIndex} ${"y".repeat(120)}`,
      done: subIndex % 2 === 0,
    })),
    subtaskCountTotal: 20,
    attachments: Array.from({ length: 3 }, (_, attachmentIndex) => ({
      kind: "link",
      label: `Attachment ${attachmentIndex}`,
      url: `https://example.com/${index}/${attachmentIndex}/${"z".repeat(700)}`,
    })),
  })),
};
const carouselMessages = buildReplyMessages(parseIntent("today"), carouselSnapshot, {
  now,
  language: "en",
});
assert.equal(carouselMessages[0].type, "flex");
assert.equal(carouselMessages[0].contents.type, "carousel");
assert.ok(carouselMessages[0].contents.contents.length <= 12);
assert.ok(carouselMessages[0].contents.contents.length > 0);
assert.ok(
  new TextEncoder().encode(JSON.stringify(carouselMessages[0].contents)).byteLength <= 50 * 1024,
);

for (const language of ["en", "th"]) {
  const quickReply = buildQuickReply(language);
  assert.equal(quickReply.items.length, 13);
  assert.ok(quickReply.items.length <= 13);
  const searchItems = quickReply.items.filter((item) =>
    item.action.type === "postback" && parseSearchPromptPostback(item.action.data));
  assert.equal(searchItems.length, 1);
  assert.deepEqual(searchItems[0].action, {
    type: "postback",
    label: language === "th" ? "ค้นหา" : "Search",
    data: `action=search_prompt&lang=${language}`,
    inputOption: "openKeyboard",
    fillInText: language === "th" ? "ค้นหา " : "search ",
  });
  const plannerItems = quickReply.items.filter((item) => item.action.type === "uri");
  assert.equal(plannerItems.length, 1);
  assert.equal(plannerItems[0].action.uri, PLANNER_URL);
  // add/edit/status prefill shortcuts — three, one per kind, all English commands
  // regardless of menu language.
  const prefillItems = quickReply.items.filter((item) =>
    item.action.type === "postback" && parseMutationPromptPostback(item.action.data));
  assert.equal(prefillItems.length, 3);
  const prefillKinds = prefillItems.map((item) => parseMutationPromptPostback(item.action.data).kind).sort();
  assert.deepEqual(prefillKinds, ["add", "edit", "status"]);
  for (const item of prefillItems) {
    const parsed = parseMutationPromptPostback(item.action.data);
    assert.equal(parsed.language, language);
    assert.equal(item.action.fillInText, `${parsed.kind} `);
    assert.match(buildMutationPromptMessage(parsed.kind, parsed.language).text, /./);
  }
  for (const item of quickReply.items) {
    assert.equal(item.type, "action");
    assert.ok(item.action.label.length <= 20);
    if (item.action.type === "message") {
      assert.ok(item.action.text.length <= 300);
      assert.notEqual(parseIntent(item.action.text).kind, "unknown");
    } else if (item.action.type === "uri") {
      assert.ok(item.action.uri.startsWith("https://"));
    } else {
      assert.equal(item.action.type, "postback");
      assert.ok(item.action.data.length <= 300);
      assert.ok(item.action.fillInText.length <= 300);
      assert.ok(parseSearchPromptPostback(item.action.data) || parseMutationPromptPostback(item.action.data));
    }
  }
  // Labels must be unique — LINE would silently dedupe/confuse otherwise.
  assert.equal(new Set(quickReply.items.map(i => i.action.label)).size, 13);

  const prompt = buildSearchPromptMessage(language);
  assert.equal(prompt.type, "text");
  assert.equal(prompt.text, buildSearchPromptText(language));
  assert.equal(prompt.quickReply.items.length, quickReply.items.length);
  assert.match(prompt.text, language === "th" ? /ค้นหา พาสปอร์ต/ : /search passport/);

  const menu = buildMenuMessage(language);
  assert.equal(menu.type, "flex");
  assert.ok(menu.altText.length <= 400);
  assert.equal(menu.contents.type, "bubble");
  assert.equal(menu.quickReply.items.length, quickReply.items.length);
  assert.equal(menu.contents.body.contents.length, 7);
  assert.deepEqual(
    menu.contents.body.contents.map((row) => row.contents.length),
    [2, 2, 2, 2, 2, 2, 1],
  );
  const menuActions = menu.contents.body.contents
    .flatMap((row) => row.contents)
    .map((button) => button.action);
  assert.deepEqual(menuActions, quickReply.items.map((item) => item.action));
}

const linkedMessages = buildLinkReplyMessages("linked");
assert.equal(linkedMessages.length, 2);
assert.ok(linkedMessages.length <= 5);
assert.match(linkedMessages[0].text, /connected/i);
assert.equal(linkedMessages[1].type, "flex");
assert.match(linkedMessages[1].altText, /Todo Planner question menu/);
assert.equal(buildLinkReplyMessages("line_in_use").length, 1);

const rawBody = JSON.stringify({ events: [] });
const channelSecret = "test-channel-secret";
const signature = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
assert.equal(await verifyLineSignature(rawBody, signature, channelSecret, webcrypto), true);
assert.equal(await verifyLineSignature(`${rawBody} `, signature, channelSecret, webcrypto), false);
assert.equal((await sha256Hex("MTP-ABCD-2345", webcrypto)).length, 64);

console.log("LINE bot logic: PASS");
