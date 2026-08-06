import type { ReviewDecision, ReviewState, TaskStatus } from "@prisma/client";

/**
 * Pure domain rules. No database, no request, no framework — which is exactly
 * why these are the easiest and most valuable things in the codebase to test.
 */

export interface TaskCounts {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
}

export const emptyCounts = (): TaskCounts => ({ total: 0, todo: 0, inProgress: 0, done: 0 });

export function countTasks(statuses: readonly TaskStatus[]): TaskCounts {
  const counts = emptyCounts();
  for (const status of statuses) {
    counts.total += 1;
    if (status === "TODO") counts.todo += 1;
    else if (status === "IN_PROGRESS") counts.inProgress += 1;
    else counts.done += 1;
  }
  return counts;
}

/**
 * Progress is derived, never stored. A project with no tasks is 0% rather than
 * NaN or 100% — "nothing planned" is not "everything finished".
 *
 * An in-progress task counts as half a task. That is a judgement call, not a
 * fact: it makes the bar move when a student starts work, which is the whole
 * point of a tracker. Documented here so the next reader does not think it is
 * a rounding bug.
 */
export function calculateProgress(counts: TaskCounts): number {
  if (counts.total === 0) return 0;
  const weighted = counts.done + counts.inProgress * 0.5;
  return Math.round((weighted / counts.total) * 100);
}

/**
 * Which review states a project may move to. Modelling this explicitly means an
 * illegal transition is a 409 with a readable message rather than a row that
 * quietly ends up in a state no screen knows how to render.
 */
const ALLOWED_TRANSITIONS: Record<ReviewState, readonly ReviewState[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["CHANGES_REQUESTED", "APPROVED"],
  CHANGES_REQUESTED: ["SUBMITTED"],
  APPROVED: ["SUBMITTED"], // a re-submission after further work is legitimate
};

export function canTransition(from: ReviewState, to: ReviewState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Maps a mentor's decision onto the resulting review state, or null for a plain comment. */
export function reviewStateForDecision(decision: ReviewDecision): ReviewState | null {
  switch (decision) {
    case "APPROVED":
      return "APPROVED";
    case "CHANGES_REQUESTED":
      return "CHANGES_REQUESTED";
    case "COMMENT":
      return null;
  }
}
