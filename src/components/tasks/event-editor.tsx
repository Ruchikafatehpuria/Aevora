"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteEvent, saveEvent, type EventInput } from "@/lib/tasks/actions";
import type { EventDTO } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/feedback";
import { COLOR_NAMES, colorOf } from "./shared";

export type EventDraft = Partial<EventDTO> & { id?: string };

const REMINDERS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At start time" },
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

function plusHour(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${String(Math.min(23, h! + 1)).padStart(2, "0")}:${String(h! >= 23 ? 59 : m!).padStart(2, "0")}`;
}

export function EventEditor({ event, onClose }: { event: EventDraft | null; onClose: () => void }) {
  const [form, setForm] = useState<EventInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!event) return;
    setError(null);
    setConfirmDelete(false);
    const startTime = event.startTime ?? "09:00";
    setForm({
      title: event.title ?? "",
      notes: event.notes ?? "",
      location: event.location ?? "",
      startDate: event.startDate!,
      endDate: event.endDate ?? event.startDate!,
      startTime: event.allDay ? null : startTime,
      endTime: event.allDay ? null : event.endTime ?? plusHour(startTime),
      allDay: event.allDay ?? false,
      color: (event.color ?? "teal") as EventInput["color"],
      reminder: event.id ? event.reminder ?? null : 10,
    });
  }, [event]);

  if (!form) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveEvent(event?.id ?? null, form);
      if (res.ok) onClose();
      else setError(res.error);
    });
  };
  const remove = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      await deleteEvent(event!.id!);
      onClose();
    });
  };

  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title={event?.id ? "Edit event" : "New event"}
      footer={
        <>
          {event?.id && (
            <Button type="button" size="sm" variant={confirmDelete ? "danger" : "ghost"} className="mr-auto" onClick={remove} disabled={pending}>
              <Trash2 className="h-4 w-4" /> {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="event-form" size="sm" loading={pending}>{event?.id ? "Save" : "Add event"}</Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title" htmlFor="e-title">
          <Input id="e-title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required autoFocus placeholder="e.g. DBMS lab, Interview with Acme" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => {
              const allDay = e.target.checked;
              setForm((f) => f && { ...f, allDay, startTime: allDay ? null : "09:00", endTime: allDay ? null : "10:00", reminder: f.reminder });
            }}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          All day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="e-sd">
            <Input
              id="e-sd"
              type="date"
              value={form.startDate}
              required
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                // Keep the end on or after the start.
                setForm((f) => f && { ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate });
              }}
            />
          </Field>
          {!form.allDay ? (
            <Field label="Start time" htmlFor="e-st">
              <Input
                id="e-st"
                type="time"
                value={form.startTime ?? ""}
                required
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => f && { ...f, startTime: v, endTime: f.startDate === f.endDate && (f.endTime ?? "") <= v ? plusHour(v) : f.endTime });
                }}
              />
            </Field>
          ) : <div />}
          <Field label="Ends" htmlFor="e-ed">
            <Input id="e-ed" type="date" value={form.endDate} min={form.startDate} required onChange={(e) => e.target.value && set("endDate", e.target.value)} />
          </Field>
          {!form.allDay && (
            <Field label="End time" htmlFor="e-et">
              <Input id="e-et" type="time" value={form.endTime ?? ""} required onChange={(e) => set("endTime", e.target.value)} />
            </Field>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Location" htmlFor="e-loc">
            <Input id="e-loc" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} maxLength={200} placeholder="Room, address or link" />
          </Field>
          <Field label="Reminder" htmlFor="e-rem" hint={form.allDay ? "All-day events are reminded from 9:00 am." : undefined}>
            <Select id="e-rem" value={form.reminder === null || form.reminder === undefined ? "" : String(form.reminder)} onChange={(e) => set("reminder", e.target.value === "" ? null : Number(e.target.value))}>
              {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.value === "0" && form.allDay ? "On the day" : r.label}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_NAMES.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="ecolor" value={c} checked={form.color === c} onChange={() => set("color", c as EventInput["color"])} className="peer sr-only" />
                <span className={cn("block h-6 w-6 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-primary", colorOf(c).dot)} title={c} />
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes" htmlFor="e-notes">
          <Textarea id="e-notes" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={5000} />
        </Field>
      </form>
    </Modal>
  );
}
