import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (argon2id, the recommended variant). @node-rs/argon2 ships
 * prebuilt native binaries — no node-gyp/compile step at deploy time.
 *
 * Node-only: never import this from the Edge-safe `auth.config.ts` graph.
 */

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash, etc. — treat as a non-match rather than throwing.
    return false;
  }
}
