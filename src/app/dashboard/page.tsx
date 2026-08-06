import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-cookie";
import { Nav } from "@/components/Nav";
import { ProjectBoard } from "@/components/ProjectBoard";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <Nav session={session} current="/dashboard" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your projects</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Track what you are building, break it into tasks, and send it for mentor review.
        </p>
        <div className="mt-6">
          <ProjectBoard scope="mine" canCreate />
        </div>
      </main>
    </>
  );
}
