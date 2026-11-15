import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/providers";
import { Chat } from "@/components/assistant/chat";

export const metadata = { title: "AI Assistant" };

export default async function NewChatPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const user = await requireUser();
  const { file: fileId } = await searchParams;
  const [settings, file] = await Promise.all([
    db.lockerSettings.findUnique({ where: { userId: user.id } }),
    fileId ? db.storedFile.findFirst({ where: { id: fileId, userId: user.id, deletedAt: null, sensitive: false }, select: { id: true, displayName: true } }) : null,
  ]);
  return (
    <Chat
      key={file?.id ?? "new"}
      conversationId={null}
      initial={[]}
      file={file ? { id: file.id, name: file.displayName } : null}
      usesFiles={!!settings?.assistantUsesFiles}
      aiReady={aiConfigured()}
    />
  );
}
