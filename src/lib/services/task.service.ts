import type { PrismaClient, Task } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import { canManageTasks, canViewProject } from "@/lib/auth/rbac";
import { NotFoundError, notFoundOrForbidden } from "@/lib/http/errors";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation/schemas";

/**
 * Tasks have no permissions of their own — they inherit the parent project's.
 * Every entry point therefore resolves the project first. Skipping that step on
 * even one route is how IDOR bugs get shipped, so it is centralised here.
 */
async function loadProjectFor(db: PrismaClient, actor: Actor, projectId: string, write: boolean) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new NotFoundError("Project");

  const permitted = write ? canManageTasks(actor, project) : canViewProject(actor, project);
  if (!permitted) throw notFoundOrForbidden(canViewProject(actor, project), "Project");

  return project;
}

export async function listTasks(db: PrismaClient, actor: Actor, projectId: string): Promise<Task[]> {
  await loadProjectFor(db, actor, projectId, false);
  return db.task.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function createTask(
  db: PrismaClient,
  actor: Actor,
  projectId: string,
  input: CreateTaskInput,
): Promise<Task> {
  await loadProjectFor(db, actor, projectId, true);
  return db.task.create({ data: { ...input, dueDate: input.dueDate ?? null, projectId } });
}

export async function updateTask(
  db: PrismaClient,
  actor: Actor,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) throw new NotFoundError("Task");

  await loadProjectFor(db, actor, task.projectId, true);
  return db.task.update({ where: { id: taskId }, data: input });
}

export async function deleteTask(db: PrismaClient, actor: Actor, taskId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) throw new NotFoundError("Task");

  await loadProjectFor(db, actor, task.projectId, true);
  await db.task.delete({ where: { id: taskId } });
}
