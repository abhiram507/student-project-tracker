"use client";

/**
 * Thin browser-side wrapper over the REST API. Its one job is to turn the
 * `{ error: { message } }` envelope into a thrown Error carrying a message that
 * is safe and useful to render, so every component handles failure the same way
 * instead of each one inventing its own.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message: string; code: string; details?: { path: string; message: string }[] } }
    | null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message ?? "The request failed. Please try again.",
      response.status,
      error?.code ?? "UNKNOWN",
      error?.details,
    );
  }

  return payload?.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};

/** Flattens field-level validation details into a single readable line. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.details?.length) {
      return error.details.map((d) => `${d.path}: ${d.message}`).join(" · ");
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
