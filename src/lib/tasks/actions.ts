"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { dateToYmd, isValidHm, isValidYmd, todayIn, ymdToDate, zonedToUtc } from "@/lib/time";
import { parseQuickAdd } from "./parse";
import { nextOccurrence, projectIdForName, PROJECT_COLORS, taskRemindAt, userTimezone } from "./server";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const revalidate = () => {
  revalidatePath("/tasks");
  revalidatePath("/scheduler");
  revalidatePath("/overview");
};

const ymd = z.string().refine(isValidYmd, "Choose a valid date");
const hm = z.string().refine(isValidHm, "Choose a valid time");
const reminder = z.number().int().min(0).max(10080).nullable();

// ───────────── Tasks ─────────────

export async function quickAddTask(raw: string, defaults: { projectId?: string | null; dueDate?: string | null } = {}): Promise<ActionResult> {
  const user = await requireUser();
  const text = String(raw ?? "").trim().slice(0, 500);
  if (!text) return { ok: false, error: "Type a task" };
  if (!(await rateLimit(`task:${user.id}`, 300, 3600))) return { ok: false, error: "Too many tasks created this hour" };
  const tz = await userTimezone(user.profile?.timezone);
  const p = parseQuickAdd(text, todayIn(tz));
  if (!p.title) return { ok: false, error: "Add a title as well as the date" };
  const projectId = p.project ? await projectIdForName(user.id, p.project) : await ownProjectId(user.id, defaults.projectId);
  const dueDate = p.dueDate ?? (defaults.dueDate && isValidYmd(defaults.dueDate) ? defaults.dueDate : null);
  const task = await db.task.create({
    data: {
      userId: user.id,
      title: p.title.slice(0, 300),
      priority: p.priority,
      repeat: p.repeat,
      projectId,
      dueDate: dueDate ? ymdToDate(dueDate) : null,
      dueTime: dueDate ? p.dueTime : null,
      // A specific time gets a reminder at that time by default.
      remindAt: dueDate && p.dueTime ? taskRemindAt(dueDate, p.dueTime, 0, tz) : null,
      position: await nextPosition(user.id, "TODO"),
    },
  });
  revalidate();
  return { ok: true, id: task.id };
}

const taskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(300),
  notes: z.string().trim().max(5000).optional().default(""),
  projectId: z.string().nullable().optional(),
  priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: ymd.nullable(),
  dueTime: hm.nullable(),
  repeat: z.enum(["NONE", "DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"]),
  reminder,
});
export type TaskInput = z.input<typeof taskInput>;

export async function saveTask(id: string | null, raw: TaskInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  if (v.repeat !== "NONE" && !v.dueDate) return { ok: false, error: "Repeating tasks need a due date" };
  const tz = await userTimezone(user.profile?.timezone);
  const remindAt = taskRemindAt(v.dueDate, v.dueDate ? v.dueTime : null, v.reminder, tz);
  const data = {
    title: v.title,
    notes: v.notes || null,
    projectId: await ownProjectId(user.id, v.projectId),
    priority: v.priority,
    dueDate: v.dueDate ? ymdToDate(v.dueDate) : null,
    dueTime: v.dueDate ? v.dueTime : null,
    repeat: v.repeat,
    remindAt,
  };
  if (id) {
    const existing = await db.task.findFirst({ where: { id, userId: user.id } });
    if (!existing) return { ok: false, error: "Task not found" };
    const reminderChanged = existing.remindAt?.getTime() !== remindAt?.getTime();
    await db.task.update({
      where: { id },
      data: { ...data, ...(reminderChanged ? { remindedAt: null } : {}), ...(v.status && v.status !== existing.status ? statusChange(v.status) : {}) },
    });
    if (v.status === "DONE" && existing.status !== "DONE") await spawnNextRepeat(existing.id);
    revalidate();
    return { ok: true, id };
  }
  const status = v.status ?? "TODO";
  const task = await db.task.create({ data: { ...data, userId: user.id, ...statusChange(status), position: await nextPosition(user.id, status) } });
  revalidate();
  return { ok: true, id: task.id };
}

