import { Router } from 'express';
import { db } from '../../db/index.js';
import { users, userOnboarding, oauthAccounts } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// GET /api/onboarding
router.get('/', requireAuth, async (req, res) => {
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

// POST /api/onboarding
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      brokerage, primaryMarket, leadsPerMonth, leadSources,
      leadSourceOther, contactMethod, teamSize, biggestChallenge, completed,
    } = req.body ?? {};

    if (completed !== true) {
      return res.status(400).json({ error: 'Onboarding must be submitted as a single complete bundle (completed=true).' });
    }
    if (!brokerage?.trim()) {
      return res.status(400).json({ error: 'brokerage is required.' });
    }
    if (!primaryMarket?.trim()) {
      return res.status(400).json({ error: 'primaryMarket is required.' });
    }

    const validLeadsPerMonth = ['0_25', '25_50', '50_100', '100_plus'];
    if (!validLeadsPerMonth.includes(leadsPerMonth)) {
      return res.status(400).json({ error: `leadsPerMonth must be one of: ${validLeadsPerMonth.join(', ')}` });
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

    const validContactMethods = ['sms', 'email', 'mix', 'phone'];
    if (!validContactMethods.includes(contactMethod)) {
      return res.status(400).json({ error: `contactMethod must be one of: ${validContactMethods.join(', ')}` });
    }

    const validTeamSizes = ['just_me', '2_5', '6_20', '20_plus'];
    if (!validTeamSizes.includes(teamSize)) {
      return res.status(400).json({ error: `teamSize must be one of: ${validTeamSizes.join(', ')}` });
    }

    const validChallenges = ['following_up', 'too_many_leads', 'leads_go_cold', 'organizing_conversations', 'tracking_appointments', 'converting_leads'];
    if (!validChallenges.includes(biggestChallenge)) {
      return res.status(400).json({ error: `biggestChallenge must be one of: ${validChallenges.join(', ')}` });
    }

    const now = new Date();
    const values = {
      userId:          req.user.id,
      brokerage:       brokerage.trim(),
      primaryMarket:   primaryMarket.trim(),
      leadsPerMonth,
      leadSources,
      leadSourceOther: leadSources.includes('other') ? leadSourceOther.trim() : null,
      contactMethod,
      teamSize,
      biggestChallenge,
      createdAt:       now,
      updatedAt:       now,
      completedAt:     now,
    };

    const [row] = await db
      .insert(userOnboarding)
      .values(values)
      .onConflictDoUpdate({
        target: userOnboarding.userId,
        set: {
          brokerage:       values.brokerage,
          primaryMarket:   values.primaryMarket,
          leadsPerMonth:   values.leadsPerMonth,
          leadSources:     values.leadSources,
          leadSourceOther: values.leadSourceOther,
          contactMethod:   values.contactMethod,
          teamSize:        values.teamSize,
          biggestChallenge: values.biggestChallenge,
          updatedAt:       now,
          completedAt:     now,
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

export default router;
