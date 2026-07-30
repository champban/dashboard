import { createClient } from "@supabase/supabase-js";
import {
  buildLinkReplyMessages,
  buildMenuMessage,
  buildQuickReply,
  buildReply,
  buildReplyMessages,
  commandLanguage,
  extractLinkCode,
  parseIntent,
  sha256Hex,
  truncateReply,
  verifyLineSignature,
} from "./logic.js";

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
  if (!response.ok) throw new Error(`LINE reply failed (${response.status})`);
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
  accessToken: string,
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
    if (error) throw new Error("Could not claim LINE link code");
    const status = data?.status;
    await replyLine(replyToken, buildLinkReplyMessages(status), accessToken);
    return;
  }

  const { data: account, error: accountError } = await supabase
    .from("mtp_line_accounts")
    .select("owner_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (accountError) throw new Error("Could not read LINE account mapping");
  if (!account?.owner_id) {
    await replyText(
      replyToken,
      "ยังไม่ได้เชื่อม My Todo Planner ครับ\nเปิดหน้า Sync → LINE Official → สร้างรหัส แล้วส่ง “เชื่อม MTP-XXXX-XXXX” ที่นี่",
      accessToken,
    );
    return;
  }

  const language = commandLanguage(text);
  const intent = parseIntent(text);
  if (intent.kind === "menu") {
    await supabase
      .from("mtp_line_accounts")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("owner_id", account.owner_id);
    await replyLine(replyToken, [buildMenuMessage(language)], accessToken);
    return;
  }

  const { data: record, error: snapshotError } = await supabase
    .from("mtp_line_snapshots")
    .select("snapshot, updated_at, data_updated_at")
    .eq("owner_id", account.owner_id)
    .maybeSingle();
  if (snapshotError) throw new Error("Could not read planner snapshot");
  if (!record?.snapshot) {
    await replyText(
      replyToken,
      "เชื่อมบัญชีแล้ว แต่ยังไม่มี snapshot งาน กรุณากด Save to Cloud ใน Todo Planner หนึ่งครั้ง",
      accessToken,
    );
    return;
  }

  await supabase
    .from("mtp_line_accounts")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("owner_id", account.owner_id);

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
    for (const event of events) {
      if (
        event?.type === "message"
        && event?.message?.type === "text"
        && event?.source?.type === "user"
      ) {
        await handleTextEvent(event, supabase, accessToken);
      }
    }
    return jsonResponse({ ok: true });
  } catch {
    // Do not log request bodies, LINE user ids, planner content, or secrets.
    return jsonResponse({ error: "event_processing_failed" }, 500);
  }
});
