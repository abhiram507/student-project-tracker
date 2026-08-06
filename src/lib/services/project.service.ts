import type { Prisma, PrismaClient, Project } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import {
  canDeleteProject,
  canEditProject,
  canSubmitForReview,
  canViewProject,
  isMentor,
} from "@/lib/auth/rbac";
import { ConflictError, NotFoundError, notFoundOrForbidden } from "@/lib/http/errors";
import { calculateProgress, canTransition, countTasks } from "@/lib/services/project-progress";
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from "@/lib/validation/schemas";

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  githubUrl: string | null;
  liveUrl: string | null;
  status: Project["status"];
  reviewState: Project["reviewState"];
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string; email: string };
  taskCounts: { total: number; todo: number; inProgress: number; done: number };
  progress: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const ownerSelect = { select: { id: true, name: true, email: true } } as const;

/**
 * Builds the WHERE clause for a listing. Authorisation is folded into the query
 * itself rather than applied after fetching: a student's search can never load
 * another student's row into memory in the first place.
 */
export function buildProjectWhere(actor: Actor, query: ListProjectsQuery): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};

  const wantsEverything = query.scope === "all" && isMentor(actor);
  if (!wantsEverything) where.ownerId = actor.id;

  if (query.status) where.status = query.status;
  if (query.reviewState) where.reviewState = query.reviewState;

  if (query.q) {
    // Parameterised by Prisma — the search term is never concatenated into SQL.
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listProjects(
  db: PrismaClient,
  actor: Actor,
  query: ListProjectsQuery,
): Promise<Paginated<ProjectSummary>> {
  const where = buildProjectWhere(actor, query);
  const skip = (query.page - 1) * query.perPage;

  const [rows, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.perPage,
      include: { owner: ownerSelect, tasks: { select: { status: true } } },
    }),
    db.project.count({ where }),
  ]);

  return {
    items: rows.map(toSummary),
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
  };
}

export async function getProject(db: PrismaClient, actor: Actor, id: string): Promise<ProjectSummary> {
  const project = await db.project.findUnique({
    where: { id },
    include: { owner: ownerSelect, tasks: { select: { status: true } } },
  });

  if (!project) throw new NotFoundError("Project");
  if (!canViewProject(actor, project)) throw notFoundOrForbidden(false, "Project");

  return toSummary(project);
}

export async function createProject(
  db: PrismaClient,
  actor: Actor,
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  const project = await db.project.create({
    // ownerId comes from the verified session, never from the request body —
    // otherwise a client could create a project in someone else's name.
    data: { ...input, ownerId: actor.id },
    include: { owner: ownerSelect, tasks: { select: { status: true } } },
  });
  return toSummary(project);
}

export async function updateProject(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectSummary> {
  const existing = await db.project.findUnique({ where: { id }, select: { ownerId: true } });
  if (!existing) throw new NotFoundError("Project");
  if (!canEditProject(actor, existing)) {
    // A mentor CAN see this project, so telling them 403 leaks nothing.
    throw notFoundOrForbidden(canViewProject(actor, existing), "Project");
  }

  const project = await db.project.update({
    where: { id },
    data: input,
    include: { owner: ownerSelect, tasks: { select: { status: true } } },
  });
  return toSummary(project);
}

export async function deleteProject(db: PrismaClient, actor: Actor, id: string): Promise<void> {
  const existing = await db.project.findUnique({ where: { id }, select: { ownerId: true } });
  if (!existing) throw new NotFoundError("Project");
  if (!canDeleteProject(actor, existing)) {
    throw notFoundOrForbidden(canViewProject(actor, existing), "Project");
  }
  // Tasks and reviews cascade — see the schema.
  await db.project.delete({ where: { id } });
}

/** Student action: hand the project to a mentor. */
export async function submitForReview(
  db: PrismaClient,
  actor: Actor,
  id: string,
): Promise<ProjectSummary> {
  const existing = await db.project.findUnique({
    where: { id },
    select: { ownerId: true, reviewState: true },
  });
  if (!existing) throw new NotFoundError("Project");
  if (!canSubmitForReview(actor, existing)) {
    throw notFoundOrForbidden(canViewProject(actor, existing), "Project");
  }
  if (!canTransition(existing.reviewState, "SUBMITTED")) {
    throw new ConflictError(`A project that is ${existing.reviewState} cannot be submitted for review.`);
  }

  const project = await db.project.update({
    where: { id },
    data: { reviewState: "SUBMITTED", submittedAt: new Date() },
    include: { owner: ownerSelect, tasks: { select: { status: true } } },
  });
  return toSummary(project);
}

type ProjectRow = Project & {
  owner: { id: string; name: string; email: string };
  tasks: { status: Project extends never ? never : import("@prisma/client").TaskStatus }[];
};

/** Single place where a database row becomes an API shape. Nothing else leaks out. */
export function toSummary(project: ProjectRow): ProjectSummary {
  const taskCounts = countTasks(project.tasks.map((t) => t.status));
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    githubUrl: project.githubUrl,
    liveUrl: project.liveUrl,
    status: project.status,
    reviewState: project.reviewState,
    submittedAt: project.submittedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: project.owner,
    taskCounts,
    progress: calculateProgress(taskCounts),
  };
}
