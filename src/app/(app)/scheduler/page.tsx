import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addDays, isValidYmd, todayIn, weekday, ymdToDate } from "@/lib/time";
import { userTimezone } from "@/lib/tasks/server";
import { eventDTO, projectDTO, sortTasks, taskDTO } from "@/lib/tasks/queries";
import { PageHeader } from "@/components/shell/page-header";
import { CalendarView } from "@/components/tasks/calendar-view";

export const metadata = { title: "Scheduler" };

/** Monday on or before the date (weeks start on Monday). */
const startOfWeek = (d: string) => addDays(d, -((weekday(d) + 6) % 7));

export default async function SchedulerPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; event?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = await userTimezone(user.profile?.timezone);
  const today = todayIn(tz);
  const anchor = isValidYmd(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "month";

  let rangeStart: string, rangeEnd: string;
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    rangeStart = startOfWeek(first);
    const lastOfMonth = addDays(nextMonth(first), -1);
    rangeEnd = addDays(startOfWeek(lastOfMonth), 6);
  } else {
    rangeStart = startOfWeek(anchor);
    rangeEnd = addDays(rangeStart, 6);
  }
  // Pad by a day on each side so timed events near midnight in any timezone are included.
  const from = ymdToDate(addDays(rangeStart, -1));
  const to = ymdToDate(addDays(rangeEnd, 2));

  const [events, tasks, projects] = await Promise.all([
    db.calendarEvent.findMany({ where: { userId: user.id, startAt: { lt: to }, endAt: { gte: from } }, orderBy: { startAt: "asc" }, take: 1000 }),
    db.task.findMany({ where: { userId: user.id, dueDate: { gte: ymdToDate(rangeStart), lte: ymdToDate(rangeEnd) } }, take: 1000 }),
    db.project.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);

  const selected = anchor >= rangeStart && anchor <= rangeEnd ? anchor : rangeStart;

  return (
    <>
      <PageHeader title="Scheduler" description="Your calendar: events, task due dates and reminders in one view." />
      <CalendarView
        view={view}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        anchor={anchor}
        today={today}
        selected={selected}
        events={events.map((e) => eventDTO(e, tz))}
        tasks={tasks.map((t) => taskDTO(t, tz)).sort(sortTasks)}
        projects={projects.map(projectDTO)}
        openEventId={sp.event ?? null}
      />
    </>
  );
}

function nextMonth(firstOfMonth: string) {
  const [y, m] = firstOfMonth.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
}
