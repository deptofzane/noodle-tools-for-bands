import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { inArray } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { accounts, users } from '../../lib/db/schema';
import { createCredentialUser } from '../../lib/db/users';
import {
  AlreadyLinkedError,
  GoogleAccountConflictError,
  LastSignInMethodError,
  findOrCreateGoogleUser,
  getAccountByProvider,
  getUserAccount,
  linkGoogleAccount,
  unlinkGoogleAccount,
} from '../../lib/db/accounts';

after(closeDb);

const EMAILS = [
  'acct-g1@test.local',
  'acct-link@test.local',
  'acct-c2@test.local',
];

async function cleanup() {
  await db.delete(users).where(inArray(users.email, EMAILS));
}

test('accounts: google find-or-create, verified-email auto-link', async () => {
  await cleanup();
  try {
    // Fresh Google login → creates a user + linked account.
    const u1 = await findOrCreateGoogleUser({
      sub: 'ACC_G1',
      email: 'acct-g1@test.local',
      name: 'G1',
    });
    const acc = await getAccountByProvider('google', 'ACC_G1');
    assert.equal(acc?.userId, u1.id, 'account links to the new user');

    // Same sub again → same user, no duplicate.
    const again = await findOrCreateGoogleUser({ sub: 'ACC_G1', email: 'acct-g1@test.local' });
    assert.equal(again.id, u1.id, 'idempotent on sub');

    // Auto-link by verified email: an email/password user who then signs in
    // with Google using the same address links to the existing account.
    const cred = await createCredentialUser({
      email: 'acct-link@test.local',
      password: 'x'.repeat(10),
    });
    const linked = await findOrCreateGoogleUser({
      sub: 'ACC_G2',
      email: 'acct-link@test.local',
      name: 'Linked',
    });
    assert.equal(linked.id, cred.id, 'auto-linked to the credential user');
    assert.equal(
      (await getUserAccount(cred.id, 'google'))?.providerAccountId,
      'ACC_G2',
      'google account attached to the credential user',
    );
  } finally {
    await cleanup();
  }
});

test('accounts: explicit link — reject conflicts, unlink lockout guard', async () => {
  await cleanup();
  try {
    // u1 owns ACC_G1 (google-only, no password).
    const u1 = await findOrCreateGoogleUser({ sub: 'ACC_G1', email: 'acct-g1@test.local' });

    // A separate credential user tries to link u1's Google account → reject.
    const c2 = await createCredentialUser({
      email: 'acct-c2@test.local',
      password: 'y'.repeat(10),
    });
    await assert.rejects(
      () => linkGoogleAccount(c2.id, 'ACC_G1', 'x@x.com'),
      GoogleAccountConflictError,
      'cannot steal another account’s Google identity',
    );

    // Link a fresh Google account (different email is fine).
    await linkGoogleAccount(c2.id, 'ACC_G3', 'someone-else@gmail.com');
    assert.equal(
      (await getUserAccount(c2.id, 'google'))?.providerAccountId,
      'ACC_G3',
      'linked despite mismatched email',
    );
    // Idempotent: linking the same one again is a no-op.
    await linkGoogleAccount(c2.id, 'ACC_G3', 'someone-else@gmail.com');

    // A second, different Google account → rejected (one per user).
    await assert.rejects(
      () => linkGoogleAccount(c2.id, 'ACC_G4', 'other@gmail.com'),
      AlreadyLinkedError,
      'one Google account per user (app-level)',
    );
    // And the DB enforces it too — a raw second insert is rejected with a
    // unique violation (23505; drizzle wraps the pg error, so check .cause).
    await assert.rejects(
      () =>
        db
          .insert(accounts)
          .values({ userId: c2.id, provider: 'google', providerAccountId: 'ACC_G5' }),
      (err: unknown) => {
        const e = err as { code?: string; cause?: { code?: string } };
        return e?.code === '23505' || e?.cause?.code === '23505';
      },
      'db rejects a second Google account for the user',
    );

    // Unlink lockout: u1 has no password → refuse.
    await assert.rejects(
      () => unlinkGoogleAccount(u1.id),
      LastSignInMethodError,
      'cannot unlink the only sign-in method',
    );

    // c2 has a password → unlink succeeds.
    await unlinkGoogleAccount(c2.id);
    assert.equal(await getUserAccount(c2.id, 'google'), null, 'google unlinked');
  } finally {
    await cleanup();
  }
});
