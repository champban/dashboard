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
    attachments: [{ data: "private" }],
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
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.source, "full");
assert.equal(snapshot.tasks.length, 2);
assert.equal(snapshot.tasks[0].title, "จ่ายบิล");
assert.equal(snapshot.tasks[1].category, "Alpha");

const serialized = JSON.stringify(snapshot);
for (const forbidden of [
  "private-id",
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
assert.throws(() => bridge.buildSnapshot({}, "full"), /valid profile payload/);
assert.equal((await bridge.sha256Hex("MTP-ABCD-2345")).length, 64);

console.log("LINE browser snapshot: PASS");
