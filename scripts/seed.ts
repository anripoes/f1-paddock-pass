import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '../src/db/schema';
import { parseCalendar, seedGrandPrix } from '../src/db/seed';

const CALENDAR_URL = 'https://api.jolpi.ca/ergast/f1/2026.json?limit=100';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }

  const response = await fetch(CALENDAR_URL);
  if (!response.ok) {
    throw new Error(`Jolpica-F1 answered ${response.status} ${response.statusText}. Try again in a minute.`);
  }
  const races = parseCalendar(await response.json());

  const pool = new Pool({ connectionString });
  try {
    const db = drizzle({ client: pool, schema });
    await seedGrandPrix(db, races);

    const [grandPrix, sections, seats] = await Promise.all([
      db.$count(schema.grandPrix),
      db.$count(schema.section),
      db.$count(schema.seat),
    ]);
    console.log(`Seeded ${grandPrix} Grand Prix, ${sections} sections, ${seats} seats`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
