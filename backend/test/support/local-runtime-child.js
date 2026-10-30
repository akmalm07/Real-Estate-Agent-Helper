import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { startLocalApp } from '../../src/testing/local-start.js';

// Assert zero dotenv access, including transitive imports, not just zero values.
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'statSync', 'accessSync']) {
  const original = fs[name];
  fs[name] = function (path, ...args) {
    if (/(^|\/)\.env(?:\.|$)/.test(String(path))) throw new Error('DOTENV_ACCESS_FORBIDDEN');
    return original.call(this, path, ...args);
  };
}
syncBuiltinESMExports();
for (const name of ['readFile', 'open', 'stat', 'access']) {
  const original = fs.promises[name];
  fs.promises[name] = function (path, ...args) {
    if (/(^|\/)\.env(?:\.|$)/.test(String(path))) throw new Error('DOTENV_ACCESS_FORBIDDEN');
    return original.call(this, path, ...args);
  };
}

let runtime;
try {
  runtime = await startLocalApp(JSON.parse(process.argv[2]));
  process.send({ ready: true, port: runtime.server.address().port });
} catch (error) {
  process.send({ error: error.stack });
  process.disconnect();
}

if (runtime) process.on('message', async ({ id, action }) => {
  try {
    let value;
    if (action === 'close') {
      await runtime.close();
      process.send({ id, value: 'closed' });
      process.disconnect();
      return;
    } else if (action === 'checks') {
      for (const url of [
        'https://gmail.googleapis.com/gmail/v1/users/me/messages',
        'https://graph.microsoft.com/v1.0/me/messages',
        'https://api.openai.com/v1/chat/completions',
        'https://api.telnyx.com/v2/messages',
        'https://unknown.example.invalid/',
      ]) await assert.rejects(fetch(url), /LOCAL_EGRESS_DENIED/);
      for (const attempt of [
        () => http.get('http://unknown.example.invalid'),
        () => http.request('http://unknown.example.invalid'),
        () => https.get('https://graph.microsoft.com'),
        () => https.request('https://api.openai.com'),
        () => net.connect(443, 'www.googleapis.com'),
        () => new net.Socket().connect({ host: '127.0.0.1', port: 5432 }),
        () => net.connect('/var/run/postgresql/.s.PGSQL.5432'),
        () => tls.connect(443, 'api.telnyx.com'),
      ]) assert.throws(attempt, /LOCAL_EGRESS_DENIED/);
      const { sendEmail, sendSMS } = await import('../../src/phone.js');
      await assert.rejects(sendEmail('not-local@example.com', 'Synthetic', '<p>No delivery</p>'), /LOCAL_EGRESS_DENIED/);
      await sendEmail('runtime@example.invalid', 'Synthetic', '<p>Captured</p>');
      assert.equal((await sendSMS('+15555550123', 'Synthetic')).success, false);
      const { aiParseLead } = await import('../../src/pubsub-webhook-helpers.js');
      await assert.rejects(aiParseLead('Synthetic inquiry'), /credentials|apiKey|API key/i);
      const { getMessage } = await import('../../src/outlook.js');
      await assert.rejects(getMessage('', 'synthetic'), /LOCAL_EGRESS_DENIED/);
      const { OAuth2Client } = await import('google-auth-library');
      await assert.rejects(new OAuth2Client().getToken('synthetic'), /LOCAL_EGRESS_DENIED/);
      const tables = await runtime.pool.query("select count(*)::int as count from pg_tables where schemaname='public'");
      assert.equal(tables.rows[0].count, 13);
      await assert.rejects(runtime.pool.query(
        "insert into lead_notes (lead_id, note) values (2147483647, 'synthetic missing lead')"
      ), error => error.code === '23503');
      value = { tables: 13, fk: '23503', captured: runtime.captures.length };
    } else if (action === 'captures') {
      value = runtime.captures.map(envelope => envelope.to[0].address);
    } else throw new Error('Unknown test control');
    process.send({ id, value });
  } catch (error) {
    process.send({ id, error: error.stack });
  }
});
