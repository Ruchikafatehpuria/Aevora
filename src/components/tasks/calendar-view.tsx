"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import type { EventDTO, ProjectDTO, TaskDTO } from "@/lib/tasks/queries";
import { addDays, DAY_SHORT, formatHm, formatYmd, MONTH_NAMES, relativeDay, weekday } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button, buttonClass } from "@/components/ui/button";
import { EventEditor, type EventDraft } from "./event-editor";
import { TaskEditor, type TaskDraft } from "./task-editor";
import { QuickAdd } from "./quick-add";
import { colorOf } from "./shared";
import { TaskRow } from "./tasks-view";

type Props = {
  view: "month" | "week";
  /** First and last visible dates (inclusive). */
  rangeStart: string;
  rangeEnd: string;
  anchor: string;
  today: string;
  selected: string;
  events: EventDTO[];
  tasks: TaskDTO[];
  projects: ProjectDTO[];
  openEventId: string | null;
};

/** Events overlapping a day, all-day first then by start time. */
function eventsOn(events: EventDTO[], day: string) {
  return events
    .filter((e) => e.startDate <= day && e.endDate >= day)
    .sort((a, b) => (a.allDay === b.allDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.allDay ? -1 : 1));
}

function timeLabel(e: EventDTO, day: string) {
  if (e.allDay) return "All day";
  const start = e.startDate === day ? formatHm(e.startTime!) : "…";
  const end = e.endDate === day ? formatHm(e.endTime!) : "…";
  return `${start} – ${end}`;
}

