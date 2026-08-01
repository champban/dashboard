import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { Blob } from "node:buffer";
import { TextEncoder } from "node:util";

const source = fs.readFileSync("line-sync.js", "utf8");
const context = vm.createContext({
  window: { crypto: webcrypto },
  Blob,
  TextEncoder,
  URL,
  console,
});
vm.runInContext(source, context, { filename: "line-sync.js" });

const bridge = context.window.__MTP_LINE__;
assert.ok(bridge, "browser bridge must be published");

const payload = {
  appVersion: "3.78.0",
  savedAt: "2026-07-28T02:00:00.000Z",
  dataLastUpdated: "2026-07-28T01:59:00.000Z",
  profile: { id: "private-id", name: "Main" },
  personal: [{
    id: "personal-1",
    title: "<b>จ่ายบิล</b>",
    status: "pending",
    due: "2026-07-28",
    cat: "Home",
    priority: "High",
    description: "must not leave browser",
    notes: "must not leave browser",
    subtasks: [{ id: "private-subtask-id", text: "private subtask", done: false }],
    attachments: [{ id: "private-file-id", type: "file", data: "private" }],
  }],
  work: [{
    id: "work-1",
    title: "ส่งรายงาน",
    status: "todo",
    due: "2026-07-29",
    project: "Alpha",
    clientSecret: "must not leave browser",
  }],
  notes: [{ body: "private note" }],
  config: { anthropicKey: "private", googleApiKey: "private" },
};

const snapshot = bridge.buildSnapshot(payload, "full");
assert.equal(snapshot.schemaVersion, 3);
assert.equal(snapshot.source, "full");
assert.equal(snapshot.tasks.length, 2);
assert.equal(snapshot.tasks[0].title, "จ่ายบิล");
assert.equal(snapshot.tasks[1].category, "Alpha");
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.sharing)), {
  subtasks: false,
  attachmentLinks: false,
});

const withEvents = bridge.buildSnapshot({
  ...payload,
  events: [{
    id: "private-event-id",
    title: "Annual planning",
    start: "2026-12-01",
    end: "2026-12-03",
    type: "Planning",
    description: "must not leave browser",
    createdAt: "2026-08-01",
  }],
}, "full");
assert.deepEqual(JSON.parse(JSON.stringify(withEvents.events)), [{
  type: "event",
  title: "Annual planning",
  start: "2026-12-01",
  end: "2026-12-03",
  category: "Planning",
}]);
assert.equal(withEvents.eventCountTotal, 1);
assert.doesNotMatch(JSON.stringify(withEvents), /private-event-id|description|createdAt/);

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  "private-id",
  "private-subtask-id",
  "private subtask",
  "private-file-id",
  "profileName",
  "\"Main\"",
  "must not leave browser",
  "private note",
  "anthropicKey",
  "googleApiKey",
  "attachments",
  "description",
  "notes",
]) {
  assert.doesNotMatch(serialized, new RegExp(forbidden), `snapshot leaked ${forbidden}`);
}

