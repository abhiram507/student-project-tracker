import { prisma } from "@/lib/db";
import { authedRoute } from "@/lib/http/handler";
import { ok } from "@/lib/http/responses";
import { submitForReview } from "@/lib/services/project.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A state transition, not a field edit — hence its own endpoint rather than
 * PATCH { reviewState }. The client cannot name the target state, so it cannot
 * mark its own project APPROVED.
 */
export const POST = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  return ok(await submitForReview(prisma, actor, id));
});
