import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-sm p-8 text-center">
        <p className="mono text-xs uppercase tracking-wider text-ink-faint">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">Nothing here</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This page does not exist, or it belongs to someone else.
        </p>
        <Link href="/dashboard" className="btn-primary mt-5 w-full">
          Back to your projects
        </Link>
      </div>
    </main>
  );
}
