import "server-only";
import { PassThrough, type Readable } from "node:stream";
import { db } from "@/lib/db";
import { storage } from "./storage";

export const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_CHUNK_BYTES = CHUNK_BYTES + 64 * 1024;
export const isUploadId = (s: string | null): s is string => !!s && /^[a-zA-Z0-9-]{8,64}$/.test(s);

export async function saveChunk(userId: string, uploadId: string, index: number, body: Readable) {
  const { key, size } = await storage.write(body, MAX_CHUNK_BYTES);
  // Re-sending the same piece (a retry) replaces the earlier copy.
  const prev = await db.uploadChunk.findUnique({ where: { userId_uploadId_index: { userId, uploadId, index } } });
  await db.uploadChunk.upsert({
    where: { userId_uploadId_index: { userId, uploadId, index } },
    create: { userId, uploadId, index, key, size },
    update: { key, size, createdAt: new Date() },
  });
  if (prev) await storage.remove(prev.key).catch(() => {});
  return size;
}

/** The pieces of an upload, in order, as one stream; null if any piece is missing. */
export async function assembledUpload(userId: string, uploadId: string, expected: number) {
  const chunks = await db.uploadChunk.findMany({ where: { userId, uploadId }, orderBy: { index: "asc" } });
  if (!chunks.length || chunks.length !== expected || chunks.some((c, i) => c.index !== i)) return null;
  const out = new PassThrough();
  (async () => {
    try {
      for (const c of chunks) {
        const part = await storage.read(c.key);
        for await (const buf of part) if (!out.write(buf)) await new Promise((r) => out.once("drain", r));
      }
      out.end();
    } catch (e) {
      out.destroy(e as Error);
    }
  })();
  return { stream: out as Readable, size: chunks.reduce((n, c) => n + c.size, 0) };
}

export async function discardUpload(userId: string, uploadId: string) {
  const chunks = await db.uploadChunk.findMany({ where: { userId, uploadId } });
  await Promise.all(chunks.map((c) => storage.remove(c.key).catch(() => {})));
  await db.uploadChunk.deleteMany({ where: { userId, uploadId } });
}

/** Removes pieces of uploads that were abandoned more than a day ago. */
export async function purgeStaleChunks() {
  const stale = await db.uploadChunk.findMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } }, take: 200 });
  for (const c of stale) {
    await storage.remove(c.key).catch(() => {});
    await db.uploadChunk.delete({ where: { id: c.id } }).catch(() => {});
  }
}
