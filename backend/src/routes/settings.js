import { Router } from 'express';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// POST /api/settings/preferences
router.post('/preferences', requireAuth, async (req, res) => {
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
    console.error('POST /api/settings/preferences error:', err);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
