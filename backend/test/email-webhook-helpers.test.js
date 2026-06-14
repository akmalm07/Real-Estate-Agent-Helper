import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
|--------------------------------------------------------------------------
| Module mocks — must be set up before importing the module under test.
|
| We mock the DB and all outreach helpers so these tests stay unit-level
| and never hit a real database or external API.
|--------------------------------------------------------------------------
*/

import { db } from './mock-db.js';

mock.module('../db/index.js', {
  namedExports: { db },
});

mock.module('../db/schema.js', {
  namedExports: {
    properties: {},
    leads: {},
    conversations: {},
  },
});

mock.module('drizzle-orm', {
  namedExports: {
    eq: () => {},
    and: () => {},
  },
});

mock.module('openai', {
  defaultExport: class {
    chat = {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  email: 'ai@example.com',
                  phone: '555-000-0000',
                  property: '123 AI St',
                  zillowId: null,
                  realtorId: null,
                  name: 'AI Lead',
                }),
              },
            },
          ],
        }),
      },
    };
  },
});

mock.module('../src/phone.js', {
  namedExports: { sendSMS: async () => ({ sid: 'SM_mock' }) },
});

mock.module('../src/sms-helpers.js', {
  namedExports: {
    findOrCreateSmsConversation: async () => ({ id: 1 }),
    saveSmsMessage: async () => {},
    generateSmsReply: async () => ({ reply: 'Hello!' }),
  },
});

mock.module('../src/email-helpers.js', {
  namedExports: {
    findOrCreateEmailConversation: async () => ({ id: 1 }),
    saveEmailMessage: async () => {},
    sendAndSaveEmail: async () => {},
    generateEmailReply: async () => ({ subject: 'Re: Test', body: 'Hello!' }),
  },
});

const {
  extractPlainText,
  isLead,
  regexParseLead,
  isParseComplete,
  matchProperty,
  checkEmails,
  checkDuplicates,
} = await import('../src/email-webhook-helpers.js');

/*
|--------------------------------------------------------------------------
| extractPlainText
|--------------------------------------------------------------------------
*/

describe('extractPlainText', () => {
  it('returns decoded text from a direct base64 body', () => {
    const payload = {
      body: { data: Buffer.from('Hello World').toString('base64') },
    };
    assert.equal(extractPlainText(payload), 'Hello World');
  });

  it('returns text/plain part when present', () => {
    const payload = {
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: Buffer.from('Plain text part').toString('base64') },
        },
      ],
    };
    assert.equal(extractPlainText(payload), 'Plain text part');
  });

  it('strips HTML tags when only text/html part is present', () => {
    const payload = {
      parts: [
        {
          mimeType: 'text/html',
          body: { data: Buffer.from('<p>Hello <b>World</b></p>').toString('base64') },
        },
      ],
    };
    const result = extractPlainText(payload);
    assert.ok(!result.includes('<p>'), 'Should not contain HTML tags');
    assert.ok(result.includes('Hello'), 'Should contain text content');
  });

  it('returns null when payload has no body or parts', () => {
    assert.equal(extractPlainText({}), null);
  });

  it('recurses into nested parts', () => {
    const payload = {
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: Buffer.from('Nested plain text').toString('base64') },
            },
          ],
        },
      ],
    };
    assert.equal(extractPlainText(payload), 'Nested plain text');
  });
});

/*
|--------------------------------------------------------------------------
| isLead
|--------------------------------------------------------------------------
*/

describe('isLead', () => {
  it('returns true for emails from zillow.com', () => {
    assert.equal(isLead('noreply@zillow.com', 'some body'), true);
  });

  it('returns true for emails from realtor.com', () => {
    assert.equal(isLead('leads@realtor.com', 'some body'), true);
  });

  it('returns true when body contains lead keywords', () => {
    assert.equal(isLead('someone@gmail.com', 'You have a new lead interested in your listing'), true);
  });

  it('returns true for "buyer lead" keyword', () => {
    assert.equal(isLead('someone@gmail.com', 'This is a buyer lead notification'), true);
  });

  it('returns false for unrelated emails', () => {
    assert.equal(isLead('newsletter@example.com', 'Check out our weekly deals!'), false);
  });

  it('is case-insensitive for sender domain', () => {
    assert.equal(isLead('noreply@ZILLOW.COM', 'body'), true);
  });
});

/*
|--------------------------------------------------------------------------
| regexParseLead
|--------------------------------------------------------------------------
*/

