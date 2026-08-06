import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import {
  buildProjectWhere,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  submitForReview,
  updateProject,
} from "@/lib/services/project.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/http/errors";
import { listProjectsQuerySchema } from "@/lib/validation/schemas";

let db: DeepMockProxy<PrismaClient>;

const student: Actor = { id: "u-student", role: "STUDENT" };
const intruder: Actor = { id: "u-intruder", role: "STUDENT" };
const mentor: Actor = { id: "u-mentor", role: "MENTOR" };

const query = (overrides: Record<string, unknown> = {}) => listProjectsQuerySchema.parse(overrides);

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "Tracker",
  description: "",
  githubUrl: null,
  liveUrl: null,
  status: "PLANNING",
  reviewState: "DRAFT",
  submittedAt: null,
  ownerId: "u-student",
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { id: "u-student", name: "Ada", email: "a@b.com" },
  tasks: [],
  ...overrides,
});

beforeEach(() => {
  db = mockDeep<PrismaClient>();
});

describe("buildProjectWhere", () => {
  it("pins a student to their own rows even when they ask for everything", () => {
    const where = buildProjectWhere(student, query({ scope: "all" }));
    expect(where.ownerId).toBe("u-student");
  });

  it("lets a mentor opt into the full list", () => {
    expect(buildProjectWhere(mentor, query({ scope: "all" })).ownerId).toBeUndefined();
  });

  it("still scopes a mentor to their own projects by default", () => {
    expect(buildProjectWhere(mentor, query()).ownerId).toBe("u-mentor");
  });

  it("passes the search term through as a parameterised contains, not raw SQL", () => {
    const where = buildProjectWhere(student, query({ q: "'; DROP TABLE projects;--" }));
    expect(where.OR).toEqual([
      { title: { contains: "'; DROP TABLE projects;--", mode: "insensitive" } },
      { description: { contains: "'; DROP TABLE projects;--", mode: "insensitive" } },
    ]);
  });

  it("applies status and review-state filters", () => {
    const where = buildProjectWhere(student, query({ status: "BLOCKED", reviewState: "SUBMITTED" }));
    expect(where.status).toBe("BLOCKED");
    expect(where.reviewState).toBe("SUBMITTED");
  });
});

describe("listProjects", () => {
  it("paginates and reports totals", async () => {
    db.project.findMany.mockResolvedValue([projectRow()] as never);
    db.project.count.mockResolvedValue(23 as never);

    const result = await listProjects(db, student, query({ page: 2, perPage: 10 }));

    expect(result).toMatchObject({ page: 2, perPage: 10, total: 23, totalPages: 3 });
    const args = db.project.findMany.mock.calls[0]![0] as { skip: number; take: number };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it("reports at least one page when there are no results", async () => {
    db.project.findMany.mockResolvedValue([] as never);
    db.project.count.mockResolvedValue(0 as never);
    expect((await listProjects(db, student, query())).totalPages).toBe(1);
  });

  it("computes progress from the project's tasks", async () => {
    db.project.findMany.mockResolvedValue([
      projectRow({ tasks: [{ status: "DONE" }, { status: "DONE" }, { status: "TODO" }, { status: "TODO" }] }),
    ] as never);
    db.project.count.mockResolvedValue(1 as never);

    const [first] = (await listProjects(db, student, query())).items;
    expect(first!.progress).toBe(50);
    expect(first!.taskCounts).toEqual({ total: 4, todo: 2, inProgress: 0, done: 2 });
  });
});

describe("getProject", () => {
  it("returns the project to its owner", async () => {
    db.project.findUnique.mockResolvedValue(projectRow() as never);
    await expect(getProject(db, student, "p1")).resolves.toMatchObject({ id: "p1" });
  });

  it("returns it to a mentor", async () => {
    db.project.findUnique.mockResolvedValue(projectRow() as never);
    await expect(getProject(db, mentor, "p1")).resolves.toMatchObject({ id: "p1" });
  });

  it("answers 404, not 403, to an unrelated student — no id enumeration oracle", async () => {
    db.project.findUnique.mockResolvedValue(projectRow() as never);
    await expect(getProject(db, intruder, "p1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s for a project that does not exist", async () => {
    db.project.findUnique.mockResolvedValue(null);
    await expect(getProject(db, student, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createProject", () => {
  it("takes the owner from the session, ignoring any ownerId in the payload", async () => {
    db.project.create.mockResolvedValue(projectRow() as never);

    await createProject(db, student, {
      title: "Tracker",
      description: "",
      githubUrl: null,
      liveUrl: null,
      status: "PLANNING",
      // @ts-expect-error — proving a smuggled ownerId cannot take effect
      ownerId: "u-victim",
    });

    const args = db.project.create.mock.calls[0]![0] as { data: { ownerId: string } };
    expect(args.data.ownerId).toBe("u-student");
  });
});

describe("updateProject", () => {
  it("lets the owner edit", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student" } as never);
    db.project.update.mockResolvedValue(projectRow({ title: "Renamed" }) as never);
    await expect(updateProject(db, student, "p1", { title: "Renamed" })).resolves.toMatchObject({ title: "Renamed" });
  });

  it("refuses a mentor with a truthful 403 — they can see it but must not rewrite it", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student" } as never);
    await expect(updateProject(db, mentor, "p1", { title: "Hijacked" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("refuses an unrelated student with a 404", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student" } as never);
    await expect(updateProject(db, intruder, "p1", { title: "Hijacked" })).rejects.toBeInstanceOf(NotFoundError);
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

describe("deleteProject", () => {
  it("refuses an unrelated student and never reaches the delete", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student" } as never);
    await expect(deleteProject(db, intruder, "p1")).rejects.toBeInstanceOf(NotFoundError);
    expect(db.project.delete).not.toHaveBeenCalled();
  });

  it("allows the owner", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student" } as never);
    db.project.delete.mockResolvedValue({} as never);
    await expect(deleteProject(db, student, "p1")).resolves.toBeUndefined();
  });
});

describe("submitForReview", () => {
  it("moves a draft to SUBMITTED and stamps the time", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student", reviewState: "DRAFT" } as never);
    db.project.update.mockResolvedValue(projectRow({ reviewState: "SUBMITTED" }) as never);

    await submitForReview(db, student, "p1");

    const args = db.project.update.mock.calls[0]![0] as { data: { reviewState: string; submittedAt: Date } };
    expect(args.data.reviewState).toBe("SUBMITTED");
    expect(args.data.submittedAt).toBeInstanceOf(Date);
  });

  it("rejects a double submission with a 409", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student", reviewState: "SUBMITTED" } as never);
    await expect(submitForReview(db, student, "p1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows re-submission after changes were requested", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student", reviewState: "CHANGES_REQUESTED" } as never);
    db.project.update.mockResolvedValue(projectRow() as never);
    await expect(submitForReview(db, student, "p1")).resolves.toBeDefined();
  });

  it("does not let a mentor submit someone else's project for them", async () => {
    db.project.findUnique.mockResolvedValue({ ownerId: "u-student", reviewState: "DRAFT" } as never);
    await expect(submitForReview(db, mentor, "p1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
