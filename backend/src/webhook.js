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

async function checkEmails(emails) {
  const leads = [];

  for (const email of emails) {
    const headers = email.payload?.headers ?? [];
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

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

    leads.push({
      ...parsed,
      subject,
      from,
      gmailMessageId: email.id,
    });
  }

  return leads;
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

// Tries to match a parsed lead's property string against the user's open properties
function matchProperty(parsedPropertyStr, openProperty) {
  if (!parsedPropertyStr) return null;

  const needle = parsedPropertyStr.toLowerCase();

  const addr = `${openProperty.addressLine1} ${openProperty.addressLine2 ?? ''}`.toLowerCase();
  return addr.includes(needle) || needle.includes(addr.trim());

}

// Returns only new, valid leads — filtering out duplicates and leads for inactive properties.
// Each returned item is { parsedLead, propertyId } ready to insert.
async function checkDuplicates(parsedLeads, user) {
  // Fetch all properties for this user
  const openProperties = await db
    .select()
    .from(properties)
    .where(and(
      eq(properties.user_id, user.id),
      eq(properties.status, 'open')
    ));

  // Fetch existing leads for this user to dedup by email
  for (const property of openProperties) {
    const existingLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.propertyId, property.id));


    const existingEmails = new Set(
      existingLeads.map((l) => l.email?.toLowerCase()).filter(Boolean)
    );

    const existingPhoneNumbers = new Set(
      existingLeads.map((l) => l.phone?.toLowerCase()).filter(Boolean)
    );
    const newLeads = [];

    for (const parsedLead of parsedLeads) {
      
      // Edge case: lead has no email or phone — we can't reliably dedup, flag and include anyway
      if (!parsedLead.email && !parsedLead.phone) {
        console.warn('Lead has no email, cannot dedup:', parsedLead);
        newLeads.push({ parsedLead, propertyId: null });
        continue;
      }
      
      let leadEmail
      let leadPhone;
      if (parsedLead.email) leadEmail = parsedLead.email.toLowerCase();
      
      if (parsedLead.phone) leadPhone = parsedLead.phone.toLowerCase();
      


      // Edge case: duplicate lead email already in DB
      if (leadEmail && existingEmails.has(leadEmail) || leadPhone && existingPhoneNumbers.has(leadPhone)) {
        console.log(`Duplicate lead skipped: ${leadEmail}`);
        continue;
      }

      // Try to match the lead to one of the user's properties
      const matched = matchProperty(parsedLead.property, property);

      if (matched) {
        // Property is open — valid lead
        newLeads.push({ parsedLead, propertyId: matched.id });
      } else {
        // No matching property found — lead emailed directly without referencing a property.
        // Save the lead with no property linked.
        newLeads.push({ parsedLead, propertyId: null });
      }

      // Track this email so we don't add it twice if it appears in the same batch
      if (leadEmail) existingEmails.add(leadEmail);
      if (leadPhone) existingPhoneNumbers.add(leadPhone);
    }
  }

  return newLeads;
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

webhookRouter.post('/gmail', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized');
    }

    const token = auth.substring(7);

    const payload = await verifyPubSubToken(token);

    console.log(payload.email);

    if (payload.email !== pubSubServiceAcc) {
      return res.sendStatus(401);
    }

    const pubSubMsgEncoded = req.body.message.data;

    const pubSubMsgDecoded = JSON.parse(
      Buffer.from(pubSubMsgEncoded, 'base64').toString('utf8')
    );

    console.log(pubSubMsgDecoded);

    const [oauthAcc] = await db
      .select()
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(eq(users.email, pubSubMsgDecoded.emailAddress))
      .limit(1);

    if (!oauthAcc) {
      return res.sendStatus(200); // Ignore unrecognized email
    }

    const emails = await readNewEmails(oauthAcc.oauth_accounts, pubSubMsgDecoded.historyId);

    const parsedLeads = await checkEmails(emails);

    const newLeads = await checkDuplicates(parsedLeads, oauthAcc.users);

    console.log('New leads to save:', newLeads);

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(401);
  }
});

export default webhookRouter;