describe('regexParseLead', () => {
  const sampleBody = `
    New Lead Notification
    Name: John Smith
    Email: john.smith@example.com
    Phone: (555) 123-4567
    Property: 123 Main St, Springfield
    https://www.zillow.com/homedetails/123-main-st/12345678_zpid
  `;

  it('extracts email address', () => {
    const result = regexParseLead(sampleBody);
    assert.equal(result.email, 'john.smith@example.com');
  });

  it('extracts phone number', () => {
    const result = regexParseLead(sampleBody);
    assert.ok(result.phone, 'Phone should be extracted');
    assert.ok(result.phone.includes('555'), 'Phone should contain 555');
  });

  it('extracts property address', () => {
    const result = regexParseLead(sampleBody);
    assert.ok(result.property, 'Property should be extracted');
    assert.ok(result.property.includes('123 Main St'), 'Property should contain address');
  });

  it('extracts Zillow ID', () => {
    const result = regexParseLead(sampleBody);
    assert.equal(result.zillowId, '12345678');
  });

  it('extracts name', () => {
    const result = regexParseLead(sampleBody);
    assert.equal(result.name, 'John Smith');
  });

  it('returns null for missing fields', () => {
    const result = regexParseLead('No useful information here.');
    assert.equal(result.email, null);
    assert.equal(result.phone, null);
    assert.equal(result.property, null);
  });

  it('extracts Realtor.com ID', () => {
    const body = 'https://www.realtor.com/realestateandhomes-detail/123-main-st-98765432';
    const result = regexParseLead(body);
    assert.equal(result.realtorId, '98765432');
  });
});

/*
|--------------------------------------------------------------------------
| isParseComplete
|--------------------------------------------------------------------------
*/

describe('isParseComplete', () => {
  it('returns true when email, phone, and property are all present', () => {
    assert.equal(
      isParseComplete({ email: 'a@b.com', phone: '5551234567', property: '123 Main St' }),
      true,
    );
  });

  it('returns false when email is missing', () => {
    assert.equal(
      isParseComplete({ email: null, phone: '5551234567', property: '123 Main St' }),
      false,
    );
  });

  it('returns false when phone is missing', () => {
    assert.equal(
      isParseComplete({ email: 'a@b.com', phone: null, property: '123 Main St' }),
      false,
    );
  });

  it('returns false when property is missing', () => {
    assert.equal(
      isParseComplete({ email: 'a@b.com', phone: '5551234567', property: null }),
      false,
    );
  });

  it('returns false when all fields are null', () => {
    assert.equal(
      isParseComplete({ email: null, phone: null, property: null }),
      false,
    );
  });
});

/*
|--------------------------------------------------------------------------
| matchProperty
|--------------------------------------------------------------------------
*/

describe('matchProperty', () => {
  const openProperty = {
    id: 1,
    addressLine1: '123 Main Street',
    addressLine2: 'Apt 4B',
    source: 'zillow',
    externalId: 'Z123',
  };

  it('returns null when parsedPropertyStr is null or empty', () => {
    assert.equal(matchProperty(null, openProperty), null);
    assert.equal(matchProperty('', openProperty), null);
  });

  it('matches when needle is a substring of the full address', () => {
    const result = matchProperty('123 Main Street', openProperty);
    assert.deepEqual(result, openProperty);
  });

  it('matches when full address is a substring of the needle', () => {
    const result = matchProperty('123 Main Street Apt 4B Springfield', openProperty);
    assert.deepEqual(result, openProperty);
  });

  it('matches via token overlap', () => {
    const result = matchProperty('123 main', openProperty);
    assert.deepEqual(result, openProperty);
  });

  it('returns null when there is no match', () => {
    const result = matchProperty('999 Elm Avenue', openProperty);
    assert.equal(result, null);
  });

  it('matches by source and externalId when both are present on the object', () => {
    const result = matchProperty({ source: 'zillow', externalId: 'Z123' }, openProperty);
    assert.deepEqual(result, openProperty);
  });

  it('returns null when source/externalId object does not match', () => {
    const result = matchProperty({ source: 'zillow', externalId: 'Z999' }, openProperty);
    assert.equal(result, null);
  });
});

/*
|--------------------------------------------------------------------------
| checkEmails
|--------------------------------------------------------------------------
*/

