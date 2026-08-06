import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp } from "@/lib/auth/rate-limit";

describe("RateLimiter", () => {
  it("rejects a nonsensical configuration at construction", () => {
    expect(() => new RateLimiter(0, 1000)).toThrow();
    expect(() => new RateLimiter(5, 0)).toThrow();
  });

  it("allows exactly `limit` attempts then blocks", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 1).allowed).toBe(true);
    expect(limiter.check("ip", 2).allowed).toBe(true);
    expect(limiter.check("ip", 3).allowed).toBe(false);
  });

  it("counts down remaining attempts", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("ip", 0).remaining).toBe(2);
    expect(limiter.check("ip", 0).remaining).toBe(1);
    expect(limiter.check("ip", 0).remaining).toBe(0);
  });

  it("reports a positive retry-after once blocked", () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.check("ip", 0);
    const blocked = limiter.check("ip", 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("opens a fresh window once the old one expires", () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 500).allowed).toBe(false);
    expect(limiter.check("ip", 1_000).allowed).toBe(true);
  });

  it("keeps buckets independent", () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.check("a", 0);
    expect(limiter.check("a", 0).allowed).toBe(false);
    expect(limiter.check("b", 0).allowed).toBe(true);
  });

  it("forgives a user after a successful login", () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.check("ip:user", 0);
    limiter.check("ip:user", 0);
    expect(limiter.check("ip:user", 0).allowed).toBe(false);
    limiter.reset("ip:user");
    expect(limiter.check("ip:user", 0).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("does not return an empty string for a malformed header", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " , 1.2.3.4" }))).not.toBe("");
  });
});
