import { z } from "zod";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Every byte that enters the API crosses one of these schemas first. Nothing
 * downstream — service, Prisma call, React component — ever sees an unvalidated
 * value, which is what lets the service layer be written without defensive
 * checks scattered through it.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** Blocks javascript:, data: and other scheme-based XSS in user-supplied links. */
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url("Must be a valid URL")
  .refine((value) => /^https?:\/\//i.test(value), { message: "URL must start with http:// or https://" });

const optionalHttpUrl = z.union([httpUrl, z.literal("")]).optional().transform((v) => (v ? v : null));

/* ------------------------------------------------------------------ auth -- */

export const registerSchema = z.object({
  name: trimmed(80).min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("Must be a valid email address").max(255),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address").max(255),
  password: z.string().min(1, "Password is required").max(MAX_PASSWORD_LENGTH),
});

/* -------------------------------------------------------------- projects -- */

export const projectStatusSchema = z.enum(["PLANNING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "ARCHIVED"]);
export const reviewStateSchema = z.enum(["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED"]);

export const createProjectSchema = z.object({
  title: trimmed(120).min(3, "Title must be at least 3 characters"),
  description: trimmed(2000).default(""),
  githubUrl: optionalHttpUrl,
  liveUrl: optionalHttpUrl,
  status: projectStatusSchema.default("PLANNING"),
});

/** Partial, but rejects `{}` so an empty PATCH is a clear 422 instead of a silent no-op. */
export const updateProjectSchema = createProjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update" },
);

export const listProjectsQuerySchema = z.object({
  q: trimmed(120).optional(),
  status: projectStatusSchema.optional(),
  reviewState: reviewStateSchema.optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a client cannot request the entire table in one query.
  perPage: z.coerce.number().int().min(1).max(50).default(10),
});

/* ----------------------------------------------------------------- tasks -- */

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createTaskSchema = z.object({
  title: trimmed(160).min(2, "Title must be at least 2 characters"),
  description: trimmed(2000).default(""),
  status: taskStatusSchema.default("TODO"),
  priority: prioritySchema.default("MEDIUM"),
  dueDate: z.coerce.date().nullish(),
});

export const updateTaskSchema = createTaskSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update" },
);

/* --------------------------------------------------------------- reviews -- */

export const reviewDecisionSchema = z.enum(["COMMENT", "CHANGES_REQUESTED", "APPROVED"]);

export const createReviewSchema = z.object({
  body: trimmed(4000).min(5, "A review needs at least a few words"),
  decision: reviewDecisionSchema.default("COMMENT"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
