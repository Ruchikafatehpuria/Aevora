"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { aiConfigured, generateJson } from "@/lib/ai/providers";
import { isValidHm, isValidYmd, todayIn, weekday, ymdToDate } from "@/lib/time";
import { taskRemindAt, userTimezone } from "./server";

export type FoundTask = { title: string; dueDate: string | null; dueTime: string | null; notes: string | null; evidence: string | null };

const FoundSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      dueTime: z.string().nullable(),
      notes: z.string().nullable(),
      evidence: z.string().nullable(),
    }),
  ),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      description: "At most 15 action items, in the order they are due",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "dueDate", "dueTime", "notes", "evidence"],
        properties: {
          title: { type: "string", description: "Short imperative task, e.g. \"Submit DBMS assignment 3\"" },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD only if the document states or clearly implies the date, else null" },
          dueTime: { type: ["string", "null"], description: "HH:MM 24-hour only if stated, else null" },
          notes: { type: ["string", "null"], description: "One short line of useful detail (venue, what to bring, marks), else null" },
          evidence: { type: ["string", "null"], description: "The exact short phrase from the document this came from" },
        },
      },
    },
  },
};

const SYSTEM = `You extract action items and deadlines from a user's own document (assignment sheets, exam timetables, notices, invoices, offer letters, chat exports).
Only include things the user would actually need to do or attend, such as submissions, exams, payments, registrations, interviews or meetings.
Never invent dates: if a date isn't in the document, use null. Resolve relative dates ("next Monday") only when the document's own date makes them unambiguous.
Skip dates that have clearly passed relative to today unless they are the only content. Return an empty list if there are no action items.
Respond with JSON matching the schema.`;

export async function findTasksInFile(fileId: string): Promise<FindResult> {
  const user = await requireUser();
  const file = await db.storedFile.findFirst({ where: { id: fileId, userId: user.id, deletedAt: null }, select: { displayName: true, extractedText: true, sensitive: true, createdAt: true } });
  if (!file) return { ok: false, error: "File not found" };
  if (file.sensitive) return { ok: false, error: "This file is marked sensitive, so it's never sent to AI." };
  if (!file.extractedText?.trim()) return { ok: false, error: "This file has no readable text to scan." };
  return extractTasks(user, `File name: ${file.displayName}`, file.extractedText, file.createdAt);
}

export async function findTasksInNote(noteId: string): Promise<FindResult> {
  const user = await requireUser();
  const note = await db.note.findFirst({ where: { id: noteId, userId: user.id }, select: { title: true, body: true, sensitive: true, createdAt: true } });
  if (!note) return { ok: false, error: "Note not found" };
  if (note.sensitive) return { ok: false, error: "This note is marked private, so it's never sent to AI." };
  if (!note.body.trim()) return { ok: false, error: "This note is empty." };
  return extractTasks(user, `Note title: ${note.title || "Untitled"}`, note.body, note.createdAt);
}

type FindResult = { ok: true; tasks: FoundTask[] } | { ok: false; error: string };

async function extractTasks(user: Awaited<ReturnType<typeof requireUser>>, label: string, body: string, createdAt: Date): Promise<FindResult> {
  if (!aiConfigured()) return { ok: false, error: "No AI provider is configured on the server." };
  if (!(await rateLimit(`findtasks:${user.id}`, 30, 3600))) return { ok: false, error: "You've scanned a lot this hour. Please wait a bit." };

  const tz = await userTimezone(user.profile?.timezone);
  const today = todayIn(tz);
  try {
    const { data } = await generateJson({
      system: SYSTEM,
      text: `Today is ${today} (${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(today)]}). It was added on ${createdAt.toISOString().slice(0, 10)}.\n${label}\n<document>\n${body.slice(0, 20000)}\n</document>`,
      schemaName: "found_tasks",
      jsonSchema: JSON_SCHEMA,
      validate: FoundSchema,
    });
    const tasks = data.tasks
      .slice(0, 15)
      .map((t) => ({
        title: t.title.trim().slice(0, 300),
        dueDate: isValidYmd(t.dueDate) ? t.dueDate : null,
        dueTime: isValidYmd(t.dueDate) && isValidHm(t.dueTime) ? t.dueTime : null,
        notes: t.notes?.trim().slice(0, 500) || null,
        evidence: t.evidence?.trim().slice(0, 200) || null,
      }))
      .filter((t) => t.title);
    return { ok: true, tasks };
  } catch (e) {
    console.error("findTasks failed", e);
    return { ok: false, error: "The AI service is busy or unavailable right now. Please try again in a moment." };
  }
}

const AddSchema = z.array(
  z.object({
    title: z.string().trim().min(1).max(300),
    dueDate: z.string().refine(isValidYmd).nullable(),
    dueTime: z.string().refine(isValidHm).nullable(),
    notes: z.string().trim().max(5000).nullable(),
  }),
).min(1).max(30);

/** Adds tasks the user confirmed (from a file scan or an assistant suggestion). */
export async function addConfirmedTasks(items: unknown, sourceFileId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = AddSchema.safeParse(items);
  if (!parsed.success) return { ok: false, error: "Some tasks were invalid" };
  if (!(await rateLimit(`task:${user.id}`, 300, 3600))) return { ok: false, error: "Too many tasks created this hour" };
  const source = sourceFileId ? await db.storedFile.findFirst({ where: { id: sourceFileId, userId: user.id }, select: { id: true } }) : null;
  const tz = await userTimezone(user.profile?.timezone);
  const today = todayIn(tz);
  const last = await db.task.findFirst({ where: { userId: user.id, status: "TODO" }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? 0) + 1;
  await db.task.createMany({
    data: parsed.data.map((t) => ({
      userId: user.id,
      title: t.title,
      notes: t.notes || null,
      dueDate: t.dueDate ? ymdToDate(t.dueDate) : null,
      dueTime: t.dueDate ? t.dueTime : null,
      // Deadlines found in documents get a reminder: a day before for date-only, an hour before for timed ones.
      remindAt: t.dueDate && t.dueDate >= today ? taskRemindAt(t.dueDate, t.dueTime, t.dueTime ? 60 : 1440, tz) : null,
      sourceFileId: source?.id ?? null,
      position: pos++,
    })),
  });
  revalidatePath("/tasks");
  revalidatePath("/scheduler");
  revalidatePath("/overview");
  return { ok: true, count: parsed.data.length };
}
