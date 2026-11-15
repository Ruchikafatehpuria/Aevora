"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Lock, LockOpen, Pencil, RotateCcw, RotateCw, Star, Trash2 } from "lucide-react";
import {
  copyFile, deleteForever, renameFile, restoreFiles, retryProcessing, setArchived, setSensitive, setStarred, trashFiles, unlockSensitive, updateFileDetails,
} from "@/lib/locker/actions";
import type { FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export function RenameTitle({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate font-display text-xl font-bold text-ink">{name}</h2>
        <button onClick={() => setEditing(true)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Rename file">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    );
  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => (await renameFile(id, value), setEditing(false)));
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="File name" />
      <Button type="submit" size="sm" loading={pending}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
}

export function TrashFileButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" className="text-danger" loading={pending} onClick={() => start(() => trashFiles([id]))}>
      <Trash2 className="h-4 w-4" /> Move to Trash
    </Button>
  );
}

export function TrashedBanner({ id, daysLeft }: { id: string; daysLeft: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3">
      <p className="mr-auto text-sm text-danger">This file is in Trash and will be permanently deleted in {daysLeft} day{daysLeft === 1 ? "" : "s"}.</p>
      <Button size="sm" variant="secondary" loading={pending} onClick={() => start(() => restoreFiles([id]))}>
        <RotateCcw className="h-3.5 w-3.5" /> Restore
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => confirm("Permanently delete this file? This can't be undone.") && start(async () => (await deleteForever([id]), router.push("/locker/files?folder=trash")))}
      >
        Delete forever
      </Button>
    </div>
  );
}

export function StarArchiveButtons({ id, starred, archived }: { id: string; starred: boolean; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => setStarred([id], !starred))} aria-pressed={starred}>
        <Star className={starred ? "h-4 w-4 text-amber-500" : "h-4 w-4"} fill={starred ? "currentColor" : "none"} /> {starred ? "Starred" : "Star"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => setArchived([id], !archived))}>
        {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {archived ? "Unarchive" : "Archive"}
      </Button>
    </>
  );
}

export function CopyFileForm({ id, folders }: { id: string; folders: { id: string; path: string }[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 flex-1 text-xs" aria-label="Copy to folder">
        <option value="">Copy to Inbox (unfiled)</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
      </Select>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => start(async () => {
          try {
            router.push(`/locker/files/${await copyFile(id, target || null)}`);
          } catch (e) {
            setError((e as Error).message);
          }
        })}
      >
        <Copy className="h-3.5 w-3.5" /> Make a copy
      </Button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={() => start(() => retryProcessing(id))}>
      <RotateCw className="h-3.5 w-3.5" /> Retry processing
    </Button>
  );
}

export function SensitiveToggle({ id, sensitive, elevated }: { id: string; sensitive: boolean; elevated: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={sensitive && !elevated}
        title={sensitive && !elevated ? "Unlock with your password first" : undefined}
        onClick={() => start(() => setSensitive(id, !sensitive).catch((e: Error) => setError(e.message)))}
      >
        {sensitive ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {sensitive ? "Remove sensitive protection" : "Mark as sensitive"}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function UnlockForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(unlockSensitive, {});
  return (
    <form action={action} className="mx-auto mt-4 flex max-w-sm flex-col gap-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Input name="password" type="password" autoComplete="current-password" placeholder="Your password" aria-label="Password" required />
      <Button type="submit" loading={pending}>Unlock for 10 minutes</Button>
    </form>
  );
}

type Details = { category: string; tags: string; subject: string; project: string; importance: string; documentDate: string; description: string };

export function DetailsForm({ id, details, categories }: { id: string; details: Details; categories: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateFileDetails.bind(null, id), {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.success && <Alert tone="success" className="sm:col-span-2">{state.success}</Alert>}
      {state.error && <Alert tone="error" className="sm:col-span-2">{state.error}</Alert>}
      <Field label="Category" htmlFor="category">
        <Input id="category" name="category" list="categories" defaultValue={details.category} />
        <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma separated">
        <Input id="tags" name="tags" defaultValue={details.tags} />
      </Field>
      <Field label="Subject" htmlFor="subject">
        <Input id="subject" name="subject" defaultValue={details.subject} />
      </Field>
      <Field label="Project" htmlFor="project">
        <Input id="project" name="project" defaultValue={details.project} />
      </Field>
      <Field label="Importance" htmlFor="importance">
        <Select id="importance" name="importance" defaultValue={details.importance}>
          <option value="">Not set</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </Select>
      </Field>
      <Field label="Document date" htmlFor="documentDate">
        <Input id="documentDate" name="documentDate" type="date" defaultValue={details.documentDate} />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" defaultValue={details.description} maxLength={2000} placeholder="Notes about this file (searchable)" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" loading={pending}>Save details</Button>
      </div>
    </form>
  );
}
