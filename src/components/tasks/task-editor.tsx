"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { deleteTask, saveTask, type TaskInput } from "@/lib/tasks/actions";
import type { ProjectDTO, TaskDTO } from "@/lib/tasks/queries";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";
import { PRIORITY_META, REPEAT_LABEL } from "./shared";

const REMINDERS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At the due time" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

export type TaskDraft = Partial<TaskDTO> & { id?: string };

export function TaskEditor({
  task,
  projects,
  onClose,
}: {
  /** null = closed; an object without id = new task. */
  task: TaskDraft | null;
  projects: ProjectDTO[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<TaskInput>(blank());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!task) return;
    setError(null);
    setConfirmDelete(false);
    setForm({
      title: task.title ?? "",
      notes: task.notes ?? "",
      projectId: task.projectId ?? null,
      priority: task.priority ?? "NONE",
      status: task.status ?? "TODO",
      dueDate: task.dueDate ?? null,
      dueTime: task.dueTime ?? null,
      repeat: task.repeat ?? "NONE",
      reminder: task.reminder ?? null,
    });
  }, [task]);

  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveTask(task?.id ?? null, form);
      if (res.ok) onClose();
      else setError(res.error);
    });
  };

  const remove = () => {
    if (!task?.id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      await deleteTask(task.id!);
      onClose();
    });
  };

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={task?.id ? "Edit task" : "New task"}
      footer={
        <>
          {task?.id && (
            <Button type="button" variant={confirmDelete ? "danger" : "ghost"} size="sm" onClick={remove} disabled={pending} className="mr-auto">
              <Trash2 className="h-4 w-4" /> {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="task-form" size="sm" loading={pending}>{task?.id ? "Save" : "Add task"}</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title" htmlFor="t-title">
          <Input id="t-title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={300} required autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor="t-date">
            <Input id="t-date" type="date" value={form.dueDate ?? ""} onChange={(e) => {
              const v = e.target.value || null;
              setForm((f) => (v ? { ...f, dueDate: v } : { ...f, dueDate: null, dueTime: null, repeat: "NONE", reminder: null }));
            }} />
          </Field>
          <Field label="Time (optional)" htmlFor="t-time">
            <Input id="t-time" type="time" value={form.dueTime ?? ""} disabled={!form.dueDate} onChange={(e) => set("dueTime", e.target.value || null)} />
          </Field>
          <Field label="Reminder" htmlFor="t-remind" hint={form.dueDate && !form.dueTime ? "Date-only tasks are reminded at 9:00 am." : undefined}>
            <Select id="t-remind" value={form.reminder === null || form.reminder === undefined ? "" : String(form.reminder)} disabled={!form.dueDate} onChange={(e) => set("reminder", e.target.value === "" ? null : Number(e.target.value))}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>{r.value === "0" && !form.dueTime ? "On the day" : r.label}</option>
              ))}
              {form.reminder !== null && form.reminder !== undefined && !REMINDERS.some((r) => r.value === String(form.reminder)) && (
                <option value={String(form.reminder)}>{form.reminder} minutes before</option>
              )}
            </Select>
          </Field>
          <Field label="Repeat" htmlFor="t-repeat">
            <Select id="t-repeat" value={form.repeat} disabled={!form.dueDate} onChange={(e) => set("repeat", e.target.value as TaskInput["repeat"])}>
              {Object.entries(REPEAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="t-priority">
            <Select id="t-priority" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskInput["priority"])}>
              {(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </Select>
          </Field>
          <Field label="Project" htmlFor="t-project">
            <Select id="t-project" value={form.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Status" htmlFor="t-status">
            <Select id="t-status" value={form.status} onChange={(e) => set("status", e.target.value as TaskInput["status"])}>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="t-notes">
          <Textarea id="t-notes" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={5000} placeholder="Details, links, sub-steps…" />
        </Field>
        {task?.sourceFileId && (
          <Link href={`/locker/files/${task.sourceFileId}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <FileText className="h-4 w-4" /> Open the file this task came from
          </Link>
        )}
      </form>
    </Modal>
  );
}

function blank(): TaskInput {
  return { title: "", notes: "", projectId: null, priority: "NONE", status: "TODO", dueDate: null, dueTime: null, repeat: "NONE", reminder: null };
}
