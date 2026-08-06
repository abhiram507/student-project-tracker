import { notFound, redirect } from "next/navigation";
import { getActor, getSession } from "@/lib/auth/session-cookie";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/Nav";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { canEditProject, canReviewProject, canSubmitForReview } from "@/lib/auth/rbac";
import { getProject } from "@/lib/services/project.service";
import { listReviews } from "@/lib/services/review.service";
import { listTasks } from "@/lib/services/task.service";
import { AppError } from "@/lib/http/errors";

/**
 * The initial render calls the service layer directly rather than fetching its
 * own API over HTTP — same authorisation, no extra round trip, no loading
 * flash. Mutations from the client go through the REST API. Both paths land on
 * the same services, so there is one place where the rules live.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const actor = await getActor();
  if (!session || !actor) redirect("/login");

  const { id } = await params;

  try {
    const [project, tasks, reviews] = await Promise.all([
      getProject(prisma, actor, id),
      listTasks(prisma, actor, id),
      listReviews(prisma, actor, id),
    ]);

    const owned = { ownerId: project.owner.id };

    return (
      <>
        <Nav session={session} current="/dashboard" />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <ProjectWorkspace
            project={project}
            tasks={tasks}
            reviews={reviews}
            permissions={{
              canEdit: canEditProject(actor, owned),
              canReview: canReviewProject(actor, owned),
              canSubmit: canSubmitForReview(actor, owned),
            }}
          />
        </main>
      </>
    );
  } catch (error) {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}
