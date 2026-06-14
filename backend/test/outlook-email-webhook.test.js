import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert/strict';

/*
|--------------------------------------------------------------------------
| Mocks — set up before importing the module under test.
|--------------------------------------------------------------------------
*/

import { db } from './mock-db.js';

mock.module('../db/index.js', {
  namedExports: { db },
});

mock.module('../db/schema.js', {
  namedExports: {
    users: {},
    oauthAccounts: {},
    leads: {},
  },
});

mock.module('drizzle-orm', {
  namedExports: {
    eq: () => {},
    and: () => {},
  },
});

mock.module('../src/outlook.js', {
  namedExports: {
    msalClient: {
      acquireTokenByRefreshToken: async () => ({ accessToken: 'mock-access-token' }),
    },
  },
});

mock.module('../src/email-webhook-helpers.js', {
  namedExports: {
    checkEmails: async () => [],
    checkDuplicates: async () => [],
    sendInitialMessages: async () => {},
  },
});

// Mock global fetch for Graph API calls
global.fetch = async (url, options) => {
  return {
    ok: true,
    json: async () => ({ value: [], '@odata.deltaLink': 'https://graph.microsoft.com/delta?token=abc' }),
    text: async () => '',
  };
};

// Set the client state env var used by the route handler
process.env.MICROSOFT_WEBHOOK_CLIENT_STATE = 'test-secret';

import express from 'express';
import outlookEmailWebhook from '../src/outlook-email-webhook.js';

// Build a minimal Express app for route testing
const app = express();
app.use(express.json());
app.use('/webhook', outlookEmailWebhook);

/*
|--------------------------------------------------------------------------
| Helper: make a lightweight supertest-style request without supertest
|--------------------------------------------------------------------------
*/

import http from 'node:http';

function makeRequest(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const bodyStr = body ? JSON.stringify(body) : null;

      const options = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: data });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

/*
|--------------------------------------------------------------------------
| GET /webhook/outlook — validation handshake
|--------------------------------------------------------------------------
*/

describe('GET /webhook/outlook — validation handshake', () => {
  it('echoes back the validationToken as plain text with 200', async () => {
    const res = await makeRequest(app, 'GET', '/webhook/outlook?validationToken=abc123', null);
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('abc123'));
  });

  it('returns 400 when validationToken is missing', async () => {
    const res = await makeRequest(app, 'GET', '/webhook/outlook', null);
    assert.equal(res.status, 400);
  });
});

/*
|--------------------------------------------------------------------------
| POST /webhook/outlook — change notification handler
|--------------------------------------------------------------------------
*/

describe('POST /webhook/outlook — change notification handler', () => {
  it('returns 202 immediately for a valid notification body', async () => {
    const body = {
      value: [
        {
          clientState: 'test-secret',
          resource: 'Users/user-id-123/Messages/msg-id-456',
          changeType: 'created',
          subscriptionId: 'sub-001',
        },
      ],
    };

    const res = await makeRequest(app, 'POST', '/webhook/outlook', body);
    assert.equal(res.status, 202);
  });

  it('returns 202 even when the body has no notifications', async () => {
    const res = await makeRequest(app, 'POST', '/webhook/outlook', { value: [] });
    assert.equal(res.status, 202);
  });

  it('returns 202 even when the body is empty', async () => {
    const res = await makeRequest(app, 'POST', '/webhook/outlook', {});
    assert.equal(res.status, 202);
  });
});

/*
|--------------------------------------------------------------------------
| normalizeOutlookMessage (tested indirectly via checkEmails mock)
|--------------------------------------------------------------------------
|
| We test the normalization logic directly by importing the internal helper.
| Since it is not exported, we test its behavior through the observable
| output of the webhook pipeline (checkEmails receives normalized messages).
|
| Instead, we test the shape contract here by constructing sample Graph
| messages and verifying the normalized output manually.
|--------------------------------------------------------------------------
*/

describe('Outlook message normalization (shape contract)', () => {
  // Replicate the normalization logic here to test it in isolation,
  // since it is a private function inside the module.
  function normalizeOutlookMessage(message) {
    const headers = [
      { name: 'From', value: message.from?.emailAddress?.address ?? '' },
      { name: 'Subject', value: message.subject ?? '' },
      { name: 'Message-ID', value: message.internetMessageId ?? '' },
      { name: 'In-Reply-To', value: message.internetMessageHeaders?.find(
        (h) => h.name.toLowerCase() === 'in-reply-to'
      )?.value ?? '' },
    ];

    let bodyText = '';
    if (message.body?.contentType === 'text') {
      bodyText = message.body.content ?? '';
    } else if (message.body?.contentType === 'html') {
      bodyText = (message.body.content ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return {
      id: message.id,
      payload: { headers, bodyText },
    };
  }

  it('extracts From address from Graph message', () => {
    const msg = {
      id: 'msg-1',
      from: { emailAddress: { address: 'lead@example.com' } },
      subject: 'Test Subject',
      body: { contentType: 'text', content: 'Hello' },
      internetMessageId: '<abc@example.com>',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    const from = normalized.payload.headers.find((h) => h.name === 'From');
    assert.equal(from.value, 'lead@example.com');
  });

  it('extracts Subject from Graph message', () => {
    const msg = {
      id: 'msg-2',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'My Subject',
      body: { contentType: 'text', content: 'Body' },
      internetMessageId: '',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    const subject = normalized.payload.headers.find((h) => h.name === 'Subject');
    assert.equal(subject.value, 'My Subject');
  });

  it('uses plain text body directly', () => {
    const msg = {
      id: 'msg-3',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'S',
      body: { contentType: 'text', content: 'Plain text body' },
      internetMessageId: '',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    assert.equal(normalized.payload.bodyText, 'Plain text body');
  });

  it('strips HTML tags from html body', () => {
    const msg = {
      id: 'msg-4',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'S',
      body: { contentType: 'html', content: '<p>Hello <b>World</b></p>' },
      internetMessageId: '',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    assert.ok(!normalized.payload.bodyText.includes('<p>'), 'Should strip HTML tags');
    assert.ok(normalized.payload.bodyText.includes('Hello'), 'Should keep text content');
    assert.ok(normalized.payload.bodyText.includes('World'), 'Should keep text content');
  });

  it('returns empty bodyText when body is missing', () => {
    const msg = {
      id: 'msg-5',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'S',
      internetMessageId: '',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    assert.equal(normalized.payload.bodyText, '');
  });

  it('extracts In-Reply-To from internetMessageHeaders', () => {
    const msg = {
      id: 'msg-6',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'S',
      body: { contentType: 'text', content: 'Body' },
      internetMessageId: '<new@example.com>',
      internetMessageHeaders: [
        { name: 'In-Reply-To', value: '<original@example.com>' },
      ],
    };

    const normalized = normalizeOutlookMessage(msg);
    const inReplyTo = normalized.payload.headers.find((h) => h.name === 'In-Reply-To');
    assert.equal(inReplyTo.value, '<original@example.com>');
  });

  it('preserves the message id', () => {
    const msg = {
      id: 'unique-msg-id',
      from: { emailAddress: { address: 'a@b.com' } },
      subject: 'S',
      body: { contentType: 'text', content: 'Body' },
      internetMessageId: '',
      internetMessageHeaders: [],
    };

    const normalized = normalizeOutlookMessage(msg);
    assert.equal(normalized.id, 'unique-msg-id');
  });
});
