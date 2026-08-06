import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import { canReviewProject, canViewProject } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError, notFoundOrForbidden } from "@/lib/http/errors";
import { reviewStateForDecision } from "@/lib/services/project-progress";
import type { CreateReviewInput } from "@/lib/validation/schemas";

export interface ReviewView {
  id: string;
  body: string;
  decision: "COMMENT" | "CHANGES_REQUESTED" | "APPROVED";
  createdAt: Date;
  author: { id: string; name: string; role: "STUDENT" | "MENTOR" | "ADMIN" };
}

const authorSelect = { select: { id: true, name: true, role: true } } as const;

export async function listReviews(
  db: PrismaClient,
  actor: Actor,
  projectId: string,
): Promise<ReviewView[]> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new NotFoundError("Project");
  if (!canViewProject(actor, project)) throw notFoundOrForbidden(false, "Project");

  return db.review.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { author: authorSelect },
  }) as Promise<ReviewView[]>;
}

/**
 * Writing a review and moving the project's review state must both happen or
 * neither: a transaction, not two awaits. Otherwise a failure between them
 * leaves a project marked APPROVED with no review explaining why.
 */
export async function createReview(
  db: PrismaClient,
  actor: Actor,
  projectId: string,
  input: CreateReviewInput,
): Promise<ReviewView> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new NotFoundError("Project");

  if (!canReviewProject(actor, project)) {
    if (!canViewProject(actor, project)) throw new NotFoundError("Project");
    throw new ForbiddenError(
      project.ownerId === actor.id
        ? "You cannot review your own project."
        : "Only mentors can review projects.",
    );
  }

  const nextState = reviewStateForDecision(input.decision);

  return db.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: { body: input.body, decision: input.decision, projectId, authorId: actor.id },
      include: { author: authorSelect },
    });

    if (nextState) {
      await tx.project.update({ where: { id: projectId }, data: { reviewState: nextState } });
    }

    return review as ReviewView;
  });
}
