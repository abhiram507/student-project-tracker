import { prisma } from "@/lib/db";
import { authedRoute, jsonBody } from "@/lib/http/handler";
import { created, ok } from "@/lib/http/responses";
import { createProject, listProjects } from "@/lib/services/project.service";
import { createProjectSchema, listProjectsQuerySchema } from "@/lib/validation/schemas";

export const GET = authedRoute(async (request, _ctx, actor) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = listProjectsQuerySchema.parse(params);
  return ok(await listProjects(prisma, actor, query));
});

export const POST = authedRoute(async (request, _ctx, actor) => {
  const input = createProjectSchema.parse(await jsonBody(request));
  return created(await createProject(prisma, actor, input));
});
