import { createClient } from "@supabase/supabase-js";
import {
  buildAddDatePrompt,
  buildEditDatePrompt,
  buildLinkReplyMessages,
  buildMenuMessage,
  buildMutationPromptMessage,
  buildQuickReply,
  buildReplyMessages,
  buildSearchPromptMessage,
  buildStatusPrompt,
  buildMutationConfirmation,
  buildMutationResultMessage,
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
  sha256Hex,
  truncateReply,
  verifyLineSignature,
} from "./logic.js";
import {
  cancelReplyText,
  isCancelCommand,
  withCancelQuickReply,
} from "./cancel-flow.js";
import {
  createSupabaseLineEventLedger,
  createSupabaseMutationRepository,
  ensureMutationDraftForEvent,
  processLineEventBatch,
  replyThenAttachLineEventOwner,
  resolveMutationDecision,
} from "./event-processing.js";

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  },
);

function codedError(code: string) {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

function parseSecretKeySet(raw: string | undefined) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      const preferred = parsed.find((item) => item?.name === "default") || parsed[0];
      return preferred?.key || preferred?.value || "";
    }
    return parsed?.default || parsed?.key || parsed?.value || "";
  } catch {
    return "";
  }
}

function backendKey() {
  return parseSecretKeySet(Deno.env.get("SUPABASE_SECRET_KEYS"))
    || Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
}

async function replyLine(
  replyToken: string,
  messages: Array<Record<string, unknown>>,
  accessToken: string,
) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: messages.slice(0, 5),
    }),
  });
  if (!response.ok) throw codedError("line_reply_failed");
}

async function replyText(
  replyToken: string,
  text: string,
  accessToken: string,
  language = "th",
  withQuickReply = false,
) {
  await replyLine(replyToken, [{
    type: "text",
    text: truncateReply(text, undefined, language),
    ...(withQuickReply ? { quickReply: buildQuickReply(language) } : {}),
  }], accessToken);
}

