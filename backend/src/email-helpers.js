import { db } from '../db/index.js';
import {
  leads,
  conversations,
  email,
  email as emailTable,
  leadNotes,
  leadTasks,
  properties,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { createGmailAuthClient, sendEmail as gmailSend, sendReply as gmailSendReply } from './gmail.js';
import { generateEmailAiReply } from './ai/email-reply.js';
import { loadLeadNotes, loadPropertyDescription } from './load-lead-helpers.js';
import { extractPlainText } from './pubsub-webhook-helpers.js';

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
    direction:         m.direction,
    subject:           m.subject || null,
    body:              m.body || '',
    externalMessageId: m.externalMessageId || null,
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
 *   conversation record — either the existing or newly created conversation
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
  if (existing) return existing;

  const inserted = await db
    .insert(conversations)
    .values({
      leadId,
      type:             'email',
      initialSender:    { email: fromAddress },
      initialRecipient: toAddresses.map((addr) => ({ email: addr })),
      externalThreadId: threadId || null,
    })
    .returning();

  return inserted[0];
}

/* Saves an email message (inbound or outbound) to the email table.
 *
 * Parameters:
 *   conversationId:    number        — the conversation this message belongs to
 *   direction:         'inbound' | 'outbound'
 *   fromAddress:       string        — sender email address
 *   toAddresses:       string[]      — recipient email addresses
 *   ccAddresses:       string[]      — CC email addresses (can be empty)
 *   inReplyTo:         string | null
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
  inReplyTo,
  subject,
  body,
  externalMessageId = null,
  sentAt = null,
) {
  await db.insert(email).values({
    conversationId,
    direction,
    sender:            { email: fromAddress },
    recipient:         toAddresses.map((addr) => ({ email: addr })),
    cc:                ccAddresses.map((addr) => ({ email: addr })),
    subject,
    body,
    inReplyTo,
    externalMessageId,
    sentAt: sentAt || new Date(),
  });
}

/*
|--------------------------------------------------------------------------
| Email AI Helper
|--------------------------------------------------------------------------
*/

/* Generates an AI email reply using GPT-4o-mini.
 * Delegates directly to generateEmailAiReply in ai/email-reply.js.
 *
 * Parameters:
 *   lead:                object | null — the lead record from the database
 *   conversation:        object | null — the conversation record from the database
 *   inboundSubject:      string | null — subject of the inbound email
 *   inboundBody:         string        — the email body sent by the lead
 *   propertyDescription: string | null
 *   history:             Array         — prior email messages from loadEmailHistory()
 *   notes:               string[]      — lead note strings from loadLeadNotes()
 *
 * Returns:
 *   { subject, body, addNote, addTask, updateConversationState, readyToBook }
 */
export async function generateEmailReply(
  lead,
  conversation,
  inboundSubject,
  inboundBody,
  propertyDescription,
  history,
  notes,
) {
  return generateEmailAiReply(
    lead,
    conversation,
    inboundSubject,
    inboundBody,
    propertyDescription,
    history,
    notes,
  );
}

/*
|--------------------------------------------------------------------------
| Send Helper
|--------------------------------------------------------------------------
*/

/* Sends an outbound email reply on behalf of the agent using their stored
 * Gmail OAuth refresh token, then saves the sent message to the database
 * and updates lastAgentMessageAt on the conversation.
 *
 * When inReplyToMessageId and threadId are provided the message is sent as
 * a proper threaded reply (using In-Reply-To + References headers and the
 * Gmail threadId). Otherwise a fresh email is sent.
 *
 * Parameters:
 *   oauthRefreshToken:   string        — the agent's Gmail refresh token
 *   agentEmail:          string        — the agent's email address (sender)
 *   toAddress:           string        — the lead's email address
 *   subject:             string        — the email subject
 *   body:                string        — the email body
 *   conversationId:      number        — the conversation to attach this message to
 *   inReplyToMessageId:  string | null — RFC 2822 Message-ID of the message being replied to
 *   threadId:            string | null — Gmail thread ID to place the reply into
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
  inReplyToMessageId = null,
  threadId = null,
) {
  const gmailAuthClient = await createGmailAuthClient(oauthRefreshToken);

  let sentMessage;

  if (inReplyToMessageId && threadId) {
    // Send as a proper threaded reply with In-Reply-To + References headers.
    sentMessage = await gmailSendReply(
      gmailAuthClient,
      toAddress,
      subject,
      body,
      inReplyToMessageId,
      threadId,
    );
  } else {
    // No thread context — send a fresh email.
    sentMessage = await gmailSend(gmailAuthClient, toAddress, subject, body);
  }

  // The Gmail API returns the Gmail message ID (not the RFC 2822 Message-ID).
  // We store this so future In-Reply-To lookups can match it.
  const gmailMessageId = sentMessage?.id || null;

  const now = new Date();

  await saveEmailMessage(
    conversationId,
    'outbound',
    agentEmail,
    [toAddress],
    [],
    inReplyToMessageId,
    subject,
    body,
    gmailMessageId,
    now,
  );

  await db
    .update(conversations)
    .set({ lastAgentMessageAt: now })
    .where(eq(conversations.id, conversationId));
}

/*
|--------------------------------------------------------------------------
| Inbound reply handler
|--------------------------------------------------------------------------
*/

