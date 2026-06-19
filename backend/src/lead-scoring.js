import { generateAiLeadScore } from './ai-helpers.js';

/*
|--------------------------------------------------------------------------
| Lead Scoring System
|--------------------------------------------------------------------------
|
| Scores a lead out of 100 points across 9 criteria.
| Weights reflect the relative importance of each signal:
|
|   1.  AI Scoring              (30 pts) — GPT-4o-mini behavioral assessment
|   2.  Engagement Level        (15 pts) — reply/message count
|   3.  Lead Status             (12 pts) — current CRM/conversation status
|   4.  Response Time           (10 pts) — how quickly the lead replies
|   5.  Lead Source             ( 8 pts) — origin quality (referral > Zillow > Realtor.com > other)
|   6.  Unanswered Follow-Ups   ( 8 pts) — number of ignored follow-ups
|   7.  Property Interest       ( 7 pts) — whether the lead is linked to a property
|   8.  Previous Interactions   ( 5 pts) — notes and tasks associated with the lead
|   9.  Demographics            ( 3 pts) — location/income/budget signals from notes
|
| Opt-out status is folded into Lead Status (criterion 3):
|   opted_out / not_interested → 0 pts.
|
| The final score is the sum of all criteria (0–100).
|
*/

/*
 * Criterion 2 — Engagement Level
 *
 * Measures how often the lead has replied or interacted.
 * Based on the count of inbound messages across all conversations.
 * Max: 15 pts
 *
 * Parameters:
 *   history: Array — all messages from loadEmailHistory() or loadSmsHistory()
 *
 * Returns: number (0–15)
 */
export function scoreEngagementLevel(history) {
  const inboundCount = history.filter((m) => m.direction === 'inbound').length;

  if (inboundCount === 0) return 0;
  if (inboundCount === 1) return 5;
  if (inboundCount === 2) return 8;
  if (inboundCount === 3) return 11;
  if (inboundCount === 4) return 13;
  return 15; // 5+ replies
}

/*
 * Criterion 4 — Response Time
 *
 * Measures how quickly the lead replies to outbound messages.
 * Looks at pairs of (outbound → inbound) messages and averages the gap.
 * Max: 10 pts
 *
 * Parameters:
 *   history: Array — messages with sentAt timestamps and direction fields
 *
 * Returns: number (0–10)
 */
export function scoreResponseTime(history) {
  const gaps = [];

  for (let i = 0; i < history.length - 1; i++) {
    const current = history[i];
    const next = history[i + 1];

    if (current.direction === 'outbound' && next.direction === 'inbound') {
      const outTime = current.sentAt ? new Date(current.sentAt).getTime() : null;
      const inTime = next.sentAt ? new Date(next.sentAt).getTime() : null;

      if (outTime && inTime && inTime > outTime) {
        gaps.push(inTime - outTime);
      }
    }
  }

  if (gaps.length === 0) return 0;

  const avgGapMs = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const avgGapHours = avgGapMs / (1000 * 60 * 60);

  if (avgGapHours <= 1) return 10;   // Under 1 hour
  if (avgGapHours <= 4) return 8;    // Under 4 hours
  if (avgGapHours <= 12) return 6;   // Under 12 hours
  if (avgGapHours <= 24) return 4;   // Under 1 day
  if (avgGapHours <= 72) return 2;   // Under 3 days
  return 1;                          // Very slow
}

/*
 * Criterion 5 — Lead Source
 *
 * Higher-intent / higher-trust sources score higher.
 * Referrals are the highest quality source — they come with an existing
 * trust relationship and convert at a significantly higher rate.
 * Max: 8 pts
 *
 * Source ranking:
 *   referral  → 8 pts  (personal referral, highest trust)
 *   zillow    → 7 pts  (high-intent marketplace lead)
 *   realtor   → 6 pts  (high-intent marketplace lead)
 *   other     → 3 pts  (unknown but present source)
 *   none      → 1 pt   (no source recorded)
 *
 * Parameters:
 *   lead: object — the lead record from the database (has a `source` field)
 *
 * Returns: number (0–8)
 */
export function scoreLeadSource(lead) {
  const source = (lead?.source || '').toLowerCase();

  if (source === 'referral') return 8;
  if (source === 'zillow') return 7;
  if (source === 'realtor') return 6;
  if (source !== '') return 3; // Unknown but present source
  return 1;                    // No source recorded
}

/*
 * Criterion 7 — Property Interest
 *
 * Whether the lead is linked to a specific property and has a description.
 * Max: 7 pts
 *
 * Parameters:
 *   propertyDescription: string | null
 *
 * Returns: number (0–7)
 */
export function scorePropertyInterest(propertyDescription) {
  if (!propertyDescription) return 0;
  if (propertyDescription.trim().length > 100) return 7;
  if (propertyDescription.trim().length > 20) return 4;
  return 2;
}

