import OpenAI from 'openai';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { properties, leads, conversations } from '../db/schema.js';
import { sendSMS as twilioSendSMS } from './phone.js';
import {
  findOrCreateSmsConversation,
  saveSmsMessage,
  generateSmsReply,
} from './sms-helpers.js';
import {
  findOrCreateEmailConversation,
  saveEmailMessage,
  sendAndSaveEmail,
  generateEmailReply,
} from './email-helpers.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/*
|--------------------------------------------------------------------------
| Plain-text extraction
|--------------------------------------------------------------------------
*/

export function extractPlainText(payload) {
  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }

  // Search parts for text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      // Recurse into nested parts
      if (part.parts) {
        const nested = extractPlainText(part);
        if (nested) return nested;
      }
    }

    // Fallback: strip HTML if no plain text found
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
| Lead detection & parsing
|--------------------------------------------------------------------------
*/

export function isLead(fromHeader, body) {
  const leadSenders = /zillow\.com|realtor\.com/i;
  if (leadSenders.test(fromHeader)) return true;

  // Also detect referral language as a lead signal
  const leadKeywords = /new lead|buyer lead|seller lead|home inquiry|property inquiry|interested in your listing|referred by|was referred|referral from|sent by|recommended by/i;
  return leadKeywords.test(body);
}

export function regexParseLead(body) {
  const email = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;
  const phone = body.match(/(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/)?.[0] ?? null;
  const property = body.match(/(?:property|home|listing|address)[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null;
  const zillowId = body.match(/zillow\.com\/homedetails\/[^/]+\/(\d+)_zpid/i)?.[1] ?? null;
  const realtorId = body.match(/realtor\.com\/realestateandhomes-detail\/[^/]+-(\d+)/i)?.[1] ?? null;
  const name = body.match(/(?:name|contact|buyer|seller|from)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i)?.[1]?.trim() ?? null;

  // Detect referral: look for common referral phrases in the body.
  const isReferral = /referred by|was referred|referral from|sent by|recommended by/i.test(body);

  // Try to extract who referred them — useful for the agent to follow up with.
  const referredBy = body.match(/(?:referred by|referral from|sent by|recommended by)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i)?.[1]?.trim() ?? null;

  return { email, phone, property, zillowId, realtorId, name, isReferral, referredBy };
}

export function isParseComplete(parsed) {
  return parsed.email !== null && parsed.phone !== null && parsed.property !== null;
}

export async function aiParseLead(body) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a data extraction assistant. Extract lead information from real estate emails. ' +
          'Strictly return a JSON object with these keys: email, phone, property, zillowId, realtorId, name, isReferral, referredBy. ' +
          'isReferral should be true if the email indicates this lead was referred by someone (look for phrases like "referred by", "was referred", "referral from", "sent by", "recommended by"), false otherwise. ' +
          'referredBy should be the name of the person who referred the lead, or null if not mentioned. ' +
          'Use null for any other field you cannot find. Return ONLY the JSON object, no explanation.',
      },
      {
        role: 'user',
        content: body,
      },
    ],
    temperature: 0,
  });

  const text = response.choices[0].message.content.trim();

  return JSON.parse(text);
}

/*
|--------------------------------------------------------------------------
| Email scanning — accepts an array of normalized email objects.
| Each object must have: { payload, id }
| payload must be a Gmail-style payload OR a pre-normalized object with
| { headers: [{name, value}], body: string } set by the caller.
|--------------------------------------------------------------------------
*/

export async function checkEmails(emails) {
  // Named 'results' to avoid shadowing the imported 'leads' table
  const results = [];

  for (const email of emails) {
    const headers = email.payload?.headers ?? [];
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

    // Detect source from the sender domain first — most reliable signal.
    const isZillow = /zillow\.com/i.test(from);
    const isRealtor = /realtor\.com/i.test(from);

    const body = email.payload?.bodyText ?? extractPlainText(email.payload);

    if (!body) continue;

    if (!isLead(from, body)) continue;

    let parsed = regexParseLead(body);

    if (!isParseComplete(parsed)) {
      try {
        parsed = await aiParseLead(body);
      } catch (err) {
        console.error('AI parsing failed:', err);
      }
    }

    // Determine source:
    //   1. Zillow sender domain  → 'zillow'
    //   2. Realtor sender domain → 'realtor'
    //   3. Body or subject contains referral language, or AI/regex detected isReferral → 'referral'
    //   4. Fallback              → 'unknown'
    let source;
    if (isZillow) {
      source = 'zillow';
    } else if (isRealtor) {
      source = 'realtor';
    } else if (
      parsed.isReferral ||
      /referred by|was referred|referral from|sent by|recommended by/i.test(subject)
    ) {
      source = 'referral';
    } else {
      source = 'unknown';
    }

    results.push({
      ...parsed,
      subject,
      from,
      source,
      gmailMessageId: email.id ?? null,
    });
  }

  return results;
}

/*
|--------------------------------------------------------------------------
| Property matching
|--------------------------------------------------------------------------
*/

// Splits a string into lowercase tokens (words/numbers).
function tokenize(str) {
  return str.toLowerCase().match(/\w+/g) ?? [];
}