export function CalendarView({ view, rangeStart, rangeEnd, anchor, today, selected: initialSelected, events, tasks, projects, openEventId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState(initialSelected);
  const [editingEvent, setEditingEvent] = useState<EventDraft | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDraft | null>(null);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  useEffect(() => setSelected(initialSelected), [initialSelected]);

  useEffect(() => {
    if (!openEventId) return;
    const e = events.find((x) => x.id === openEventId);
    if (e) setEditingEvent(e);
  }, [openEventId, events]);

  const days: string[] = [];
  for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) days.push(d);
  const tasksOn = (day: string) => tasks.filter((t) => t.dueDate === day);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    p.delete("event");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `${pathname}?${p}`;
  };
  const step = view === "month" ? { prev: monthShift(anchor, -1), next: monthShift(anchor, 1) } : { prev: addDays(anchor, -7), next: addDays(anchor, 7) };
  const [y, m] = anchor.split("-").map(Number);
  const heading = view === "month" ? `${MONTH_NAMES[m! - 1]} ${y}` : `${formatYmd(rangeStart)} – ${formatYmd(rangeEnd, { year: true })}`;

  const closeEvent = () => {
    setEditingEvent(null);
    if (params.get("event")) router.replace(href({}), { scroll: false });
  };

  const selectedEvents = eventsOn(events, selected);
  const selectedTasks = tasksOn(selected);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={href({ date: step.prev })} className={buttonClass("secondary", "icon")} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Link>
            <Link href={href({ date: step.next })} className={buttonClass("secondary", "icon")} aria-label="Next"><ChevronRight className="h-4 w-4" /></Link>
            <h2 className="ml-1 font-display text-lg font-semibold text-ink">{heading}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link href={href({ date: null })} className={buttonClass("ghost", "sm")}>Today</Link>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View">
              {(["month", "week"] as const).map((v) => (
                <Link key={v} href={href({ view: v === "month" ? null : v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-md px-2.5 py-1 text-sm capitalize", view === v ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:text-ink")}>
                  {v}
                </Link>
              ))}
            </div>
            <Button size="sm" onClick={() => setEditingEvent({ startDate: selected, endDate: selected })}>
              <Plus className="h-4 w-4" /> Event
            </Button>
          </div>
        </div>

        {view === "month" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-xs font-medium text-ink-3">{DAY_SHORT[d]}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
                const evs = eventsOn(events, day);
                const tks = tasksOn(day).filter((t) => t.status !== "DONE");
                const items = [...evs.map((e) => ({ kind: "event" as const, e })), ...tks.map((t) => ({ kind: "task" as const, t }))];
                const isSel = day === selected;
                return (
                  <div
                    key={day}
                    role="button"
                    tabIndex={0}
                    aria-label={`${formatYmd(day, { weekday: true })}: ${evs.length} events, ${tks.length} tasks`}
                    aria-pressed={isSel}
                    onClick={() => setSelected(day)}
                    onDoubleClick={() => setEditingEvent({ startDate: day, endDate: day })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(day);
                      }
                    }}
                    className={cn(
                      "min-h-[4.5rem] cursor-pointer border-b border-r border-border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                      !inMonth && "bg-surface-2/40",
                      isSel ? "bg-primary-soft/60" : "hover:bg-surface-2/60",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", day === today ? "bg-primary font-semibold text-primary-ink" : inMonth ? "text-ink" : "text-ink-3")}>
                      {Number(day.slice(8))}
                    </span>
                    {/* Dots on phones, labelled chips on wider screens */}
                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {items.slice(0, 4).map((it, i) => (
                        <span key={i} className={cn("h-1.5 w-1.5 rounded-full", it.kind === "event" ? colorOf(it.e.color).dot : "bg-ink-3")} />
                      ))}
                    </div>
                    <ul className="mt-1 hidden space-y-0.5 sm:block">
                      {items.slice(0, 3).map((it) =>
                        it.kind === "event" ? (
                          <li key={it.e.id}>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditingEvent(it.e);
                              }}
                              className={cn("block w-full truncate rounded px-1.5 py-px text-left text-[11px] font-medium", colorOf(it.e.color).soft, colorOf(it.e.color).text)}
                            >
                              {!it.e.allDay && it.e.startDate === day && <span className="opacity-75">{formatHm(it.e.startTime!).replace(" ", "")} </span>}
                              {it.e.title}
                            </button>
                          </li>
                        ) : (
                          <li key={it.t.id}>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setEditingTask(it.t);
                              }}
                              className="flex w-full items-center gap-1 truncate rounded px-1.5 py-px text-left text-[11px] text-ink-2 hover:bg-surface-2"
                            >
                              <span className={cn("h-2 w-2 shrink-0 rounded-full border", day < today ? "border-danger" : "border-ink-3")} />
                              <span className="truncate">{it.t.title}</span>
                            </button>
                          </li>
                        ),
                      )}
                      {items.length > 3 && <li className="px-1.5 text-[11px] text-ink-3">+{items.length - 3} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-7">
            {days.map((day) => {
              const evs = eventsOn(events, day);
              const tks = tasksOn(day);
              return (
                <div key={day} className={cn("flex min-h-40 flex-col rounded-xl border bg-surface", day === selected ? "border-primary/60" : "border-border")}>
                  <button type="button" onClick={() => setSelected(day)} className="flex items-baseline justify-between border-b border-border px-2.5 py-2 text-left md:block">
                    <span className="text-xs font-medium text-ink-3">{DAY_SHORT[weekday(day)]}</span>
                    <span className={cn("ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-display text-base font-semibold md:ml-0 md:flex", day === today ? "bg-primary text-primary-ink" : "text-ink")}>
                      {Number(day.slice(8))}
                    </span>
                  </button>
                  <ul className="flex-1 space-y-1 p-1.5">
                    {evs.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setEditingEvent(e)} className={cn("block w-full rounded-md px-2 py-1 text-left", colorOf(e.color).soft)}>
                          <span className={cn("block truncate text-xs font-medium", colorOf(e.color).text)}>{e.title}</span>
                          <span className="block truncate text-[11px] text-ink-2">{timeLabel(e, day)}</span>
                        </button>
                      </li>
                    ))}
                    {tks.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setEditingTask(t)} className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-surface-2", t.status === "DONE" ? "text-ink-3 line-through" : "text-ink-2")}>
                          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full border", t.status === "DONE" ? "border-primary bg-primary" : "border-ink-3")} />
                          <span className="truncate">{t.dueTime ? `${formatHm(t.dueTime)} · ` : ""}{t.title}</span>
                        </button>
                      </li>
                    ))}
                    {!evs.length && !tks.length && (
                      <li>
                        <button type="button" onClick={() => setEditingEvent({ startDate: day, endDate: day })} className="w-full rounded-md py-2 text-center text-[11px] text-ink-3 opacity-0 transition hover:bg-surface-2 hover:opacity-100 focus:opacity-100">
                          + Add
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {view === "month" && <p className="mt-2 text-xs text-ink-3">Click a day to see its agenda; double-click to add an event.</p>}
      </section>

      {/* Agenda for the selected day */}
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="font-display text-[15px] font-semibold text-ink">{relativeDay(selected, today)}</p>
              <p className="text-xs text-ink-3">{formatYmd(selected, { weekday: true, year: true })}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditingEvent({ startDate: selected, endDate: selected })}>
              <Plus className="h-4 w-4" /> Event
            </Button>
          </div>
          {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <CalendarDays className="h-6 w-6 text-ink-3" aria-hidden />
              <p className="mt-2 text-sm text-ink-2">Nothing planned.</p>
            </div>
          ) : (
            <>
              {selectedEvents.length > 0 && (
                <ul className="divide-y divide-border">
                  {selectedEvents.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setEditingEvent(e)} className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60">
                        <span className={cn("mt-1 h-full min-h-8 w-1 shrink-0 rounded-full", colorOf(e.color).dot)} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                          <span className="flex items-center gap-1 text-xs text-ink-2"><Clock className="h-3 w-3" /> {timeLabel(e, selected)}</span>
                          {e.location && <span className="flex items-center gap-1 truncate text-xs text-ink-3"><MapPin className="h-3 w-3 shrink-0" /> {e.location}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedTasks.length > 0 && (
                <ul className={cn(selectedEvents.length > 0 && "border-t border-border")}>
                  {selectedTasks.map((t) => (
                    <TaskRow key={t.id} task={t} project={t.projectId ? projectById.get(t.projectId) : undefined} today={today} onOpen={setEditingTask} />
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="border-t border-border p-3">
            <QuickAdd today={today} dueDate={selected} compact placeholder={`Add a task for ${relativeDay(selected, today).toLowerCase()}…`} />
          </div>
        </div>
        <ReminderPermission />
      </aside>

      <EventEditor event={editingEvent} onClose={closeEvent} />
      <TaskEditor task={editingTask} projects={projects} onClose={() => setEditingTask(null)} />
    </div>
  );
}

function monthShift(ymd: string, n: number) {
  const [y, m] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Offers system notifications for reminders; in-app notifications work regardless. */
function ReminderPermission() {
  const [state, setState] = useState<NotificationPermission | "unsupported" | null>(null);
  useEffect(() => setState("Notification" in window ? Notification.permission : "unsupported"), []);
  if (state !== "default") return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <p className="font-medium text-ink">Get reminder pop-ups</p>
      <p className="mt-1 text-ink-2">Reminders always appear under the bell. Allow notifications to also see them while Syncly is open in another tab.</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={async () => setState(await Notification.requestPermission())}>
        Allow notifications
      </Button>
    </div>
  );
}
