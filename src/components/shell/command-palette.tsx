"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Monitor } from "lucide-react";
import { navigation } from "@/lib/navigation";
import { logout } from "@/lib/auth/actions";

// Every query word must appear in the item; earlier and word-start matches rank higher.
function filter(value: string, search: string, keywords?: string[]) {
  const hay = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let score = 1;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i === -1) return 0;
    if (i === 0) score += 2;
    else if (/\s/.test(hay[i - 1]!)) score += 1;
  }
  return score;
}

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-primary-soft data-[selected=true]:text-ink";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      filter={filter}
      overlayClassName="fixed inset-0 z-50 bg-black/40 animate-fade-in"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-slide-up"
    >
      <Command.Input placeholder="Search pages and actions…" className="h-14 w-full border-b border-border bg-transparent px-5 text-[15px] text-ink outline-none placeholder:text-ink-3" />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-10 text-center text-sm text-ink-3">No results found.</Command.Empty>
        {navigation.map((group) => (
          <Command.Group key={group.label} heading={group.label} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-3">
            {group.items.map(({ title, href, icon: Icon, description }) => (
              <Command.Item key={href} value={`${title} ${description}`} onSelect={() => run(() => router.push(href))} className={itemCls}>
                <Icon className="h-4 w-4 text-ink-3" />
                <span className="text-ink">{title}</span>
                <span className="ml-auto truncate text-xs text-ink-3">{description}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-3">
          <Command.Item onSelect={() => run(() => setTheme("light"))} className={itemCls}>
            <Sun className="h-4 w-4 text-ink-3" /> Switch to light mode
          </Command.Item>
          <Command.Item onSelect={() => run(() => setTheme("dark"))} className={itemCls}>
            <Moon className="h-4 w-4 text-ink-3" /> Switch to dark mode
          </Command.Item>
          <Command.Item onSelect={() => run(() => setTheme("system"))} className={itemCls}>
            <Monitor className="h-4 w-4 text-ink-3" /> Use system theme
          </Command.Item>
          <Command.Item onSelect={() => run(() => void logout())} className={itemCls}>
            <LogOut className="h-4 w-4 text-ink-3" /> Log out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
