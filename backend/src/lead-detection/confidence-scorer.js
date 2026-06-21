/**
 * confidence-scorer.js
 * --------------------
 * STAGE 6: Confidence Scoring
 *
 * Computes a 0.0–1.0 confidence score for a parsed lead result.
 *
 * Confidence is based on how many key fields were successfully extracted
 * and how reliably the source platform was identified.
 *
 * Score breakdown (total possible = 1.0):
 *
 *   leadEmail found          → +0.30  (most important — required for dedup & outreach)
 *   leadName found           → +0.20
 *   leadPhone found          → +0.20
 *   propertyAddress found    → +0.15
 *   sourceId found           → +0.10
 *   senderPlatform known     → +0.05  (not 'unknown')
 *
 * The score is capped at 1.0.
 *
 * Thresholds (used by the pipeline):
 *   >= 0.90  → skip AI, high confidence
 *   >= 0.70  → lead status = "active"
 *   <  0.70  → lead status = "unverified" (agent must review)
 *   <  0.50  → also trigger AI fallback
 */

/** Minimum confidence to skip AI parsing entirely */
export const AI_SKIP_THRESHOLD = 0.90;

/** Minimum confidence to mark a lead as "active" (vs "unverified") */
export const ACTIVE_THRESHOLD = 0.70;

/** Minimum confidence to attempt AI fallback */
export const AI_FALLBACK_THRESHOLD = 0.50;

/**
 * Field weights — must sum to 1.0
 */
const WEIGHTS = {
  leadEmail:       0.30,
  leadName:        0.20,
  leadPhone:       0.20,
  propertyAddress: 0.15,
  sourceId:        0.10,
  senderPlatform:  0.05,
};

/**
 * computeConfidence(fields)
 * -------------------------
 * Computes a confidence score from extracted lead fields.
 *
 * @param {object} fields
 * @param {string|null} fields.leadEmail
 * @param {string|null} fields.leadName
 * @param {string|null} fields.leadPhone
 * @param {string|null} fields.propertyAddress
 * @param {string|null} fields.sourceId
 * @param {string}      fields.senderPlatform
 *
 * @returns {number} - confidence score between 0.0 and 1.0
 */
export function computeConfidence(fields) {
  let score = 0;

  if (fields.leadEmail)       score += WEIGHTS.leadEmail;
  if (fields.leadName)        score += WEIGHTS.leadName;
  if (fields.leadPhone)       score += WEIGHTS.leadPhone;
  if (fields.propertyAddress) score += WEIGHTS.propertyAddress;
  if (fields.sourceId)        score += WEIGHTS.sourceId;

  // Platform is "known" if it's not 'unknown'
  if (fields.senderPlatform && fields.senderPlatform !== 'unknown') {
    score += WEIGHTS.senderPlatform;
  }

  return Math.min(Math.round(score * 1000) / 1000, 1.0);
}

/**
 * shouldSkipAi(confidence)
 * ------------------------
 * Returns true if confidence is high enough to skip AI parsing.
 *
 * @param {number} confidence
 * @returns {boolean}
 */
export function shouldSkipAi(confidence) {
  return confidence >= AI_SKIP_THRESHOLD;
}

/**
 * shouldMarkUnverified(confidence)
 * --------------------------------
 * Returns true if the lead should be marked "unverified" for agent review.
 * Driven purely by extraction confidence — not by source type.
 *
 * @param {number} confidence
 * @returns {boolean}
 */
export function shouldMarkUnverified(confidence) {
  return confidence < ACTIVE_THRESHOLD;
}

/**
 * shouldTryAiFallback(confidence)
 * --------------------------------
 * Returns true if confidence is low enough to warrant an AI parsing attempt.
 *
 * @param {number} confidence
 * @returns {boolean}
 */
export function shouldTryAiFallback(confidence) {
  return confidence < AI_FALLBACK_THRESHOLD;
}

/**
 * describeConfidence(confidence)
 * ------------------------------
 * Returns a human-readable label for a confidence score.
 * Useful for logging and debugging.
 *
 * @param {number} confidence
 * @returns {string}
 */
export function describeConfidence(confidence) {
  if (confidence >= 0.90) return 'high';
  if (confidence >= 0.70) return 'medium';
  if (confidence >= 0.50) return 'low';
  return 'very-low';
}
