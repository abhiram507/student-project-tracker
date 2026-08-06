import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  canTransition,
  countTasks,
  emptyCounts,
  reviewStateForDecision,
} from "@/lib/services/project-progress";

describe("countTasks", () => {
  it("returns zeroes for no tasks", () => {
    expect(countTasks([])).toEqual(emptyCounts());
  });

  it("buckets each status and keeps the total consistent", () => {
    const counts = countTasks(["TODO", "TODO", "IN_PROGRESS", "DONE", "DONE", "DONE"]);
    expect(counts).toEqual({ total: 6, todo: 2, inProgress: 1, done: 3 });
    expect(counts.todo + counts.inProgress + counts.done).toBe(counts.total);
  });
});

describe("calculateProgress", () => {
  it("reports 0% for a project with no tasks, not NaN or 100%", () => {
    expect(calculateProgress(emptyCounts())).toBe(0);
  });

  it("reports 100% only when every task is done", () => {
    expect(calculateProgress({ total: 4, todo: 0, inProgress: 0, done: 4 })).toBe(100);
    expect(calculateProgress({ total: 4, todo: 0, inProgress: 1, done: 3 })).toBeLessThan(100);
  });

  it("counts an in-progress task as half", () => {
    expect(calculateProgress({ total: 2, todo: 0, inProgress: 2, done: 0 })).toBe(50);
    expect(calculateProgress({ total: 4, todo: 2, inProgress: 2, done: 0 })).toBe(25);
  });

  it("always returns a whole number within 0..100", () => {
    const counts = { total: 3, todo: 1, inProgress: 1, done: 1 };
    const progress = calculateProgress(counts);
    expect(Number.isInteger(progress)).toBe(true);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });
});

describe("canTransition", () => {
  it("allows a draft to be submitted", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
  });

  it("refuses to jump straight from draft to approved", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "CHANGES_REQUESTED")).toBe(false);
  });

  it("lets a mentor approve or bounce back a submission", () => {
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransition("SUBMITTED", "CHANGES_REQUESTED")).toBe(true);
  });

  it("allows re-submission after changes were requested or after approval", () => {
    expect(canTransition("CHANGES_REQUESTED", "SUBMITTED")).toBe(true);
    expect(canTransition("APPROVED", "SUBMITTED")).toBe(true);
  });

  it("refuses a second submission while one is already pending", () => {
    expect(canTransition("SUBMITTED", "SUBMITTED")).toBe(false);
  });
});

describe("reviewStateForDecision", () => {
  it("maps decisions onto states, leaving a plain comment inert", () => {
    expect(reviewStateForDecision("APPROVED")).toBe("APPROVED");
    expect(reviewStateForDecision("CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
    expect(reviewStateForDecision("COMMENT")).toBeNull();
  });
});
