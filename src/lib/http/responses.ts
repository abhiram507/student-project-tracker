import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitError } from "@/lib/http/errors";

/** Every successful response is `{ data: ... }`; every failure is `{ error: ... }`. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T): NextResponse {
  return ok(data, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "The submitted data is not valid.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return NextResponse.json<ApiErrorBody>(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers },
    );
  }

  // Anything unrecognised is a bug. Log it for us, say nothing useful to them.
  console.error("[unhandled]", error);
  return NextResponse.json<ApiErrorBody>(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our end." } },
    { status: 500 },
  );
}
