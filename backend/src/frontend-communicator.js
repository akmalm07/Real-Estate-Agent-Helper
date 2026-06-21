/**
 * frontend-communicator.js
 *
 * Express router that exposes all REST API endpoints consumed by the React
 * frontend.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import {
  leads,
  properties,
  conversations,
  email as emailTable,
  sms as smsTable,
  leadNotes,
  leadTasks,
  users,
  userOnboarding,
  oauthAccounts,
} from '../db/schema.js';
import { createToken, verifyToken } from './jwt.js';
import { eq, desc, ne, and, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { sendEmail, sendSMS } from './phone.js';
import jwt from 'jsonwebtoken';
import { cookieJson } from './consts.js';
import {
  findOrCreateSmsConversation,
  saveSmsMessage,
  generateSmsReply,
} from './sms-helpers.js';
import {
  findOrCreateEmailConversation,
  sendAndSaveEmail,
  generateEmailReply,
} from './email-helpers.js';
import { sendInitialMessages } from './pubsub-webhook-helpers.js'


const frontendComRouter = Router();

const PASSWORD_RESET_SECRET = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', reauthenticate: true });
  }
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

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

/**
 * Resolves which channel to use for initial outreach based on the agent's
 * onboarding contactMethod preference and what contact info the lead has.
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

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/signup
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists. Try Google or Microsoft sign-in.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db.insert(users).values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      source: 'manual',
      emailConfirmed: false,
      onboardComplete: false,
    }).returning();
    const token = createToken(newUser.id);
    res.cookie('token', token, cookieJson);
    return res.status(201).json({ user: safeUser(newUser) });
  } catch (err) {
    console.error('POST /api/auth/signup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/login
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    if (!user) return res.status(401).json({ error: 'No account found with that email address.' });
    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({ error: 'This account uses Google or Microsoft sign-in. Please use those buttons instead.' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    const token = createToken(user.id);
    res.cookie('token', token, cookieJson);
    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/logout
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/logout', requireAuth, async (req, res) => {
  res.clearCookie('token', cookieJson);
  return res.json({ message: 'Logged out successfully' });
});

// ---------------------------------------------------------------------------
// Auth — GET /api/auth/me
// ---------------------------------------------------------------------------
frontendComRouter.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/change-password
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/change-password', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required.' });
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
    const genericOk = { message: 'If an account with that email exists, a password reset link has been sent.' };
    if (!user || !user.passwordHash || user.source !== 'manual') return res.status(200).json(genericOk);
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password_reset' },
      PASSWORD_RESET_SECRET,
      { expiresIn: process.env.TEMP_TOKEN_EXPIRATION }
    );
    const resetLink = `${APP_BASE_URL}/change-password?token=${resetToken}&changePassword=true`;
    sendEmail(
      user.email,
      'Reset your RealCRM password',
      `<h1>Password Reset Request</h1><p>Hi ${user.name ?? 'there'},</p><p>Click the link below to set a new password. This link expires in <strong>15 minutes</strong>.</p><p><a href="${resetLink}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset My Password</a></p><p>If you did not request this, you can safely ignore this email.</p>`
    ).catch((err) => console.error('Password reset email failed:', err));
    return res.status(200).json(genericOk);
  } catch (err) {
    console.error('POST /api/auth/change-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/change-password/confirm
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/change-password/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body ?? {};
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required.' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    let payload;
    try {
      payload = jwt.verify(token, PASSWORD_RESET_SECRET);
    } catch {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    if (payload.purpose !== 'password_reset') return res.status(400).json({ error: 'Invalid reset token.' });
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({ error: 'This account uses Google or Microsoft sign-in and does not have a password.' });
    }
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, user.id));
    sendEmail(
      user.email,
      'Your RealCRM password has been changed',
      `<h1>Password Changed</h1><p>Hi ${user.name ?? 'there'},</p><p>Your RealCRM account password was just changed successfully.</p><p>If you did not make this change, please contact support immediately.</p>`
    ).catch((err) => console.error('Password change notification email failed:', err));
    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('POST /api/auth/change-password/confirm error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Settings — POST /api/settings/preferences
// ---------------------------------------------------------------------------
frontendComRouter.post('/settings/preferences', requireAuth, async (req, res) => {
  const { newLeadNotify, newMessageReplyNotify, weeklySummeryNotify } = req.body;
  if (!newLeadNotify && !newMessageReplyNotify && !weeklySummeryNotify) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  try {
    await db.update(users).set({ newLeadNotify, newMessageReplyNotify, weeklySummeryNotify }).where(eq(users.id, req.user.id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ---------------------------------------------------------------------------
// Onboarding — GET /api/onboarding
// ---------------------------------------------------------------------------
frontendComRouter.get('/onboarding', requireAuth, async (req, res) => {
  try {
    const [oauthRow] = await db
      .select({ id: oauthAccounts.id })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, req.user.id), eq(oauthAccounts.provider, 'google')))
      .limit(1);
    return res.json({ gmailConnected: !!oauthRow });
  } catch (err) {
    console.error('GET /api/onboarding error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Onboarding — POST /api/onboarding
// ---------------------------------------------------------------------------
frontendComRouter.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const {
      brokerage, primaryMarket, leadsPerMonth, leadSources,
      leadSourceOther, contactMethod, teamSize, biggestChallenge, completed,
    } = req.body ?? {};

    if (completed !== true) return res.status(400).json({ error: 'Onboarding must be submitted as a single complete bundle (completed=true).' });
    if (!primaryMarket?.trim()) return res.status(400).json({ error: 'primaryMarket is required.' });

    const validLeadsPerMonth = ['0_25', '25_50', '50_100', '100_plus'];
    if (!validLeadsPerMonth.includes(leadsPerMonth)) return res.status(400).json({ error: `leadsPerMonth must be one of: ${validLeadsPerMonth.join(', ')}` });
    if (!Array.isArray(leadSources) || leadSources.length === 0) return res.status(400).json({ error: 'leadSources must be a non-empty array.' });
    if (leadSources.includes('other')) {
      if (!leadSourceOther?.trim()) return res.status(400).json({ error: 'leadSourceOther is required when "other" is selected.' });
      if (leadSourceOther.length > 50) return res.status(400).json({ error: 'leadSourceOther must be 50 characters or fewer.' });
    }

    const validContactMethods = ['sms', 'email', 'mix', 'phone'];
    if (!validContactMethods.includes(contactMethod)) return res.status(400).json({ error: `contactMethod must be one of: ${validContactMethods.join(', ')}` });

    const validTeamSizes = ['just_me', '2_5', '6_20', '20_plus'];
    if (!validTeamSizes.includes(teamSize)) return res.status(400).json({ error: `teamSize must be one of: ${validTeamSizes.join(', ')}` });

    const validChallenges = ['following_up', 'too_many_leads', 'leads_go_cold', 'organizing_conversations', 'tracking_appointments', 'converting_leads'];
    if (!validChallenges.includes(biggestChallenge)) return res.status(400).json({ error: `biggestChallenge must be one of: ${validChallenges.join(', ')}` });

    const now = new Date();
    const values = {
      userId: req.user.id,
      brokerage: brokerage?.trim() || null,
      primaryMarket: primaryMarket.trim(),
      leadsPerMonth,
      leadSources,
      leadSourceOther: leadSources.includes('other') ? leadSourceOther.trim() : null,
      contactMethod,
      teamSize,
      biggestChallenge,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    };

    const [row] = await db.insert(userOnboarding).values(values).onConflictDoUpdate({
      target: userOnboarding.userId,
      set: {
        brokerage: values.brokerage,
        primaryMarket: values.primaryMarket,
        leadsPerMonth: values.leadsPerMonth,
        leadSources: values.leadSources,
        leadSourceOther: values.leadSourceOther,
        contactMethod: values.contactMethod,
        teamSize: values.teamSize,
        biggestChallenge: values.biggestChallenge,
        updatedAt: now,
        completedAt: now,
      },
    }).returning();

    await db.update(users).set({ onboardComplete: true }).where(eq(users.id, req.user.id));
    return res.status(200).json({ onboarding: row });
  } catch (err) {
    console.error('POST /api/onboarding error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard — GET /api/dashboard?since=<value>
// ---------------------------------------------------------------------------
frontendComRouter.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now    = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sinceCutoff = resolveSinceCutoff(req.query.since);

    const allLeadsRaw = await db.select().from(leads).where(eq(leads.userId, userId));
    const visibleLeads   = allLeadsRaw.filter((l) => l.status !== 'pending_deletion');
    const visibleLeadIds = visibleLeads.map((l) => l.id);

    // Include 'unverified' in the status breakdown
    const STATUS_LIST = ['unverified', 'new', 'active', 'cold', 'converted'];
    const leadsByStatus = STATUS_LIST.map((status) => ({
      status,
      count: visibleLeads.filter((l) => l.status === status).length,
    }));

    const aiManagedLeads = visibleLeads.filter((l) => l.aiEnabled === true).length;

    const allProperties = await db.select({ id: properties.id }).from(properties).where(eq(properties.userId, userId));

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
      const rawSms = await db.select({ id: smsTable.id, conversationId: smsTable.conversationId, direction: smsTable.direction, body: smsTable.body, sentAt: smsTable.sentAt }).from(smsTable).orderBy(desc(smsTable.sentAt));
      allSms = rawSms.filter((m) => userConvIds.includes(m.conversationId));
      const rawEmails = await db.select({ id: emailTable.id, conversationId: emailTable.conversationId, direction: emailTable.direction, body: emailTable.body, sentAt: emailTable.sentAt }).from(emailTable).orderBy(desc(emailTable.sentAt));
      allEmails = rawEmails.filter((m) => userConvIds.includes(m.conversationId));
    }

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
      name:      l.name || null,
      source:    l.source || null,
      email:     l.email || null,
      phone:     l.phone || null,
    }));

    const leadActivity = leadsInWindow.map((l) => ({
      id:          `lead_${l.id}`,
      type:        'lead_created',
      description: `New lead from ${l.source || 'unknown source'}`,
      timestamp:   l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      leadName:    l.name || null,
    }));

    const allMessagesInWindow = sinceCutoff ? [...allSms, ...allEmails].filter((m) => new Date(m.sentAt) >= sinceCutoff) : [...allSms, ...allEmails];
    const messageActivity = allMessagesInWindow.map((m) => {
      const isSms = allSms.some((s) => s.id === m.id);
      return {
        id:          `${isSms ? 'sms' : 'email'}_${m.id}`,
        type:        m.direction === 'inbound' ? 'message_received' : 'message_sent',
        description: m.direction === 'inbound' ? `${isSms ? 'SMS' : 'Email'} received` : `AI replied via ${isSms ? 'SMS' : 'email'}`,
        timestamp:   m.sentAt instanceof Date ? m.sentAt.toISOString() : m.sentAt,
        leadName:    convToLeadName[m.conversationId] || null,
      };
    });

    const recentActivity = [...leadActivity, ...messageActivity]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    return res.json({
      totalLeads: visibleLeads.length,
      leadsByStatus,
      needsAttention,
      aiManagedLeads,
      totalProperties: allProperties.length,
      leads:            leadsForFrontend,
      inboundMessages,
      recentActivity,
      fetchedAt: now.toISOString(),
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Leads — GET /api/leads
// ---------------------------------------------------------------------------
frontendComRouter.get('/leads', requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(leads).where(eq(leads.userId, req.user.id)).orderBy(desc(leads.updatedAt));
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Leads — GET /api/leads/:id
// ---------------------------------------------------------------------------
frontendComRouter.get('/leads/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id))).limit(1);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const notes = await db.select().from(leadNotes).where(eq(leadNotes.leadId, leadId)).orderBy(desc(leadNotes.createdAt));
    const leadConversations = await db.select().from(conversations).where(eq(conversations.leadId, leadId));

    let allMessages = [];
    for (const conv of leadConversations) {
      if (conv.type === 'sms') {
        const msgs = await db.select().from(smsTable).where(eq(smsTable.conversationId, conv.id)).orderBy(smsTable.sentAt);
        allMessages = allMessages.concat(msgs.map((m) => ({ ...m, channel: 'sms' })));
      } else if (conv.type === 'email') {
        const msgs = await db.select().from(emailTable).where(eq(emailTable.conversationId, conv.id)).orderBy(emailTable.sentAt);
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

// ---------------------------------------------------------------------------
// Leads — POST /api/leads  (Refer a Lead)
// ---------------------------------------------------------------------------
frontendComRouter.post('/leads', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, source, sourceId, propertyId, notes: initialNote } = req.body ?? {};

    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });

    const validSources   = ['zillow', 'realtor', 'referral', 'unknown'];
    const resolvedSource = validSources.includes(source) ? source : 'referral';

    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({ error: 'At least one contact method (email or phone) is required.' });
    }
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) return res.status(400).json({ error: 'Invalid email address format.' });
    }

    let resolvedPropertyId = null;
    if (propertyId) {
      const [prop] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.id, Number(propertyId)), eq(properties.userId, req.user.id))).limit(1);
      if (!prop) return res.status(400).json({ error: 'Property not found or does not belong to you.' });
      resolvedPropertyId = prop.id;
    }

    const [newLead] = await db.insert(leads).values({
      userId:     req.user.id,
      name:       name.trim(),
      email:      email?.trim() || null,
      phone:      phone?.trim() || null,
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

// ---------------------------------------------------------------------------
// Leads — POST /api/leads/verify/:id
//
// Handles verification of unverified leads (created by email ingestion pipeline).
//   verify: true  → set status to 'active'; caller then hits /send-initial
//   verify: false → permanently hard-delete the lead and all associated data
//
// Only leads with status 'unverified' can be acted on here.
// ---------------------------------------------------------------------------
frontendComRouter.post('/leads/verify/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const { verify } = req.body ?? {};

    if (typeof verify !== 'boolean') {
      return res.status(400).json({ error: '`verify` must be a boolean.' });
    }

    // Load and ownership-check the lead
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
      // ── Permanent hard-delete ─────────────────────────────────────────────
      // Delete child records first to avoid FK constraint violations
      await db.delete(leadNotes).where(eq(leadNotes.leadId, leadId));
      await db.delete(leadTasks).where(eq(leadTasks.leadId, leadId));

      // Delete messages in all conversations for this lead
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

    // ── verify === true: activate the lead ───────────────────────────────
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

// ---------------------------------------------------------------------------
// Leads — POST /api/leads/:id/send-initial
// ---------------------------------------------------------------------------
frontendComRouter.post('/leads/:id/send-initial', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);
    const {
      mode = 'ai',
      customMessage,
      customSubject,
    } = req.body ?? {};

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

    } else if (mode === 'custom') {
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

// ---------------------------------------------------------------------------
// Leads — PATCH /api/leads/:id  (Edit or soft-delete)
// ---------------------------------------------------------------------------
frontendComRouter.patch('/leads/:id', requireAuth, async (req, res) => {
  try {
    const leadId = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Lead not found.' });

    const { name, email, phone, source, sourceId, propertyId, status, aiEnabled } = req.body ?? {};

    const validSources  = ['zillow', 'realtor', 'referral', 'unknown'];
    // 'unverified' is intentionally excluded — it can only be set by the ingestion pipeline
    const validStatuses = ['active', 'ready', 'archived', 'pending_deletion'];

    const updates = {};

    if (name      !== undefined) updates.name     = name?.trim()      || null;
    if (email     !== undefined) updates.email    = email?.trim()     || null;
    if (phone     !== undefined) updates.phone    = phone?.trim()     || null;
    if (sourceId  !== undefined) updates.sourceId = sourceId?.trim()  || null;

    if (aiEnabled !== undefined) {
      updates.aiEnabled = Boolean(aiEnabled);
    }

    if (source !== undefined) {
      if (!validSources.includes(source)) return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
      updates.source = source;
    }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
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
        const [prop] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.id, Number(propertyId)), eq(properties.userId, req.user.id))).limit(1);
        if (!prop) return res.status(400).json({ error: 'Property not found or does not belong to you.' });
        updates.propertyId = prop.id;
      }
    }

    updates.updatedAt = new Date();

    const [updated] = await db.update(leads).set(updates).where(eq(leads.id, leadId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error('PATCH /api/leads/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Properties — GET /api/properties
// ---------------------------------------------------------------------------
frontendComRouter.get('/properties', requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(properties).where(
      and(
        eq(properties.userId, req.user.id),
        ne(properties.status, 'pending_deletion')
      ))
      .orderBy(
        sql`CASE WHEN ${properties.status} = 'archived' THEN 1 ELSE 0 END`,
        desc(properties.createdAt)
      );
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/properties error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Properties — POST /api/properties  (Add a Property)
// ---------------------------------------------------------------------------
frontendComRouter.post('/properties', requireAuth, async (req, res) => {
  try {
    const { addressLine1, addressLine2, description, status, source, externalId, price, bedrooms, bathrooms, sqft } = req.body ?? {};

    if (!addressLine1?.trim()) return res.status(400).json({ error: 'addressLine1 is required.' });
    if (!description?.trim())  return res.status(400).json({ error: 'description is required.' });

    const validStatuses = ['draft', 'open', 'archived'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });

    const validSources   = ['zillow', 'realtor', 'listing'];
    const resolvedSource = validSources.includes(source) ? source : 'listing';

    if (price    !== undefined && price    !== null && price    !== '' && (isNaN(Number(price))    || Number(price)    < 0)) return res.status(400).json({ error: 'price must be a non-negative number.' });
    if (bedrooms !== undefined && bedrooms !== null && bedrooms !== '' && (isNaN(Number(bedrooms)) || Number(bedrooms) < 0 || !Number.isInteger(Number(bedrooms)))) return res.status(400).json({ error: 'bedrooms must be a non-negative integer.' });
    if (bathrooms!== undefined && bathrooms!== null && bathrooms!== '' && (isNaN(Number(bathrooms))|| Number(bathrooms)< 0)) return res.status(400).json({ error: 'bathrooms must be a non-negative number.' });
    if (sqft     !== undefined && sqft     !== null && sqft     !== '' && (isNaN(Number(sqft))     || Number(sqft)     < 0 || !Number.isInteger(Number(sqft)))) return res.status(400).json({ error: 'sqft must be a non-negative integer.' });

    const [newProperty] = await db.insert(properties).values({
      userId:       req.user.id,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || null,
      description:  description.trim(),
      status,
      source:       resolvedSource,
      externalId:   externalId?.trim() || null,
      price:        price     !== undefined && price     !== null && price     !== '' ? String(Number(price))     : null,
      bedrooms:     bedrooms  !== undefined && bedrooms  !== null && bedrooms  !== '' ? Number(bedrooms)          : null,
      bathrooms:    bathrooms !== undefined && bathrooms !== null && bathrooms !== '' ? String(Number(bathrooms)) : null,
      sqft:         sqft      !== undefined && sqft      !== null && sqft      !== '' ? Number(sqft)              : null,
    }).returning();

    return res.status(201).json(newProperty);
  } catch (err) {
    console.error('POST /api/properties error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Properties — PATCH /api/properties/:id  (Edit or soft-delete)
// ---------------------------------------------------------------------------
frontendComRouter.patch('/properties/:id', requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.userId, req.user.id)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Property not found.' });

    const { addressLine1, addressLine2, description, status, source, externalId, price, bedrooms, bathrooms, sqft } = req.body ?? {};

    const validStatuses = ['draft', 'open', 'archived', 'pending_deletion'];
    const validSources  = ['zillow', 'realtor', 'referral', 'unknown'];

    const updates = {};

    if (addressLine1 !== undefined) updates.addressLine1 = addressLine1?.trim() || existing.addressLine1;
    if (addressLine2 !== undefined) updates.addressLine2 = addressLine2?.trim() || null;
    if (description  !== undefined) updates.description  = description?.trim()  || existing.description;
    if (externalId   !== undefined) updates.externalId   = externalId?.trim()   || null;

    if (status !== undefined) {
      if (!validStatuses.includes(status)) return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      updates.status = status;
      if (status === 'pending_deletion') {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        updates.deletionDate = deletionDate;
      }
    }

    if (source !== undefined) {
      if (!validSources.includes(source)) return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
      updates.source = source;
    }

    if (price !== undefined && price !== null && price !== '') {
      if (isNaN(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'price must be a non-negative number.' });
      updates.price = String(Number(price));
    } else if (price === null || price === '') {
      updates.price = null;
    }

    if (bedrooms !== undefined && bedrooms !== null && bedrooms !== '') {
      if (isNaN(Number(bedrooms)) || Number(bedrooms) < 0 || !Number.isInteger(Number(bedrooms))) return res.status(400).json({ error: 'bedrooms must be a non-negative integer.' });
      updates.bedrooms = Number(bedrooms);
    } else if (bedrooms === null || bedrooms === '') {
      updates.bedrooms = null;
    }

    if (bathrooms !== undefined && bathrooms !== null && bathrooms !== '') {
      if (isNaN(Number(bathrooms)) || Number(bathrooms) < 0) return res.status(400).json({ error: 'bathrooms must be a non-negative number.' });
      updates.bathrooms = String(Number(bathrooms));
    } else if (bathrooms === null || bathrooms === '') {
      updates.bathrooms = null;
    }

    if (sqft !== undefined && sqft !== null && sqft !== '') {
      if (isNaN(Number(sqft)) || Number(sqft) < 0 || !Number.isInteger(Number(sqft))) return res.status(400).json({ error: 'sqft must be a non-negative integer.' });
      updates.sqft = Number(sqft);
    } else if (sqft === null || sqft === '') {
      updates.sqft = null;
    }

    const [updated] = await db.update(properties).set(updates).where(eq(properties.id, propertyId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error('PATCH /api/properties/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Messages — GET /api/messages
// ---------------------------------------------------------------------------
frontendComRouter.get('/messages', requireAuth, async (req, res) => {
  try {
    const smsList = await db.select({
      id: smsTable.id, leadId: leads.id, leadName: leads.name,
      direction: smsTable.direction, body: smsTable.body,
      channel: conversations.type, sentAt: smsTable.sentAt,
      conversationId: smsTable.conversationId,
    }).from(smsTable)
      .innerJoin(conversations, eq(smsTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(smsTable.sentAt)).limit(100);

    const emailList = await db.select({
      id: emailTable.id, leadId: leads.id, leadName: leads.name,
      direction: emailTable.direction, body: emailTable.body,
      channel: conversations.type, sentAt: emailTable.sentAt,
      conversationId: emailTable.conversationId,
    }).from(emailTable)
      .innerJoin(conversations, eq(emailTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(emailTable.sentAt)).limit(100);

    const rows = [...smsList, ...emailList]
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, 200);

    return res.json(rows);
  } catch (err) {
    console.error('GET /api/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Notes — POST /api/notes
// ---------------------------------------------------------------------------
frontendComRouter.post('/notes', requireAuth, async (req, res) => {
  try {
    const { leadId, content } = req.body ?? {};
    if (!leadId || !content) return res.status(400).json({ error: 'leadId and content are required' });
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id))).limit(1);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const [note] = await db.insert(leadNotes).values({ leadId: Number(leadId), note: content }).returning();
    return res.status(201).json(note);
  } catch (err) {
    console.error('POST /api/notes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Messages — POST /api/messages
// ---------------------------------------------------------------------------
frontendComRouter.post('/messages', requireAuth, async (req, res) => {
  try {
    const { leadId, content, channel } = req.body ?? {};
    if (!leadId || !content || !channel) return res.status(400).json({ error: 'leadId, content, and channel are required' });
    if (channel !== 'sms' && channel !== 'email') return res.status(400).json({ error: 'channel must be "sms" or "email"' });

    const [agentUser] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!agentUser) return res.status(404).json({ error: 'Agent user not found' });

    const [lead] = await db.select().from(leads).where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id))).limit(1);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    let [convo] = await db.select().from(conversations).where(and(eq(conversations.leadId, Number(leadId)), eq(conversations.type, channel))).limit(1);

    if (convo && conv.status !== 'converted') {
      return res.status(403).json({ error: 'Cannot send message while AI is active for this lead. Disable AI or convert the conversation first.' });
    }

    if (channel === 'sms') {

      await sendSMS(
        lead.phone,
        content
      );

      [message] = await db.insert(smsTable)
        .values({
          conversationId: conv.id,
          direction: 'outbound',
          body: content,
          sentAt: new Date(),
        })
        .returning();

    } else {

      const [oauthAccount] = await db
        .select()
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, req.user.id))
        .limit(1);

      const [lastEmail] = await db
        .select()
        .from(email)
        .where(eq(email.conversationId, conv.id))
        .orderBy(desc(email.createdAt))
        .limit(1);

      await sendAndSaveEmail(
        oauthAccount.refreshToken,
        agentUser.email,
        lead.email,
        req.body.subject,
        content,
        conv.id,
        lastEmail?.externalMessageId ?? null,
        convo?.externalThreadId ?? null,
      );

      message = {
        body: content,
        subject: req.body.subject,
      };
    }

    

    return res.status(201).json({ ...message, channel, leadId: Number(leadId) });
  } catch (err) {
    console.error('POST /api/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// ---------------------------------------------------------------------------
// Messages — POST /api/messages/convert
// ---------------------------------------------------------------------------
frontendComRouter.post('/messages/convert', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.body ?? {};

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required.' });
    }

    // Verify conversation exists and belongs to the user's lead
    const [conversation] = await db
      .select({ c_id: conversations.id, l_id: leads.id })
      .from(conversations)
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(and(eq(conversations.id, conversationId), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found or does not belong to you.' });
    }

    // Update conversation status to 'converted'
    await db
      .update(conversations)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // Also update the lead's aiEnabled to false if it's currently true
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


export default frontendComRouter;
