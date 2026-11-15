import { Suspense } from "react";
import { FolderSearch, Sparkles } from "lucide-react";
import type { FileSource } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiEnabled, interpretSearch, type SearchFilters } from "@/lib/locker/ai";
import type { FileKind } from "@/lib/locker/config";
import { folderPaths, userCategories } from "@/lib/locker/organize";
import { searchFiles, type FileQuery } from "@/lib/locker/search";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { FileList } from "@/components/locker/file-list";
import { EmptyTrashButton } from "@/components/locker/empty-trash";
import { purgeExpiredTrash, TRASH_DAYS } from "@/lib/locker/trash";
import { FolderTree } from "@/components/locker/folder-tree";
import { SearchBar } from "@/components/locker/search-bar";
import { toRow } from "@/components/locker/to-row";

export const metadata = { title: "Files" };

const SOURCES = ["MANUAL_UPLOAD", "WHATSAPP", "SHARE_SHEET", "EMAIL", "GOOGLE_DRIVE", "ONEDRIVE", "DROPBOX", "CAMERA_SCAN"];
const KINDS = ["pdf", "document", "presentation", "spreadsheet", "image", "video", "audio", "text", "archive"];

type SP = { folder?: string; q?: string; kind?: string; source?: string; sort?: string; smart?: string; tag?: string; category?: string };

export default async function FilesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const trash = sp.folder === "trash";
  const starred = sp.folder === "starred";
  if (trash) await purgeExpiredTrash(user.id);
  const [folders, paths] = await Promise.all([
    db.folder.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, include: { _count: { select: { files: { where: { deletedAt: null } } } } } }),
    folderPaths(user.id),
  ]);
  const folder = sp.folder && !["inbox", "trash", "starred"].includes(sp.folder) ? folders.find((f) => f.id === sp.folder) : undefined;

  const query: FileQuery = {
    q: sp.q?.trim() || undefined,
    folderId: sp.folder === "inbox" ? null : folder ? folder.id : undefined,
    source: SOURCES.includes(sp.source ?? "") ? (sp.source as FileSource) : undefined,
    kinds: KINDS.includes(sp.kind ?? "") ? [sp.kind as FileKind] : undefined,
    sort: (["newest", "oldest", "name", "largest"] as const).find((s) => s === sp.sort),
    tag: sp.tag,
    category: sp.category,
    trash,
    starred,
  };

  // Smart search: let Claude turn a natural-language request into filters, then search.
  let interpreted: SearchFilters | null = null;
  let aiError = false;
  if (sp.smart === "1" && query.q && aiEnabled()) {
    try {
      interpreted = await interpretSearch(query.q, new Date(), await userCategories(user.id));
    } catch (e) {
      console.error("Smart search failed", e);
      aiError = true;
    }
    if (interpreted) {
      query.q = interpreted.keywords || undefined;
      query.source ??= interpreted.source ?? undefined;
      if (interpreted.kinds.length) query.kinds ??= interpreted.kinds;
      query.category ??= interpreted.category ?? undefined;
      if (interpreted.uploadedAfter && !Number.isNaN(Date.parse(interpreted.uploadedAfter))) query.after = new Date(interpreted.uploadedAfter);
      if (interpreted.uploadedBefore && !Number.isNaN(Date.parse(interpreted.uploadedBefore))) query.before = new Date(interpreted.uploadedBefore);
    }
  }

  const files = await searchFiles(user.id, query);
  const [inboxCount, totalCount] = await Promise.all([
    db.storedFile.count({ where: { userId: user.id, folderId: null, status: { not: "DUPLICATE_PENDING" }, deletedAt: null } }),
    db.storedFile.count({ where: { userId: user.id, status: { not: "DUPLICATE_PENDING" }, deletedAt: null } }),
  ]);
  const [starredCount, trashCount] = await Promise.all([
    db.storedFile.count({ where: { userId: user.id, starred: true, deletedAt: null } }),
    db.storedFile.count({ where: { userId: user.id, deletedAt: { not: null } } }),
  ]);
  const heading = folder ? (paths.find((p) => p.id === folder.id)?.path ?? folder.name) : sp.folder === "inbox" ? "Inbox (unfiled)" : trash ? "Trash" : starred ? "Starred" : "All files";

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside>
        <FolderTree
          nodes={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, count: f._count.files }))}
          current={folder?.id ?? null}
          view={folder ? "folder" : sp.folder === "inbox" ? "inbox" : trash ? "trash" : starred ? "starred" : "all"}
          inboxCount={inboxCount}
          totalCount={totalCount}
          starredCount={starredCount}
          trashCount={trashCount}
        />
      </aside>
      <div className="min-w-0 space-y-4">
        <Suspense>
          <SearchBar aiAvailable={aiEnabled()} />
        </Suspense>
        {interpreted && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Interpreted as:
            {interpreted.keywords && <span className="rounded bg-surface-2 px-1.5 py-0.5">“{interpreted.keywords}”</span>}
            {interpreted.source && <span className="rounded bg-surface-2 px-1.5 py-0.5">source: {interpreted.source}</span>}
            {interpreted.kinds.map((k) => <span key={k} className="rounded bg-surface-2 px-1.5 py-0.5">type: {k}</span>)}
            {interpreted.category && <span className="rounded bg-surface-2 px-1.5 py-0.5">category: {interpreted.category}</span>}
            {interpreted.uploadedAfter && <span className="rounded bg-surface-2 px-1.5 py-0.5">after {interpreted.uploadedAfter}</span>}
            {interpreted.uploadedBefore && <span className="rounded bg-surface-2 px-1.5 py-0.5">before {interpreted.uploadedBefore}</span>}
          </p>
        )}
        {aiError && <Alert tone="error">Smart search is unavailable right now, so these results use your search words only.</Alert>}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-display text-[15px] font-semibold text-ink">{heading}</h2>
            {trash && files.length > 0 && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-ink-3">Files are deleted permanently {TRASH_DAYS} days after being moved here.</p>
                <EmptyTrashButton />
              </div>
            )}
          </div>
          {files.length ? (
            <FileList files={files.map(toRow)} folders={paths} showFolder={!folder} mode={trash ? "trash" : "normal"} />
          ) : (
            <EmptyState
              icon={FolderSearch}
              title={sp.q ? "No matching files" : trash ? "Trash is empty" : starred ? "No starred files" : "No files here yet"}
              description={sp.q ? "Try different words, fewer filters, or turn on Smart search." : trash ? "Files you delete stay here for 30 days." : starred ? "Star files to find them quickly here." : "Upload files or move some here from your Inbox."}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