async function handleTextEvent(
  event: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
  mutationRepository: ReturnType<typeof createSupabaseMutationRepository>,
  accessToken: string,
  eventContext: {
    eventId: string;
    setOwner: (ownerId: string) => Promise<void>;
  },
) {
  const replyToken = String(event?.replyToken || "");
  const lineUserId = String(event?.source?.userId || "");
  const text = String(event?.message?.text || "");
  if (!replyToken || !lineUserId) return;

  const linkCode = extractLinkCode(text);
  if (linkCode) {
    const codeHash = await sha256Hex(linkCode);
    const { data, error } = await supabase
      .rpc("mtp_claim_line_link", {
        p_code_hash: codeHash,
        p_line_user_id: lineUserId,
      })
      .single();
    if (error) throw codedError("line_link_claim_failed");

    await replyThenAttachLineEventOwner({
      messages: buildLinkReplyMessages(data?.status),
      ownerId: data?.owner_id,
      reply: (messages) => replyLine(replyToken, messages, accessToken),
      setOwner: eventContext.setOwner,
    });
    return;
  }

  const { data: account, error: accountError } = await supabase
    .from("mtp_line_accounts")
    .select("owner_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (accountError) throw codedError("line_account_read_failed");
  if (!account?.owner_id) {
    await replyText(
      replyToken,
      "ยังไม่ได้เชื่อม My Todo Planner ครับ\nเปิดหน้า Sync → LINE Official → สร้างรหัส แล้วส่ง “เชื่อม MTP-XXXX-XXXX” ที่นี่",
      accessToken,
    );
    return;
  }

  await eventContext.setOwner(account.owner_id);

  const language = commandLanguage(text);
  if (isCancelCommand(text)) {
    await replyText(
      replyToken,
      cancelReplyText(language),
      accessToken,
      language,
    );
    return;
  }

  const mutation = parseMutationCommand(text);
  if (mutation) {
    const draft = await ensureMutationDraftForEvent({
      eventId: eventContext.eventId,
      ownerId: account.owner_id,
      operation: mutation,
      insertDraft: mutationRepository.insertDraft,
      findDraft: mutationRepository.findDraft,
    });
    await replyLine(
      replyToken,
      [buildMutationConfirmation(mutation, draft.id, language)],
      accessToken,
    );
    return;
  }

  const needsDate = parseAddNeedsDate(text);
  if (needsDate) {
    await replyLine(
      replyToken,
      [withCancelQuickReply(buildAddDatePrompt(needsDate, language), language)],
      accessToken,
    );
    return;
  }

  const editNeedsDate = parseEditNeedsDate(text);
  if (editNeedsDate) {
    await replyLine(
      replyToken,
      [withCancelQuickReply(buildEditDatePrompt(editNeedsDate, language), language)],
      accessToken,
    );
    return;
  }

  const needsStatus = parseStatusNeedsValue(text);
  if (needsStatus) {
    await replyLine(
      replyToken,
      [withCancelQuickReply(buildStatusPrompt(needsStatus, language), language)],
      accessToken,
    );
    return;
  }

  const intent = parseIntent(text);
  if (intent.kind === "menu" || intent.kind === "search_prompt") {
    const { error } = await supabase
      .from("mtp_line_accounts")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("owner_id", account.owner_id);
    if (error) throw codedError("line_account_touch_failed");
    await replyLine(
      replyToken,
      [intent.kind === "menu"
        ? buildMenuMessage(language)
        : buildSearchPromptMessage(language)],
      accessToken,
    );
    return;
  }

  const { data: record, error: snapshotError } = await supabase
    .from("mtp_line_snapshots")
    .select("snapshot, updated_at, data_updated_at")
    .eq("owner_id", account.owner_id)
    .maybeSingle();
  if (snapshotError) throw codedError("line_snapshot_read_failed");
  if (!record?.snapshot) {
    await replyText(
      replyToken,
      "เชื่อมบัญชีแล้ว แต่ยังไม่มี snapshot งาน กรุณากด Save to Cloud ใน Todo Planner หนึ่งครั้ง",
      accessToken,
    );
    return;
  }

  const { error: touchError } = await supabase
    .from("mtp_line_accounts")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("owner_id", account.owner_id);
  if (touchError) throw codedError("line_account_touch_failed");

  const snapshot = {
    ...record.snapshot,
    updated_at: record.updated_at,
    data_updated_at: record.data_updated_at,
  };
  await replyLine(
    replyToken,
    buildReplyMessages(intent, snapshot, { language }),
    accessToken,
  );
}

async function handlePostbackEvent(
  event: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
  mutationRepository: ReturnType<typeof createSupabaseMutationRepository>,
  accessToken: string,
  eventContext: {
    setOwner: (ownerId: string) => Promise<void>;
  },
) {
  const replyToken = String(event?.replyToken || "");
  const lineUserId = String(event?.source?.userId || "");
  const mutation = parseMutationPostback(event?.postback?.data);

  if (replyToken && lineUserId && mutation) {
    const { data: account, error: accountError } = await supabase
      .from("mtp_line_accounts")
      .select("owner_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (accountError) throw codedError("line_account_read_failed");
    if (!account?.owner_id) return;

    await eventContext.setOwner(account.owner_id);
    const result = await resolveMutationDecision({
      mutation,
      ownerId: account.owner_id,
      repository: mutationRepository,
    });
    await replyLine(
      replyToken,
      [buildMutationResultMessage(
        result.status,
        result.matched,
        mutation.language,
      )],
      accessToken,
    );
    return;
  }

  if (!replyToken) return;

  const mutationPrompt = parseMutationPromptPostback(event?.postback?.data);
  if (mutationPrompt) {
    await replyLine(
      replyToken,
      [withCancelQuickReply(
        buildMutationPromptMessage(
          mutationPrompt.kind,
          mutationPrompt.language,
        ),
        mutationPrompt.language,
      )],
      accessToken,
    );
    return;
  }

  const language = parseSearchPromptPostback(event?.postback?.data);
  if (!language) return;
  await replyLine(
    replyToken,
    [buildSearchPromptMessage(language)],
    accessToken,
  );
}

async function processLineEvent(
  event: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
  mutationRepository: ReturnType<typeof createSupabaseMutationRepository>,
  accessToken: string,
  eventContext: {
    eventId: string;
    setOwner: (ownerId: string) => Promise<void>;
  },
) {
  if (
    event?.type === "message"
    && event?.message?.type === "text"
    && event?.source?.type === "user"
  ) {
    await handleTextEvent(
      event,
      supabase,
      mutationRepository,
      accessToken,
      eventContext,
    );
  } else if (
    event?.type === "postback"
    && event?.source?.type === "user"
  ) {
    await handlePostbackEvent(
      event,
      supabase,
      mutationRepository,
      accessToken,
      eventContext,
    );
  }
  // Unsupported but valid events are intentionally recorded as processed.
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET") || "";
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = backendKey();
  if (!channelSecret || !accessToken || !supabaseUrl || !secretKey) {
    return jsonResponse({ error: "server_not_configured" }, 500);
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }
  const signature = request.headers.get("x-line-signature") || "";
  if (!await verifyLineSignature(rawBody, signature, channelSecret)) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
  if (!events.length) return jsonResponse({ ok: true });

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const ledger = createSupabaseLineEventLedger(supabase);
    const mutationRepository = createSupabaseMutationRepository(supabase);
    const batch = await processLineEventBatch({
      events,
      ledger,
      processEvent: (event, eventContext) => processLineEvent(
        event,
        supabase,
        mutationRepository,
        accessToken,
        eventContext,
      ),
    });

    if (!batch.ok) {
      // No internal retry worker owns failed events yet. A retryable non-2xx asks
      // LINE to redeliver; terminal events in the same batch are skipped safely.
      return jsonResponse({
        error: "event_processing_retry",
        retryable: true,
        failed: batch.failedCount,
        busy: batch.busyCount,
      }, 503);
    }

    return jsonResponse({
      ok: true,
      processed: batch.processedCount,
      duplicates: batch.duplicateCount,
    });
  } catch {
    // Do not log request bodies, LINE user ids, planner content, or secrets.
    return jsonResponse({ error: "event_processing_failed" }, 500);
  }
});
