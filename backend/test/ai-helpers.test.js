import 'dotenv/config'

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
|--------------------------------------------------------------------------
| Mock OpenAI before importing the module under test.
|--------------------------------------------------------------------------
*/

mock.module('openai', { 
  defaultExport: class {
    chat = {
      completions: {
        create: async ({ messages }) => {
          // Return a sensible default based on the last user message content
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          const isSms = messages[0]?.content?.includes('SMS');

          if (isSms) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    reply: 'Thanks for reaching out! I will get back to you shortly.',
                    addNote: null,
                    addTask: null,
                    updateConversationState: null,
                    readyToBook: false,
                  }),
                },
              }],
            };
          }

          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  subject: 'Re: Your Inquiry',
                  body: 'Thank you for your interest. I will follow up soon.',
                  addNote: null,
                  addTask: null,
                  updateConversationState: null,
                  readyToBook: false,
                }),
              },
            }],
          };
        },
      },
    };
  },
});

const { isOptOut, buildPrompt, generateAiReply } = await import('../src/ai-helpers.js');

/*
|--------------------------------------------------------------------------
| isOptOut
|--------------------------------------------------------------------------
*/

describe('isOptOut', () => {
  it('returns true for "STOP"', () => {
    assert.equal(isOptOut('STOP'), true);
  });

  it('returns true for lowercase "stop"', () => {
    assert.equal(isOptOut('stop'), true);
  });

  it('returns true for mixed case "Stop"', () => {
    assert.equal(isOptOut('Stop'), true);
  });

  it('returns true for "stop" with surrounding whitespace', () => {
    assert.equal(isOptOut('  stop  '), true);
  });

  it('returns false for messages that contain "stop" but are not exactly "stop"', () => {
    assert.equal(isOptOut('please stop messaging me'), false);
  });

  it('returns false for normal messages', () => {
    assert.equal(isOptOut('I am interested in the property'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isOptOut(''), false);
  });
});

/*
|--------------------------------------------------------------------------
| buildPrompt
|--------------------------------------------------------------------------
*/

describe('buildPrompt', () => {
  const mockLead = { name: 'Jane Doe', source: 'zillow' };
  const mockConversation = {
    status: 'active',
    unansweredFollowups: 0,
    doNotContactUntil: null,
    conversationState: null,
  };

  it('returns an array of message objects', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hello', null, null, [], []);
    assert.ok(Array.isArray(messages));
    assert.ok(messages.length >= 2, 'Should have at least system + user messages');
  });

  it('first message is always the system prompt', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hello', null, null, [], []);
    assert.equal(messages[0].role, 'system');
  });

  it('last message is the inbound user message', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hello there', null, null, [], []);
    const last = messages[messages.length - 1];
    assert.equal(last.role, 'user');
    assert.ok(last.content.includes('Hello there'));
  });

  it('includes lead name in the system prompt', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hi', null, null, [], []);
    assert.ok(messages[0].content.includes('Jane Doe'));
  });

  it('includes lead source in the system prompt', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hi', null, null, [], []);
    assert.ok(messages[0].content.includes('zillow'));
  });

  it('includes property description when provided', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hi', null, '3-bed house on Oak Ave', [], []);
    assert.ok(messages[0].content.includes('3-bed house on Oak Ave'));
  });

  it('includes notes in the system prompt', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Hi', null, null, [], ['Lead has a dog']);
    assert.ok(messages[0].content.includes('Lead has a dog'));
  });

  it('injects history as alternating user/assistant messages', () => {
    const history = [
      { direction: 'outbound', body: 'Agent message 1' },
      { direction: 'inbound', body: 'Lead reply 1' },
    ];
    const messages = buildPrompt('sms', mockLead, mockConversation, 'New message', null, null, history, []);

    const assistantMsg = messages.find((m) => m.role === 'assistant' && m.content === 'Agent message 1');
    const userMsg = messages.find((m) => m.role === 'user' && m.content === 'Lead reply 1');

    assert.ok(assistantMsg, 'Should include outbound as assistant message');
    assert.ok(userMsg, 'Should include inbound as user message');
  });

  it('prefixes subject in email mode when inboundSubject is provided', () => {
    const messages = buildPrompt('email', mockLead, mockConversation, 'Body text', 'Re: Listing', null, [], []);
    const last = messages[messages.length - 1];
    assert.ok(last.content.includes('Subject: Re: Listing'));
    assert.ok(last.content.includes('Body text'));
  });

  it('does not prefix subject in sms mode', () => {
    const messages = buildPrompt('sms', mockLead, mockConversation, 'Body text', 'Some Subject', null, [], []);
    const last = messages[messages.length - 1];
    assert.equal(last.content, 'Body text');
  });

  it('handles null lead gracefully', () => {
    const messages = buildPrompt('sms', null, null, 'Hello', null, null, [], []);
    assert.ok(Array.isArray(messages));
    assert.ok(messages[0].content.includes('unknown'));
  });

  it('includes unanswered follow-up context when count >= 2', () => {
    const conv = { ...mockConversation, unansweredFollowups: 3 };
    const messages = buildPrompt('sms', mockLead, conv, 'Hi', null, null, [], []);
    assert.ok(messages[0].content.includes('3'));
  });

  it('includes doNotContactUntil context when set', () => {
    const conv = { ...mockConversation, doNotContactUntil: '2025-12-01T00:00:00Z' };
    const messages = buildPrompt('sms', mockLead, conv, 'Hi', null, null, [], []);
    assert.ok(messages[0].content.includes('2025-12-01'));
  });
});

/*
|--------------------------------------------------------------------------
| generateAiReply
|--------------------------------------------------------------------------
*/

describe('generateAiReply', () => {
  const mockLead = { name: 'John Smith', source: 'zillow' };
  const mockConversation = {
    status: 'active',
    unansweredFollowups: 0,
    doNotContactUntil: null,
    conversationState: null,
  };

  it('returns optedOut: true immediately for STOP message in sms mode', async () => {
    const result = await generateAiReply('sms', mockLead, mockConversation, 'STOP', null, null, [], []);
    assert.equal(result.optedOut, true);
    assert.equal(result.reply, null);
    assert.ok(result.addNote?.toLowerCase().includes('opted out'));
  });

  it('returns optedOut: true for lowercase stop in sms mode', async () => {
    const result = await generateAiReply('sms', mockLead, mockConversation, 'stop', null, null, [], []);
    assert.equal(result.optedOut, true);
  });

  it('returns sms shape for sms mode', async () => {
    const result = await generateAiReply('sms', mockLead, mockConversation, 'Hello', null, null, [], []);
    assert.ok('reply' in result, 'Should have reply field');
    assert.ok('addNote' in result, 'Should have addNote field');
    assert.ok('addTask' in result, 'Should have addTask field');
    assert.ok('readyToBook' in result, 'Should have readyToBook field');
    assert.ok('optedOut' in result, 'Should have optedOut field');
  });

  it('returns email shape for email mode', async () => {
    const result = await generateAiReply('email', mockLead, mockConversation, 'Hello', 'Subject', null, [], []);
    assert.ok('subject' in result, 'Should have subject field');
    assert.ok('body' in result, 'Should have body field');
    assert.ok('addNote' in result, 'Should have addNote field');
    assert.ok('addTask' in result, 'Should have addTask field');
    assert.ok('readyToBook' in result, 'Should have readyToBook field');
  });

  it('returns readyToBook as a boolean', async () => {
    const result = await generateAiReply('sms', mockLead, mockConversation, 'I want to book', null, null, [], []);
    assert.equal(typeof result.readyToBook, 'boolean');
  });
});
