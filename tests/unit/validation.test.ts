import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  createReviewSchema,
  createTaskSchema,
  listProjectsQuerySchema,
  loginSchema,
  registerSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "@/lib/validation/schemas";

describe("registerSchema", () => {
  it("normalises email casing and trims whitespace", () => {
    const parsed = registerSchema.parse({
      name: "  Ada Lovelace  ",
      email: "  ADA@Example.COM ",
      password: "a-long-enough-password",
    });
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.name).toBe("Ada Lovelace");
  });

  it("rejects a malformed email", () => {
    expect(registerSchema.safeParse({ name: "Ada", email: "not-an-email", password: "longenoughpw" }).success).toBe(false);
  });

  it("rejects a short password", () => {
    expect(registerSchema.safeParse({ name: "Ada", email: "a@b.com", password: "short" }).success).toBe(false);
  });

  it("rejects a one-character name", () => {
    expect(registerSchema.safeParse({ name: "A", email: "a@b.com", password: "longenoughpw" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("does not impose the registration length rule on an existing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "old" }).success).toBe(true);
  });

  it("still requires a non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("createProjectSchema", () => {
  it("defaults description and status", () => {
    const parsed = createProjectSchema.parse({ title: "Tracker" });
    expect(parsed.description).toBe("");
    expect(parsed.status).toBe("PLANNING");
  });

  it("accepts https and http links", () => {
    const parsed = createProjectSchema.parse({ title: "Tracker", githubUrl: "https://github.com/a/b" });
    expect(parsed.githubUrl).toBe("https://github.com/a/b");
  });

  it("rejects a javascript: URL, which would be stored XSS", () => {
    const result = createProjectSchema.safeParse({ title: "Tracker", githubUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects a data: URL", () => {
    const result = createProjectSchema.safeParse({
      title: "Tracker",
      liveUrl: "data:text/html;base64,PHNjcmlwdD4=",
    });
    expect(result.success).toBe(false);
  });

  it("turns an empty link into null rather than an empty string", () => {
    expect(createProjectSchema.parse({ title: "Tracker", githubUrl: "" }).githubUrl).toBeNull();
  });

  it("rejects a title that is only whitespace", () => {
    expect(createProjectSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("caps an oversized description", () => {
    expect(createProjectSchema.safeParse({ title: "Tracker", description: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(createProjectSchema.safeParse({ title: "Tracker", status: "SOMEDAY" }).success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("rejects an empty patch instead of silently doing nothing", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single-field patch", () => {
    expect(updateProjectSchema.safeParse({ title: "Renamed" }).success).toBe(true);
  });
});

describe("listProjectsQuerySchema", () => {
  it("applies sensible defaults for a bare request", () => {
    const parsed = listProjectsQuerySchema.parse({});
    expect(parsed).toMatchObject({ scope: "mine", page: 1, perPage: 10 });
  });

  it("coerces numeric strings from the query string", () => {
    const parsed = listProjectsQuerySchema.parse({ page: "3", perPage: "25" });
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(25);
  });

  it("caps perPage so a client cannot request the whole table", () => {
    expect(listProjectsQuerySchema.safeParse({ perPage: "1000" }).success).toBe(false);
  });

  it("rejects a zero or negative page", () => {
    expect(listProjectsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(listProjectsQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  });
});

describe("task schemas", () => {
  it("defaults status and priority", () => {
    const parsed = createTaskSchema.parse({ title: "Write tests" });
    expect(parsed.status).toBe("TODO");
    expect(parsed.priority).toBe("MEDIUM");
  });

  it("coerces an ISO date string into a Date", () => {
    const parsed = createTaskSchema.parse({ title: "Ship", dueDate: "2026-08-06T00:00:00.000Z" });
    expect(parsed.dueDate).toBeInstanceOf(Date);
  });

  it("rejects an unparseable date", () => {
    expect(createTaskSchema.safeParse({ title: "Ship", dueDate: "next tuesday" }).success).toBe(false);
  });

  it("rejects an empty task patch", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });
});

describe("createReviewSchema", () => {
  it("requires a review to actually say something", () => {
    expect(createReviewSchema.safeParse({ body: "ok" }).success).toBe(false);
    expect(createReviewSchema.safeParse({ body: "Looks good to me" }).success).toBe(true);
  });

  it("defaults to a plain comment rather than a verdict", () => {
    expect(createReviewSchema.parse({ body: "Some feedback here" }).decision).toBe("COMMENT");
  });

  it("rejects an invented decision", () => {
    expect(createReviewSchema.safeParse({ body: "Some feedback", decision: "REJECTED" }).success).toBe(false);
  });
});
