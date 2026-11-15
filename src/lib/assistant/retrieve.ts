import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type Passage = { fileId: string; fileName: string; extension: string; page: number | null; text: string; rank: number };

// Common words that would otherwise dominate an OR-style keyword search.
const STOP = new Set(
  "a an and are as at be but by can could did do does find for from get give had has have how i in is it its me my of on or please show tell that the their them there these this to was what when where which who why will with you your about any all also into than then".split(" "),
);

function toOrQuery(q: string) {
  const words = [...new Set((q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 16);
  return words.length ? words.map((w) => `${w}:*`).join(" | ") : null;
}

/**
 * Keyword retrieval over the user's passages (file name + text). Sensitive, trashed and pending-duplicate
 * files are never retrieved. Returns the best passages, at most `perFile` from any one file.
 */
export async function retrievePassages(userId: string, query: string, opts: { fileId?: string | null; limit?: number; perFile?: number } = {}) {
  const limit = opts.limit ?? 8;
  const perFile = opts.perFile ?? 3;
  const tsq = toOrQuery(query);

  // Asking about one file: if nothing matches, fall back to its opening passages.
  if (opts.fileId && !tsq) return firstPassages(userId, opts.fileId, limit);
  if (!tsq) return [];

  const rows = await db.$queryRaw<Passage[]>`
    SELECT c."fileId", f."displayName" AS "fileName", f.extension, c.page, c.text,
           ts_rank(to_tsvector('simple'::regconfig, f."displayName" || ' ' || c.text), to_tsquery('simple', ${tsq}))::float AS rank
    FROM "file_chunks" c
    JOIN "imported_files" f ON f.id = c."fileId"
    WHERE c."userId" = ${userId}
      AND f."userId" = ${userId}
      AND f.sensitive = false AND f."deletedAt" IS NULL AND f.status = 'READY'
      ${opts.fileId ? Prisma.sql`AND c."fileId" = ${opts.fileId}` : Prisma.empty}
      AND to_tsvector('simple'::regconfig, f."displayName" || ' ' || c.text) @@ to_tsquery('simple', ${tsq})
    ORDER BY rank DESC
    LIMIT 60`;

  const counts = new Map<string, number>();
  const picked: Passage[] = [];
  for (const r of rows) {
    const n = counts.get(r.fileId) ?? 0;
    if (n >= perFile) continue;
    counts.set(r.fileId, n + 1);
    picked.push(r);
    if (picked.length >= limit) break;
  }
  if (!picked.length && opts.fileId) return firstPassages(userId, opts.fileId, limit);
  return picked;
}

async function firstPassages(userId: string, fileId: string, limit: number): Promise<Passage[]> {
  const chunks = await db.fileChunk.findMany({
    where: { userId, fileId, file: { sensitive: false, deletedAt: null } },
    orderBy: { idx: "asc" },
    take: limit,
    include: { file: { select: { displayName: true, extension: true } } },
  });
  return chunks.map((c) => ({ fileId: c.fileId, fileName: c.file.displayName, extension: c.file.extension, page: c.page, text: c.text, rank: 0 }));
}
