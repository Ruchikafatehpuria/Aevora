import Link from "next/link";
import { Copy, HardDrive, MessageCircle, Sparkles, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EXTENSIONS, formatBytes, limits, type FileKind } from "@/lib/locker/config";
import { folderPaths } from "@/lib/locker/organize";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { FileIcon } from "@/components/locker/file-icon";
import { dateFmt } from "@/components/locker/labels";

export const metadata = { title: "My Files" };

const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDFs", document: "Documents", presentation: "Presentations", spreadsheet: "Spreadsheets", text: "Text",
  image: "Images", video: "Videos", audio: "Audio", archive: "Archives",
};

/** Ranked single-series bars: one hue, values printed as text, native tooltip on hover. */
function Bars({ rows }: { rows: { label: string; bytes: number; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  if (!rows.length) return <p className="text-sm text-ink-3">No data yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${formatBytes(r.bytes)} across ${r.count} file${r.count === 1 ? "" : "s"}`}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate text-ink">{r.label}</span>
            <span className="shrink-0 tabular-nums text-ink-2">{formatBytes(r.bytes)} · {r.count}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.bytes / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function LockerDashboard() {
  const user = await requireUser();
  // Storage totals include pending duplicates (they occupy space); counts and lists don't.
  const where = { userId: user.id, status: { not: "FAILED" as const }, deletedAt: null };
  const visible = { ...where, status: { notIn: ["FAILED" as const, "DUPLICATE_PENDING" as const] } };
  const [byExt, bySource, byCategory, byFolder, recent, largest, dupCount, failedCount, chats, paths] = await Promise.all([
    db.storedFile.groupBy({ by: ["extension"], where, _sum: { sizeBytes: true }, _count: true }),
    db.storedFile.groupBy({ by: ["source"], where: visible, _count: true }),
    db.storedFile.groupBy({ by: ["category"], where, _sum: { sizeBytes: true }, _count: true }),
    db.storedFile.groupBy({ by: ["folderId"], where, _sum: { sizeBytes: true }, _count: true }),
    db.storedFile.findMany({ where: visible, orderBy: { createdAt: "desc" }, take: 6 }),
    db.storedFile.findMany({ where: visible, orderBy: { sizeBytes: "desc" }, take: 6 }),
    db.storedFile.count({ where: { userId: user.id, status: "DUPLICATE_PENDING", deletedAt: null } }),
    db.storedFile.count({ where: { userId: user.id, failureReason: { not: null }, deletedAt: null } }),
    db.whatsappChatArchive.count({ where: { userId: user.id } }),
    folderPaths(user.id),
  ]);
  const trash = await db.storedFile.aggregate({ where: { userId: user.id, deletedAt: { not: null } }, _sum: { sizeBytes: true }, _count: true });
  const trashBytes = Number(trash._sum.sizeBytes ?? 0);

  const used = byExt.reduce((n, r) => n + Number(r._sum.sizeBytes ?? 0), 0) + trashBytes;
  const total = bySource.reduce((n, r) => n + r._count, 0) + dupCount;
  if (total === 0) {
    return (
      <Card>
        <EmptyState
          icon={HardDrive}
          title="Your locker is empty"
          description="Upload files, drop in a folder, or import a WhatsApp chat export. Syncly will keep everything organized and searchable."
          action={<Link href="/locker/upload" className={buttonClass()}><Upload className="h-4 w-4" /> Upload files</Link>}
        />
      </Card>
    );
  }

  const kinds = new Map<FileKind, { bytes: number; count: number }>();
  for (const r of byExt) {
    const k = EXTENSIONS[r.extension]?.kind ?? "text";
    const cur = kinds.get(k) ?? { bytes: 0, count: 0 };
    kinds.set(k, { bytes: cur.bytes + Number(r._sum.sizeBytes ?? 0), count: cur.count + r._count });
  }
  const sourceCount = (s: string) => bySource.find((r) => r.source === s)?._count ?? 0;
  const pct = Math.min(100, (used / limits.quotaBytes) * 100);
  // Folder totals roll up to their top-level folder.
  const topOf = new Map(paths.map((p) => [p.id, p.path.split(" / ")[0]!]));
  const folderTotals = new Map<string, { bytes: number; count: number }>();
  for (const r of byFolder) {
    const label = r.folderId ? (topOf.get(r.folderId) ?? "Other") : "Inbox (unfiled)";
    const cur = folderTotals.get(label) ?? { bytes: 0, count: 0 };
    folderTotals.set(label, { bytes: cur.bytes + Number(r._sum.sizeBytes ?? 0), count: cur.count + r._count });
  }
  const sorted = (m: Map<string, { bytes: number; count: number }>) => [...m].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.bytes - a.bytes).slice(0, 8);

  const tiles = [
    { label: "Files", value: (total - dupCount).toLocaleString(), href: "/locker/files" },
    { label: "From WhatsApp", value: sourceCount("WHATSAPP").toLocaleString(), href: "/locker/inbox?section=whatsapp" },
    { label: "Manual uploads", value: (sourceCount("MANUAL_UPLOAD") + sourceCount("SHARE_SHEET")).toLocaleString(), href: "/locker/inbox?section=manual" },
    { label: "Chat archives", value: chats.toLocaleString(), href: "/locker/chats" },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-ink-2">Storage used</p>
            <p className="font-display text-3xl font-bold tracking-tight text-ink">
              {formatBytes(used)} <span className="text-base font-medium text-ink-3">of {formatBytes(limits.quotaBytes)}</span>
            </p>
          </div>
          <p className="text-sm text-ink-2">
            {formatBytes(Math.max(0, limits.quotaBytes - used))} available
            {trash._count > 0 && (
              <>
                {" · "}
                <Link href="/locker/files?folder=trash" className="text-primary hover:underline">{formatBytes(trashBytes)} in Trash</Link>
              </>
            )}
          </p>
        </div>
        <div className="mt-4 h-2.5 rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
          <div className={pct > 90 ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-primary"} style={{ width: `${Math.max(pct, 0.5)}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
            <p className="text-sm text-ink-2">{t.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{t.value}</p>
          </Link>
        ))}
      </div>

      {(dupCount > 0 || failedCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {dupCount > 0 && <Link href="/locker/inbox?section=duplicates" className="inline-flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning"><Copy className="h-4 w-4" /> {dupCount} duplicate{dupCount > 1 ? "s" : ""} to review</Link>}
          {failedCount > 0 && <Link href="/locker/inbox?section=failed" className="inline-flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{failedCount} file{failedCount > 1 ? "s" : ""} had processing problems</Link>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="By file type" /><div className="p-5"><Bars rows={[...kinds].map(([k, v]) => ({ label: KIND_LABEL[k], ...v })).sort((a, b) => b.bytes - a.bytes)} /></div></Card>
        <Card><CardHeader title="By folder" /><div className="p-5"><Bars rows={sorted(folderTotals)} /></div></Card>
        <Card><CardHeader title="By category" /><div className="p-5"><Bars rows={byCategory.map((r) => ({ label: r.category ?? "Uncategorized", bytes: Number(r._sum.sizeBytes ?? 0), count: r._count })).sort((a, b) => b.bytes - a.bytes).slice(0, 8)} /></div></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[{ title: "Recent uploads", files: recent, right: (f: (typeof recent)[number]) => dateFmt(f.createdAt) }, { title: "Largest files", files: largest, right: (f: (typeof recent)[number]) => formatBytes(f.sizeBytes) }].map((block) => (
          <Card key={block.title}>
            <CardHeader title={block.title} />
            <ul className="divide-y divide-border">
              {block.files.map((f) => (
                <li key={f.id}>
                  <Link href={`/locker/files/${f.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60">
                    <FileIcon extension={f.extension} className="h-8 w-8" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.displayName}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-3">{block.right(f)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/locker/upload" className={buttonClass("primary", "sm")}><Upload className="h-4 w-4" /> Upload</Link>
        <Link href="/locker/inbox?section=suggestions" className={buttonClass("secondary", "sm")}><Sparkles className="h-4 w-4" /> Review suggestions</Link>
        <Link href="/locker/chats" className={buttonClass("secondary", "sm")}><MessageCircle className="h-4 w-4" /> Chat archives</Link>
      </div>
    </div>
  );
}
