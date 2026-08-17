import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import { buildLinkReplyMessages } from "../supabase/functions/line-todo-webhook/logic.js";
import {
  DEFAULT_EVENT_LEASE_SECONDS,
  deriveLineEventId,
  ensureMutationDraftForEvent,
  processLineEventBatch,
  replyThenAttachLineEventOwner,
  resolveMutationDecision,
  safeErrorCode,
} from "../supabase/functions/line-todo-webhook/event-processing.js";

function createMemoryLedger({ onClaim } = {}) {
  const rows = new Map();

  return {
    rows,

    async claim(eventId) {
      const current = rows.get(eventId);
      if (!current) {
        rows.set(eventId, {
          status: "processing",
          attemptCount: 1,
          ownerId: null,
          errorCode: null,
        });
        onClaim?.(eventId);
        return { decision: "claimed", attemptCount: 1 };
      }
      if (current.status === "processed") {
        return {
          decision: "duplicate_processed",
          attemptCount: current.attemptCount,
        };
      }
      if (current.status === "processing") {
        return { decision: "busy", attemptCount: current.attemptCount };
      }

      current.status = "processing";
      current.attemptCount += 1;
      current.errorCode = null;
      onClaim?.(eventId);
      return { decision: "claimed_retry", attemptCount: current.attemptCount };
    },

    async setOwner(eventId, attemptCount, ownerId) {
      const row = rows.get(eventId);
      if (!row || row.status !== "processing" || row.attemptCount !== attemptCount) {
        const error = new Error("lease lost");
        error.code = "event_ledger_lease_lost";
        throw error;
      }
      row.ownerId = ownerId;
    },

    async finishProcessed(eventId, attemptCount) {
      return finish(eventId, attemptCount, "processed", null);
    },

    async finishFailed(eventId, attemptCount, errorCode) {
      return finish(eventId, attemptCount, "failed", errorCode);
    },
  };

  function finish(eventId, attemptCount, status, errorCode) {
    const row = rows.get(eventId);
    if (!row || row.status !== "processing" || row.attemptCount !== attemptCount) {
      const error = new Error("lease lost");
      error.code = "event_ledger_lease_lost";
      throw error;
    }
    row.status = status;
    row.errorCode = errorCode;
    return true;
  }
}

function createMemoryMutationRepository(initialRow = null) {
  let row = initialRow ? { ...initialRow } : null;

  return {
    get row() {
      return row;
    },

    async applyDecision({ mutationId, ownerId, status, now }) {
      if (
        !row
        || row.id !== mutationId
        || row.ownerId !== ownerId
        || row.status !== "draft"
        || row.expiresAt <= now
      ) {
        return null;
      }
      row = { ...row, status };
      return { id: row.id };
    },

    async findStatus({ mutationId, ownerId }) {
      if (!row || row.id !== mutationId || row.ownerId !== ownerId) return null;
      return { status: row.status };
    },
  };
}

function lineEvent(id, text, extras = {}) {
  return {
    type: "message",
    webhookEventId: id,
    replyToken: extras.replyToken || `reply-${id}`,
    deliveryContext: extras.deliveryContext || { isRedelivery: false },
    source: { type: "user", userId: "not-persisted-in-test-ledger" },
    message: { type: "text", text },
  };
}

