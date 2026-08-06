/**
 * One error type per HTTP failure mode. Services throw these; the route wrapper
 * translates them. This is what keeps `try/catch` out of every handler and stops
 * internal messages leaking to clients.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown) {
    super("The submitted data is not valid.", 422, "VALIDATION_FAILED", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/**
 * Deliberately identical wording to NotFoundError at the API surface for
 * resources the caller may not know exist — see notFoundOrForbidden().
 */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found.`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Please wait and try again.", 429, "RATE_LIMITED");
  }
}

/**
 * Returns 404 rather than 403 when the caller cannot even see the resource.
 * Answering "403" to a stranger confirms the id exists, which turns the API
 * into an enumeration oracle. Callers who legitimately know the resource exists
 * (the owner, a mentor) still get a truthful 403 from ForbiddenError.
 */
export function notFoundOrForbidden(canSee: boolean, resource: string): AppError {
  return canSee ? new ForbiddenError() : new NotFoundError(resource);
}
