const CANCEL_PATTERN = /^(?:cancel|ยกเลิก)$/iu;

export function isCancelCommand(value) {
  return CANCEL_PATTERN.test(String(value ?? "").trim());
}

export function cancelReplyText(language = "en") {
  return language === "th"
    ? "ยกเลิกแล้ว ไม่มีการเปลี่ยนแปลงข้อมูล"
    : "Cancelled. No changes were made.";
}

export function withCancelQuickReply(message, language = "en") {
  const current = Array.isArray(message?.quickReply?.items)
    ? message.quickReply.items
    : [];
  const cancelItem = {
    type: "action",
    action: {
      type: "message",
      label: language === "th" ? "ยกเลิก" : "Cancel",
      text: language === "th" ? "ยกเลิก" : "cancel",
    },
  };
  return {
    ...message,
    quickReply: {
      ...(message?.quickReply || {}),
      items: [...current, cancelItem],
    },
  };
}