const sharedPayload = {
  ...payload,
  config: { lineShareSubtasks: true, lineShareAttachmentLinks: true },
  personal: [{
    ...payload.personal[0],
    subtasks: [
      { id: "subtask-1", text: "<b>จองโรงแรม</b>", done: true },
      { id: "subtask-2", text: "เตรียมเอกสาร", done: false },
    ],
    attachments: [
      { id: "image-id", type: "link", label: "<b>Route photo</b>", url: "https://example.com/route.jpg" },
      { id: "video-id", type: "link", label: "Trip video", url: "https://youtu.be/example" },
      { id: "link-id", type: "link", label: "Booking", url: "https://example.com/book" },
      { id: "extra-id", type: "link", label: "Extra", url: "https://example.com/extra" },
      { id: "http-id", type: "link", label: "Unsafe", url: "http://example.com/plain" },
      { id: "credential-id", type: "link", label: "Credential", url: "https://user:pass@example.com/private" },
      { id: "file-id", type: "file", name: "private.jpg", data: "data:image/jpeg;base64,PRIVATE" },
    ],
  }],
};
const shared = bridge.buildSnapshot(sharedPayload, "full");
assert.deepEqual(JSON.parse(JSON.stringify(shared.sharing)), {
  subtasks: true,
  attachmentLinks: true,
});
assert.deepEqual(JSON.parse(JSON.stringify(shared.tasks[0].subtasks)), [
  { text: "จองโรงแรม", done: true },
  { text: "เตรียมเอกสาร", done: false },
]);
assert.equal(shared.tasks[0].subtaskCountTotal, 2);
assert.equal(shared.tasks[0].attachments.length, 3);
assert.deepEqual(
  JSON.parse(JSON.stringify(shared.tasks[0].attachments.map((item) => item.kind))),
  ["image", "video", "link"],
);
assert.equal(shared.tasks[0].attachmentCountTotal, 4);
assert.equal(shared.tasks[0].attachmentsTruncated, true);
const sharedSerialized = JSON.stringify(shared);
for (const forbidden of [
  "subtask-1",
  "image-id",
  "http://example.com/plain",
  "user:pass",
  "data:image/jpeg",
  "PRIVATE",
]) {
  assert.doesNotMatch(sharedSerialized, new RegExp(forbidden), `shared snapshot leaked ${forbidden}`);
}

const many = {
  ...payload,
  personal: Array.from({ length: 510 }, (_, index) => ({
    title: `Task ${index}`,
    status: "pending",
    due: "",
  })),
  work: [],
};
const capped = bridge.buildSnapshot(many, "mobile");
assert.equal(capped.tasks.length, 500);
assert.equal(capped.taskCountTotal, 510);
assert.equal(capped.truncated, true);

const newestFarFuture = bridge.buildSnapshot({
  ...payload,
  dataLastUpdated: "2026-08-01T08:37:00.000Z",
  personal: [
    ...Array.from({ length: 500 }, (_, index) => ({
      title: `Older task ${index}`,
      status: "pending",
      due: "2026-08-01",
      createdAt: "2026-07-01",
    })),
    {
      title: "Buy AIA",
      status: "pending",
      due: "2026-12-01",
      createdAt: "2026-08-01",
    },
  ],
  work: [],
}, "full");
assert.equal(newestFarFuture.tasks.length, 500);
assert.ok(
  newestFarFuture.tasks.some((task) => task.title === "Buy AIA" && task.due === "2026-12-01"),
  "a newly-added far-future task must survive snapshot truncation so LINE search can find it",
);
assert.doesNotMatch(JSON.stringify(newestFarFuture), /createdAt/);

const largeShared = {
  ...payload,
  config: { lineShareSubtasks: true, lineShareAttachmentLinks: true },
  personal: Array.from({ length: 500 }, (_, index) => ({
    title: `Large task ${index}`,
    status: "pending",
    subtasks: Array.from({ length: 20 }, (_, subIndex) => ({
      text: `Subtask ${subIndex} ${"x".repeat(150)}`,
      done: subIndex % 2 === 0,
    })),
    attachments: Array.from({ length: 3 }, (_, attachmentIndex) => ({
      type: "link",
      label: `Attachment ${attachmentIndex}`,
      url: `https://example.com/${index}/${attachmentIndex}/${"x".repeat(850)}`,
    })),
  })),
  work: [],
};
const budgeted = bridge.buildSnapshot(largeShared, "full");
assert.ok(new Blob([JSON.stringify(budgeted)]).size <= 240 * 1024);
assert.equal(budgeted.taskCountTotal, 500);
assert.equal(budgeted.truncated, true);
assert.ok(budgeted.tasks.length > 0 && budgeted.tasks.length < 500);

assert.throws(() => bridge.buildSnapshot({}, "full"), /valid profile payload/);
assert.equal((await bridge.sha256Hex("MTP-ABCD-2345")).length, 64);

console.log("LINE browser snapshot: PASS");
