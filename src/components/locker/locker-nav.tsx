"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/locker", label: "Overview" },
  { href: "/locker/upload", label: "Upload Centre" },
  { href: "/locker/scan", label: "Scan" },
  { href: "/locker/inbox", label: "Smart Inbox" },
  { href: "/locker/files", label: "Files" },
  { href: "/locker/chats", label: "Chat archives" },
  { href: "/locker/settings", label: "Organization" },
];

export function LockerNav({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-8 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0" aria-label="Locker">
      <ul className="flex gap-1">
        {TABS.map((t) => {
          const active = t.href === "/locker" ? pathname === "/locker" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active ? "border-primary font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
                {t.href === "/locker/inbox" && inboxCount > 0 && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent">{inboxCount}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
