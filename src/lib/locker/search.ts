import "server-only";
import { Prisma, type FileSource } from "@prisma/client";
import { db } from "@/lib/db";
import { EXTENSIONS, type FileKind } from "./config";

export type FileQuery = {
  q?: string;
  folderId?: string | null; // undefined = any folder, null = root/unfiled
  source?: FileSource;
  kinds?: FileKind[];
  category?: string;
  tag?: string;
  after?: Date;
  before?: Date;
  sort?: "newest" | "oldest" | "name" | "largest" | "relevance";
  trash?: boolean;
  starred?: boolean;
  take?: number;
};

export const extsForKinds = (kinds: FileKind[]) => Object.entries(EXTENSIONS).filter(([, v]) => kinds.includes(v.kind)).map(([k]) => k);

function toTsQuery(q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

// Must match the expression of imported_files_fts_idx exactly so Postgres uses the index.
export const FTS_DOC = Prisma.sql`to_tsvector('simple'::regconfig,
    coalesce("displayName", '') || ' ' || coalesce("category", '') || ' ' || coalesce("subject", '') || ' ' ||
    coalesce("project", '') || ' ' || syncly_join_tags("tags") || ' ' || coalesce("description", '') || ' ' ||
    coalesce(left("extractedText", 200000), ''))`;

export async function searchFiles(userId: string, query: FileQuery) {
  const where: Prisma.StoredFileWhereInput = { userId, status: { not: "FAILED" }, deletedAt: query.trash ? { not: null } : null };
  if (query.starred) where.starred = true;
  if (query.folderId !== undefined) where.folderId = query.folderId;
  if (query.source) where.source = query.source;
  if (query.kinds?.length) where.extension = { in: extsForKinds(query.kinds) };
  if (query.category) where.category = { equals: query.category, mode: "insensitive" };
  if (query.tag) where.tags = { has: query.tag };
  if (query.after || query.before) where.createdAt = { gte: query.after, lte: query.before };

  let ranked: Map<string, number> | null = null;
  const tsq = query.q ? toTsQuery(query.q) : null;
  if (query.q && tsq) {
    const rows = await db.$queryRaw<{ id: string; rank: number }[]>`
      SELECT id, ts_rank(${FTS_DOC}, to_tsquery('simple', ${tsq})) AS rank
      FROM "imported_files"
      WHERE "userId" = ${userId} AND ${FTS_DOC} @@ to_tsquery('simple', ${tsq})
      ORDER BY rank DESC LIMIT 500`;
    ranked = new Map(rows.map((r) => [r.id, r.rank]));
    where.id = { in: [...ranked.keys()] };
  } else if (query.q) {
    return [];
  }

  const sort = query.sort ?? (ranked ? "relevance" : "newest");
  const orderBy: Prisma.StoredFileOrderByWithRelationInput =
    sort === "oldest" ? { createdAt: "asc" } : sort === "name" ? { displayName: "asc" } : sort === "largest" ? { sizeBytes: "desc" } : { createdAt: "desc" };
  const files = await db.storedFile.findMany({
    where,
    orderBy,
    take: query.take ?? 200,
    include: { folder: { select: { id: true, name: true } } },
  });
  if (sort === "relevance" && ranked) files.sort((a, b) => (ranked!.get(b.id) ?? 0) - (ranked!.get(a.id) ?? 0));

  const words = query.q?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return files.map((f) => ({ ...f, match: words.length ? locateMatch(f, words) : null }));
}

/** Finds where the query matched: a page number for paged documents and a short snippet. */
function locateMatch(f: { pageTexts: Prisma.JsonValue; extractedText: string | null; extension: string }, words: string[]) {
  const pages = Array.isArray(f.pageTexts) ? (f.pageTexts as string[]) : null;
  const find = (text: string) => {
    const lower = text.toLowerCase();
    for (const w of words) {
      const i = lower.indexOf(w);
      if (i !== -1) return i;
    }
    return -1;
  };
  const snippet = (text: string, i: number) => (i > 60 ? "…" : "") + text.slice(Math.max(0, i - 60), i + 120).replace(/\s+/g, " ").trim() + "…";
  if (pages) {
    for (let p = 0; p < pages.length; p++) {
      const i = find(pages[p]!);
      if (i !== -1) return { page: p + 1, pageLabel: f.extension === "pptx" ? "slide" : "page", snippet: snippet(pages[p]!, i) };
    }
  }
  if (f.extractedText) {
    const i = find(f.extractedText);
    if (i !== -1) return { page: null, pageLabel: null, snippet: snippet(f.extractedText, i) };
  }
  return null;
}
