"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, KanbanSquare, List, MoreHorizontal, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { clearCompleted, deleteProject, moveTask, saveProject, toggleTask } from "@/lib/tasks/actions";
import type { ProjectDTO, TaskDTO } from "@/lib/tasks/queries";
import { addDays, diffDays } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { QuickAdd } from "./quick-add";
import { TaskEditor, type TaskDraft } from "./task-editor";
import { Checkbox, COLOR_NAMES, colorOf, DueLabel, PriorityFlag } from "./shared";

export type TaskFilter = { kind: "all" } | { kind: "today" } | { kind: "upcoming" } | { kind: "none" } | { kind: "project"; id: string };

type Props = {
  tasks: TaskDTO[];
  projects: ProjectDTO[];
  today: string;
  filter: TaskFilter;
  view: "list" | "board";
  openTaskId: string | null;
};

export function TasksView({ tasks, projects, today, filter, view, openTaskId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editing, setEditing] = useState<TaskDraft | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Open a task from a link (?task=id), e.g. from a reminder notification.
  useEffect(() => {
    if (!openTaskId) return;
    const t = tasks.find((x) => x.id === openTaskId);
    if (t) setEditing(t);
  }, [openTaskId, tasks]);

  const closeEditor = () => {
    setEditing(null);
    if (params.get("task")) {
      const p = new URLSearchParams(params);
      p.delete("task");
      router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
    }
  };

  const visible = tasks.filter((t) => {
    switch (filter.kind) {
      case "today":
        return !!t.dueDate && t.dueDate <= today && (t.status !== "DONE" || t.dueDate === today);
      case "upcoming":
        return !!t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7);
      case "none":
        return !t.projectId;
      case "project":
        return t.projectId === filter.id;
      default:
        return true;
    }
  });

  const filterProjectId = filter.kind === "project" ? filter.id : null;
  const title =
    filter.kind === "today" ? "Today" : filter.kind === "upcoming" ? "Next 7 days" : filter.kind === "none" ? "No project" : filter.kind === "project" ? projectById.get(filter.id)?.name ?? "Project" : "All tasks";

  const viewHref = (v: "list" | "board") => {
    const p = new URLSearchParams(params);
    p.delete("task");
    if (v === "list") p.delete("view");
    else p.set("view", v);
    return `${pathname}${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <ProjectSidebar projects={projects} filter={filter} tasks={tasks} today={today} view={view} />

      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View">
              {(["list", "board"] as const).map((v) => {
                const Icon = v === "list" ? List : KanbanSquare;
                return (
                  <Link key={v} href={viewHref(v)} aria-current={view === v ? "page" : undefined} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm", view === v ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:text-ink")}>
                    <Icon className="h-4 w-4" aria-hidden /> {v === "list" ? "List" : "Board"}
                  </Link>
                );
              })}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing({ projectId: filterProjectId, dueDate: filter.kind === "today" ? today : null })}>
              <Plus className="h-4 w-4" /> Details
            </Button>
          </div>
        </div>

        <QuickAdd today={today} projectId={filterProjectId} dueDate={filter.kind === "today" ? today : null} />
        <p className="mt-2 text-xs text-ink-3">
          Tip: type dates like <i>tomorrow 5pm</i>, <i>fri</i>, <i>25/11</i>, <i>in 3 days</i>; <i>!high</i> for priority, <i>#project</i>, and <i>every week</i> to repeat.
        </p>

        <div className="mt-6">
          {view === "board" ? (
            <Board tasks={visible} projectById={projectById} today={today} onOpen={setEditing} />
          ) : (
            <TaskList tasks={visible} projectById={projectById} today={today} onOpen={setEditing} showProject={filter.kind !== "project"} filterProjectId={filterProjectId} />
          )}
        </div>
      </section>

      <TaskEditor task={editing} projects={projects} onClose={closeEditor} />
    </div>
  );
}

// ───────────── List ─────────────

function groupOf(t: TaskDTO, today: string) {
  if (!t.dueDate) return "nodate";
  const d = diffDays(t.dueDate, today);
  return d < 0 ? "overdue" : d === 0 ? "today" : d === 1 ? "tomorrow" : d <= 7 ? "week" : "later";
}
const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "nodate", label: "No date" },
] as const;

function TaskList({ tasks, projectById, today, onOpen, showProject, filterProjectId }: { tasks: TaskDTO[]; projectById: Map<string, ProjectDTO>; today: string; onOpen: (t: TaskDTO) => void; showProject: boolean; filterProjectId: string | null }) {
  const [showDone, setShowDone] = useState(false);
  const [pending, start] = useTransition();
  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  if (!tasks.length) {
    return <EmptyState icon={List} title="Nothing here yet" description="Add a task above. Dates, times and priorities are understood as you type." className="rounded-xl border border-dashed border-border" />;
  }

  return (
    <div className="space-y-6">
      {open.length === 0 && (
        <Alert tone="success">All done here. Nice work!</Alert>
      )}
      {GROUPS.map((g) => {
        const items = open.filter((t) => groupOf(t, today) === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <h3 className={cn("mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide", g.key === "overdue" ? "text-danger" : "text-ink-3")}>
              {g.label} <span className="font-normal normal-case tracking-normal">{items.length}</span>
            </h3>
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {items.map((t) => <TaskRow key={t.id} task={t} project={t.projectId ? projectById.get(t.projectId) : undefined} today={today} onOpen={onOpen} showProject={showProject} />)}
            </ul>
          </div>
        );
      })}
      {done.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setShowDone((s) => !s)} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-3 hover:text-ink" aria-expanded={showDone}>
              {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Completed <span className="font-normal normal-case tracking-normal">{done.length}</span>
            </button>
            {showDone && (
              <button disabled={pending} onClick={() => start(async () => void (await clearCompleted(filterProjectId)))} className="text-xs text-ink-3 hover:text-danger">
                Clear completed
              </button>
            )}
          </div>
          {showDone && (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {done.map((t) => <TaskRow key={t.id} task={t} project={t.projectId ? projectById.get(t.projectId) : undefined} today={today} onOpen={onOpen} showProject={showProject} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskRow({ task, project, today, onOpen, showProject = true }: { task: TaskDTO; project?: ProjectDTO; today: string; onOpen: (t: TaskDTO) => void; showProject?: boolean }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [, start] = useTransition();
  const done = optimistic ?? task.status === "DONE";
  useEffect(() => setOptimistic(null), [task.status]);

  return (
    <li className="group flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2/50">
      <div className="pt-0.5">
        <Checkbox
          checked={done}
          priority={task.priority}
          label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
          onChange={(v) => {
            setOptimistic(v);
            start(async () => {
              const res = await toggleTask(task.id, v);
              if (!res.ok) setOptimistic(null);
            });
          }}
        />
      </div>
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <span className={cn("block text-sm text-ink", done && "text-ink-3 line-through")}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <DueLabel task={{ ...task, status: done ? "DONE" : task.status }} today={today} />
          {task.status === "IN_PROGRESS" && !done && <span className="text-accent">In progress</span>}
          {task.notes && <StickyNote className="h-3 w-3 text-ink-3" aria-label="Has notes" />}
          {showProject && project && (
            <span className={cn("inline-flex items-center gap-1", colorOf(project.color).text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", colorOf(project.color).dot)} /> {project.name}
            </span>
          )}
        </span>
      </button>
      <PriorityFlag priority={task.priority} className="pt-0.5" />
    </li>
  );
}

// ───────────── Board ─────────────

const COLUMNS = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "DONE", label: "Done" },
] as const;
type Status = TaskDTO["status"];

function Board({ tasks, projectById, today, onOpen }: { tasks: TaskDTO[]; projectById: Map<string, ProjectDTO>; today: string; onOpen: (t: TaskDTO) => void }) {
  // Local copy so a drag shows immediately; server data replaces it after revalidation.
  const [items, setItems] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: Status; beforeId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(tasks), [tasks]);

  const move = (id: string, status: Status, beforeId: string | null) => {
    if (id === beforeId) return;
    setItems((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t) return prev;
      const rest = prev.filter((x) => x.id !== id);
      const moved = { ...t, status };
      const idx = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
      if (idx < 0) return [...rest, moved];
      return [...rest.slice(0, idx), moved, ...rest.slice(idx)];
    });
    start(async () => {
      const res = await moveTask(id, status, beforeId);
      if (!res.ok) {
        setError(res.error);
        setItems(tasks);
      }
    });
  };

  return (
    <>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((t) => t.status === col.status);
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (e.target === e.currentTarget || !(e.target as HTMLElement).closest("[data-task]")) setOver({ status: col.status, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && over) move(dragId, over.status, over.beforeId);
                setDragId(null);
                setOver(null);
              }}
              className={cn("flex min-h-48 flex-col rounded-xl border border-border bg-surface-2/50 p-2.5 transition-colors", over?.status === col.status && "border-primary/50 bg-primary-soft/40")}
            >
              <h3 className="mb-2 flex items-center justify-between px-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                {col.label} <span className="rounded-full bg-surface px-1.5 py-px font-medium normal-case">{colItems.length}</span>
              </h3>
              <ul className="flex flex-1 flex-col gap-2">
                {colItems.map((t) => {
                  const project = t.projectId ? projectById.get(t.projectId) : undefined;
                  return (
                    <li
                      key={t.id}
                      data-task
                      draggable
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        setOver({ status: col.status, beforeId: t.id });
                      }}
                      className={cn(
                        "group cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition active:cursor-grabbing",
                        project && cn("border-l-[3px]", colorOf(project.color).bar),
                        dragId === t.id && "opacity-40",
                        over?.beforeId === t.id && dragId !== t.id && "ring-2 ring-primary/40",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => onOpen(t)} className={cn("min-w-0 flex-1 text-left text-sm text-ink", t.status === "DONE" && "text-ink-3 line-through")}>
                          {t.title}
                        </button>
                        <PriorityFlag priority={t.priority} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                          <DueLabel task={t} today={today} />
                          {project && <span className={cn("truncate", colorOf(project.color).text)}>{project.name}</span>}
                        </span>
                        {/* Keyboard / touch alternative to dragging */}
                        <select
                          aria-label={`Move “${t.title}”`}
                          value={t.status}
                          onChange={(e) => move(t.id, e.target.value as Status, null)}
                          className="shrink-0 rounded border border-transparent bg-transparent py-0.5 text-[11px] text-ink-3 hover:border-border focus:border-primary focus:outline-none"
                        >
                          {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                        </select>
                      </div>
                    </li>
                  );
                })}
                {colItems.length === 0 && <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-8 text-xs text-ink-3">Drop tasks here</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ───────────── Projects ─────────────

function ProjectSidebar({ projects, filter, tasks, today, view }: { projects: ProjectDTO[]; filter: TaskFilter; tasks: TaskDTO[]; today: string; view: string }) {
  const [editing, setEditing] = useState<ProjectDTO | { id: null; name: string; color: string } | null>(null);
  const openCount = (fn: (t: TaskDTO) => boolean) => tasks.filter((t) => t.status !== "DONE" && fn(t)).length;
  const suffix = view === "board" ? "&view=board" : "";
  const items = [
    { key: "all", href: `/tasks?f=all${suffix}`, label: "All tasks", count: openCount(() => true), active: filter.kind === "all" },
    { key: "today", href: `/tasks?f=today${suffix}`, label: "Today", count: openCount((t) => !!t.dueDate && t.dueDate <= today), active: filter.kind === "today" },
    { key: "upcoming", href: `/tasks?f=upcoming${suffix}`, label: "Next 7 days", count: openCount((t) => !!t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7)), active: filter.kind === "upcoming" },
    { key: "none", href: `/tasks?f=none${suffix}`, label: "No project", count: openCount((t) => !t.projectId), active: filter.kind === "none" },
  ];
  const link = (active: boolean) => cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm", active ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink");

  return (
    <aside>
      <nav aria-label="Task lists" className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible">
        {items.map((i) => (
          <Link key={i.key} href={i.href} className={cn(link(i.active), "shrink-0")} aria-current={i.active ? "page" : undefined}>
            {i.label} {i.count > 0 && <span className="ml-2 text-xs text-ink-3">{i.count}</span>}
          </Link>
        ))}
      </nav>
      <div className="mt-5 flex items-center justify-between px-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Projects</h3>
        <button onClick={() => setEditing({ id: null, name: "", color: COLOR_NAMES[projects.length % COLOR_NAMES.length]! })} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="New project">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-1 flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible">
        {projects.map((p) => {
          const active = filter.kind === "project" && filter.id === p.id;
          return (
            <li key={p.id} className="group relative shrink-0">
              <Link href={`/tasks?project=${p.id}${suffix}`} className={cn(link(active), "pr-8")} aria-current={active ? "page" : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", colorOf(p.color).dot)} />
                  <span className="truncate">{p.name}</span>
                </span>
                {p.open > 0 && <span className="ml-2 text-xs text-ink-3 group-hover:opacity-0">{p.open}</span>}
              </Link>
              <button onClick={() => setEditing(p)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100" aria-label={`Edit project ${p.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </li>
          );
        })}
        {projects.length === 0 && <li className="px-2.5 py-1 text-xs text-ink-3">Group tasks by subject, client or goal. Type <i>#name</i> in a task to create one.</li>}
      </ul>
      <ProjectEditor project={editing} onClose={() => setEditing(null)} />
    </aside>
  );
}

