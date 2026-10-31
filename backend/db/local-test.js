import { localRuntime } from '../src/testing/local-boundary.js';

export async function createLocalDatabase(config) {
  if (!config || config !== localRuntime()) throw new Error('Trusted local composition required');
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pool = new pg.Pool({
    host: config.socketDirectory,
    port: 5432,
    user: 'postgres',
    database: config.database,
    password: '',
    ssl: false,
    max: 2,
    connectionTimeoutMillis: 3000,
  });
  config.handles.pool = pool;
  return drizzle(pool);
}
