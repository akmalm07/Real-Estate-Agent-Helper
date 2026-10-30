//import 'dotenv/config'

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(directory, '../.env'),
});


export default {
  schema: path.resolve(directory, './schema.js'),
  out: path.resolve(directory, '../drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
};
