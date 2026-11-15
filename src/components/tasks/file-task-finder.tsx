"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { addConfirmedTasks, findTasksInFile, findTasksInNote, type FoundTask } from "@/lib/tasks/ai-actions";
import { formatHm, formatYmd } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type Row = FoundTask & { keep: boolean };

/** Scans a file with AI for deadlines and action items; nothing is added until the user confirms. */
export function FileTaskFinder({ fileId, noteId, fileName }: { fileId?: string; noteId?: string; fileName: string }) {
  const what = noteId ? "note" : "file";
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [scanning, startScan] = useTransition();
  const [saving, startSave] = useTransition();

  const scan = () => {
    setOpen(true);
    setRows(null);
    setError(null);
    setAdded(null);
    startScan(async () => {
      const res = noteId ? await findTasksInNote(noteId) : await findTasksInFile(fileId!);
      if (res.ok) setRows(res.tasks.map((t) => ({ ...t, keep: true })));
      else setError(res.error);
    });
  };

  const chosen = rows?.filter((r) => r.keep && r.title.trim()) ?? [];
  const save = () =>
    startSave(async () => {
      const res = await addConfirmedTasks(chosen.map(({ title, dueDate, dueTime, notes }) => ({ title: title.trim(), dueDate, dueTime, notes })), fileId ?? null);
      if (res.ok) setAdded(res.count);
      else setError(res.error);
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={scan}>
        <ListChecks className="h-4 w-4" /> Find tasks & deadlines
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Tasks found in this ${what}`}
        footer={
          added !== null ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Close</Button>
              <Link href="/tasks" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-ink">Open Tasks</Link>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={save} loading={saving} disabled={scanning || chosen.length === 0}>
                Add {chosen.length || ""} task{chosen.length === 1 ? "" : "s"}
              </Button>
            </>
          )
        }
      >
        {scanning ? (
          <div className="space-y-2 py-2" aria-live="polite">
            <p className="text-sm text-ink-2">Reading “{fileName}” for deadlines and action items…</p>
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />)}
          </div>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : added !== null ? (
          <Alert tone="success">Added {added} task{added === 1 ? "" : "s"}. Dated tasks get a reminder automatically.</Alert>
        ) : rows && rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">No deadlines or action items found in this {what}.</p>
        ) : rows ? (
          <>
            <p className="mb-3 text-sm text-ink-2">Check the details. AI can make mistakes, so only ticked tasks are added.</p>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-border p-3">
                  <input
                    type="checkbox"
                    checked={r.keep}
                    onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                    className="mt-2.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    aria-label={`Include “${r.title}”`}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input value={r.title} onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="h-9" aria-label="Task title" maxLength={300} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                      <input
                        type="date"
                        value={r.dueDate ?? ""}
                        onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null, dueTime: e.target.value ? x.dueTime : null } : x)))}
                        className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-ink"
                        aria-label="Due date"
                      />
                      {r.dueDate ? <span>{formatYmd(r.dueDate, { weekday: true })}{r.dueTime && ` · ${formatHm(r.dueTime)}`}</span> : <span className="text-ink-3">No date found</span>}
                    </div>
                    {r.notes && <p className="text-xs text-ink-2">{r.notes}</p>}
                    {r.evidence && <p className="truncate text-xs italic text-ink-3" title={r.evidence}>“{r.evidence}”</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>
    </>
  );
}
