import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from './schema';

// The app goes through Neon's pooler (built for many short serverless
// connections); DATABASE_URL, the direct connection, is the fallback.
const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL_POOLED is not set. Copy .env.example to .env.local and fill it in.');
}

// The WebSocket Pool (not neon-http) because holding seats needs an
// interactive transaction, and the HTTP driver doesn't support them.
const pool = new Pool({ connectionString });

export const db = drizzle({ client: pool, schema });
