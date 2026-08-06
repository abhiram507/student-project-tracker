import { prisma } from "@/lib/db";
import { authedRoute, jsonBody } from "@/lib/http/handler";
import { noContent, ok } from "@/lib/http/responses";
import { deleteProject, getProject, updateProject } from "@/lib/services/project.service";
import { updateProjectSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  return ok(await getProject(prisma, actor, id));
});

export const PATCH = authedRoute<Ctx>(async (request, { params }, actor) => {
  const { id } = await params;
  const input = updateProjectSchema.parse(await jsonBody(request));
  return ok(await updateProject(prisma, actor, id, input));
});

export const DELETE = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  await deleteProject(prisma, actor, id);
  return noContent();
});
