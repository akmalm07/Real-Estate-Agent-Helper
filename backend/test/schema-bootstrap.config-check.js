// Offline config check: replace dotenv BEFORE importing config; never read .env.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../', import.meta.url));
let dotenvCalls = 0;
mock.module('dotenv', {
  defaultExport: {
    config(options) {
      dotenvCalls++;
      assert.equal(options.path, `${backend}.env`);
      return {};
    },
  },
});
for (const [index, cwd] of [backend, fileURLToPath(new URL('../../', import.meta.url))].entries()) {
  process.chdir(cwd);
  const { default: config } = await import(`../db/drizzle.config.js?cwd=${index}`);
  assert.equal(config.schema, `${backend}db/schema.js`);
  assert.equal(config.out, `${backend}drizzle`);
  assert.equal(config.dialect, 'postgresql');
  assert.equal(config.dbCredentials.url, undefined);
}
assert.equal(dotenvCalls, 2);
console.log('Config paths stable from root/backend; actual dotenv never loaded.');
