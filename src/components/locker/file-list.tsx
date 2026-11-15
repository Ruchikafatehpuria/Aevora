"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, FolderInput, Loader2, Lock, RotateCcw, Sparkles, Star, Trash2 } from "lucide-react";
import type { FileSource } from "@prisma/client";
import { deleteForever, moveFiles, restoreFiles, setArchived, setStarred, trashFiles } from "@/lib/locker/actions";
import { formatBytes } from "@/lib/locker/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FileIcon } from "./file-icon";
import { SOURCE_LABEL, dateFmt } from "./labels";

export type FileRow = {
  id: string;
  displayName: string;
  extension: string;
  sizeBytes: number;
  source: FileSource;
  createdAt: string;
  status: string;
  organization: string;
  sensitive: boolean;
  starred: boolean;
  archived: boolean;
  trashed: boolean;
  category: string | null;
  folderName: string | null;
  failureReason: string | null;
  match?: { page: number | null; pageLabel: string | null; snippet: string } | null;
};

export const FILE_DRAG_TYPE = "application/x-syncly-files";

export function FileList({
  files,
  folders,
  showFolder = true,
  mode = "normal",
}: {
  files: FileRow[];
  folders: { id: string; path: string }[];
  showFolder?: boolean;
  mode?: "normal" | "trash";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = selected.size === files.length && files.length > 0;
  const ids = [...selected];

  return (
    <div>
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5", selected.size === 0 && "text-ink-3")}>
        <input
          type="checkbox"
          aria-label="Select all"
          checked={all}
          onChange={() => setSelected(all ? new Set() : new Set(files.map((f) => f.id)))}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm">{selected.size ? `${selected.size} selected` : `${files.length} file${files.length === 1 ? "" : "s"}`}</span>
        {selected.size > 0 && mode === "trash" && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => (await restoreFiles(ids), setSelected(new Set())))}>
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={() => confirm(`Permanently delete ${ids.length} file${ids.length > 1 ? "s" : ""}? This can't be undone.`) && start(async () => (await deleteForever(ids), setSelected(new Set())))}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete forever
            </Button>
          </div>
        )}
        {selected.size > 0 && mode === "normal" && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-56 text-xs" aria-label="Move to folder">
              <option value="">Move to…</option>
              <option value="__inbox">Inbox (unorganized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!target || pending}
              onClick={() => start(async () => (await moveFiles(ids, target === "__inbox" ? null : target), setSelected(new Set()), setTarget("")))}
            >
              <FolderInput className="h-3.5 w-3.5" /> Move
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => (await setStarred(ids, true), setSelected(new Set())))}>
              <Star className="h-3.5 w-3.5" /> Star
            </Button>
            {files.filter((f) => selected.has(f.id)).every((f) => f.archived) ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => (await setArchived(ids, false), setSelected(new Set())))}>
                <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => (await setArchived(ids, true), setSelected(new Set())))}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => start(async () => (await trashFiles(ids), setSelected(new Set())))}>
              <Trash2 className="h-3.5 w-3.5" /> Move to Trash
            </Button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-border">
        {files.map((f) => (
          <li
            key={f.id}
            draggable
            onDragStart={(e) => {
              const dragIds = selected.has(f.id) ? ids : [f.id];
              e.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify(dragIds));
              e.dataTransfer.effectAllowed = "move";
            }}
            className={cn("group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60", selected.has(f.id) && "bg-primary-soft/50")}
          >
            <input type="checkbox" aria-label={`Select ${f.displayName}`} checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="h-4 w-4 accent-[var(--primary)]" />
            <FileIcon extension={f.extension} />
            <div className="min-w-0 flex-1">
              <Link href={`/locker/files/${f.id}`} className="flex items-center gap-1.5 truncate text-sm font-medium text-ink hover:text-primary">
                {f.sensitive && <Lock className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Sensitive" />}
                <span className="truncate">{f.displayName}</span>
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span>{formatBytes(f.sizeBytes)}</span>
                <span>·</span>
                <span>{dateFmt(f.createdAt)}</span>
                {showFolder && (
                  <>
                    <span>·</span>
                    <span>{f.folderName ?? "Inbox"}</span>
                  </>
                )}
                {f.category && (
                  <>
                    <span>·</span>
                    <span>{f.category}</span>
                  </>
                )}
              </p>
              {f.match && (
                <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                  {f.match.page && <span className="mr-1 font-medium text-primary">{f.match.pageLabel === "slide" ? "Slide" : "Page"} {f.match.page}:</span>}
                  {f.match.snippet}
                </p>
              )}
            </div>
            {mode === "normal" && (
              <button
                onClick={() => start(() => setStarred([f.id], !f.starred))}
                className={cn("rounded p-1 transition-colors", f.starred ? "text-amber-500" : "text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100 focus:opacity-100")}
                aria-label={f.starred ? `Unstar ${f.displayName}` : `Star ${f.displayName}`}
                aria-pressed={f.starred}
              >
                <Star className="h-4 w-4" fill={f.starred ? "currentColor" : "none"} />
              </button>
            )}
            <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
              {f.status === "PROCESSING" && (
                <Badge>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Processing
                </Badge>
              )}
              {f.organization === "SUGGESTED" && f.status === "READY" && (
                <Badge tone="accent">
                  <Sparkles className="mr-1 h-3 w-3" /> Suggestion
                </Badge>
              )}
              <Badge tone={f.source === "WHATSAPP" ? "primary" : "neutral"}>{SOURCE_LABEL[f.source]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
