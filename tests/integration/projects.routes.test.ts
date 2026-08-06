import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieStore, ctx, db, installMocks, jsonRequest, getRequest, readJson, type ErrorBody } from "../helpers/harness";

installMocks();

const projectsRoute = await import("@/app/api/projects/route");
const projectRoute = await import("@/app/api/projects/[id]/route");
const submitRoute = await import("@/app/api/projects/[id]/submit/route");
const projectTasksRoute = await import("@/app/api/projects/[id]/tasks/route");
const taskRoute = await import("@/app/api/tasks/[id]/route");
const reviewsRoute = await import("@/app/api/projects/[id]/reviews/route");

const { SESSION_COOKIE_NAME, createSessionToken } = await import("@/lib/auth/session");

/** Puts a real signed session into the cookie jar, exactly as login would. */
async function signInAs(id: string, role: "STUDENT" | "MENTOR" | "ADMIN") {
  const token = await createSessionToken({
    sub: id,
    email: `${id}@college.edu`,
    name: id,
    role,
  });
  cookieStore.set(SESSION_COOKIE_NAME, token);
}

const OWNER = "usr-owner";
const INTRUDER = "usr-intruder";
const MENTOR = "usr-mentor";

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: "prj1",
  title: "Tracker",
  description: "",
  githubUrl: null,
  liveUrl: null,
  status: "PLANNING",
  reviewState: "DRAFT",
  submittedAt: null,
  ownerId: OWNER,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { id: OWNER, name: "Owner", email: "owner@college.edu" },
  tasks: [],
  ...overrides,
});

beforeEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
});

