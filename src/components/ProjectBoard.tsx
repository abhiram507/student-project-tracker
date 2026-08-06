"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, describeError } from "@/lib/api-client";
import { ProjectStatusChip, ReviewStateChip } from "@/components/StatusChip";
import { TaskLedger } from "@/components/TaskLedger";
import type { Paginated, ProjectSummary } from "@/lib/services/project.service";

const STATUSES = ["PLANNING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "ARCHIVED"] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

interface Props {
  /** "mine" on the dashboard, "all" on the mentor review queue. */
  scope: "mine" | "all";
  /** The review queue opens pre-filtered to work that is waiting on a mentor. */
  initialReviewState?: "SUBMITTED";
  canCreate: boolean;
}

export function ProjectBoard({ scope, initialReviewState, canCreate }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [data, setData] = useState<Paginated<ProjectSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // Debounced so typing a query does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ scope, page: String(page), perPage: "10" });
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (status) params.set("status", status);
    if (initialReviewState) params.set("reviewState", initialReviewState);

    try {
      setData(await api.get<Paginated<ProjectSummary>>(`/api/projects?${params}`));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  }, [scope, page, debouncedSearch, status, initialReviewState]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProject() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post("/api/projects", { title: newTitle.trim() });
      setNewTitle("");
      setPage(1);
      await load();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      {canCreate && (
        <div className="card p-4">
          <label className="label" htmlFor="new-project">
            New project
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-project"
              className="field"
              placeholder="What are you building?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createProject()}
            />
            <button
              type="button"
              onClick={createProject}
              disabled={creating || !newTitle.trim()}
              className="btn-primary shrink-0"
            >
              {creating ? "Creating…" : "Create project"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field"
          placeholder="Search titles and descriptions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search projects"
        />
        <select
          className="field sm:w-48"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-[#fdf1f0] px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {loading && !data && <p className="mono text-sm text-ink-faint">Loading projects…</p>}

      {data && data.items.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm font-medium text-ink">Nothing here yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            {debouncedSearch || status
              ? "No project matches those filters. Try clearing the search."
              : scope === "all"
                ? "No project is waiting for review right now."
                : "Create your first project above to start tracking tasks."}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {data?.items.map((project) => (
          <li key={project.id} className="card p-4 transition-colors hover:border-ink-faint">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/projects/${project.id}`}
                  className="text-base font-semibold tracking-tight text-ink hover:text-accent"
                >
                  {project.title}
                </Link>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{project.description}</p>
                )}
                {scope === "all" && (
                  <p className="mono mt-1 text-xs text-ink-faint">{project.owner.name}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ProjectStatusChip status={project.status} />
                <ReviewStateChip state={project.reviewState} />
              </div>
            </div>

            <div className="mt-4 max-w-sm">
              <TaskLedger counts={project.taskCounts} progress={project.progress} />
            </div>
          </li>
        ))}
      </ul>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="mono text-xs text-ink-soft">
            Page {data.page} of {data.totalPages} · {data.total} projects
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
