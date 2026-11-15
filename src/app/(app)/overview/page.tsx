import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, Circle, FolderClosed } from "lucide-react";
import { FileIcon } from "@/components/locker/file-icon";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { navigation } from "@/lib/navigation";
import { profileCompleteness } from "@/lib/profile";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { TodayCard } from "@/components/tasks/today-card";
import { userTimezone } from "@/lib/tasks/server";
import { eventDTO, projectDTO, sortTasks, taskDTO } from "@/lib/tasks/queries";
import { addDays, todayIn, ymdToDate, zonedToUtc } from "@/lib/time";

export const metadata = { title: "Overview" };

function greeting(timezone?: string | null) {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone ?? undefined }).format(new Date()));
  } catch {
    return "Welcome back";
  }
  if (!timezone) return "Welcome back";
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const tz = await userTimezone(user.profile?.timezone);
  const today = todayIn(tz);
  const dayStart = zonedToUtc(today, "00:00", tz), dayEnd = zonedToUtc(addDays(today, 1), "00:00", tz);
  const [notifications, recentFiles, inboxCount, todayTasks, todayEvents, projects, upcoming] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.storedFile.findMany({ where: { userId: user.id, deletedAt: null, status: { in: ["READY", "PROCESSING"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.storedFile.count({ where: { userId: user.id, deletedAt: null, archivedAt: null, OR: [{ organization: { in: ["INBOX", "SUGGESTED"] } }, { status: "DUPLICATE_PENDING" }] } }),
    db.task.findMany({ where: { userId: user.id, status: { not: "DONE" }, dueDate: { lte: ymdToDate(today) } }, take: 12 }),
    db.calendarEvent.findMany({
      where: {
        userId: user.id,
        OR: [
          { allDay: false, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
          { allDay: true, startAt: { lte: ymdToDate(today) }, endAt: { gte: ymdToDate(today) } },
        ],
      },
      orderBy: { startAt: "asc" },
      take: 10,
    }),
    db.project.findMany({ where: { userId: user.id, archivedAt: null } }),
    db.task.count({ where: { userId: user.id, status: { not: "DONE" }, dueDate: { gt: ymdToDate(today), lte: ymdToDate(addDays(today, 7)) } } }),
  ]);
  const { percent, missing } = profileCompleteness(user.profile);
  const firstName = user.name.split(" ")[0];
  const modules = navigation.flatMap((g) => g.items).filter((i) => !["/overview", "/profile", "/settings"].includes(i.href));

  return (
    <>
      <PageHeader title={`${greeting(tz)}, ${firstName}`} description="Here's where your workspace stands today." />

      {welcome && (
        <Alert tone="success" className="mb-6">
          <span className="font-medium">Welcome to Syncly! Your account is ready.</span>{" "}
          Start by completing your profile so Syncly can personalise your workspace.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <TodayCard
          today={today}
          tasks={todayTasks.map((t) => taskDTO(t, tz)).sort(sortTasks)}
          events={todayEvents.map((e) => eventDTO(e, tz)).sort((a, b) => (a.allDay === b.allDay ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.allDay ? -1 : 1))}
          projects={projects.map(projectDTO)}
          upcoming={upcoming}
        />
        <Card>
          <CardHeader title="Recent activity" />
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="Nothing yet" description="Account activity and updates will show up here." className="py-10" />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-3">{timeAgo(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className={percent === 100 ? "hidden" : "lg:col-span-3"}>
          <CardHeader
            title="Complete your profile"
            description="Your profile shapes recommendations across learning, career and scheduling."
            action={<Link href="/profile" className={buttonClass("secondary", "sm")}>Edit profile</Link>}
          />
          <div className="px-5 py-5">
            <div className="flex items-center gap-4">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="w-12 text-right font-display text-sm font-semibold text-ink">{percent}%</span>
            </div>
            {missing.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Your profile is complete.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {missing.slice(0, 6).map((m) => (
                  <li key={m} className="flex items-center gap-2 text-sm text-ink-2">
                    <Circle className="h-3.5 w-3.5 text-ink-3" /> {m}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent files"
          description={inboxCount ? `${inboxCount} item${inboxCount === 1 ? "" : "s"} waiting in your Everything Inbox.` : undefined}
          action={<Link href={inboxCount ? "/locker/inbox" : "/locker/upload"} className={buttonClass("secondary", "sm")}>{inboxCount ? "Open Inbox" : "Upload"}</Link>}
        />
        {recentFiles.length === 0 ? (
          <EmptyState icon={FolderClosed} title="No files yet" description="Upload files or import a WhatsApp chat to start your locker." className="py-10" />
        ) : (
          <ul className="divide-y divide-border">
            {recentFiles.map((f) => (
              <li key={f.id}>
                <Link href={`/locker/files/${f.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60">
                  <FileIcon extension={f.extension} className="h-8 w-8" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.displayName}</span>
                  <span className="shrink-0 text-xs text-ink-3">{timeAgo(f.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-ink">Your workspace</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.filter((m) => m.available).map(({ title, href, icon: Icon, description }) => (
            <Link key={href} href={href} className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                <Icon className="h-[18px] w-[18px] text-primary" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {title}
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block text-sm text-ink-2">{description}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-3">
          Coming next: {modules.filter((m) => !m.available).map((m) => m.title).join(", ")}.
        </p>
      </section>
    </>
  );
}
