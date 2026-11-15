import "server-only";
import type { Prisma, StoredFile } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_CATEGORIES } from "./config";
import type { Suggestion } from "./ai";

export async function getLockerSettings(userId: string) {
  return (
    (await db.lockerSettings.findUnique({ where: { userId } })) ??
    (await db.lockerSettings.create({ data: { userId } }))
  );
}

export async function userCategories(userId: string) {
  const custom = await db.fileCategory.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return [...new Set([...DEFAULT_CATEGORIES, ...custom.map((c) => c.name)])];
}

/** Finds or creates each folder along a path and returns the deepest folder's id. */
export async function ensureFolderPath(userId: string, segments: string[]) {
  let parentId: string | null = null;
  for (const raw of segments) {
    const name = raw.trim().replace(/[\\/]/g, "-").slice(0, 60);
    if (!name) continue;
    const existing: { id: string } | null = await db.folder.findFirst({
      where: { userId, parentId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    parentId = existing ? existing.id : (await db.folder.create({ data: { userId, parentId, name }, select: { id: true } })).id;
  }
  return parentId;
}

export async function folderPaths(userId: string) {
  const folders = await db.folder.findMany({ where: { userId }, select: { id: true, name: true, parentId: true } });
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (id: string): string => {
    const f = byId.get(id)!;
    return f.parentId && byId.has(f.parentId) ? `${pathOf(f.parentId)} / ${f.name}` : f.name;
  };
  return folders.map((f) => ({ id: f.id, path: pathOf(f.id) })).sort((a, b) => a.path.localeCompare(b.path));
}

export async function matchRule(file: Pick<StoredFile, "userId" | "displayName" | "extension" | "source">) {
  const rules = await db.organizationRule.findMany({ where: { userId: file.userId }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] });
  return (
    rules.find((r) => {
      const v = r.matchValue.toLowerCase();
      if (r.matchField === "filename") return file.displayName.toLowerCase().includes(v);
      if (r.matchField === "extension") return file.extension === v.replace(/^\./, "");
      if (r.matchField === "source") return file.source === r.matchValue;
      return false;
    }) ?? null
  );
}

export type StoredSuggestion = Suggestion & { createdAt: string; appliedAutomatically?: boolean };

/** Moves a file per a suggestion (optionally edited by the user) and marks it organized. */
export async function applySuggestion(fileId: string, userId: string, s: Pick<Suggestion, "folderPath" | "category" | "tags"> & Partial<Suggestion>, auto = false) {
  const folderId = await ensureFolderPath(userId, s.folderPath);
  const date = s.documentDate && !Number.isNaN(Date.parse(s.documentDate)) ? new Date(s.documentDate) : undefined;
  const data: Prisma.StoredFileUpdateInput = {
    folder: folderId ? { connect: { id: folderId } } : { disconnect: true },
    organization: "ORGANIZED",
    category: s.category || null,
    tags: s.tags,
    subject: s.subject ?? undefined,
    project: s.project ?? undefined,
    importance: s.importance ?? undefined,
    documentDate: date,
  };
  if (s.sensitive) data.sensitive = true; // only ever escalates protection automatically
  if (auto) {
    const current = await db.storedFile.findUnique({ where: { id: fileId }, select: { suggestion: true } });
    if (current?.suggestion) data.suggestion = { ...(current.suggestion as object), appliedAutomatically: true };
  }
  await db.storedFile.update({ where: { id: fileId }, data });
}
