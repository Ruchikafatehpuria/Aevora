"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Pencil, Sparkles, X } from "lucide-react";
import { acceptSuggestion, dismissSuggestion } from "@/lib/locker/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { FileIcon } from "./file-icon";

export type SuggestionView = {
  fileId: string;
  fileName: string;
  extension: string;
  folderPath: string[];
  category: string;
  tags: string[];
  confidence: number;
  reason: string;
  sensitive: boolean;
  provider?: string | null;
};

export function SuggestionCard({ s }: { s: SuggestionView }) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState(s.folderPath.join(" / "));
  const [category, setCategory] = useState(s.category);
  const [tags, setTags] = useState(s.tags.join(", "));
  const [pending, start] = useTransition();
  const level = s.confidence >= 0.8 ? "High" : s.confidence >= 0.55 ? "Medium" : "Low";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <FileIcon extension={s.extension} />
        <div className="min-w-0 flex-1">
          <Link href={`/locker/files/${s.fileId}`} className="block truncate text-sm font-medium text-ink hover:text-primary">
            {s.fileName}
          </Link>
          {!editing ? (
            <>
              <p className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-ink">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                {s.folderPath.map((seg, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-ink-3" />}
                    <span className="font-medium">{seg}</span>
                  </span>
                ))}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="primary">{s.category}</Badge>
                {s.tags.map((t) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
                {s.sensitive && <Badge tone="warning">Sensitive</Badge>}
                <Badge tone={level === "Low" ? "warning" : "neutral"}>{level} confidence</Badge>
              </div>
              <p className="mt-2 text-xs text-ink-3">
                {s.reason}
                {s.provider && <span> · Suggested by {s.provider}</span>}
              </p>
            </>
          ) : (
            <div className="mt-3 grid gap-2">
              <label className="text-xs font-medium text-ink-2">
                Folder path (use / between folders)
                <Input value={path} onChange={(e) => setPath(e.target.value)} className="mt-1 h-9" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-ink-2">
                  Category
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9" />
                </label>
                <label className="text-xs font-medium text-ink-2">
                  Tags (comma separated)
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 h-9" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => dismissSuggestion(s.fileId))}>
          <X className="h-3.5 w-3.5" /> Keep in Inbox
        </Button>
        {!editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            start(() =>
              acceptSuggestion(
                s.fileId,
                editing
                  ? {
                      folderPath: path.split("/").map((p) => p.trim()).filter(Boolean),
                      category: category.trim(),
                      tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
                    }
                  : undefined,
              ),
            )
          }
        >
          <Check className="h-3.5 w-3.5" /> {editing ? "Save & organize" : "Accept"}
        </Button>
      </div>
    </div>
  );
}
