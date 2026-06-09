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
 *   fromNumber: string — the lead's phone number (E.164)
 *   toNumber:   string — our Twilio phone number (E.164)
 *
 * Returns:
 *   number — the conversation ID
 */
export async function findOrCreateSmsConversation(leadId, fromNumber, toNumber) {
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
    return existing[0].id;
  }

  // Create a new SMS conversation for this lead.
  // initialSender is the lead, initialRecipient is our Twilio number.
  const inserted = await db
    .insert(conversations)
    .values({
      leadId,
      type: 'sms',
      initialSender: { phone: fromNumber },
      initialRecipient: [{ phone: toNumber }],
    })
    .returning({ id: conversations.id });

  return inserted[0].id;
}

/* Saves an SMS message (inbound or outbound) to the sms table.
 *
 * Parameters:
 *   conversationId:    number        — the conversation this message belongs to
 *   direction:         'inbound' | 'outbound'
 *   body:              string        — the message text
 *   externalMessageId: string | null — Twilio MessageSid if available
 */
export async function saveSmsMessage(conversationId, direction, body, externalMessageId = null) {
  await db.insert(sms).values({
    conversationId,
    direction,
    body,
    externalMessageId,
    sentAt: new Date(),
  });
}


export async function generateSmsReply(lead, inboundSubject, inboundBody, propertyDescription, history, notes) {
  return generateAiReply('sms', lead, inboundBody, null, propertyDescription, history, notes);
}