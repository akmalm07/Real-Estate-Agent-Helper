/**
 * referral-detector.js
 * --------------------
 * STAGE 4: Referral Detection with Confidence Scoring
 *
 * Replaces the old keyword-only referral detection with a weighted
 * scoring system. Each signal contributes a score; the total determines
 * whether the email is classified as a referral.
 *
 * Score threshold:
 *   >= 50  → isReferral = true
 *   <  50  → isReferral = false
 *
 * Score breakdown:
 *
 *   STRONG signals (high specificity, rarely appear in non-referral emails):
 *     "referred by [name]"          → +50
 *     "referral from [name]"        → +50
 *     "was referred"                → +45
 *     "I'm referring"               → +45
 *     "I'd like to refer"           → +45
 *     "please reach out to [name]"  → +40
 *     "please contact [name]"       → +40
 *     "I'm sending you [name]"      → +40
 *     "sent you a lead"             → +40
 *     "forwarded this lead"         → +35
 *     "has shared a lead"           → +35
 *
 *   MEDIUM signals (common in referrals but can appear elsewhere):
 *     "my friend [name]"            → +20
 *     "my colleague [name]"         → +20
 *     "my client [name]"            → +20
 *     "my neighbor [name]"          → +15
 *     "my family member"            → +15
 *     "I think you'd be a great fit"→ +15
 *     "I told them about you"       → +15
 *     "I mentioned you"             → +15
 *     "they're looking to buy/sell" → +10
 *     "they need an agent"          → +10
 *
 *   WEAK signals (present in many email types — only contribute when combined):
 *     "referral"                    → +10
 *     "referred"                    → +10
 *     "recommendation"              → +8
 *     "recommended"                 → +8
 *     "introduction"                → +5
 *     "connect you with"            → +5
 *
 *   NEGATIVE signals (reduce score — these suggest it's NOT a referral):
 *     From a known platform domain  → -30
 *     "new lead from zillow"        → -20
 *     "new lead from realtor"       → -20
 *     "automated notification"      → -15
 *     "do not reply"                → -10
 *     "unsubscribe"                 → -5
 */

/** Score threshold above which we classify as a referral */
const REFERRAL_THRESHOLD = 50;

/**
 * Signal definitions.
 * Each entry: { pattern: RegExp, score: number, label: string }
 *
 * Patterns are tested against the full combined text (subject + body + from).
 */