/* Checks a batch of raw Gmail message objects to see if any are replies
 * from a known lead to one of our outbound emails.
 *
 * For each email in the batch:
 *   1. Extracts the From address and In-Reply-To / References headers.
 *   2. Looks up a lead in the database whose email matches the From address.
 *   3. Tries to find an existing email conversation via In-Reply-To or threadId.
 *   4. If a matching active conversation is found, saves the inbound message,
 *      generates an AI reply, and sends it back as a proper threaded reply.
 *   5. Skips silently if no matching lead/conversation is found or conversation
 *      is not active.
 *
 * Parameters:
 *   rawEmails:         object[] — raw Gmail message objects (format=full)
 *   agentUserId:       number   — the agent's user ID
 *   agentEmail:        string   — the agent's email address
 *   oauthRefreshToken: string   — the agent's Gmail OAuth refresh token
 */
export async function checkForLeadAndReply(rawEmails, agentUserId, agentEmail, oauthRefreshToken) {
  for (const rawEmail of rawEmails) {
    try {
      const headers = rawEmail.payload?.headers ?? [];

      const getHeader = (name) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

      const fromHeader      = getHeader('From');
      const inReplyTo       = getHeader('In-Reply-To');
      const references      = getHeader('References');
      const subject         = getHeader('Subject');
      const messageIdHeader = getHeader('Message-ID');
      const gmailThreadId   = rawEmail.threadId ?? null;
      const gmailMessageId  = rawEmail.id ?? null;

      if (!fromHeader) continue;

      // Extract the bare email address from the From header
      const fromAddressMatch =
        fromHeader.match(/<([^>]+)>/) ?? fromHeader.match(/([^\s]+@[^\s]+)/);
      const fromAddress = fromAddressMatch?.[1]?.toLowerCase() ?? null;

      if (!fromAddress) continue;

      // Skip emails sent by the agent themselves
      if (fromAddress === agentEmail.toLowerCase()) continue;

      // Look up a lead for this agent whose email matches the sender
      const leadResults = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.userId, agentUserId),
            eq(leads.email, fromAddress),
          )
        )
        .limit(1);

      const lead = leadResults[0] ?? null;
      if (!lead) continue;

      // Try to find the conversation this email is replying to.
      // Use In-Reply-To first, then fall back to the Gmail thread ID.
      const conversation = await findExistingEmailConversation(
        lead.id,
        inReplyTo,
        gmailThreadId,
      );

      if (!conversation || conversation.status !== 'active') continue;

      // Idempotency guard — skip if we already saved this Gmail message
      const alreadySaved = await db
        .select({ id: emailTable.id })
        .from(emailTable)
        .where(eq(emailTable.externalMessageId, gmailMessageId))
        .limit(1);

      if (alreadySaved.length > 0) {
        console.log(`Gmail message ${gmailMessageId} already saved, skipping.`);
        continue;
      }

      const body = extractPlainText(rawEmail.payload) ?? '';

      // Save the inbound reply from the lead
      await saveEmailMessage(
        conversation.id,
        'inbound',
        fromAddress,
        [agentEmail],
        [],
        inReplyTo,
        subject,
        body,
        // Store the RFC 2822 Message-ID so we can match future In-Reply-To headers
        messageIdHeader ?? gmailMessageId,
        new Date(),
      );

      // Load context for AI reply generation
      const [history, notes, propertyDescription] = await Promise.all([
        loadEmailHistory(conversation.id),
        loadLeadNotes(lead.id),
        loadPropertyDescription(lead.id),
      ]);

      // Generate the AI reply
      const {
        subject: replySubject,
        body:    replyBody,
        addNote,
        addTask,
        readyToBook,
        updateConversationState,
      } = await generateEmailReply(
        lead,
        conversation,
        subject,
        body,
        propertyDescription,
        history,
        notes,
      );

      // Find the most recent outbound message's externalMessageId
      // so we can send the reply into the correct Gmail thread.
      const lastOutbound = [...history]
        .reverse()
        .find((m) => m.direction === 'outbound' && m.externalMessageId);

      const replyToMessageId =
        messageIdHeader ?? inReplyTo ?? lastOutbound?.externalMessageId ?? null;

      await sendAndSaveEmail(
        oauthRefreshToken,
        agentEmail,
        fromAddress,
        replySubject,
        replyBody,
        conversation.id,
        replyToMessageId,
        gmailThreadId,
      );

      // Persist addNote if the AI returned one
      if (addNote) {
        await db.insert(leadNotes).values({
          leadId: lead.id,
          note:   addNote,
        });
      }

      // Persist addTask if the AI returned one
      if (addTask) {
        await db.insert(leadTasks).values({
          leadId:  lead.id,
          title:   addTask.title,
          dueDate: addTask.dueDate ? new Date(addTask.dueDate) : null,
        });
      }

      // Persist conversation state update if the AI returned one
      if (updateConversationState !== undefined) {
        await db
          .update(conversations)
          .set({ conversationState: updateConversationState })
          .where(eq(conversations.id, conversation.id));
      }

      // If the lead is ready to book, update their status and create an agent task
      if (readyToBook && lead.status !== 'ready') {
        await db
          .update(leads)
          .set({ status: 'ready' })
          .where(eq(leads.id, lead.id));

        await db.insert(leadTasks).values({
          leadId:  lead.id,
          title:   `📅 ${lead.name || 'Lead'} is ready to book an appointment — follow up now!`,
          dueDate: null,
        });

        console.log(`Lead ${lead.id} marked as ready to book.`);
      }

      console.log(`Replied to lead ${lead.id} (${fromAddress}) on conversation ${conversation.id}.`);
    } catch (err) {
      console.error('Error handling potential lead reply:', err);
    }
  }
}
