"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeTags, normalizeUrl } from "./shared";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_NOTES = 5000;

const Patch = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(100_000, "This note is too long (100,000 characters max)").optional(),
  url: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string()).max(50).optional(),
  pinned: z.boolean().optional(),
  sensitive: z.boolean().optional(),
});
export type NotePatch = z.infer<typeof Patch>;

function clean(p: NotePatch): Result<{ data: Record<string, unknown> }> {
  const data: Record<string, unknown> = {};
  if (p.title !== undefined) data.title = p.title.trim();
  if (p.body !== undefined) data.body = p.body;
  if (p.url !== undefined) {
    if (p.url === null || !p.url.trim()) data.url = null;
    else {
      const u = normalizeUrl(p.url);
      if (!u) return { ok: false, error: "That doesn't look like a web link (http or https)." };
      data.url = u;
    }
  }
  if (p.tags !== undefined) data.tags = normalizeTags(p.tags);
  if (p.pinned !== undefined) data.pinned = p.pinned;
  if (p.sensitive !== undefined) data.sensitive = p.sensitive;
  return { ok: true, data };
}

export async function createNote(raw: NotePatch = {}): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const parsed = Patch.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (!(await rateLimit(`note:${user.id}`, 200, 3600))) return { ok: false, error: "You've created a lot of notes this hour. Please wait a bit." };
  if ((await db.note.count({ where: { userId: user.id } })) >= MAX_NOTES) return { ok: false, error: `You can keep up to ${MAX_NOTES} notes.` };
  const c = clean(parsed.data);
  if (!c.ok) return c;
  // A saved link without a title is named after its site.
  if (c.data.url && !c.data.title) c.data.title = new URL(c.data.url as string).hostname.replace(/^www\./, "");
  const note = await db.note.create({ data: { userId: user.id, ...c.data }, select: { id: true } });
  revalidatePath("/knowledge");
  return { ok: true, id: note.id };
}

export async function updateNote(id: string, raw: NotePatch): Promise<Result<{ updatedAt: string }>> {
  const user = await requireUser();
  const parsed = Patch.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const c = clean(parsed.data);
  if (!c.ok) return c;
  const res = await db.note.updateMany({ where: { id, userId: user.id }, data: c.data });
  if (!res.count) return { ok: false, error: "This note no longer exists." };
  revalidatePath("/knowledge");
  return { ok: true, updatedAt: new Date().toISOString() };
}

export async function deleteNote(id: string): Promise<Result> {
  const user = await requireUser();
  await db.note.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/knowledge");
  revalidatePath("/overview");
  return { ok: true };
}
