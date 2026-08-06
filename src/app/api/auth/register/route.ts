import { prisma } from "@/lib/db";
import { registerLimiter, clientIp } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session-cookie";
import { jsonBody, route } from "@/lib/http/handler";
import { created } from "@/lib/http/responses";
import { registerUser } from "@/lib/services/auth.service";
import { registerSchema } from "@/lib/validation/schemas";

export const POST = route(async (request) => {
  const input = registerSchema.parse(await jsonBody(request));

  const user = await registerUser(prisma, input, {
    limiter: registerLimiter,
    key: clientIp(request.headers),
  });

  await startSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  return created(user);
});
