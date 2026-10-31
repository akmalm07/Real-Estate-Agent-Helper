/**
 * lead-scorer.js
 * --------------
 * Scores a lead's intent and quality using GPT-4o-mini.
 *
 * Exports:
 *   generateAiLeadScore(lead, history, notes, propertyDescription)
 *   → { score: number (0–30), reasoning: string }
 */

import OpenAI from 'openai';
import { lazyClient } from '../testing/local-boundary.js';

const openai = lazyClient(() => new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

/*
|--------------------------------------------------------------------------
| Response schema
|--------------------------------------------------------------------------
*/

const SCORE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'lead_score',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        score: {
          type: 'integer',
          description: 'Lead quality score from 0 to 30.',
        },
        reasoning: {
          type: 'string',
          description: 'One or two sentences explaining the score.',
        },
      },
      required: ['score', 'reasoning'],
      additionalProperties: false,
    },
  },
};

/*
|--------------------------------------------------------------------------
| Scoring guide (injected into system prompt)
|--------------------------------------------------------------------------
*/

const SCORING_GUIDE = `
Scoring guide:
   0–6:  Very low intent, unresponsive, or clearly not interested.
   7–12: Low intent, minimal engagement, vague interest.
  13–18: Moderate intent, some engagement, unclear timeline.
  19–24: High intent, responsive, clear interest in a property.
  25–30: Very high intent, actively engaged, strong buying signals.`.trim();

/*
|--------------------------------------------------------------------------
| Main export
|--------------------------------------------------------------------------
*/

/**
 * generateAiLeadScore(lead, history, notes, propertyDescription)
 * --------------------------------------------------------------
 * Assesses a lead's behavior and intent, returning a score from 0–30
 * and a short reasoning string.
 *
 * Falls back to { score: 0, reasoning: 'AI scoring unavailable.' } on error.
 *
 * @param {object|null}  lead
 * @param {Array}        history              - conversation message history
 * @param {string[]}     notes                - agent notes about the lead
 * @param {string|null}  propertyDescription
 *
 * @returns {Promise<{ score: number, reasoning: string }>}
 */
export async function generateAiLeadScore(lead, history, notes, propertyDescription) {
  const leadName   = lead?.name   ?? 'Unknown';
  const leadSource = lead?.source ?? 'Unknown';
  const leadStatus = lead?.status ?? 'Unknown';
  const isReferral = leadSource === 'referral';

  const referralNote = isReferral
    ? '\nNOTE: This lead came in via a personal referral. Referral leads have an inherent trust advantage ' +
      'and higher baseline conversion likelihood. Weight this positively in your score.'
    : '';

  const systemPrompt = [
    'You are an expert real estate lead analyst.',
    'You will be given information about a lead and their conversation history.',
    'Your job is to assess the lead\'s overall quality, intent, and likelihood to convert, and assign a score from 0 to 30.',
    '',
    SCORING_GUIDE,
    referralNote,
  ].filter(Boolean).join('\n');

  const historyText = history.length > 0
    ? history.map((m) => `[${m.direction}] ${m.body ?? ''}`).join('\n')
    : 'No conversation history.';

  const notesText = notes.length > 0
    ? notes.map((n, i) => `${i + 1}. ${n}`).join('\n')
    : 'No notes.';

  const userPrompt = [
    `Lead name: ${leadName}`,
    `Lead source: ${leadSource}`,
    `Lead status: ${leadStatus}`,
    '',
    `Property of interest:\n${propertyDescription ?? 'No property linked.'}`,
    '',
    `Conversation history:\n${historyText}`,
    '',
    `Agent notes:\n${notesText}`,
  ].join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens:      200,
      response_format: SCORE_RESPONSE_FORMAT,
    });

    const parsed = JSON.parse(completion.choices[0].message.content.trim());

    return {
      score:     Math.min(30, Math.max(0, Math.round(parsed.score ?? 0))),
      reasoning: parsed.reasoning ?? 'No reasoning provided.',
    };
  } catch (err) {
    console.error('[lead-scorer] OpenAI call failed:', err);
    return { score: 0, reasoning: 'AI scoring unavailable.' };
  }
}
