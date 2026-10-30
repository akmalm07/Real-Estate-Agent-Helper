import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { CONTAINER, docker, verifyContainer } from '../src/testing/verified-container.js';
import { validateLocalInputs } from '../src/testing/local-start.js';

const childPath = fileURLToPath(new URL('./support/local-runtime-child.js', import.meta.url));
const defaultServerPath = fileURLToPath(new URL('./support/default-server-child.js', import.meta.url));
const database = `reah_local_t68243be5_${randomBytes(12).toString('hex')}`;
const options = { database, host: '127.0.0.1', port: 0 };
const cleanEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME,
  NODE_ENV: 'test', REAH_LOCAL_CONTAINER: CONTAINER,
};


async function launch(overrides = {}, env = cleanEnv) {
  const child = fork(childPath, [JSON.stringify({ ...options, ...overrides })], {
    env, execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const first = await Promise.race([
    once(child, 'message').then(([message]) => message),
    once(child, 'exit').then(([code]) => { throw new Error(`Child exited before ready: ${code}`); }),
  ]);
  if (first.error) {
    await once(child, 'exit');
    return { error: first.error };
  }
  let nextId = 0;
  const pending = new Map();
  child.on('message', message => {
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error));
    else callbacks.resolve(message.value);
  });
  const control = action => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    child.send({ id, action });
  });
  return {
    port: first.port, control,
    async close() {
      const exited = once(child, 'exit');
      await control('close');
      const [code] = await exited;
      assert.equal(code, 0, 'owned process exits after listener/pool close');
    },
  };
}

