import { Router } from 'express';
import { db } from '../../db/index.js';
import {
  leads, conversations,
  email as emailTable, sms as smsTable,
  users, oauthAccounts,
} from '../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendSMS } from '../phone.js';
import { sendAndSaveEmail } from '../email-helpers.js';

const router = Router();

// GET /api/messages
//
// Returns the most recent ~200 SMS and email messages across all of the
// authenticated user's leads, ordered by sentAt desc.
//
// The `id` field is namespaced ('sms-<n>' or 'email-<n>') so that React keys
// and frontend identity comparisons are globally unique across both tables.
router.get('/', requireAuth, async (req, res) => {
  try {
    const smsList = await db
      .select({
        id: smsTable.id, leadId: leads.id, leadName: leads.name,
        direction: smsTable.direction, body: smsTable.body,
        channel: conversations.type, sentAt: smsTable.sentAt,
        conversationId: smsTable.conversationId,
      })
      .from(smsTable)
      .innerJoin(conversations, eq(smsTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(smsTable.sentAt))
      .limit(100);

    const emailList = await db
      .select({
        id: emailTable.id, leadId: leads.id, leadName: leads.name,
        direction: emailTable.direction, body: emailTable.body,
        subject: emailTable.subject,
        channel: conversations.type, sentAt: emailTable.sentAt,
        conversationId: emailTable.conversationId,
      })
      .from(emailTable)
      .innerJoin(conversations, eq(emailTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(emailTable.sentAt))
      .limit(100);

    // Namespace ids so SMS id=5 and email id=5 don't collide on the frontend.
    const smsRows   = smsList.map((m)   => ({ ...m, id: `sms-${m.id}`,     leadId: String(m.leadId), conversationId: String(m.conversationId) }));
    const emailRows = emailList.map((m) => ({ ...m, id: `email-${m.id}`,   leadId: String(m.leadId), conversationId: String(m.conversationId) }));

    const rows = [...smsRows, ...emailRows]
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, 200);

    return res.json(rows);
  } catch (err) {
    console.error('GET /api/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages
//
// Sends an outbound SMS or email on behalf of the agent.
//
// Manual sends are always allowed regardless of the lead's aiEnabled state.
// If no conversation exists for the channel, one is created.
//
// Request body:
//   { leadId, content, channel: 'sms' | 'email', subject? (required for email) }
router.post('/', requireAuth, async (req, res) => {
  try {
    const { leadId, content, channel, subject } = req.body ?? {};

    if (!leadId || !content || !channel) {
      return res.status(400).json({ error: 'leadId, content, and channel are required' });
    }
    if (channel !== 'sms' && channel !== 'email') {
      return res.status(400).json({ error: 'channel must be "sms" or "email"' });
    }
    if (channel === 'email' && !subject?.trim()) {
      return res.status(400).json({ error: 'subject is required when channel is "email"' });
    }

    const [agentUser] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!agentUser) return res.status(404).json({ error: 'Agent user not found' });

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id)))
      .limit(1);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Find an existing conversation of the requested channel, or create one.
    // Manual sends always succeed regardless of AI state — agents have override.
    let [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.leadId, Number(leadId)), eq(conversations.type, channel)))
      .limit(1);

    if (!conv) {
      if (channel === 'sms') {
        if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number' });
        const inserted = await db
          .insert(conversations)
          .values({
            leadId: lead.id,
            type:   'sms',
            initialSender:    { phone: process.env.TELNYX_PHONE_NUMBER ?? null },
            initialRecipient: [{ phone: lead.phone }],
          })
          .returning();
        conv = inserted[0];
      } else {
        if (!lead.email) return res.status(400).json({ error: 'Lead has no email address' });
        const inserted = await db
          .insert(conversations)
          .values({
            leadId: lead.id,
            type:   'email',
            initialSender:    { email: agentUser.email },
            initialRecipient: [{ email: lead.email }],
          })
          .returning();
        conv = inserted[0];
      }
    }

    let message;

    if (channel === 'sms') {
      const twilioMessage = await sendSMS(lead.phone, content);

      [message] = await db
        .insert(smsTable)
        .values({
          conversationId: conv.id,
          direction: 'outbound',
          body: content,
          externalMessageId: twilioMessage?.sid ?? null,
          sentAt: new Date(),
        })
        .returning();

    } else {
      const [oauthAccount] = await db
        .select()
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, req.user.id))
        .limit(1);
      if (!oauthAccount) return res.status(400).json({ error: 'No OAuth account on file for sending email' });

      // Order by sentAt (semantically correct), with createdAt as a tiebreaker via id.
      const [lastEmail] = await db
        .select()
        .from(emailTable)
        .where(eq(emailTable.conversationId, conv.id))
        .orderBy(desc(emailTable.sentAt))
        .limit(1);

      await sendAndSaveEmail(
        oauthAccount.refreshToken,
        agentUser.email,
        lead.email,
        subject,
        content,
        conv.id,
        lastEmail?.externalMessageId ?? null,
        conv?.externalThreadId ?? null,
      );

      message = { body: content, subject };
    }

    return res.status(201).json({ ...message, channel, leadId: Number(leadId) });
  } catch (err) {
    console.error('POST /api/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages/convert
//
// Marks a conversation as "converted" (the agent is taking over) and turns
// off AI for the underlying lead. This is the explicit way for the agent to
// take full manual control of a conversation thread.
router.post('/convert', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.body ?? {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required.' });
    }

    const [conversation] = await db
      .select({ c_id: conversations.id, l_id: leads.id })
      .from(conversations)
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(and(eq(conversations.id, conversationId), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or does not belong to you.' });
    }

    await db
      .update(conversations)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await db
      .update(leads)
      .set({ aiEnabled: false, updatedAt: new Date() })
      .where(eq(leads.id, conversation.l_id));

    return res.status(200).json({ success: true, conversationId });
  } catch (err) {
    console.error('POST /api/messages/convert error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
