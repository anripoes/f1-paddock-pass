import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from './schema';

/**
 * Creates an in-memory Postgres with the real migrations applied, so a test runs
 * against the same constraints and indexes that ship to Neon.
 *
 * @remarks
 * PGlite has a single connection: it can't test two concurrent transactions.
 */
export async function createTestDb() {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db;
}