const SIGNALS = [
  // ── Strong positive signals ──────────────────────────────────────────────
  {
    label: 'referred-by-name',
    score: 50,
    pattern: /referred\s+by\s+[A-Z][a-z]+/i,
  },
  {
    label: 'referral-from-name',
    score: 50,
    pattern: /referral\s+from\s+[A-Z][a-z]+/i,
  },
  {
    label: 'was-referred',
    score: 45,
    pattern: /\bwas\s+referred\b/i,
  },
  {
    label: 'im-referring',
    score: 45,
    pattern: /\bI(?:'m|\s+am)\s+referring\b/i,
  },
  {
    label: 'id-like-to-refer',
    score: 45,
    pattern: /\bI(?:'d|\s+would)\s+like\s+to\s+refer\b/i,
  },
  {
    label: 'please-reach-out-to',
    score: 40,
    pattern: /please\s+reach\s+out\s+to\s+[A-Z][a-z]+/i,
  },
  {
    label: 'please-contact-name',
    score: 40,
    pattern: /please\s+contact\s+[A-Z][a-z]+/i,
  },
  {
    label: 'im-sending-you',
    score: 40,
    pattern: /\bI(?:'m|\s+am)\s+sending\s+you\b/i,
  },
  {
    label: 'sent-you-a-lead',
    score: 40,
    pattern: /sent\s+you\s+a\s+lead/i,
  },
  {
    label: 'forwarded-this-lead',
    score: 35,
    pattern: /forwarded\s+this\s+lead/i,
  },
  {
    label: 'has-shared-a-lead',
    score: 35,
    pattern: /has\s+shared\s+a\s+lead/i,
  },
  {
    label: 'you-have-a-referral',
    score: 35,
    pattern: /you\s+have\s+a\s+referral/i,
  },
  {
    label: 'referred-this-client',
    score: 35,
    pattern: /referred\s+this\s+client/i,
  },

  // ── Medium positive signals ───────────────────────────────────────────────
  {
    label: 'my-friend',
    score: 20,
    pattern: /\bmy\s+friend\b/i,
  },
  {
    label: 'my-colleague',
    score: 20,
    pattern: /\bmy\s+colleague\b/i,
  },
  {
    label: 'my-client',
    score: 20,
    pattern: /\bmy\s+client\b/i,
  },
  {
    label: 'my-neighbor',
    score: 15,
    pattern: /\bmy\s+neighbor\b/i,
  },
  {
    label: 'my-family-member',
    score: 15,
    pattern: /\bmy\s+(?:family\s+member|brother|sister|mother|father|cousin|aunt|uncle)\b/i,
  },
  {
    label: 'great-fit',
    score: 15,
    pattern: /(?:think|believe)\s+you(?:'d|\s+would)\s+be\s+a\s+great\s+fit/i,
  },
  {
    label: 'told-them-about-you',
    score: 15,
    pattern: /told\s+them\s+about\s+you/i,
  },
  {
    label: 'mentioned-you',
    score: 15,
    pattern: /mentioned\s+you/i,
  },
  {
    label: 'looking-to-buy-sell',
    score: 10,
    pattern: /they(?:'re|\s+are)\s+looking\s+to\s+(?:buy|sell|rent)/i,
  },
  {
    label: 'needs-an-agent',
    score: 10,
    pattern: /(?:they\s+)?need(?:s)?\s+an?\s+(?:agent|realtor|broker)/i,
  },

  // ── Weak positive signals ─────────────────────────────────────────────────
  {
    label: 'referral-keyword',
    score: 10,
    pattern: /\breferral\b/i,
  },
  {
    label: 'referred-keyword',
    score: 10,
    pattern: /\breferred\b/i,
  },
  {
    label: 'recommendation-keyword',
    score: 8,
    pattern: /\brecommendation\b/i,
  },
  {
    label: 'recommended-keyword',
    score: 8,
    pattern: /\brecommended\b/i,
  },
  {
    label: 'introduction-keyword',
    score: 5,
    pattern: /\bintroduction\b/i,
  },
  {
    label: 'connect-you-with',
    score: 5,
    pattern: /connect\s+you\s+with/i,
  },

  // ── Negative signals ──────────────────────────────────────────────────────
  {
    label: 'platform-lead-zillow',
    score: -20,
    pattern: /new\s+lead\s+from\s+zillow/i,
  },
  {
    label: 'platform-lead-realtor',
    score: -20,
    pattern: /new\s+lead\s+from\s+realtor/i,
  },
  {
    label: 'automated-notification',
    score: -15,
    pattern: /automated\s+(?:notification|message|email)/i,
  },
  {
    label: 'do-not-reply',
    score: -10,
    pattern: /do\s+not\s+(?:reply|respond)/i,
  },
  {
    label: 'unsubscribe',
    score: -5,
    pattern: /unsubscribe/i,
  },
];

/**
 * detectReferral(subject, body, from, sourceDetected)
 * ----------------------------------------------------
 * Runs all signals against the combined email text and returns
 * a referral classification with a confidence score.
 *
 * @param {string} subject         - email subject line
 * @param {string} body            - plain-text email body
 * @param {string} from            - From header value
 * @param {string} sourceDetected  - source from detectEmailSource() e.g. 'zillow', 'unknown'
 *
 * @returns {{
 *   isReferral:         boolean,
 *   referralScore:      number,   // raw score (can be negative)
 *   referralConfidence: number,   // 0.0–1.0 normalized
 *   matchedSignals:     string[], // labels of matched signals (for debugging)
 * }}
 */
export function detectReferral(subject, body, from, sourceDetected = 'unknown') {
  // Known platforms are almost never referrals — apply a strong base penalty
  const platformPenalty = ['zillow', 'realtor', 'streeteasy', 'trulia', 'redfin', 'homes'].includes(sourceDetected)
    ? -30
    : 0;

  const text = `${subject}\n${body}\n${from}`;

  let totalScore    = platformPenalty;
  const matched     = [];

  for (const signal of SIGNALS) {
    if (signal.pattern.test(text)) {
      totalScore += signal.score;
      matched.push(signal.label);
    }
  }

  const isReferral = totalScore >= REFERRAL_THRESHOLD;

  // Normalize score to 0.0–1.0 for confidence reporting.
  // We use a sigmoid-like normalization capped at 1.0.
  // Score of 50 → ~0.70, score of 100 → ~0.95, score of 0 → ~0.40
  const referralConfidence = isReferral
    ? Math.min(0.50 + (totalScore - REFERRAL_THRESHOLD) / 150, 1.0)
    : Math.max(0.0, totalScore / (REFERRAL_THRESHOLD * 2));

  return {
    isReferral,
    referralScore:      totalScore,
    referralConfidence: Math.round(referralConfidence * 1000) / 1000,
    matchedSignals:     matched,
  };
}

/**
 * extractReferrerName(body)
 * -------------------------
 * Attempts to extract the name of the person who made the referral
 * (i.e., the agent's existing contact, not the new lead).
 *
 * @param {string} body
 * @returns {string|null}
 */
export function extractReferrerName(body) {
  return (
    body.match(/referred\s+by[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i)?.[1]?.trim() ??
    body.match(/referral\s+from[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i)?.[1]?.trim() ??
    body.match(/sent\s+by[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i)?.[1]?.trim() ??
    body.match(/recommended\s+by[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i)?.[1]?.trim() ??
    null
  );
}
