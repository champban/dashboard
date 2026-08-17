import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LINE_QUICK_REPLY_MAX_ITEMS,
  cancelReplyText,
  isCancelCommand,
  withCancelQuickReply,
} from '../supabase/functions/line-todo-webhook/cancel-flow.js';

test('cancel command accepts English case-insensitively and Thai alias', () => {
  assert.equal(isCancelCommand('cancel'), true);
  assert.equal(isCancelCommand('Cancel'), true);
  assert.equal(isCancelCommand('  CANCEL  '), true);
  assert.equal(isCancelCommand('ยกเลิก'), true);
  assert.equal(isCancelCommand('cancel task'), false);
});

test('cancel reply is explicit and non-mutating in both languages', () => {
  assert.equal(cancelReplyText('en'), 'Cancelled. No changes were made.');
  assert.equal(cancelReplyText('th'), 'ยกเลิกแล้ว ไม่มีการเปลี่ยนแปลงข้อมูล');
});

test('cancel quick reply is appended without dropping existing choices when space exists', () => {
  const original = {
    type: 'text',
    text: 'Pick status',
    quickReply: {
      items: [{ type: 'action', action: { type: 'message', label: 'Done', text: 'status Task, done' } }],
    },
  };
  const result = withCancelQuickReply(original, 'en');

  assert.equal(result.quickReply.items.length, 2);
  assert.equal(result.quickReply.items[0].action.label, 'Done');
  assert.deepEqual(result.quickReply.items[1], {
    type: 'action',
    action: { type: 'message', label: 'Cancel', text: 'cancel' },
  });
  assert.equal(original.quickReply.items.length, 1);
});

test('13-item date picker reserves one slot for Cancel and never exceeds LINE limit', () => {
  const items = Array.from({ length: 13 }, (_, index) => ({
    type: 'action',
    action: {
      type: 'message',
      label: `Date ${index + 1}`,
      text: `edit work Receive Visa, ${index + 1 === 1 ? 'today' : 'beginning of next month'}`,
    },
  }));
  const result = withCancelQuickReply({ type: 'text', text: 'When?', quickReply: { items } }, 'en');

  assert.equal(result.quickReply.items.length, LINE_QUICK_REPLY_MAX_ITEMS);
  assert.equal(result.quickReply.items.at(-1).action.label, 'Cancel');
  assert.equal(result.quickReply.items.at(-1).action.text, 'cancel');
  assert.equal(result.quickReply.items[0].action.label, 'Date 1');
  assert.equal(result.quickReply.items[11].action.label, 'Date 12');
});

test('unrelated full 13-item menu is preserved rather than silently trimmed', () => {
  const items = Array.from({ length: 13 }, (_, index) => ({
    type: 'action',
    action: index === 0
      ? { type: 'postback', label: 'Add', data: 'action=mutation_prompt&kind=add&lang=en' }
      : { type: 'message', label: `Menu ${index}`, text: `menu ${index}` },
  }));
  const message = { type: 'text', text: 'Menu', quickReply: { items } };
  const result = withCancelQuickReply(message, 'en');

  assert.equal(result, message);
  assert.equal(result.quickReply.items.length, LINE_QUICK_REPLY_MAX_ITEMS);
});

test('Thai cancel quick reply uses Thai label and command', () => {
  const result = withCancelQuickReply({ type: 'text', text: 'เลือก' }, 'th');
  assert.deepEqual(result.quickReply.items, [{
    type: 'action',
    action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิก' },
  }]);
});
