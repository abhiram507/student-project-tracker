import { prisma } from "@/lib/db";
import { loginLimiter, clientIp } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session-cookie";
import { jsonBody, route } from "@/lib/http/handler";
import { ok } from "@/lib/http/responses";
import { authenticateUser } from "@/lib/services/auth.service";
import { loginSchema } from "@/lib/validation/schemas";

export const POST = route(async (request) => {
  const input = loginSchema.parse(await jsonBody(request));

  // Keyed by IP *and* email so one attacker cannot lock out a victim's account
  // by hammering it from elsewhere, and one IP cannot spray many accounts.
  const user = await authenticateUser(prisma, input, {
    limiter: loginLimiter,
    key: `${clientIp(request.headers)}:${input.email}`,
  });

  await startSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  return ok(user);
});
