"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, MessageSquare, Plus, Trash2 } from "lucide-react";
import { deleteConversation } from "@/lib/assistant/actions";
import { cn } from "@/lib/utils";

export function ConversationList({ items }: { items: { id: string; title: string; hasFile: boolean }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <nav aria-label="Conversations" className="flex h-full flex-col">
      <Link href="/assistant" className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-ink hover:bg-primary-hover">
        <Plus className="h-4 w-4" /> New chat
      </Link>
      {items.length === 0 ? (
        <p className="px-2 text-xs text-ink-3">Your conversations will appear here.</p>
      ) : (
        <ul className="space-y-0.5 overflow-y-auto">
          {items.map((c) => {
            const active = pathname === `/assistant/${c.id}`;
            return (
              <li key={c.id} className={cn("group flex items-center rounded-lg", active ? "bg-primary-soft" : "hover:bg-surface-2")}>
                <Link href={`/assistant/${c.id}`} className={cn("flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm", active ? "font-medium text-primary" : "text-ink-2")}>
                  {c.hasFile ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <MessageSquare className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{c.title}</span>
                </Link>
                <button
                  onClick={() => confirm("Delete this conversation?") && start(async () => {
                    await deleteConversation(c.id);
                    if (active) router.push("/assistant");
                  })}
                  className="mr-1 rounded p-1 text-ink-3 opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Delete conversation ${c.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
