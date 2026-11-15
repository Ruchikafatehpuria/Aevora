"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudUpload, Copy, FolderOpen, MessageCircle, RotateCw, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { EXTENSIONS, extensionOf, formatBytes } from "@/lib/locker/config";
import { FileIcon } from "./file-icon";

type Status = "queued" | "uploading" | "done" | "failed" | "cancelled";
type ImportResult = { imported: { id: string; name: string; duplicate: boolean }[]; failed: { name: string; reason: string }[]; archiveId?: string };
type Item = {
  id: string;
  file: File;
  relPath: string | null;
  status: Status;
  progress: number;
  error?: string;
  /** False when the server rejected the file itself (type, size, quota); retrying wouldn't help. */
  retryable?: boolean;
  result?: ImportResult;
};

const CONCURRENCY = 3;

async function readEntries(entry: FileSystemEntry, prefix = ""): Promise<{ file: File; path: string }[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    return [{ file, path: prefix + file.name }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const out: { file: File; path: string }[] = [];
  // readEntries returns batches; keep reading until empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const e of batch) out.push(...(await readEntries(e, `${prefix}${entry.name}/`)));
  }
  return out;
}

export function UploadCentre({ maxBytes, quotaRemaining }: { maxBytes: number; quotaRemaining: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState<"MANUAL_UPLOAD" | "WHATSAPP">("MANUAL_UPLOAD");
  const [extractZips, setExtractZips] = useState(true);
  const [dragging, setDragging] = useState(false);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const batch = useRef<Promise<string | null> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = useCallback(
    (files: { file: File; path: string | null }[]) => {
      const next: Item[] = files.map(({ file, path }) => {
        const ext = extensionOf(file.name);
        const error = !EXTENSIONS[ext]
          ? `.${ext || "?"} files aren't supported`
          : file.size > maxBytes
            ? `Larger than the ${formatBytes(maxBytes)} limit`
            : file.size === 0
              ? "The file is empty"
              : undefined;
        return { id: crypto.randomUUID(), file, relPath: path, status: error ? "failed" : "queued", progress: 0, error };
      });
      if (!items.some((i) => i.status === "queued" || i.status === "uploading")) batch.current = null;
      setItems((list) => [...next, ...list]);
    },
    [items, maxBytes],
  );

  const upload = useCallback(
    async (item: Item) => {
      update(item.id, { status: "uploading", progress: 0, error: undefined });
      // One batch per upload session, shared by concurrent uploads.
      batch.current ??= fetch("/api/locker/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) })
        .then(async (r) => (r.ok ? ((await r.json()).id as string) : null))
        .catch(() => null);
      const batchId = await batch.current;
      const xhr = new XMLHttpRequest();
      xhrs.current.set(item.id, xhr);
      xhr.open("POST", "/api/locker/upload");
      xhr.setRequestHeader("x-file-name", encodeURIComponent(item.file.name));
      xhr.setRequestHeader("x-source", source);
      xhr.setRequestHeader("x-zip-mode", extractZips ? "extract" : "keep");
      if (batchId) xhr.setRequestHeader("x-batch-id", batchId);
      if (item.relPath) xhr.setRequestHeader("x-relative-path", encodeURIComponent(item.relPath));
      xhr.upload.onprogress = (e) => e.lengthComputable && update(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        xhrs.current.delete(item.id);
        let body: (ImportResult & { error?: string }) | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && body) {
          const allFailed = body.imported.length === 0 && body.failed.length > 0;
          update(item.id, { status: allFailed ? "failed" : "done", progress: 100, result: body, error: allFailed ? body.failed[0]!.reason : undefined });
        } else {
          update(item.id, { status: "failed", retryable: xhr.status >= 500 || xhr.status === 429, error: body?.error ?? `Upload failed (${xhr.status || "network error"})` });
        }
      };
      xhr.onerror = () => {
        xhrs.current.delete(item.id);
        update(item.id, { status: "failed", retryable: true, error: "Network error. Check your connection and retry." });
      };
      xhr.onabort = () => {
        xhrs.current.delete(item.id);
        update(item.id, { status: "cancelled", progress: 0 });
      };
      xhr.send(item.file);
    },
    [source, extractZips],
  );

  // Simple scheduler: keep up to CONCURRENCY uploads running.
  useEffect(() => {
    const running = items.filter((i) => i.status === "uploading").length;
    const queued = items.filter((i) => i.status === "queued").reverse();
    queued.slice(0, Math.max(0, CONCURRENCY - running)).forEach((i) => void upload(i));
    if (running === 0 && queued.length === 0 && items.some((i) => i.status === "done")) router.refresh();
  }, [items, upload, router]);

  // Warn before leaving mid-upload.
  useEffect(() => {
    const active = items.some((i) => i.status === "uploading" || i.status === "queued");
    if (!active) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [items]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
    if (entries.length) {
      const all = (await Promise.all(entries.map((en) => readEntries(en)))).flat();
      addFiles(all.map(({ file, path }) => ({ file, path: path.includes("/") ? path : null })));
    } else {
      addFiles([...e.dataTransfer.files].map((file) => ({ file, path: null })));
    }
  };

  const totals = {
    done: items.filter((i) => i.status === "done").length,
    failed: items.filter((i) => i.status === "failed").length,
    active: items.filter((i) => i.status === "uploading" || i.status === "queued").length,
    duplicates: items.reduce((n, i) => n + (i.result?.imported.filter((r) => r.duplicate).length ?? 0), 0),
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Where are these files from?</legend>
            <span className="text-sm text-ink-2">These files are from</span>
            {(
              [
                ["MANUAL_UPLOAD", "My device"],
                ["WHATSAPP", "WhatsApp"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSource(v)}
                aria-pressed={source === v}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  source === v ? "border-primary bg-primary-soft font-medium text-primary" : "border-border text-ink-2 hover:border-border-strong",
                )}
              >
                {l}
              </button>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={extractZips} onChange={(e) => setExtractZips(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Extract ZIP files (WhatsApp chat exports are detected automatically)
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-2/50",
          )}
        >
          <CloudUpload className={cn("h-10 w-10", dragging ? "text-primary" : "text-ink-3")} />
          <p className="mt-3 font-display text-base font-semibold text-ink">Drop files or folders here</p>
          <p className="mt-1 text-sm text-ink-2">
            PDFs, Office files, images, videos, audio, ZIPs and WhatsApp chat exports · up to {formatBytes(maxBytes)} each · {formatBytes(quotaRemaining)} free
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => fileInput.current?.click()}>
              Choose files
            </Button>
            <Button type="button" variant="secondary" onClick={() => folderInput.current?.click()}>
              <FolderOpen className="h-4 w-4" /> Choose folder
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])].map((file) => ({ file, path: null })));
              e.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: "" } as object)}
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])].map((file) => ({ file, path: file.webkitRelativePath || null })));
              e.target.value = "";
            }}
          />
        </div>
      </Card>

      {items.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <p className="text-sm text-ink-2" aria-live="polite">
              {totals.active > 0 ? `Uploading ${totals.active}…` : "Uploads finished"} · {totals.done} saved
              {totals.failed > 0 && <span className="text-danger"> · {totals.failed} failed</span>}
            </p>
            <div className="flex gap-2">
              {totals.duplicates > 0 && (
                <Link href="/locker/inbox?section=duplicates" className="text-sm font-medium text-warning hover:underline">
                  Review {totals.duplicates} duplicate{totals.duplicates > 1 ? "s" : ""}
                </Link>
              )}
              {totals.done > 0 && (
                <Link href="/locker/inbox" className="text-sm font-medium text-primary hover:underline">
                  Open Inbox
                </Link>
              )}
              {totals.active === 0 && (
                <button className="text-sm text-ink-3 hover:text-ink" onClick={() => setItems([])}>
                  Clear list
                </button>
              )}
            </div>
          </div>
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <FileIcon extension={extensionOf(i.file.name)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={i.relPath ?? i.file.name}>
                    {i.relPath ?? i.file.name}
                  </p>
                  {i.status === "uploading" ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${i.progress}%` }} />
                    </div>
                  ) : (
                    <p className={cn("mt-0.5 text-xs", i.status === "failed" ? "text-danger" : "text-ink-3")}>
                      {i.status === "failed" ? i.error : i.status === "cancelled" ? "Cancelled" : i.status === "queued" ? "Waiting…" : formatBytes(i.file.size)}
                      {i.status === "done" && i.result && <ResultSummary result={i.result} />}
                    </p>
                  )}
                </div>
                {i.status === "done" && <CheckCircle2 className="h-5 w-5 text-success" aria-label="Saved" />}
                {(i.status === "uploading" || i.status === "queued") && (
                  <button
                    onClick={() => (xhrs.current.get(i.id)?.abort(), i.status === "queued" && update(i.id, { status: "cancelled" }))}
                    className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
                    aria-label={`Cancel ${i.file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {(i.status === "cancelled" || (i.status === "failed" && i.retryable)) && (
                  <Button size="sm" variant="ghost" onClick={() => update(i.id, { status: "queued", error: undefined })}>
                    <RotateCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                )}
                {i.status === "failed" && !i.retryable && <XCircle className="h-5 w-5 text-danger" aria-hidden />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: ImportResult }) {
  const dup = result.imported.filter((r) => r.duplicate).length;
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1.5">
      {result.imported.length > 1 && <span>· {result.imported.length} files imported</span>}
      {dup > 0 && (
        <Badge tone="warning">
          <Copy className="mr-1 h-3 w-3" /> {dup} duplicate{dup > 1 ? "s" : ""}
        </Badge>
      )}
      {result.failed.length > 0 && <span className="text-danger">· {result.failed.length} skipped</span>}
      {result.archiveId && (
        <Link href={`/locker/chats/${result.archiveId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <MessageCircle className="h-3 w-3" /> View chat
        </Link>
      )}
    </span>
  );
}
