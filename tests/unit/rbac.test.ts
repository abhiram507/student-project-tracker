import { describe, expect, it } from "vitest";
import {
  canDeleteProject,
  canEditProject,
  canManageTasks,
  canReviewProject,
  canSubmitForReview,
  canViewProject,
  isAdmin,
  isMentor,
  owns,
  type Actor,
} from "@/lib/auth/rbac";

const student: Actor = { id: "u-student", role: "STUDENT" };
const otherStudent: Actor = { id: "u-other", role: "STUDENT" };
const mentor: Actor = { id: "u-mentor", role: "MENTOR" };
const admin: Actor = { id: "u-admin", role: "ADMIN" };

const ownedByStudent = { ownerId: "u-student" };
const ownedByMentor = { ownerId: "u-mentor" };

describe("role predicates", () => {
  it("treats admins as mentors but not the reverse", () => {
    expect(isMentor(admin)).toBe(true);
    expect(isMentor(mentor)).toBe(true);
    expect(isMentor(student)).toBe(false);
    expect(isAdmin(mentor)).toBe(false);
    expect(isAdmin(admin)).toBe(true);
  });

  it("matches ownership by id", () => {
    expect(owns(student, ownedByStudent)).toBe(true);
    expect(owns(otherStudent, ownedByStudent)).toBe(false);
  });
});

describe("canViewProject", () => {
  it("lets an owner and any mentor read, but not an unrelated student", () => {
    expect(canViewProject(student, ownedByStudent)).toBe(true);
    expect(canViewProject(mentor, ownedByStudent)).toBe(true);
    expect(canViewProject(admin, ownedByStudent)).toBe(true);
    expect(canViewProject(otherStudent, ownedByStudent)).toBe(false);
  });
});

describe("canEditProject", () => {
  it("is narrower than read access: a mentor may review but not rewrite", () => {
    expect(canViewProject(mentor, ownedByStudent)).toBe(true);
    expect(canEditProject(mentor, ownedByStudent)).toBe(false);
  });

  it("allows the owner and an admin", () => {
    expect(canEditProject(student, ownedByStudent)).toBe(true);
    expect(canEditProject(admin, ownedByStudent)).toBe(true);
  });

  it("never allows an unrelated student", () => {
    expect(canEditProject(otherStudent, ownedByStudent)).toBe(false);
    expect(canDeleteProject(otherStudent, ownedByStudent)).toBe(false);
  });
});

describe("canManageTasks", () => {
  it("mirrors project edit permission exactly", () => {
    for (const actor of [student, otherStudent, mentor, admin]) {
      expect(canManageTasks(actor, ownedByStudent)).toBe(canEditProject(actor, ownedByStudent));
    }
  });
});

describe("canReviewProject", () => {
  it("allows mentors and admins on other people's projects", () => {
    expect(canReviewProject(mentor, ownedByStudent)).toBe(true);
    expect(canReviewProject(admin, ownedByStudent)).toBe(true);
  });

  it("refuses self-review even for a mentor", () => {
    expect(canReviewProject(mentor, ownedByMentor)).toBe(false);
  });

  it("refuses students entirely", () => {
    expect(canReviewProject(student, ownedByStudent)).toBe(false);
    expect(canReviewProject(otherStudent, ownedByStudent)).toBe(false);
  });
});

describe("canSubmitForReview", () => {
  it("is the owner's action alone — not a mentor's, not an admin's", () => {
    expect(canSubmitForReview(student, ownedByStudent)).toBe(true);
    expect(canSubmitForReview(mentor, ownedByStudent)).toBe(false);
    expect(canSubmitForReview(admin, ownedByStudent)).toBe(false);
  });
});
