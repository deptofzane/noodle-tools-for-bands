import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { passwordResetTokens, users } from '../../lib/db/schema';
import {
  createCredentialUser,
  EmailTakenError,
  getUserByEmail,
  setUserPassword,
} from '../../lib/db/users';
import { verifyPassword } from '../../lib/password';
import { createResetToken, consumeResetToken } from '../../lib/db/reset-tokens';

after(closeDb);

const EMAILS = ['cred-a@test.local', 'cred-b@test.local'];

async function cleanup() {
  await db.delete(users).where(inArray(users.email, EMAILS));
}

test('auth: credential user create, verify, dedupe, reset tokens', async () => {
  await cleanup();
  try {
    // Create — stores a hash, email lowercased.
    const user = await createCredentialUser({
      email: 'Cred-A@Test.local', // mixed case → normalized
      password: 'correct horse battery',
      name: 'A',
    });
    assert.equal(user.email, 'cred-a@test.local', 'email normalized');
    assert.ok(user.passwordHash, 'password hashed');

    // Verify: right vs wrong password.
    assert.ok(
      await verifyPassword(user.passwordHash!, 'correct horse battery'),
      'correct password verifies',
    );
    assert.ok(
      !(await verifyPassword(user.passwordHash!, 'wrong')),
      'wrong password rejected',
    );

    // Case-insensitive lookup + duplicate rejection.
    assert.ok(await getUserByEmail('CRED-A@test.local'), 'case-insensitive lookup');
    await assert.rejects(
      () => createCredentialUser({ email: 'cred-a@test.local', password: 'x'.repeat(8) }),
      EmailTakenError,
      'duplicate email rejected',
    );

    // Reset token: single-use.
    const token = await createResetToken(user.id);
    assert.equal(await consumeResetToken(token), user.id, 'token resolves to user');
    assert.equal(await consumeResetToken(token), null, 'token is single-use');

    // Reset token: expiry.
    const token2 = await createResetToken(user.id);
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, user.id));
    assert.equal(await consumeResetToken(token2), null, 'expired token rejected');

    // setUserPassword rotates the hash.
    await setUserPassword(user.id, 'a brand new password');
    const updated = await getUserByEmail('cred-a@test.local');
    assert.ok(
      await verifyPassword(updated!.passwordHash!, 'a brand new password'),
      'new password verifies',
    );
    assert.ok(
      !(await verifyPassword(updated!.passwordHash!, 'correct horse battery')),
      'old password no longer works',
    );
  } finally {
    await cleanup();
  }
});
