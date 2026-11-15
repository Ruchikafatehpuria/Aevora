import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ConversationList } from "@/components/assistant/conversation-list";

export default async function AssistantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const conversations = await db.conversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, fileId: true } });
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <aside className="hidden lg:block">
        <ConversationList items={conversations.map((c) => ({ id: c.id, title: c.title, hasFile: !!c.fileId }))} />
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
