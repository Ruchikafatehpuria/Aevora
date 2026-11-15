import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/providers";
import type { Source } from "@/lib/assistant/answer";
import { Chat } from "@/components/assistant/chat";
import { proposalKey } from "@/lib/assistant/proposals";

export const metadata = { title: "AI Assistant" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const convo = await db.conversation.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!convo) notFound();
  const tasks = await db.task.findMany({ where: { userId: user.id, createdAt: { gte: convo.createdAt } }, select: { title: true, dueDate: true }, take: 500 });
  const [settings, file] = await Promise.all([
    db.lockerSettings.findUnique({ where: { userId: user.id } }),
    convo.fileId ? db.storedFile.findFirst({ where: { id: convo.fileId, userId: user.id }, select: { id: true, displayName: true } }) : null,
  ]);
  return (
    <Chat
      key={convo.id}
      existingTasks={tasks.map((t) => proposalKey({ title: t.title, dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null }))}
      conversationId={convo.id}
      initial={convo.messages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        sources: (m.sources as Source[] | null) ?? [],
        provider: m.provider,
        failed: m.failed,
      }))}
      file={file ? { id: file.id, name: file.displayName } : null}
      usesFiles={!!settings?.assistantUsesFiles}
      aiReady={aiConfigured()}
    />
  );
}
