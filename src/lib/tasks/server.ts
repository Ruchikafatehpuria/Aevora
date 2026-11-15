import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { addDays, addMonths, dateToYmd, isValidTimezone, todayIn, toZoned, weekday, zonedToUtc, type Ymd } from "@/lib/time";
import type { Repeat } from "@prisma/client";

export const TZ_COOKIE = "syncly_tz";

/** The user's timezone: profile setting, else the browser's (sent as a cookie by the app shell), else UTC. */
export async function userTimezone(profileTz?: string | null) {
  if (isValidTimezone(profileTz)) return profileTz;
  const fromBrowser = (await cookies()).get(TZ_COOKIE)?.value;
  return isValidTimezone(fromBrowser) ? fromBrowser : "UTC";
}

export const REMINDER_CHOICES = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At the time" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
] as const;

/** Tasks with a date but no time are reminded at 9:00 that morning (or the day before for "1 day before"). */
export function taskRemindAt(dueDate: Ymd | null, dueTime: string | null, minutesBefore: number | null, tz: string) {
  if (!dueDate || minutesBefore === null) return null;
  const at = zonedToUtc(dueDate, dueTime ?? "09:00", tz);
  return new Date(at.getTime() - (dueTime || minutesBefore >= 1440 ? minutesBefore : 0) * 60_000);
}

/** Reverses taskRemindAt so the editor can show the current choice. */
export function taskReminderMinutes(dueDate: Ymd | null, dueTime: string | null, remindAt: Date | null, tz: string) {
  if (!dueDate || !remindAt) return null;
  const at = zonedToUtc(dueDate, dueTime ?? "09:00", tz);
  return Math.max(0, Math.round((at.getTime() - remindAt.getTime()) / 60_000));
}

export function nextOccurrence(from: Ymd, repeat: Repeat): Ymd | null {
  switch (repeat) {
    case "DAILY":
      return addDays(from, 1);
    case "WEEKDAYS": {
      let d = addDays(from, 1);
      while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
      return d;
    }
    case "WEEKLY":
      return addDays(from, 7);
    case "MONTHLY":
      return addMonths(from, 1);
    default:
      return null;
  }
}

/** Finds or creates a project by name (case-insensitive) for quick-add "#name". */
export async function projectIdForName(userId: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const existing = await db.project.findFirst({ where: { userId, name: { equals: clean, mode: "insensitive" } } });
  if (existing) {
    if (existing.archivedAt) await db.project.update({ where: { id: existing.id }, data: { archivedAt: null } });
    return existing.id;
  }
  const count = await db.project.count({ where: { userId } });
  const project = await db.project.create({ data: { userId, name: clean, color: PROJECT_COLORS[count % PROJECT_COLORS.length]! } });
  return project.id;
}

export const PROJECT_COLORS = ["teal", "violet", "amber", "rose", "sky", "lime", "indigo", "orange"] as const;

/** Creates in-app notifications for reminders that are due and returns them. */
export async function fireDueReminders(userId: string) {
  const now = new Date();
  const [tasks, events] = await Promise.all([
    db.task.findMany({ where: { userId, remindAt: { lte: now }, remindedAt: null, status: { not: "DONE" } }, take: 20 }),
    db.calendarEvent.findMany({ where: { userId, remindAt: { lte: now }, remindedAt: null, endAt: { gte: addHours(now, -12) } }, take: 20 }),
  ]);
  if (!tasks.length && !events.length) return [];
  const tz = await userTimezone((await db.profile.findUnique({ where: { userId }, select: { timezone: true } }))?.timezone);
  const today = todayIn(tz);
  const fired: { title: string; body: string; href: string }[] = [];
  for (const t of tasks) {
    // Claim the reminder first so two tabs polling at once can't both send it.
    const claimed = await db.task.updateMany({ where: { id: t.id, remindedAt: null }, data: { remindedAt: now } });
    if (!claimed.count) continue;
    const due = t.dueDate ? dateToYmd(t.dueDate) : null;
    const body = due ? `Due ${due === today ? "today" : due}${t.dueTime ? ` at ${t.dueTime}` : ""}` : "Task reminder";
    fired.push({ title: `⏰ ${t.title}`, body, href: `/tasks?task=${t.id}` });
  }
  for (const e of events) {
    const claimed = await db.calendarEvent.updateMany({ where: { id: e.id, remindedAt: null }, data: { remindedAt: now } });
    if (!claimed.count) continue;
    const mins = Math.round((e.startAt.getTime() - now.getTime()) / 60_000);
    const body = e.allDay ? "All day today" : mins > 1 ? `Starts in ${mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`}` : "Starting now";
    fired.push({ title: `📅 ${e.title}`, body, href: `/scheduler?date=${e.allDay ? dateToYmd(e.startAt) : toZoned(e.startAt, tz).ymd}&event=${e.id}` });
  }
  if (fired.length) await db.notification.createMany({ data: fired.map((f) => ({ userId, ...f })) });
  return fired;
}

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
