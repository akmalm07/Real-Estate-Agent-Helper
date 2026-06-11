import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and, lte, or, isNull, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { conversations, leads, oauthAccounts, users } from '../db/schema.js';
import {
  loadEmailHistory,
  generateEmailReply,
  sendAndSaveEmail,
} from './email-helpers.js';
import {
  loadLeadNotes,
  loadPropertyDescription,
  saveLeadNote,
  saveLeadTask,
} from './load-lead-helpers.js';

const client = new OAuth2Client();

const scheduledUnreplyRouter = Router();

/* Verifies that the incoming request was made by the Google Cloud Scheduler
 * service account by validating the OIDC token in the Authorization header.
 *
 * Parameters:
 *   authHeader: string | undefined — the raw Authorization header value
 *
 * Returns:
 *   The verified token payload
 *
 * Throws:
 *   If the token is missing, invalid, or issued by the wrong service account
 */
async function verifySchedulerToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.SCHEDULER_URL,
  });

  return ticket.getPayload();
}

/* Sends a follow-up email for a single active conversation where the lead
 * has not replied since the last agent message, or has never replied at all.
 *
 * - Generates a context-aware AI follow-up using the full conversation history.
 * - Sends the email via the lead owner's Gmail OAuth account.
 * - Increments unansweredFollowups.
 * - If unansweredFollowups reaches 4, marks the conversation as 'cold' and stops.
 * - Otherwise schedules the next follow-up for 24 hours from now.
 *
 * Parameters:
 *   conversation: object — the conversation record from the database
 */
async function processConversation(conversation) {
  // Load the lead that owns this conversation.
  const leadResults = await db
    .select()
    .from(leads)
    .where(eq(leads.id, conversation.leadId))
    .limit(1);

  const lead = leadResults[0] || null;

  if (!lead || !lead.email) {
    console.warn(`Skipping conversation ${conversation.id} — lead not found or has no email.`);
    return;
  }

  // Load the agent's Gmail OAuth credentials via the lead's userId.
  const oauthResults = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.userId, lead.userId),
        eq(oauthAccounts.provider, 'google'),
      )
    )
    .limit(1);

  const oauthAccount = oauthResults[0] || null;

  if (!oauthAccount) {
    console.warn(`Skipping conversation ${conversation.id} — no Google OAuth account for userId ${lead.userId}.`);
    return;
  }

  // Load the agent's email address to use as the sender.
  const agentResults = await db
    .select()
    .from(users)
    .where(eq(users.id, lead.userId))
    .limit(1);

  const agentEmail = agentResults[0]?.email || null;

  if (!agentEmail) {
    console.warn(`Skipping conversation ${conversation.id} — no user record for userId ${lead.userId}.`);
    return;
  }

  // Load full context for the AI prompt.
  const history = await loadEmailHistory(conversation.id);
  const notes = await loadLeadNotes(lead.id);
  const propertyDescription = await loadPropertyDescription(lead.id);

  // The follow-up prompt has no new inbound message — we pass an empty string
  // as the inbound body. The AI will use the conversation history to generate
  // a natural follow-up that continues the thread.
  const { subject, body, addNote, addTask } = await generateEmailReply(
    lead,
    conversation,
    null,
    '',
    propertyDescription,
    history,
    notes,
  );

  // Send the follow-up email via the agent's Gmail account.
  await sendAndSaveEmail(
    oauthAccount.refreshToken,
    agentEmail,
    lead.email,
    subject,
    body,
    conversation.id,
  );

  const newUnansweredFollowups = conversation.unansweredFollowups + 1;
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (newUnansweredFollowups >= 4) {
    // Lead has not responded after 4 consecutive follow-ups — mark as cold.
    await db
      .update(conversations)
      .set({
        status: 'cold',
        unansweredFollowups: newUnansweredFollowups,
        lastAgentMessageAt: now,
        followupTime: null,
      })
      .where(eq(conversations.id, conversation.id));

    console.log(`Conversation ${conversation.id} marked as cold after ${newUnansweredFollowups} unanswered follow-ups.`);
  } else {
    // Schedule the next follow-up for 24 hours from now.
    await db
      .update(conversations)
      .set({
        unansweredFollowups: newUnansweredFollowups,
        lastAgentMessageAt: now,
        followupTime: oneDayFromNow,
      })
      .where(eq(conversations.id, conversation.id));
  }

  // Persist note if GPT flagged one.
  if (addNote) {
    await saveLeadNote(lead.id, addNote);
  }

  // Persist task if GPT flagged one.
  if (addTask?.title) {
    await saveLeadTask(lead.id, addTask.title, addTask.dueDate || null);
  }
}

