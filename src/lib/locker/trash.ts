import "server-only";
import { db } from "@/lib/db";
import { storage } from "./storage";

export const TRASH_DAYS = 30;

/** Permanently removes a user's files that have been in Trash longer than TRASH_DAYS. Not a server action. */
export async function purgeExpiredTrash(userId: string) {
  const files = await db.storedFile.findMany({ where: { userId, deletedAt: { lt: new Date(Date.now() - TRASH_DAYS * 86400_000) } } });
  for (const f of files) {
    await db.storedFile.delete({ where: { id: f.id } });
    await storage.remove(f.storageKey);
  }
}
