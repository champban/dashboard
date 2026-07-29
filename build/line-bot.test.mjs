import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import {
  HELP_TEXT,
  buildReply,
  extractLinkCode,
  parseIntent,
  sha256Hex,
  truncateReply,
  verifyLineSignature,
  weekBounds,
} from "../supabase/functions/line-todo-webhook/logic.js";

const now = new Date("2026-07-28T02:00:00.000Z"); // 09:00 Asia/Bangkok
const snapshot = {
  dataUpdatedAt: "2026-07-28T01:30:00.000Z",
  tasks: [
    { type: "work", title: "ส่งรายงาน", status: "todo", due: "2026-07-28", project: "Alpha", priority: "High" },
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
assert.deepEqual(parseIntent("งานเกินกำหนด"), { kind: "overdue" });
assert.deepEqual(parseIntent("งานไม่มีวันกำหนด"), { kind: "no_date" });
assert.deepEqual(parseIntent("ค้นหา Alpha"), { kind: "search", query: "Alpha" });
assert.deepEqual(parseIntent("สถานะ"), { kind: "status" });
assert.deepEqual(parseIntent("ช่วยเหลือ"), { kind: "help" });
assert.deepEqual(parseIntent("คำถามที่ไม่รู้จัก"), { kind: "unknown" });

assert.equal(extractLinkCode("เชื่อม MTP-ABCD-2345"), "MTP-ABCD-2345");
assert.equal(extractLinkCode("link mtp abcd 2345"), "MTP-ABCD-2345");
assert.equal(extractLinkCode("เชื่อม MTP-ABCO-2345"), "", "ambiguous O must not be accepted");
assert.deepEqual(weekBounds("2026-07-28"), { start: "2026-07-27", end: "2026-08-02" });

const todayReply = buildReply(parseIntent("งานวันนี้"), snapshot, { now });
assert.match(todayReply, /ส่งรายงาน/);
assert.doesNotMatch(todayReply, /งานที่จบแล้ว/);
assert.doesNotMatch(todayReply, /จ่ายบิล/);

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

const statusReply = buildReply(parseIntent("สถานะ"), snapshot, { now });
assert.match(statusReply, /ค้าง 5 · เสร็จแล้ว 1/);
assert.match(statusReply, /วันนี้ 1 · เกินกำหนด 1 · ไม่มีวันกำหนด 1/);
assert.equal(buildReply(parseIntent("ช่วยเหลือ"), snapshot, { now }), HELP_TEXT);
assert.match(buildReply(parseIntent("ไม่รู้"), snapshot, { now }), /ยังไม่เข้าใจ/);
assert.ok(truncateReply("ก".repeat(6000)).length <= 4800);

const rawBody = JSON.stringify({ events: [] });
const channelSecret = "test-channel-secret";
const signature = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
assert.equal(await verifyLineSignature(rawBody, signature, channelSecret, webcrypto), true);
assert.equal(await verifyLineSignature(`${rawBody} `, signature, channelSecret, webcrypto), false);
assert.equal((await sha256Hex("MTP-ABCD-2345", webcrypto)).length, 64);

console.log("LINE bot logic: PASS");
