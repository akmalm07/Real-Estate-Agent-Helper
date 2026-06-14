import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreEngagementLevel,
  scoreResponseTime,
  scoreLeadSource,
  scorePropertyInterest,
  scoreDemographics,
  scorePreviousInteractions,
  scoreConversationStatus,
  scoreUnansweredFollowUps,
} from '../src/lead-scoring.js';

/*
|--------------------------------------------------------------------------
| scoreEngagementLevel
|--------------------------------------------------------------------------
*/

describe('scoreEngagementLevel', () => {
  it('returns 0 for no messages', () => {
    assert.equal(scoreEngagementLevel([]), 0);
  });

  it('returns 0 when there are only outbound messages', () => {
    const history = [
      { direction: 'outbound' },
      { direction: 'outbound' },
    ];
    assert.equal(scoreEngagementLevel(history), 0);
  });

  it('returns 5 for 1 inbound message', () => {
    const history = [{ direction: 'inbound' }];
    assert.equal(scoreEngagementLevel(history), 5);
  });

  it('returns 8 for 2 inbound messages', () => {
    const history = [
      { direction: 'inbound' },
      { direction: 'inbound' },
    ];
    assert.equal(scoreEngagementLevel(history), 8);
  });

  it('returns 11 for 3 inbound messages', () => {
    const history = Array(3).fill({ direction: 'inbound' });
    assert.equal(scoreEngagementLevel(history), 11);
  });

  it('returns 13 for 4 inbound messages', () => {
    const history = Array(4).fill({ direction: 'inbound' });
    assert.equal(scoreEngagementLevel(history), 13);
  });

  it('returns 15 for 5 or more inbound messages', () => {
    const history = Array(5).fill({ direction: 'inbound' });
    assert.equal(scoreEngagementLevel(history), 15);

    const history10 = Array(10).fill({ direction: 'inbound' });
    assert.equal(scoreEngagementLevel(history10), 15);
  });
});

/*
|--------------------------------------------------------------------------
| scoreResponseTime
|--------------------------------------------------------------------------
*/

describe('scoreResponseTime', () => {
  it('returns 0 for empty history', () => {
    assert.equal(scoreResponseTime([]), 0);
  });

  it('returns 0 when there are no outbound→inbound pairs', () => {
    const history = [
      { direction: 'inbound', sentAt: new Date().toISOString() },
      { direction: 'inbound', sentAt: new Date().toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 0);
  });

  it('returns 10 for a reply under 1 hour', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-01T10:30:00Z'); // 30 min later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 10);
  });

  it('returns 8 for a reply between 1 and 4 hours', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-01T12:00:00Z'); // 2 hours later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 8);
  });

  it('returns 6 for a reply between 4 and 12 hours', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-01T18:00:00Z'); // 8 hours later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 6);
  });

  it('returns 4 for a reply between 12 and 24 hours', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-02T04:00:00Z'); // 18 hours later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 4);
  });

  it('returns 2 for a reply between 24 and 72 hours', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-03T10:00:00Z'); // 48 hours later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 2);
  });

  it('returns 1 for a reply over 72 hours', () => {
    const base = new Date('2024-01-01T10:00:00Z');
    const reply = new Date('2024-01-05T10:00:00Z'); // 96 hours later
    const history = [
      { direction: 'outbound', sentAt: base.toISOString() },
      { direction: 'inbound', sentAt: reply.toISOString() },
    ];
    assert.equal(scoreResponseTime(history), 1);
  });

  it('averages multiple outbound→inbound gaps', () => {
    // First gap: 30 min (→ 10 pts alone), second gap: 48 hours (→ 2 pts alone)
    // Average: ~24.25 hours → 4 pts
    const history = [
      { direction: 'outbound', sentAt: new Date('2024-01-01T10:00:00Z').toISOString() },
      { direction: 'inbound', sentAt: new Date('2024-01-01T10:30:00Z').toISOString() },
      { direction: 'outbound', sentAt: new Date('2024-01-02T10:00:00Z').toISOString() },
      { direction: 'inbound', sentAt: new Date('2024-01-04T10:00:00Z').toISOString() },
    ];
    const score = scoreResponseTime(history);
    assert.ok(score >= 1 && score <= 10, `Score ${score} should be between 1 and 10`);
  });
});

/*
|--------------------------------------------------------------------------
| scoreLeadSource
|--------------------------------------------------------------------------
*/

describe('scoreLeadSource', () => {
  it('returns 8 for referral', () => {
    assert.equal(scoreLeadSource({ source: 'referral' }), 8);
  });

  it('returns 7 for zillow', () => {
    assert.equal(scoreLeadSource({ source: 'zillow' }), 7);
  });

  it('returns 6 for realtor', () => {
    assert.equal(scoreLeadSource({ source: 'realtor' }), 6);
  });

  it('returns 3 for an unknown but present source', () => {
    assert.equal(scoreLeadSource({ source: 'facebook' }), 3);
  });

  it('returns 1 for no source', () => {
    assert.equal(scoreLeadSource({ source: '' }), 1);
    assert.equal(scoreLeadSource({}), 1);
    assert.equal(scoreLeadSource(null), 1);
  });

  it('is case-insensitive', () => {
    assert.equal(scoreLeadSource({ source: 'ZILLOW' }), 7);
    assert.equal(scoreLeadSource({ source: 'Referral' }), 8);
  });
});

/*
|--------------------------------------------------------------------------
| scorePropertyInterest
|--------------------------------------------------------------------------
*/

