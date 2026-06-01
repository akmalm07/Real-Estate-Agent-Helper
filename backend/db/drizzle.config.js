import 'dotenv/config'

/*import dotenv from 'dotenv';

dotenv.config({
  path: '../.env',
});*/


export default {
  schema: './schema.js',
  out: '../drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
};