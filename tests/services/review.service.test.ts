import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import { createReview, listReviews } from "@/lib/services/review.service";
import { ForbiddenError, NotFoundError } from "@/lib/http/errors";

let db: DeepMockProxy<PrismaClient>;
let tx: DeepMockProxy<PrismaClient>;

const student: Actor = { id: "u-student", role: "STUDENT" };
const intruder: Actor = { id: "u-intruder", role: "STUDENT" };
const mentor: Actor = { id: "u-mentor", role: "MENTOR" };

const ownedByStudent = { ownerId: "u-student" };

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  tx = mockDeep<PrismaClient>();
  // Run the callback against a mock transaction client so we can assert on
  // what happened *inside* the transaction.
  db.$transaction.mockImplementation((async (fn: (client: PrismaClient) => Promise<unknown>) =>
    fn(tx)) as never);
  tx.review.create.mockResolvedValue({ id: "r1", author: { id: "u-mentor", name: "M", role: "MENTOR" } } as never);
  tx.project.update.mockResolvedValue({} as never);
});

describe("listReviews", () => {
  it("shows the owner their feedback", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    db.review.findMany.mockResolvedValue([] as never);
    await expect(listReviews(db, student, "p1")).resolves.toEqual([]);
  });

  it("hides another student's feedback behind a 404", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    await expect(listReviews(db, intruder, "p1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createReview", () => {
  it("lets a mentor comment without changing the review state", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);

    await createReview(db, mentor, "p1", { body: "Nice work on the tests", decision: "COMMENT" });

    expect(tx.review.create).toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it("moves the project to APPROVED in the same transaction as the review", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);

    await createReview(db, mentor, "p1", { body: "Approved, ship it", decision: "APPROVED" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const args = tx.project.update.mock.calls[0]![0] as { data: { reviewState: string } };
    expect(args.data.reviewState).toBe("APPROVED");
  });

  it("moves the project to CHANGES_REQUESTED", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    await createReview(db, mentor, "p1", { body: "Please add tests", decision: "CHANGES_REQUESTED" });
    const args = tx.project.update.mock.calls[0]![0] as { data: { reviewState: string } };
    expect(args.data.reviewState).toBe("CHANGES_REQUESTED");
  });

  it("records the author from the session, not the request body", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    await createReview(db, mentor, "p1", { body: "Looks good to me", decision: "COMMENT" });
    const args = tx.review.create.mock.calls[0]![0] as { data: { authorId: string } };
    expect(args.data.authorId).toBe("u-mentor");
  });

  it("refuses a student with an explicit explanation", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    await expect(
      createReview(db, student, "p1", { body: "Approving my own work", decision: "APPROVED" }),
    ).rejects.toThrow(/cannot review your own project/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a mentor reviewing their own project", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-mentor" } as never);
    await expect(
      createReview(db, mentor, "p1", { body: "Self approval attempt", decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s an unrelated student rather than admitting the project exists", async () => {
    db.project.findUnique.mockResolvedValue(ownedByStudent as never);
    await expect(
      createReview(db, intruder, "p1", { body: "Some feedback here", decision: "COMMENT" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
