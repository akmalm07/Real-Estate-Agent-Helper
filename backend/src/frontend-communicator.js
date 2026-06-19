/**
 * frontend-communicator.js
 *
 * Express router that exposes all REST API endpoints consumed by the React
 * frontend.
 *
 * Dashboard endpoint contract:
 *
 *   GET /api/dashboard?since=<value>
 *
 *   since values:
 *     1d   → last 24 hours
 *     7d   → last 7 days
 *     1m   → last 30 days  (default when param is missing)
 *     3m   → last 90 days
 *     all  → no time filter (excludes pending_deletion only)
 *     <ISO date string> → data since that exact timestamp
 *
 *   Stable (all-time) fields — never time-filtered:
 *     totalLeads, leadsByStatus, needsAttention, aiManagedLeads, totalProperties
 *
 *   Time-filtered arrays (frontend filters these by selected window):
 *     leads[], inboundMessages[], recentActivity[]
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
  users,
  userOnboarding,
  oauthAccounts,
  confirmationCodes,
} from '../db/schema.js';
import { createToken, verifyToken } from './jwt.js';
import { eq, desc, and, gte, ne } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { sendEmail } from './phone.js';
import { randomInt } from 'crypto';
import jwt from 'jsonwebtoken';
import { cookieJson } from './consts.js';

const frontendComRouter = Router();

const PASSWORD_RESET_SECRET = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Middleware: verify JWT and attach user to req.user */
function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', reauthenticate: true });
  }
}

/** Return a safe user object (no password hash) */
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/**
 * Resolve the `since` query parameter to a Date cutoff, or null for "all".
 *
 * Accepts:
 *   '1d'  → 24 hours ago
 *   '7d'  → 7 days ago
 *   '1m'  → 30 days ago  (default)
 *   '3m'  → 90 days ago
 *   'all' → null (no cutoff)
 *   <ISO> → parsed as a Date
 */
