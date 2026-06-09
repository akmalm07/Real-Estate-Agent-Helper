import express from 'express';
import { db } from '../db/index.js';
import { leads, oauthAccounts, users, conversations } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { loadEmailHistory, findOrCreateEmailConversation, saveEmailMessage, generateEmailReply, sendAndSaveEmail} from './email-helpers.js';
import {  loadLeadNotes, saveLeadNote, saveLeadTask, loadPropertyDescription } from './load-lead-helpers.js'


const router = express.Router();

/*
|--------------------------------------------------------------------------
| Inbound Lead Reply Handler
|--------------------------------------------------------------------------
|
| This function is intended to be called from read-email-webhook.js when
| the Gmail Pub/Sub notification pipeline detects a new inbound email that
| matches a known lead.
|
| How threading works:
|   - Every email has a Message-ID header assigned by the sending server.
|   - When a lead replies, their email client sets In-Reply-To to the
|     Message-ID of the last email they received from the agent.
|   - We store the Gmail message ID of every outbound email in the
|     externalMessageId column of the email table.
|   - On inbound, we match In-Reply-To against those stored IDs to find
|     the existing conversation. If no match, we fall back to Gmail's
|     threadId.
|
*/

/* Handles an inbound email from a known or unknown lead.
 * Intended to be called by read-email-webhook.js after it has parsed
 * the Gmail Pub/Sub notification and fetched the full message.
 *
 * Parameters:
 *   parsedEmail: {
 *     fromAddress:    string        — sender's email address
 *     toAddresses:    string[]      — recipient email addresses
 *     ccAddresses:    string[]      — CC addresses (can be empty)
 *     subject:        string | null
 *     body:           string        — plain text body
 *     inReplyTo:      string | null — value of the In-Reply-To header
 *     gmailThreadId:  string | null — Gmail thread ID
 *     gmailMessageId: string | null — Gmail message ID
 *     agentUserId:    number        — the agent's user ID (owner of the inbox)
 *   }
 *
 * Returns:
 *   void
 */
export async function handleInboundLeadEmail(parsedEmail) {
  const {
    fromAddress,
    toAddresses,
    ccAddresses,
    subject,
    body,
    inReplyTo,
    gmailThreadId,
    gmailMessageId,
    agentUserId,
  } = parsedEmail;

  // Look up the lead by their email address, scoped to this agent's account.
  const leadResults = await db
    .select()
    .from(leads)
    .where(eq(leads.email, fromAddress))
    .limit(1);

  const lead = leadResults[0] || null;

  if (!lead) {
    console.warn(`Inbound email from unknown address: ${fromAddress} — no matching lead found.`);
    return;
  }

  // Load agent's OAuth account to get their refresh token for sending replies.
  const oauthResults = await db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, agentUserId))
    .limit(1);

  const oauthAccount = oauthResults[0] || null;

  if (!oauthAccount) {
    console.warn(`No OAuth account found for agent userId: ${agentUserId}`);
    return;
  }

  // Load agent email address for use as the sender on outbound replies.
  const agentResults = await db
    .select()
    .from(users)
    .where(eq(users.id, agentUserId))
    .limit(1);

  const agentEmail = agentResults[0]?.email || null;

  if (!agentEmail) {
    console.warn(`No user record found for agent userId: ${agentUserId}`);
    return;
  }

  // Find or create the email conversation, using In-Reply-To and threadId for matching.
  const conversationId = await findOrCreateEmailConversation(
    lead.id,
    fromAddress,
    toAddresses,
    inReplyTo,
    gmailThreadId,
    subject,
  );

  // Save the inbound message to the database.
  await saveEmailMessage(
    conversationId,
    'inbound',
    fromAddress,
    toAddresses,
    ccAddresses || [],
    subject,
    body,
    gmailMessageId,
    new Date(),
  );

  // Load full conversation history, notes, and property info for the AI prompt.
  const history = await loadEmailHistory(conversationId);
  const notes = await loadLeadNotes(lead.id);
  const propertyDescription = await loadPropertyDescription(lead.id);

  // Generate the AI reply.
  const { subject: replySubject, body: replyBody, addNote, addTask } = await generateEmailReply(
    lead,
    subject,
    body,
    propertyDescription,
    history,
    notes,
  );

  // Send the reply via Gmail and save it to the database.
  await sendAndSaveEmail(
    oauthAccount.refreshToken,
    agentEmail,
    fromAddress,
    replySubject,
    replyBody,
    conversationId,
  );

  // Persist note if GPT flagged one.
  if (addNote) {
    await saveLeadNote(lead.id, addNote);
  }

  // Persist task if GPT flagged one.
  if (addTask?.title) {
    await saveLeadTask(lead.id, addTask.title, addTask.dueDate || null);
  }
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

