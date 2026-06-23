/**
 * ai-helpers.js
 * -------------
 * Re-export shim — preserves backward compatibility with all existing
 * callers (sms-helpers.js, email-helpers.js, etc.) while the actual
 * logic now lives in focused modules under backend/src/ai/.
 *
 * DO NOT add logic here. Import from the specific modules instead:
 *   - SMS replies:    import { generateSmsAiReply }   from './ai/sms-reply.js'
 *   - Email replies:  import { generateEmailAiReply }  from './ai/email-reply.js'
 *   - Lead scoring:   import { generateAiLeadScore }   from './ai/lead-scorer.js'
 *   - Opt-out check:  import { isOptOut }              from './ai/sms-reply.js'
 */

export { generateSmsAiReply,  isOptOut }      from './ai/sms-reply.js';
export { generateEmailAiReply }               from './ai/email-reply.js';
export { generateAiLeadScore }                from './ai/lead-scorer.js';

/**
 * generateAiReply — legacy wrapper kept for any callers that still use
 * the old unified signature: generateAiReply(mode, lead, conversation, ...)
 *
 * New code should call generateSmsAiReply or generateEmailAiReply directly.
 *
 * @param {'sms'|'email'} mode
 * @param {object|null}   lead
 * @param {object|null}   conversation
 * @param {string}        inboundText       - SMS body OR email body
 * @param {string|null}   inboundSubject    - email subject (email mode only)
 * @param {string|null}   propertyDescription
 * @param {Array}         history
 * @param {string[]}      notes
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 */
export async function generateAiReply(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes, agentInfo = null) {
  if (mode === 'sms') {
    const { generateSmsAiReply } = await import('./ai/sms-reply.js');
    return generateSmsAiReply(lead, conversation, inboundText, propertyDescription, history, notes, agentInfo);
  }

  if (mode === 'email') {
    const { generateEmailAiReply } = await import('./ai/email-reply.js');
    return generateEmailAiReply(lead, conversation, inboundSubject, inboundText, propertyDescription, history, notes, agentInfo);
  }

  throw new Error(`[ai-helpers] Unknown mode: "${mode}". Expected "sms" or "email".`);
}
