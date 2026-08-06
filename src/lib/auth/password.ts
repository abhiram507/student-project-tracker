import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters. These follow the OWASP Password Storage Cheat Sheet
 * recommendation of 19 MiB memory, 2 iterations, 1 degree of parallelism —
 * the configuration that balances GPU resistance against serverless cold-start
 * budgets. See docs/THREAT_MODEL.md.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (plaintext.length > MAX_PASSWORD_LENGTH) {
    // Unbounded input into a memory-hard KDF is a denial-of-service vector.
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Never throws on a malformed hash — a corrupted row should read as "wrong
 * password", not as a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