/* This route is called by the frontend (or an internal service) to manually
 * trigger an outbound email to a lead on behalf of the agent. It looks up
 * the lead and the agent's Gmail OAuth credentials, sends the email, and
 * saves it to the database.
 *
 * Called by:
 *   Frontend — agent manually sends or approves an email from the CRM dashboard.
 *
 * Headers:
 *   Authorization: Bearer <JWT token>
 *
 * Request Body:
 *   {
 *     leadId:  number — the lead to email
 *     subject: string — email subject
 *     body:    string — email body (agent-written or AI-approved)
 *   }
 *
 * Response:
 *   {
 *     success: true
 *   }
 *
 * Side Effects:
 *   - Looks up lead and agent OAuth credentials in the database
 *   - Finds or creates an email conversation record
 *   - Sends the email via Gmail API using the agent's OAuth token
 *   - Saves the outbound email to the email table
 */
router.post('/send', async (req, res) => {
  const { leadId, subject, body } = req.body;

  if (!leadId || !subject || !body) {
    return res.status(400).json({ error: 'leadId, subject, and body are required.' });
  }

  // req.userId is expected to be set by your JWT auth middleware upstream.
  const agentUserId = req.userId;

  if (!agentUserId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    // Load the lead.
    const leadResults = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = leadResults[0] || null;

    if (!lead || !lead.email) {
      return res.status(404).json({ error: 'Lead not found or has no email address.' });
    }

    // Load the agent's Gmail OAuth credentials.
    const oauthResults = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, agentUserId))
      .limit(1);

    const oauthAccount = oauthResults[0] || null;

    if (!oauthAccount) {
      return res.status(400).json({ error: 'No connected email account found for this agent.' });
    }

    // Load agent email address.
    const agentResults = await db
      .select()
      .from(users)
      .where(eq(users.id, agentUserId))
      .limit(1);

    const agentEmail = agentResults[0]?.email || null;

    if (!agentEmail) {
      return res.status(400).json({ error: 'Agent user record not found.' });
    }

    // Find or create the email conversation.
    // For agent-initiated emails there is no In-Reply-To or threadId yet.
    const conversationId = await findOrCreateEmailConversation(
      lead.id,
      agentEmail,
      [lead.email],
      null,
      null,
      subject,
    );

    // Send the email via Gmail and save it to the database.
    await sendAndSaveEmail(
      oauthAccount.refreshToken,
      agentEmail,
      lead.email,
      subject,
      body,
      conversationId,
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/* This route is called by the frontend to get an AI-generated draft email
 * for a lead, which the agent can review and edit before sending.
 *
 * Called by:
 *   Frontend — agent requests an AI-drafted email from the CRM dashboard.
 *
 * Headers:
 *   Authorization: Bearer <JWT token>
 *
 * Request Body:
 *   {
 *     leadId:         number        — the lead to draft an email for
 *     inboundSubject: string | null — subject of the email being replied to (if any)
 *     inboundBody:    string        — body of the email being replied to (if any)
 *   }
 *
 * Response:
 *   {
 *     subject: string,
 *     body:    string
 *   }
 *
 * Side Effects:
 *   - Loads lead, conversation history, notes, and property info from the database
 *   - Calls OpenAI GPT-4o-mini to generate a draft
 *   - Does NOT send any email or write to the database
 */
router.post('/draft', async (req, res) => {
  const { leadId, inboundSubject, inboundBody } = req.body;

  if (!leadId) {
    return res.status(400).json({ error: 'leadId is required.' });
  }

  const agentUserId = req.userId;

  if (!agentUserId) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    // Load the lead.
    const leadResults = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = leadResults[0] || null;

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    // Load context for the AI prompt.
    const notes = await loadLeadNotes(lead.id);
    const propertyDescription = await loadPropertyDescription(lead.id);

    // Load history from the most recent email conversation for this lead.
    const existingConversations = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.leadId, lead.id),
          eq(conversations.type, 'email')
        )
      )
      .limit(1);

    const history = existingConversations.length > 0
      ? await loadEmailHistory(existingConversations[0].id)
      : [];

    const { subject, body } = await generateEmailReply(
      lead,
      inboundSubject || null,
      inboundBody || '',
      propertyDescription,
      history,
      notes,
    );

    return res.status(200).json({ subject, body });
  } catch (err) {
    console.error('Email draft error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
