import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/time";
import { userTimezone } from "@/lib/tasks/server";
import { projectDTO, sortTasks, taskDTO } from "@/lib/tasks/queries";
import { PageHeader } from "@/components/shell/page-header";
import { TasksView, type TaskFilter } from "@/components/tasks/tasks-view";

export const metadata = { title: "Tasks & Projects" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ f?: string; project?: string; view?: string; task?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = await userTimezone(user.profile?.timezone);
  const today = todayIn(tz);
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [projects, tasks] = await Promise.all([
    db.project.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } },
    }),
    // Open tasks plus anything completed in the last 30 days.
    db.task.findMany({
      where: { userId: user.id, OR: [{ status: { not: "DONE" } }, { completedAt: { gte: since } }, ...(sp.task ? [{ id: sp.task }] : [])] },
      orderBy: [{ position: "asc" }],
      take: 2000,
    }),
  ]);

  const projectIds = new Set(projects.map((p) => p.id));
  const filter: TaskFilter =
    sp.project && projectIds.has(sp.project)
      ? { kind: "project", id: sp.project }
      : sp.f === "today" || sp.f === "upcoming" || sp.f === "none" || sp.f === "all"
        ? { kind: sp.f }
        : { kind: "all" };
  const view = sp.view === "board" ? "board" : "list";
  const dtos = tasks.map((t) => taskDTO(t, tz));

  return (
    <>
      <PageHeader title="Tasks & Projects" description="Plan what matters: quick add, due dates, reminders, repeats and boards." />
      <TasksView
        tasks={view === "board" ? dtos : [...dtos].sort(sortTasks)}
        projects={projects.map(projectDTO)}
        today={today}
        filter={filter}
        view={view}
        openTaskId={sp.task ?? null}
      />
    </>
  );
}
