import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieStore, db, installMocks, jsonRequest, getRequest, readJson, type ErrorBody } from "../helpers/harness";

installMocks();

const { POST: register } = await import("@/app/api/auth/register/route");
const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { GET: me } = await import("@/app/api/auth/me/route");
const { SESSION_COOKIE_NAME } = await import("@/lib/auth/session");
const { hashPassword } = await import("@/lib/auth/password");

const PASSWORD = "a-perfectly-good-password";

const dbUser = (overrides: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ada@college.edu",
  name: "Ada",
  role: "STUDENT",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  cookieStore.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/register", () => {
  it("creates the account, returns 201 and sets a session cookie", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(dbUser() as never);

    const response = await register(
      jsonRequest("/api/auth/register", "POST", {
        name: "Ada",
        email: "ada@college.edu",
        password: PASSWORD,
      }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(cookieStore.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it("sets the cookie httpOnly and SameSite=Lax, so XSS cannot read it and cross-site posts cannot use it", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(dbUser() as never);

    await register(
      jsonRequest("/api/auth/register", "POST", { name: "Ada", email: "ada@college.edu", password: PASSWORD }),
      undefined,
    );

    const options = cookieStore.optionsFor(SESSION_COOKIE_NAME);
    expect(options?.httpOnly).toBe(true);
    expect(options?.sameSite).toBe("lax");
    expect(options?.path).toBe("/");
    expect(options?.maxAge).toBeGreaterThan(0);
  });

  it("never returns the password hash in the response body", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(dbUser() as never);

    const response = await register(
      jsonRequest("/api/auth/register", "POST", { name: "Ada", email: "ada@college.edu", password: PASSWORD }),
      undefined,
    );

    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("argon2");
    expect(text).not.toContain(PASSWORD);
  });

  it("returns 422 with field details for a short password", async () => {
    const response = await register(
      jsonRequest("/api/auth/register", "POST", { name: "Ada", email: "ada@college.edu", password: "short" }),
      undefined,
    );

    expect(response.status).toBe(422);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details?.some((d) => d.path === "password")).toBe(true);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("returns 422 rather than 500 for a malformed JSON body", async () => {
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect((await register(request, undefined)).status).toBe(422);
  });

  it("returns 409 when the email is taken", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing" } as never);

    const response = await register(
      jsonRequest("/api/auth/register", "POST", { name: "Ada", email: "ada@college.edu", password: PASSWORD }),
      undefined,
    );

    expect(response.status).toBe(409);
    expect((await readJson<ErrorBody>(response)).error.code).toBe("CONFLICT");
  });
});

describe("POST /api/auth/login", () => {
  async function seedUser() {
    db.user.findUnique.mockResolvedValue(
      dbUser({ passwordHash: await hashPassword(PASSWORD) }) as never,
    );
  }

  it("returns 200 and a session cookie for correct credentials", async () => {
    await seedUser();

    const response = await login(
      jsonRequest("/api/auth/login", "POST", { email: "ada@college.edu", password: PASSWORD }),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(cookieStore.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it("returns 401 and no cookie for a wrong password", async () => {
    await seedUser();

    const response = await login(
      jsonRequest("/api/auth/login", "POST", { email: "ada@college.edu", password: "wrong-password" }),
      undefined,
    );

    expect(response.status).toBe(401);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("gives an unknown email the same status and message as a wrong password", async () => {
    await seedUser();
    const wrongPassword = await readJson<ErrorBody>(
      await login(jsonRequest("/api/auth/login", "POST", { email: "ada@college.edu", password: "nope" }), undefined),
    );

    db.user.findUnique.mockResolvedValue(null);
    const unknownEmail = await readJson<ErrorBody>(
      await login(jsonRequest("/api/auth/login", "POST", { email: "ghost@college.edu", password: PASSWORD }), undefined),
    );

    expect(unknownEmail.error.message).toBe(wrongPassword.error.message);
    expect(unknownEmail.error.code).toBe(wrongPassword.error.code);
  });

  it("returns 429 with a Retry-After header once the attempt limit is hit", async () => {
    await seedUser();
    const attempt = () =>
      login(
        jsonRequest(
          "/api/auth/login",
          "POST",
          { email: "ratelimit@college.edu", password: "wrong-password" },
          { "x-forwarded-for": "198.51.100.99" },
        ),
        undefined,
      );

    let last: Response | undefined;
    for (let i = 0; i < 12; i += 1) last = await attempt();

    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("GET /api/auth/me", () => {
  it("returns null rather than 401 when signed out", async () => {
    const response = await me(getRequest("/api/auth/me"), undefined);
    expect(response.status).toBe(200);
    expect((await readJson<{ data: unknown }>(response)).data).toBeNull();
  });

  it("returns the signed-in user after a login, proving the cookie round trip works", async () => {
    db.user.findUnique.mockResolvedValue(dbUser({ passwordHash: await hashPassword(PASSWORD) }) as never);
    await login(jsonRequest("/api/auth/login", "POST", { email: "ada@college.edu", password: PASSWORD }), undefined);

    const response = await me(getRequest("/api/auth/me"), undefined);
    const body = await readJson<{ data: { id: string; role: string } }>(response);

    expect(body.data.id).toBe("u1");
    expect(body.data.role).toBe("STUDENT");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    db.user.findUnique.mockResolvedValue(dbUser({ passwordHash: await hashPassword(PASSWORD) }) as never);
    await login(jsonRequest("/api/auth/login", "POST", { email: "ada@college.edu", password: PASSWORD }), undefined);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeDefined();

    const response = await logout(jsonRequest("/api/auth/logout", "POST"), undefined);

    expect(response.status).toBe(200);
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
