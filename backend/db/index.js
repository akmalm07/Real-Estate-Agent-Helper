import { localRuntime } from '../src/testing/local-boundary.js';

let database;
if (localRuntime()) {
  const { createLocalDatabase } = await import('./local-test.js');
  database = await createLocalDatabase(localRuntime());
} else {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  database = drizzle(neon(process.env.DATABASE_URL));
}

export const db = database;
