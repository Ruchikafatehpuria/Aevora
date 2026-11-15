import Link from "next/link";
import { sourceHref } from "@/lib/assistant/source-href";
import type { Source } from "@/lib/assistant/answer";
import { TaskSuggestions } from "./task-suggestion";
import { parseTaskLine, type ProposedTask } from "@/lib/assistant/proposals";

/** Renders assistant text safely (no HTML): paragraphs, "- " bullets, **bold**, `code`, and [n] citations as links. */
function inline(text: string, sources: Source[], keyBase: string) {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`\n]+`|\[\d{1,2}\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={`${keyBase}-${i++}`} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else {
      const n = Number(tok.slice(1, -1));
      const s = sources.find((x) => x.n === n);
      out.push(
        s ? (
          <Link
            key={`${keyBase}-${i++}`}
            href={sourceHref(s)}
            title={`${s.fileName}${s.page ? `, ${s.pageLabel} ${s.page}` : ""}`}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary-soft px-1 align-text-top text-[10px] font-semibold text-primary hover:bg-primary hover:text-primary-ink"
          >
            {n}
          </Link>
        ) : (
          tok
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MessageText({ text, sources, existingTasks = new Set() }: { text: string; sources: Source[]; existingTasks?: Set<string> }) {
  // Pull proposed-task lines out into their own blocks so they render as cards with Add buttons.
  const blocks: (string | ProposedTask[])[] = [];
  for (const block of text.split(/\n{2,}/)) {
    let buf: string[] = [];
    for (const line of block.split("\n")) {
      const task = parseTaskLine(line);
      if (task) {
        if (buf.length) {
          blocks.push(buf.join("\n"));
          buf = [];
        }
        const last = blocks[blocks.length - 1];
        if (Array.isArray(last)) last.push(task);
        else blocks.push([task]);
      } else if (line.trim() || buf.length) {
        buf.push(line);
      }
    }
    if (buf.length) blocks.push(buf.join("\n"));
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      {blocks.map((block, bi) => {
        if (Array.isArray(block)) return <TaskSuggestions key={bi} tasks={block} existing={existingTasks} />;
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]!);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), sources, `${bi}-${li}`)}</li>)}
            </Tag>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {inline(block.replace(/^#{1,6}\s+/gm, ""), sources, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}
