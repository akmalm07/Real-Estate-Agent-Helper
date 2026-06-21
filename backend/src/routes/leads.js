import { Router } from 'express';
import { db } from '../../db/index.js';
import {
  leads, properties, conversations,
  email as emailTable, sms as smsTable,
  leadNotes, leadTasks, users, userOnboarding, oauthAccounts,
} from '../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendInitialMessages } from '../pubsub-webhook-helpers.js';

const router = Router();

const VALID_SOURCES  = ['zillow', 'realtor', 'referral', 'unknown'];
// 'unverified' excluded — only set by the ingestion pipeline
const VALID_STATUSES = ['active', 'ready', 'archived', 'pending_deletion'];

/**
 * Resolves which outreach channel to use based on the agent's contactMethod
 * preference and what contact info the lead actually has.
 */
function resolveOutreachChannel(contactMethod, lead) {
  const hasPhone = (lead.phone ?? '').trim().length > 0;
  const hasEmail = (lead.email ?? '').trim().length > 0;

  const fallback = () => {
    if (hasPhone) return 'sms';
    if (hasEmail) return 'email';
    return null;
  };

  switch (contactMethod) {
    case 'sms':   return hasPhone ? 'sms'   : fallback();
    case 'email': return hasEmail ? 'email' : fallback();
    case 'phone': return hasPhone ? 'phone' : fallback();
    case 'mix':
      if (hasPhone) return 'sms';
      if (hasEmail) return 'email';
      return null;
    default:
      return fallback();
  }
}

