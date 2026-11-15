"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ListPlus } from "lucide-react";
import { addConfirmedTasks } from "@/lib/tasks/ai-actions";
import { formatHm, formatYmd } from "@/lib/time";
import { proposalKey, type ProposedTask } from "@/lib/assistant/proposals";

/** Tasks proposed by the assistant: nothing is created until the user clicks Add. */
export function TaskSuggestions({ tasks, existing }: { tasks: ProposedTask[]; existing: Set<string> }) {
  const [justAdded, setAdded] = useState<Set<number>>(new Set());
  const added = new Set([...justAdded, ...tasks.map((t, i) => (existing.has(proposalKey(t)) ? i : -1)).filter((i) => i >= 0)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = (idx: number[]) =>
    start(async () => {
      const res = await addConfirmedTasks(idx.map((i) => ({ ...tasks[i]!, notes: null })), null);
      if (res.ok) setAdded((s) => new Set([...s, ...idx]));
      else setError(res.error);
    });
  const remaining = tasks.map((_, i) => i).filter((i) => !added.has(i));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <ul className="divide-y divide-border">
        {tasks.map((t, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{t.title}</p>
              <p className="text-xs text-ink-3">{t.dueDate ? `${formatYmd(t.dueDate, { weekday: true })}${t.dueTime ? ` · ${formatHm(t.dueTime)}` : ""}` : "No date"}</p>
            </div>
            {added.has(i) ? (
              <span className="flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" /> Added</span>
            ) : (
              <button type="button" disabled={pending} onClick={() => add([i])} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary disabled:opacity-50">
                <ListPlus className="h-3.5 w-3.5" /> Add
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-3 py-1.5 text-xs">
        {error ? <span className="text-danger">{error}</span> : added.size ? <Link href="/tasks" className="text-primary hover:underline">View in Tasks</Link> : <span className="text-ink-3">Suggested tasks</span>}
        {remaining.length > 1 && (
          <button type="button" disabled={pending} onClick={() => add(remaining)} className="font-medium text-primary hover:underline disabled:opacity-50">
            Add all {remaining.length}
          </button>
        )}
      </div>
    </div>
  );
}
