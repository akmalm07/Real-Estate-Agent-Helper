/**
 * correction-logger.js
 * --------------------
 * STAGE 8: Learning from User Corrections
 *
 * When an agent manually corrects a lead's name, email, phone, or source,
 * we store the original detected values alongside the corrected values.
 *
 * This data is NOT used for model training yet.
 * It is stored for future parser improvement and audit purposes.
 *
 * The corrections are written to the `lead_parse_corrections` table,
 * defined in schema.js and managed by drizzle-orm migrations.
 */

import { db } from '../../db/index.js';
import { leadParseCorrections } from '../../db/schema.js';

/** Current parser version — bump this when parsers change significantly */
const PARSER_VERSION = '2.0.0';

/**
 * logParseCorrection(params)
 * --------------------------
 * Records a correction made by an agent to a parsed lead.
 *
 * Only writes a record if at least one field actually changed.
 * Safe to call speculatively — it is a no-op when nothing changed.
 *
 * @param {object} params
 * @param {number}      params.leadId            - ID of the lead being corrected
 * @param {object}      params.rawEmail          - original email data
 * @param {string}      params.rawEmail.subject
 * @param {string}      params.rawEmail.body
 * @param {string}      params.rawEmail.from
 * @param {object}      params.detected          - what the parser found
 * @param {string|null} params.detected.source
 * @param {string|null} params.detected.name
 * @param {string|null} params.detected.email
 * @param {string|null} params.detected.phone
 * @param {number}      params.detected.confidence
 * @param {string[]}    params.detected.matchedSignals
 * @param {object}      params.corrected         - what the agent changed it to
 * @param {string|null} params.corrected.source
 * @param {string|null} params.corrected.name
 * @param {string|null} params.corrected.email
 * @param {string|null} params.corrected.phone
 *
 * @returns {Promise<void>}
 */
export async function logParseCorrection({
  leadId,
  rawEmail,
  detected,
  corrected,
}) {
  // Determine which fields actually changed
  const changedFields = [];
  if (corrected.source && corrected.source !== detected.source) changedFields.push('source');
  if (corrected.name   && corrected.name   !== detected.name)   changedFields.push('name');
  if (corrected.email  && corrected.email  !== detected.email)  changedFields.push('email');
  if (corrected.phone  && corrected.phone  !== detected.phone)  changedFields.push('phone');

  // Nothing actually changed — skip
  if (changedFields.length === 0) return;

  // Log to console for observability regardless of DB outcome
  console.log('[correction-logger] Lead parse correction recorded:', {
    leadId,
    changedFields,
    detectedConfidence: detected?.confidence ?? null,
    parserVersion: PARSER_VERSION,
  });

  try {
    await db.insert(leadParseCorrections).values({
      leadId:             leadId                        ?? null,
      rawSubject:         rawEmail?.subject             ?? null,
      rawBody:            rawEmail?.body                ?? null,
      rawFrom:            rawEmail?.from                ?? null,
      detectedSource:     detected?.source              ?? null,
      detectedName:       detected?.name                ?? null,
      detectedEmail:      detected?.email               ?? null,
      detectedPhone:      detected?.phone               ?? null,
      detectedConfidence: detected?.confidence != null
                            ? String(detected.confidence)
                            : null,
      correctedSource:    corrected?.source             ?? null,
      correctedName:      corrected?.name               ?? null,
      correctedEmail:     corrected?.email              ?? null,
      correctedPhone:     corrected?.phone              ?? null,
      changedFields:      changedFields,
      parserVersion:      PARSER_VERSION,
      matchedSignals:     detected?.matchedSignals      ?? [],
    });
  } catch (err) {
    // Never let correction logging crash the main request flow
    console.error('[correction-logger] Failed to write correction to DB:', err);
  }
}

/**
 * buildDetectedSnapshot(parseResult, referralResult)
 * ---------------------------------------------------
 * Builds the "detected" object to pass to logParseCorrection()
 * from a parser result and referral detection result.
 *
 * Call this immediately after parsing, before saving the lead,
 * so you have the original detected values available later.
 *
 * @param {object} parseResult    - from parseLead()
 * @param {object} referralResult - from detectReferral()
 * @returns {object}
 */
export function buildDetectedSnapshot(parseResult, referralResult) {
  return {
    source:         parseResult.senderPlatform  ?? null,
    name:           parseResult.leadName        ?? null,
    email:          parseResult.leadEmail       ?? null,
    phone:          parseResult.leadPhone       ?? null,
    confidence:     parseResult.confidence      ?? null,
    matchedSignals: referralResult?.matchedSignals ?? [],
  };
}
