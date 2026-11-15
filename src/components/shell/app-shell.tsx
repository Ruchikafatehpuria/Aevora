"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { NotificationBell, type NotificationItem } from "./notifications";
import { ThemeToggle } from "./theme-toggle";
import { ReminderPoller } from "./reminder-poller";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "syncly:sidebar-collapsed";

export function AppShell({
  user,
  notifications,
  children,
}: {
  user: { name: string; email: string };
  notifications: NotificationItem[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <ReminderPoller />
      {/* Desktop sidebar */}
      <div className={cn("sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block", collapsed ? "w-[68px]" : "w-64")}>
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-up shadow-xl">
            <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-border-strong"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell items={notifications} />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 animate-fade-in">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
