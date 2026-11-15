import "server-only";
import type { CalendarEvent, Project, Task } from "@prisma/client";
import { dateToYmd, toZoned } from "@/lib/time";
import { taskReminderMinutes } from "./server";

export type TaskDTO = {
  id: string;
  title: string;
  notes: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
  dueTime: string | null;
  repeat: "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY";
  reminder: number | null;
  projectId: string | null;
  completedAt: string | null;
  sourceFileId: string | null;
};

export type ProjectDTO = { id: string; name: string; color: string; open: number };

export type EventDTO = {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  allDay: boolean;
  color: string;
  reminder: number | null;
  /** Local dates and times in the user's timezone. */
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
};

export function taskDTO(t: Task, tz: string): TaskDTO {
  const dueDate = t.dueDate ? dateToYmd(t.dueDate) : null;
  return {
    id: t.id, title: t.title, notes: t.notes, status: t.status, priority: t.priority, dueDate, dueTime: t.dueTime, repeat: t.repeat,
    reminder: taskReminderMinutes(dueDate, t.dueTime, t.remindAt, tz), projectId: t.projectId,
    completedAt: t.completedAt?.toISOString() ?? null, sourceFileId: t.sourceFileId,
  };
}

export function projectDTO(p: Project & { _count?: { tasks: number } }): ProjectDTO {
  return { id: p.id, name: p.name, color: p.color, open: p._count?.tasks ?? 0 };
}

export function eventDTO(e: CalendarEvent, tz: string): EventDTO {
  if (e.allDay) {
    return { id: e.id, title: e.title, notes: e.notes, location: e.location, allDay: true, color: e.color, reminder: e.reminderMinutes, startDate: dateToYmd(e.startAt), endDate: dateToYmd(e.endAt), startTime: null, endTime: null };
  }
  const s = toZoned(e.startAt, tz), en = toZoned(e.endAt, tz);
  return { id: e.id, title: e.title, notes: e.notes, location: e.location, allDay: false, color: e.color, reminder: e.reminderMinutes, startDate: s.ymd, endDate: en.ymd, startTime: s.hm, endTime: en.hm };
}

/** Task ordering for lists: dated first by date/time, then by priority, then newest. */
const PRI = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 } as const;
export function sortTasks(a: TaskDTO, b: TaskDTO) {
  if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate < b.dueDate ? -1 : 1;
  if (a.dueTime !== b.dueTime) return !a.dueTime ? 1 : !b.dueTime ? -1 : a.dueTime < b.dueTime ? -1 : 1;
  return PRI[a.priority] - PRI[b.priority];
}