test('startup boundaries reject unsafe configuration before imports; default Neon remains', { timeout: 20000 }, async () => {
  for (const env of [
    { ...cleanEnv, NODE_ENV: 'production' },
    { ...cleanEnv, DATABASE_URL: 'postgres://synthetic.example.invalid/test' },
    { ...cleanEnv, OPENAI_API_KEY: 'forbidden-synthetic-input' },
    { ...cleanEnv, GOOGLE_CLIENT_SECRET: 'forbidden-synthetic-input' },
    { ...cleanEnv, FRONTEND_URL: 'https://example.invalid' },
  ]) {
    assert.throws(() => validateLocalInputs(options, env));
    assert.match((await launch({}, env)).error, /Local NODE_ENV|Unexpected inherited configuration/);
  }
  assert.match((await launch({ host: '0.0.0.0' })).error, /Loopback/);
  assert.match((await launch({ url: 'postgres://example.invalid/test' })).error, /AssertionError/);
  const production = readFileSync(new URL('../db/index.js', import.meta.url), 'utf8');
  assert.match(production, /drizzle\(neon\(process.env.DATABASE_URL\)\)/);
  assert.doesNotMatch(production, /process.env.*LOCAL/);
  const result = execFileSync(process.execPath, [
    '--experimental-test-module-mocks',
    fileURLToPath(new URL('./support/default-runtime-child.js', import.meta.url)),
  ], { env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', REAH_LOCAL_RUNTIME: 'true', REAH_LOCAL_CONTAINER: CONTAINER }, encoding: 'utf8', timeout: 10000 });
  assert.match(result, /Default Neon missing-URL path retained/);
});

test('default server reports occupied-port failure and serves on an ephemeral port', { timeout: 20000 }, async () => {
  const occupied = net.createServer();
  await new Promise((resolve, reject) => occupied.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const port = occupied.address().port;
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://synthetic@127.0.0.1:1/reah_unused',
    FRONTEND_URL: 'http://127.0.0.1/', PORT: String(port),
  };
  const run = (serverPort) => new Promise(resolve => {
    const child = fork(defaultServerPath, [], { env: { ...env, PORT: String(serverPort) }, execArgv: ['--experimental-test-module-mocks'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('exit', (code, signal) => resolve({ child, code, signal, stdout, stderr }));
    child.once('message', message => { if (message.ready) resolve({ child, ready: true, port: message.port, stdout, stderr }); });
  });
  try {
    const collision = await run(port);
    assert.notEqual(collision.code, 0, 'occupied port must fail the server process');
    assert.match(collision.stderr, /EADDRINUSE/);
    assert.doesNotMatch(collision.stdout, /Server running/);
  } finally {
    await new Promise(resolve => occupied.close(resolve));
  }
  const live = await run(0);
  assert.equal(live.ready, true, live.stderr);
  assert.ok(live.port > 0);
  try {
    const response = await fetch(`http://127.0.0.1:${live.port}/api/auth/me`);
    assert.equal(response.status, 401);
  } finally {
    live.child.kill('SIGTERM');
  }
});

test('explicit credential-free local runtime: real PostgreSQL, mounted HTTP and egress isolation', { timeout: 60000 }, async () => {
  assert.equal(process.env.REAH_LOCAL_CONTAINER, CONTAINER, 'Named container opt-in required');
  verifyContainer(process.env.REAH_LOCAL_CONTAINER);

  const psql = (...args) => docker('exec', CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-h', '/var/run/postgresql', ...args);
  psql('-d', 'postgres', '-c', `CREATE DATABASE ${database} TEMPLATE template0;`);
  const sqlDirectory = `/reah-local-${database}`;
  docker('exec', CONTAINER, 'mkdir', sqlDirectory);
  docker('cp', `${fileURLToPath(new URL('../db/migrations/', import.meta.url))}.`, `${CONTAINER}:${sqlDirectory}`);
  const bootstrap = psql('-d', database, '-f', `${sqlDirectory}/bootstrap.sql`);
  assert.match(bootstrap, /COMMIT/);
  console.log(`Retained synthetic database: ${database}; one current-SQL bootstrap`);

  let app = await launch();
  assert.ok(app.port > 0, app.error);
  let cookie = '';
  const request = async (path, method = 'GET', body, authenticated = true) => {
    const response = await fetch(`http://127.0.0.1:${app.port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, data: await response.json() };
  };
  try {
    const collision = await launch({ port: app.port });
    assert.match(collision.error, new RegExp(`127\\.0\\.0\\.1:${app.port}: EADDRINUSE`));
    assert.equal((await request('/api/properties?simulation=true&local=true', 'GET', null, false)).response.status, 401);
    const identity = { name: 'Synthetic Runtime', email: 'runtime@example.invalid', password: 'synthetic-local-password' };
    const signup = await request('/api/auth/signup', 'POST', identity);
    assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
    cookie = signup.response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^token=/);
    const payload = { addressLine1: '123 Synthetic Lane', description: 'Synthetic property example.invalid', status: 'open', source: 'listing', externalId: 'example.invalid/runtime', price: '250000', bedrooms: 2 };
    const created = await request('/api/properties', 'POST', payload);
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.description, payload.description);
    assert.deepEqual((await request('/api/properties')).data, [created.data]);
    const missingLead = await request('/api/notes', 'POST', { leadId: 2147483647, content: 'Synthetic missing lead' });
    assert.equal(missingLead.response.status, 404); // Existing relational precheck; do not rewrite the route.
    assert.deepEqual(await app.control('checks'), { tables: 13, fk: '23503', captured: 1 });
    await app.close();
    app = await launch();
    assert.ok(app.port > 0, app.error);
    cookie = '';
    assert.equal((await request('/api/properties')).response.status, 401);
    const login = await request('/api/auth/login', 'POST', identity);
    assert.equal(login.response.status, 200, JSON.stringify(login.data));
    cookie = login.response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^token=/);
    assert.deepEqual((await request('/api/properties')).data, [created.data]);
    const reset = await request('/api/auth/change-password', 'POST', { email: identity.email });
    assert.equal(reset.response.status, 200);
    assert.deepEqual(await app.control('captures'), [identity.email]);
    console.log('13 real tables; signup/cookie CRUD; process restart/login persisted same row; notes404; driver FK23503; guarded provider capture/rejection');
  } finally {
    await app.close();
  }
});
