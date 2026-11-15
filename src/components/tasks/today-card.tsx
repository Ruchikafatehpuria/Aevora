"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Clock } from "lucide-react";
import type { EventDTO, ProjectDTO, TaskDTO } from "@/lib/tasks/queries";
import { formatHm } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { QuickAdd } from "./quick-add";
import { TaskEditor, type TaskDraft } from "./task-editor";
import { colorOf } from "./shared";
import { TaskRow } from "./tasks-view";

/** Home page summary: today's events, plus overdue and due-today tasks you can tick off in place. */
export function TodayCard({ today, tasks, events, projects, upcoming }: { today: string; tasks: TaskDTO[]; events: EventDTO[]; projects: ProjectDTO[]; upcoming: number }) {
  const [editing, setEditing] = useState<TaskDraft | null>(null);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const overdue = tasks.filter((t) => t.dueDate! < today).length;
  const description = [
    events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : null,
    `${tasks.length} task${tasks.length === 1 ? "" : "s"} due`,
    overdue ? `${overdue} overdue` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Today" description={description} action={<Link href="/scheduler" className={buttonClass("secondary", "sm")}><CalendarClock className="h-4 w-4" /> Calendar</Link>} />
      {events.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/scheduler?date=${today}&event=${e.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60">
                <span className={cn("h-8 w-1 shrink-0 rounded-full", colorOf(e.color).dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-2">
                    <Clock className="h-3 w-3" /> {e.allDay ? "All day" : `${e.startDate === today ? formatHm(e.startTime!) : "…"} – ${e.endDate === today ? formatHm(e.endTime!) : "…"}`}
                    {e.location && <span className="truncate text-ink-3"> · {e.location}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > 0 ? (
        <ul>
          {tasks.map((t) => <TaskRow key={t.id} task={t} project={t.projectId ? byId.get(t.projectId) : undefined} today={today} onOpen={setEditing} />)}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-2">
          Nothing due today.{upcoming > 0 && <> <Link href="/tasks?f=upcoming" className="text-primary hover:underline">{upcoming} coming up this week</Link>.</>}
        </p>
      )}
      <div className="border-t border-border p-3">
        <QuickAdd today={today} dueDate={today} compact placeholder="Add a task for today… (or type a date)" />
      </div>
      <TaskEditor task={editing} projects={projects} onClose={() => setEditing(null)} />
    </Card>
  );
}
