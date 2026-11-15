import "server-only";
import { db } from "@/lib/db";
import { addDays, dateToYmd, DAY_SHORT, weekday, ymdToDate } from "@/lib/time";

/** "Fri 2026-11-20": weekday names stop the model guessing them wrongly. */
const d = (ymd: string) => `${DAY_SHORT[weekday(ymd)]} ${ymd}`;
import { eventDTO } from "@/lib/tasks/queries";

/** A compact plain-text agenda (open tasks and events, overdue through the next 14 days) for the assistant. */
export async function agendaText(userId: string, today: string, tz: string): Promise<string | null> {
  const horizon = addDays(today, 14);
  const [tasks, undated, events, projects] = await Promise.all([
    db.task.findMany({ where: { userId, status: { not: "DONE" }, dueDate: { lte: ymdToDate(horizon) } }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 40 }),
    db.task.findMany({ where: { userId, status: { not: "DONE" }, dueDate: null }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.calendarEvent.findMany({ where: { userId, endAt: { gte: ymdToDate(addDays(today, -1)) }, startAt: { lte: ymdToDate(addDays(horizon, 1)) } }, orderBy: { startAt: "asc" }, take: 40 }),
    db.project.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const days = Array.from({ length: 15 }, (_, i) => d(addDays(today, i))).join(", ");
  const reference = `Dates for reference: ${days}.`;
  if (!tasks.length && !undated.length && !events.length) return `${reference}\nNo open tasks or events in the next two weeks.`;
  const proj = new Map(projects.map((p) => [p.id, p.name]));
  const taskLine = (t: (typeof tasks)[number]) => {
    const due = t.dueDate ? dateToYmd(t.dueDate) : null;
    return `- ${t.title}${due ? ` (due ${d(due)}${t.dueTime ? ` ${t.dueTime}` : ""}${due < today ? ", OVERDUE" : ""})` : ""}${t.priority !== "NONE" ? ` [${t.priority.toLowerCase()} priority]` : ""}${t.status === "IN_PROGRESS" ? " [in progress]" : ""}${t.projectId && proj.get(t.projectId) ? ` #${proj.get(t.projectId)}` : ""}`;
  };
  const lines: string[] = [reference];
  if (tasks.length) lines.push("Tasks with due dates:", ...tasks.map(taskLine));
  if (undated.length) lines.push("Tasks without a date:", ...undated.map(taskLine));
  const evs = events.map((e) => eventDTO(e, tz)).filter((e) => e.endDate >= today && e.startDate <= horizon);
  if (evs.length) {
    lines.push("Calendar events:");
    for (const e of evs) {
      lines.push(`- ${e.title}: ${e.allDay ? `${d(e.startDate)}${e.endDate !== e.startDate ? ` to ${d(e.endDate)}` : ""} (all day)` : `${d(e.startDate)} ${e.startTime}–${e.endDate !== e.startDate ? `${d(e.endDate)} ` : ""}${e.endTime}`}${e.location ? ` at ${e.location}` : ""}`);
    }
  }
  return lines.join("\n");
}
