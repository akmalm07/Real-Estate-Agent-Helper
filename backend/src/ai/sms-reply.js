/**
 * sms-reply.js
 * ------------
 * Handles AI-generated SMS replies to leads.
 *
 * Exports:
 *   generateSmsAiReply(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo)
 *   → { reply, addNote, addTask, updateConversationState, readyToBook, optedOut }
 */

import OpenAI from 'openai';
import { lazyClient } from '../testing/local-boundary.js';
import {
  buildAgentSection,
  buildPropertySection,
  buildNotesSection,
  buildReferralGuidance,
  buildConversationContext,
  buildHistoryMessages,
  SHARED_GUIDELINES,
} from './prompt-helpers.js';

const openai = lazyClient(() => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

/*
|--------------------------------------------------------------------------
| Opt-out detection
|--------------------------------------------------------------------------
*/

/**
 * Returns true if the lead's message is an SMS opt-out ("STOP").
 *
 * @param {string} message
 * @returns {boolean}
 */
export function isOptOut(message) {
  return message.trim().toLowerCase() === 'stop';
}

/*
|--------------------------------------------------------------------------
| Response schema
|--------------------------------------------------------------------------
*/

/**
 * Strict JSON schema for SMS replies.
 * OpenAI will always return exactly this shape.
 */
const SMS_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'sms_reply',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        reply: {
          type: 'string',
          description: 'The SMS message to send to the lead.',
        },
        addNote: {
          type: ['string', 'null'],
          description: 'A note to add to the lead record, or null if nothing important to log.',
        },
        addTask: {
          type: ['object', 'null'],
          description: 'A follow-up task for the agent, or null if none needed.',
          properties: {
            title:   { type: 'string',          description: 'Short task title for the agent.' },
            dueDate: { type: ['string', 'null'], description: 'ISO 8601 date string, or null if no specific due date.' },
          },
          required: ['title', 'dueDate'],
          additionalProperties: false,
        },
        updateConversationState: {
          type: ['object', 'null'],
          description: 'Updated conversation state to persist, or null if nothing to track.',
          properties: {
            awaitingAnswer:  { type: 'boolean',          description: 'True if you asked the lead a question and are awaiting their reply.' },
            pendingQuestion: { type: ['string', 'null'], description: 'The question you asked, if awaitingAnswer is true.' },
            reason:          { type: ['string', 'null'], description: 'Brief summary of why the lead is delayed or unavailable.' },
          },
          required: ['awaitingAnswer', 'pendingQuestion', 'reason'],
          additionalProperties: false,
        },
        readyToBook: {
          type: 'boolean',
          description: 'True only if the lead has clearly expressed they are ready to schedule a viewing or appointment.',
        },
      },
      required: ['reply', 'addNote', 'addTask', 'updateConversationState', 'readyToBook'],
      additionalProperties: false,
    },
  },
};

/*
|--------------------------------------------------------------------------
| Prompt builder
|--------------------------------------------------------------------------
*/

/**
 * Builds the full messages array for an SMS reply.
 *
 * @param {object|null} lead
 * @param {object|null} conversation
 * @param {string}      inboundText
 * @param {string|null} propertyDescription
 * @param {Array}       history
 * @param {string[]}    notes
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 * @returns {Array<{role: string, content: string}>}
 */
function buildSmsMessages(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo) {
  const leadName      = lead?.name     ?? null;
  const leadSource    = lead?.source   ?? 'an unknown source';
  const referrerName  = lead?.sourceId ?? null; // sourceId holds the referrer name for referral leads
  const leadReference = leadName ? `named ${leadName}` : 'whose name is unknown';

  const systemPrompt = [
    'You are a friendly and professional real estate agent assistant communicating via SMS.',
    'Keep replies short and conversational — this is SMS, not email.',
    'Never make up property details. If you don\'t know something, say you\'ll follow up.',
    '',
    buildAgentSection(agentInfo),
    '',
    buildPropertySection(propertyDescription),
    '',
    `You are communicating with a real estate lead ${leadReference}, who came from ${leadSource}.`,
    buildReferralGuidance(leadSource, referrerName),
    '',
    buildConversationContext(conversation),
    '',
    buildNotesSection(notes),
    '',
    'Opt-out instructions:',
    '- If the lead expresses they no longer want to be contacted, let them know they can reply STOP to end all future messages.',
    '- Do not end the conversation yourself — the system handles opt-outs automatically.',
    '- Never pressure the lead to stay in the conversation.',
    '',
    SHARED_GUIDELINES,
  ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history),
    { role: 'user',   content: inboundText },
  ];
}

/*
|--------------------------------------------------------------------------
| Main export
|--------------------------------------------------------------------------
*/

/**
 * generateSmsAiReply(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo)
 * ----------------------------------------------------------------------------------------------------
 * Generates an AI SMS reply for a lead message.
 *
 * Returns immediately with an opt-out result if the lead replied "STOP".
 * Falls back gracefully if OpenAI fails.
 *
 * @param {object|null} lead
 * @param {object|null} conversation
 * @param {string}      inboundText
 * @param {string|null} propertyDescription
 * @param {Array}       history
 * @param {string[]}    notes
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 *
 * @returns {Promise<{
 *   reply:                   string|null,
 *   addNote:                 string|null,
 *   addTask:                 object|null,
 *   updateConversationState: object|null,
 *   readyToBook:             boolean,
 *   optedOut:                boolean,
 * }>}
 */
export async function generateSmsAiReply(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo = null) {
  // Handle opt-out immediately — no AI call needed
  if (isOptOut(inboundText)) {
    return {
      reply:                   null,
      addNote:                 'Lead opted out by replying STOP.',
      addTask:                 null,
      updateConversationState: null,
      readyToBook:             false,
      optedOut:                true,
    };
  }

  const messages = buildSmsMessages(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo);

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      messages,
      max_tokens:      400,
      response_format: SMS_RESPONSE_FORMAT,
    });

    const parsed = JSON.parse(completion.choices[0].message.content.trim());

    return {
      reply:                   parsed.reply                   ?? null,
      addNote:                 parsed.addNote                 ?? null,
      addTask:                 parsed.addTask                 ?? null,
      updateConversationState: parsed.updateConversationState ?? null,
      readyToBook:             parsed.readyToBook === true,
      optedOut:                false,
    };
  } catch (err) {
    console.error('[sms-reply] OpenAI call failed:', err);
    return {
      reply:                   null,
      addNote:                 null,
      addTask:                 null,
      updateConversationState: null,
      readyToBook:             false,
      optedOut:                false,
    };
  }
}
