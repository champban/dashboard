import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_EVENT_LEASE_SECONDS,
  deriveLineEventId,
  processLineEventBatch,
} from "../supabase/functions/line-todo-webhook/event-processing.js";
import { verifyLineSignature } from "../supabase/functions/line-todo-webhook/logic.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LINE_APP_DIR = process.env.LINE_APP_DIR;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!LINE_APP_DIR) throw new Error("LINE_APP_DIR is required");

const require = createRequire(import.meta.url);
const forwarderPath = path.join(
  LINE_APP_DIR,
  "lib",
  "lineWebhookForwarder.js",
);
const {
  DEFAULT_FORWARD_TIMEOUT_MS,
  handleLineWebhookRequest,
} = require(forwarderPath);

assert.equal(
  DEFAULT_FORWARD_TIMEOUT_MS,
  8000,
  "the gate must exercise the Production Netlify timeout",
);
assert.equal(
  DEFAULT_EVENT_LEASE_SECONDS,
  30,
  "the gate must exercise the reviewed 30-second event lease",
);

const CHANNEL_SECRET = "l0a-isolated-gate-secret";
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const SLOW_COMPLETE_MS = DEFAULT_FORWARD_TIMEOUT_MS + 1000;
const CRASH_AFTER_CLAIM_MS = DEFAULT_FORWARD_TIMEOUT_MS + 1000;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(query) {
  return execFileSync(
    "psql",
    [DATABASE_URL, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", query],
    { encoding: "utf8" },
  ).trim();
}

function parseClaim(value) {
  const [decision, attemptRaw] = String(value).trim().split("|");
  const attemptCount = Number(attemptRaw);
  if (!decision || !Number.isInteger(attemptCount)) {
    throw new Error(`invalid claim result: ${value}`);
  }
  return { decision, attemptCount };
}

function createPostgresLedger() {
  return {
    async claim(eventId) {
      const result = psql(`
        set role service_role;
        select decision || '|' || attempt_count
          from public.mtp_claim_line_event(
            ${sqlLiteral(eventId)},
            null,
            ${DEFAULT_EVENT_LEASE_SECONDS}
          );
      `);
      return parseClaim(result);
    },

    async setOwner(eventId, attemptCount, ownerId) {
      const result = psql(`
        set role service_role;
        update public.mtp_line_events
           set owner_id = ${sqlLiteral(ownerId)}::uuid,
               updated_at = pg_catalog.now()
         where event_id = ${sqlLiteral(eventId)}
           and status = 'processing'
           and attempt_count = ${Number(attemptCount)}
        returning event_id;
      `);
      if (result !== eventId) throw new Error("event_ledger_lease_lost");
    },

    async finishProcessed(eventId, attemptCount) {
      const result = psql(`
        set role service_role;
        select public.mtp_finish_line_event(
          ${sqlLiteral(eventId)},
          ${Number(attemptCount)},
          'processed',
          null
        );
      `);
      if (result !== "t") throw new Error("event_ledger_lease_lost");
    },

    async finishFailed(eventId, attemptCount, errorCode) {
      const result = psql(`
        set role service_role;
        select public.mtp_finish_line_event(
          ${sqlLiteral(eventId)},
          ${Number(attemptCount)},
          'failed',
          ${sqlLiteral(errorCode)}
        );
      `);
      if (result !== "t") throw new Error("event_ledger_lease_lost");
    },
  };
}

function effectCount(eventId) {
  return Number(psql(`
    select count(*)
      from public.l0a_gate_effects
     where event_id = ${sqlLiteral(eventId)};
  `));
}

function ledgerState(eventId) {
  const value = psql(`
    select status || '|' || attempt_count
      from public.mtp_line_events
     where event_id = ${sqlLiteral(eventId)};
  `);
  const [status, attemptRaw] = value.split("|");
  return { status, attemptCount: Number(attemptRaw) };
}

function insertEffect(eventId) {
  psql(`
    insert into public.l0a_gate_effects (event_id)
    values (${sqlLiteral(eventId)})
    on conflict (event_id) do nothing;
  `);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBody(webhookEventId, text) {
  return Buffer.from(JSON.stringify({
    destination: "U-isolated-destination",
    events: [{
      type: "message",
      webhookEventId,
      deliveryContext: { isRedelivery: false },
      timestamp: 1787039000000,
      replyToken: `reply-${webhookEventId}`,
      source: {
        type: "user",
        userId: "U-isolated-user-not-persisted",
      },
      message: {
        id: `message-${webhookEventId}`,
        type: "text",
        text,
      },
    }],
  }));
}

function signatureFor(body) {
  return createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
}

function sendViaForwarder(body, localUpstreamUrl) {
  return handleLineWebhookRequest({
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signatureFor(body),
    },
    rawBody: body,
    env: {
      LINE_CHANNEL_SECRET: CHANNEL_SECRET,
      SUPABASE_LINE_WEBHOOK_URL:
        "https://isolated.supabase.test/functions/v1/line-todo-webhook",
    },
    // Keep all Production forwarder validation and timeout behavior. Only route
    // the approved HTTPS test hostname to this throwaway local upstream.
    fetchImpl: (_url, options) => fetch(localUpstreamUrl, options),
  });
}

psql(`
  create table if not exists public.l0a_gate_effects (
    event_id text primary key,
    created_at timestamptz not null default pg_catalog.now()
  );
  truncate table public.l0a_gate_effects;
  delete from public.mtp_line_events where event_id like 'line:gate-%';
  insert into auth.users (id) values (${sqlLiteral(OWNER_ID)}::uuid)
  on conflict (id) do nothing;
`);

const ledger = createPostgresLedger();
const crashOnce = new Set();

const server = http.createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    const rawText = rawBody.toString("utf8");
    const signature = String(request.headers["x-line-signature"] || "");

    if (!await verifyLineSignature(rawText, signature, CHANNEL_SECRET)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_signature" }));
      return;
    }

    const payload = JSON.parse(rawText);
    const events = Array.isArray(payload.events) ? payload.events : [];
    const firstEvent = events[0];
    const eventId = firstEvent ? await deriveLineEventId(firstEvent) : "";

    if (
      firstEvent?.message?.text === "crash-after-claim"
      && !crashOnce.has(eventId)
    ) {
      crashOnce.add(eventId);
      const claim = await ledger.claim(eventId);
      assert.equal(claim.decision, "claimed");
      insertEffect(eventId);
      await sleep(CRASH_AFTER_CLAIM_MS);
      // Deliberately leave the row in processing to model an invocation that
      // dies after the side effect but before ledger finalization.
      if (!response.destroyed) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "synthetic_crash" }));
      }
      return;
    }

    const batch = await processLineEventBatch({
      events,
      ledger,
      processEvent: async (event, context) => {
        await context.setOwner(OWNER_ID);
        insertEffect(context.eventId);
        if (event?.message?.text === "slow-complete") {
          await sleep(SLOW_COMPLETE_MS);
        }
      },
    });

    if (!response.destroyed) {
      response.writeHead(batch.ok ? 200 : 503, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify({
        ok: batch.ok,
        processed: batch.processedCount,
        duplicates: batch.duplicateCount,
        failed: batch.failedCount,
        busy: batch.busyCount,
      }));
    }
  } catch (error) {
    if (!response.destroyed) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "isolated_upstream_failed" }));
    }
    throw error;
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const localUpstreamUrl = `http://127.0.0.1:${address.port}/functions/v1/line-todo-webhook`;

