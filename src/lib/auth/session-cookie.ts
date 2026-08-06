import { cookies } from "next/headers";
import { isProduction } from "@/lib/env";
import type { Actor } from "@/lib/auth/rbac";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session";

/** Next.js-bound cookie plumbing. Kept apart from session.ts so the crypto is testable. */

export async function startSession(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true, // not readable from JavaScript, so XSS cannot exfiltrate it
    sameSite: "lax", // blocks cross-site form POSTs, our CSRF defence
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** The authenticated caller, reduced to the shape the permission rules need. */
export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  return session ? { id: session.sub, role: session.role } : null;
}
