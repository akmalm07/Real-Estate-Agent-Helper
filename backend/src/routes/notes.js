import { Router } from 'express';
import { db } from '../../db/index.js';
import { leads, leadNotes } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// POST /api/notes
router.post('/', requireAuth, async (req, res) => {
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

export default router;
