import Link from "next/link";
import { History, Monitor, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { limits } from "@/lib/locker/config";
import { storageUsed } from "@/lib/locker/ingest";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { UploadCentre } from "@/components/locker/upload-centre";
import { SOURCE_LABEL } from "@/components/locker/labels";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Upload Centre" };

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="mt-2 space-y-1.5 text-sm text-ink-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ share?: string }> }) {
  const user = await requireUser();
  const { share } = await searchParams;
  const used = await storageUsed(user.id);
  const batches = await db.importBatch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { chatArchive: { select: { id: true } } },
  });

  return (
    <div className="space-y-8">
      {share === "empty" && <Alert tone="error">Nothing was received from the share menu. Try sharing the file again.</Alert>}
      <UploadCentre maxBytes={limits.maxUploadBytes} quotaRemaining={Math.max(0, limits.quotaBytes - used)} />

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Save files from WhatsApp" description="Syncly only sees files you choose to share or upload. It never connects to your WhatsApp account." />
          <div className="space-y-5 p-5">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Smartphone className="h-4 w-4 text-primary" /> Android (Chrome)
              </p>
              <Steps
                steps={[
                  <>Open Syncly in Chrome and choose <b>Install app</b> (or <b>Add to Home screen</b>) from the ⋮ menu. This is needed once.</>,
                  <>In WhatsApp, long-press a document, photo or video and tap <b>Share</b>.</>,
                  <>Pick <b>Syncly</b>. The file lands in your Smart Inbox.</>,
                ]}
              />
              <p className="mt-2 text-xs text-ink-3">The share option appears only after Syncly is installed, and only in Chromium-based browsers that support sharing to web apps.</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Smartphone className="h-4 w-4 text-primary" /> iPhone
              </p>
              <Steps
                steps={[
                  <>In WhatsApp, open the file, tap <b>Share</b> → <b>Save to Files</b>.</>,
                  <>Open Syncly in Safari, tap <b>Choose files</b> above and pick the files from the Files app.</>,
                ]}
              />
              <p className="mt-2 text-xs text-ink-3">iOS doesn&apos;t let web apps appear in the share sheet. A native iOS app would be needed for one-tap sharing; it isn&apos;t available yet.</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Monitor className="h-4 w-4 text-primary" /> Desktop
              </p>
              <Steps
                steps={[
                  <>In WhatsApp Desktop or WhatsApp Web, download the files.</>,
                  <>Drag them, or your whole Downloads folder, onto the drop zone above and choose <b>WhatsApp</b> as the source.</>,
                ]}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Import a WhatsApp chat export" description="Keep a searchable archive of a conversation and its attachments." />
          <div className="space-y-5 p-5">
            <div>
              <p className="text-sm font-semibold text-ink">Android</p>
              <Steps steps={[<>Open the chat → ⋮ → <b>More</b> → <b>Export chat</b>.</>, <>Choose <b>Include media</b> (or <b>Without media</b> for text only).</>, <>Save or share the ZIP file, then upload it above.</>]} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">iPhone</p>
              <Steps steps={[<>Open the chat → tap the contact or group name → <b>Export Chat</b>.</>, <>Choose <b>Attach Media</b>, then <b>Save to Files</b>.</>, <>Upload the ZIP above.</>]} />
            </div>
            <Alert tone="info">
              An export is a read-only archive, not a WhatsApp backup, and can&apos;t be restored into WhatsApp. WhatsApp limits how many messages and media files an export contains, so some
              attachments may be missing. Syncly marks those and you can upload them separately.
            </Alert>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Upload history" description="Your recent imports." />
        {batches.length === 0 ? (
          <EmptyState icon={History} title="No imports yet" description="Files you upload, share or import will be listed here." className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                <span className="font-medium text-ink">{b.label ?? (b.kind === "FILES" ? "File upload" : b.kind)}</span>
                <Badge tone={b.source === "WHATSAPP" ? "primary" : "neutral"}>{SOURCE_LABEL[b.source]}</Badge>
                <span className="text-ink-3">
                  {b.fileCount} file{b.fileCount === 1 ? "" : "s"}
                  {b.failedCount > 0 && <span className="text-danger"> · {b.failedCount} failed</span>}
                </span>
                {b.chatArchive && (
                  <Link href={`/locker/chats/${b.chatArchive.id}`} className="font-medium text-primary hover:underline">
                    View chat
                  </Link>
                )}
                <span className="ml-auto text-xs text-ink-3">{timeAgo(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
