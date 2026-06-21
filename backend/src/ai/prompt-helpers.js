/**
 * prompt-helpers.js
 * -----------------
 * Shared utilities for building AI prompt context sections.
 * Used by both sms-reply.js and email-reply.js.
 *
 * Nothing in this file calls OpenAI directly.
 */

/**
 * Builds the property context section of a prompt.
 *
 * @param {string|null} propertyDescription
 * @returns {string}
 */
export function buildPropertySection(propertyDescription) {
  return propertyDescription
    ? `Here is a description of the property this lead is interested in:\n${propertyDescription}`
    : 'This lead is not currently linked to a specific property.';
}

/**
 * Builds the notes section of a prompt.
 *
 * @param {string[]} notes
 * @returns {string}
 */
export function buildNotesSection(notes) {
  return notes.length > 0
    ? `Agent notes about this lead:\n${notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`
    : 'There are no existing notes about this lead.';
}

/**
 * Builds the referral guidance line appended to the lead intro.
 * Returns an empty string for non-referral leads.
 *
 * @param {string} leadSource
 * @returns {string}
 */
export function buildReferralGuidance(leadSource) {
  if (leadSource !== 'referral') return '';
  return (
    '\nIMPORTANT: This lead came in via a personal referral. They are a warm lead with an existing ' +
    'trust connection. Greet them especially warmly, acknowledge the referral relationship if possible, ' +
    'and treat them as a high-priority contact. Do not use generic cold-outreach language.'
  );
}

/**
 * Builds the conversation context block describing the current state
 * of the conversation (status, follow-ups, do-not-contact, pending questions).
 *
 * @param {object|null} conversation
 * @returns {string}
 */
export function buildConversationContext(conversation) {
  if (!conversation) return '';

  const lines = [];

  const status             = conversation.status ?? 'active';
  const unansweredFollowups = conversation.unansweredFollowups ?? 0;
  const doNotContactUntil  = conversation.doNotContactUntil
    ? new Date(conversation.doNotContactUntil).toISOString()
    : null;
  const state = conversation.conversationState ?? null;

  lines.push(`Conversation status: ${status}`);
  lines.push(`Unanswered follow-ups sent so far: ${unansweredFollowups}`);

  if (doNotContactUntil) {
    lines.push(`The lead asked not to be contacted until: ${doNotContactUntil}. Acknowledge this if relevant.`);
  }

  if (state?.awaitingAnswer && state?.pendingQuestion) {
    lines.push(`You previously asked the lead: "${state.pendingQuestion}" and are still awaiting their answer.`);
  }

  if (state?.reason) {
    lines.push(`Context note from previous interaction: ${state.reason}`);
  }

  if (unansweredFollowups >= 2) {
    lines.push(
      `This lead has not responded to ${unansweredFollowups} follow-up(s). ` +
      `Keep the tone warm but do not be pushy. Consider varying your approach.`
    );
  }

  return `Conversation context:\n${lines.map((l) => `  - ${l}`).join('\n')}`;
}

/**
 * Shared guidelines appended to every prompt regardless of mode.
 * Covers notes, tasks, readyToBook, and conversation state tracking.
 */
export const SHARED_GUIDELINES = `
Guidelines for addNote:
- Add a note if the lead revealed something important (budget, timeline, preferences, concerns, etc.)
- Return null if the message was small talk or nothing noteworthy was said.

Guidelines for addTask:
- Create a task if the lead requested a callback, a showing, more info, or anything that requires agent follow-up.
- Return null if no agent action is required.

Guidelines for readyToBook:
- Set to true ONLY if the lead has clearly expressed they are ready to schedule a viewing, meeting, or appointment.
- Strong signals: "I'd like to schedule a visit", "When can we meet?", "I'm ready to see the property", "Can we book a showing?"
- Do NOT set to true for general interest, questions about the property, or vague positive responses.
- Set to false in all other cases.

Guidelines for updateConversationState:
- If you asked the lead a question and need to remember it, set awaitingAnswer to true and populate pendingQuestion.
- If the lead asked for space or gave a reason for delay, set awaitingAnswer to false and populate reason.
- If nothing notable needs to be tracked, return null.`;

/**
 * Injects prior conversation history as alternating user/assistant messages.
 *
 * @param {Array<{direction: string, body: string}>} history
 * @returns {Array<{role: string, content: string}>}
 */
export function buildHistoryMessages(history) {
  return history.map((message) => ({
    role:    message.direction === 'inbound' ? 'user' : 'assistant',
    content: message.body ?? '',
  }));
}
