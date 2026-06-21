import { Router } from 'express';
import { db } from '../../db/index.js';
import { leads, properties, conversations, email as emailTable, sms as smsTable } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

function resolveSinceCutoff(sinceParam) {
  const now = Date.now();
  if (!sinceParam || sinceParam === '1m') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (sinceParam === '1d')  return new Date(now - 1  * 24 * 60 * 60 * 1000);
  if (sinceParam === '7d')  return new Date(now - 7  * 24 * 60 * 60 * 1000);
  if (sinceParam === '3m')  return new Date(now - 90 * 24 * 60 * 60 * 1000);
  if (sinceParam === 'all') return null;
  const parsed = new Date(sinceParam);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
}

// GET /api/dashboard?since=<value>
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sinceCutoff = resolveSinceCutoff(req.query.since);

    // ── Leads ────────────────────────────────────────────────────────────────
    const allLeadsRaw    = await db.select().from(leads).where(eq(leads.userId, userId));
    const visibleLeads   = allLeadsRaw.filter((l) => l.status !== 'pending_deletion');
    const visibleLeadIds = visibleLeads.map((l) => l.id);

    const STATUS_LIST = ['unverified', 'new', 'active', 'cold', 'converted'];
    const leadsByStatus = STATUS_LIST.map((status) => ({
      status,
      count: visibleLeads.filter((l) => l.status === status).length,
    }));

    const aiManagedLeads = visibleLeads.filter((l) => l.aiEnabled === true).length;

    // ── Properties ───────────────────────────────────────────────────────────
    const allProperties = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, userId));

    // ── Conversations & messages ──────────────────────────────────────────────
    let userConversations = [];
    if (visibleLeadIds.length > 0) {
      const allConvs = await db.select().from(conversations);
      userConversations = allConvs.filter((c) => visibleLeadIds.includes(c.leadId));
    }

    const userConvIds    = userConversations.map((c) => c.id);
    const convToLeadId   = {};
    const convToLeadName = {};
    userConversations.forEach((c) => {
      convToLeadId[c.id]   = c.leadId;
      const lead = visibleLeads.find((l) => l.id === c.leadId);
      convToLeadName[c.id] = lead?.name || null;
    });

    let allSms = [], allEmails = [];
    if (userConvIds.length > 0) {
      const rawSms = await db
        .select({ id: smsTable.id, conversationId: smsTable.conversationId, direction: smsTable.direction, body: smsTable.body, sentAt: smsTable.sentAt })
        .from(smsTable)
        .orderBy(desc(smsTable.sentAt));
      allSms = rawSms.filter((m) => userConvIds.includes(m.conversationId));

      const rawEmails = await db
        .select({ id: emailTable.id, conversationId: emailTable.conversationId, direction: emailTable.direction, body: emailTable.body, sentAt: emailTable.sentAt })
        .from(emailTable)
        .orderBy(desc(emailTable.sentAt));
      allEmails = rawEmails.filter((m) => userConvIds.includes(m.conversationId));
    }

    // ── Needs-attention calculation ───────────────────────────────────────────
    const attentionMap   = {};
    const allInbound     = [...allSms, ...allEmails].filter((m) => m.direction === 'inbound');
    const recentOutbound = [...allSms, ...allEmails].filter((m) => m.direction === 'outbound' && new Date(m.sentAt) >= twentyFourHoursAgo);

    allInbound.forEach((m) => {
      const leadId = convToLeadId[m.conversationId];
      if (leadId == null) return;
      if (!attentionMap[leadId]) attentionMap[leadId] = { hasInbound: false, hasRecentOutbound: false };
      attentionMap[leadId].hasInbound = true;
    });
    recentOutbound.forEach((m) => {
      const leadId = convToLeadId[m.conversationId];
      if (leadId == null) return;
      if (!attentionMap[leadId]) attentionMap[leadId] = { hasInbound: false, hasRecentOutbound: false };
      attentionMap[leadId].hasRecentOutbound = true;
    });

    const needsAttention = Object.values(attentionMap).filter((v) => v.hasInbound && !v.hasRecentOutbound).length;

    // ── Time-windowed data ────────────────────────────────────────────────────
    const leadsInWindow   = sinceCutoff ? visibleLeads.filter((l) => new Date(l.createdAt) >= sinceCutoff) : visibleLeads;
    const inboundInWindow = sinceCutoff ? allInbound.filter((m) => new Date(m.sentAt) >= sinceCutoff) : allInbound;

    const inboundMessages = inboundInWindow.map((m) => ({
      id:        String(m.id),
      direction: m.direction,
      sentAt:    m.sentAt instanceof Date ? m.sentAt.toISOString() : m.sentAt,
      leadId:    convToLeadId[m.conversationId] ?? null,
      channel:   allSms.some((s) => s.id === m.id) ? 'sms' : 'email',
    }));

    const leadsForFrontend = leadsInWindow.map((l) => ({
      id:        l.id,
      status:    l.status,
      aiEnabled: l.aiEnabled,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      name:      l.name  || null,
      source:    l.source || null,
      email:     l.email || null,
      phone:     l.phone || null,
    }));

    // ── Activity feed ─────────────────────────────────────────────────────────
    const leadActivity = leadsInWindow.map((l) => ({
      id:          `lead_${l.id}`,
      type:        'lead_created',
      description: `New lead from ${l.source || 'unknown source'}`,
      timestamp:   l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      leadName:    l.name || null,
    }));

    const allMessagesInWindow = sinceCutoff
      ? [...allSms, ...allEmails].filter((m) => new Date(m.sentAt) >= sinceCutoff)
      : [...allSms, ...allEmails];

    const messageActivity = allMessagesInWindow.map((m) => {
      const isSms = allSms.some((s) => s.id === m.id);
      return {
        id:          `${isSms ? 'sms' : 'email'}_${m.id}`,
        type:        m.direction === 'inbound' ? 'message_received' : 'message_sent',
        description: m.direction === 'inbound'
          ? `${isSms ? 'SMS' : 'Email'} received`
          : `AI replied via ${isSms ? 'SMS' : 'email'}`,
        timestamp:   m.sentAt instanceof Date ? m.sentAt.toISOString() : m.sentAt,
        leadName:    convToLeadName[m.conversationId] || null,
      };
    });

    const recentActivity = [...leadActivity, ...messageActivity]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    return res.json({
      totalLeads:      visibleLeads.length,
      leadsByStatus,
      needsAttention,
      aiManagedLeads,
      totalProperties: allProperties.length,
      leads:           leadsForFrontend,
      inboundMessages,
      recentActivity,
      fetchedAt:       now.toISOString(),
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
