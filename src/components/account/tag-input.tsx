"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function TagInput({ id, name, defaultValue, placeholder }: { id: string; name: string; defaultValue: string[]; placeholder?: string }) {
  const [tags, setTags] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && tags.length < 30) setTags([...tags, t.slice(0, 40)]);
    setDraft("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-[var(--ring)]">
      <input type="hidden" name={name} value={tags.join(",")} />
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-primary-soft py-0.5 pl-2 pr-1 text-xs font-medium text-primary">
          {t}
          <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="rounded p-0.5 hover:bg-primary/15">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) setTags(tags.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-ink-3"
      />
    </div>
  );
}
