import { vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

/**
 * Harness for exercising the real route handlers.
 *
 * Route handlers are the layer the service tests deliberately do not cover:
 * Zod parsing of a real Request body, the auth wrapper, error translation into
 * status codes, and the session cookie round trip. Everything below the
 * handler is real code; only Prisma and Next's cookie store are substituted.
 */

interface StoredCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

class CookieStore {
  private readonly jar = new Map<string, StoredCookie>();

  get(name: string): StoredCookie | undefined {
    return this.jar.get(name);
  }

  set(name: string, value: string, options?: Record<string, unknown>): void {
    this.jar.set(name, { name, value, options });
  }

  delete(name: string): void {
    this.jar.delete(name);
  }

  clear(): void {
    this.jar.clear();
  }

  /** Lets a test inspect the flags the app set, not just the value. */
  optionsFor(name: string): Record<string, unknown> | undefined {
    return this.jar.get(name)?.options;
  }
}

export const cookieStore = new CookieStore();
export const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

export function installMocks(): void {
  vi.mock("next/headers", () => ({
    cookies: async () => cookieStore,
  }));

  vi.mock("@/lib/db", () => ({
    get prisma() {
      return db;
    },
  }));
}

/** Builds a Request the way Next would hand one to a route handler. */
export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function getRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, { method: "GET", headers });
}

/** Route context for a dynamic segment, matching Next 15's Promise-wrapped params. */
export function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export interface ErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}
