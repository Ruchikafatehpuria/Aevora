"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBar({ aiAvailable }: { aiAvailable: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/locker/files?${next}`);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        set({ q });
      }}
      className="flex flex-wrap items-center gap-2"
      role="search"
    >
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={aiAvailable ? 'Search names, tags and contents, or ask: "PDF from WhatsApp last month"' : "Search names, tags and contents"} className="pl-9" aria-label="Search files" />
      </div>
      {aiAvailable && (
        <label className="flex items-center gap-1.5 text-sm text-ink-2" title="Let AI interpret your search as filters">
          <input type="checkbox" checked={sp.get("smart") === "1"} onChange={(e) => set({ smart: e.target.checked ? "1" : "", q })} className="h-4 w-4 accent-[var(--primary)]" />
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Smart
        </label>
      )}
      <Select value={sp.get("kind") ?? ""} onChange={(e) => set({ kind: e.target.value })} className="h-10 w-36" aria-label="File type">
        <option value="">All types</option>
        {["pdf", "document", "presentation", "spreadsheet", "image", "video", "audio", "text", "archive"].map((k) => (
          <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>
        ))}
      </Select>
      <Select value={sp.get("source") ?? ""} onChange={(e) => set({ source: e.target.value })} className="h-10 w-36" aria-label="Source">
        <option value="">All sources</option>
        <option value="WHATSAPP">WhatsApp</option>
        <option value="MANUAL_UPLOAD">Uploads</option>
        <option value="SHARE_SHEET">Share menu</option>
      </Select>
      <Select value={sp.get("sort") ?? ""} onChange={(e) => set({ sort: e.target.value })} className="h-10 w-36" aria-label="Sort">
        <option value="">{sp.get("q") ? "Relevance" : "Newest"}</option>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="name">Name</option>
        <option value="largest">Largest</option>
      </Select>
      <Button type="submit" variant="secondary">Search</Button>
    </form>
  );
}
