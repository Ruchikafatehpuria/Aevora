import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))}
    >
      {children}
    </AppShell>
  );
}
