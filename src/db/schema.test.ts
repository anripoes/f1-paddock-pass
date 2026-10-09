import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from './schema';

// Runs the real migrations against an in-memory Postgres (PGlite), so the
// constraints tested here are the ones that ship. PGlite has a single
// connection: true concurrency is tested against a Neon branch instead.

type Db = PgliteDatabase<typeof schema>;

async function setup(): Promise<{ db: Db; seatIds: string[] }> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: 'drizzle' });

  await db.insert(schema.user).values([
    { id: 'ana', name: 'Ana', email: 'ana@example.com' },
    { id: 'luis', name: 'Luis', email: 'luis@example.com' },
  ]);
  await db.insert(schema.grandPrix).values({
    id: '2026-19',
    season: 2026,
    round: 19,
    name: 'United States Grand Prix',
    circuitName: 'Circuit of the Americas',
    country: 'USA',
    raceDate: '2026-10-18',
  });
  const [main] = await db
    .insert(schema.section)
    .values({ grandPrixId: '2026-19', name: 'Main Grandstand', priceCents: 45000, rows: 1, seatsPerRow: 2 })
    .returning();
  const seats = await db
    .insert(schema.seat)
    .values([
      { sectionId: main.id, row: 1, number: 1 },
      { sectionId: main.id, row: 1, number: 2 },
    ])
    .returning();

  return { db, seatIds: seats.map((s) => s.id) };
}

const holdGroup = '00000000-0000-0000-0000-000000000001';

function hold(db: Db, userId: string, seatId: string, expiresAt = new Date(Date.now() + 10 * 60_000)) {
  return db.insert(schema.ticket).values({ seatId, userId, holdGroup, priceCents: 45000, expiresAt });
}

// Drizzle wraps driver errors; the Postgres error code lives on `cause`.
async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? 'unknown';
  }
}

describe('ticket constraints', () => {
  let db: Db;
  let seatIds: string[];

  beforeEach(async () => {
    ({ db, seatIds } = await setup());
  });

  it('rejects a second active ticket for the same seat (23505)', async () => {
    await hold(db, 'ana', seatIds[0]);
    expect(await pgErrorCode(hold(db, 'luis', seatIds[0]))).toBe('23505');
  });

  it('frees the seat once the previous ticket is no longer active', async () => {
    await hold(db, 'ana', seatIds[0]);
    await db.execute(sql`UPDATE ticket SET status = 'cancelled' WHERE user_id = 'ana'`);
    expect(await pgErrorCode(hold(db, 'luis', seatIds[0]))).toBeNull();
  });

  it('rejects a hold without an expiry (23514)', async () => {
    const insert = db.insert(schema.ticket).values({
      seatId: seatIds[1],
      userId: 'ana',
      holdGroup,
      priceCents: 45000,
    });
    expect(await pgErrorCode(insert)).toBe('23514');
  });
});
