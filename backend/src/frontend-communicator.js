/**
 * frontend-communicator.js
 *
 * Express router that exposes all REST API endpoints consumed by the React
 * frontend. Mount this in your main server entry-point, e.g.:
 *
 *   import frontendComRouter from './frontend-communicator.js';
 *   app.use('/api', frontendComRouter);
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
import { eq, desc, and, gte } from 'drizzle-orm';
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
    return res.status(401).json({
      error: 'Missing auth token',
    });
  }

  try {
    const payload = verifyToken(token);

    req.user = payload;

    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      reauthenticate: true,
    });
  }
}

/** Return a safe user object (no password hash) */
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/*
async function sendConfirmationEmail(email) {
  const random6Digit = randomInt(100000, 999999);

  await db
    .insert(confirmationCodes)
    .values({
      email,
      code: random6Digit,
    })
    .onConflictDoUpdate({
      target: confirmationCodes.email,
      set: {
        code: random6Digit,
        createdAt: new Date(),
      },
    });

  try {
    await sendEmail(
      email,
      `Your RealCRM confirmation code is ${random6Digit}`,
      `<h1>Your confirmation code is: ${random6Digit}</h1>
      <p>This code will expire in 5 minutes.</p>`
    );
    console.log('Confirmation email sent to:', email);
  } catch (err) {
    console.error('Error sending confirmation email:', err);
  }
}
*/ 

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/signup/code
// Body: { code?: number, email: string, resend?: boolean }
// ---------------------------------------------------------------------------
/* frontendComRouter.post('/auth/signup/code', async (req, res) => {
  const { code, resend, email } = req.body ?? {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email field' });
  }

  // Resend-only request (no code provided, or explicit resend flag)
  if (resend || code === undefined) {
    await sendConfirmationEmail(email);
    return res.status(200).json({ message: 'Code resent — check your inbox (and spam folder).' });
  }

  const codeNum = Number(code);
  if (!Number.isInteger(codeNum) || codeNum < 100000 || codeNum > 999999) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit code.' });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [dbCode] = await db
    .select()
    .from(confirmationCodes)
    .where(
      and(
        eq(confirmationCodes.email, email),
        eq(confirmationCodes.code, codeNum),
        gte(confirmationCodes.createdAt, fiveMinutesAgo)
      )
    )
    .limit(1);

  if (!dbCode) {
    // Check if a code exists at all for this email (to give a better error)
    const [anyCode] = await db
      .select()
      .from(confirmationCodes)
      .where(eq(confirmationCodes.email, email))
      .limit(1);

    if (anyCode) {
      return res.status(400).json({ error: 'Incorrect or expired code. Please request a new one.' });
    }
    return res.status(400).json({ error: 'No confirmation code found for this email. Please request a new one.' });
  }

  // Clean up the used code
  await db
    .delete(confirmationCodes)
    .where(
      and(
        eq(confirmationCodes.email, email),
        eq(confirmationCodes.code, codeNum)
      )
    );

  // Mark the user's email as confirmed
  await db
    .update(users)
    .set({ emailConfirmed: true })
    .where(eq(users.email, email));

  return res.status(200).json({ message: 'Email confirmed successfully.' });
});
*/

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/signup
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    // Check for existing user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists. Try Google or Microsoft sign-in.' });
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

    // Fire-and-forget — don't block the response on email delivery
    /*sendConfirmationEmail(email.toLowerCase().trim()).catch((err) =>
      console.error('sendConfirmationEmail failed:', err)
    );*/

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
      return res.status(400).json({ error: 'This account uses Google or Microsoft sign-in. Please use those buttons instead.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = createToken(user.id);

    res.cookie('token', cookieJson);

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
  res.clearCookie('token', cookieJson)

  return res.json({ message: 'Logged out successfully'})
});

