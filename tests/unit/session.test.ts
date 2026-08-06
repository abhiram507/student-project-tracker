import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";

const payload: SessionPayload = {
  sub: "user-123",
  email: "student@example.com",
  name: "Test Student",
  role: "STUDENT",
};

describe("session tokens", () => {
  it("round-trips a payload", async () => {
    const token = await createSessionToken(payload);
    await expect(verifySessionToken(token)).resolves.toEqual(payload);
  });

  it("produces a three-part JWS", async () => {
    const token = await createSessionToken(payload);
    expect(token.split(".")).toHaveLength(3);
  });

  it("does not put the role beyond tampering — a modified token fails verification", async () => {
    const token = await createSessionToken(payload);
    const [header, body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString());
    decoded.role = "ADMIN";
    const forgedBody = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const forged = `${header}.${forgedBody}.${signature}`;

    await expect(verifySessionToken(forged)).resolves.toBeNull();
  });

  it("rejects a token whose signature has been swapped", async () => {
    const token = await createSessionToken(payload);
    const [header, body] = token.split(".");
    await expect(verifySessionToken(`${header}.${body}.AAAAAAAAAAAAAAAAAAAAAA`)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const longAgo = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SECONDS - 60;
    const token = await createSessionToken(payload, longAgo);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("accepts a token issued just inside the window", async () => {
    const recent = Math.floor(Date.now() / 1000) - (SESSION_MAX_AGE_SECONDS - 60);
    const token = await createSessionToken(payload, recent);
    await expect(verifySessionToken(token)).resolves.toEqual(payload);
  });

  it("rejects garbage and the empty string without throwing", async () => {
    await expect(verifySessionToken("")).resolves.toBeNull();
    await expect(verifySessionToken("not.a.token")).resolves.toBeNull();
    await expect(verifySessionToken("a.b")).resolves.toBeNull();
  });

  it("rejects an unsigned `alg: none` token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "user-123", role: "ADMIN" })).toString("base64url");
    await expect(verifySessionToken(`${header}.${body}.`)).resolves.toBeNull();
  });

  it("carries the role through so RBAC can read it", async () => {
    const mentorToken = await createSessionToken({ ...payload, role: "MENTOR" });
    const verified = await verifySessionToken(mentorToken);
    expect(verified?.role).toBe("MENTOR");
  });
});
