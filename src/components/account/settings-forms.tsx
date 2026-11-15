"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { Laptop, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { changePassword, deleteAccount, revokeOtherSessions, revokeSession } from "@/lib/actions/account";
import type { FormState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { cn, timeAgo } from "@/lib/utils";

export function AppearanceSetting() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition-colors",
              active ? "border-primary bg-primary-soft font-medium text-primary" : "border-border text-ink-2 hover:border-border-strong",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:max-w-md" noValidate key={state.success}>
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Current password" htmlFor="current" error={e.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" aria-invalid={!!e.current} />
      </Field>
      <Field label="New password" htmlFor="password" error={e.password} hint="At least 8 characters, with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!e.password} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={e.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" aria-invalid={!!e.confirm} />
      </Field>
      <div>
        <Button type="submit" loading={pending}>Update password</Button>
      </div>
    </form>
  );
}

type SessionRow = { id: string; userAgent: string | null; ipAddress: string | null; lastUsedAt: string; current: boolean };

function describeAgent(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return { label: `${browser}${os ? ` on ${os}` : ""}`, mobile: /Mobile|Android|iPhone/.test(ua) };
}

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const [pending, start] = useTransition();
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {sessions.map((s) => {
          const { label, mobile } = describeAgent(s.userAgent);
          const Icon = mobile ? Smartphone : Laptop;
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Icon className="h-5 w-5 text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {label} {s.current && <Badge tone="primary">This device</Badge>}
                </p>
                <p className="text-xs text-ink-3">
                  {s.ipAddress ?? "Unknown IP"} · active {timeAgo(new Date(s.lastUsedAt))}
                </p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => revokeSession(s.id))}>
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <Button variant="secondary" size="sm" className="mt-3" loading={pending} onClick={() => start(() => revokeOtherSessions())}>
          Sign out of all other sessions
        </Button>
      )}
    </div>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});
  const [open, setOpen] = useState(false);
  const e = state.fieldErrors ?? {};
  if (!open)
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete account
      </Button>
    );
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-danger/40 bg-danger-soft/40 p-4 sm:max-w-md" noValidate>
      <p className="text-sm text-ink">This permanently deletes your account, profile and all data. This can&apos;t be undone.</p>
      <Field label="Password" htmlFor="del-password" error={e.password}>
        <Input id="del-password" name="password" type="password" autoComplete="current-password" aria-invalid={!!e.password} />
      </Field>
      <Field label='Type "DELETE" to confirm' htmlFor="del-confirm" error={e.confirm}>
        <Input id="del-confirm" name="confirm" autoComplete="off" aria-invalid={!!e.confirm} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" loading={pending}>Permanently delete</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