// Tries to match a parsed lead's property string against one of the user's open properties.
// Returns the matching property object, or null.
//
// Accepts either:
//   - A string (address text from a parsed lead email)
//   - An object with { source, externalId } for ID-based matching
//
// Matching strategy (any one is sufficient):
//   1. ID match: source + externalId both match (object input only).
//   2. Full address string contains the needle, or vice versa.
//   3. Every token in the needle appears somewhere in the full address tokens.
export function matchProperty(parsedPropertyStr, openProperty) {
  if (!parsedPropertyStr) return null;

  // Object input: try ID-based match first
  if (typeof parsedPropertyStr === 'object') {
    if (
      parsedPropertyStr.source != null &&
      parsedPropertyStr.externalId != null &&
      parsedPropertyStr.source === openProperty.source &&
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
  if (addr.includes(needle) || needle.includes(addr)) {
    return openProperty;
  }

  // Strategy 2: every token in the needle exists in the address tokens
  const addrTokens = new Set(tokenize(addr));
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

// Returns only new, valid leads — filtering out duplicates.
// Each returned item is { parsedLead, propertyId } ready to insert.
// propertyId may be null if the lead didn't reference a specific property —
// the agent can assign it manually later.
//
// Duplicate logic is scoped per property:
//   - If a lead matched a property, it's only a duplicate if the same email/phone
//     already exists for THAT property.
//   - If a lead has no matched property (propertyId null), it's deduped globally
//     across all null-property leads for this user.
export async function checkDuplicates(parsedLeads, user) {
  // Fetch all open properties for this user
  const openProperties = await db
    .select()
    .from(properties)
    .where(and(
      eq(properties.userId, user.id),
      eq(properties.status, 'open')
    ));

  // Fetch ALL existing leads for this user.
  let existingLeads;
  try {
    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, user.id));

    // Ensure we always have an array, regardless of what the DB layer returns
    existingLeads = Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error fetching existing leads:', error);
    existingLeads = [];
  }

  // Build a Map: propertyId (or null for unmatched) -> { emails: Set, phones: Set }
  // This lets us check duplicates scoped to a specific property.
  const existingByProperty = new Map();

  for (const l of existingLeads) {
    const key = l.propertyId; // Could be null

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

    // Cannot reliably dedup without any contact info — skip
    if (!leadEmail && !leadPhone) {
      console.warn('Lead has no email or phone, cannot dedup — skipping:', parsedLead);
      continue;
    }

    // Try to match the lead to one of the user's open properties
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

    // Check for duplicate within the same property scope
    if ((leadEmail && bucket.emails.has(leadEmail)) || (leadPhone && bucket.phones.has(leadPhone))) {
      console.log(`Duplicate lead skipped for property ${key}: ${leadEmail ?? leadPhone}`);
      continue;
    }

    newLeads.push({ parsedLead, propertyId: matchedPropertyId });

    // Track within this batch to avoid double-inserting within the same property
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

/* Sends an initial outbound SMS to a newly created lead.
 * Creates or finds an SMS conversation, generates an AI opening message,
 * sends it via Twilio, and saves it to the database.
 *
 * Parameters:
 *   lead: object — the newly inserted lead record from the database
 */
export async function sendInitialSms(lead) {
  const agentPhone = process.env.TWILIO_FROM_NUMBER;

  const conversation = await findOrCreateSmsConversation(lead.id, lead.phone, agentPhone);

  // No prior history or notes for a brand-new lead
  const { reply } = await generateSmsReply(lead, conversation, '', null, [], []);

  await twilioSendSMS(lead.phone, reply);

  await saveSmsMessage(conversation.id, 'outbound', reply, null);
}

/* Sends an initial outbound email to a newly created lead.
 * Creates or finds an email conversation, generates an AI opening message,
 * sends it via the agent's email account, and saves it to the database.
 *
 * Parameters:
 *   lead:              object — the newly inserted lead record from the database
 *   agentEmail:        string — the agent's email address
 *   oauthRefreshToken: string — the agent's OAuth refresh token
 */
export async function sendInitialEmail(lead, agentEmail, oauthRefreshToken) {
  const conversation = await findOrCreateEmailConversation(
    lead.id,
    agentEmail,
    [lead.email],
    null,
    null,
    null,
  );

  // No prior history or notes for a brand-new lead
  const { subject, body } = await generateEmailReply(
    lead,
    conversation,
    null,
    '',
    null,
    [],
    [],
  );

  await sendAndSaveEmail(
    oauthRefreshToken,
    agentEmail,
    lead.email,
    subject,
    body,
    conversation.id,
  );
}

/* Sends the initial outreach message to each newly inserted lead.
 * Prefers SMS if the lead has a phone number, falls back to email.
 * Logs a warning and skips the lead if neither is available.
 *
 * Parameters:
 *   insertedLeads:     object[] — the full lead records returned from the DB insert
 *   agentEmail:        string   — the agent's email address
 *   oauthRefreshToken: string   — the agent's OAuth refresh token
 */
export async function sendInitialMessages(insertedLeads, agentEmail, oauthRefreshToken) {
  for (const lead of insertedLeads) {
    try {
      if (lead.phone) {
        await sendInitialSms(lead);
      } else if (lead.email) {
        await sendInitialEmail(lead, agentEmail, oauthRefreshToken);
      } else {
        console.warn('Lead has neither phone nor email, skipping initial message:', lead.id);
      }
    } catch (err) {
      console.error(`Failed to send initial message to lead ${lead.id}:`, err);
    }
  }
}
