import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("hashPassword", () => {
  it("produces an argon2id hash, never the plaintext", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("correct horse battery");
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("same password 1"), hashPassword("same password 1")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same password 1")).toBe(true);
    expect(await verifyPassword(b, "same password 1")).toBe(true);
  });

  it("rejects a password below the minimum length", async () => {
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(/at least/);
  });

  it("rejects an unbounded password, which would be a DoS on a memory-hard KDF", async () => {
    await expect(hashPassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).rejects.toThrow(/at most/);
  });

  it("accepts a password exactly at the minimum length", async () => {
    await expect(hashPassword("a".repeat(MIN_PASSWORD_LENGTH))).resolves.toMatch(/^\$argon2id\$/);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects a near miss", async () => {
    const hash = await hashPassword("Tr0ub4dor&3xyz");
    expect(await verifyPassword(hash, "Tr0ub4dor&3xyz")).toBe(true);
    expect(await verifyPassword(hash, "Tr0ub4dor&3xy")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("is case sensitive", async () => {
    const hash = await hashPassword("CaseSensitive1");
    expect(await verifyPassword(hash, "casesensitive1")).toBe(false);
  });

  it("returns false rather than throwing on a corrupted hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything at all")).toBe(false);
    expect(await verifyPassword("", "anything at all")).toBe(false);
    expect(await verifyPassword("$argon2id$garbage", "anything at all")).toBe(false);
  });

  it("handles unicode passwords without mangling them", async () => {
    const hash = await hashPassword("पासवर्ड-सुरक्षित-123");
    expect(await verifyPassword(hash, "पासवर्ड-सुरक्षित-123")).toBe(true);
    expect(await verifyPassword(hash, "पासवर्ड-सुरक्षित-124")).toBe(false);
  });
});
