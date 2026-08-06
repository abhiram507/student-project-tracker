import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Only same-origin relative paths are honoured, so `?next=https://evil.example`
  // cannot turn the login page into an open redirect.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthForm mode="login" nextPath={safeNext} />
    </main>
  );
}
