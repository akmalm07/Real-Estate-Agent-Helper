import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const backend = fileURLToPath(new URL('../', import.meta.url));
const migrations = `${backend}db/migrations/`;
const container = process.env.REAH_BOOTSTRAP_CONTAINER;
const env = { ...process.env };
delete env.DATABASE_URL;
// Never import app DB/config modules or dotenv; Drizzle export uses explicit paths.
function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: backend, env, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}
function ok(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
function sql(database, input) {
  return run('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-h', '/var/run/postgresql', '-d', database, '-At'], input);
}
function database() {
  const name = `reah_bootstrap_test_${randomBytes(8).toString('hex')}`;
  ok(sql('postgres', `CREATE DATABASE ${name} TEMPLATE template0;`));
  console.log(`Synthetic database retained: ${name}`);
  return name;
}
function dump(name, data = false) {
  const text = ok(run('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-h', '/var/run/postgresql', '-d', name,
    data ? '--data-only' : '--schema-only', '--no-owner', '--no-privileges', '--schema=public']));
  // pg_dump 17 adds a different random restriction token on every invocation.
  return text.split('\n').filter(line => !/^\\(un)?restrict /.test(line)).join('\n');
}
function bootstrap(name, directory) {
  return run('docker', ['exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-h', '/var/run/postgresql', '-d', name,
    '-f', `${directory}/bootstrap.sql`]);
}

test('isolated PostgreSQL bootstrap, schema parity, data preservation and constraints', () => {
  assert.equal(typeof container, 'string', 'Explicit task-owned REAH_BOOTSTRAP_CONTAINER required');
  assert.match(container, /^reah-bootstrap-t9d4a7723-[a-z0-9-]+$/, 'Explicit task-owned REAH_BOOTSTRAP_CONTAINER required');
  const [info] = JSON.parse(ok(run('docker', ['inspect', container])));
  assert.equal(info.Name, `/${container}`);
  assert.equal(info.Config.Labels?.task, 't_9d4a7723');
  assert.equal(info.Config.Image, 'postgres:17.7-alpine');
  assert.equal(info.State.Running, true);
  assert.equal(info.HostConfig.NetworkMode, 'none');
  assert.deepEqual(info.HostConfig.PortBindings || {}, {});
  assert.deepEqual(info.NetworkSettings.Ports || {}, {});
  assert.deepEqual(Object.keys(info.NetworkSettings.Networks), ['none']);
  assert.ok(Object.hasOwn(info.HostConfig.Tmpfs || {}, '/var/lib/postgresql/data'));
  assert.ok(!info.Mounts.some(mount => mount.Destination === '/var/lib/postgresql/data'));
  assert.ok(!info.Config.Env.some(value => value.startsWith('DATABASE_URL=')));
  assert.ok(info.Config.Env.includes('PGDATA=/var/lib/postgresql/data'));
  ok(run(process.execPath, ['--experimental-test-module-mocks', 'test/schema-bootstrap.config-check.js']));
  const exported = ok(run(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'export', '--dialect', 'postgresql', '--schema', './db/schema.js']));
  const reference = database();
  ok(sql(reference, exported));
  assert.equal(ok(sql(reference, "SELECT count(*) FROM pg_tables WHERE schemaname='public';")).trim(), '13');
  assert.equal(ok(sql(reference, "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e';")).trim(), '14');
  const expectedSchema = dump(reference);

  // This independently reproduces the old invalid enum default before bootstrap exists.
  ok(sql(reference, readFileSync(`${migrations}0001_add_property_details.sql`, 'utf8')));
  assert.equal(dump(reference), expectedSchema, 'Migration 0001 must agree with current schema');
  const directory = `/reah-bootstrap-test-${randomBytes(8).toString('hex')}`;
  ok(run('docker', ['exec', container, 'mkdir', directory]));
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql'))) {
    ok(run('docker', ['cp', `${migrations}${file}`, `${container}:${directory}/${file}`]));
  }
  const fresh = database();
  ok(bootstrap(fresh, directory));
  assert.equal(dump(fresh), dump(reference), 'Complete pg_dump schema must equal current offline Drizzle export');
  const fixture = readFileSync(new URL('./schema-bootstrap.fixture.sql', import.meta.url), 'utf8');
  ok(sql(fresh, `BEGIN;\n${fixture}\nROLLBACK;`));
  const tables = ok(sql(fresh, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")).trim().split('\n');
  for (const table of tables) assert.equal(ok(sql(fresh, `SELECT count(*) FROM "${table}";`)).trim(), '0');
  ok(sql(fresh, `BEGIN;\n${fixture}\nCOMMIT;`));
  const rows = dump(fresh, true);
  ok(bootstrap(fresh, directory));
  assert.equal(dump(fresh, true), rows, 'Rerun must leave every fixture row and sequence unchanged');
  assert.equal(dump(fresh), dump(reference));

  const current = database();
  ok(sql(current, exported));
  ok(sql(current, `BEGIN;\n${fixture}\nCOMMIT;`));
  const currentRows = dump(current, true);
  ok(bootstrap(current, directory));
  assert.equal(dump(current, true), currentRows, 'Already-current schema must retain all fixture data');
  assert.equal(dump(current), dump(reference));

  for (const setup of ['CREATE TABLE public.users (id integer);', "CREATE TYPE public.property_source_type AS ENUM ('listing');"]) {
    const partial = database();
    ok(sql(partial, setup));
    const before = dump(partial);
    const result = bootstrap(partial, directory);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /partial|unsupported/i);
    assert.equal(dump(partial), before, 'Failed bootstrap must not change partial schema');
  }
  console.log('Verified: 13 tables/14 enums; complete schema dump parity; rollback emptied every table; fresh/current reruns preserved all rows; two partial schemas rejected unchanged; SQLSTATE constraints enforced.');
});
