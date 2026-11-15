import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, Download, Lock, MessageCircle, ShieldAlert, Sparkles } from "lucide-react";
import { requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/crypto";
import { db } from "@/lib/db";
import { formatBytes, kindOf } from "@/lib/locker/config";
import { signedFileUrl } from "@/lib/locker/signing";
import { csvRows, docxHtml, zipListing } from "@/lib/locker/preview";
import { folderPaths, userCategories, type StoredSuggestion } from "@/lib/locker/organize";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { FileIcon } from "@/components/locker/file-icon";
import { SuggestionCard } from "@/components/locker/suggestion-card";
import { CopyFileForm, DetailsForm, RenameTitle, RetryButton, SensitiveToggle, StarArchiveButtons, TrashFileButton, TrashedBanner, UnlockForm } from "@/components/locker/file-actions";
import { TRASH_DAYS } from "@/lib/locker/trash";
import { PROVIDER_LABEL } from "@/lib/ai/providers";
import { SOURCE_LABEL } from "@/components/locker/labels";
import { FileTaskFinder } from "@/components/tasks/file-task-finder";

export const metadata = { title: "File" };

async function Preview({ file, url }: { file: { storageKey: string; extension: string; mimeType: string; sizeBytes: bigint; pageTexts: unknown }; url: string }) {
  const kind = kindOf(file.extension);
  const frame = "h-[70vh] w-full rounded-lg border border-border bg-white";
  try {
    if (file.extension === "pdf") return <iframe src={url} title="PDF preview" className={frame} />;
    if (kind === "image" && file.extension !== "heic") {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt="" className="mx-auto max-h-[70vh] rounded-lg border border-border object-contain" />;
    }
    if (kind === "video" && file.extension !== "3gp") return <video src={url} controls className="max-h-[70vh] w-full rounded-lg bg-black" />;
    if (kind === "audio") return <audio src={url} controls className="w-full" />;
    if (["txt", "md", "json", "vcf"].includes(file.extension)) return <iframe src={url} title="Text preview" sandbox="" className={frame} />;
    if (file.extension === "csv") {
      const rows = await csvRows(file.storageKey);
      return (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i === 0 ? "bg-surface-2 font-semibold" : "border-t border-border"}>
                  {r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 text-ink">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-ink-3">Showing up to the first 100 rows.</p>
        </div>
      );
    }
    if (file.extension === "docx") {
      const html = await docxHtml(file.storageKey);
      const doc = `<!doctype html><meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 24px;color:#0f2742}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:4px 8px}</style>${html}`;
      return <iframe srcDoc={doc} sandbox="" title="Document preview" className={frame} />;
    }
    if (file.extension === "pptx" && Array.isArray(file.pageTexts)) {
      return (
        <ol className="max-h-[70vh] space-y-3 overflow-y-auto">
          {(file.pageTexts as string[]).map((t, i) => (
            <li key={i} className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold text-ink-3">Slide {i + 1}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{t || "(no text)"}</p>
            </li>
          ))}
        </ol>
      );
    }
    if (file.extension === "zip") {
      const entries = await zipListing(file.storageKey);
      return (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <ul className="divide-y divide-border text-sm">
            {entries.map((e) => (
              <li key={e.path} className="flex justify-between gap-4 px-4 py-2">
                <span className="truncate text-ink">{e.path}</span>
                <span className="shrink-0 text-ink-3">{formatBytes(e.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  } catch (e) {
    console.error("Preview failed", e);
    return <Alert tone="error">This file couldn&apos;t be previewed. You can still download it.</Alert>;
  }
  return <p className="py-10 text-center text-sm text-ink-3">Preview isn&apos;t available for .{file.extension} files yet. Download the file to open it.</p>;
}

export default async function FileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const file = await db.storedFile.findFirst({
    where: { id, userId: user.id },
    include: { folder: true, chatAttachments: { take: 1, include: { archive: { select: { id: true, chatName: true } }, message: { select: { seq: true, sender: true } } } } },
  });
  if (!file) notFound();
  const session = await db.session.findUnique({ where: { tokenHash: hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? "") } });
  const elevated = !!session?.elevatedUntil && session.elevatedUntil > new Date();
  const locked = (file.sensitive && !elevated) || !!file.deletedAt;
  const [paths, categories] = await Promise.all([folderPaths(user.id), userCategories(user.id)]);
  const folderPath = file.folderId ? (paths.find((p) => p.id === file.folderId)?.path ?? file.folder?.name) : "Inbox (unfiled)";
  const s = file.suggestion as StoredSuggestion | null;
  const chatRef = file.chatAttachments[0];

  const meta: [string, React.ReactNode][] = [
    ["Original name", file.originalName],
    ["Type", `.${file.extension} · ${file.mimeType}`],
    ["Size", formatBytes(file.sizeBytes)],
    ["Uploaded", file.createdAt.toLocaleString()],
    ["Source", <>{SOURCE_LABEL[file.source]}{file.sourceDetail && <span className="text-ink-3"> · {file.sourceDetail}</span>}</>],
    ["Original path", file.originalPath ?? "—"],
    ["Folder", folderPath],
    ["Document date", file.documentDate ? file.documentDate.toISOString().slice(0, 10) : "—"],
    ["SHA-256", <span key="h" className="break-all font-mono text-xs">{file.sha256}</span>],
    ["Processing", file.status === "PROCESSING" ? "In progress" : file.status === "DUPLICATE_PENDING" ? "Waiting for duplicate decision" : "Complete"],
    ["Virus scan", file.scanStatus === "not_scanned" ? "Not scanned (no scanner configured)" : file.scanStatus],
  ];

  return (
    <div className="space-y-6">
      <Link href={file.folderId ? `/locker/files?folder=${file.folderId}` : "/locker/files"} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to files
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <FileIcon extension={file.extension} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <RenameTitle id={file.id} name={file.displayName} />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {file.category && <Badge tone="primary">{file.category}</Badge>}
            {file.tags.map((t) => <Link key={t} href={`/locker/files?tag=${encodeURIComponent(t)}`}><Badge>#{t}</Badge></Link>)}
            {file.sensitive && <Badge tone="warning"><Lock className="mr-1 h-3 w-3" /> Sensitive</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {!file.deletedAt && !file.sensitive && file.extractedText && (
            <Link href={`/assistant?file=${file.id}`} className={buttonClass("secondary", "sm")}>
              <Sparkles className="h-4 w-4" /> Ask about this file
            </Link>
          )}
          {!file.deletedAt && !file.sensitive && file.extractedText && <FileTaskFinder fileId={file.id} fileName={file.displayName} />}
          {!file.deletedAt && <StarArchiveButtons id={file.id} starred={file.starred} archived={!!file.archivedAt} />}
          {!locked && (
            <a href={signedFileUrl(file.id, user.id)} className={buttonClass("primary", "sm")}>
              <Download className="h-4 w-4" /> Download
            </a>
          )}
          {!file.deletedAt && <TrashFileButton id={file.id} />}
        </div>
      </div>

      {file.deletedAt && (
        <TrashedBanner id={file.id} daysLeft={Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - file.deletedAt.getTime()) / 86400_000))} />
      )}
      {file.status === "DUPLICATE_PENDING" && (
        <Alert tone="info">This upload is identical to a file you already have. <Link href="/locker/inbox?section=duplicates" className="font-medium underline">Decide what to do</Link>.</Alert>
      )}
      {file.failureReason && (
        <div className="flex flex-wrap items-center gap-3">
          <Alert tone="error" className="flex-1">{file.failureReason}</Alert>
          <RetryButton id={file.id} />
        </div>
      )}
      {file.organization === "SUGGESTED" && s && (
        <SuggestionCard s={{ fileId: file.id, fileName: file.displayName, extension: file.extension, folderPath: s.folderPath, category: s.category, tags: s.tags, confidence: s.confidence, reason: s.reason, sensitive: s.sensitive, provider: s.provider ? PROVIDER_LABEL[s.provider] : null }} />
      )}
      {s?.appliedAutomatically && file.organization === "ORGANIZED" && (
        <p className="text-xs text-ink-3">Organized automatically by {s.provider ? PROVIDER_LABEL[s.provider] : "AI"} ({Math.round(s.confidence * 100)}% confidence): {s.reason}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="p-4">
          {file.deletedAt ? (
            <p className="py-12 text-center text-sm text-ink-3">Restore this file to preview or download it.</p>
          ) : locked ? (
            <div className="py-12 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
              <p className="mt-3 font-display font-semibold text-ink">This file is marked sensitive</p>
              <p className="mt-1 text-sm text-ink-2">Confirm your password to view or download it.</p>
              <UnlockForm />
            </div>
          ) : (
            <Preview file={file} url={signedFileUrl(file.id, user.id, { inline: true, ttlSeconds: 3600 })} />
          )}
        </Card>
        <div className="space-y-6">
          {chatRef && (
            <Card className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MessageCircle className="h-4 w-4 text-primary" /> From a WhatsApp chat</p>
              <p className="mt-1 text-sm text-ink-2">
                {chatRef.message?.sender ? `Sent by ${chatRef.message.sender} in ` : "In "}
                <Link href={`/locker/chats/${chatRef.archive.id}${chatRef.message ? `#m${chatRef.message.seq}` : ""}`} className="font-medium text-primary hover:underline">
                  {chatRef.archive.chatName}
                </Link>
              </p>
            </Card>
          )}
          <Card>
            <CardHeader title="File information" />
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 p-4 text-sm">
              {meta.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="min-w-0 break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-border p-4">
              <SensitiveToggle id={file.id} sensitive={file.sensitive} elevated={elevated} />
              <p className="mt-2 text-xs text-ink-3">Sensitive files need your password before they can be viewed or downloaded.</p>
            </div>
            {!file.deletedAt && file.status !== "DUPLICATE_PENDING" && (
              <div className="border-t border-border p-4">
                <CopyFileForm id={file.id} folders={paths} />
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Details" description="Used for search and organization." />
        <div className="p-5">
          <DetailsForm
            id={file.id}
            categories={categories}
            details={{
              category: file.category ?? "",
              tags: file.tags.join(", "),
              subject: file.subject ?? "",
              project: file.project ?? "",
              importance: file.importance ?? "",
              documentDate: file.documentDate ? file.documentDate.toISOString().slice(0, 10) : "",
              description: file.description ?? "",
            }}
          />
        </div>
      </Card>

      {!locked && file.extractedText && (
        <Card>
          <CardHeader title="Extracted text" description="Makes this file searchable." />
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-5 font-sans text-sm text-ink-2">{file.extractedText.slice(0, 20000)}{file.extractedText.length > 20000 && "\n…"}</pre>
        </Card>
      )}
    </div>
  );
}