// GET /api/leads
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(leads.updatedAt));
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const notes = await db
      .select()
      .from(leadNotes)
      .where(eq(leadNotes.leadId, leadId))
      .orderBy(desc(leadNotes.createdAt));

    const leadConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.leadId, leadId));

    let allMessages = [];
    for (const conv of leadConversations) {
      if (conv.type === 'sms') {
        const msgs = await db
          .select()
          .from(smsTable)
          .where(eq(smsTable.conversationId, conv.id))
          .orderBy(smsTable.sentAt);
        allMessages = allMessages.concat(msgs.map((m) => ({ ...m, channel: 'sms' })));
      } else if (conv.type === 'email') {
        const msgs = await db
          .select()
          .from(emailTable)
          .where(eq(emailTable.conversationId, conv.id))
          .orderBy(emailTable.sentAt);
        allMessages = allMessages.concat(msgs.map((m) => ({ ...m, channel: 'email' })));
      }
    }
    allMessages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

    return res.json({ ...lead, notes, messages: allMessages });
  } catch (err) {
    console.error('GET /api/leads/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads  (Refer a Lead)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, source, sourceId, propertyId, notes: initialNote } = req.body ?? {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({ error: 'At least one contact method (email or phone) is required.' });
    }
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: 'Invalid email address format.' });
      }
    }

    const resolvedSource = VALID_SOURCES.includes(source) ? source : 'referral';

    let resolvedPropertyId = null;
    if (propertyId) {
      const [prop] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, Number(propertyId)), eq(properties.userId, req.user.id)))
        .limit(1);
      if (!prop) return res.status(400).json({ error: 'Property not found or does not belong to you.' });
      resolvedPropertyId = prop.id;
    }

    const [newLead] = await db.insert(leads).values({
      userId:     req.user.id,
      name:       name.trim(),
      email:      email?.trim()    || null,
      phone:      phone?.trim()    || null,
      source:     resolvedSource,
      sourceId:   sourceId?.trim() || null,
      propertyId: resolvedPropertyId,
      status:     'active',
      aiEnabled:  true,
    }).returning();

    if (initialNote?.trim()) {
      await db.insert(leadNotes).values({ leadId: newLead.id, note: initialNote.trim() });
    }

    return res.status(201).json(newLead);
  } catch (err) {
    console.error('POST /api/leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/verify/:id
router.post('/verify/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { verify } = req.body ?? {};

    if (typeof verify !== 'boolean') {
      return res.status(400).json({ error: '`verify` must be a boolean.' });
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (lead.status !== 'unverified') {
      return res.status(400).json({ error: 'Only unverified leads can be acted on via this endpoint.' });
    }

    if (verify === false) {
      // Hard-delete: remove child records first to avoid FK violations
      await db.delete(leadNotes).where(eq(leadNotes.leadId, leadId));
      await db.delete(leadTasks).where(eq(leadTasks.leadId, leadId));

      const leadConversations = await db
        .select({ id: conversations.id, type: conversations.type })
        .from(conversations)
        .where(eq(conversations.leadId, leadId));

      for (const conv of leadConversations) {
        if (conv.type === 'sms') {
          await db.delete(smsTable).where(eq(smsTable.conversationId, conv.id));
        } else if (conv.type === 'email') {
          await db.delete(emailTable).where(eq(emailTable.conversationId, conv.id));
        }
      }

      await db.delete(conversations).where(eq(conversations.leadId, leadId));
      await db.delete(leads).where(eq(leads.id, leadId));

      return res.json({ deleted: true, leadId });
    }

    // verify === true: activate the lead
    const [updated] = await db
      .update(leads)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(leads.id, leadId))
      .returning();

    return res.json({ verified: true, lead: updated });
  } catch (err) {
    console.error('POST /api/leads/verify/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/:id/send-initial
router.post('/:id/send-initial', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { mode = 'ai', customMessage, customSubject } = req.body ?? {};

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id)))
      .limit(1);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    const [agentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    const [onboarding] = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, req.user.id))
      .limit(1);

    const [oauthRow] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, req.user.id), eq(oauthAccounts.provider, 'google')))
      .limit(1);

    const contactMethod = onboarding?.contactMethod ?? 'mix';
    const channel = resolveOutreachChannel(contactMethod, lead);

    if (mode === 'ai') {
      if (channel === 'sms') {
        await sendInitialMessages([lead], null, null);
      } else if (channel === 'email') {
        await sendInitialMessages([lead], agentUser.email, oauthRow.refreshToken);
      } else if (channel === 'phone') {
        await db.insert(leadTasks).values({
          leadId: lead.id,
          title:  `📞 Call ${lead.name ?? 'lead'} — manual phone outreach required`,
          dueDate: null,
        });
        return res.json({
          channel: 'phone',
          mode:    'task_created',
          message: 'Your contact preference is set to phone calls. A follow-up task has been created.',
        });
      } else {
        return res.json({ error: 'No contact method available for this lead.' });
      }
      return res.json({ channel, mode: 'ai', message: 'Message successfully sent!' });
    }

    if (mode === 'custom') {
      if (channel === 'sms') {
        if (!customMessage) return res.json({ error: 'Custom message not provided' });
        await sendInitialMessages([lead], null, null, customMessage);
      } else if (channel === 'email') {
        if (!customMessage || !customSubject) return res.json({ error: 'Custom message and custom subject not provided' });
        await sendInitialMessages([lead], agentUser.email, oauthRow.refreshToken, customMessage, customSubject);
      }
      return res.json({ channel, mode: 'custom', message: 'Message successfully sent!' });
    }

    return res.json({ mode: 'none' });
  } catch (err) {
    console.error('POST /api/leads/:id/send-initial error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/leads/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Lead not found.' });

    const { name, email, phone, source, sourceId, propertyId, status, aiEnabled } = req.body ?? {};
    const updates = {};

    if (name     !== undefined) updates.name     = name?.trim()     || null;
    if (email    !== undefined) updates.email    = email?.trim()    || null;
    if (phone    !== undefined) updates.phone    = phone?.trim()    || null;
    if (sourceId !== undefined) updates.sourceId = sourceId?.trim() || null;

    if (aiEnabled !== undefined) {
      updates.aiEnabled = Boolean(aiEnabled);
    }

    if (source !== undefined) {
      if (!VALID_SOURCES.includes(source)) {
        return res.status(400).json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
      }
      updates.source = source;
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      updates.status = status;
      if (status === 'pending_deletion') {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        updates.deletionDate = deletionDate;
      }
    }

    if (propertyId !== undefined) {
      if (propertyId === null || propertyId === '') {
        updates.propertyId = null;
      } else {
        const [prop] = await db
          .select({ id: properties.id })
          .from(properties)
          .where(and(eq(properties.id, Number(propertyId)), eq(properties.userId, req.user.id)))
          .limit(1);
        if (!prop) return res.status(400).json({ error: 'Property not found or does not belong to you.' });
        updates.propertyId = prop.id;
      }
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(leads)
      .set(updates)
      .where(eq(leads.id, leadId))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /api/leads/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
