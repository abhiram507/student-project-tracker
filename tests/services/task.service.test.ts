import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/lib/auth/rbac";
import { createTask, deleteTask, listTasks, updateTask } from "@/lib/services/task.service";
import { ForbiddenError, NotFoundError } from "@/lib/http/errors";

let db: DeepMockProxy<PrismaClient>;

const student: Actor = { id: "u-student", role: "STUDENT" };
const intruder: Actor = { id: "u-intruder", role: "STUDENT" };
const mentor: Actor = { id: "u-mentor", role: "MENTOR" };

const ownedProject = { ownerId: "u-student" };

beforeEach(() => {
  db = mockDeep<PrismaClient>();
});

describe("listTasks", () => {
  it("returns tasks to the owner", async () => {
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    db.task.findMany.mockResolvedValue([{ id: "t1" }] as never);
    await expect(listTasks(db, student, "p1")).resolves.toHaveLength(1);
  });

  it("lets a mentor read tasks, since review requires seeing the work", async () => {
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    db.task.findMany.mockResolvedValue([] as never);
    await expect(listTasks(db, mentor, "p1")).resolves.toEqual([]);
  });

  it("refuses an unrelated student", async () => {
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    await expect(listTasks(db, intruder, "p1")).rejects.toBeInstanceOf(NotFoundError);
    expect(db.task.findMany).not.toHaveBeenCalled();
  });

  it("404s when the parent project is missing", async () => {
    db.project.findUnique.mockResolvedValue(null);
    await expect(listTasks(db, student, "gone")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createTask", () => {
  it("attaches the task to the requested project for its owner", async () => {
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    db.task.create.mockResolvedValue({ id: "t1" } as never);

    await createTask(db, student, "p1", {
      title: "Write tests",
      description: "",
      status: "TODO",
      priority: "HIGH",
      dueDate: null,
    });

    const args = db.task.create.mock.calls[0]![0] as { data: { projectId: string } };
    expect(args.data.projectId).toBe("p1");
  });

  it("refuses a mentor — reviewing is not editing", async () => {
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    await expect(
      createTask(db, mentor, "p1", {
        title: "Sneaky",
        description: "",
        status: "TODO",
        priority: "LOW",
        dueDate: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.task.create).not.toHaveBeenCalled();
  });
});

describe("updateTask", () => {
  it("re-checks the parent project rather than trusting the task id", async () => {
    db.task.findUnique.mockResolvedValue({ projectId: "p1" } as never);
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    db.task.update.mockResolvedValue({ id: "t1", status: "DONE" } as never);

    await updateTask(db, student, "t1", { status: "DONE" });

    expect(db.project.findUnique).toHaveBeenCalled();
  });

  it("blocks an intruder who guessed a valid task id", async () => {
    db.task.findUnique.mockResolvedValue({ projectId: "p1" } as never);
    db.project.findUnique.mockResolvedValue(ownedProject as never);

    await expect(updateTask(db, intruder, "t1", { status: "DONE" })).rejects.toBeInstanceOf(NotFoundError);
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("404s for a task that does not exist", async () => {
    db.task.findUnique.mockResolvedValue(null);
    await expect(updateTask(db, student, "missing", { status: "DONE" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteTask", () => {
  it("blocks an intruder and never reaches the delete", async () => {
    db.task.findUnique.mockResolvedValue({ projectId: "p1" } as never);
    db.project.findUnique.mockResolvedValue(ownedProject as never);

    await expect(deleteTask(db, intruder, "t1")).rejects.toBeInstanceOf(NotFoundError);
    expect(db.task.delete).not.toHaveBeenCalled();
  });

  it("allows the owner", async () => {
    db.task.findUnique.mockResolvedValue({ projectId: "p1" } as never);
    db.project.findUnique.mockResolvedValue(ownedProject as never);
    db.task.delete.mockResolvedValue({} as never);
    await expect(deleteTask(db, student, "t1")).resolves.toBeUndefined();
  });
});
