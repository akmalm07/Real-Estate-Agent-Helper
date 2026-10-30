import assert from 'node:assert/strict';
import { mock } from 'node:test';

// The production failure is checked without reading .env or making a request.
mock.module('dotenv', { defaultExport: { config() {} } });
await assert.rejects(import('../../db/index.js'), /No database connection string was provided to `neon\(\)`/);
console.log('Default Neon missing-URL path retained; mere local env flags do not switch drivers');
