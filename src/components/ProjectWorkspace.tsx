"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Priority, Task, TaskStatus } from "@prisma/client";
import { api, describeError } from "@/lib/api-client";
import { PriorityLabel, ProjectStatusChip, ReviewStateChip } from "@/components/StatusChip";
import { TaskLedger } from "@/components/TaskLedger";
import type { ProjectSummary } from "@/lib/services/project.service";
import type { ReviewView } from "@/lib/services/review.service";

interface Props {
  project: ProjectSummary;
  tasks: Task[];
  reviews: ReviewView[];
  /** Computed on the server from the session — the API enforces all of this again. */
  permissions: { canEdit: boolean; canReview: boolean; canSubmit: boolean };
}

const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH"];

export function ProjectWorkspace({ project, tasks, reviews, permissions }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("MEDIUM");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"COMMENT" | "CHANGES_REQUESTED" | "APPROVED">("COMMENT");

  /** Every mutation goes through here: one place for the busy flag, errors and refresh. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const grouped = TASK_STATUSES.map((status) => ({
    status,
    items: tasks.filter((task) => task.status === status),
  }));

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{project.title}</h1>
            <p className="mono mt-1 text-xs text-ink-faint">
              {project.owner.name} · created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ProjectStatusChip status={project.status} />
            <ReviewStateChip state={project.reviewState} />
          </div>
        </div>

        {project.description && <p className="mt-3 text-sm text-ink-soft">{project.description}</p>}

        {(project.githubUrl || project.liveUrl) && (
          <div className="mono mt-3 flex flex-wrap gap-4 text-xs">
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Repository ↗
              </a>
            )}
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Live demo ↗
              </a>
            )}
          </div>
        )}

        <div className="mt-4 max-w-sm">
          <TaskLedger counts={project.taskCounts} progress={project.progress} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-[#fdf1f0] px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-surface-line pt-4">
          {permissions.canSubmit && (
            <button
              type="button"
              disabled={busy || project.reviewState === "SUBMITTED"}
              onClick={() => run(() => api.post(`/api/projects/${project.id}/submit`))}
              className="btn-primary"
            >
              {project.reviewState === "SUBMITTED" ? "Waiting on a mentor" : "Send for mentor review"}
            </button>
          )}

          {permissions.canEdit && (
            <>
              <select
                className="field w-auto"
                value={project.status}
                disabled={busy}
                aria-label="Project status"
                onChange={(e) => run(() => api.patch(`/api/projects/${project.id}`, { status: e.target.value }))}
              >
                <option value="PLANNING">Planning</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>

              <button
                type="button"
                disabled={busy}
                className="btn-danger"
                onClick={() => {
                  if (!confirm(`Delete "${project.title}" and all of its tasks? This cannot be undone.`)) return;
                  void run(async () => {
                    await api.del(`/api/projects/${project.id}`);
                    router.push("/dashboard");
                  });
                }}
              >
                Delete project
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Tasks</h2>

        {permissions.canEdit && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="field"
              placeholder="Add a task"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !taskTitle.trim()) return;
                void run(async () => {
                  await api.post(`/api/projects/${project.id}/tasks`, {
                    title: taskTitle.trim(),
                    priority: taskPriority,
                  });
                  setTaskTitle("");
                });
              }}
              aria-label="New task title"
            />
            <select
              className="field sm:w-32"
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as Priority)}
              aria-label="Task priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary shrink-0"
              disabled={busy || !taskTitle.trim()}
              onClick={() =>
                run(async () => {
                  await api.post(`/api/projects/${project.id}/tasks`, {
                    title: taskTitle.trim(),
                    priority: taskPriority,
                  });
                  setTaskTitle("");
                })
              }
            >
              Add task
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            No tasks yet. Break the project into pieces small enough to finish in a sitting.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {grouped.map(({ status, items }) => (
              <div key={status}>
                <p className="label">
                  {TASK_STATUS_LABELS[status]} ({items.length})
                </p>
                <ul className="mt-2 space-y-2">
                  {items.map((task) => (
                    <li key={task.id} className="rounded-md border border-surface-line bg-surface-sunk p-3">
                      <p className="text-sm text-ink">{task.title}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <PriorityLabel priority={task.priority} />
                        {permissions.canEdit && (
                          <div className="flex items-center gap-1.5">
                            <select
                              className="mono rounded border border-surface-line bg-white px-1.5 py-0.5 text-xs"
                              value={task.status}
                              disabled={busy}
                              aria-label={`Status of ${task.title}`}
                              onChange={(e) =>
                                run(() => api.patch(`/api/tasks/${task.id}`, { status: e.target.value }))
                              }
                            >
                              {TASK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {TASK_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`Delete ${task.title}`}
                              className="px-1 text-xs text-ink-faint hover:text-bad"
                              onClick={() => run(() => api.del(`/api/tasks/${task.id}`))}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && <li className="mono text-xs text-ink-faint">Empty</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Mentor review</h2>

        {permissions.canReview && (
          <div className="mt-3 space-y-2">
            <textarea
              className="field min-h-24"
              placeholder="What works, what needs to change, and why."
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              aria-label="Review comment"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="field sm:w-56"
                value={reviewDecision}
                onChange={(e) => setReviewDecision(e.target.value as typeof reviewDecision)}
                aria-label="Review decision"
              >
                <option value="COMMENT">Comment only</option>
                <option value="CHANGES_REQUESTED">Request changes</option>
                <option value="APPROVED">Approve</option>
              </select>
              <button
                type="button"
                className="btn-primary shrink-0"
                disabled={busy || reviewBody.trim().length < 5}
                onClick={() =>
                  run(async () => {
                    await api.post(`/api/projects/${project.id}/reviews`, {
                      body: reviewBody.trim(),
                      decision: reviewDecision,
                    });
                    setReviewBody("");
                    setReviewDecision("COMMENT");
                  })
                }
              >
                Post review
              </button>
            </div>
          </div>
        )}

        {reviews.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            {project.reviewState === "SUBMITTED"
              ? "Submitted. A mentor has not commented yet."
              : "No review yet. Send the project for review when it is ready to be looked at."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-md border border-surface-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="mono text-xs text-ink-soft">
                    {review.author.name} · {new Date(review.createdAt).toLocaleString()}
                  </p>
                  {review.decision !== "COMMENT" && (
                    <span
                      className={`mono text-xs font-medium ${
                        review.decision === "APPROVED" ? "text-good" : "text-warn"
                      }`}
                    >
                      {review.decision === "APPROVED" ? "Approved" : "Changes requested"}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{review.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
