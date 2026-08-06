import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Pure session token logic — deliberately free of any Next.js import so it can
 * be unit tested without a request context. Cookie plumbing lives next door in
 * session-cookie.ts.
 */

export const SESSION_COOKIE_NAME = "spt_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

const ALGORITHM = "HS256";
const ISSUER = "student-project-tracker";
const AUDIENCE = "spt-web";

const sessionPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["STUDENT", "MENTOR", "ADMIN"]),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

const secretKey = new TextEncoder().encode(env.SESSION_SECRET);

export async function createSessionToken(
  payload: SessionPayload,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + SESSION_MAX_AGE_SECONDS)
    .sign(secretKey);
}

/**
 * Returns null for anything that is not a currently valid token: bad signature,
 * expired, wrong issuer/audience, or a payload shape we no longer recognise.
 * Callers treat null as "not logged in" and never as an error to surface.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const parsed = sessionPayloadSchema.safeParse({
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
