import { endSession } from "@/lib/auth/session-cookie";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/responses";

export const POST = route(async () => {
  await endSession();
  return ok({ signedOut: true });
});
