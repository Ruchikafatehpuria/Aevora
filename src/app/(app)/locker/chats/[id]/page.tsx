import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileWarning, Search } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/locker/config";
import { signedFileUrl } from "@/lib/locker/signing";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { FileIcon } from "@/components/locker/file-icon";
import { cn } from "@/lib/utils";

export const metadata = { title: "Chat archive" };

const PAGE = 300;

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-warning-soft px-0.5 text-ink">{p}</mark> : p));
}

export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const archive = await db.whatsappChatArchive.findFirst({ where: { id, userId: user.id } });
  if (!archive) notFound();

  const where = { archiveId: archive.id, ...(q ? { OR: [{ body: { contains: q, mode: "insensitive" as const } }, { sender: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [total, messages, missing] = await Promise.all([
    db.whatsappMessage.count({ where }),
    db.whatsappMessage.findMany({
      where,
      orderBy: { seq: "asc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { attachments: { include: { file: { select: { id: true, displayName: true, extension: true, sizeBytes: true, sensitive: true } } } } },
    }),
    db.whatsappAttachment.count({ where: { archiveId: archive.id, missing: true } }),
  ]);
  const senders = [...new Set(messages.map((m) => m.sender).filter(Boolean))] as string[];
  const me = senders[0];
  const pages = Math.ceil(total / PAGE);

  return (
    <div className="space-y-4">
      <Link href="/locker/chats" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" /> All chat archives</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">{archive.chatName}</h2>
          <p className="text-sm text-ink-2">{archive.messageCount.toLocaleString()} messages · imported {archive.createdAt.toLocaleDateString()}</p>
        </div>
        <form className="relative w-full sm:w-72" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input name="q" defaultValue={q} placeholder="Search messages" className="pl-9" aria-label="Search messages" />
        </form>
      </div>
      <Alert tone="info">
        This is a read-only archive of an exported chat, not a WhatsApp backup. Times are shown exactly as in the export.
        {archive.platformHint?.includes("assumed") && " The export's date format was ambiguous, so dates were read as day/month."}
        {missing > 0 && ` ${missing} attachment${missing > 1 ? "s were" : " was"} referenced but not included in the export; upload them separately if you have them.`}
      </Alert>
      {q && <p className="text-sm text-ink-2">{total} message{total === 1 ? "" : "s"} match “{q}”.</p>}

      <Card className="space-y-2 bg-surface-2/40 p-4 sm:p-6">
        {messages.map((m) =>
          m.isSystem ? (
            <p key={m.id} id={`m${m.seq}`} className="mx-auto max-w-md rounded-lg bg-surface px-3 py-1.5 text-center text-xs text-ink-3">{m.body}</p>
          ) : (
            <div key={m.id} id={`m${m.seq}`} className={cn("flex scroll-mt-24", m.sender === me ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[70%]", m.sender === me ? "rounded-br-sm bg-primary-soft" : "rounded-bl-sm bg-surface")}>
                <p className="text-xs font-semibold text-primary">{m.sender}</p>
                {m.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{highlight(m.body, q)}</p>}
                {m.attachments.map((a) =>
                  a.file ? (
                    <div key={a.id} className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
                      <FileIcon extension={a.file.extension} className="h-8 w-8" />
                      <Link href={`/locker/files/${a.file.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink hover:text-primary">{a.file.displayName}</p>
                        <p className="text-xs text-ink-3">{formatBytes(a.file.sizeBytes)}</p>
                      </Link>
                      {!a.file.sensitive && (
                        <a href={signedFileUrl(a.file.id, user.id, { ttlSeconds: 3600 })} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Download ${a.file.displayName}`}>
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p key={a.id} className="mt-2 flex items-center gap-1.5 text-xs text-warning"><FileWarning className="h-3.5 w-3.5" /> {a.fileName}: not included in the export</p>
                  ),
                )}
                <p className="mt-1 text-right text-[11px] text-ink-3">{m.rawTimestamp}</p>
              </div>
            </div>
          ),
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-ink-3">No messages found.</p>}
      </Card>
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 && <Link href={`?${new URLSearchParams({ ...(q && { q }), page: String(page - 1) })}`} className="text-primary hover:underline">← Earlier</Link>}
          <Badge>Page {page} of {pages}</Badge>
          {page < pages && <Link href={`?${new URLSearchParams({ ...(q && { q }), page: String(page + 1) })}`} className="text-primary hover:underline">Later →</Link>}
        </nav>
      )}
    </div>
  );
}
