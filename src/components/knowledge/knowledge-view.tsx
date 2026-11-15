"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookMarked, Link2, Lock, NotebookPen, Pin, Plus, Search, Tag, X } from "lucide-react";
import { createNote } from "@/lib/knowledge/actions";
import { hostOf } from "@/lib/knowledge/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NoteEditor, type FullNote } from "./note-editor";

export type NoteFilter = "all" | "notes" | "links" | "pinned";
export type NoteListItem = { id: string; title: string; excerpt: string; url: string | null; tags: string[]; pinned: boolean; sensitive: boolean; updatedAt: string };

function when(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function KnowledgeView({
  notes, tags, total, q, filter, tag, selected, missing,
}: {
  notes: NoteListItem[];
  tags: { tag: string; n: number }[];
  total: number;
  q: string;
  filter: NoteFilter;
  tag: string | null;
  selected: FullNote | null;
  missing: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(q);
  const [linkOpen, setLinkOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  // Search as you type (debounced), keeping the open note.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => router.replace(href({ q: search.trim() || null })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const newNote = () =>
    startCreate(async () => {
      setError(null);
      const res = await createNote({ tags: tag ? [tag] : [] });
      if (res.ok) router.push(href({ note: res.id }));
      else setError(res.error);
    });

  const filters: { key: NoteFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "notes", label: "Notes" },
    { key: "links", label: "Links" },
    { key: "pinned", label: "Pinned" },
  ];
  const filtered = !!q || filter !== "all" || !!tag;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className={cn("min-w-0 space-y-3", selected && "hidden lg:block")} aria-label="Notes">
        <div className="flex gap-2">
          <Button onClick={newNote} loading={creating} className="flex-1">
            <NotebookPen className="h-4 w-4" /> New note
          </Button>
          <Button variant="secondary" onClick={() => setLinkOpen(true)} className="flex-1">
            <Link2 className="h-4 w-4" /> Save link
          </Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes and links" aria-label="Search notes" className="pl-9" />
        </div>

        <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={href({ f: f.key === "all" ? null : f.key })}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-sm", filter === f.key ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Tags">
            {tag && (
              <Link href={href({ tag: null })} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-ink">
                #{tag} <X className="h-3 w-3" aria-label="Clear tag" />
              </Link>
            )}
            {tags
              .filter((t) => t.tag !== tag)
              .map((t) => (
                <Link key={t.tag} href={href({ tag: t.tag })} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2 hover:text-ink">
                  #{t.tag} <span className="text-ink-3">{t.n}</span>
                </Link>
              ))}
          </div>
        )}

        <Card className="overflow-hidden p-0">
          {notes.length === 0 ? (
            <EmptyState
              icon={filtered ? Search : BookMarked}
              title={filtered ? "Nothing matches" : total === 0 ? "Your knowledge base is empty" : "No notes here"}
              description={
                filtered
                  ? "Try another search, filter or tag."
                  : "Write notes, keep lecture summaries, or save useful links. Tag them to find them later."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={href({ note: n.id })}
                    aria-current={selected?.id === n.id ? "page" : undefined}
                    className={cn("block px-4 py-3 hover:bg-surface-2", selected?.id === n.id && "bg-primary-soft hover:bg-primary-soft")}
                  >
                    <div className="flex items-center gap-1.5">
                      {n.url ? <Link2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Link" /> : null}
                      <span className={cn("truncate text-sm font-medium", n.title ? "text-ink" : "text-ink-3")}>{n.title || "Untitled"}</span>
                      {n.sensitive && <Lock className="h-3 w-3 shrink-0 text-ink-3" aria-label="Private" />}
                      {n.pinned && <Pin className="ml-auto h-3 w-3 shrink-0 fill-current text-primary" aria-label="Pinned" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">
                      {n.url && <span className="text-ink-3">{hostOf(n.url)}{n.excerpt ? " · " : ""}</span>}
                      {n.excerpt || (!n.url && <span className="text-ink-3">{n.sensitive ? "Private note" : "Empty note"}</span>)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-3">
                      <span>{when(n.updatedAt)}</span>
                      {n.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {notes.length > 0 && <p className="text-center text-xs text-ink-3">{notes.length === 500 ? "Showing the 500 most recent. Search to find older ones." : `${notes.length} of ${total}`}</p>}
      </section>

      <section className={cn("min-w-0", !selected && "hidden lg:block")} aria-label="Open note">
        {selected ? (
          <NoteEditor key={selected.id} note={selected} backHref={href({ note: null })} onDeleted={() => router.replace(href({ note: null }))} />
        ) : (
          <Card className="h-full">
            <EmptyState
              icon={missing ? X : Tag}
              title={missing ? "That note no longer exists" : "Pick a note or start a new one"}
              description="Notes save automatically as you type. Use # tags, - [ ] checklists and links. Mark a note private to keep it away from AI."
            />
          </Card>
        )}
      </section>

      <SaveLinkModal open={linkOpen} onClose={() => setLinkOpen(false)} onSaved={(id) => router.push(href({ note: id }))} defaultTag={tag} />
    </div>
  );
}

function SaveLinkModal({ open, onClose, onSaved, defaultTag }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; defaultTag: string | null }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setUrl("");
      setTitle("");
      setBody("");
      setError(null);
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createNote({ url, title, body, tags: defaultTag ? [defaultTag] : [] });
      if (res.ok) {
        onClose();
        onSaved(res.id);
      } else setError(res.error);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save a link"
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="link-form" size="sm" loading={pending}><Plus className="h-4 w-4" /> Save link</Button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Link" htmlFor="l-url">
          <Input id="l-url" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus inputMode="url" placeholder="https://…" maxLength={2000} />
        </Field>
        <Field label="Title" htmlFor="l-title" hint="Optional. Left empty, the site's name is used.">
          <Input id="l-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="e.g. Great DBMS normalization explainer" />
        </Field>
        <Field label="Why it's useful" htmlFor="l-body">
          <Textarea id="l-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} placeholder="Optional notes" />
        </Field>
      </form>
    </Modal>
  );
}
