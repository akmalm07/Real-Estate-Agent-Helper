import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createToken } from '../jwt.js';
import { cookieJson } from '../consts.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendEmail } from '../phone.js';

const router = Router();

const PASSWORD_RESET_SECRET = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
    res.cookie('token', token, cookieJson);
    return res.json({ user: safeUser(user) });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  res.clearCookie('token', cookieJson);
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
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

// POST /api/auth/change-password  (request reset link)
router.post('/change-password', async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    const genericOk = { message: 'If an account with that email exists, a password reset link has been sent.' };
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
      `<h1>Password Reset Request</h1><p>Hi ${user.name ?? 'there'},</p>` +
      `<p>Click the link below to set a new password. This link expires in <strong>15 minutes</strong>.</p>` +
      `<p><a href="${resetLink}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset My Password</a></p>` +
      `<p>If you did not request this, you can safely ignore this email.</p>`
    ).catch((err) => console.error('Password reset email failed:', err));

    return res.status(200).json(genericOk);
  } catch (err) {
    console.error('POST /api/auth/change-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/change-password/confirm
router.post('/change-password/confirm', async (req, res) => {
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

    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.passwordHash || user.source !== 'manual') {
      return res.status(400).json({ error: 'This account uses Google or Microsoft sign-in and does not have a password.' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, user.id));

    sendEmail(
      user.email,
      'Your RealCRM password has been changed',
      `<h1>Password Changed</h1><p>Hi ${user.name ?? 'there'},</p>` +
      `<p>Your RealCRM account password was just changed successfully.</p>` +
      `<p>If you did not make this change, please contact support immediately.</p>`
    ).catch((err) => console.error('Password change notification email failed:', err));

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('POST /api/auth/change-password/confirm error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
