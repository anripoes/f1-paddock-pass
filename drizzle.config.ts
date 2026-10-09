import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read Next's env files on its own.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Migrations go through the direct (unpooled) connection: Neon's pooler
    // runs in transaction mode, which isn't meant for schema changes.
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
