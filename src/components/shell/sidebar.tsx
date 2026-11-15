"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { activeHref, navigation } from "@/lib/navigation";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed, onToggle, onClose }: { collapsed: boolean; onToggle?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  return (
    <nav className="flex h-full flex-col border-r border-border bg-surface" aria-label="Main">
      <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Link href="/overview" aria-label="Syncly home">
          <Logo collapsed={collapsed} />
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.items.map(({ title, href, icon: Icon, available }) => {
                const active = current === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? title : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                        collapsed && "justify-center px-0",
                        active ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-ink-3 group-hover:text-ink-2")} />
                      {!collapsed && (
                        <>
                          <span className="truncate">{title}</span>
                          {!available && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-border-strong" title="In development" />}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {onToggle && (
        <div className="border-t border-border p-3">
          <button
            onClick={onToggle}
            className={cn("flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-ink-3 hover:bg-surface-2 hover:text-ink", collapsed && "justify-center px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      )}
    </nav>
  );
}
