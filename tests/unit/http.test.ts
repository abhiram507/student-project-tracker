import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  notFoundOrForbidden,
} from "@/lib/http/errors";
import { created, errorResponse, noContent, ok } from "@/lib/http/responses";

describe("error types", () => {
  it("carries the right status and code for each failure mode", () => {
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError("clash").status).toBe(409);
    expect(new ValidationError().status).toBe(422);
    expect(new RateLimitError(30).status).toBe(429);
    expect(new RateLimitError(30).code).toBe("RATE_LIMITED");
  });

  it("names the missing resource", () => {
    expect(new NotFoundError("Project").message).toBe("Project not found.");
  });

  it("remains an Error, so stack traces and instanceof both work", () => {
    const error = new ForbiddenError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ForbiddenError");
  });
});

describe("notFoundOrForbidden", () => {
  it("returns 403 to someone who can see the resource", () => {
    expect(notFoundOrForbidden(true, "Project").status).toBe(403);
  });

  it("returns 404 to someone who cannot, so the API is not an enumeration oracle", () => {
    expect(notFoundOrForbidden(false, "Project").status).toBe(404);
  });
});

describe("success responses", () => {
  it("wraps payloads in a data envelope", async () => {
    const response = ok({ id: "p1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "p1" } });
  });

  it("uses 201 for created", () => {
    expect(created({ id: "p1" }).status).toBe(201);
  });

  it("uses 204 with no body for a delete", async () => {
    const response = noContent();
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });
});

describe("errorResponse", () => {
  it("turns a Zod failure into a 422 listing the offending fields", async () => {
    const schema = z.object({ title: z.string().min(3) });
    const result = schema.safeParse({ title: "x" });
    const response = errorResponse(result.success ? null : result.error);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details[0]!.path).toBe("title");
  });

  it("passes an AppError's status and code straight through", async () => {
    const response = errorResponse(new ConflictError("An account with that email already exists."));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("sets Retry-After when rate limited", () => {
    expect(errorResponse(new RateLimitError(42)).headers.get("Retry-After")).toBe("42");
  });

  it("hides the details of an unexpected error behind a generic 500", async () => {
    // The handler logs unrecognised errors on purpose; silence it so the test
    // output is not full of stack traces that look like failures.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("ECONNREFUSED");
    expect(body.error.message).not.toContain("10.0.0.5");
  });
});
