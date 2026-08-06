import { getSession } from "@/lib/auth/session-cookie";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/responses";

/** Returns null rather than 401 — "am I signed in?" is a question, not a failure. */
export const GET = route(async () => {
  const session = await getSession();
  return ok(session ? { id: session.sub, email: session.email, name: session.name, role: session.role } : null);
});
