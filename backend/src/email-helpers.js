import { db } from '../db/index.js';
import {
  leads,
  conversations,
  email,
  leadNotes,
  leadTasks,
  properties,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createGmailAuthClient, sendEmail as gmailSend } from './gmail.js';
import { generateAiReply } from './ai-helpers.js';

/*
|--------------------------------------------------------------------------
| Email Database Helpers
|--------------------------------------------------------------------------
*/

/* Loads the full email conversation history for a given conversation ID.
 * Returns messages ordered oldest to newest so GPT sees them in order.
 *
 * Parameters:
 *   conversationId: number — the conversation's database ID
 *
 * Returns:
 *   Array of { direction: 'inbound' | 'outbound', subject: string | null, body: string | null }
 */
export async function loadEmailHistory(conversationId) {
  const messages = await db
    .select()
    .from(email)
    .where(eq(email.conversationId, conversationId));

  messages.sort((a, b) => {
    const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return aTime - bTime;
  });

  return messages.map((m) => ({
    direction: m.direction,
    subject: m.subject || null,
    body: m.body || '',
  }));
}

/* Finds an existing email conversation for a lead by matching the
 * inbound email's In-Reply-To header against stored externalMessageIds.
 * Falls back to matching by externalThreadId if provided.
 *
 * Parameters:
 *   leadId:    number        — the lead's database ID
 *   inReplyTo: string | null — the In-Reply-To header value from the inbound email
 *   threadId:  string | null — the Gmail/Outlook thread ID if available
 *
 * Returns:
 *   conversation record | null
 */
export async function findExistingEmailConversation(leadId, inReplyTo, threadId) {
  // Strategy 1: match by In-Reply-To against a previously sent message's externalMessageId
  if (inReplyTo) {
    const matchByMessageId = await db
      .select({ conversationId: email.conversationId })
      .from(email)
      .where(eq(email.externalMessageId, inReplyTo))
      .limit(1);

    if (matchByMessageId.length > 0) {
      const convId = matchByMessageId[0].conversationId;
      const conv = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
        .limit(1);

      if (conv.length > 0) return conv[0];
    }
  }

  // Strategy 2: match by Gmail/Outlook thread ID stored on the conversation
  if (threadId) {
    const matchByThread = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.leadId, leadId),
          eq(conversations.externalThreadId, threadId)
        )
      )
      .limit(1);

    if (matchByThread.length > 0) return matchByThread[0];
  }

  return null;
}

/* Finds or creates an email conversation for a lead.
 * Tries to match an existing conversation via In-Reply-To or threadId first.
 * If none is found, creates a new conversation record.
 *
 * Parameters:
 *   leadId:      number        — the lead's database ID
 *   fromAddress: string        — the sender's email address
 *   toAddresses: string[]      — array of recipient email addresses
 *   inReplyTo:   string | null — In-Reply-To header value
 *   threadId:    string | null — Gmail/Outlook thread ID
 *   subject:     string | null — email subject (used for new conversations)
 *
 * Returns:
 *   number — the conversation ID
 */
export async function findOrCreateEmailConversation(
  leadId,
  fromAddress,
  toAddresses,
  inReplyTo,
  threadId,
  subject,
) {
  const existing = await findExistingEmailConversation(leadId, inReplyTo, threadId);
  if (existing) return existing.id;

  const inserted = await db
    .insert(conversations)
    .values({
      leadId,
      type: 'email',
      initialSender: { email: fromAddress },
      initialRecipient: toAddresses.map((addr) => ({ email: addr })),
      externalThreadId: threadId || null,
    })
    .returning({ id: conversations.id });

  return inserted[0].id;
}

/* Saves an email message (inbound or outbound) to the email table.
 *
 * Parameters:
 *   conversationId:    number        — the conversation this message belongs to
 *   direction:         'inbound' | 'outbound'
 *   fromAddress:       string        — sender email address
 *   toAddresses:       string[]      — recipient email addresses
 *   ccAddresses:       string[]      — CC email addresses (can be empty)
 *   subject:           string | null
 *   body:              string | null
 *   externalMessageId: string | null — the RFC 2822 Message-ID or provider message ID
 *   sentAt:            Date | null
 */
export async function saveEmailMessage(
  conversationId,
  direction,
  fromAddress,
  toAddresses,
  ccAddresses,
  subject,
  body,
  externalMessageId = null,
  sentAt = null,
) {
  await db.insert(email).values({
    conversationId,
    direction,
    sender: { email: fromAddress },
    recipient: toAddresses.map((addr) => ({ email: addr })),
    cc: ccAddresses.map((addr) => ({ email: addr })),
    subject,
    body,
    externalMessageId,
    sentAt: sentAt || new Date(),
  });
}

/*
|--------------------------------------------------------------------------
| Email AI Helper (delegates to ai-helpers.js)
|--------------------------------------------------------------------------
*/

/* Generates an AI email reply using GPT-4o-mini.
 * Delegates to generateAiReply() in ai-helpers.js with mode set to 'email'.
 *
 * Parameters:
 *   lead:                object | null — the lead record from the database
 *   inboundSubject:      string | null — subject of the inbound email
 *   inboundBody:         string        — the email body sent by the lead
 *   propertyDescription: string | null
 *   history:             Array         — prior email messages from loadEmailHistory()
 *   notes:               Array         — lead note strings from loadLeadNotes()
 *
 * Returns:
 *   { subject: string, body: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null }
 */
export async function generateEmailReply(lead, inboundSubject, inboundBody, propertyDescription, history, notes) {
  return generateAiReply('email', lead, inboundBody, inboundSubject, propertyDescription, history, notes);
}

/*
|--------------------------------------------------------------------------
| Send Helper
|--------------------------------------------------------------------------
*/

/* Sends an outbound email reply on behalf of the agent using their stored
 * Gmail OAuth refresh token, then saves the sent message to the database.
 *
 * Parameters:
 *   oauthRefreshToken: string — the agent's Gmail refresh token from oauth_accounts
 *   agentEmail:        string — the agent's email address (used as sender)
 *   toAddress:         string — the lead's email address
 *   subject:           string — the email subject
 *   body:              string — the email body
 *   conversationId:    number — the conversation to attach this message to
 *
 * Returns:
 *   void
 */
export async function sendAndSaveEmail(
  oauthRefreshToken,
  agentEmail,
  toAddress,
  subject,
  body,
  conversationId,
) {
  const gmailAuthClient = await createGmailAuthClient(oauthRefreshToken);
  const sentMessage = await gmailSend(gmailAuthClient, toAddress, subject, body);

  // sentMessage is the raw Gmail API response; it contains `id` (the Gmail message ID).
  // We store this as externalMessageId so future In-Reply-To lookups can match it.
  const gmailMessageId = sentMessage?.id || null;

  await saveEmailMessage(
    conversationId,
    'outbound',
    agentEmail,
    [toAddress],
    [],
    subject,
    body,
    gmailMessageId,
    new Date(),
  );
}
