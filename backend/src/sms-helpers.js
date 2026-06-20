import { db } from '../db/index.js';
import {
  leads,
  conversations,
  sms,
  leadNotes,
  leadTasks,
  properties,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { generateAiReply } from './ai-helpers.js';

const fromNumber = process.env.TELNYX_PHONE_NUMBER;

/*
|--------------------------------------------------------------------------
| SMS Database Helpers
|--------------------------------------------------------------------------
*/

/* Loads the SMS conversation history for a given lead from the database.
 * Finds all SMS-type conversations for the lead, then loads all SMS messages
 * within those conversations ordered by sentAt.
 *
 * Parameters:
 *   leadId: number — the lead's database ID
 *
 * Returns:
 *   Array of { direction: 'inbound' | 'outbound', body: string } objects
 *   ordered oldest to newest.
 */
export async function loadSmsHistory(leadId) {
  const smsConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.leadId, leadId),
        eq(conversations.type, 'sms')
      )
    );

  if (smsConversations.length === 0) {
    return [];
  }

  const allMessages = [];

  for (const conversation of smsConversations) {
    const messages = await db
      .select()
      .from(sms)
      .where(eq(sms.conversationId, conversation.id));

    allMessages.push(...messages);
  }

  // Sort oldest to newest so GPT sees the conversation in order
  allMessages.sort((a, b) => {
    const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return aTime - bTime;
  });

  return allMessages.map((m) => ({
    direction: m.direction,
    body: m.body || '',
  }));
}

/* Finds an existing SMS conversation for a lead, or creates a new one.
 * We use one conversation per lead for SMS threads.
 *
 * Parameters:
 *   leadId:     number — the lead's database ID
 *   toNumber: string — the lead's phone number (E.164)
 *
 * Returns:
 *   conversation record — either the existing or newly created conversation
 */

export async function findOrCreateSmsConversation(leadId, toNumber) {
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.leadId, leadId),
        eq(conversations.type, 'sms')
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create a new SMS conversation for this lead.
  const inserted = await db
    .insert(conversations)
    .values({
      leadId,
      type: 'sms',
      initialSender: { phone: fromNumber },
      initialRecipient: [{ phone: toNumber }],
    })
    .returning();

  return inserted[0];
}

/* Saves an SMS message (inbound or outbound) to the sms table and updates
 * the relevant timestamp on the conversation record.
 *
 * - Inbound messages update lastLeadMessageAt and reset unansweredFollowups to 0.
 * - Outbound messages update lastAgentMessageAt.
 *
 * Parameters:
 *   conversationId:    number           — the conversation this message belongs to
 *   direction:         'inbound' | 'outbound'
 *   body:              string           — the message text
 *   externalMessageId: string | null    — Telnyx MessageSid if available
 */
export async function saveSmsMessage(conversationId, direction, body, externalMessageId = null) {
  const now = new Date();

  await db.insert(sms).values({
    conversationId,
    direction,
    body,
    externalMessageId,
    sentAt: now,
  });

  if (direction === 'inbound') {
    // Lead replied — update lastLeadMessageAt and reset unansweredFollowups.
    await db
      .update(conversations)
      .set({
        lastLeadMessageAt: now,
        unansweredFollowups: 0,
      })
      .where(eq(conversations.id, conversationId));
  } else {
    // Outbound message sent — update lastAgentMessageAt.
    await db
      .update(conversations)
      .set({ lastAgentMessageAt: now })
      .where(eq(conversations.id, conversationId));
  }
}

/* Generates an AI SMS reply using GPT-4o-mini.
 * Delegates to generateAiReply() in ai-helpers.js with mode set to 'sms'.
 *
 * Parameters:
 *   lead:                object | null — the lead record from the database
 *   conversation:        object | null — the conversation record from the database
 *   inboundBody:         string        — the SMS body sent by the lead
 *   propertyDescription: string | null
 *   history:             Array         — prior SMS messages from loadSmsHistory()
 *   notes:               Array         — lead note strings from loadLeadNotes()
 *
 * Returns:
 *   { reply: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null, updateConversationState: object | null, readyToBook: boolean }
 */
export async function generateSmsReply(lead, conversation, inboundBody, propertyDescription, history, notes) {
  return generateAiReply('sms', lead, conversation, inboundBody, null, propertyDescription, history, notes);
}
