"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";

/** Bold, inline code and bare http(s) links. Everything else is plain text (no HTML is ever injected). */
function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={k} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{p.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(p))
      return (
        <a key={k} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary hover:underline">
          {p}
        </a>
      );
    return <Fragment key={k}>{p}</Fragment>;
  });
}

/** A small, safe Markdown subset for notes: headings, bullets, numbered lists, checklists, quotes, bold, code, links. */
export function NoteMarkdown({ text, onToggle }: { text: string; onToggle?: (line: number) => void }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const check = line.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const cls = level === 1 ? "text-lg font-semibold" : level === 2 ? "text-base font-semibold" : "text-sm font-semibold uppercase tracking-wide text-ink-2";
      out.push(<p key={i} className={cn("pt-2 font-display text-ink", cls)} role="heading" aria-level={level + 1}>{inline(h[2]!, `h${i}`)}</p>);
      i++;
    } else if (check) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/);
        if (!m) break;
        const done = m[1] !== " ";
        const at = i;
        items.push(
          <li key={i} className="flex items-start gap-2">
            <input type="checkbox" checked={done} onChange={() => onToggle?.(at)} disabled={!onToggle} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" aria-label={m[2] || "Checklist item"} />
            <span className={cn(done && "text-ink-3 line-through")}>{inline(m[2]!, `c${i}`)}</span>
          </li>,
        );
        i++;
      }
      out.push(<ul key={`ul${i}`} className="space-y-1">{items}</ul>);
    } else if (bullet || num) {
      const ordered = !!num;
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        if (/^\s*[-*]\s+\[( |x|X)\]/.test(l)) break;
        const m = ordered ? l.match(/^\s*\d+[.)]\s+(.*)$/) : l.match(/^\s*[-*•]\s+(.*)$/);
        if (!m) break;
        items.push(<li key={i}>{inline(m[1]!, `b${i}`)}</li>);
        i++;
      }
      out.push(ordered ? <ol key={`ol${i}`} className="list-decimal space-y-0.5 pl-5">{items}</ol> : <ul key={`ul${i}`} className="list-disc space-y-0.5 pl-5">{items}</ul>);
    } else if (line.startsWith(">")) {
      out.push(<blockquote key={i} className="border-l-2 border-border-strong pl-3 italic text-ink-2">{inline(line.replace(/^>\s?/, ""), `q${i}`)}</blockquote>);
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      // Consecutive plain lines form one paragraph, keeping line breaks.
      const para: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|\s*[-*•]\s|\s*\d+[.)]\s|>)/.test(lines[i]!)) para.push(lines[i++]!);
      out.push(
        <p key={`p${i}`}>
          {para.map((p, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(p, `p${i}-${j}`)}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <div className="space-y-2.5 text-sm leading-relaxed text-ink">{out}</div>;
}
