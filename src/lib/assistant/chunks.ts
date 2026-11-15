import "server-only";
import { db } from "@/lib/db";

const SIZE = 1200;
const OVERLAP = 200;
const MAX_CHUNKS = 400;

function split(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  for (let start = 0; start < clean.length && out.length < MAX_CHUNKS; start += SIZE - OVERLAP) {
    let end = Math.min(clean.length, start + SIZE);
    // Prefer to break at a sentence or word boundary.
    if (end < clean.length) {
      const cut = Math.max(clean.lastIndexOf(". ", end), clean.lastIndexOf(" ", end));
      if (cut > start + SIZE / 2) end = cut + 1;
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - (SIZE - OVERLAP);
  }
  return out;
}

/** (Re)builds a file's passages from its extracted text, keeping page numbers when the file has pages. */
export async function indexFileChunks(fileId: string) {
  const file = await db.storedFile.findUnique({ where: { id: fileId }, select: { id: true, userId: true, extractedText: true, pageTexts: true } });
  if (!file) return;
  const rows: { page: number | null; text: string }[] = [];
  const pages = Array.isArray(file.pageTexts) ? (file.pageTexts as string[]) : null;
  if (pages?.length) pages.forEach((p, i) => split(p).forEach((text) => rows.push({ page: i + 1, text })));
  else if (file.extractedText) split(file.extractedText).forEach((text) => rows.push({ page: null, text }));
  await db.$transaction([
    db.fileChunk.deleteMany({ where: { fileId } }),
    db.fileChunk.createMany({ data: rows.slice(0, MAX_CHUNKS).map((r, idx) => ({ fileId, userId: file.userId, idx, page: r.page, text: r.text })) }),
  ]);
}

/** Indexes files that have text but no passages yet (files imported before the assistant existed). */
export async function backfillChunks(userId: string, limit = 50) {
  const files = await db.storedFile.findMany({
    where: { userId, extractedText: { not: null }, chunks: { none: {} }, deletedAt: null },
    select: { id: true },
    take: limit,
  });
  for (const f of files) await indexFileChunks(f.id);
}