function ProjectEditor({ project, onClose }: { project: { id: string | null; name: string; color: string } | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("teal");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "ask">(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setColor(project.color);
    setError(null);
    setConfirm(null);
  }, [project]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveProject(project?.id ?? null, { name, color });
      if (!res.ok) return setError(res.error);
      onClose();
      if (!project?.id && res.id) router.push(`/tasks?project=${res.id}`);
    });
  };
  const remove = (deleteTasks: boolean) =>
    start(async () => {
      const res = await deleteProject(project!.id!, deleteTasks);
      if (!res.ok) return setError(res.error);
      onClose();
      router.push("/tasks");
    });

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={project?.id ? "Edit project" : "New project"}
      footer={
        confirm ? (
          <>
            <span className="mr-auto text-sm text-ink-2">Delete this project?</span>
            <Button size="sm" variant="secondary" onClick={() => remove(false)} loading={pending}>Keep its tasks</Button>
            <Button size="sm" variant="danger" onClick={() => remove(true)} disabled={pending}>Delete tasks too</Button>
          </>
        ) : (
          <>
            {project?.id && (
              <Button size="sm" variant="ghost" className="mr-auto" onClick={() => setConfirm("ask")}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" type="submit" form="project-form" loading={pending}>
              {project?.id ? <><Pencil className="h-4 w-4" /> Save</> : "Create project"}
            </Button>
          </>
        )
      }
    >
      <form id="project-form" onSubmit={save} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus placeholder="e.g. Semester 5, Internship hunt" />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_NAMES.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
                <span className={cn("block h-7 w-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-primary", colorOf(c).dot)} title={c} />
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
