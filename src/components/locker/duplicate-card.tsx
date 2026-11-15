"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resolveDuplicate } from "@/lib/locker/actions";
import { formatBytes } from "@/lib/locker/config";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import { SOURCE_LABEL, dateFmt } from "./labels";

type Side = { id: string; name: string; extension: string; size: number; createdAt: string; location: string; source: keyof typeof SOURCE_LABEL };

export function DuplicateCard({ incoming, existing }: { incoming: Side; existing: Side | null }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const col = (label: string, f: Side, link: boolean) => (
    <div className="flex-1 rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <div className="mt-2 flex items-center gap-2.5">
        <FileIcon extension={f.extension} className="h-8 w-8" />
        {link ? (
          <Link href={`/locker/files/${f.id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:text-primary">{f.name}</Link>
        ) : (
          <p className="min-w-0 truncate text-sm font-medium text-ink">{f.name}</p>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-ink-3">Location</dt><dd className="truncate text-ink-2">{f.location}</dd>
        <dt className="text-ink-3">Size</dt><dd className="text-ink-2">{formatBytes(f.size)}</dd>
        <dt className="text-ink-3">Uploaded</dt><dd className="text-ink-2">{dateFmt(f.createdAt)}</dd>
        <dt className="text-ink-3">Source</dt><dd className="text-ink-2">{SOURCE_LABEL[f.source]}</dd>
      </dl>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-ink-2">These files are byte-for-byte identical (same SHA-256 fingerprint).</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {col("New upload", incoming, false)}
        {existing ? col("Already in your locker", existing, true) : <p className="flex-1 text-sm text-ink-3">The original was deleted.</p>}
      </div>
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-danger-soft p-3">
          <p className="mr-auto text-sm text-danger">Replace the existing copy? It will be deleted and the new upload takes its folder and details.</p>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button size="sm" variant="danger" loading={pending} onClick={() => start(() => resolveDuplicate(incoming.id, "replace", true))}>Replace</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {existing && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>Replace existing</Button>}
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => resolveDuplicate(incoming.id, "keep_both"))}>Keep both</Button>
          <Button size="sm" loading={pending} onClick={() => start(() => resolveDuplicate(incoming.id, "skip"))}>Skip duplicate</Button>
        </div>
      )}
    </div>
  );
}
