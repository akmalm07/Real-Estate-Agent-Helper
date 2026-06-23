/**
 * pubsub-webhook-helpers.js
 * -------------------------
 * Orchestrates the full lead detection pipeline for inbound emails.
 *
 * Pipeline stages (in order):
 *   1. Source detection      — detectEmailSource()       [source-detector.js]
 *   2. Platform-specific parse — parseLead()             [platform-parsers.js]
 *   3. Referral detection    — detectReferral()          [referral-detector.js]
 *   4. Confidence scoring    — computeConfidence()       [confidence-scorer.js]
 *   5. AI fallback           — aiParseLead()             [only if confidence < 0.50]
 *   6. Status assignment     — shouldMarkUnverified()    [confidence-scorer.js]
 *   7. Duplicate detection   — checkDuplicates()
 *   8. Initial outreach      — sendInitialMessages()
 */

import OpenAI from 'openai';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { properties, leads, conversations } from '../db/schema.js';
import { sendSMS } from './phone.js';
import {
  findOrCreateSmsConversation,
  saveSmsMessage,
  generateSmsReply,
} from './sms-helpers.js';
import {
  findOrCreateEmailConversation,
  sendAndSaveEmail,
  generateEmailReply,
} from './email-helpers.js';

// Lead detection pipeline modules
import { detectEmailSource, getEmailHeaders } from './lead-detection/source-detector.js';
import { parseLead }                          from './lead-detection/platform-parsers.js';
import { detectReferral, extractReferrerName } from './lead-detection/referral-detector.js';
import {
  shouldMarkUnverified,
  shouldTryAiFallback,
  describeConfidence,
  computeConfidence,
} from './lead-detection/confidence-scorer.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*
|--------------------------------------------------------------------------
| Plain-text extraction
|--------------------------------------------------------------------------
*/

/**
 * Recursively extracts plain text from a Gmail-style payload.
 * Prefers text/plain parts; falls back to stripped HTML.
 *
 * @param {object} payload - Gmail message payload
 * @returns {string|null}
 */
export function extractPlainText(payload) {
  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      if (part.parts) {
        const nested = extractPlainText(part);
        if (nested) return nested;
      }
    }

    // Fallback: strip HTML
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf8');
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| AI fallback parser (Stage 5)
|--------------------------------------------------------------------------
| Only called when deterministic parsing confidence is below threshold.
| Returns a normalized parse result merged with confidence scoring.
*/

/**
 * aiParseLead(body)
 * -----------------
 * Uses GPT to extract lead fields from an email body.
 * This is the LAST resort — only called when confidence < AI_FALLBACK_THRESHOLD.
 *
 * @param {string} body
 * @returns {Promise<object>} - normalized parse result
 */
export async function aiParseLead(body) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a data extraction assistant for a real estate CRM. ' +
          'Extract lead contact information from the email body provided. ' +
          'IMPORTANT: The sender may be a platform (Zillow, Realtor.com, etc.) — ' +
          'extract the ACTUAL LEAD\'s information, not the platform\'s. ' +
          'Return ONLY a JSON object with these exact keys: ' +
          'leadName, leadEmail, leadPhone, propertyAddress, sourceId, isReferral, referredBy. ' +
          'Use null for any field you cannot find. No explanation, just JSON.',
      },
      {
        role: 'user',
        content: body,
      },
    ],
    temperature: 0,
  });

  const text = response.choices[0].message.content.trim();
  const parsed = JSON.parse(text);

  // Normalize to our standard shape and compute confidence
  const result = {
    leadName:        parsed.leadName        ?? null,
    leadEmail:       parsed.leadEmail       ?? null,
    leadPhone:       parsed.leadPhone       ?? null,
    propertyAddress: parsed.propertyAddress ?? null,
    sourceId:        parsed.sourceId        ?? null,
    senderPlatform:  'unknown',
    rawFields:       parsed,
  };

  result.confidence = computeConfidence(result);
  return result;
}

