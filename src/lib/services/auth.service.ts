import type { PrismaClient, User } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ConflictError, RateLimitError, UnauthorizedError } from "@/lib/http/errors";
import type { RateLimiter } from "@/lib/auth/rate-limit";
import type { LoginInput, RegisterInput } from "@/lib/validation/schemas";

/**
 * Services receive their PrismaClient rather than importing the singleton, so
 * tests can pass a mock and run in milliseconds with no database at all.
 */

export type PublicUser = Pick<User, "id" | "email" | "name" | "role" | "createdAt">;

const publicFields = { id: true, email: true, name: true, role: true, createdAt: true } as const;

/**
 * A dummy hash of a random password. On a login attempt for an address that does
 * not exist we verify against this instead of returning early, so the response
 * time of "no such user" matches "wrong password". Without it the endpoint is a
 * timing oracle for which emails are registered.
 */
const DECOY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZXg$FN4Zk8bkkTLDNfEwMPtQZlBnUC6qHMD3cD1JQ3lF8kI";

export async function registerUser(
  db: PrismaClient,
  input: RegisterInput,
  limiter?: { limiter: RateLimiter; key: string },
): Promise<PublicUser> {
  if (limiter) {
    const result = limiter.limiter.check(limiter.key);
    if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
  }

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    // Registration cannot avoid revealing that an address is taken — the user
    // needs to know. We keep the message neutral and rate limit the endpoint.
    throw new ConflictError("An account with that email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  return db.user.create({
    data: { email: input.email, name: input.name, passwordHash, role: "STUDENT" },
    select: publicFields,
  });
}

export async function authenticateUser(
  db: PrismaClient,
  input: LoginInput,
  limiter?: { limiter: RateLimiter; key: string },
): Promise<PublicUser> {
  if (limiter) {
    const result = limiter.limiter.check(limiter.key);
    if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
  }

  const user = await db.user.findUnique({ where: { email: input.email } });

  // Always spend the argon2 verification cost, present or not.
  const passwordMatches = await verifyPassword(user?.passwordHash ?? DECOY_HASH, input.password);

  if (!user || !passwordMatches) {
    // One message for both failure modes: no confirmation of which one it was.
    throw new UnauthorizedError("Email or password is incorrect.");
  }

  if (limiter) limiter.limiter.reset(limiter.key);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}
