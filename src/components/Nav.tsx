import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import type { SessionPayload } from "@/lib/auth/session";

export function Nav({ session, current }: { session: SessionPayload; current: string }) {
  const canReview = session.role === "MENTOR" || session.role === "ADMIN";

  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={current === href ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-sm ${
        current === href ? "bg-surface-sunk font-medium text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-surface-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="mono text-sm font-semibold tracking-tight text-ink">
          project<span className="text-accent">/</span>tracker
        </Link>

        <nav className="flex items-center gap-1">
          {link("/dashboard", "Projects")}
          {canReview && link("/review-queue", "Review queue")}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="mono hidden text-xs text-ink-soft sm:inline">
            {session.name} · {session.role.toLowerCase()}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