/*
|--------------------------------------------------------------------------
| isLead — quick pre-filter
|--------------------------------------------------------------------------
| Determines whether an email is worth processing as a potential lead.
| This is a fast gate — it does NOT need to be perfectly accurate.
| False positives are acceptable; false negatives are not.
*/

/**
 * isLead(from, subject, body)
 * ---------------------------
 * Returns true if the email is likely a lead notification or referral.
 *
 * @param {string} from
 * @param {string} subject
 * @param {string} body
 * @returns {boolean}
 */
export function isLead(from, subject, body) {
  // Known lead platforms — always process
  const platformDomains = /zillow\.com|realtor\.com|streeteasy\.com|trulia\.com|redfin\.com|homes\.com/i;
  if (platformDomains.test(from)) return true;

  // Subject-line signals
  const leadSubjects = /new\s+lead|buyer\s+lead|seller\s+lead|home\s+inquiry|property\s+inquiry|contact\s+request|lead\s+notification/i;
  if (leadSubjects.test(subject)) return true;

  // Body signals — referral language or inquiry language
  const leadBody = /new\s+lead|buyer\s+lead|seller\s+lead|interested\s+in\s+your\s+listing|referred\s+by|was\s+referred|referral\s+from|sent\s+by|recommended\s+by|please\s+reach\s+out|please\s+contact|they(?:'re|\s+are)\s+looking\s+to\s+(?:buy|sell)/i;
  if (leadBody.test(body)) return true;

  return false;
}

/*
|--------------------------------------------------------------------------
| checkEmails — main pipeline orchestrator
|--------------------------------------------------------------------------
*/

/**
 * checkEmails(emails)
 * -------------------
 * Processes an array of normalized email objects through the full
 * lead detection pipeline.
 *
 * Each email must have:
 *   - payload.headers: Array<{name, value}>
 *   - payload.bodyText: string (optional pre-extracted body)
 *   - id: string (Gmail message ID)
 *
 * Returns an array of detected lead objects ready for checkDuplicates().
 *
 * @param {object[]} emails
 * @returns {Promise<object[]>}
 */
export async function checkEmails(emails) {
  const results = [];

  for (const email of emails) {
    try {
      // ── Extract headers and body ─────────────────────────────────────────
      const headers = getEmailHeaders(email);
      const body    = email.payload?.bodyText ?? extractPlainText(email.payload);

      if (!body) {
        console.log(`[checkEmails] Skipping email ${email.id} — no body text`);
        continue;
      }

      // ── Quick pre-filter ─────────────────────────────────────────────────
      if (!isLead(headers.from, headers.subject, body)) {
        console.log(`[checkEmails] Skipping email ${email.id} — not a lead`);
        continue;
      }

      // ── STAGE 1: Platform detection ──────────────────────────────────────
      const { source: detectedSource, confidence: sourceConfidence } = detectEmailSource(email);

      console.log(`[checkEmails] Email ${email.id}: source=${detectedSource} (confidence=${sourceConfidence})`);

      // ── STAGE 2 & 3: Platform-specific parsing ───────────────────────────
      let parseResult = parseLead(detectedSource, body, headers);

      console.log(`[checkEmails] Email ${email.id}: parse confidence=${parseResult.confidence} (${describeConfidence(parseResult.confidence)})`);

      // ── STAGE 4: Referral detection ──────────────────────────────────────
      const referralResult = detectReferral(headers.subject, body, headers.from, detectedSource);

      console.log(`[checkEmails] Email ${email.id}: isReferral=${referralResult.isReferral} score=${referralResult.referralScore} signals=[${referralResult.matchedSignals.join(', ')}]`);

      // ── STAGE 5: AI fallback (only if confidence is too low) ─────────────
      if (shouldTryAiFallback(parseResult.confidence)) {
        console.log(`[checkEmails] Email ${email.id}: confidence too low (${parseResult.confidence}), attempting AI fallback`);
        try {
          const aiResult = await aiParseLead(body);

          // Merge AI result — prefer AI values for fields that were null
          parseResult = {
            leadName:        parseResult.leadName        ?? aiResult.leadName,
            leadEmail:       parseResult.leadEmail       ?? aiResult.leadEmail,
            leadPhone:       parseResult.leadPhone       ?? aiResult.leadPhone,
            propertyAddress: parseResult.propertyAddress ?? aiResult.propertyAddress,
            sourceId:        parseResult.sourceId        ?? aiResult.sourceId,
            senderPlatform:  parseResult.senderPlatform,
            rawFields:       { ...parseResult.rawFields, ai: aiResult.rawFields },
          };

          // Recompute confidence after merge
          parseResult.confidence = computeConfidence(parseResult);

          console.log(`[checkEmails] Email ${email.id}: post-AI confidence=${parseResult.confidence}`);
        } catch (err) {
          console.error(`[checkEmails] AI fallback failed for email ${email.id}:`, err);
        }
      }

      // ── Skip if we still have no contact info ────────────────────────────
      if (!parseResult.leadEmail && !parseResult.leadPhone) {
        console.warn(`[checkEmails] Email ${email.id}: no contact info found after all parsing stages — skipping`);
        continue;
      }

      // ── Determine final source ───────────────────────────────────────────
      let finalSource;
      if (['zillow', 'realtor', 'streeteasy', 'trulia', 'redfin', 'homes'].includes(detectedSource)) {
        finalSource = detectedSource;
      } else if (referralResult.isReferral) {
        finalSource = 'referral';
      } else {
        finalSource = 'unknown';
      }

      // ── STAGE 7: Determine lead status based on confidence ───────────────
      // Referrals always require agent verification regardless of confidence.
      // Low-confidence parses also require verification.
      const requiresVerification =
        referralResult.isReferral ||
        shouldMarkUnverified(parseResult.confidence);

      const referredBy = referralResult.isReferral
        ? extractReferrerName(body)
        : null;

      results.push({
        // Lead contact info (actual lead, not platform sender)
        name:     parseResult.leadName,
        email:    parseResult.leadEmail,
        phone:    parseResult.leadPhone,
        property: parseResult.propertyAddress,
        sourceId: parseResult.sourceId,

        // Classification
        source:      finalSource,
        askClient:   requiresVerification,  // true → status = "unverified"
        isReferral:  referralResult.isReferral,
        referredBy,

        // Metadata for correction logging and debugging
        subject:          headers.subject,
        from:             headers.from,
        gmailMessageId:   email.id ?? null,
        parseConfidence:  parseResult.confidence,
        referralScore:    referralResult.referralScore,
        matchedSignals:   referralResult.matchedSignals,
        rawFields:        parseResult.rawFields,
      });

    } catch (err) {
      console.error(`[checkEmails] Unexpected error processing email ${email.id}:`, err);
    }
  }

  return results;
}

/*
|--------------------------------------------------------------------------
| Property matching
|--------------------------------------------------------------------------
*/

/**
 * tokenize(str)
 * Splits a string into lowercase word/number tokens.
 */
function tokenize(str) {
  return str.toLowerCase().match(/\w+/g) ?? [];
}

/**
 * matchProperty(parsedPropertyStr, openProperty)
 * -----------------------------------------------
 * Tries to match a parsed lead's property string against one of the
 * agent's open properties.
 *
 * Matching strategies (any one is sufficient):
 *   1. ID match: source + externalId both match (object input only)
 *   2. Substring match: address contains the needle or vice versa
 *   3. Token match: every token in the needle appears in the address
 *
 * @param {string|object} parsedPropertyStr
 * @param {object}        openProperty
 * @returns {object|null} - the matched property, or null
 */
export function matchProperty(parsedPropertyStr, openProperty) {
  if (!parsedPropertyStr) return null;

  // Object input: try ID-based match first
  if (typeof parsedPropertyStr === 'object') {
    if (
      parsedPropertyStr.source     != null &&
      parsedPropertyStr.externalId != null &&
      parsedPropertyStr.source     === openProperty.source &&
      parsedPropertyStr.externalId === openProperty.externalId
    ) {
      return openProperty;
    }
    return null;
  }

  // String input: address-based matching
  const needle = parsedPropertyStr.toLowerCase();
  if (!needle) return null;

  const addr = `${openProperty.addressLine1} ${openProperty.addressLine2 ?? ''}`.toLowerCase().trim();

  // Strategy 1: substring match
  if (addr.includes(needle) || needle.includes(addr)) return openProperty;

  // Strategy 2: every token in the needle exists in the address tokens
  const addrTokens   = new Set(tokenize(addr));
  const needleTokens = tokenize(needle);

  if (needleTokens.length > 0 && needleTokens.every((t) => addrTokens.has(t))) {
    return openProperty;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| Duplicate detection
|--------------------------------------------------------------------------
*/

/**
 * checkDuplicates(parsedLeads, user)
 * -----------------------------------
 * Filters out leads that already exist in the database.
 * Deduplication is scoped per property:
 *   - If a lead matched a property, it's only a duplicate if the same
 *     email/phone already exists for THAT property.
 *   - If no property matched, dedup is global across null-property leads.
 *
 * @param {object[]} parsedLeads
 * @param {object}   user
 * @returns {Promise<Array<{parsedLead, propertyId}>>}
 */
export async function checkDuplicates(parsedLeads, user) {
  // Fetch all open properties for this user
  const openProperties = await db
    .select()
    .from(properties)
    .where(and(
      eq(properties.userId, user.id),
      eq(properties.status, 'open'),
    ));

  // Fetch all existing active leads for this user
  let existingLeads;
  try {
    const result = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, user.id), eq(leads.status, 'active')));
    existingLeads = Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('[checkDuplicates] Error fetching existing leads:', error);
    existingLeads = [];
  }

  // Build a Map: propertyId (or null) → { emails: Set, phones: Set }
  const existingByProperty = new Map();
  for (const l of existingLeads) {
    const key = l.propertyId ?? null;
    if (!existingByProperty.has(key)) {
      existingByProperty.set(key, { emails: new Set(), phones: new Set() });
    }
    const bucket = existingByProperty.get(key);
    if (l.email) bucket.emails.add(l.email.toLowerCase());
    if (l.phone) bucket.phones.add(l.phone.toLowerCase());
  }

  const newLeads = [];

  for (const parsedLead of parsedLeads) {
    const leadEmail = parsedLead.email?.toLowerCase() ?? null;
    const leadPhone = parsedLead.phone?.toLowerCase() ?? null;

    if (!leadEmail && !leadPhone) {
      console.warn('[checkDuplicates] Lead has no contact info — skipping:', parsedLead);
      continue;
    }

    // Try to match to an open property
    let matchedPropertyId = null;
    for (const property of openProperties) {
      const matched = matchProperty(parsedLead.property, property);
      if (matched) {
        matchedPropertyId = matched.id;
        break;
      }
    }

    const key = matchedPropertyId ?? null;
    if (!existingByProperty.has(key)) {
      existingByProperty.set(key, { emails: new Set(), phones: new Set() });
    }

    const bucket = existingByProperty.get(key);

    if (
      (leadEmail && bucket.emails.has(leadEmail)) ||
      (leadPhone && bucket.phones.has(leadPhone))
    ) {
      console.log(`[checkDuplicates] Duplicate skipped for property ${key}: ${leadEmail ?? leadPhone}`);
      continue;
    }

    newLeads.push({ parsedLead, propertyId: matchedPropertyId });

    // Track within this batch to avoid double-inserting
    if (leadEmail) bucket.emails.add(leadEmail);
    if (leadPhone) bucket.phones.add(leadPhone);
  }

  return newLeads;
}

