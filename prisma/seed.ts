import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seeds a small, realistic dataset so a reviewer can sign in and see a working
 * app in one command. Idempotent — safe to run repeatedly.
 *
 * These credentials are demo-only and are printed to the console on purpose.
 * Nothing here should ever be seeded into a production database.
 */
const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo-password-2026";

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const mentor = await prisma.user.upsert({
    where: { email: "mentor@example.com" },
    update: {},
    create: { email: "mentor@example.com", name: "Sudhir (Mentor)", role: "MENTOR", passwordHash },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@example.com" },
    update: {},
    create: { email: "student@example.com", name: "Abhiram", role: "STUDENT", passwordHash },
  });

  const classmate = await prisma.user.upsert({
    where: { email: "classmate@example.com" },
    update: {},
    create: { email: "classmate@example.com", name: "Priya", role: "STUDENT", passwordHash },
  });

  // Wipe only the demo users' projects so re-seeding does not pile up duplicates.
  await prisma.project.deleteMany({ where: { ownerId: { in: [student.id, classmate.id] } } });

  const tracker = await prisma.project.create({
    data: {
      title: "Student Project Tracker",
      description:
        "Fullstack tracker with auth, project and task CRUD, role-based mentor review, and a tested service layer.",
      githubUrl: "https://github.com/example/student-project-tracker",
      status: "IN_PROGRESS",
      reviewState: "SUBMITTED",
      submittedAt: new Date(),
      ownerId: student.id,
      tasks: {
        create: [
          { title: "Design the schema and indexes", status: "DONE", priority: "HIGH" },
          { title: "Argon2id password hashing", status: "DONE", priority: "HIGH" },
          { title: "Signed session cookies", status: "DONE", priority: "HIGH" },
          { title: "Server-side RBAC on every service", status: "DONE", priority: "HIGH" },
          { title: "Search, filter and pagination", status: "IN_PROGRESS", priority: "MEDIUM" },
          { title: "Write the deployment guide", status: "TODO", priority: "LOW" },
        ],
      },
    },
  });

  await prisma.review.create({
    data: {
      projectId: tracker.id,
      authorId: mentor.id,
      decision: "COMMENT",
      body: "Good separation between routes and services. Add a test for the 404-vs-403 case before I approve.",
    },
  });

  await prisma.project.create({
    data: {
      title: "Campus Resource Booking",
      description: "Book labs and equipment with approval and conflict prevention.",
      status: "PLANNING",
      ownerId: student.id,
      tasks: {
        create: [
          { title: "Model rooms and bookings", status: "TODO", priority: "HIGH" },
          { title: "Overlap detection", status: "TODO", priority: "HIGH" },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      title: "Feedback Aggregator",
      description: "Collect feedback, group duplicates, and track resolution.",
      status: "IN_PROGRESS",
      reviewState: "CHANGES_REQUESTED",
      submittedAt: new Date(Date.now() - 86_400_000),
      ownerId: classmate.id,
      tasks: {
        create: [
          { title: "Ingest form responses", status: "DONE", priority: "MEDIUM" },
          { title: "Cluster near-duplicates", status: "IN_PROGRESS", priority: "HIGH" },
          { title: "Resolution workflow", status: "TODO", priority: "MEDIUM" },
        ],
      },
    },
  });

  console.log("Seeded. Demo accounts (password: %s):", DEMO_PASSWORD);
  console.log("  mentor@example.com    MENTOR  — sees the review queue");
  console.log("  student@example.com   STUDENT — owns two projects");
  console.log("  classmate@example.com STUDENT — proves one student cannot see another's work");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
