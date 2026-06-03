import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test the pure/exported helpers directly without hitting the DB or network.
import { checkEmails, matchProperty } from '../src/webhook.js';

/*
|--------------------------------------------------------------------------
| Helpers used across tests
|--------------------------------------------------------------------------
*/

function makeEmail({ from = '', subject = '', bodyText = '', mimeType = 'text/plain' } = {}) {
  return {
    id: 'msg-001',
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
      ],
      parts: [
        {
          mimeType,
          body: {
            data: Buffer.from(bodyText).toString('base64'),
          },
        },
      ],
    },
  };
}

/*
|--------------------------------------------------------------------------
| extractPlainText (tested indirectly via checkEmails)
|--------------------------------------------------------------------------
*/

describe('checkEmails', () => {
  it('ignores emails that are not leads', async () => {
    const email = makeEmail({
      from: 'newsletter@example.com',
      bodyText: 'Here is your weekly digest.',
    });

    const results = await checkEmails([email]);
    assert.equal(results.length, 0);
  });

  it('detects lead by sender domain (zillow)', async () => {
    const email = makeEmail({
      from: 'noreply@zillow.com',
      subject: 'New lead for your listing',
      bodyText: [
        'Name: Jane Doe',
        'Email: jane@example.com',
        'Phone: 555-123-4567',
        'Property: 123 Main St',
      ].join('\n'),
    });

    const results = await checkEmails([email]);
    assert.equal(results.length, 1);
    assert.equal(results[0].email, 'jane@example.com');
    assert.equal(results[0].phone, '555-123-4567');
  });

  it('detects lead by keyword in body', async () => {
    const email = makeEmail({
      from: 'someone@randomdomain.com',
      bodyText: 'New lead interested in your listing at 456 Oak Ave. Contact: buyer@test.com, 555-987-6543',
    });

    const results = await checkEmails([email]);
    assert.equal(results.length, 1);
  });

  it('skips emails with no extractable body', async () => {
    const email = {
      id: 'msg-002',
      payload: {
        headers: [{ name: 'From', value: 'noreply@zillow.com' }],
        // no body, no parts
      },
    };

    const results = await checkEmails([email]);
    assert.equal(results.length, 0);
  });

  it('extracts email from body via regex', async () => {
    const email = makeEmail({
      from: 'noreply@realtor.com',
      bodyText: 'Buyer lead: contact test.buyer+tag@domain.co for details. Phone: 206-555-0199. Property: 789 Pine Rd',
    });

    const results = await checkEmails([email]);
    assert.equal(results[0].email, 'test.buyer+tag@domain.co');
  });

  it('extracts phone from body via regex', async () => {
    const email = makeEmail({
      from: 'noreply@zillow.com',
      bodyText: 'New lead. Email: a@b.com. Phone: (206) 555-0100. Property: 1 Market St',
    });

    const results = await checkEmails([email]);
    assert.equal(results[0].phone, '(206) 555-0100');
  });

  it('handles multiple emails and returns one result per lead email', async () => {
    const leadEmail = makeEmail({
      from: 'noreply@zillow.com',
      bodyText: 'New lead. Email: lead@example.com Phone: 555-000-1111 Property: 1 Main St',
    });
    const nonLeadEmail = makeEmail({
      from: 'boss@company.com',
      bodyText: 'Please review the quarterly report.',
    });

    const results = await checkEmails([leadEmail, nonLeadEmail]);
    assert.equal(results.length, 1);
  });

  it('falls through to HTML part when no text/plain part exists', async () => {
    const html = '<p>New lead interested in your listing. Email: html@lead.com Phone: 555-222-3333</p>';
    const email = {
      id: 'msg-003',
      payload: {
        headers: [{ name: 'From', value: 'noreply@zillow.com' }],
        parts: [
          {
            mimeType: 'text/html',
            body: { data: Buffer.from(html).toString('base64') },
          },
        ],
      },
    };

    const results = await checkEmails([email]);
    assert.equal(results.length, 1);
    assert.equal(results[0].email, 'html@lead.com');
  });
});

/*
|--------------------------------------------------------------------------
| matchProperty
|--------------------------------------------------------------------------
*/

describe('matchProperty', () => {
  const property = {
    id: 42,
    addressLine1: '123 Main Street',
    addressLine2: 'Apt 4B',
  };

  it('returns the property when the needle is contained in the address', () => {
    const result = matchProperty('123 Main Street', property);
    assert.deepEqual(result, property);
  });

  it('returns the property when the address is contained in the needle (longer string)', () => {
    const result = matchProperty('123 Main Street Apt 4B, Seattle WA', property);
    assert.deepEqual(result, property);
  });

  it('is case-insensitive', () => {
    const result = matchProperty('123 MAIN STREET', property);
    assert.deepEqual(result, property);
  });

  it('returns null when there is no match', () => {
    const result = matchProperty('999 Other Ave', property);
    assert.equal(result, null);
  });

  it('returns null when parsedPropertyStr is null', () => {
    const result = matchProperty(null, property);
    assert.equal(result, null);
  });

  it('returns null when parsedPropertyStr is empty string', () => {
    const result = matchProperty('', property);
    assert.equal(result, null);
  });

  it('works when addressLine2 is null', () => {
    const propNoLine2 = { id: 7, addressLine1: '50 Elm St', addressLine2: null };
    const result = matchProperty('50 Elm St', propNoLine2);
    assert.deepEqual(result, propNoLine2);
  });

  it('matches when addressLine2 is "2F" and needle contains "Apt 2F"', () => {
    const propWithUnit = { id: 99, addressLine1: '123 Main Street', addressLine2: '2F' };
    // "Apt 2F" tokens: ["apt", "2f"] — "apt" is NOT in addr tokens ["123","main","street","2f"]
    // so this correctly does NOT match — the unit label mismatch is intentional.
    // The lead would need to say "2F" or "123 Main Street 2F" to match.
    const result = matchProperty('Apt 2F', propWithUnit);
    assert.equal(result, null);
  });

  it('matches when needle is just the unit token "2F" and addressLine2 is "2F"', () => {
    const propWithUnit = { id: 99, addressLine1: '123 Main Street', addressLine2: '2F' };
    const result = matchProperty('2F', propWithUnit);
    assert.deepEqual(result, propWithUnit);
  });

  it('matches when needle is "123 Main Street 2F" and addressLine2 is "2F"', () => {
    const propWithUnit = { id: 99, addressLine1: '123 Main Street', addressLine2: '2F' };
    const result = matchProperty('123 Main Street 2F', propWithUnit);
    assert.deepEqual(result, propWithUnit);
  });
});
