import "server-only";
import { generateText, type ProviderName } from "@/lib/ai/providers";
import type { Passage } from "./retrieve";

/** kind "note" means fileId is a note id. */
export type Source = { n: number; fileId: string; fileName: string; page: number | null; pageLabel: "page" | "slide" | null; kind?: "note" };

const SYSTEM = `You are Syncly Brain, the assistant inside Syncly, a personal workspace for files, learning and career growth.
Be helpful, clear and concise. Use short paragraphs or bullet lists ("- ") when useful. No HTML.
When the user's own files or notes are provided as numbered sources, use them where relevant and cite each fact taken from them with its number in square brackets, like [1] or [2][3]. Only cite numbers that exist.
If the sources don't contain the answer to a question about the user's files, say so plainly instead of guessing; never invent files, dates, names or contents.
For general questions (not about their files) answer from your own knowledge without citations.
Files the user marked sensitive (IDs, financial documents) and notes marked private are never shared with you. If the user asks about something that could be in such a file, say it may be in a file marked sensitive (open it in My Files) or a note marked private (open it in Knowledge); don't suggest uploading it again.
The user's open tasks and calendar for the coming two weeks may be given in <agenda>. Use it to answer questions about their schedule, deadlines and workload, and to help them plan. Don't list it unprompted.
You can't change tasks or events yourself. When the user asks you to add, schedule or remind them of something, or when you've made a plan they asked for, propose each task on its own line in exactly this form:
[[task: short title | YYYY-MM-DD | HH:MM]]
Use "none" for an unknown date or time, resolve relative dates against today's date, and propose at most 8. The user adds each one with a button; never claim you added anything yourself.
You can't send emails or messages or take actions outside Syncly; offer to draft the text instead.`;

type Turn = { role: string; content: string };

export async function answerQuestion(input: { question: string; history: Turn[]; passages: Passage[]; scopedFileName?: string | null; userName: string; today: string; agenda: string | null }) {
  const sources: Source[] = input.passages.map((p, i) => ({
    n: i + 1,
    fileId: p.fileId,
    fileName: p.fileName,
    page: p.page,
    pageLabel: p.page ? (p.extension === "pptx" ? "slide" : "page") : null,
    ...(p.kind ? { kind: p.kind } : {}),
  }));
  const sourceBlock = input.passages.length
    ? `<sources>\n${input.passages
        .map((p, i) => `[${i + 1}] ${p.fileName}${p.page ? ` (${sources[i]!.pageLabel} ${p.page})` : ""}\n${p.text}`)
        .join("\n\n")}\n</sources>`
    : input.scopedFileName
      ? `<sources>None: the file "${input.scopedFileName}" has no readable text.</sources>`
      : "";
  const history = input.history
    .slice(-10)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content.slice(0, 2000)}`)
    .join("\n\n");

  const text = [
    `The user's name is ${input.userName}. Today is ${input.today}.`,
    input.agenda ? `<agenda>\n${input.agenda}\n</agenda>` : null,
    input.scopedFileName ? `This conversation is about the user's file "${input.scopedFileName}".` : null,
    history ? `<conversation_so_far>\n${history}\n</conversation_so_far>` : null,
    sourceBlock || null,
    `User: ${input.question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateText({ system: SYSTEM, text });
  // Keep only cited sources, renumber them 1..k in order of first use, and drop numbers that don't exist.
  const order: number[] = [];
  for (const m of result.text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= sources.length && !order.includes(n)) order.push(n);
  }
  const renumber = new Map(order.map((n, i) => [n, i + 1]));
  const content = result.text.replace(/\[(\d{1,2})\]/g, (_m, n) => (renumber.has(Number(n)) ? `[${renumber.get(Number(n))}]` : ""));
  const used = order.map((n) => ({ ...sources[n - 1]!, n: renumber.get(n)! }));
  return { content, sources: used, provider: result.provider as ProviderName };
}