function statusChange(status: "TODO" | "IN_PROGRESS" | "DONE") {
  return { status, completedAt: status === "DONE" ? new Date() : null };
}

/** Completes or reopens a task. Completing a repeating task schedules its next occurrence. */
export async function toggleTask(id: string, done: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const task = await db.task.findFirst({ where: { id, userId: user.id } });
  if (!task) return { ok: false, error: "Task not found" };
  if ((task.status === "DONE") === done) return { ok: true };
  await db.task.update({ where: { id }, data: statusChange(done ? "DONE" : "TODO") });
  if (done) await spawnNextRepeat(id);
  revalidate();
  return { ok: true };
}

async function spawnNextRepeat(id: string) {
  const t = await db.task.findUnique({ where: { id } });
  if (!t || t.repeat === "NONE" || !t.dueDate) return;
  const tz = await userTimezone((await db.profile.findUnique({ where: { userId: t.userId }, select: { timezone: true } }))?.timezone);
  // Skip ahead past today so finishing an old overdue habit doesn't create another overdue one.
  const today = todayIn(tz);
  let next = nextOccurrence(dateToYmd(t.dueDate), t.repeat);
  for (let i = 0; next && next < today && i < 400; i++) next = nextOccurrence(next, t.repeat);
  if (!next) return;
  const minutesBefore = t.remindAt ? Math.round((zonedToUtc(dateToYmd(t.dueDate), t.dueTime ?? "09:00", tz).getTime() - t.remindAt.getTime()) / 60_000) : null;
  await db.$transaction([
    // The finished task stops repeating; the new one carries the rule forward.
    db.task.update({ where: { id }, data: { repeat: "NONE" } }),
    db.task.create({
      data: {
        userId: t.userId, projectId: t.projectId, title: t.title, notes: t.notes, priority: t.priority, repeat: t.repeat,
        dueDate: ymdToDate(next), dueTime: t.dueTime, sourceFileId: t.sourceFileId,
        remindAt: minutesBefore === null ? null : taskRemindAt(next, t.dueTime, Math.max(0, minutesBefore), tz),
        position: await nextPosition(t.userId, "TODO"),
      },
    }),
  ]);
}

/** Moves a task on the board: to a status column, placed between two neighbours. */
export async function moveTask(id: string, status: "TODO" | "IN_PROGRESS" | "DONE", beforeId: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) return { ok: false, error: "Unknown column" };
  const task = await db.task.findFirst({ where: { id, userId: user.id } });
  if (!task) return { ok: false, error: "Task not found" };
  let position: number;
  if (beforeId) {
    const before = await db.task.findFirst({ where: { id: beforeId, userId: user.id, status } });
    if (!before) return { ok: false, error: "Task not found" };
    const prev = await db.task.findFirst({ where: { userId: user.id, status, position: { lt: before.position }, id: { not: id } }, orderBy: { position: "desc" } });
    position = prev ? (prev.position + before.position) / 2 : before.position - 1;
  } else {
    position = await nextPosition(user.id, status);
  }
  await db.task.update({ where: { id }, data: { position, ...(task.status !== status ? statusChange(status) : {}) } });
  if (status === "DONE" && task.status !== "DONE") await spawnNextRepeat(id);
  revalidate();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.task.deleteMany({ where: { id, userId: user.id } });
  revalidate();
  return { ok: true };
}

export async function clearCompleted(projectId: string | null): Promise<ActionResult> {
  const user = await requireUser();
  await db.task.deleteMany({ where: { userId: user.id, status: "DONE", ...(projectId ? { projectId } : {}) } });
  revalidate();
  return { ok: true };
}

