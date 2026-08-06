import type { Role } from "@prisma/client";

export interface Actor {
  id: string;
  role: Role;
}

/** A resource that belongs to exactly one user. */
export interface Owned {
  ownerId: string;
}

export const isMentor = (actor: Actor): boolean => actor.role === "MENTOR" || actor.role === "ADMIN";
export const isAdmin = (actor: Actor): boolean => actor.role === "ADMIN";
export const owns = (actor: Actor, resource: Owned): boolean => resource.ownerId === actor.id;

/** Read access: owners see their own work, mentors and admins see everything. */
export function canViewProject(actor: Actor, project: Owned): boolean {
  return owns(actor, project) || isMentor(actor);
}

/**
 * Write access is deliberately NARROWER than read access. A mentor can review a
 * project but must not be able to edit a student's work — reviewing and
 * rewriting are different powers, and collapsing them would let a mentor
 * silently "fix" the thing they are grading.
 */
export function canEditProject(actor: Actor, project: Owned): boolean {
  return owns(actor, project) || isAdmin(actor);
}

export function canDeleteProject(actor: Actor, project: Owned): boolean {
  return owns(actor, project) || isAdmin(actor);
}

/** Tasks inherit their project's edit permission. */
export function canManageTasks(actor: Actor, project: Owned): boolean {
  return canEditProject(actor, project);
}

/** Only mentors and admins may leave a review, and never on their own project. */
export function canReviewProject(actor: Actor, project: Owned): boolean {
  return isMentor(actor) && !owns(actor, project);
}

/** Only the owner submits a project for review. */
export function canSubmitForReview(actor: Actor, project: Owned): boolean {
  return owns(actor, project);
}
