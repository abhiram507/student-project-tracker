import { prisma } from "@/lib/db";
import { ok } from "@/lib/http/responses";
import { route } from "@/lib/http/handler";

/** Liveness + database reachability, for uptime checks and deploy verification. */
export const GET = route(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return ok({ status: "ok", time: new Date().toISOString() });
});