// ---------------------------------------------------------------------------
// Auth — GET /api/auth/me  (validate token & return current user)
// ---------------------------------------------------------------------------
frontendComRouter.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/change-password
// Body: { email: string }
//
// Generates a short-lived signed JWT reset token and emails the user a link:
//   {APP_BASE_URL}/change-password?token=xxx&changePassword=true
// ---------------------------------------------------------------------------
frontendComRouter.post('/auth/change-password', async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      return res.status(400).json({ error: 'email is required.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    // Always respond with 200 to avoid leaking whether an account exists
    if (!user) {
      return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // Generate a short-lived reset token (15 minutes)
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password_reset' },
      PASSWORD_RESET_SECRET,
      { expiresIn: process.env.TEMP_TOKEN_EXPIRATION }
    );

    const resetLink = `${APP_BASE_URL}/change-password?token=${resetToken}&changePassword=true`;

    // Fire-and-forget
    sendEmail(
      user.email,
      'Reset your RealCRM password',
      `<h1>Password Reset Request</h1>
      <p>Hi ${user.name ?? 'there'},</p>
      <p>We received a request to reset your RealCRM password. Click the link below to set a new password. This link expires in <strong>15 minutes</strong>.</p>
      <p><a href="${resetLink}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset My Password</a></p>
      <p>If the button doesn't work, copy and paste this URL into your browser:</p>
      <p>${resetLink}</p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>`
    ).catch((err) => console.error('Password reset email failed:', err));

    console.log('made it')

    return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    console.error('POST /api/auth/change-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/change-password/confirm
// Body: { token: string, newPassword: string }
//
// Verifies the reset token and updates the user's password.
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
    } catch (err) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    if (payload.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid reset token.' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({
        error: 'This account uses Google or Microsoft sign-in and does not have a password to change.',
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, user.id));

    // Send a confirmation notification — fire-and-forget
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




frontendComRouter.post('/settings/preferences', requireAuth, async (req, res) => {
  
  const { newLeadNotify, newMessageReplyNotify, weeklySummeryNotify } = req.body;

  if (!newLeadNotify && !newMessageReplyNotify && !weeklySummeryNotify) {
    res.status(400).json({ errpr: 'Invalid data' });
  }

  try {
    await db
      .update(users)
      .set({
        newLeadNotify,
        newMessageReplyNotify,
        weeklySummeryNotify,
      })
      .where(eq(users.id, req.user.id))

    return res.json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({error: 'Failed to update preferences' })
  }

});


// ---------------------------------------------------------------------------
// Onboarding — GET /api/onboarding
//
// The frontend only uses this to detect whether Gmail is connected (so it
// can render the right step 0 UI). Onboarding answers are no longer saved
// progressively, so there is no partial state to return.
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

    return res.json({
      gmailConnected: !!oauthRow,
    });
  } catch (err) {
    console.error('GET /api/onboarding error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Onboarding — POST /api/onboarding
//
// Accepts the COMPLETE onboarding bundle in a single request. The frontend
// collects all answers locally and submits everything at the final step.
//
// Required body:
//   {
//     brokerage:         string | null   (optional free text)
//     primaryMarket:     string          (required)
//     leadsPerMonth:     enum            (required)
//     leadSources:       string[]        (required, must contain >= 1)
//     leadSourceOther:   string | null   (required if leadSources includes "other")
//     contactMethod:     enum            (required, cannot be "phone")
//     teamSize:          enum            (required)
//     biggestChallenge:  enum            (required)
//     completed:         true            (required — there is no partial save)
//   }
//
// Side effects:
//   - Upserts the user_onboarding row for this user.
//   - Sets users.onboardComplete = true.
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

    // ── Validation ────────────────────────────────────────────────────────
    if (completed !== true) {
      return res.status(400).json({
        error: 'Onboarding must be submitted as a single complete bundle (completed=true).',
      });
    }

    if (!primaryMarket || typeof primaryMarket !== 'string' || !primaryMarket.trim()) {
      return res.status(400).json({ error: 'primaryMarket is required.' });
    }

    const validLeadsPerMonth = ['0_25', '25_50', '50_100', '100_plus'];
    if (!leadsPerMonth || !validLeadsPerMonth.includes(leadsPerMonth)) {
      return res.status(400).json({
        error: `leadsPerMonth is required and must be one of: ${validLeadsPerMonth.join(', ')}`,
      });
    }

    if (!Array.isArray(leadSources) || leadSources.length === 0) {
      return res.status(400).json({ error: 'leadSources must be a non-empty array.' });
    }

    if (leadSources.includes('other')) {
      if (!leadSourceOther || typeof leadSourceOther !== 'string' || !leadSourceOther.trim()) {
        return res.status(400).json({
          error: 'leadSourceOther is required when "other" is selected.',
        });
      }
      if (leadSourceOther.length > 50) {
        return res.status(400).json({
          error: 'leadSourceOther must be 50 characters or fewer.',
        });
      }
    }

    const validContactMethods = ['sms', 'email', 'mix']; // 'phone' is intentionally excluded
    if (!contactMethod || !validContactMethods.includes(contactMethod)) {
      return res.status(400).json({
        error: `contactMethod is required and must be one of: ${validContactMethods.join(', ')}`,
      });
    }

    const validTeamSizes = ['just_me', '2_5', '6_20', '20_plus'];
    if (!teamSize || !validTeamSizes.includes(teamSize)) {
      return res.status(400).json({
        error: `teamSize is required and must be one of: ${validTeamSizes.join(', ')}`,
      });
    }

    const validChallenges = [
      'following_up',
      'too_many_leads',
      'leads_go_cold',
      'organizing_conversations',
      'tracking_appointments',
      'converting_leads',
    ];
    if (!biggestChallenge || !validChallenges.includes(biggestChallenge)) {
      return res.status(400).json({
        error: `biggestChallenge is required and must be one of: ${validChallenges.join(', ')}`,
      });
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    const now = new Date();

    const values = {
      userId: req.user.id,
      brokerage: brokerage && typeof brokerage === 'string' && brokerage.trim() ? brokerage.trim() : null,
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

    // Mark onboarding complete on the user record.
    await db
      .update(users)
      .set({ onboardComplete: true })
      .where(eq(users.id, req.user.id));

    return res.status(200).json({ onboarding: row });
  } catch (err) {
    console.error('POST /api/onboarding error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard — GET /api/dashboard
// ---------------------------------------------------------------------------
frontendComRouter.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const allLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, userId));

    const allProperties = await db
      .select()
      .from(properties)
      .where(eq(properties.userId, userId));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const newLeadsToday = allLeads.filter(
      (l) => new Date(l.createdAt) >= todayStart
    ).length;

    const leadsByStatus = ['active', 'ready', 'archived', 'pending_deletion'].map((status) => ({
      status,
      count: allLeads.filter((l) => l.status === status).length,
    }));

    const recentSms = await db
      .select({
        id: smsTable.id,
        body: smsTable.body,
        direction: smsTable.direction,
        sentAt: smsTable.sentAt,
        leadId: leads.id,
        leadName: leads.name,
        channel: conversations.type,
      })
      .from(smsTable)
      .innerJoin(conversations, eq(smsTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, userId))
      .orderBy(desc(smsTable.sentAt))
      .limit(10);

    const recentEmails = await db
      .select({
        id: emailTable.id,
        body: emailTable.body,
        direction: emailTable.direction,
        sentAt: emailTable.sentAt,
        leadId: leads.id,
        leadName: leads.name,
        channel: conversations.type,
      })
      .from(emailTable)
      .innerJoin(conversations, eq(emailTable.conversationId, conversations.id))
      .innerJoin(leads, eq(conversations.leadId, leads.id))
      .where(eq(leads.userId, userId))
      .orderBy(desc(emailTable.sentAt))
      .limit(10);

    const recentActivity = [...recentSms, ...recentEmails]
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, 20)
      .map((m) => ({
        id: String(m.id),
        type: 'message_sent',
        description: m.direction === 'inbound' ? 'Inbound message received' : 'Outbound message sent',
        timestamp: m.sentAt,
        leadName: m.leadName,
      }));

    return res.json({
      totalLeads: allLeads.length,
      activeLeads: allLeads.filter((l) => l.status === 'active').length,
      convertedLeads: allLeads.filter((l) => l.status === 'ready').length,
      newLeadsToday,
      totalProperties: allProperties.length,
      recentActivity,
      leadsByStatus,
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

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

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

        allMessages = allMessages.concat(
          msgs.map((m) => ({ ...m, channel: 'sms' }))
        );
      } else if (conv.type === 'email') {
        const msgs = await db
          .select()
          .from(emailTable)
          .where(eq(emailTable.conversationId, conv.id))
          .orderBy(emailTable.sentAt);

        allMessages = allMessages.concat(
          msgs.map((m) => ({ ...m, channel: 'email' }))
        );
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
        id: smsTable.id,
        leadId: leads.id,
        leadName: leads.name,
        direction: smsTable.direction,
        body: smsTable.body,
        channel: conversations.type,
        sentAt: smsTable.sentAt,
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
        id: emailTable.id,
        leadId: leads.id,
        leadName: leads.name,
        direction: emailTable.direction,
        body: emailTable.body,
        channel: conversations.type,
        sentAt: emailTable.sentAt,
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

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

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

    // Fetch the full user record so we have name + email for conversation metadata
    const [agentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!agentUser) {
      return res.status(404).json({ error: 'Agent user not found' });
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, Number(leadId)), eq(leads.userId, req.user.id)))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

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
