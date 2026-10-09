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
 * Better Auth's session: one row per signed-in browser, found through the token in
 * its httpOnly cookie.
 *
 * @remarks
 * Signing out deletes the row, so the cookie stops working at once, unlike a JWT,
 * which stays valid until it expires. Deleting the user cascades to its sessions.
 */
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

/**
 * Better Auth's account: how a user signs in. Email and password is the
 * `credential` provider, and its `password` column holds the scrypt hash.
 *
 * @remarks
 * Keeping credentials out of `user` lets another provider (Google, GitHub) become
 * one more row for the same user. Deleting the user cascades to its accounts.
 */
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

/**
 * Better Auth's one-time tokens, such as email verification or a password reset.
 * Required by Better Auth even though the current scope doesn't use them.
 */
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

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
