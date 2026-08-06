import { prisma } from "@/lib/db";
import { authedRoute, jsonBody } from "@/lib/http/handler";
import { created, ok } from "@/lib/http/responses";
import { createTask, listTasks } from "@/lib/services/task.service";
import { createTaskSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = authedRoute<Ctx>(async (_request, { params }, actor) => {
  const { id } = await params;
  return ok(await listTasks(prisma, actor, id));
});

export const POST = authedRoute<Ctx>(async (request, { params }, actor) => {
  const { id } = await params;
  const input = createTaskSchema.parse(await jsonBody(request));
  return created(await createTask(prisma, actor, id, input));
});
