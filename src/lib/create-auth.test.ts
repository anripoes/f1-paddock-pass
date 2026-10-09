import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../db/index';
import { account, session, user } from '../db/schema';
import { createTestDb } from '../db/test-db';
import { createAuth } from './create-auth';

const credentials = { name: 'Ana', email: 'ana@example.com', password: 'correct-horse-battery' };

function requestWithCookies(responseHeaders: Headers) {
  const cookie = responseHeaders
    .getSetCookie()
    .map((setCookie) => setCookie.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

describe('createAuth', () => {
  let db: Database;
  let auth: ReturnType<typeof createAuth>;

  beforeEach(async () => {
    db = await createTestDb();
    auth = createAuth(db);
  });

  it('signs up a user with a hashed password and a database session', async () => {
    await auth.api.signUpEmail({ body: credentials });

    const [created] = await db.select().from(user);
    const [credential] = await db.select().from(account).where(eq(account.userId, created.id));
    expect(created.email).toBe(credentials.email);
    expect(credential.providerId).toBe('credential');
    expect(credential.password).toBeTruthy();
    expect(credential.password).not.toBe(credentials.password);
    expect(await db.$count(session, eq(session.userId, created.id))).toBe(1);
  });

  it('reads the session from its cookie until the user signs out', async () => {
    const { headers } = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const request = requestWithCookies(headers);

    const current = await auth.api.getSession({ headers: request });
    expect(current?.user.email).toBe(credentials.email);

    await auth.api.signOut({ headers: request });
    expect(await auth.api.getSession({ headers: request })).toBeNull();
    expect(await db.$count(session)).toBe(0);
  });

  it('rejects a wrong password with 401', async () => {
    await auth.api.signUpEmail({ body: credentials });

    await expect(
      auth.api.signInEmail({ body: { email: credentials.email, password: 'wrong-password' } }),
    ).rejects.toMatchObject({ statusCode: 401, body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
  });
});