try {
  // Gate 1: exact signed duplicate replay through the real Netlify forwarder.
  const duplicateBody = buildBody("gate-duplicate", "normal-effect");
  const duplicateEventId = "line:gate-duplicate";
  const first = await sendViaForwarder(duplicateBody, localUpstreamUrl);
  const second = await sendViaForwarder(duplicateBody, localUpstreamUrl);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(effectCount(duplicateEventId), 1);
  assert.deepEqual(ledgerState(duplicateEventId), {
    status: "processed",
    attemptCount: 1,
  });
  console.log("L0a signed duplicate replay: PASS (one effect, one processed event)");

  // Gate 2: Production 8-second forwarder timeout after upstream has already
  // created the side effect. The upstream completes at 9 seconds; redelivery
  // must be a processed duplicate rather than a second write.
  const slowBody = buildBody("gate-slow-complete", "slow-complete");
  const slowEventId = "line:gate-slow-complete";
  const slowFirst = await sendViaForwarder(slowBody, localUpstreamUrl);
  assert.equal(slowFirst.statusCode, 504);
  await sleep(1500);
  assert.deepEqual(ledgerState(slowEventId), {
    status: "processed",
    attemptCount: 1,
  });
  const slowRetry = await sendViaForwarder(slowBody, localUpstreamUrl);
  assert.equal(slowRetry.statusCode, 200);
  assert.equal(effectCount(slowEventId), 1);
  console.log("L0a timeout after upstream completion: PASS (504 then safe duplicate)");

  // Gate 3: invocation dies after a side effect but before finalization. An
  // immediate redelivery is busy/non-2xx; after the reviewed 30-second lease is
  // made stale, the same event is reclaimed without duplicating the effect.
  const staleBody = buildBody("gate-stale-reclaim", "crash-after-claim");
  const staleEventId = "line:gate-stale-reclaim";
  const staleFirstPromise = sendViaForwarder(staleBody, localUpstreamUrl);
  await sleep(DEFAULT_FORWARD_TIMEOUT_MS + 100);
  const staleFirst = await staleFirstPromise;
  assert.equal(staleFirst.statusCode, 504);

  const busyRetry = await sendViaForwarder(staleBody, localUpstreamUrl);
  assert.equal(busyRetry.statusCode, 502);
  assert.deepEqual(ledgerState(staleEventId), {
    status: "processing",
    attemptCount: 1,
  });
  assert.equal(effectCount(staleEventId), 1);

  await sleep(1200);
  psql(`
    update public.mtp_line_events
       set processing_started_at = pg_catalog.now() - interval '31 seconds'
     where event_id = ${sqlLiteral(staleEventId)};
  `);

  const staleRetry = await sendViaForwarder(staleBody, localUpstreamUrl);
  assert.equal(staleRetry.statusCode, 200);
  assert.deepEqual(ledgerState(staleEventId), {
    status: "processed",
    attemptCount: 2,
  });
  assert.equal(effectCount(staleEventId), 1);
  console.log("L0a 30-second stale lease recovery: PASS (one effect, attempt 2)");

  console.log("L0a isolated Netlify -> Supabase replay/timeout gates: PASS");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
