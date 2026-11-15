import type { StoredFile } from "@prisma/client";
import type { FileRow } from "./file-list";

export function toRow(f: StoredFile & { folder?: { name: string } | null; match?: FileRow["match"] }): FileRow {
  return {
    id: f.id,
    displayName: f.displayName,
    extension: f.extension,
    sizeBytes: Number(f.sizeBytes),
    source: f.source,
    createdAt: f.createdAt.toISOString(),
    status: f.status,
    organization: f.organization,
    sensitive: f.sensitive,
    starred: f.starred,
    archived: !!f.archivedAt,
    trashed: !!f.deletedAt,
    category: f.category,
    folderName: f.folder?.name ?? null,
    failureReason: f.failureReason,
    match: f.sensitive ? null : (f.match ?? null), // never leak sensitive content in snippets
  };
}