describe('checkEmails', () => {
  it('returns an empty array when given no emails', async () => {
    const result = await checkEmails([]);
    assert.deepEqual(result, []);
  });

  it('skips emails with no extractable body', async () => {
    const emails = [{ id: '1', payload: { headers: [], parts: [] } }];
    const result = await checkEmails(emails);
    assert.deepEqual(result, []);
  });

  it('skips emails that are not leads', async () => {
    const emails = [
      {
        id: '2',
        payload: {
          headers: [
            { name: 'From', value: 'newsletter@example.com' },
            { name: 'Subject', value: 'Weekly deals' },
          ],
          bodyText: 'Check out our weekly deals!',
        },
      },
    ];
    const result = await checkEmails(emails);
    assert.deepEqual(result, []);
  });

  it('parses a Zillow lead email and returns a result', async () => {
    const emails = [
      {
        id: 'msg-zillow-1',
        payload: {
          headers: [
            { name: 'From', value: 'noreply@zillow.com' },
            { name: 'Subject', value: 'New Lead' },
          ],
          bodyText: `
            New Lead
            Name: Jane Doe
            Email: jane.doe@example.com
            Phone: (555) 987-6543
            Property: 456 Oak Ave
          `,
        },
      },
    ];

    const result = await checkEmails(emails);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'zillow');
    assert.equal(result[0].gmailMessageId, 'msg-zillow-1');
  });

  it('uses pre-extracted bodyText when provided (Outlook path)', async () => {
    const emails = [
      {
        id: 'msg-outlook-1',
        payload: {
          headers: [
            { name: 'From', value: 'noreply@zillow.com' },
            { name: 'Subject', value: 'New Lead' },
          ],
          bodyText: 'New lead: Email: test@test.com Phone: 555-111-2222 Property: 789 Pine Rd',
        },
      },
    ];

    const result = await checkEmails(emails);
    assert.equal(result.length, 1);
  });

  it('sets source to realtor for realtor.com sender', async () => {
    const emails = [
      {
        id: 'msg-realtor-1',
        payload: {
          headers: [
            { name: 'From', value: 'leads@realtor.com' },
            { name: 'Subject', value: 'New Inquiry' },
          ],
          bodyText: 'New lead inquiry. Email: buyer@example.com Phone: 555-333-4444 Property: 321 Elm St',
        },
      },
    ];

    const result = await checkEmails(emails);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'realtor');
  });
});

/*
|--------------------------------------------------------------------------
| checkDuplicates
|--------------------------------------------------------------------------
*/

describe('checkDuplicates', () => {
  it('returns all leads when there are no existing leads in the DB', async () => {
    const parsedLeads = [
      { email: 'new@example.com', phone: '5551112222', property: '123 Main St', name: 'New Lead', source: 'zillow', zillowId: null, realtorId: null },
    ];

    const user = { id: 1 };
    const result = await checkDuplicates(parsedLeads, user);

    assert.equal(result.length, 1);
    assert.equal(result[0].parsedLead.email, 'new@example.com');
    assert.equal(result[0].propertyId, null);
  });

  it('skips leads with no email and no phone', async () => {
    const parsedLeads = [
      { email: null, phone: null, property: '123 Main St', name: 'Ghost Lead', source: 'zillow', zillowId: null, realtorId: null },
    ];

    const user = { id: 1 };
    const result = await checkDuplicates(parsedLeads, user);

    assert.equal(result.length, 0);
  });

  it('deduplicates within the same batch by email', async () => {
    const parsedLeads = [
      { email: 'dup@example.com', phone: '5551112222', property: '123 Main St', name: 'Lead A', source: 'zillow', zillowId: null, realtorId: null },
      { email: 'dup@example.com', phone: '5559998888', property: '456 Oak Ave', name: 'Lead B', source: 'zillow', zillowId: null, realtorId: null },
    ];

    const user = { id: 1 };
    const result = await checkDuplicates(parsedLeads, user);

    assert.equal(result.length, 1);
    assert.equal(result[0].parsedLead.name, 'Lead A');
  });

  it('deduplicates within the same batch by phone', async () => {
    const parsedLeads = [
      { email: 'lead1@example.com', phone: '5551112222', property: '123 Main St', name: 'Lead A', source: 'zillow', zillowId: null, realtorId: null },
      { email: 'lead2@example.com', phone: '5551112222', property: '456 Oak Ave', name: 'Lead B', source: 'zillow', zillowId: null, realtorId: null },
    ];

    const user = { id: 1 };
    const result = await checkDuplicates(parsedLeads, user);

    assert.equal(result.length, 1);
  });
});
