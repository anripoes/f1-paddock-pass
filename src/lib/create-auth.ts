import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import type { Database } from '../db/index';
import * as schema from '../db/schema';

/**
 * Builds Better Auth on top of a Drizzle database: email and password sign-in,
 * with sessions stored in the `session` table and sent as an httpOnly cookie.
 *
 * @remarks
 * `favoriteConstructorId` is server-owned (`input: false`): sign-up can't set it,
 * only the profile action can, after checking it against the team list.
 * `nextCookies()` stays last so a server action sets every plugin's cookies.
 */
export function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        favoriteConstructorId: { type: 'string', required: false, input: false },
      },
    },
    plugins: [nextCookies()],
  });
}
