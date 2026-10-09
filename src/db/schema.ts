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

// Better Auth core table (its CLI also generates session, account and
// verification). favoriteConstructorId is our additional field: the
// Jolpica constructorId of the team the user supports.
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

// Synced from Jolpica-F1. id = "<season>-<round>", e.g. "2026-19".
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
    // Makes the sync from the API idempotent.
    uniqueIndex('grand_prix_season_round_uq').on(t.season, t.round),
  ],
);

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
    // Also serves "sections of a Grand Prix": grand_prix_id is its leftmost column.
    uniqueIndex('section_gp_name_uq').on(t.grandPrixId, t.name),
    check('section_price_positive', sql`${t.priceCents} > 0`),
    check('section_layout_positive', sql`${t.rows} > 0 AND ${t.seatsPerRow} > 0`),
  ],
);

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
    // Also serves "seats of a section": section_id is its leftmost column.
    uniqueIndex('seat_section_row_number_uq').on(t.sectionId, t.row, t.number),
  ],
);

export const ticketStatus = pgEnum('ticket_status', ['held', 'confirmed', 'cancelled', 'expired']);

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
    // Seats held together in one request share a hold group.
    holdGroup: uuid('hold_group').notNull(),
    status: ticketStatus('status').notNull().default('held'),
    // Copied from the section when the ticket is created, so a later
    // price change doesn't rewrite what the user paid.
    priceCents: integer('price_cents').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    // The concurrent case: at most one active ticket per seat, enforced by
    // the database. Two requests for the same seat → the second gets 23505.
    // It also serves the availability lookup (one index scan per seat).
    uniqueIndex('ticket_one_active_per_seat_uq')
      .on(t.seatId)
      .where(sql`${t.status} IN ('held', 'confirmed')`),
    // "My tickets", newest first.
    index('ticket_user_created_idx').on(t.userId, t.createdAt.desc()),
    // A hold without an expiry would block a seat forever.
    check('ticket_hold_has_expiry', sql`${t.status} <> 'held' OR ${t.expiresAt} IS NOT NULL`),
  ],
);
