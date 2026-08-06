interface Props {
  counts: { total: number; todo: number; inProgress: number; done: number };
  progress: number;
}

/**
 * The task ledger: one segmented bar per project showing done / in progress /
 * to do in proportion, with the numbers spelled out beside it. It is the one
 * piece of the interface meant to be readable at a glance from across a room,
 * which is what a mentor scanning a queue of projects actually needs.
 */
export function TaskLedger({ counts, progress }: Props) {
  if (counts.total === 0) {
    return <p className="mono text-xs text-ink-faint">No tasks yet</p>;
  }

  const pct = (n: number) => `${(n / counts.total) * 100}%`;

  return (
    <div className="space-y-1.5">
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk"
        role="img"
        aria-label={`${progress}% complete: ${counts.done} done, ${counts.inProgress} in progress, ${counts.todo} to do`}
      >
        <div className="bg-good" style={{ width: pct(counts.done) }} />
        <div className="bg-accent" style={{ width: pct(counts.inProgress) }} />
        <div className="bg-surface-line" style={{ width: pct(counts.todo) }} />
      </div>
      <p className="mono text-xs text-ink-soft">
        {progress}% · {counts.done}/{counts.total} done
        {counts.inProgress > 0 && ` · ${counts.inProgress} in progress`}
      </p>
    </div>
  );
}
