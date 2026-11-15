"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma, type FileSource, type OrganizeMode } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/crypto";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/auth/actions";
import { storage } from "./storage";
import { applySuggestion, ensureFolderPath, type StoredSuggestion } from "./organize";
import { runPendingJobs } from "./jobs";

const refresh = () => revalidatePath("/locker", "layout");

async function ownFile(userId: string, id: string) {
  const f = await db.storedFile.findFirst({ where: { id, userId } });
  if (!f) throw new Error("File not found");
  return f;
}

async function ownFolder(userId: string, id: string | null) {
  if (!id) return null;
  const f = await db.folder.findFirst({ where: { id, userId } });
  if (!f) throw new Error("Folder not found");
  return f;
}

async function deleteFileRecord(file: { id: string; storageKey: string }) {
  await db.storedFile.delete({ where: { id: file.id } });
  await storage.remove(file.storageKey);
}

// ── Files ──

export async function moveFiles(fileIds: string[], folderId: string | null) {
  const user = await requireUser();
  await ownFolder(user.id, folderId);
  await db.storedFile.updateMany({
    where: { id: { in: fileIds }, userId: user.id, status: { not: "DUPLICATE_PENDING" } },
    data: { folderId, organization: folderId ? "ORGANIZED" : "INBOX" },
  });
  refresh();
}

export async function renameFile(fileId: string, name: string) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  const clean = name.trim().replace(/[\\/]/g, "-").slice(0, 200);
  if (!clean) return;
  // Keep the real extension so downloads open correctly.
  const withExt = clean.toLowerCase().endsWith(`.${file.extension}`) ? clean : `${clean}.${file.extension}`;
  await db.storedFile.update({ where: { id: file.id }, data: { displayName: withExt } });
  refresh();
}

const detailsSchema = z.object({
  category: z.string().trim().max(60),
  tags: z.string().max(600),
  subject: z.string().trim().max(120),
  project: z.string().trim().max(120),
  importance: z.enum(["", "low", "normal", "high"]),
  description: z.string().trim().max(2000),
  documentDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

export async function updateFileDetails(fileId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await ownFile(user.id, fileId);
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the details and try again." };
  const d = parsed.data;
  await db.storedFile.update({
    where: { id: fileId },
    data: {
      category: d.category || null,
      tags: [...new Set(d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
      subject: d.subject || null,
      project: d.project || null,
      importance: d.importance || null,
      description: d.description || null,
      documentDate: d.documentDate ? new Date(d.documentDate) : null,
    },
  });
  refresh();
  return { success: "Details saved." };
}

export async function setSensitive(fileId: string, sensitive: boolean) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  // Removing protection requires a recently confirmed password.
  if (!sensitive && file.sensitive && !(await isElevated())) throw new Error("Confirm your password first");
  await db.storedFile.update({ where: { id: file.id }, data: { sensitive } });
  refresh();
}

/** Moves files to Trash. They can be restored for 30 days. */
export async function trashFiles(fileIds: string[]) {
  const user = await requireUser();
  await db.storedFile.updateMany({ where: { id: { in: fileIds }, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
  refresh();
}

export async function restoreFiles(fileIds: string[]) {
  const user = await requireUser();
  const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, userId: user.id, deletedAt: { not: null } }, include: { folder: true } });
  for (const f of files) {
    // If the folder was deleted meanwhile, the file returns to the Inbox.
    await db.storedFile.update({ where: { id: f.id }, data: { deletedAt: null, ...(f.folderId && !f.folder ? { folderId: null, organization: "INBOX" } : {}) } });
  }
  refresh();
}

/** Permanent deletion; only for files already in Trash. */
export async function deleteForever(fileIds: string[]) {
  const user = await requireUser();
  const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, userId: user.id, deletedAt: { not: null } } });
  for (const f of files) await deleteFileRecord(f);
  refresh();
}

export async function emptyTrash() {
  const user = await requireUser();
  const files = await db.storedFile.findMany({ where: { userId: user.id, deletedAt: { not: null } } });
  for (const f of files) await deleteFileRecord(f);
  refresh();
}

export async function setStarred(fileIds: string[], starred: boolean) {
  const user = await requireUser();
  await db.storedFile.updateMany({ where: { id: { in: fileIds }, userId: user.id }, data: { starred } });
  refresh();
}

export async function setArchived(fileIds: string[], archived: boolean) {
  const user = await requireUser();
  await db.storedFile.updateMany({ where: { id: { in: fileIds }, userId: user.id }, data: { archivedAt: archived ? new Date() : null } });
  refresh();
}

