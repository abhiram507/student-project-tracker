import { prisma } from "@/lib/db";
import { authedRoute, jsonBody } from "@/lib/http/handler";
import { noContent, ok } from "@/lib/http/responses";
import { deleteTask, updateTask } from "@/lib/services/task.service";
import { updateTaskSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authedRoute<Ctx>(async (request, { params }, actor) => {
  const { id } = await params;
  const input = updateTaskSchema.parse(await jsonBody(request));
  return ok(await updateTask(prisma, actor, id, input));
});

export const DELETE = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  await deleteTask(prisma, actor, id);
  return noContent();
});
