import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('cancel quick reply is appended without dropping existing choices', () => {
  const original = {
    type: 'text',
    text: 'When?',
    quickReply: {
      items: [{ type: 'action', action: { type: 'message', label: 'Today', text: 'today' } }],
    },
  };
  const result = withCancelQuickReply(original, 'en');

  assert.equal(result.quickReply.items.length, 2);
  assert.equal(result.quickReply.items[0].action.label, 'Today');
  assert.deepEqual(result.quickReply.items[1], {
    type: 'action',
    action: { type: 'message', label: 'Cancel', text: 'cancel' },
  });
  assert.equal(original.quickReply.items.length, 1);
});

test('Thai cancel quick reply uses Thai label and command', () => {
  const result = withCancelQuickReply({ type: 'text', text: 'เลือก' }, 'th');
  assert.deepEqual(result.quickReply.items, [{
    type: 'action',
    action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิก' },
  }]);
});