// Same webhookEventId twice: one business mutation/reply and one processed row.
{
  const ledger = createMemoryLedger();
  let mutationWrites = 0;
  let replyAttempts = 0;
  const processEvent = async (_event, context) => {
    await context.setOwner("00000000-0000-0000-0000-000000000001");
    mutationWrites += 1;
    replyAttempts += 1;
  };

  const first = await processLineEventBatch({
    events: [lineEvent("evt-1", "add task")],
    ledger,
    processEvent,
  });
  const second = await processLineEventBatch({
    events: [lineEvent("evt-1", "add task", {
      replyToken: "redelivered-token",
      deliveryContext: { isRedelivery: true },
    })],
    ledger,
    processEvent,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicateCount, 1);
  assert.equal(mutationWrites, 1);
  assert.equal(replyAttempts, 1);
  assert.equal(ledger.rows.size, 1);
  assert.equal(ledger.rows.get("line:evt-1").status, "processed");
}

// Two-event batch: event 1 remains processed, event 2 is retryable, and a
// redelivery skips event 1 while retrying only event 2.
{
  const ledger = createMemoryLedger();
  const calls = new Map();
  let failSecondOnce = true;
  const processEvent = async (event) => {
    calls.set(event.webhookEventId, (calls.get(event.webhookEventId) || 0) + 1);
    if (event.webhookEventId === "evt-b" && failSecondOnce) {
      failSecondOnce = false;
      const error = new Error("synthetic failure");
      error.code = "synthetic_failure";
      throw error;
    }
  };

  const first = await processLineEventBatch({
    events: [lineEvent("evt-a", "first"), lineEvent("evt-b", "second")],
    ledger,
    processEvent,
  });
  assert.equal(first.ok, false);
  assert.equal(first.retryable, true);
  assert.equal(ledger.rows.get("line:evt-a").status, "processed");
  assert.equal(ledger.rows.get("line:evt-b").status, "failed");
  assert.equal(ledger.rows.get("line:evt-b").errorCode, "synthetic_failure");

  const retry = await processLineEventBatch({
    events: [
      lineEvent("evt-a", "first", { deliveryContext: { isRedelivery: true } }),
      lineEvent("evt-b", "second", { deliveryContext: { isRedelivery: true } }),
    ],
    ledger,
    processEvent,
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicateCount, 1);
  assert.equal(calls.get("evt-a"), 1);
  assert.equal(calls.get("evt-b"), 2);
  assert.equal(ledger.rows.get("line:evt-b").attemptCount, 2);
  assert.equal(ledger.rows.get("line:evt-b").status, "processed");
}

// Mutation draft idempotency closes the crash window after INSERT but before
// the event ledger reaches processed.
{
  const drafts = new Map();
  const insertDraft = async ({ eventId }) => {
    if (drafts.has(eventId)) {
      const error = new Error("unique violation");
      error.code = "23505";
      throw error;
    }
    const row = { id: "11111111-1111-4111-8111-111111111111" };
    drafts.set(eventId, row);
    return row;
  };
  const findDraft = async ({ eventId }) => drafts.get(eventId) || null;
  const input = {
    eventId: "line:evt-crash",
    ownerId: "00000000-0000-0000-0000-000000000001",
    operation: { action: "add", title: "One draft only" },
    insertDraft,
    findDraft,
  };

  const first = await ensureMutationDraftForEvent(input);
  // Simulated crash here: call again before any event-finalization state exists.
  const retry = await ensureMutationDraftForEvent(input);
  assert.equal(first.reused, false);
  assert.equal(retry.reused, true);
  assert.equal(retry.id, first.id);
  assert.equal(drafts.size, 1);
}

// This is an in-memory orchestration test only. Real claimed_stale, row locking
// and concurrent-session proof lives in supabase/tests and the PostgreSQL CI job.
{
  let claimedResolve;
  const claimed = new Promise((resolve) => { claimedResolve = resolve; });
  const ledger = createMemoryLedger({ onClaim: () => claimedResolve() });
  let releaseResolve;
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  let calls = 0;
  const processEvent = async () => {
    calls += 1;
    await release;
  };

  const firstPromise = processLineEventBatch({
    events: [lineEvent("evt-concurrent", "first")],
    ledger,
    processEvent,
  });
  await claimed;
  const second = await processLineEventBatch({
    events: [lineEvent("evt-concurrent", "second")],
    ledger,
    processEvent,
  });
  assert.equal(second.ok, false);
  assert.equal(second.busyCount, 1);
  assert.equal(calls, 1);

  releaseResolve();
  const first = await firstPromise;
  assert.equal(first.ok, true);
  assert.equal(ledger.rows.get("line:evt-concurrent").status, "processed");
}

// A one-time link-code claim is irreversible. The linked reply must therefore be
// delivered before a best-effort event-ledger owner attachment can fail.
{
  const rpcResult = {
    status: "linked",
    owner_id: "00000000-0000-0000-0000-000000000001",
  };
  const expected = buildLinkReplyMessages(rpcResult.status);
  const delivered = [];

  await assert.rejects(
    replyThenAttachLineEventOwner({
      messages: expected,
      ownerId: rpcResult.owner_id,
      reply: async (messages) => { delivered.push(messages); },
      setOwner: async () => {
        const error = new Error("synthetic ledger failure");
        error.code = "event_ledger_owner_failed";
        throw error;
      },
    }),
    /synthetic ledger failure/,
  );
  assert.deepEqual(delivered, [expected]);
}

// Mutation decisions are idempotent only for the same already-applied decision.
{
  const ownerId = "00000000-0000-0000-0000-000000000001";
  const mutationId = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-08-17T10:00:00.000Z");

  const retriedConfirm = await resolveMutationDecision({
    mutation: { id: mutationId, decision: "confirm" },
    ownerId,
    repository: createMemoryMutationRepository({
      id: mutationId,
      ownerId,
      status: "confirmed",
      expiresAt: "2026-08-17T10:10:00.000Z",
    }),
    now,
  });
  assert.deepEqual(retriedConfirm, { status: "confirmed", matched: true });

  const cancelAfterConfirm = await resolveMutationDecision({
    mutation: { id: mutationId, decision: "cancel" },
    ownerId,
    repository: createMemoryMutationRepository({
      id: mutationId,
      ownerId,
      status: "confirmed",
      expiresAt: "2026-08-17T10:10:00.000Z",
    }),
    now,
  });
  assert.deepEqual(cancelAfterConfirm, { status: "cancelled", matched: false });

  const expiredDraft = await resolveMutationDecision({
    mutation: { id: mutationId, decision: "confirm" },
    ownerId,
    repository: createMemoryMutationRepository({
      id: mutationId,
      ownerId,
      status: "draft",
      expiresAt: "2026-08-17T09:59:59.000Z",
    }),
    now,
  });
  assert.deepEqual(expiredDraft, { status: "confirmed", matched: false });

  const missingDraft = await resolveMutationDecision({
    mutation: { id: mutationId, decision: "confirm" },
    ownerId,
    repository: createMemoryMutationRepository(null),
    now,
  });
  assert.deepEqual(missingDraft, { status: "confirmed", matched: false });
}

// Missing webhookEventId never disables deduplication: volatile reply fields are
// excluded from a deterministic fallback identity.
{
  const base = {
    type: "message",
    timestamp: 1786940000000,
    source: { type: "user", userId: "U-example" },
    message: { type: "text", id: "m-1", text: "menu" },
  };
  const first = await deriveLineEventId({
    ...base,
    replyToken: "token-one",
    deliveryContext: { isRedelivery: false },
  }, webcrypto);
  const redelivery = await deriveLineEventId({
    ...base,
    replyToken: "token-two",
    deliveryContext: { isRedelivery: true },
  }, webcrypto);
  const different = await deriveLineEventId({
    ...base,
    message: { ...base.message, text: "today" },
  }, webcrypto);

  assert.match(first, /^fallback:[0-9a-f]{64}$/);
  assert.equal(redelivery, first);
  assert.notEqual(different, first);
}

assert.equal(DEFAULT_EVENT_LEASE_SECONDS, 30);
assert.equal(safeErrorCode({ code: "LINE_REPLY_FAILED" }), "line_reply_failed");
assert.equal(safeErrorCode(new Error("private message must not persist")), "event_processing_failed");

// Migration and runtime contracts: service-role-only ledger, atomic RPCs,
// idempotent mutation source key, column-level authenticated grants, and
// retention outside the request path.
{
  const migration = fs.readFileSync(
    "supabase/migrations/20260817150000_line_webhook_event_reliability.sql",
    "utf8",
  );
  const webhook = fs.readFileSync(
    "supabase/functions/line-todo-webhook/index.ts",
    "utf8",
  );
  const sqlTest = fs.readFileSync(
    "supabase/tests/line_event_ledger.test.sql",
    "utf8",
  );
  const sqlRunner = fs.readFileSync(
    "supabase/tests/run_line_event_ledger_tests.sh",
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.mtp_line_events/);
  assert.match(migration, /status in \('received', 'processing', 'processed', 'failed'\)/);
  assert.match(migration, /attempt_count integer not null default 0/);
  assert.match(migration, /alter table public\.mtp_line_events enable row level security/);
  assert.match(migration, /revoke all on table public\.mtp_line_events from anon/);
  assert.match(migration, /revoke all on table public\.mtp_line_events from authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.mtp_line_events to service_role/);
  assert.match(migration, /add column if not exists source_event_id text/);
  assert.match(migration, /create unique index if not exists mtp_line_mutations_source_event_uidx/);
  assert.match(migration, /revoke update on table public\.mtp_line_mutations from authenticated/);
  assert.match(migration, /grant update \(status, error_code, applied_at, updated_at\)/);
  assert.match(migration, /p_stale_after_seconds integer default 30/);
  assert.match(migration, /p_stale_after_seconds is null/);
  assert.match(migration, /create or replace function public\.mtp_claim_line_event/);
  assert.match(migration, /for update/);
  assert.match(migration, /create or replace function public\.mtp_finish_line_event/);
  assert.match(migration, /create or replace function public\.mtp_cleanup_line_events/);
  assert.doesNotMatch(migration, /raw_body|line_user_id|reply_token/i);

  assert.match(webhook, /replyThenAttachLineEventOwner/);
  assert.match(webhook, /createSupabaseMutationRepository/);
  assert.match(webhook, /resolveMutationDecision/);
  assert.match(webhook, /processLineEventBatch/);
  assert.match(webhook, /event_processing_retry/);
  assert.match(webhook, /}, 503\);/);
  assert.match(webhook, /event_processing_failed/);
  assert.doesNotMatch(webhook, /console\.(?:log|warn|error)/);
  assert.doesNotMatch(webhook, /mtp_cleanup_line_events/,
    "retention cleanup must stay out of the webhook critical path");

  assert.match(sqlTest, /claimed_stale/);
  assert.match(sqlTest, /claimed_retry/);
  assert.match(sqlTest, /duplicate_processed/);
  assert.match(sqlTest, /authenticated unexpectedly updated source_event_id/);
  assert.match(sqlRunner, /sql-concurrent-event/);
  assert.match(sqlRunner, /claimed=1, busy=1/);
}

console.log("LINE event processing reliability: PASS");