/* This route is called by Google Cloud Scheduler once per day.
 * It finds all active email conversations where the lead has not replied
 * since the last agent message (or has never replied at all) and the
 * follow-up window has elapsed, then sends a context-aware AI follow-up
 * email for each one.
 *
 * Called by:
 *   Google Cloud Scheduler — configure this URL as the scheduler job target.
 *
 * Headers:
 *   Authorization: Bearer <OIDC token> — issued by the scheduler service account
 *
 * Query Parameters:
 *   None
 *
 * Request Body:
 *   None
 *
 * Response:
 *   {
 *     success: number — count of conversations successfully followed up
 *     failed:  number — count of conversations that encountered an error
 *     cold:    number — count of conversations marked cold this run
 *   }
 *
 * Side Effects:
 *   - Verifies OIDC token against SCHEDULER_URL audience and SCHEDULER_AUTH_SERVICE_ACCOUNT
 *   - Queries conversations table for eligible follow-up targets
 *   - Calls OpenAI GPT-4o-mini to generate follow-up email content
 *   - Sends emails via each lead owner's Gmail OAuth account
 *   - Saves outbound emails to the email table
 *   - Updates unansweredFollowups, lastAgentMessageAt, followupTime on each conversation
 *   - Marks conversations as 'cold' when unansweredFollowups reaches 4
 *   - Optionally inserts lead notes and tasks based on AI recommendations
 */
scheduledUnreplyRouter.get('/unreply/daily', async (req, res) => {
  // Authorization layer — same pattern as shaduled-gmail-watch.js
  const auth = req.headers.authorization;

  try {
    const payload = await verifySchedulerToken(auth);

    if (payload.email !== process.env.SCHEDULER_AUTH_SERVICE_ACCOUNT) {
      return res.status(401).send('Unauthorized');
    }
  } catch {
    return res.status(401).send('Unauthorized');
  }

  // Logic layer

  const now = new Date();

  // Find all active email conversations that are due for a follow-up.
  //
  // Conditions:
  //   status = 'active'                              — only active conversations
  //   optedOut = false                               — never contact opted-out leads
  //   type = 'email'                                 — this handler is email-only
  //   followupTime is null OR followupTime <= now    — never scheduled yet, or window has elapsed
  //   doNotContactUntil is null or in the past       — respect do-not-contact requests
  //   lastLeadMessageAt is null                      — lead has never replied at all, OR
  //     OR lastLeadMessageAt < lastAgentMessageAt    — lead has not replied since last agent message
  //   unansweredFollowups < 4                        — not yet at the cold threshold
  const eligibleConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.status, 'active'),
        eq(conversations.optedOut, false),
        eq(conversations.type, 'email'),
        or(
          isNull(conversations.followupTime),
          lte(conversations.followupTime, now),
        ),
        or(
          isNull(conversations.doNotContactUntil),
          lt(conversations.doNotContactUntil, now),
        ),
        or(
          isNull(conversations.lastLeadMessageAt),
          lt(conversations.lastLeadMessageAt, conversations.lastAgentMessageAt),
        ),
      )
    );

  let success = 0;
  let failed = 0;
  let cold = 0;

  for (const conversation of eligibleConversations) {
    const wasActive = conversation.unansweredFollowups + 1 >= 4;

    try {
      await processConversation(conversation);

      if (wasActive) {
        cold++;
      } else {
        success++;
      }
    } catch (err) {
      console.error(`Failed to process conversation ${conversation.id}:`, err);
      failed++;
    }
  }

  return res.json({ success, failed, cold });
});

export default scheduledUnreplyRouter;
