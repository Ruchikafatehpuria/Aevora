"use client";

import { Flag, Repeat as RepeatIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHm, relativeDay } from "@/lib/time";
import type { TaskDTO } from "@/lib/tasks/queries";

/** Full class names (not built dynamically) so Tailwind keeps them. */
export const COLOR: Record<string, { dot: string; soft: string; text: string; bar: string }> = {
  teal: { dot: "bg-teal-500", soft: "bg-teal-500/12", text: "text-teal-700 dark:text-teal-300", bar: "border-l-teal-500" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-500/12", text: "text-violet-700 dark:text-violet-300", bar: "border-l-violet-500" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-500/14", text: "text-amber-800 dark:text-amber-300", bar: "border-l-amber-500" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-500/12", text: "text-rose-700 dark:text-rose-300", bar: "border-l-rose-500" },
  sky: { dot: "bg-sky-500", soft: "bg-sky-500/12", text: "text-sky-700 dark:text-sky-300", bar: "border-l-sky-500" },
  lime: { dot: "bg-lime-500", soft: "bg-lime-500/14", text: "text-lime-800 dark:text-lime-300", bar: "border-l-lime-500" },
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-500/12", text: "text-indigo-700 dark:text-indigo-300", bar: "border-l-indigo-500" },
  orange: { dot: "bg-orange-500", soft: "bg-orange-500/12", text: "text-orange-700 dark:text-orange-300", bar: "border-l-orange-500" },
};
export const colorOf = (c: string) => COLOR[c] ?? COLOR.teal!;
export const COLOR_NAMES = Object.keys(COLOR);

export const PRIORITY_META = {
  URGENT: { label: "Urgent", cls: "text-danger" },
  HIGH: { label: "High", cls: "text-orange-500" },
  MEDIUM: { label: "Medium", cls: "text-amber-500" },
  LOW: { label: "Low", cls: "text-sky-500" },
  NONE: { label: "None", cls: "text-ink-3" },
} as const;

export const REPEAT_LABEL = { NONE: "Doesn't repeat", DAILY: "Every day", WEEKDAYS: "Every weekday", WEEKLY: "Every week", MONTHLY: "Every month" } as const;

export function PriorityFlag({ priority, className }: { priority: TaskDTO["priority"]; className?: string }) {
  if (priority === "NONE") return null;
  const m = PRIORITY_META[priority];
  return (
    <span className={cn("inline-flex items-center gap-1", m.cls, className)} title={`${m.label} priority`}>
      <Flag className="h-3.5 w-3.5 fill-current" aria-hidden />
      <span className="sr-only">{m.label} priority</span>
    </span>
  );
}

export function DueLabel({ task, today }: { task: Pick<TaskDTO, "dueDate" | "dueTime" | "repeat" | "status">; today: string }) {
  if (!task.dueDate) return null;
  const overdue = task.status !== "DONE" && (task.dueDate < today);
  const isToday = task.dueDate === today;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", overdue ? "font-medium text-danger" : isToday ? "font-medium text-primary" : "text-ink-2")}>
      {relativeDay(task.dueDate, today)}
      {task.dueTime && <span>· {formatHm(task.dueTime)}</span>}
      {task.repeat !== "NONE" && <RepeatIcon className="h-3 w-3" aria-label={REPEAT_LABEL[task.repeat]} />}
    </span>
  );
}

export function Checkbox({ checked, onChange, label, priority = "NONE" }: { checked: boolean; onChange: (v: boolean) => void; label: string; priority?: TaskDTO["priority"] }) {
  const ring = { URGENT: "border-danger", HIGH: "border-orange-500", MEDIUM: "border-amber-500", LOW: "border-sky-500", NONE: "border-border-strong" }[priority];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "group/cb flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        checked ? "border-primary bg-primary" : cn(ring, "hover:bg-primary-soft"),
      )}
    >
      <svg viewBox="0 0 12 12" className={cn("h-2.5 w-2.5 text-primary-ink", checked ? "opacity-100" : "opacity-0 group-hover/cb:opacity-60 group-hover/cb:text-primary")} aria-hidden>
        <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
