import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-cookie";
import { Nav } from "@/components/Nav";
import { ProjectBoard } from "@/components/ProjectBoard";

export default async function ReviewQueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Rendering is gated here and the data is gated again in the service layer.
  if (session.role === "STUDENT") redirect("/dashboard");

  return (
    <>
      <Nav session={session} current="/review-queue" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Review queue</h1>
        <p className="mt-1 text-sm text-ink-soft">Projects students have submitted and are waiting on you.</p>
        <div className="mt-6">
          <ProjectBoard scope="all" initialReviewState="SUBMITTED" canCreate={false} />
        </div>
      </main>
    </>
  );
}
