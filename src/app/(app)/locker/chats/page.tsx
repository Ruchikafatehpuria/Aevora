import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Chat archives" };

const fmt = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function ChatsPage() {
  const user = await requireUser();
  const chats = await db.whatsappChatArchive.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { attachments: true } }, attachments: { where: { missing: true }, select: { id: true } } },
  });
  if (!chats.length)
    return (
      <Card>
        <EmptyState
          icon={MessageCircle}
          title="No chat archives yet"
          description="Export a chat from WhatsApp and upload the ZIP or TXT file. Syncly turns it into a searchable archive with its attachments."
          action={<Link href="/locker/upload" className={buttonClass()}>Import a chat export</Link>}
        />
      </Card>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {chats.map((c) => (
        <Link key={c.id} href={`/locker/chats/${c.id}`} className="rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft"><MessageCircle className="h-5 w-5 text-primary" /></span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{c.chatName}</p>
              <p className="text-xs text-ink-3">{fmt(c.firstMessageAt)} – {fmt(c.lastMessageAt)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            {c.messageCount.toLocaleString()} messages · {c._count.attachments - c.attachments.length} attachments
            {c.attachments.length > 0 && <span className="text-warning"> · {c.attachments.length} not in export</span>}
          </p>
        </Link>
      ))}
    </div>
  );
}
