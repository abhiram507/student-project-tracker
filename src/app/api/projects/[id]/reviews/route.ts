import { prisma } from "@/lib/db";
import { authedRoute, jsonBody } from "@/lib/http/handler";
import { created, ok } from "@/lib/http/responses";
import { createReview, listReviews } from "@/lib/services/review.service";
import { createReviewSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  return ok(await listReviews(prisma, actor, id));
});

export const POST = authedRoute<Ctx>(async (request, { params }, actor) => {
  const { id } = await params;
  const input = createReviewSchema.parse(await jsonBody(request));
  return created(await createReview(prisma, actor, id, input));
});
