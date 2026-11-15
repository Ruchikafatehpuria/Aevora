import { cookies } from "next/headers";
import { requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/crypto";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AppearanceSetting, ChangePasswordForm, DeleteAccountForm, SessionsList } from "@/components/account/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const currentHash = hashToken((await cookies()).get(SESSION_COOKIE)?.value ?? "");
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Manage appearance, security and your account." />
      <Card>
        <CardHeader title="Appearance" description="Choose how Syncly looks on this device." />
        <div className="p-5">
          <AppearanceSetting />
        </div>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <div className="p-5">
          <ChangePasswordForm />
        </div>
      </Card>
      <Card>
        <CardHeader title="Active sessions" description="Devices currently signed in to your account." />
        <div className="p-5">
          <SessionsList
            sessions={sessions.map((s) => ({
              id: s.id,
              userAgent: s.userAgent,
              ipAddress: s.ipAddress,
              lastUsedAt: s.lastUsedAt.toISOString(),
              current: s.tokenHash === currentHash,
            }))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Delete account" description="Permanently remove your account and all of its data." />
        <div className="p-5">
          <DeleteAccountForm />
        </div>
      </Card>
    </div>
  );
}
