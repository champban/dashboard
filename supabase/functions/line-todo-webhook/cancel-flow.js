const CANCEL_PATTERN = /^(?:cancel|ยกเลิก)$/iu;
const LINE_QUICK_REPLY_MAX_ITEMS = 13;

export function isCancelCommand(value) {
  return CANCEL_PATTERN.test(String(value ?? "").trim());
}

export function cancelReplyText(language = "en") {
  return language === "th"
    ? "ยกเลิกแล้ว ไม่มีการเปลี่ยนแปลงข้อมูล"
    : "Cancelled. No changes were made.";
}

function isDatePickerItems(items) {
  if (!items.length) return false;
  return items.every((item) => {
    const action = item?.action;
    const text = String(action?.text || "").trim().toLowerCase();
    return action?.type === "message" && /^(?:add|edit)\s/.test(text);
  });
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

  // LINE allows at most 13 Quick Reply items. The date picker already uses
  // all 13 slots, so reserve one slot for Cancel by dropping only its least
  // prominent final shortcut. Do not trim unrelated 13-item menus.
  if (current.length >= LINE_QUICK_REPLY_MAX_ITEMS && !isDatePickerItems(current)) {
    return message;
  }
  const kept = current.slice(0, LINE_QUICK_REPLY_MAX_ITEMS - 1);
  return {
    ...message,
    quickReply: {
      ...(message?.quickReply || {}),
      items: [...kept, cancelItem],
    },
  };
}

export { LINE_QUICK_REPLY_MAX_ITEMS };
