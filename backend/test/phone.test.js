import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSMS } from '../src/phone.js';

test('sendSMS sends real message using Telnyx', async () => {
  const result = await sendSMS(
    '+19295088926',
    'Hello from REAL test'
  );

  console.log(result);

  assert.ok(result);
});