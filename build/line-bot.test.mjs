import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import {
  HELP_TEXT,
  HELP_TEXT_EN,
  PLANNER_URL,
  addDaysISO,
  buildLinkReplyMessages,
  buildMenuMessage,
  buildMutationConfirmation,
  buildMutationResultMessage,
  buildQuickReply,
  buildReply,
  buildReplyMessages,
  buildSearchPromptMessage,
  buildSearchPromptText,
  commandLanguage,
  extractLinkCode,
  parseIntent,
  parseMutationCommand,
  parseMutationPostback,
  parseSearchPromptPostback,
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
// "mid of next N months" is intentionally unsupported — no single agreed meaning yet.
assert.equal(parseMutationCommand("add Party, mid of next 3 months",now),null);

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
const confirmedReply=buildMutationResultMessage("confirmed",true);
assert.match(confirmedReply.text,/Confirmed/);
assert.equal(confirmedReply.quickReply.items[0].action.uri,PLANNER_URL);
assert.equal(buildMutationResultMessage("cancelled",true).quickReply,undefined);
assert.match(buildMutationResultMessage("cancelled",true).text,/Cancelled/);
assert.match(buildMutationResultMessage("confirmed",false).text,/expired|already used/);

const mutationId="123e4567-e89b-12d3-a456-426614174000";
assert.deepEqual(parseMutationPostback(`mutation=confirm&id=${mutationId}`),{decision:"confirm",id:mutationId});
assert.match(JSON.stringify(buildMutationConfirmation(parseMutationCommand("add Buy insurance, 01-12-2026"),mutationId,"en")),/Confirm/);
assert.deepEqual(parseTemporalSearch("Buy December 2026"), {
  query: "buy", start: "2026-12-01", end: "2026-12-31", scope: "all",
});
assert.deepEqual(parseTemporalSearch("กิจกรรม สัปดาห์ 49 ปี 2026"), {
  query: "", start: "2026-11-30", end: "2027-02-07", scope: "event",
});
assert.deepEqual(parseTemporalSearch("week36 2026"), {
  query: "", start: "2026-08-31", end: "2026-11-08", scope: "all",
});
assert.deepEqual(parseTemporalSearch("งาน เดือน 12 ปี 2026"), {
  query: "", start: "2026-12-01", end: "2026-12-31", scope: "task",
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
assert.equal(todayMessages[0].quickReply.items.length, 9);
const todayFlexText = JSON.stringify(todayMessages[0]);
assert.match(todayFlexText, /ส่งรายงาน/);
assert.match(todayFlexText, /ตรวจตัวเลข/);
assert.match(todayFlexText, /ส่งให้ทีม/);
assert.match(todayFlexText, /https:\/\/example\.com\/diagram\.png/);
assert.match(todayFlexText, /https:\/\/youtu\.be\/demo/);
assert.doesNotMatch(todayFlexText, /http:\/\/example\.com\/unsafe/);
const attachmentActions = todayMessages[0].contents.footer.contents.map((button) => button.action);
assert.ok(attachmentActions.every((action) => action.type === "uri"));
assert.ok(attachmentActions.every((action) => action.uri.startsWith("https://")));
assert.ok(attachmentActions.every((action) => action.altUri.desktop === action.uri));

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
  assert.equal(quickReply.items.length, 9);
  assert.ok(quickReply.items.length <= 13);
  const searchItems = quickReply.items.filter((item) => item.action.type === "postback");
  assert.equal(searchItems.length, 1);
  assert.deepEqual(searchItems[0].action, {
    type: "postback",
    label: language === "th" ? "ค้นหา" : "Search",
    data: `action=search_prompt&lang=${language}`,
    inputOption: "openKeyboard",
    fillInText: language === "th" ? "ค้นหา " : "search ",
  });
  for (const item of quickReply.items) {
    assert.equal(item.type, "action");
    assert.ok(item.action.label.length <= 20);
    if (item.action.type === "message") {
      assert.ok(item.action.text.length <= 300);
      assert.notEqual(parseIntent(item.action.text).kind, "unknown");
    } else {
      assert.equal(item.action.type, "postback");
      assert.ok(item.action.data.length <= 300);
      assert.ok(item.action.fillInText.length <= 300);
      assert.ok(parseSearchPromptPostback(item.action.data));
    }
  }

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
  assert.equal(menu.contents.body.contents.length, 5);
  assert.deepEqual(
    menu.contents.body.contents.map((row) => row.contents.length),
    [2, 2, 2, 2, 1],
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