function resolveSinceCutoff(sinceParam) {
  const now = Date.now();

  if (!sinceParam || sinceParam === '1m') {
    return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
  if (sinceParam === '1d') {
    return new Date(now - 1 * 24 * 60 * 60 * 1000);
  }
  if (sinceParam === '7d') {
    return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }
  if (sinceParam === '3m') {
    return new Date(now - 90 * 24 * 60 * 60 * 1000);
  }
  if (sinceParam === 'all') {
    return null;
  }

  // Try parsing as ISO date string
  const parsed = new Date(sinceParam);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Fallback: last 30 days
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
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

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'An account with that email already exists. Try Google or Microsoft sign-in.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        source: 'manual',
        emailConfirmed: false,
        onboardComplete: false,
      })
      .returning();

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

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: 'No account found with that email address.' });
    }
    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({
        error: 'This account uses Google or Microsoft sign-in. Please use those buttons instead.',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

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
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/change-password  (request reset link)
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/change-password', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    const genericOk = {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    if (!user || !user.passwordHash || user.source !== 'manual') {
      return res.status(200).json(genericOk);
    }

    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password_reset' },
      PASSWORD_RESET_SECRET,
      { expiresIn: process.env.TEMP_TOKEN_EXPIRATION }
    );

    const resetLink = `${APP_BASE_URL}/change-password?token=${resetToken}&changePassword=true`;

    sendEmail(
      user.email,
      'Reset your RealCRM password',
      `<h1>Password Reset Request</h1>
      <p>Hi ${user.name ?? 'there'},</p>
      <p>Click the link below to set a new password. This link expires in <strong>15 minutes</strong>.</p>
      <p><a href="${resetLink}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset My Password</a></p>
      <p>If the button doesn't work, copy and paste this URL:<br>${resetLink}</p>
      <p>If you did not request this, you can safely ignore this email.</p>`
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

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, PASSWORD_RESET_SECRET);
    } catch {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    if (payload.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid reset token.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({
        error: 'This account uses Google or Microsoft sign-in and does not have a password.',
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, user.id));

    sendEmail(
      user.email,
      'Your RealCRM password has been changed',
      `<h1>Password Changed</h1>
      <p>Hi ${user.name ?? 'there'},</p>
      <p>Your RealCRM account password was just changed successfully.</p>
      <p>If you did not make this change, please contact support immediately.</p>`
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
    await db
      .update(users)
      .set({ newLeadNotify, newMessageReplyNotify, weeklySummeryNotify })
      .where(eq(users.id, req.user.id));

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
      .where(
        and(
          eq(oauthAccounts.userId, req.user.id),
          eq(oauthAccounts.provider, 'google')
        )
      )
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
      brokerage,
      primaryMarket,
      leadsPerMonth,
      leadSources,
      leadSourceOther,
      contactMethod,
      teamSize,
      biggestChallenge,
      completed,
    } = req.body ?? {};

    if (completed !== true) {
      return res.status(400).json({
        error: 'Onboarding must be submitted as a single complete bundle (completed=true).',
      });
    }
    if (!primaryMarket?.trim()) {
      return res.status(400).json({ error: 'primaryMarket is required.' });
    }

    const validLeadsPerMonth = ['0_25', '25_50', '50_100', '100_plus'];
    if (!validLeadsPerMonth.includes(leadsPerMonth)) {
      return res.status(400).json({
        error: `leadsPerMonth must be one of: ${validLeadsPerMonth.join(', ')}`,
      });
    }

    if (!Array.isArray(leadSources) || leadSources.length === 0) {
      return res.status(400).json({ error: 'leadSources must be a non-empty array.' });
    }

    if (leadSources.includes('other')) {
      if (!leadSourceOther?.trim()) {
        return res.status(400).json({ error: 'leadSourceOther is required when "other" is selected.' });
      }
      if (leadSourceOther.length > 50) {
        return res.status(400).json({ error: 'leadSourceOther must be 50 characters or fewer.' });
      }
    }

    const validContactMethods = ['sms', 'email', 'mix'];
    if (!validContactMethods.includes(contactMethod)) {
      return res.status(400).json({
        error: `contactMethod must be one of: ${validContactMethods.join(', ')}`,
      });
    }

    const validTeamSizes = ['just_me', '2_5', '6_20', '20_plus'];
    if (!validTeamSizes.includes(teamSize)) {
      return res.status(400).json({
        error: `teamSize must be one of: ${validTeamSizes.join(', ')}`,
      });
    }

    const validChallenges = [
      'following_up', 'too_many_leads', 'leads_go_cold',
      'organizing_conversations', 'tracking_appointments', 'converting_leads',
    ];
    if (!validChallenges.includes(biggestChallenge)) {
      return res.status(400).json({
        error: `biggestChallenge must be one of: ${validChallenges.join(', ')}`,
      });
    }

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

    const [row] = await db
      .insert(userOnboarding)
      .values(values)
      .onConflictDoUpdate({
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
      })
      .returning();

    await db.update(users).set({ onboardComplete: true }).where(eq(users.id, req.user.id));

    return res.status(200).json({ onboarding: row });
  } catch (err) {
    console.error('POST /api/onboarding error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard — GET /api/dashboard?since=<value>
//
// Returns:
//
//  Stable (all-time, never time-filtered):
//    totalLeads          — count of all visible leads (excl. pending_deletion)
//    leadsByStatus       — per-status counts (excl. pending_deletion)
//    needsAttention      — leads with inbound msg but no outbound in last 24h
//    aiManagedLeads      — leads where AI is still active
//    totalProperties     — count of all properties
//
//  Time-filtered arrays (frontend re-filters these by selected window):
//    leads[]             — visible leads created since `since`
//    inboundMessages[]   — inbound SMS + email since `since`
//    recentActivity[]    — activity items since `since`
//
//  Metadata:
//    fetchedAt           — ISO timestamp
// ---------------------------------------------------------------------------
frontendComRouter.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now    = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Resolve the since cutoff from the query param
    const sinceCutoff = resolveSinceCutoff(req.query.since);

    // ── 1. All visible leads (all-time, excl. pending_deletion) ──────────
    const allLeadsRaw = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, userId));

    const visibleLeads = allLeadsRaw.filter((l) => l.status !== 'pending_deletion');
    const visibleLeadIds = visibleLeads.map((l) => l.id);

    // ── 2. Stable KPIs ────────────────────────────────────────────────────

    // leadsByStatus — all-time
    const STATUS_LIST = ['new', 'active', 'cold', 'converted'];
    const leadsByStatus = STATUS_LIST.map((status) => ({
      status,
      count: visibleLeads.filter((l) => l.status === status).length,
    }));

    // aiManagedLeads — leads where AI is still active (not converted/disabled)
    // Treat any lead that is NOT 'converted' and NOT 'cold' as AI-managed.
    // Adjust this logic if you have an explicit aiEnabled field.
    const aiManagedLeads = visibleLeads.filter(
      (l) => l.status === 'new' || l.status === 'active'
    ).length;

    // ── 3. Properties ─────────────────────────────────────────────────────
    const allProperties = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, userId));

    // ── 4. Conversations for this user's leads ────────────────────────────
    // We fetch all conversations and filter in JS to avoid needing inArray.
    let userConversations = [];
    if (visibleLeadIds.length > 0) {
      const allConvs = await db.select().from(conversations);
      userConversations = allConvs.filter((c) => visibleLeadIds.includes(c.leadId));
    }

    const userConvIds = userConversations.map((c) => c.id);

    // Build lookup maps
    const convToLeadId   = {};
    const convToLeadName = {};
    userConversations.forEach((c) => {
      convToLeadId[c.id]   = c.leadId;
      const lead = visibleLeads.find((l) => l.id === c.leadId);
      convToLeadName[c.id] = lead?.name || null;
    });

    // ── 5. Messages ───────────────────────────────────────────────────────
    // Fetch all SMS and email for user's conversations.
    // We fetch all and filter in JS so we can reuse for both
    // the time-windowed arrays AND the needs-attention calculation.

    let allSms    = [];
    let allEmails = [];

    if (userConvIds.length > 0) {
      const rawSms = await db
        .select({
          id:             smsTable.id,
          conversationId: smsTable.conversationId,
          direction:      smsTable.direction,
          body:           smsTable.body,
          sentAt:         smsTable.sentAt,
        })
        .from(smsTable)
        .orderBy(desc(smsTable.sentAt));

      allSms = rawSms.filter((m) => userConvIds.includes(m.conversationId));

      const rawEmails = await db
        .select({
          id:             emailTable.id,
          conversationId: emailTable.conversationId,
          direction:      emailTable.direction,
          body:           emailTable.body,
          sentAt:         emailTable.sentAt,
        })
        .from(emailTable)
        .orderBy(desc(emailTable.sentAt));

      allEmails = rawEmails.filter((m) => userConvIds.includes(m.conversationId));
    }

    // ── 6. Needs Attention (always last 24h, ignores since param) ─────────
    // A lead needs attention if:
    //   - has at least one inbound message (any time)
    //   - AND has NO outbound message in the last 24 hours
    const attentionMap = {};

    const allInbound  = [...allSms, ...allEmails].filter((m) => m.direction === 'inbound');
    const recentOutbound = [...allSms, ...allEmails].filter(
      (m) => m.direction === 'outbound' && new Date(m.sentAt) >= twentyFourHoursAgo
    );

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

    const needsAttention = Object.values(attentionMap).filter(
      (v) => v.hasInbound && !v.hasRecentOutbound
    ).length;

    // ── 7. Time-filtered arrays ───────────────────────────────────────────
    // These are filtered by sinceCutoff. The frontend will re-filter
    // client-side when the user changes the time window dropdown.

    const leadsInWindow = sinceCutoff
      ? visibleLeads.filter((l) => new Date(l.createdAt) >= sinceCutoff)
      : visibleLeads;

    const inboundInWindow = sinceCutoff
      ? allInbound.filter((m) => new Date(m.sentAt) >= sinceCutoff)
      : allInbound;

    // Shape inbound messages for the frontend
    const inboundMessages = inboundInWindow.map((m) => ({
      id:        String(m.id),
      direction: m.direction,
      sentAt:    m.sentAt instanceof Date ? m.sentAt.toISOString() : m.sentAt,
      leadId:    convToLeadId[m.conversationId] ?? null,
      channel:   allSms.some((s) => s.id === m.id) ? 'sms' : 'email',
    }));

    // Shape leads for the frontend
    const leadsForFrontend = leadsInWindow.map((l) => ({
      id:        l.id,
      status:    l.status,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      name:      l.name || null,
      source:    l.source || null,
    }));

    // ── 8. Recent Activity ────────────────────────────────────────────────
    // Combine lead creations + messages into a unified activity feed.

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
      .slice(0, 100); // send up to 100; frontend will slice to 30 after filtering

    // ── 9. Respond ────────────────────────────────────────────────────────
    return res.json({
      // Stable all-time values
      totalLeads:      visibleLeads.length,
      leadsByStatus,
      needsAttention,
      aiManagedLeads,
      totalProperties: allProperties.length,

      // Time-windowed arrays
      leads:            leadsForFrontend,
      inboundMessages,
      recentActivity,

      // Metadata
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

// ---------------------------------------------------------------------------
// Leads — GET /api/leads/:id  (with notes + messages)
// ---------------------------------------------------------------------------
frontendComRouter.get('/leads/:id', requireAuth, async (req, res) => {
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

// ---------------------------------------------------------------------------
// Properties — GET /api/properties
// ---------------------------------------------------------------------------
frontendComRouter.get('/properties', requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.userId, req.user.id))
      .orderBy(desc(properties.createdAt));

    return res.json(rows);
  } catch (err) {
    console.error('GET /api/properties error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Messages — GET /api/messages
// ---------------------------------------------------------------------------
frontendComRouter.get('/messages', requireAuth, async (req, res) => {
  try {
    const smsList = await db
      .select({
        id:             smsTable.id,
        leadId:         leads.id,
        leadName:       leads.name,
        direction:      smsTable.direction,
        body:           smsTable.body,
        channel:        conversations.type,
        sentAt:         smsTable.sentAt,
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
        id:             emailTable.id,
        leadId:         leads.id,
        leadName:       leads.name,
        direction:      emailTable.direction,
        body:           emailTable.body,
        channel:        conversations.type,
        sentAt:         emailTable.sentAt,
        conversationId: emailTable.conversationId,
      })
      .from(emailTable)
      .innerJoin(conversations, eq(emailTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, req.user.id))
      .orderBy(desc(emailTable.sentAt))
      .limit(100);

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

    if (!leadId || !content) {
      return res.status(400).json({ error: 'leadId and content are required' });
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const [note] = await db
      .insert(leadNotes)
      .values({ leadId: Number(leadId), note: content })
      .returning();

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

    if (!leadId || !content || !channel) {
      return res.status(400).json({ error: 'leadId, content, and channel are required' });
    }
    if (channel !== 'sms' && channel !== 'email') {
      return res.status(400).json({ error: 'channel must be "sms" or "email"' });
    }

    const [agentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!agentUser) return res.status(404).json({ error: 'Agent user not found' });

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    let [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.leadId, Number(leadId)), eq(conversations.type, channel)))
      .limit(1);

    if (!conv) {
      [conv] = await db
        .insert(conversations)
        .values({
          leadId: Number(leadId),
          type: channel,
          status: 'active',
          initialSender: { name: agentUser.name, email: agentUser.email },
          initialRecipient: [{ name: lead.name ?? 'Lead', email: lead.email ?? '', phone: lead.phone ?? '' }],
        })
        .returning();
    }

    let message;

    if (channel === 'sms') {
      [message] = await db
        .insert(smsTable)
        .values({
          conversationId: conv.id,
          direction: 'outbound',
          body: content,
          sentAt: new Date(),
        })
        .returning();
    } else {
      [message] = await db
        .insert(emailTable)
        .values({
          conversationId: conv.id,
          direction: 'outbound',
          sender: { name: agentUser.name, email: agentUser.email },
          recipient: [{ name: lead.name ?? 'Lead', email: lead.email ?? '' }],
          cc: [],
          body: content,
          sentAt: new Date(),
        })
        .returning();
    }

    return res.status(201).json({ ...message, channel, leadId: Number(leadId) });
  } catch (err) {
    console.error('POST /api/messages error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default frontendComRouter;
