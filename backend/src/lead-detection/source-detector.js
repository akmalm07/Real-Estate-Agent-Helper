/**
 * source-detector.js
 * ------------------
 * STAGE 1: Platform Detection (No AI)
 *
 * Deterministically identifies the source platform of an inbound email
 * by inspecting headers, from address, subject, and other signals.
 *
 * Never calls AI. Must be fast and reliable.
 */

/**
 * Known platform definitions.
 * Each entry has:
 *   - domains:   substrings to match against the From address
 *   - headers:   optional header name/value pairs that confirm the platform
 *   - subjects:  optional regex patterns on the Subject line
 *   - source:    the canonical source string to return
 *   - confidence: base confidence when this platform is matched
 */
const PLATFORM_DEFINITIONS = [
  {
    source: 'zillow',
    confidence: 0.99,
    domains: ['zillow.com', 'zillowmail.com'],
    subjects: [
      /new\s+lead/i,
      /buyer\s+lead/i,
      /seller\s+lead/i,
      /inquiry\s+from/i,
      /contact\s+request/i,
      /home\s+inquiry/i,
    ],
    headers: [],
  },
  {
    source: 'realtor',
    confidence: 0.99,
    domains: ['realtor.com', 'move.com'],
    subjects: [
      /new\s+lead/i,
      /lead\s+from/i,
      /inquiry/i,
      /contact\s+request/i,
    ],
    headers: [],
  },
  {
    source: 'streeteasy',
    confidence: 0.99,
    domains: ['streeteasy.com', 'mail.streeteasy.com'],
    subjects: [
      /new\s+lead/i,
      /inquiry/i,
      /contact\s+request/i,
      /renter\s+lead/i,
      /buyer\s+lead/i,
    ],
    headers: [],
  },
  {
    source: 'trulia',
    confidence: 0.97,
    domains: ['trulia.com', 'truliamail.com'],
    subjects: [/new\s+lead/i, /inquiry/i],
    headers: [],
  },
  {
    source: 'redfin',
    confidence: 0.97,
    domains: ['redfin.com'],
    subjects: [/new\s+lead/i, /inquiry/i, /tour\s+request/i],
    headers: [],
  },
  {
    source: 'homes',
    confidence: 0.95,
    domains: ['homes.com'],
    subjects: [/new\s+lead/i, /inquiry/i],
    headers: [],
  },
];

/**
 * Extracts a named header value from a Gmail-style headers array.
 * Returns null if not found.
 *
 * @param {Array<{name: string, value: string}>} headers
 * @param {string} name  - case-insensitive header name
 * @returns {string|null}
 */
function getHeader(headers, name) {
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    null
  );
}

/**
 * Checks whether a string contains any of the given domain substrings.
 *
 * @param {string} str
 * @param {string[]} domains
 * @returns {boolean}
 */
function matchesDomain(str, domains) {
  if (!str) return false;
  const lower = str.toLowerCase();
  return domains.some((d) => lower.includes(d));
}

/**
 * Checks whether a string matches any of the given regex patterns.
 *
 * @param {string} str
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
function matchesAnyPattern(str, patterns) {
  if (!str || !patterns.length) return false;
  return patterns.some((p) => p.test(str));
}

/**
 * detectEmailSource(email)
 * ------------------------
 * Main export. Inspects an email object and returns the detected source
 * platform and a confidence score.
 *
 * @param {object} email - normalized email object with:
 *   - payload.headers: Array<{name, value}>
 *   - payload.bodyText: string (optional, pre-extracted plain text)
 *
 * @returns {{ source: string, confidence: number }}
 *
 * Possible source values:
 *   'zillow' | 'realtor' | 'streeteasy' | 'trulia' | 'redfin' |
 *   'homes'  | 'referral' | 'organic' | 'unknown'
 *
 * Note: 'referral' is NOT detected here — that is handled by referral-detector.js.
 * This function only identifies known real-estate platforms.
 */
export function detectEmailSource(email) {
  const headers = email.payload?.headers ?? [];

  const from           = getHeader(headers, 'From')           ?? '';
  const replyTo        = getHeader(headers, 'Reply-To')       ?? '';
  const returnPath     = getHeader(headers, 'Return-Path')    ?? '';
  const sender         = getHeader(headers, 'Sender')         ?? '';
  const xMailer        = getHeader(headers, 'X-Mailer')       ?? '';
  const listUnsub      = getHeader(headers, 'List-Unsubscribe') ?? '';
  const subject        = getHeader(headers, 'Subject')        ?? '';

  // Combine all address-bearing fields for domain matching
  const addressFields = [from, replyTo, returnPath, sender, xMailer, listUnsub].join(' ');

  for (const platform of PLATFORM_DEFINITIONS) {
    const domainMatch   = matchesDomain(addressFields, platform.domains);
    const subjectMatch  = matchesAnyPattern(subject, platform.subjects);

    if (domainMatch) {
      // Domain match alone is sufficient for high confidence
      // Boost confidence slightly if subject also matches
      const confidence = subjectMatch
        ? Math.min(platform.confidence + 0.005, 1.0)
        : platform.confidence;

      return { source: platform.source, confidence };
    }

    // Subject-only match (weaker — domain didn't match)
    // We don't assign a platform source on subject alone to avoid false positives
  }

  // No known platform detected.
  // Return 'unknown' — the referral detector and parsers will handle further classification.
  return { source: 'unknown', confidence: 0.0 };
}

/**
 * getEmailHeaders(email)
 * ----------------------
 * Convenience helper used by parsers to extract all relevant headers at once.
 *
 * @param {object} email
 * @returns {object} - named header values
 */
export function getEmailHeaders(email) {
  const headers = email.payload?.headers ?? [];
  return {
    from:        getHeader(headers, 'From')            ?? '',
    replyTo:     getHeader(headers, 'Reply-To')        ?? '',
    returnPath:  getHeader(headers, 'Return-Path')     ?? '',
    sender:      getHeader(headers, 'Sender')          ?? '',
    subject:     getHeader(headers, 'Subject')         ?? '',
    messageId:   getHeader(headers, 'Message-ID')      ?? '',
    xMailer:     getHeader(headers, 'X-Mailer')        ?? '',
    listUnsub:   getHeader(headers, 'List-Unsubscribe') ?? '',
    inReplyTo:   getHeader(headers, 'In-Reply-To')     ?? '',
    references:  getHeader(headers, 'References')      ?? '',
  };
}