/*
 * Criterion 9 — Demographics
 *
 * Infers demographic signals from lead notes.
 * Looks for keywords related to budget, income, location, and pre-approval.
 * Max: 3 pts
 *
 * Parameters:
 *   notes: Array<string> — lead note strings from loadLeadNotes()
 *
 * Returns: number (0–3)
 */
export function scoreDemographics(notes) {
  if (!notes || notes.length === 0) return 0;

  const combined = notes.join(' ').toLowerCase();
  let score = 0;

  const signals = [
    { pattern: /pre.?approv/i, points: 2 },
    { pattern: /cash buyer|paying cash/i, points: 2 },
    { pattern: /budget|afford|price range/i, points: 1 },
    { pattern: /income|salary|earns/i, points: 1 },
    { pattern: /local|nearby|area|neighborhood/i, points: 1 },
    { pattern: /relocat/i, points: 1 },
  ];

  for (const signal of signals) {
    if (signal.pattern.test(combined)) {
      score += signal.points;
    }
  }

  return Math.min(score, 3);
}

/*
 * Criterion 8 — Previous Interactions
 *
 * Rewards leads with a richer history of notes and tasks.
 * Max: 5 pts
 *
 * Parameters:
 *   notes: Array<string>  — lead note strings
 *   tasks: Array<object>  — lead task objects from the database
 *
 * Returns: number (0–5)
 */
export function scorePreviousInteractions(notes, tasks) {
  let score = 0;

  score += Math.min(notes.length, 3);  // Up to 3 pts for notes
  score += Math.min(tasks.length, 2);  // Up to 2 pts for tasks

  return Math.min(score, 5);
}

/*
 * Criterion 3 — Lead Status
 *
 * Maps the lead's current conversation status to a score.
 * Also covers opt-out: opted_out / not_interested → 0 pts.
 * Max: 12 pts
 *
 * Parameters:
 *   conversation: object | null — a single conversation record from the database
 *
 * Returns: number (0–12)
 */
export function scoreConversationStatus(conversation) {
  switch (conversation?.status) {
    case 'converted':
      return 12;

    case 'active':
      return 9;

    case 'cold':
      return 3;

    case 'not_interested':
    case 'opted_out':
      return 0;

    default:
      return 2;
  }
}

/*
 * Criterion 6 — Unanswered Follow-Ups
 *
 * More unanswered follow-ups means lower interest.
 * Max: 8 pts
 *
 * Parameters:
 *   conversation: object | null — a single conversation record with an unansweredFollowups field
 *
 * Returns: number (0–8)
 */
export function scoreUnansweredFollowUps(conversation) {
  const followUps = conversation?.unansweredFollowups ?? 0;

  if (followUps === 0) return 8;
  if (followUps === 1) return 5;
  if (followUps === 2) return 2;
  if (followUps === 3) return 1;
  return 0;
}

/*
 * Scores a lead across all 9 criteria and returns a detailed breakdown.
 *
 * Parameters:
 *   lead:                object        — the lead record from the database
 *   conversation:        object | null — the most relevant conversation record for this lead
 *   history:             Array         — all messages (email or SMS) for this lead
 *   notes:               Array<string> — lead note strings from loadLeadNotes()
 *   tasks:               Array         — lead task objects from the database
 *   propertyDescription: string | null — from loadPropertyDescription()
 *
 * Returns:
 *   {
 *     total:      number,   — 0 to 100
 *     breakdown: {
 *       aiScore:              number,  — 0–30
 *       engagementLevel:      number,  — 0–15
 *       leadStatus:           number,  — 0–12
 *       responseTime:         number,  — 0–10
 *       leadSource:           number,  — 0–8  (referral=8, zillow=7, realtor=6, other=3, none=1)
 *       unansweredFollowUps:  number,  — 0–8
 *       propertyInterest:     number,  — 0–7
 *       previousInteractions: number,  — 0–5
 *       demographics:         number,  — 0–3
 *     },
 *     aiReasoning: string | null,
 *   }
 */
export async function scoreLead(lead, conversation, history, notes, tasks, propertyDescription) {
  const engagementLevel = scoreEngagementLevel(history);
  const responseTime = scoreResponseTime(history);
  const leadSource = scoreLeadSource(lead);
  const propertyInterest = scorePropertyInterest(propertyDescription);
  const demographics = scoreDemographics(notes);
  const previousInteractions = scorePreviousInteractions(notes, tasks);
  const leadStatus = scoreConversationStatus(conversation);
  const unansweredFollowUps = scoreUnansweredFollowUps(conversation);

  // Criterion 1 — AI Scoring (0–30)
  const { score: aiScore, reasoning: aiReasoning } = await generateAiLeadScore(
    lead,
    history,
    notes,
    propertyDescription,
  );

  const breakdown = {
    aiScore,
    engagementLevel,
    leadStatus,
    responseTime,
    leadSource,
    unansweredFollowUps,
    propertyInterest,
    previousInteractions,
    demographics,
  };

  const total = Object.values(breakdown).reduce((sum, s) => sum + s, 0);

  return {
    total,
    breakdown,
    aiReasoning,
  };
}
