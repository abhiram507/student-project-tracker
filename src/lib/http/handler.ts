import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session-cookie";
import type { Actor } from "@/lib/auth/rbac";
import { UnauthorizedError } from "@/lib/http/errors";
import { errorResponse } from "@/lib/http/responses";

/**
 * Route wrappers. Every handler goes through one of these, so error translation
 * and the auth check exist in exactly one place instead of being re-implemented
 * (and eventually forgotten) in each route file.
 */

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<NextResponse>;
type AuthedHandler<Ctx> = (request: Request, context: Ctx, actor: Actor) => Promise<NextResponse>;

export function route<Ctx>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function authedRoute<Ctx>(handler: AuthedHandler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      const actor = await getActor();
      if (!actor) throw new UnauthorizedError();
      return await handler(request, context, actor);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parses a JSON body, turning malformed JSON into a 422 rather than a 500. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
