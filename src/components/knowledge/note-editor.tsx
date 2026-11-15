"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, ExternalLink, Link2, Lock, LockOpen, PencilLine, Pin, PinOff, Trash2, X } from "lucide-react";
import { deleteNote, updateNote, type NotePatch } from "@/lib/knowledge/actions";
import { hostOf, normalizeTags } from "@/lib/knowledge/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { FileTaskFinder } from "@/components/tasks/file-task-finder";
import { NoteMarkdown } from "./note-markdown";

export type FullNote = { id: string; title: string; body: string; url: string | null; tags: string[]; pinned: boolean; sensitive: boolean; updatedAt: string; createdAt: string };

type Status = "saved" | "dirty" | "saving" | "error";

export function NoteEditor({ note, backHref, onDeleted }: { note: FullNote; backHref: string; onDeleted: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [url, setUrl] = useState(note.url ?? "");
  const [showUrl, setShowUrl] = useState(!!note.url);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [pinned, setPinned] = useState(note.pinned);
  const [sensitive, setSensitive] = useState(note.sensitive);
  const [mode, setMode] = useState<"edit" | "preview">(note.body.trim() && note.title ? "preview" : "edit");
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  const pending = useRef<NotePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus("saving");
    const res = await updateNote(note.id, patch);
    if (res.ok) {
      setError(null);
      setStatus(Object.keys(pending.current).length ? "dirty" : "saved");
    } else {
      // Keep the failed changes so the next edit retries them.
      pending.current = { ...patch, ...pending.current };
      setError(res.error);
      setStatus("error");
    }
  }, [note.id]);

  const queue = useCallback(
    (patch: NotePatch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), immediate ? 0 : 700);
    },
    [flush],
  );

  // Save anything left when leaving the note, and warn before closing the tab with unsaved text.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(320, el.scrollHeight + 2)}px`;
  }, [body, mode]);

  const addTags = (raw: string) => {
    const next = normalizeTags([...tags, ...raw.split(/[,\s]+/)]);
    setTagDraft("");
    if (next.join() !== tags.join()) {
      setTags(next);
      queue({ tags: next }, true);
    }
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    queue({ tags: next }, true);
  };

  const remove = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    startDelete(async () => {
      pending.current = {};
      if (timer.current) clearTimeout(timer.current);
      await deleteNote(note.id);
      onDeleted();
    });
  };

  const statusText = { saved: "Saved", dirty: "Editing…", saving: "Saving…", error: "Not saved" }[status];

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        <Link href={backHref} className="mr-1 rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden" aria-label="Back to notes">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Mode">
          {(["edit", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm", mode === m ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:text-ink")}
            >
              {m === "edit" ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {m === "edit" ? "Write" : "Read"}
            </button>
          ))}
        </div>
        <span className={cn("ml-2 flex items-center gap-1 text-xs", status === "error" ? "text-danger" : "text-ink-3")} aria-live="polite">
          {status === "saved" && <Check className="h-3 w-3" aria-hidden />} {statusText}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPinned(!pinned);
              queue({ pinned: !pinned }, true);
            }}
            aria-pressed={pinned}
            title={pinned ? "Unpin" : "Pin to top"}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            <span className="hidden sm:inline">{pinned ? "Unpin" : "Pin"}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSensitive(!sensitive);
              queue({ sensitive: !sensitive }, true);
            }}
            aria-pressed={sensitive}
            title={sensitive ? "Private: never sent to AI. Click to allow AI." : "Make private: never sent to AI"}
          >
            {sensitive ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            <span className="hidden sm:inline">{sensitive ? "Private" : "Make private"}</span>
          </Button>
          <Button size="sm" variant={confirmDelete ? "danger" : "ghost"} onClick={remove} loading={deleting} onBlur={() => setConfirmDelete(false)}>
            <Trash2 className="h-4 w-4" /> <span className={cn(!confirmDelete && "hidden sm:inline")}>{confirmDelete ? "Confirm delete" : "Delete"}</span>
          </Button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-6">
        {error && <Alert tone="error">{error}</Alert>}
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          onBlur={() => void flush()}
          maxLength={300}
          placeholder="Untitled"
          aria-label="Title"
          className="w-full bg-transparent font-display text-xl font-semibold text-ink placeholder:text-ink-3 focus:outline-none sm:text-2xl"
        />

        {showUrl ? (
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            {mode === "preview" && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 text-sm text-primary hover:underline">
                <span className="truncate">{hostOf(url)}</span> <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : (
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  queue({ url: e.target.value || null });
                }}
                onBlur={() => void flush()}
                inputMode="url"
                placeholder="https://…"
                aria-label="Link"
                className="h-8"
                maxLength={2000}
              />
            )}
          </div>
        ) : (
          mode === "edit" && (
            <button type="button" onClick={() => setShowUrl(true)} className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-primary">
              <Link2 className="h-3.5 w-3.5" /> Add a link
            </button>
          )
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
              #{t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`} className="text-ink-3 hover:text-ink">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {tags.length < 10 && (
            <input
              value={tagDraft}
              onChange={(e) => {
                const v = e.target.value;
                if (/[,\s]$/.test(v)) addTags(v);
                else setTagDraft(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTags(tagDraft);
                } else if (e.key === "Backspace" && !tagDraft && tags.length) removeTag(tags[tags.length - 1]!);
              }}
              onBlur={() => tagDraft.trim() && addTags(tagDraft)}
              placeholder={tags.length ? "Add tag" : "Add tags, e.g. dbms, exam"}
              aria-label="Add tag"
              maxLength={40}
              className="min-w-24 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-3 focus:outline-none"
            />
          )}
        </div>

        <div className="border-t border-border pt-3">
          {mode === "edit" ? (
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                queue({ body: e.target.value });
              }}
              onBlur={() => void flush()}
              autoFocus={!note.body && !!note.title}
              maxLength={100_000}
              aria-label="Note text"
              placeholder={"Start writing…\n\n# Heading\n- bullet point\n- [ ] something to do\n**bold** and links like https://example.com"}
              className="block w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
            />
          ) : body.trim() ? (
            <NoteMarkdown
              text={body}
              onToggle={(line) => {
                const lines = body.split("\n");
                lines[line] = lines[line]!.replace(/\[( |x|X)\]/, (_m, c) => (c === " " ? "[x]" : "[ ]"));
                const next = lines.join("\n");
                setBody(next);
                queue({ body: next }, true);
              }}
            />
          ) : (
            <button type="button" onClick={() => setMode("edit")} className="py-8 text-sm text-ink-3 hover:text-primary">
              Empty note. Click to start writing.
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-ink-3 sm:px-6">
        {!sensitive && body.trim().length > 20 && <FileTaskFinder noteId={note.id} fileName={title || "Untitled"} />}
        <span className="ml-auto">
          {sensitive ? "Private: never shared with AI · " : ""}Created {new Date(note.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
    </Card>
  );
}
