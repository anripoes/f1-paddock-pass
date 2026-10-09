import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL_POOLED is not set. Copy .env.example to .env.local and fill it in.');
}

const pool = new Pool({ connectionString });

export const db = drizzle({ client: pool, schema });