async function nextPosition(userId: string, status: "TODO" | "IN_PROGRESS" | "DONE") {
  const last = await db.task.findFirst({ where: { userId, status }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? 0) + 1;
}

async function ownProjectId(userId: string, projectId: string | null | undefined) {
  if (!projectId) return null;
  const p = await db.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  return p?.id ?? null;
}

// ───────────── Projects ─────────────

const projectInput = z.object({
  name: z.string().trim().min(1, "Name the project").max(40, "Keep the name under 40 characters"),
  color: z.enum(PROJECT_COLORS),
});

export async function saveProject(id: string | null, raw: { name: string; color: string }): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = projectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const clash = await db.project.findFirst({ where: { userId: user.id, name: { equals: parsed.data.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return { ok: false, error: "You already have a project with that name" };
  if (id) {
    const { count } = await db.project.updateMany({ where: { id, userId: user.id }, data: parsed.data });
    if (!count) return { ok: false, error: "Project not found" };
    revalidate();
    return { ok: true, id };
  }
  const p = await db.project.create({ data: { userId: user.id, ...parsed.data } });
  revalidate();
  return { ok: true, id: p.id };
}

/** Deleting a project keeps its tasks (they move to "No project") unless deleteTasks is set. */
export async function deleteProject(id: string, deleteTasks: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const p = await db.project.findFirst({ where: { id, userId: user.id } });
  if (!p) return { ok: false, error: "Project not found" };
  await db.$transaction([
    deleteTasks ? db.task.deleteMany({ where: { projectId: id, userId: user.id } }) : db.task.updateMany({ where: { projectId: id, userId: user.id }, data: { projectId: null } }),
    db.project.delete({ where: { id } }),
  ]);
  revalidate();
  return { ok: true };
}

// ───────────── Calendar events ─────────────

const eventInput = z.object({
  title: z.string().trim().min(1, "Give the event a title").max(200),
  notes: z.string().trim().max(5000).optional().default(""),
  location: z.string().trim().max(200).optional().default(""),
  startDate: ymd,
  endDate: ymd,
  startTime: hm.nullable(),
  endTime: hm.nullable(),
  allDay: z.boolean(),
  color: z.enum(PROJECT_COLORS),
  reminder,
});
export type EventInput = z.input<typeof eventInput>;

export async function saveEvent(id: string | null, raw: EventInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = eventInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const v = parsed.data;
  if (!(await rateLimit(`event:${user.id}`, 300, 3600))) return { ok: false, error: "Too many changes this hour" };
  const tz = await userTimezone(user.profile?.timezone);
  let startAt: Date, endAt: Date;
  if (v.allDay) {
    if (v.endDate < v.startDate) return { ok: false, error: "The event ends before it starts" };
    startAt = ymdToDate(v.startDate);
    endAt = ymdToDate(v.endDate);
  } else {
    if (!v.startTime || !v.endTime) return { ok: false, error: "Choose start and end times, or make it all day" };
    startAt = zonedToUtc(v.startDate, v.startTime, tz);
    endAt = zonedToUtc(v.endDate, v.endTime, tz);
    if (endAt <= startAt) return { ok: false, error: "The event must end after it starts" };
  }
  if (endAt.getTime() - startAt.getTime() > 62 * 86_400_000) return { ok: false, error: "Events can last up to two months" };
  const remindAt =
    v.reminder === null ? null : new Date((v.allDay ? zonedToUtc(v.startDate, "09:00", tz) : startAt).getTime() - v.reminder * 60_000);
  const data = { title: v.title, notes: v.notes || null, location: v.location || null, startAt, endAt, allDay: v.allDay, color: v.color, reminderMinutes: v.reminder, remindAt };
  if (id) {
    const existing = await db.calendarEvent.findFirst({ where: { id, userId: user.id } });
    if (!existing) return { ok: false, error: "Event not found" };
    const changed = existing.remindAt?.getTime() !== remindAt?.getTime();
    await db.calendarEvent.update({ where: { id }, data: { ...data, ...(changed ? { remindedAt: null } : {}) } });
    revalidate();
    return { ok: true, id };
  }
  const e = await db.calendarEvent.create({ data: { ...data, userId: user.id } });
  revalidate();
  return { ok: true, id: e.id };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.calendarEvent.deleteMany({ where: { id, userId: user.id } });
  revalidate();
  return { ok: true };
}
