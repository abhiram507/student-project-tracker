import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { authenticateUser, registerUser } from "@/lib/services/auth.service";
import { hashPassword } from "@/lib/auth/password";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { ConflictError, RateLimitError, UnauthorizedError } from "@/lib/http/errors";

let db: DeepMockProxy<PrismaClient>;

const VALID_PASSWORD = "a-perfectly-fine-password";

beforeEach(() => {
  db = mockDeep<PrismaClient>();
});

describe("registerUser", () => {
  it("stores a hash, never the plaintext password", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockImplementation((async (args: { data: { passwordHash: string } }) => ({
      id: "u1",
      email: "a@b.com",
      name: "Ada",
      role: "STUDENT",
      createdAt: new Date(),
      passwordHash: args.data.passwordHash,
    })) as never);

    await registerUser(db, { name: "Ada", email: "a@b.com", password: VALID_PASSWORD });

    const call = db.user.create.mock.calls[0]![0] as { data: { passwordHash: string } };
    expect(call.data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(call.data)).not.toContain(VALID_PASSWORD);
  });

  it("always assigns the STUDENT role — privilege cannot be requested at signup", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1", role: "STUDENT" } as never);

    await registerUser(db, {
      name: "Mallory",
      email: "m@b.com",
      password: VALID_PASSWORD,
      // @ts-expect-error — proving that even a smuggled field cannot set the role
      role: "ADMIN",
    });

    const call = db.user.create.mock.calls[0]![0] as { data: { role: string } };
    expect(call.data.role).toBe("STUDENT");
  });

  it("refuses a duplicate email with a 409", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing" } as never);
    await expect(
      registerUser(db, { name: "Ada", email: "a@b.com", password: VALID_PASSWORD }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before touching the database", async () => {
    const limiter = new RateLimiter(1, 60_000);
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1" } as never);

    await registerUser(db, { name: "Ada", email: "a@b.com", password: VALID_PASSWORD }, { limiter, key: "ip" });
    db.user.findUnique.mockClear();

    await expect(
      registerUser(db, { name: "Bob", email: "b@b.com", password: VALID_PASSWORD }, { limiter, key: "ip" }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("authenticateUser", () => {
  async function seedUser() {
    const passwordHash = await hashPassword(VALID_PASSWORD);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "Ada",
      role: "STUDENT",
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  }

  it("returns the user for correct credentials and never leaks the hash", async () => {
    await seedUser();
    const user = await authenticateUser(db, { email: "a@b.com", password: VALID_PASSWORD });
    expect(user.id).toBe("u1");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a wrong password", async () => {
    await seedUser();
    await expect(
      authenticateUser(db, { email: "a@b.com", password: "definitely-not-it" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("gives an identical message for an unknown email and a wrong password", async () => {
    await seedUser();
    const wrongPassword = await authenticateUser(db, { email: "a@b.com", password: "nope-nope-nope" }).catch(
      (e: Error) => e.message,
    );

    db.user.findUnique.mockResolvedValue(null);
    const unknownEmail = await authenticateUser(db, { email: "ghost@b.com", password: VALID_PASSWORD }).catch(
      (e: Error) => e.message,
    );

    expect(unknownEmail).toBe(wrongPassword);
  });

  it("still spends the hashing cost for an unknown email, closing the timing oracle", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const start = performance.now();
    await authenticateUser(db, { email: "ghost@b.com", password: VALID_PASSWORD }).catch(() => undefined);
    // A short-circuit return would land in well under a millisecond.
    expect(performance.now() - start).toBeGreaterThan(5);
  });

  it("blocks once the attempt limit is hit", async () => {
    await seedUser();
    const limiter = new RateLimiter(2, 60_000);
    const attempt = () =>
      authenticateUser(db, { email: "a@b.com", password: "wrong-one" }, { limiter, key: "ip:a@b.com" });

    await expect(attempt()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("clears the counter after a successful sign-in", async () => {
    await seedUser();
    const limiter = new RateLimiter(2, 60_000);
    const key = "ip:a@b.com";

    await authenticateUser(db, { email: "a@b.com", password: "wrong-one" }, { limiter, key }).catch(() => undefined);
    await authenticateUser(db, { email: "a@b.com", password: VALID_PASSWORD }, { limiter, key });

    await expect(
      authenticateUser(db, { email: "a@b.com", password: "wrong-one" }, { limiter, key }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
