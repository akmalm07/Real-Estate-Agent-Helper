import assert from 'node:assert/strict';
import { installLocalRuntime } from './local-boundary.js';
import { verifyContainer } from './verified-container.js';
import { installEgressGuard } from './egress.js';

export function validateLocalInputs({ host, port, database }, env = process.env) {
  assert.ok(['test', 'development'].includes(env.NODE_ENV), 'Local NODE_ENV required');
  assert.equal(host, '127.0.0.1', 'Loopback bind required');
  assert.ok(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid local port');
  assert.match(database, /^reah_local_t68243be5_[a-f0-9]{24}$/);
  // Fail closed rather than trying to enumerate every provider credential/config.
  const allowed = new Set(['PATH', 'HOME', 'NODE_ENV', 'REAH_LOCAL_CONTAINER']);
  for (const key of Object.keys(env)) {
    assert.ok(allowed.has(key), `Unexpected inherited configuration: ${key}`);
  }
}

export async function startLocalApp(options) {
  assert.deepEqual(Object.keys(options).sort(), ['database', 'host', 'port']);
  validateLocalInputs(options);
  const socketDirectory = verifyContainer(process.env.REAH_LOCAL_CONTAINER);
  const captures = installEgressGuard(socketDirectory);
  const handles = {};
  installLocalRuntime({ socketDirectory, database: options.database, handles });
  Object.assign(process.env, {
    JWT_SECRET: 'local-t68243be5-synthetic-not-for-production',
    JWT_EXPIRATION: '1h',
    TEMP_TOKEN_EXPIRATION: '15m',
    FRONTEND_URL: 'http://127.0.0.1',
    APP_BASE_URL: 'http://127.0.0.1',
  });
  // All application, dotenv and SDK imports happen after validation and guards.
  let server;
  try {
    const { createApp } = await import('../app.js');
    server = createApp().listen(options.port, options.host);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    await handles.pool?.end();
    throw new Error(`Local listener ${options.host}:${options.port}: ${error.code}`, { cause: error });
  }
  return {
    server, captures, pool: handles.pool,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await handles.pool?.end();
    },
  };
}
