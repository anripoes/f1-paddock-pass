import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from './index';
import { grandPrix, seat, section } from './schema';

type GrandPrixRow = typeof grandPrix.$inferInsert;

const jolpicaCalendar = z.object({
  MRData: z.object({
    RaceTable: z.object({
      Races: z.array(
        z.object({
          season: z.coerce.number().int().positive(),
          round: z.coerce.number().int().positive(),
          raceName: z.string().min(1),
          date: z.iso.date(),
          Circuit: z.object({
            circuitName: z.string().min(1),
            Location: z.object({ country: z.string().min(1) }),
          }),
        }),
      ),
    }),
  }),
});

const SECTIONS = [
  { name: 'Main Grandstand', priceCents: 45_000, rows: 10, seatsPerRow: 20 },
  { name: 'Turn 1', priceCents: 32_000, rows: 8, seatsPerRow: 20 },
  { name: 'Final Corner', priceCents: 28_000, rows: 8, seatsPerRow: 16 },
  { name: 'Back Straight', priceCents: 22_000, rows: 8, seatsPerRow: 16 },
];

/**
 * Validates a Jolpica-F1 season response and maps each race to a `grand_prix` row.
 *
 * @throws {@link ZodError} If the response doesn't have the expected shape, for
 * example when the API answers with an error instead of the calendar.
 */
export function parseCalendar(json: unknown): GrandPrixRow[] {
  return jolpicaCalendar.parse(json).MRData.RaceTable.Races.map((race) => ({
    id: `${race.season}-${race.round}`,
    season: race.season,
    round: race.round,
    name: race.raceName,
    circuitName: race.Circuit.circuitName,
    country: race.Circuit.Location.country,
    raceDate: race.date,
  }));
}

/**
 * Upserts the Grand Prix, then gives each one 4 sections and their seats.
 *
 * @remarks
 * Safe to run any number of times: every insert resolves its conflict on a unique
 * index instead of deleting first, so seats that already have tickets survive.
 */
export async function seedGrandPrix(db: Database, races: GrandPrixRow[]): Promise<void> {
  if (races.length === 0) return;

  await db
    .insert(grandPrix)
    .values(races)
    .onConflictDoUpdate({
      target: [grandPrix.season, grandPrix.round],
      set: {
        name: sql`excluded.name`,
        circuitName: sql`excluded.circuit_name`,
        country: sql`excluded.country`,
        raceDate: sql`excluded.race_date`,
        syncedAt: sql`now()`,
      },
    });

  for (const race of races) {
    const sections = await db
      .insert(section)
      .values(SECTIONS.map((template) => ({ ...template, grandPrixId: race.id })))
      .onConflictDoUpdate({
        target: [section.grandPrixId, section.name],
        set: { priceCents: sql`excluded.price_cents` },
      })
      .returning();

    await db
      .insert(seat)
      .values(sections.flatMap(seatsOf))
      .onConflictDoNothing({ target: [seat.sectionId, seat.row, seat.number] });
  }
}

function seatsOf({ id, rows, seatsPerRow }: { id: string; rows: number; seatsPerRow: number }) {
  return Array.from({ length: rows * seatsPerRow }, (_, index) => ({
    sectionId: id,
    row: Math.floor(index / seatsPerRow) + 1,
    number: (index % seatsPerRow) + 1,
  }));
}
