/** Task proposals the assistant writes as "[[task: title | YYYY-MM-DD | HH:MM]]" lines. Shared by server and client. */
import { isValidHm, isValidYmd } from "@/lib/time";

export type ProposedTask = { title: string; dueDate: string | null; dueTime: string | null };

export function parseTaskLine(line: string): ProposedTask | null {
  const m = line.trim().match(/^[-*•]?\s*\[\[task:\s*([^|\]]+?)\s*(?:\|\s*([^|\]]*?)\s*)?(?:\|\s*([^|\]]*?)\s*)?\]\]$/i);
  if (!m) return null;
  const dueDate = isValidYmd(m[2]) ? m[2] : null;
  return { title: m[1]!.slice(0, 300), dueDate, dueTime: dueDate && isValidHm(m[3]) ? m[3]! : null };
}

/** Matches a proposal to a task that already exists, so "Added" survives reloads. */
export const proposalKey = (t: { title: string; dueDate: string | null }) => `${t.title.trim().toLowerCase()}|${t.dueDate ?? ""}`;
