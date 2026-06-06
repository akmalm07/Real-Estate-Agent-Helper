import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { eq, and } from 'drizzle-orm';
import OpenAI from 'openai';
import { db } from '../db/index.js';
import { users, oauthAccounts, properties, leads } from '../db/schema.js';

const googleOAuthClient = new OAuth2Client();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const webhookRouter = Router();

const pubSubServiceAcc = process.env.GOOGLE_PUB_SUB_AUTH_SERVICE_ACCOUNT;
const pubSubAudience = process.env.PUB_SUB_AUDIENCE;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

async function verifyPubSubToken(token) {
  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: token,
    audience: pubSubAudience,
  });

  return ticket.getPayload();
}

function extractPlainText(payload) {
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

function isLead(fromHeader, body) {
  const leadSenders = /zillow\.com|realtor\.com/i;
  if (leadSenders.test(fromHeader)) return true;

  const leadKeywords = /new lead|buyer lead|seller lead|home inquiry|property inquiry|interested in your listing/i;
  return leadKeywords.test(body);
}

function regexParseLead(body) {
  const email = body.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;
  const phone = body.match(/(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/)?.[0] ?? null;
  const property = body.match(/(?:property|home|listing|address)[:\s]+([^\n]+)/i)?.[1]?.trim() ?? null;
  const zillowId = body.match(/zillow\.com\/homedetails\/[^/]+\/(\d+)_zpid/i)?.[1] ?? null;
  const realtorId = body.match(/realtor\.com\/realestateandhomes-detail\/[^/]+-(\d+)/i)?.[1] ?? null;

  return { email, phone, property, zillowId, realtorId };
}

function isParseComplete(parsed) {
  return parsed.email !== null && parsed.phone !== null && parsed.property !== null;
}

async function aiParseLead(body) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a data extraction assistant. Extract lead information from real estate emails. ' +
          'Strictly return a JSON object with these keys: email, phone, property, zillowId, realtorId, name. ' +
          'Use null for any field you cannot find. Return ONLY the JSON object, no explanation.',
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

export async function checkEmails(emails) {
  // Named 'results' to avoid shadowing the imported 'leads' table
  const results = [];

  for (const email of emails) {
    const headers = email.payload?.headers ?? [];
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

    const source = /zillow\.com/i.test(from)
      ? 'zillow'
      : /realtor\.com/i.test(from)
      ? 'realtor'
      : 'other';

    const body = extractPlainText(email.payload);

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

    results.push({
      ...parsed,
      subject,
      from,
      source,
      gmailMessageId: email.id,
    });
  }

  return results;
}

async function readNewEmails(oauth, newHistoryId) {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: oauth.refreshToken,
  });

  const accessTokenResponse = await oauth2Client.getAccessToken();
  const accessToken = accessTokenResponse.token;

  const startHistoryId = oauth.lastHistoryId;

  if (!startHistoryId) {
    throw new Error('No stored historyId. Initialize it when creating the watch.');
  }

  const historyResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!historyResponse.ok) {
    throw new Error(await historyResponse.text());
  }

  const historyData = await historyResponse.json();

  const messageIds = new Set();

  for (const history of historyData.history ?? []) {
    for (const added of history.messagesAdded ?? []) {
      messageIds.add(added.message.id);
    }
  }

  const emails = [];

  for (const messageId of messageIds) {
    const messageResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!messageResponse.ok) {
      continue;
    }

    emails.push(await messageResponse.json());
  }

  // Save the new history id
  await db
    .update(oauthAccounts)
    .set({ lastHistoryId: newHistoryId })
    .where(eq(oauthAccounts.id, oauth.id));

  return emails;
}

// Splits a string into lowercase tokens (words/numbers).
function tokenize(str) {
  return str.toLowerCase().match(/\w+/g) ?? [];
}

// Tries to match a parsed lead's property string against one of the user's open properties.
// Returns the matching property object, or null.
//
// Matching strategy (any one is sufficient):
//   1. Full address string contains the needle, or vice versa.
//   2. Every token in the needle appears somewhere in the full address tokens
//      (handles "Apt 2F" matching a DB addressLine2 of "2F").
export function matchProperty(parsedPropertyStr, openProperty) {
  if (!parsedPropertyStr) return null;

  const needle = parsedPropertyStr.toLowerCase();
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

// Returns only new, valid leads — filtering out duplicates.
// Each returned item is { parsedLead, propertyId } ready to insert.
// propertyId may be null if the lead didn't reference a specific property —
// the agent can assign it manually later.
export async function checkDuplicates(parsedLeads, user) {
  // Fetch all open properties for this user
  const openProperties = await db
    .select()
    .from(properties)
    .where(and(
      eq(properties.user_id, user.id),
      eq(properties.status, 'open')
    ));

  // Fetch ALL existing leads for this user (across all properties) for dedup.
  // We query per property and merge into a single set.
  const existingEmails = new Set();
  const existingPhones = new Set();

  for (const property of openProperties) {
    const existingLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.propertyId, property.id));

    for (const l of existingLeads) {
      if (l.email) existingEmails.add(l.email.toLowerCase());
      if (l.phone) existingPhones.add(l.phone.toLowerCase());
    }
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

    // Skip duplicates
    if ((leadEmail && existingEmails.has(leadEmail)) || (leadPhone && existingPhones.has(leadPhone))) {
      console.log(`Duplicate lead skipped: ${leadEmail ?? leadPhone}`);
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

    // Save with propertyId null if no property matched — agent assigns later
    newLeads.push({ parsedLead: parsedLead , propertyId: matchedPropertyId });

    // Track within this batch to avoid double-inserting
    if (leadEmail) existingEmails.add(leadEmail);
    if (leadPhone) existingPhones.add(leadPhone);
  }

  return newLeads;
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

webhookRouter.post('/gmail', async (req, res) => {

  // AUthentication Layer
  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized');
    }

    const token = auth.substring(7);

    const payload = await verifyPubSubToken(token);

    if (payload.email !== pubSubServiceAcc) {
      return res.sendStatus(401);
    }

    const pubSubMsgEncoded = req.body.message.data;

    const pubSubMsgDecoded = JSON.parse(
      Buffer.from(pubSubMsgEncoded, 'base64').toString('utf8')
    );

    console.log('Point 1 reached')

    const [oauthAcc] = await db
      .select()
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(eq(users.email, pubSubMsgDecoded.emailAddress))
      .limit(1);

    console.log('Point 2 reached')

    if (!oauthAcc) {
      console.log("we did not find the oauth Account!")
      return res.sendStatus(200); // Ignore unrecognized email
    }
    console.log("Point 3 reached, we DID find the oauth Account!")

    const emails = await readNewEmails(oauthAcc.oauth_accounts, pubSubMsgDecoded.historyId);
    if (emails.length === 0) return res.sendStatus(200);

    console.log(emails);

    const parsedLeads = await checkEmails(emails);
    if (parsedLeads.length === 0) return res.sendStatus(200);

    const newLeads = await checkDuplicates(parsedLeads, oauthAcc.users);
    if (newLeads.length === 0) return res.sendStatus(200);

    console.log('New leads to save:', newLeads);

    await db.insert(leads).values(
      newLeads.map(({ parsedLead, propertyId }) => ({
        propertyId: propertyId ?? null,
        userId: oauthAcc.userId,
        name: parsedLead.name ?? null,
        email: parsedLead.email ?? null,
        phone: parsedLead.phone ?? null,
        source: parsedLead.from,
        sourceId: parsedLead.zillowId ?? parsedLead.realtorId ?? null,
        status: 'new',
      }))
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(401);
  }
});

export default webhookRouter;
