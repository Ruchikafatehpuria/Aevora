"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Fired = { title: string; body: string; href: string };

/**
 * Tells the server the browser's timezone (used until the profile sets one) and checks for due
 * reminders every minute while the tab is visible. Due reminders become in-app notifications, plus a
 * system notification when the user has allowed them.
 */
export function ReminderPoller() {
  const router = useRouter();

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.includes(`syncly_tz=${encodeURIComponent(tz)}`)) {
        document.cookie = `syncly_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch {}

    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/reminders", { method: "POST" });
        if (!res.ok) return;
        const { fired } = (await res.json()) as { fired: Fired[] };
        if (!fired.length) return;
        if ("Notification" in window && Notification.permission === "granted") {
          for (const f of fired) {
            const n = new Notification(f.title, { body: f.body, icon: "/icon-192.png", tag: f.href });
            n.onclick = () => {
              window.focus();
              router.push(f.href);
            };
          }
        }
        router.refresh();
      } catch {}
    };
    const first = setTimeout(check, 3000);
    const timer = setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
