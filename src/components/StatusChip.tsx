import type { ProjectStatus, ReviewState, Priority, TaskStatus } from "@prisma/client";

/**
 * Status is shown as a labelled chip, never as colour alone — a colour-blind
 * reader gets the same information as anyone else.
 */

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const REVIEW_STATE: Record<ReviewState, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-surface-sunk text-ink-soft border border-surface-line" },
  SUBMITTED: { label: "In review", className: "bg-accent-soft text-accent" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "bg-[#fff4e0] text-warn" },
  APPROVED: { label: "Approved", className: "bg-[#e6f5ec] text-good" },
};

const PROJECT_STATUS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const TASK_STATUS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const PRIORITY: Record<Priority, { label: string; className: string }> = {
  LOW: { label: "Low", className: "text-ink-faint" },
  MEDIUM: { label: "Medium", className: "text-ink-soft" },
  HIGH: { label: "High", className: "text-bad" },
};

export function ReviewStateChip({ state }: { state: ReviewState }) {
  const { label, className } = REVIEW_STATE[state];
  return <span className={`${chip} ${className}`}>{label}</span>;
}

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span className={`${chip} border border-surface-line bg-white text-ink-soft`}>{PROJECT_STATUS[status]}</span>
  );
}

export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  return <span className="mono text-xs text-ink-soft">{TASK_STATUS[status]}</span>;
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const { label, className } = PRIORITY[priority];
  return <span className={`mono text-xs ${className}`}>{label}</span>;
}