/** Makes an independent copy (new bytes, same metadata) in the chosen folder. */
export async function copyFile(fileId: string, folderId: string | null) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  await ownFolder(user.id, folderId);
  if (file.sensitive && !(await isElevated())) throw new Error("Confirm your password first");
  const { limits } = await import("./config");
  const { storageUsed } = await import("./ingest");
  if ((await storageUsed(user.id)) + Number(file.sizeBytes) > limits.quotaBytes) throw new Error("Not enough storage for a copy");
  const written = await storage.write((await storage.read(file.storageKey)), Number(file.sizeBytes));
  const base = file.displayName.replace(new RegExp(`\\.${file.extension}$`, "i"), "");
  const copy = await db.storedFile.create({
    data: {
      userId: user.id,
      folderId,
      storageKey: written.key,
      originalName: file.originalName,
      displayName: `${base} (copy).${file.extension}`,
      extension: file.extension,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: written.sha256,
      source: file.source,
      sourceDetail: file.sourceDetail,
      originalPath: file.originalPath,
      status: "READY",
      organization: folderId ? "ORGANIZED" : "INBOX",
      category: file.category,
      tags: file.tags,
      subject: file.subject,
      project: file.project,
      importance: file.importance,
      documentDate: file.documentDate,
      sensitive: file.sensitive,
      description: file.description,
      extractedText: file.extractedText,
      pageTexts: file.pageTexts ?? undefined,
    },
  });
  const { indexFileChunks } = await import("@/lib/assistant/chunks");
  await indexFileChunks(copy.id);
  refresh();
  return copy.id;
}

export async function retryProcessing(fileId: string) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  await db.storedFile.update({ where: { id: file.id }, data: { status: "PROCESSING", failureReason: null } });
  await db.fileProcessingJob.create({ data: { fileId: file.id, kind: "process" } });
  await runPendingJobs(5);
  refresh();
}

// ── Suggestions ──

export async function acceptSuggestion(fileId: string, edited?: { folderPath: string[]; category: string; tags: string[] }) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  const s = file.suggestion as StoredSuggestion | null;
  if (!s && !edited) return;
  await applySuggestion(file.id, user.id, { ...(s ?? {}), ...(edited ?? {}) } as StoredSuggestion);
  refresh();
}

export async function acceptAllSuggestions() {
  const user = await requireUser();
  const files = await db.storedFile.findMany({ where: { userId: user.id, organization: "SUGGESTED", status: "READY" } });
  for (const f of files) if (f.suggestion) await applySuggestion(f.id, user.id, f.suggestion as StoredSuggestion);
  refresh();
}

export async function dismissSuggestion(fileId: string) {
  const user = await requireUser();
  await ownFile(user.id, fileId);
  await db.storedFile.update({ where: { id: fileId }, data: { organization: "INBOX", suggestion: Prisma.DbNull } });
  refresh();
}

// ── Duplicates ──

export async function resolveDuplicate(fileId: string, choice: "skip" | "keep_both" | "replace", confirmReplace = false) {
  const user = await requireUser();
  const file = await ownFile(user.id, fileId);
  if (file.status !== "DUPLICATE_PENDING") return;
  const original = file.duplicateOfId ? await db.storedFile.findFirst({ where: { id: file.duplicateOfId, userId: user.id } }) : null;

  if (choice === "skip") {
    await deleteFileRecord(file);
  } else if (choice === "keep_both" || !original) {
    await db.storedFile.update({ where: { id: file.id }, data: { status: "PROCESSING", duplicateOfId: null, jobs: { create: { kind: "process" } } } });
    await runPendingJobs(5);
  } else {
    if (!confirmReplace) throw new Error("Replacing requires confirmation");
    // Replace = the new upload takes the original's place (folder, tags, metadata); the old copy is deleted.
    await db.storedFile.update({
      where: { id: file.id },
      data: {
        status: "READY",
        duplicateOfId: null,
        folderId: original.folderId,
        organization: original.organization,
        category: original.category,
        tags: original.tags,
        subject: original.subject,
        project: original.project,
        importance: original.importance,
        documentDate: original.documentDate,
        sensitive: original.sensitive,
        extractedText: original.extractedText,
        pageTexts: original.pageTexts ?? undefined,
      },
    });
    await db.whatsappAttachment.updateMany({ where: { fileId: original.id }, data: { fileId: file.id } });
    await deleteFileRecord(original);
  }
  refresh();
}