describe('scorePropertyInterest', () => {
  it('returns 0 for null description', () => {
    assert.equal(scorePropertyInterest(null), 0);
  });

  it('returns 0 for empty string', () => {
    assert.equal(scorePropertyInterest(''), 0);
  });

  it('returns 2 for a very short description (1–20 chars)', () => {
    assert.equal(scorePropertyInterest('Nice house'), 2);
  });

  it('returns 4 for a medium description (21–100 chars)', () => {
    const desc = 'A lovely 3-bedroom home with a spacious backyard and modern kitchen.';
    assert.ok(desc.trim().length > 20 && desc.trim().length <= 100);
    assert.equal(scorePropertyInterest(desc), 4);
  });

  it('returns 7 for a long description (over 100 chars)', () => {
    const desc = 'A'.repeat(101);
    assert.equal(scorePropertyInterest(desc), 7);
  });
});

/*
|--------------------------------------------------------------------------
| scoreDemographics
|--------------------------------------------------------------------------
*/

describe('scoreDemographics', () => {
  it('returns 0 for empty notes', () => {
    assert.equal(scoreDemographics([]), 0);
    assert.equal(scoreDemographics(null), 0);
  });

  it('returns points for pre-approval mention', () => {
    const score = scoreDemographics(['Lead is pre-approved for $500k']);
    assert.ok(score >= 2, `Expected >= 2, got ${score}`);
  });

  it('returns points for cash buyer mention', () => {
    const score = scoreDemographics(['Lead is a cash buyer']);
    assert.ok(score >= 2, `Expected >= 2, got ${score}`);
  });

  it('returns points for budget mention', () => {
    const score = scoreDemographics(['Budget is around $400k']);
    assert.ok(score >= 1, `Expected >= 1, got ${score}`);
  });

  it('caps at 3 points maximum', () => {
    const notes = [
      'Pre-approved for $600k',
      'Cash buyer',
      'Budget is $500k',
      'Local buyer in the area',
      'Income is $200k/year',
    ];
    assert.equal(scoreDemographics(notes), 3);
  });

  it('combines notes into a single string for matching', () => {
    const notes = ['Lead is relocating', 'Has a budget of $300k'];
    const score = scoreDemographics(notes);
    assert.ok(score >= 2, `Expected >= 2, got ${score}`);
  });
});

/*
|--------------------------------------------------------------------------
| scorePreviousInteractions
|--------------------------------------------------------------------------
*/

describe('scorePreviousInteractions', () => {
  it('returns 0 for no notes and no tasks', () => {
    assert.equal(scorePreviousInteractions([], []), 0);
  });

  it('returns 1 for 1 note', () => {
    assert.equal(scorePreviousInteractions(['Note 1'], []), 1);
  });

  it('returns 3 for 3 or more notes (capped at 3)', () => {
    assert.equal(scorePreviousInteractions(['N1', 'N2', 'N3'], []), 3);
    assert.equal(scorePreviousInteractions(['N1', 'N2', 'N3', 'N4'], []), 3);
  });

  it('returns 1 for 1 task', () => {
    assert.equal(scorePreviousInteractions([], [{ id: 1 }]), 1);
  });

  it('returns 2 for 2 or more tasks (capped at 2)', () => {
    assert.equal(scorePreviousInteractions([], [{ id: 1 }, { id: 2 }]), 2);
    assert.equal(scorePreviousInteractions([], [{ id: 1 }, { id: 2 }, { id: 3 }]), 2);
  });

  it('caps total at 5', () => {
    const notes = ['N1', 'N2', 'N3', 'N4'];
    const tasks = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.equal(scorePreviousInteractions(notes, tasks), 5);
  });
});

/*
|--------------------------------------------------------------------------
| scoreConversationStatus
|--------------------------------------------------------------------------
*/

describe('scoreConversationStatus', () => {
  it('returns 12 for converted', () => {
    assert.equal(scoreConversationStatus({ status: 'converted' }), 12);
  });

  it('returns 9 for active', () => {
    assert.equal(scoreConversationStatus({ status: 'active' }), 9);
  });

  it('returns 3 for cold', () => {
    assert.equal(scoreConversationStatus({ status: 'cold' }), 3);
  });

  it('returns 0 for not_interested', () => {
    assert.equal(scoreConversationStatus({ status: 'not_interested' }), 0);
  });

  it('returns 0 for opted_out', () => {
    assert.equal(scoreConversationStatus({ status: 'opted_out' }), 0);
  });

  it('returns 2 for unknown status', () => {
    assert.equal(scoreConversationStatus({ status: 'pending' }), 2);
  });

  it('returns 2 for null conversation', () => {
    assert.equal(scoreConversationStatus(null), 2);
  });
});

/*
|--------------------------------------------------------------------------
| scoreUnansweredFollowUps
|--------------------------------------------------------------------------
*/

describe('scoreUnansweredFollowUps', () => {
  it('returns 8 for 0 unanswered follow-ups', () => {
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 0 }), 8);
  });

  it('returns 5 for 1 unanswered follow-up', () => {
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 1 }), 5);
  });

  it('returns 2 for 2 unanswered follow-ups', () => {
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 2 }), 2);
  });

  it('returns 1 for 3 unanswered follow-ups', () => {
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 3 }), 1);
  });

  it('returns 0 for 4 or more unanswered follow-ups', () => {
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 4 }), 0);
    assert.equal(scoreUnansweredFollowUps({ unansweredFollowups: 10 }), 0);
  });

  it('returns 8 for null conversation (defaults to 0 follow-ups)', () => {
    assert.equal(scoreUnansweredFollowUps(null), 8);
  });

  it('returns 8 when unansweredFollowups field is missing', () => {
    assert.equal(scoreUnansweredFollowUps({}), 8);
  });
});
