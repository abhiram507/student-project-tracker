/**
 * Fixed-window rate limiter.
 *
 * TRADEOFF, stated plainly: this counter lives in process memory. On a single
 * instance it is exact; across several serverless instances each holds its own
 * window, so the effective limit is (limit x instances). It raises the cost of
 * online password guessing, which is what it is here for. It is NOT a defence
 * against a distributed attacker, and the moment this app runs on more than one
 * instance the store should move to Redis or Postgres. See docs/DECISIONS.md.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (limit < 1) throw new Error("limit must be at least 1");
    if (windowMs < 1) throw new Error("windowMs must be at least 1");
  }

  /** `now` is injectable so tests do not have to sleep. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    this.evictExpired(now);
    const existing = this.windows.get(key);

    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, retryAfterSeconds: 0 };
  }

  /** Called after a successful login so honest users are not punished for a typo. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private evictExpired(now: number): void {
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }
}

/** 10 attempts per 15 minutes, keyed by client IP + submitted email. */
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

/** 5 new accounts per hour from one IP. */
export const registerLimiter = new RateLimiter(5, 60 * 60 * 1000);

/**
 * Best-effort client identity. Behind Vercel/most proxies `x-forwarded-for` is
 * set by the platform; direct traffic falls back to a constant bucket, which is
 * strictly safer (more sharing) than trusting a spoofable header blindly.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
