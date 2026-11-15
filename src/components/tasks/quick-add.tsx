"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, CornerDownLeft, Plus } from "lucide-react";
import { quickAddTask } from "@/lib/tasks/actions";
import { parseQuickAdd } from "@/lib/tasks/parse";
import { formatHm, relativeDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/** One-line task entry that understands dates, times, priorities, projects and repeats as you type. */
export function QuickAdd({ today, projectId, dueDate, placeholder, compact }: { today: string; projectId?: string | null; dueDate?: string | null; placeholder?: string; compact?: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, today) : null), [text, today]);
  const due = parsed?.dueDate ?? dueDate ?? null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || pending) return;
    const value = text;
    setError(null);
    start(async () => {
      const res = await quickAddTask(value, { projectId, dueDate });
      if (res.ok) {
        setText("");
        ref.current?.focus();
      } else setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className={cn("rounded-xl border border-border bg-surface shadow-card transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-[var(--ring)]", compact && "shadow-none")}>
      <div className="flex items-center gap-2.5 px-3.5">
        <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <input
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          maxLength={500}
          aria-label="Add a task"
          placeholder={placeholder ?? "Add a task, e.g. “Submit ML assignment tomorrow 5pm !high #college”"}
          className={cn("min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none", compact ? "h-10" : "h-12")}
        />
        {text.trim() && (
          <button type="submit" disabled={pending} className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-60">
            Add <CornerDownLeft className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
      {(parsed && (due || parsed.matched.length > 0)) || error ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3.5 py-2 text-xs" aria-live="polite">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            <>
              <span className="text-ink-3">Will add:</span>
              <span className="font-medium text-ink">{parsed!.title || "…"}</span>
              {due && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary">
                  <CalendarDays className="h-3 w-3" aria-hidden /> {relativeDay(due, today)}
                  {parsed!.dueTime && ` · ${formatHm(parsed!.dueTime)}`}
                </span>
              )}
              {parsed!.matched.map((m) => (
                <span key={m} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{m}</span>
              ))}
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
