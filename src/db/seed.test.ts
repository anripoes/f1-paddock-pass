import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { Database } from './index';
import { grandPrix, seat, section, ticket, user } from './schema';
import { parseCalendar, seedGrandPrix } from './seed';
import { createTestDb } from './test-db';

const calendar = {
  MRData: {
    series: 'f1',
    total: '2',
    RaceTable: {
      season: '2026',
      Races: [
        {
          season: '2026',
          round: '1',
          raceName: 'Australian Grand Prix',
          Circuit: {
            circuitId: 'albert_park',
            circuitName: 'Albert Park Grand Prix Circuit',
            Location: { lat: '-37.8497', long: '144.968', locality: 'Melbourne', country: 'Australia' },
          },
          date: '2026-03-08',
          time: '04:00:00Z',
        },
        {
          season: '2026',
          round: '2',
          raceName: 'Chinese Grand Prix',
          Circuit: {
            circuitId: 'shanghai',
            circuitName: 'Shanghai International Circuit',
            Location: { lat: '31.3389', long: '121.22', locality: 'Shanghai', country: 'China' },
          },
          date: '2026-03-15',
          time: '07:00:00Z',
        },
      ],
    },
  },
};

async function totals(db: Database) {
  return {
    grandPrix: await db.$count(grandPrix),
    sections: await db.$count(section),
    seats: await db.$count(seat),
  };
}

describe('parseCalendar', () => {
  it('maps a Jolpica race to a grand_prix row', () => {
    expect(parseCalendar(calendar)[0]).toEqual({
      id: '2026-1',
      season: 2026,
      round: 1,
      name: 'Australian Grand Prix',
      circuitName: 'Albert Park Grand Prix Circuit',
      country: 'Australia',
      raceDate: '2026-03-08',
    });
  });

  it('rejects a response without MRData', () => {
    expect(() => parseCalendar({ error: 'rate limited' })).toThrow(ZodError);
  });
});

describe('seedGrandPrix', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('creates 4 sections and 616 seats per Grand Prix', async () => {
    await seedGrandPrix(db, parseCalendar(calendar));

    expect(await totals(db)).toEqual({ grandPrix: 2, sections: 8, seats: 1232 });
  });

  it('is idempotent and keeps existing tickets', async () => {
    await seedGrandPrix(db, parseCalendar(calendar));
    const [firstSeat] = await db.select().from(seat).limit(1);
    await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@example.com' });
    await db.insert(ticket).values({
      seatId: firstSeat.id,
      userId: 'ana',
      holdGroup: '00000000-0000-0000-0000-000000000001',
      status: 'confirmed',
      priceCents: 45000,
    });

    await seedGrandPrix(db, parseCalendar(calendar));

    expect(await totals(db)).toEqual({ grandPrix: 2, sections: 8, seats: 1232 });
    expect(await db.$count(ticket)).toBe(1);
  });
});
