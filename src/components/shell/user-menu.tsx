"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { initials } from "@/lib/utils";
import { useDismiss } from "./use-dismiss";

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-violet-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="ml-1 rounded-full" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={user.name} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-card animate-slide-up">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          {[
            { href: "/profile", label: "My profile", Icon: UserRound },
            { href: "/settings", label: "Settings", Icon: Settings },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={close} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <form action={logout}>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-danger">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
