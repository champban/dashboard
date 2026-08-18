const FALLBACK_VOLATILE_KEYS = new Set([
  "deliveryContext",
  "replyToken",
  "webhookEventId",
]);

const CLAIMED_DECISIONS = new Set([
  "claimed",
  "claimed_retry",
  "claimed_stale",
]);

export const DEFAULT_EVENT_LEASE_SECONDS = 30;

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  return Object.keys(value)
    .filter((key) => !FALLBACK_VOLATILE_KEYS.has(key) && value[key] !== undefined)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveLineEventId(
  event,
  cryptoImpl = globalThis.crypto,
) {
  const externalId = String(event?.webhookEventId || "").trim();
  if (externalId.length >= 1 && externalId.length <= 160) {
    return `line:${externalId}`;
  }

  if (!cryptoImpl?.subtle) {
    throw codedError("event_identity_unavailable");
  }

  const canonical = JSON.stringify(canonicalize(event || {}));
  const digest = await cryptoImpl.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return `fallback:${bytesToHex(new Uint8Array(digest))}`;
}

export function safeErrorCode(error) {
  const candidate = String(error?.code || "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(candidate)
    ? candidate
    : "event_processing_failed";
}

export async function replyThenAttachLineEventOwner({
  messages,
  ownerId,
  reply,
  setOwner,
}) {
  if (typeof reply !== "function") {
    throw codedError("line_reply_handler_missing");
  }

  await reply(messages);

  if (ownerId) {
    if (typeof setOwner !== "function") {
      throw codedError("event_owner_handler_missing");
    }
    await setOwner(ownerId);
  }
}

export function createSupabaseLineEventLedger(
  supabase,
  { staleAfterSeconds = DEFAULT_EVENT_LEASE_SECONDS } = {},
) {
  if (!supabase || typeof supabase.rpc !== "function") {
    throw codedError("event_ledger_client_missing");
  }

  return {
    async claim(eventId) {
      const request = supabase.rpc("mtp_claim_line_event", {
        p_event_id: eventId,
        p_owner_id: null,
        p_stale_after_seconds: staleAfterSeconds,
      });
      const { data, error } = typeof request.single === "function"
        ? await request.single()
        : await request;
      if (error) throw codedError("event_ledger_claim_failed");

      const row = Array.isArray(data) ? data[0] : data;
      const attemptCount = Number(row?.attempt_count || 0);
      if (!row?.decision || !Number.isInteger(attemptCount)) {
        throw codedError("event_ledger_claim_invalid");
      }

      return {
        decision: row.decision,
        attemptCount,
      };
    },

    async setOwner(eventId, attemptCount, ownerId) {
      if (!ownerId) return;
      const { data, error } = await supabase
        .from("mtp_line_events")
        .update({
          owner_id: ownerId,
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId)
        .eq("status", "processing")
        .eq("attempt_count", attemptCount)
        .select("event_id")
        .maybeSingle();
      if (error) throw codedError("event_ledger_owner_failed");
      if (!data?.event_id) throw codedError("event_ledger_lease_lost");
    },

    async finishProcessed(eventId, attemptCount) {
      return finish(eventId, attemptCount, "processed", null);
    },

    async finishFailed(eventId, attemptCount, errorCode) {
      return finish(eventId, attemptCount, "failed", errorCode);
    },
  };

  async function finish(eventId, attemptCount, status, errorCode) {
    const { data, error } = await supabase.rpc("mtp_finish_line_event", {
      p_event_id: eventId,
      p_attempt_count: attemptCount,
      p_status: status,
      p_error_code: errorCode,
    });
    if (error) throw codedError("event_ledger_finish_failed");
    if (data !== true) throw codedError("event_ledger_lease_lost");
    return true;
  }
}

export function createSupabaseMutationRepository(supabase) {
  if (!supabase || typeof supabase.from !== "function") {
    throw codedError("mutation_repository_client_missing");
  }

  return {
    async insertDraft({ eventId, ownerId, operation }) {
      const { data, error } = await supabase
        .from("mtp_line_mutations")
        .insert({
          owner_id: ownerId,
          operation,
          source_event_id: eventId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },

    async findDraft({ eventId, ownerId }) {
      const { data, error } = await supabase
        .from("mtp_line_mutations")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("source_event_id", eventId)
        .maybeSingle();
      if (error) throw codedError("mutation_draft_lookup_failed");
      return data;
    },

    async applyDecision({ mutationId, ownerId, status, now }) {
      const { data, error } = await supabase
        .from("mtp_line_mutations")
        .update({
          status,
          updated_at: now,
          ...(status === "confirmed" ? { confirmed_at: now } : {}),
        })
        .eq("id", mutationId)
        .eq("owner_id", ownerId)
        .eq("status", "draft")
        .gt("expires_at", now)
        .select("id")
        .maybeSingle();
      if (error) throw codedError("line_mutation_decision_failed");
      return data;
    },

    async findStatus({ mutationId, ownerId }) {
      const { data, error } = await supabase
        .from("mtp_line_mutations")
        .select("status")
        .eq("id", mutationId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) throw codedError("line_mutation_decision_read_failed");
      return data;
    },
  };
}

export async function ensureMutationDraftForEvent({
  eventId,
  ownerId,
  operation,
  insertDraft,
  findDraft,
}) {
  if (!eventId || !ownerId || !operation) {
    throw codedError("mutation_draft_input_invalid");
  }
  if (typeof insertDraft !== "function" || typeof findDraft !== "function") {
    throw codedError("mutation_draft_repository_missing");
  }

  try {
    const inserted = await insertDraft({ eventId, ownerId, operation });
    if (!inserted?.id) throw codedError("mutation_draft_insert_invalid");
    return { id: inserted.id, reused: false };
  } catch (error) {
    if (!["23505", "unique_violation"].includes(String(error?.code || ""))) {
      throw error;
    }
  }

  const existing = await findDraft({ eventId, ownerId });
  if (!existing?.id) throw codedError("mutation_draft_idempotency_failed");
  return { id: existing.id, reused: true };
}

export async function resolveMutationDecision({
  mutation,
  ownerId,
  repository,
  now = new Date(),
}) {
  if (!mutation?.id || !ownerId || !repository) {
    throw codedError("mutation_decision_input_invalid");
  }
  if (
    typeof repository.applyDecision !== "function"
    || typeof repository.findStatus !== "function"
  ) {
    throw codedError("mutation_decision_repository_missing");
  }

  const status = mutation.decision === "confirm" ? "confirmed" : "cancelled";
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const updated = await repository.applyDecision({
    mutationId: mutation.id,
    ownerId,
    status,
    now: nowIso,
  });
  if (updated?.id) return { status, matched: true };

  const existing = await repository.findStatus({
    mutationId: mutation.id,
    ownerId,
  });
  return { status, matched: existing?.status === status };
}

export async function processLineEventBatch({
  events = [],
  ledger,
  processEvent,
  deriveEventId = deriveLineEventId,
}) {
  if (!ledger || typeof ledger.claim !== "function") {
    throw codedError("event_ledger_missing");
  }
  if (typeof processEvent !== "function") {
    throw codedError("event_processor_missing");
  }

  const results = [];

  for (const event of events) {
    let eventId;
    try {
      eventId = await deriveEventId(event);
    } catch (error) {
      results.push({ status: "failed", errorCode: safeErrorCode(error) });
      continue;
    }

    let claim;
    try {
      claim = await ledger.claim(eventId);
    } catch (error) {
      results.push({ status: "failed", errorCode: safeErrorCode(error) });
      continue;
    }

    if (claim.decision === "duplicate_processed") {
      results.push({ status: "duplicate_processed" });
      continue;
    }

    if (!CLAIMED_DECISIONS.has(claim.decision)) {
      results.push({
        status: claim.decision === "busy" ? "busy" : "failed",
        errorCode: claim.decision === "busy"
          ? "event_processing_busy"
          : "event_claim_rejected",
      });
      continue;
    }

    const eventContext = {
      eventId,
      attemptCount: claim.attemptCount,
      setOwner: (ownerId) => ledger.setOwner(
        eventId,
        claim.attemptCount,
        ownerId,
      ),
    };

    try {
      await processEvent(event, eventContext);
      await ledger.finishProcessed(eventId, claim.attemptCount);
      results.push({ status: "processed" });
    } catch (error) {
      const errorCode = safeErrorCode(error);
      try {
        await ledger.finishFailed(eventId, claim.attemptCount, errorCode);
      } catch {
        // Keep the HTTP result retryable. Do not log event ids, bodies or content.
      }
      results.push({ status: "failed", errorCode });
    }
  }

  const retryable = results.some((result) =>
    result.status === "failed" || result.status === "busy"
  );

  return {
    ok: !retryable,
    retryable,
    processedCount: results.filter((result) => result.status === "processed").length,
    duplicateCount: results.filter((result) => result.status === "duplicate_processed").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    busyCount: results.filter((result) => result.status === "busy").length,
    results,
  };
}
