/**
 * email-reply.js
 * --------------
 * Handles AI-generated email replies to leads.
 *
 * Exports:
 *   generateEmailAiReply(lead, conversation, inboundSubject, inboundBody, propertyDescription, history, notes, agentInfo)
 *   → { subject, body, addNote, addTask, updateConversationState, readyToBook }
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
| Response schema
|--------------------------------------------------------------------------
*/

/**
 * Strict JSON schema for email replies.
 * OpenAI will always return exactly this shape.
 *
 * Note: oneOf is not supported by OpenAI Structured Outputs.
 * Nullable objects are expressed as type: ['object', 'null'] instead.
 */
const EMAIL_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'email_reply',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'The email subject line. Prefix with "Re: " if replying to an existing thread.',
        },
        body: {
          type: 'string',
          description: 'The full email body to send to the lead.',
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
            reason:          { type: ['string', 'null'], description: 'Brief summary of why the lead is delayed or unavailable, if applicable.' },
          },
          required: ['awaitingAnswer', 'pendingQuestion', 'reason'],
          additionalProperties: false,
        },
        readyToBook: {
          type: 'boolean',
          description: 'True only if the lead has clearly expressed they are ready to schedule a viewing or appointment.',
        },
      },
      required: ['subject', 'body', 'addNote', 'addTask', 'updateConversationState', 'readyToBook'],
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
 * Builds the full messages array for an email reply.
 *
 * @param {object|null} lead
 * @param {object|null} conversation
 * @param {string|null} inboundSubject
 * @param {string}      inboundBody
 * @param {string|null} propertyDescription
 * @param {Array}       history
 * @param {string[]}    notes
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 * @returns {Array<{role: string, content: string}>}
 */
function buildEmailMessages(lead, conversation, inboundSubject, inboundBody, propertyDescription, history, notes, agentInfo) {
  const leadName      = lead?.name     ?? null;
  const leadSource    = lead?.source   ?? 'an unknown source';
  const referrerName  = lead?.sourceId ?? null; // sourceId holds the referrer name for referral leads
  const leadReference = leadName ? `named ${leadName}` : 'whose name is unknown';

  const systemPrompt = [
    'You are a friendly and professional real estate agent assistant communicating via email.',
    'Write replies that are polite, clear, and appropriately detailed — this is email, not SMS.',
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
    'Guidelines for subject:',
    '- If replying to an existing thread, prefix the original subject with "Re: " if not already present.',
    '- If this is a new conversation, write a relevant subject line.',
    '',
    SHARED_GUIDELINES,
  ].filter(Boolean).join('\n');

  // Build the inbound user message — include subject if present
  const inboundMessage = inboundSubject
    ? `Subject: ${inboundSubject}\n\n${inboundBody}`
    : inboundBody;

  return [
    { role: 'system', content: systemPrompt },
    ...buildHistoryMessages(history),
    { role: 'user',   content: inboundMessage },
  ];
}

/*
|--------------------------------------------------------------------------
| Main export
|--------------------------------------------------------------------------
*/

/**
 * generateEmailAiReply(lead, conversation, inboundSubject, inboundBody, propertyDescription, history, notes, agentInfo)
 * ----------------------------------------------------------------------------------------------------------------------
 * Generates an AI email reply for a lead message.
 * Falls back gracefully if OpenAI fails.
 *
 * @param {object|null} lead
 * @param {object|null} conversation
 * @param {string|null} inboundSubject
 * @param {string}      inboundBody
 * @param {string|null} propertyDescription
 * @param {Array}       history
 * @param {string[]}    notes
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 *
 * @returns {Promise<{
 *   subject:                 string,
 *   body:                    string|null,
 *   addNote:                 string|null,
 *   addTask:                 object|null,
 *   updateConversationState: object|null,
 *   readyToBook:             boolean,
 * }>}
 */
export async function generateEmailAiReply(lead, conversation, inboundSubject, inboundBody, propertyDescription, history, notes, agentInfo = null) {
  const messages = buildEmailMessages(lead, conversation, inboundSubject, inboundBody, propertyDescription, history, notes, agentInfo);

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      messages,
      max_tokens:      800,
      response_format: EMAIL_RESPONSE_FORMAT,
    });

    const parsed = JSON.parse(completion.choices[0].message.content.trim());

    return {
      subject:                 parsed.subject                 ?? inboundSubject ?? 'Re: Your Inquiry',
      body:                    parsed.body                    ?? null,
      addNote:                 parsed.addNote                 ?? null,
      addTask:                 parsed.addTask                 ?? null,
      updateConversationState: parsed.updateConversationState ?? null,
      readyToBook:             parsed.readyToBook === true,
    };
  } catch (err) {
    console.error('[email-reply] OpenAI call failed:', err);
    return {
      subject:                 inboundSubject ?? 'Re: Your Inquiry',
      body:                    null,
      addNote:                 null,
      addTask:                 null,
      updateConversationState: null,
      readyToBook:             false,
    };
  }
}