describe("authentication gate", () => {
  it("refuses every project route with 401 when there is no session", async () => {
    const responses = await Promise.all([
      projectsRoute.GET(getRequest("/api/projects"), undefined),
      projectsRoute.POST(jsonRequest("/api/projects", "POST", { title: "Tracker" }), undefined),
      projectRoute.GET(getRequest("/api/projects/prj1"), ctx("prj1")),
      projectRoute.DELETE(jsonRequest("/api/projects/prj1", "DELETE"), ctx("prj1")),
      submitRoute.POST(jsonRequest("/api/projects/prj1/submit", "POST"), ctx("prj1")),
      taskRoute.PATCH(jsonRequest("/api/tasks/t1", "PATCH", { status: "DONE" }), ctx("t1")),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("refuses a forged session cookie", async () => {
    cookieStore.set(SESSION_COOKIE_NAME, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.");
    expect((await projectsRoute.GET(getRequest("/api/projects"), undefined)).status).toBe(401);
  });
});

describe("GET /api/projects", () => {
  it("returns a paginated envelope for a signed-in student", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findMany.mockResolvedValue([projectRow()] as never);
    db.project.count.mockResolvedValue(1 as never);

    const response = await projectsRoute.GET(getRequest("/api/projects"), undefined);
    const body = await readJson<{ data: { items: unknown[]; total: number; totalPages: number } }>(response);

    expect(response.status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(body.data.totalPages).toBe(1);
  });

  it("pins a student to their own rows even when the query asks for everything", async () => {
    await signInAs(INTRUDER, "STUDENT");
    db.project.findMany.mockResolvedValue([] as never);
    db.project.count.mockResolvedValue(0 as never);

    await projectsRoute.GET(getRequest("/api/projects?scope=all"), undefined);

    const args = db.project.findMany.mock.calls[0]![0] as { where: { ownerId?: string } };
    expect(args.where.ownerId).toBe(INTRUDER);
  });

  it("lets a mentor widen the scope", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findMany.mockResolvedValue([] as never);
    db.project.count.mockResolvedValue(0 as never);

    await projectsRoute.GET(getRequest("/api/projects?scope=all&reviewState=SUBMITTED"), undefined);

    const args = db.project.findMany.mock.calls[0]![0] as { where: { ownerId?: string; reviewState?: string } };
    expect(args.where.ownerId).toBeUndefined();
    expect(args.where.reviewState).toBe("SUBMITTED");
  });

  it("rejects an oversized perPage with 422 instead of returning the whole table", async () => {
    await signInAs(OWNER, "STUDENT");
    const response = await projectsRoute.GET(getRequest("/api/projects?perPage=5000"), undefined);
    expect(response.status).toBe(422);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("passes a SQL-injection-shaped search term through as data", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findMany.mockResolvedValue([] as never);
    db.project.count.mockResolvedValue(0 as never);

    await projectsRoute.GET(getRequest("/api/projects?q=%27%3B%20DROP%20TABLE%20projects%3B--"), undefined);

    const args = db.project.findMany.mock.calls[0]![0] as { where: { OR?: { title?: { contains: string } }[] } };
    expect(args.where.OR?.[0]?.title?.contains).toBe("'; DROP TABLE projects;--");
  });
});

describe("POST /api/projects", () => {
  it("creates a project owned by the session user, ignoring a smuggled ownerId", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.create.mockResolvedValue(projectRow() as never);

    const response = await projectsRoute.POST(
      jsonRequest("/api/projects", "POST", { title: "Tracker", ownerId: "usr-victim" }),
      undefined,
    );

    expect(response.status).toBe(201);
    const args = db.project.create.mock.calls[0]![0] as { data: { ownerId: string } };
    expect(args.data.ownerId).toBe(OWNER);
  });

  it("rejects a javascript: URL with 422", async () => {
    await signInAs(OWNER, "STUDENT");

    const response = await projectsRoute.POST(
      jsonRequest("/api/projects", "POST", { title: "Tracker", githubUrl: "javascript:alert(1)" }),
      undefined,
    );

    expect(response.status).toBe(422);
    expect(db.project.create).not.toHaveBeenCalled();
  });
});

describe("the authorisation boundary between two students", () => {
  it("answers 404, not 403, when an intruder reads another student's project", async () => {
    await signInAs(INTRUDER, "STUDENT");
    db.project.findUnique.mockResolvedValue(projectRow() as never);

    const response = await projectRoute.GET(getRequest("/api/projects/prj1"), ctx("prj1"));

    expect(response.status).toBe(404);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns byte-identical bodies for a project that does not exist and one that is not yours", async () => {
    await signInAs(INTRUDER, "STUDENT");

    db.project.findUnique.mockResolvedValue(projectRow() as never);
    const notYours = await (await projectRoute.GET(getRequest("/api/projects/prj1"), ctx("prj1"))).text();

    db.project.findUnique.mockResolvedValue(null);
    const notReal = await (await projectRoute.GET(getRequest("/api/projects/nope"), ctx("nope"))).text();

    // If these differed by even a word, the API would be an ID enumeration oracle.
    expect(notYours).toBe(notReal);
  });

  it("blocks an intruder from editing and never reaches the update", async () => {
    await signInAs(INTRUDER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    const response = await projectRoute.PATCH(
      jsonRequest("/api/projects/prj1", "PATCH", { title: "Hijacked" }),
      ctx("prj1"),
    );

    expect(response.status).toBe(404);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("blocks an intruder from deleting", async () => {
    await signInAs(INTRUDER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    expect((await projectRoute.DELETE(jsonRequest("/api/projects/prj1", "DELETE"), ctx("prj1"))).status).toBe(404);
    expect(db.project.delete).not.toHaveBeenCalled();
  });

  it("blocks an intruder who guessed a valid task id", async () => {
    await signInAs(INTRUDER, "STUDENT");
    db.task.findUnique.mockResolvedValue({ projectId: "prj1" } as never);
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    const response = await taskRoute.PATCH(jsonRequest("/api/tasks/t1", "PATCH", { status: "DONE" }), ctx("t1"));

    expect(response.status).toBe(404);
    expect(db.task.update).not.toHaveBeenCalled();
  });
});

describe("what a mentor may and may not do", () => {
  it("may read a student's project", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findUnique.mockResolvedValue(projectRow() as never);

    expect((await projectRoute.GET(getRequest("/api/projects/prj1"), ctx("prj1"))).status).toBe(200);
  });

  it("gets a truthful 403 when trying to edit it — reviewing is not rewriting", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    const response = await projectRoute.PATCH(
      jsonRequest("/api/projects/prj1", "PATCH", { title: "Rewritten by mentor" }),
      ctx("prj1"),
    );

    expect(response.status).toBe(403);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("cannot add a task to a student's project", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    const response = await projectTasksRoute.POST(
      jsonRequest("/api/projects/prj1/tasks", "POST", { title: "Added by mentor" }),
      ctx("prj1"),
    );

    expect(response.status).toBe(403);
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("cannot submit a student's project on their behalf", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER, reviewState: "DRAFT" } as never);

    expect((await submitRoute.POST(jsonRequest("/api/projects/prj1/submit", "POST"), ctx("prj1"))).status).toBe(403);
  });

  it("cannot approve a project by PATCHing reviewState — the field is not accepted", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);
    db.project.update.mockResolvedValue(projectRow() as never);

    await projectRoute.PATCH(
      jsonRequest("/api/projects/prj1", "PATCH", { title: "Renamed", reviewState: "APPROVED" }),
      ctx("prj1"),
    );

    const args = db.project.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data).not.toHaveProperty("reviewState");
  });
});

describe("review workflow", () => {
  it("moves a draft to SUBMITTED for its owner", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER, reviewState: "DRAFT" } as never);
    db.project.update.mockResolvedValue(projectRow({ reviewState: "SUBMITTED" }) as never);

    const response = await submitRoute.POST(jsonRequest("/api/projects/prj1/submit", "POST"), ctx("prj1"));

    expect(response.status).toBe(200);
    const args = db.project.update.mock.calls[0]![0] as { data: { reviewState: string } };
    expect(args.data.reviewState).toBe("SUBMITTED");
  });

  it("returns 409 on a double submission", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER, reviewState: "SUBMITTED" } as never);

    const response = await submitRoute.POST(jsonRequest("/api/projects/prj1/submit", "POST"), ctx("prj1"));

    expect(response.status).toBe(409);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("CONFLICT");
  });

  it("refuses a student trying to approve their own project", async () => {
    await signInAs(OWNER, "STUDENT");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);

    const response = await reviewsRoute.POST(
      jsonRequest("/api/projects/prj1/reviews", "POST", { body: "Approving myself", decision: "APPROVED" }),
      ctx("prj1"),
    );

    expect(response.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("lets a mentor approve, recording the author from the session", async () => {
    await signInAs(MENTOR, "MENTOR");
    db.project.findUnique.mockResolvedValue({ ownerId: OWNER } as never);
    db.$transaction.mockImplementation((async (fn: (client: unknown) => Promise<unknown>) =>
      fn({
        review: { create: async () => ({ id: "r1", author: { id: MENTOR, name: "M", role: "MENTOR" } }) },
        project: { update: async () => ({}) },
      })) as never);

    const response = await reviewsRoute.POST(
      jsonRequest("/api/projects/prj1/reviews", "POST", {
        body: "Good separation of concerns. Approved.",
        decision: "APPROVED",
      }),
      ctx("prj1"),
    );

    expect(response.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a one-word review with 422", async () => {
    await signInAs(MENTOR, "MENTOR");

    const response = await reviewsRoute.POST(
      jsonRequest("/api/projects/prj1/reviews", "POST", { body: "ok" }),
      ctx("prj1"),
    );

    expect(response.status).toBe(422);
  });
});

describe("unexpected failures", () => {
  it("returns a generic 500 that does not leak the database connection string", async () => {
    await signInAs(OWNER, "STUDENT");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.project.findMany.mockRejectedValue(
      new Error("connect ECONNREFUSED postgresql://spt:hunter2@10.0.0.5:5432/spt"),
    );
    db.project.count.mockResolvedValue(0 as never);

    const response = await projectsRoute.GET(getRequest("/api/projects"), undefined);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("10.0.0.5");
    logged.mockRestore();
  });
});