/*
|--------------------------------------------------------------------------
| Initial outreach
|--------------------------------------------------------------------------
*/

/**
 * sendInitialSms(lead, message, agentInfo)
 * -----------------------------------------
 * Sends an initial outbound SMS to a newly created lead.
 * If no message is provided, generates one via AI.
 *
 * @param {object}      lead
 * @param {string|null} message - optional manual message
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 */
export async function sendInitialSms(lead, message = null, agentInfo = null) {
  const conversation = await findOrCreateSmsConversation(lead.id, lead.phone);

  let reply;
  if (!message) {
    const obj = await generateSmsReply(lead, conversation, '', null, [], [], agentInfo);
    reply = obj.reply;
  } else {
    reply = message;
  }

  // Guard: AI may return null on failure. Don't send empty SMS.
  if (!reply) {
    console.warn(`[sendInitialSms] No reply available for lead ${lead.id} — skipping send.`);
    return;
  }

  const twilioMessage = await sendSMS(lead.phone, reply);
  await saveSmsMessage(conversation.id, 'outbound', reply, twilioMessage?.sid ?? null);
}

/**
 * sendInitialEmail(lead, agentEmail, oauthRefreshToken, message, subject, agentInfo)
 * -----------------------------------------------------------------------------------
 * Sends an initial outbound email to a newly created lead.
 * If no message/subject is provided, generates them via AI.
 *
 * @param {object}      lead
 * @param {string}      agentEmail
 * @param {string}      oauthRefreshToken
 * @param {string|null} message  - optional manual body
 * @param {string|null} subject  - optional manual subject
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 */
export async function sendInitialEmail(lead, agentEmail, oauthRefreshToken, message = null, subject = null, agentInfo = null) {
  const conversation = await findOrCreateEmailConversation(
    lead.id,
    agentEmail,
    [lead.email],
    null,
    null,
    null,
  );

  let msg;
  let sub;

  if (!message || !subject) {
    const generated = await generateEmailReply(lead, conversation, null, '', null, [], [], agentInfo);
    msg = generated.body;
    sub = generated.subject;
  } else {
    msg = message;
    sub = subject;
  }

  // Guard: AI may return body=null on failure. Don't send empty email.
  if (!msg) {
    console.warn(`[sendInitialEmail] No body available for lead ${lead.id} — skipping send.`);
    return;
  }

  await sendAndSaveEmail(
    oauthRefreshToken,
    agentEmail,
    lead.email,
    sub,
    msg,
    conversation.id,
  );
}

/**
 * sendInitialMessages(leads, agentEmail, oauthRefreshToken, message, subject, agentInfo)
 * --------------------------------------------------------------------------------------
 * Sends the initial outreach message to each newly inserted lead.
 * Prefers SMS if the lead has a phone number, falls back to email.
 *
 * @param {object[]}    leads
 * @param {string}      agentEmail
 * @param {string}      oauthRefreshToken
 * @param {string|null} message  - optional manual message (SMS body or email body)
 * @param {string|null} subject  - optional manual email subject
 * @param {{ name: string, email: string|null, phone: string|null, brokerage: string|null }|null} agentInfo
 */
export async function sendInitialMessages(leads, agentEmail, oauthRefreshToken, message = null, subject = null, agentInfo = null) {
  for (const lead of leads) {
    try {
      if (lead.phone) {
        await sendInitialSms(lead, message, agentInfo);
      } else if (lead.email) {
        await sendInitialEmail(lead, agentEmail, oauthRefreshToken, message, subject, agentInfo);
      } else {
        console.warn('[sendInitialMessages] Lead has no contact info — skipping:', lead.id);
      }
    } catch (err) {
      console.error(`[sendInitialMessages] Failed to send to lead ${lead.id}:`, err);
    }
  }
}
