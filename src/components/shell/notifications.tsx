"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn, timeAgo } from "@/lib/utils";
import { useDismiss } from "./use-dismiss";

export type NotificationItem = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-card animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 && (
              <button onClick={() => startTransition(() => markAllNotificationsRead())} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-3">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {items.map((n) => {
                const content = (
                  <div className="flex gap-3 px-4 py-3">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>}
                      <p className="mt-1 text-xs text-ink-3">{timeAgo(new Date(n.createdAt))}</p>
                    </div>
                  </div>
                );
                const onClick = () => {
                  if (!n.readAt) startTransition(() => markNotificationRead(n.id));
                  if (n.href) setOpen(false);
                };
                return (
                  <li key={n.id} className="hover:bg-surface-2">
                    {n.href ? (
                      <Link href={n.href} onClick={onClick} className="block">
                        {content}
                      </Link>
                    ) : (
                      <button onClick={onClick} className="block w-full text-left">
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
