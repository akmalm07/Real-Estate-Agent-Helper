/**
 * platform-parsers.js
 * -------------------
 * STAGE 2 & 3: Platform-Specific Parsers
 *
 * Each parser is tailored to the exact format of its platform's emails.
 * They extract the ACTUAL LEAD's contact info — not the platform sender.
 *
 * All parsers return a normalized ParseResult:
 * {
 *   leadName:        string | null
 *   leadEmail:       string | null
 *   leadPhone:       string | null
 *   sourceId:        string | null   (platform-specific listing/lead ID)
 *   propertyAddress: string | null
 *   senderPlatform:  string          (e.g. "zillow", "realtor", "streeteasy")
 *   rawFields:       object          (all raw extracted values for debugging)
 *   confidence:      number          (0.0 – 1.0, computed by confidence-scorer)
 * }
 */

import { computeConfidence } from './confidence-scorer.js';

/*
|--------------------------------------------------------------------------
| Shared regex primitives
|--------------------------------------------------------------------------
*/

// Matches most real-world email addresses
const EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/;

// Matches US phone numbers in many formats
const PHONE_RE = /(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/;

// Matches a capitalized full name (First [Middle] Last)
const NAME_RE  = /([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/;

/**
 * Safely extracts the first regex match from a string.
 * Returns null if not found or if the string is empty.
 */
function extract(str, regex, group = 0) {
  if (!str) return null;
  const m = str.match(regex);
  return m ? (m[group] ?? m[0] ?? null) : null;
}

/**
 * Strips all whitespace and non-digit characters from a phone string.
 * Returns a 10-digit string or null.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Strip leading country code "1" if 11 digits
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.length === 10 ? trimmed : null;
}

/**
 * Extracts the sender's display name and email from a From header.
 * e.g. "Zillow <noreply@zillow.com>" -> { name: "Zillow", email: "noreply@zillow.com" }
 *
 * IMPORTANT: For platform emails, this is the PLATFORM sender, not the lead.
 */
function parseSenderHeader(from) {
  if (!from) return { name: null, email: null };

  const emailMatch = from.match(EMAIL_RE);
  const email      = emailMatch?.[1] ?? null;

  const nameMatch  = from.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  let   name       = nameMatch?.[1]?.trim() ?? null;

  // Discard if the "name" is actually an email address
  if (name?.includes('@')) name = null;

  return { name, email };
}

/*
|--------------------------------------------------------------------------
| Zillow parser
|--------------------------------------------------------------------------
| Zillow sends structured notification emails. The lead's info appears
| in the body in a consistent format. The From address is always Zillow.
|
| Example body patterns:
|   "Name: John Smith"
|   "Email: john@gmail.com"
|   "Phone: (555) 555-5555"
|   "Property: 123 Main St, Springfield, IL"
|   Zillow listing URLs: zillow.com/homedetails/.../12345678_zpid
*/
export function parseZillowLead(body, headers) {
  const senderPlatform = 'zillow';

  // --- Lead name ---
  // Zillow typically formats as "Name: John Smith" or "Buyer: John Smith"
  const leadName =
    extract(body, /(?:^|\n)\s*(?:Name|Buyer|Seller|Contact|From)[:\s]+([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/m, 1) ??
    extract(body, /(?:^|\n)\s*([A-Z][a-zA-Z'\-]+\s[A-Z][a-zA-Z'\-]+)\s+(?:is|has|sent|would)/m, 1) ??
    null;

  // --- Lead email ---
  // Zillow puts the lead's email explicitly in the body, separate from the platform From address
  const leadEmail =
    extract(body, /(?:^|\n)\s*(?:Email|E-mail)[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/mi, 1) ??
    (() => {
      // Fallback: find all emails in body, exclude zillow.com addresses
      const all = [...body.matchAll(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map((m) => m[1])
        .filter((e) => !e.toLowerCase().includes('zillow.com') && !e.toLowerCase().includes('zillowmail.com'));
      return all[0] ?? null;
    })();

  // --- Lead phone ---
  const leadPhone =
    normalizePhone(
      extract(body, /(?:^|\n)\s*(?:Phone|Mobile|Cell|Tel)[:\s]+([\d\s\-().+]+)/mi, 1)
    ) ??
    normalizePhone(extract(body, PHONE_RE));

  // --- Property address ---
  const propertyAddress =
    extract(body, /(?:^|\n)\s*(?:Property|Address|Listing|Home|About)[:\s]+([^\n]{5,80})/mi, 1) ??
    extract(body, /(?:interested in|inquiring about|asking about)[:\s]+([^\n]{5,80})/i, 1) ??
    null;

  // --- Zillow listing ID (zpid) ---
  const sourceId =
    extract(body, /zillow\.com\/homedetails\/[^/]+\/(\d+)_zpid/i, 1) ??
    extract(body, /zpid[=:\s]+(\d+)/i, 1) ??
    null;

  const rawFields = { leadName, leadEmail, leadPhone, propertyAddress, sourceId };

  return {
    leadName,
    leadEmail,
    leadPhone,
    sourceId,
    propertyAddress,
    senderPlatform,
    rawFields,
    confidence: computeConfidence({ leadName, leadEmail, leadPhone, propertyAddress, sourceId, senderPlatform }),
  };
}

/*
|--------------------------------------------------------------------------
| Realtor.com parser
|--------------------------------------------------------------------------
| Realtor.com sends lead notification emails with a consistent structure.
| The From address is always realtor.com or move.com.
|
| Example body patterns:
|   "Contact Name: Jane Doe"
|   "Contact Email: jane@example.com"
|   "Contact Phone: 555-123-4567"
|   "Property Address: 456 Oak Ave"
|   Realtor listing URLs: realtor.com/realestateandhomes-detail/...-{id}
*/
export function parseRealtorLead(body, headers) {
  const senderPlatform = 'realtor';

  // --- Lead name ---
  const leadName =
    extract(body, /(?:^|\n)\s*(?:Contact\s+Name|Name|Buyer|Seller|From)[:\s]+([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/mi, 1) ??
    null;

  // --- Lead email ---
  const leadEmail =
    extract(body, /(?:^|\n)\s*(?:Contact\s+Email|Email|E-mail)[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/mi, 1) ??
    (() => {
      const all = [...body.matchAll(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map((m) => m[1])
        .filter((e) => !e.toLowerCase().includes('realtor.com') && !e.toLowerCase().includes('move.com'));
      return all[0] ?? null;
    })();

  // --- Lead phone ---
  const leadPhone =
    normalizePhone(
      extract(body, /(?:^|\n)\s*(?:Contact\s+Phone|Phone|Mobile|Cell|Tel)[:\s]+([\d\s\-().+]+)/mi, 1)
    ) ??
    normalizePhone(extract(body, PHONE_RE));

  // --- Property address ---
  const propertyAddress =
    extract(body, /(?:^|\n)\s*(?:Property\s+Address|Property|Address|Listing)[:\s]+([^\n]{5,80})/mi, 1) ??
    null;

  // --- Realtor.com listing ID ---
  const sourceId =
    extract(body, /realtor\.com\/realestateandhomes-detail\/[^/]+-(\d+)/i, 1) ??
    extract(body, /listing[_\s\-]?id[=:\s]+(\w+)/i, 1) ??
    null;

  const rawFields = { leadName, leadEmail, leadPhone, propertyAddress, sourceId };

  return {
    leadName,
    leadEmail,
    leadPhone,
    sourceId,
    propertyAddress,
    senderPlatform,
    rawFields,
    confidence: computeConfidence({ leadName, leadEmail, leadPhone, propertyAddress, sourceId, senderPlatform }),
  };
}

/*
|--------------------------------------------------------------------------
| StreetEasy parser
|--------------------------------------------------------------------------
| StreetEasy (NYC-focused) sends lead emails with their own format.
| Common for rental and buyer inquiries in New York.
|
| Example body patterns:
|   "Name: Alex Johnson"
|   "Email: alex@gmail.com"
|   "Phone: 212-555-1234"
|   "Listing: 789 Broadway, Apt 4B, New York, NY"
*/
export function parseStreetEasyLead(body, headers) {
  const senderPlatform = 'streeteasy';

  // --- Lead name ---
  const leadName =
    extract(body, /(?:^|\n)\s*(?:Name|Renter|Buyer|Contact)[:\s]+([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/mi, 1) ??
    null;

  // --- Lead email ---
  const leadEmail =
    extract(body, /(?:^|\n)\s*(?:Email|E-mail)[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/mi, 1) ??
    (() => {
      const all = [...body.matchAll(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map((m) => m[1])
        .filter((e) => !e.toLowerCase().includes('streeteasy.com'));
      return all[0] ?? null;
    })();

  // --- Lead phone ---
  const leadPhone =
    normalizePhone(
      extract(body, /(?:^|\n)\s*(?:Phone|Mobile|Cell|Tel)[:\s]+([\d\s\-().+]+)/mi, 1)
    ) ??
    normalizePhone(extract(body, PHONE_RE));

  // --- Property address / listing ---
  const propertyAddress =
    extract(body, /(?:^|\n)\s*(?:Listing|Property|Address|Unit|Apartment)[:\s]+([^\n]{5,100})/mi, 1) ??
    null;

  // --- StreetEasy listing ID ---
  const sourceId =
    extract(body, /streeteasy\.com\/(?:building|rental|sale)\/[^/]+-(\d+)/i, 1) ??
    extract(body, /listing[_\s\-]?id[=:\s]+(\w+)/i, 1) ??
    null;

  const rawFields = { leadName, leadEmail, leadPhone, propertyAddress, sourceId };

  return {
    leadName,
    leadEmail,
    leadPhone,
    sourceId,
    propertyAddress,
    senderPlatform,
    rawFields,
    confidence: computeConfidence({ leadName, leadEmail, leadPhone, propertyAddress, sourceId, senderPlatform }),
  };
}

/*
|--------------------------------------------------------------------------
| Generic parser
|--------------------------------------------------------------------------
| Used for referral emails, organic inbound emails, and any unknown source.
|
| IMPORTANT: For non-platform emails, the sender IS likely the lead
| (or someone referring a lead). We handle both cases here.
|
| Strategy:
|   1. Try to find explicit "Name:", "Email:", "Phone:" labels
|   2. Fall back to extracting from the body text
|   3. Use the From header as a last resort for email
*/
export function parseGenericLead(body, headers, source = 'unknown') {
  const senderPlatform = source;

  const { name: senderName, email: senderEmail } = parseSenderHeader(headers?.from ?? '');

  // --- Lead name ---
  // Try labeled fields first, then capitalized name patterns in body
  const leadName =
    extract(body, /(?:^|\n)\s*(?:Name|Contact|From|Referred)[:\s]+([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/mi, 1) ??
    extract(body, /(?:my\s+(?:friend|colleague|client|contact)|please\s+(?:reach\s+out|contact))[:\s,]+([A-Z][a-zA-Z'\-]+(?:\s[A-Z][a-zA-Z'\-]+)+)/i, 1) ??
    // For organic inbound: the sender themselves may be the lead
    (source === 'organic' || source === 'unknown' ? senderName : null) ??
    null;

  // --- Lead email ---
  const leadEmail =
    extract(body, /(?:^|\n)\s*(?:Email|E-mail)[:\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/mi, 1) ??
    // For organic/unknown: sender is likely the lead
    (source === 'organic' || source === 'unknown' ? senderEmail : null) ??
    extract(body, EMAIL_RE, 1) ??
    null;

  // --- Lead phone ---
  const leadPhone =
    normalizePhone(
      extract(body, /(?:^|\n)\s*(?:Phone|Mobile|Cell|Tel)[:\s]+([\d\s\-().+]+)/mi, 1)
    ) ??
    normalizePhone(extract(body, PHONE_RE));

  // --- Property address ---
  const propertyAddress =
    extract(body, /(?:^|\n)\s*(?:Property|Address|Home|Listing|About)[:\s]+([^\n]{5,80})/mi, 1) ??
    extract(body, /(?:interested in|looking at|inquiring about)[:\s]+([^\n]{5,80})/i, 1) ??
    null;

  // --- Source ID (generic) ---
  const sourceId =
    extract(body, /(?:listing|property|ref(?:erence)?)[_\s\-]?(?:id|#|no\.?)[=:\s]+(\w+)/i, 1) ??
    null;

  const rawFields = { leadName, leadEmail, leadPhone, propertyAddress, sourceId, senderName, senderEmail };

  return {
    leadName,
    leadEmail,
    leadPhone,
    sourceId,
    propertyAddress,
    senderPlatform,
    rawFields,
    confidence: computeConfidence({ leadName, leadEmail, leadPhone, propertyAddress, sourceId, senderPlatform }),
  };
}

/*
|--------------------------------------------------------------------------
| Router — picks the right parser based on detected source
|--------------------------------------------------------------------------
*/

/**
 * parseLead(source, body, headers)
 * ---------------------------------
 * Routes to the correct platform-specific parser.
 * Falls back to parseGenericLead for unknown sources.
 *
 * @param {string} source   - from detectEmailSource()
 * @param {string} body     - plain-text email body
 * @param {object} headers  - from getEmailHeaders()
 * @returns {ParseResult}
 */
export function parseLead(source, body, headers) {
  switch (source) {
    case 'zillow':
      return parseZillowLead(body, headers);
    case 'realtor':
      return parseRealtorLead(body, headers);
    case 'streeteasy':
      return parseStreetEasyLead(body, headers);
    default:
      return parseGenericLead(body, headers, source);
  }
}
