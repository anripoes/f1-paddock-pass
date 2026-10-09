import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Better Auth's user, plus `favoriteConstructorId`: the Jolpica `constructorId`
 * of the team the user supports.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  favoriteConstructorId: text('favorite_constructor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A race synced from Jolpica-F1, with `id` = `"<season>-<round>"` (e.g. `"2026-19"`).
 *
 * @remarks
 * The unique `(season, round)` index makes the sync idempotent.
 */
export const grandPrix = pgTable(
  'grand_prix',
  {
    id: text('id').primaryKey(),
    season: smallint('season').notNull(),
    round: smallint('round').notNull(),
    name: text('name').notNull(),
    circuitName: text('circuit_name').notNull(),
    country: text('country').notNull(),
    raceDate: date('race_date').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('grand_prix_season_round_uq').on(t.season, t.round),
  ],
);

/**
 * A grandstand of a Grand Prix: its price in integer cents and its seat layout.
 *
 * @remarks
 * The unique `(grand_prix_id, name)` index also serves "sections of a Grand Prix",
 * because `grand_prix_id` is its leftmost column.
 */
export const section = pgTable(
  'section',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    grandPrixId: text('grand_prix_id')
      .notNull()
      .references(() => grandPrix.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull(),
    rows: smallint('rows').notNull(),
    seatsPerRow: smallint('seats_per_row').notNull(),
  },
  (t) => [
    uniqueIndex('section_gp_name_uq').on(t.grandPrixId, t.name),
    check('section_price_positive', sql`${t.priceCents} > 0`),
    check('section_layout_positive', sql`${t.rows} > 0 AND ${t.seatsPerRow} > 0`),
  ],
);

/**
 * A seat in a grandstand, identified by its row and number.
 *
 * @remarks
 * The unique `(section_id, row, number)` index also serves "seats of a section",
 * because `section_id` is its leftmost column.
 */
export const seat = pgTable(
  'seat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => section.id, { onDelete: 'cascade' }),
    row: smallint('row').notNull(),
    number: smallint('number').notNull(),
  },
  (t) => [
    uniqueIndex('seat_section_row_number_uq').on(t.sectionId, t.row, t.number),
  ],
);

/**
 * A ticket's lifecycle: `held` becomes `confirmed` or `expired`; `cancelled` frees the seat.
 */
export const ticketStatus = pgEnum('ticket_status', ['held', 'confirmed', 'cancelled', 'expired']);

/**
 * One seat held or bought by one user.
 *
 * @remarks
 * - `ticket_one_active_per_seat_uq` is the concurrent case: at most one `held` or
 *   `confirmed` ticket per seat, enforced by the database, so a second hold fails
 *   with `23505`. It also serves the availability lookup.
 * - `ticket_user_created_idx` serves "My tickets", newest first.
 * - `ticket_hold_has_expiry` rejects a hold without an expiry, which would block
 *   a seat forever.
 * - Seats held in one request share a `holdGroup`. `priceCents` is copied from the
 *   section, so a later price change doesn't rewrite what the user paid.
 */
export const ticket = pgTable(
  'ticket',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seatId: uuid('seat_id')
      .notNull()
      .references(() => seat.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    holdGroup: uuid('hold_group').notNull(),
    status: ticketStatus('status').notNull().default('held'),
    priceCents: integer('price_cents').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ticket_one_active_per_seat_uq')
      .on(t.seatId)
      .where(sql`${t.status} IN ('held', 'confirmed')`),
    index('ticket_user_created_idx').on(t.userId, t.createdAt.desc()),
    check('ticket_hold_has_expiry', sql`${t.status} <> 'held' OR ${t.expiresAt} IS NOT NULL`),
  ],
);