// ── Folders ──

export async function createFolder(name: string, parentId: string | null) {
  const user = await requireUser();
  const parent = await ownFolder(user.id, parentId);
  const clean = name.trim().replace(/[\\/]/g, "-").slice(0, 60);
  if (!clean) throw new Error("Enter a folder name");
  const id = await ensureFolderPath(user.id, parent ? [...(await pathSegments(parent.id)), clean] : [clean]);
  refresh();
  return id;
}

async function pathSegments(folderId: string): Promise<string[]> {
  const f = await db.folder.findUnique({ where: { id: folderId } });
  if (!f) return [];
  return f.parentId ? [...(await pathSegments(f.parentId)), f.name] : [f.name];
}

export async function renameFolder(folderId: string, name: string) {
  const user = await requireUser();
  const folder = await ownFolder(user.id, folderId);
  const clean = name.trim().replace(/[\\/]/g, "-").slice(0, 60);
  if (!folder || !clean) return;
  const clash = await db.folder.findFirst({ where: { userId: user.id, parentId: folder.parentId, name: { equals: clean, mode: "insensitive" }, NOT: { id: folder.id } } });
  if (clash) throw new Error("A folder with that name already exists here");
  await db.folder.update({ where: { id: folder.id }, data: { name: clean } });
  refresh();
}

/** Deletes a folder. Files inside (including subfolders) go back to the Inbox; they are never deleted. */
export async function deleteFolder(folderId: string) {
  const user = await requireUser();
  const folder = await ownFolder(user.id, folderId);
  if (!folder) return;
  const all = await db.folder.findMany({ where: { userId: user.id }, select: { id: true, parentId: true } });
  const ids = new Set([folder.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of all) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  await db.storedFile.updateMany({ where: { userId: user.id, folderId: { in: [...ids] } }, data: { folderId: null, organization: "INBOX" } });
  await db.folder.delete({ where: { id: folder.id } });
  refresh();
}

// ── Settings, rules, categories ──

export async function updateLockerSettings(input: { organizeMode: OrganizeMode; aiReadsContent: boolean; autoApplyMinConfidence: number }) {
  const user = await requireUser();
  const data = {
    organizeMode: input.organizeMode,
    aiReadsContent: input.aiReadsContent,
    autoApplyMinConfidence: Math.min(0.99, Math.max(0.5, input.autoApplyMinConfidence)),
  };
  await db.lockerSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  refresh();
}

const ruleSchema = z.object({
  matchField: z.enum(["filename", "extension", "source"]),
  matchValue: z.string().trim().min(1, "Enter a value").max(100),
  folderPath: z.string().trim().min(1, "Enter a folder path").max(250),
  category: z.string().trim().max(60),
});

export async function addRule(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const r = parsed.data;
  await db.organizationRule.create({
    data: {
      userId: user.id,
      matchField: r.matchField,
      matchValue: r.matchField === "source" ? (r.matchValue.toUpperCase() as FileSource) : r.matchValue,
      folderPath: r.folderPath.split("/").map((s) => s.trim()).filter(Boolean).join(" / "),
      category: r.category || null,
    },
  });
  refresh();
  return { success: "Rule added. It applies to new imports." };
}

export async function deleteRule(ruleId: string) {
  const user = await requireUser();
  await db.organizationRule.deleteMany({ where: { id: ruleId, userId: user.id } });
  refresh();
}

export async function addCategory(name: string) {
  const user = await requireUser();
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  await db.fileCategory.upsert({ where: { userId_name: { userId: user.id, name: clean } }, create: { userId: user.id, name: clean }, update: {} });
  refresh();
}

export async function deleteCategory(id: string) {
  const user = await requireUser();
  await db.fileCategory.deleteMany({ where: { id, userId: user.id } });
  refresh();
}

// ── Sensitive file unlock ──

async function currentSessionHash() {
  return hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? "");
}

async function isElevated() {
  const s = await db.session.findUnique({ where: { tokenHash: await currentSessionHash() } });
  return !!s?.elevatedUntil && s.elevatedUntil > new Date();
}

export async function unlockSensitive(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await rateLimit(`elevate:${user.id}`, 5, 900))) return { error: "Too many attempts. Try again in 15 minutes." };
  if (!(await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash))) return { error: "Incorrect password." };
  await db.session.update({ where: { tokenHash: await currentSessionHash() }, data: { elevatedUntil: new Date(Date.now() + 10 * 60_000) } });
  refresh();
  return { success: "Unlocked for 10 minutes." };
}
