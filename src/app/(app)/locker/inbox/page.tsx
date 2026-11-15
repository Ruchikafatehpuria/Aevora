import Link from "next/link";
import { after } from "next/server";
import { Inbox, Sparkles } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { folderPaths } from "@/lib/locker/organize";
import { runPendingJobs } from "@/lib/locker/jobs";
import { aiEnabled } from "@/lib/locker/ai";
import { PROVIDER_LABEL } from "@/lib/ai/providers";
import type { StoredSuggestion } from "@/lib/locker/organize";
import { acceptAllSuggestions } from "@/lib/locker/actions";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { FileList } from "@/components/locker/file-list";
import { SuggestionCard } from "@/components/locker/suggestion-card";
import { DuplicateCard } from "@/components/locker/duplicate-card";
import { toRow } from "@/components/locker/to-row";
import { cn } from "@/lib/utils";

export const metadata = { title: "Smart Inbox" };

const SECTIONS = [
  { key: "unorganized", label: "Unorganized" },
  { key: "suggestions", label: "Suggestions" },
  { key: "all", label: "All imports" },
  { key: "recent", label: "Recently added" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "manual", label: "Manual uploads" },
  { key: "email", label: "Email attachments" },
  { key: "drive", label: "Cloud drives" },
  { key: "camera", label: "Camera scans" },
  { key: "processing", label: "Processing" },
  { key: "duplicates", label: "Duplicates" },
  { key: "failed", label: "Failed" },
  { key: "processed", label: "Processed" },
  { key: "starred", label: "Starred" },
  { key: "archived", label: "Archived" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

function whereFor(section: Section, userId: string): Prisma.StoredFileWhereInput {
  const base = { userId, status: { not: "DUPLICATE_PENDING" as const }, deletedAt: null, archivedAt: null };
  switch (section) {
    case "unorganized": return { ...base, organization: "INBOX" };
    case "suggestions": return { ...base, organization: "SUGGESTED", status: "READY" };
    case "recent": return { ...base, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } };
    case "whatsapp": return { ...base, source: "WHATSAPP" };
    case "manual": return { ...base, source: { in: ["MANUAL_UPLOAD", "SHARE_SHEET"] } };
    case "email": return { ...base, source: "EMAIL" };
    case "drive": return { ...base, source: { in: ["GOOGLE_DRIVE", "ONEDRIVE", "DROPBOX"] } };
    case "camera": return { ...base, source: "CAMERA_SCAN" };
    case "processing": return { ...base, status: "PROCESSING" };
    case "failed": return { ...base, failureReason: { not: null } };
    case "starred": return { ...base, starred: true, archivedAt: undefined };
    case "processed": return { ...base, status: "READY", organization: "ORGANIZED" };
    case "archived": return { ...base, archivedAt: { not: null } };
    default: return base;
  }
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ section?: string; shared?: string; failed?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const section = (SECTIONS.find((s) => s.key === sp.section)?.key ?? "unorganized") as Section;
  after(() => runPendingJobs(20).catch(console.error)); // resumes work interrupted by a restart

  const [counts, folders] = await Promise.all([
    Promise.all(SECTIONS.map(async (s) => [s.key, s.key === "duplicates" ? await db.storedFile.count({ where: { userId: user.id, status: "DUPLICATE_PENDING", deletedAt: null } }) : await db.storedFile.count({ where: whereFor(s.key, user.id) })] as const)),
    folderPaths(user.id),
  ]);
  const count = Object.fromEntries(counts) as Record<Section, number>;
  const failedUploads = await db.importBatch.aggregate({ where: { userId: user.id }, _sum: { failedCount: true } });
  count.failed += failedUploads._sum.failedCount ?? 0;

  let body: React.ReactNode;
  if (section === "duplicates") {
    const dups = await db.storedFile.findMany({ where: { userId: user.id, status: "DUPLICATE_PENDING", deletedAt: null }, orderBy: { createdAt: "desc" } });
    const originals = await db.storedFile.findMany({
      where: { id: { in: dups.map((d) => d.duplicateOfId!).filter(Boolean) }, userId: user.id },
      include: { folder: true },
    });
    const byId = new Map(originals.map((o) => [o.id, o]));
    const side = (f: (typeof originals)[number] | (typeof dups)[number], location: string) => ({
      id: f.id, name: f.displayName, extension: f.extension, size: Number(f.sizeBytes), createdAt: f.createdAt.toISOString(), location, source: f.source,
    });
    body = dups.length ? (
      <div className="space-y-3">
        {dups.map((d) => {
          const o = d.duplicateOfId ? byId.get(d.duplicateOfId) : undefined;
          return <DuplicateCard key={d.id} incoming={side(d, "Not saved yet")} existing={o ? side(o, o.folder?.name ?? "Inbox") : null} />;
        })}
      </div>
    ) : (
      <Card><EmptyState icon={Inbox} title="No duplicates" description="When you upload a file you already have, it waits here so you can decide what to do." /></Card>
    );
  } else if (section === "suggestions") {
    const files = await db.storedFile.findMany({ where: whereFor("suggestions", user.id), orderBy: { createdAt: "desc" }, take: 100 });
    body = files.length ? (
      <div className="space-y-3">
        <div className="flex justify-end">
          <form action={acceptAllSuggestions}><Button size="sm" variant="secondary"><Sparkles className="h-3.5 w-3.5" /> Accept all {files.length}</Button></form>
        </div>
        {files.map((f) => {
          const s = f.suggestion as StoredSuggestion;
          return (
            <SuggestionCard
              key={f.id}
              s={{ fileId: f.id, fileName: f.displayName, extension: f.extension, folderPath: s.folderPath, category: s.category, tags: s.tags, confidence: s.confidence, reason: s.reason, sensitive: s.sensitive, provider: s.provider ? PROVIDER_LABEL[s.provider] : null }}
            />
          );
        })}
      </div>
    ) : (
      <Card><EmptyState icon={Sparkles} title="No suggestions waiting" description={aiEnabled() ? "AI suggestions for new imports appear here for your approval." : "AI organization is off because no AI provider (Gemini, Groq or Cloudflare) is configured. Organize files manually or with rules."} /></Card>
    );
  } else {
    const files = await db.storedFile.findMany({ where: whereFor(section, user.id), orderBy: { createdAt: "desc" }, take: 300, include: { folder: { select: { name: true } } } });
    const batchFailures = section === "failed"
      ? await db.importBatch.findMany({ where: { userId: user.id, failedCount: { gt: 0 } }, orderBy: { createdAt: "desc" }, take: 20 })
      : [];
    body = (
      <div className="space-y-4">
        {batchFailures.length > 0 && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">Uploads that couldn&apos;t be saved</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {batchFailures.flatMap((b) =>
                ((b.failures as { name: string; reason: string }[] | null) ?? []).map((f, i) => (
                  <li key={`${b.id}-${i}`} className="flex flex-wrap gap-x-2">
                    <span className="font-medium text-ink">{f.name}</span>
                    <span className="text-danger">{f.reason}</span>
                    <span className="text-ink-3">· {b.label ?? "upload"}</span>
                  </li>
                )),
              )}
            </ul>
            <p className="mt-3 text-xs text-ink-3">Fix the issue and upload these files again from the <Link className="text-primary hover:underline" href="/locker/upload">Upload Centre</Link>.</p>
          </Card>
        )}
        {files.length ? (
          <Card><FileList files={files.map(toRow)} folders={folders} /></Card>
        ) : batchFailures.length ? null : (
          <Card>
            <EmptyState
              icon={Inbox}
              title={section === "unorganized" ? "Inbox zero" : "Nothing here"}
              description={section === "email" || section === "drive" ? "Email and cloud drive imports are coming in a later update." : section === "camera" ? "Scan notes, certificates and receipts with your camera from the Scan tab." : "Files will appear here as you import them."}
              action={<Link href="/locker/upload" className="text-sm font-medium text-primary hover:underline">Go to Upload Centre</Link>}
            />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Inbox sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex gap-1 lg:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <Link
                href={`/locker/inbox?section=${s.key}`}
                aria-current={section === s.key ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                  section === s.key ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {s.label}
                {count[s.key] > 0 && <span className={cn("text-xs", s.key === "duplicates" || s.key === "failed" ? "text-warning" : "text-ink-3")}>{count[s.key]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        {sp.shared && (
          <Alert tone={Number(sp.failed) ? "error" : "success"}>
            Saved {sp.shared} shared file{sp.shared === "1" ? "" : "s"}.{Number(sp.failed) > 0 && ` ${sp.failed} couldn't be saved; see Failed.`}
          </Alert>
        )}
        {body}
      </div>
    </div>
  );
}
