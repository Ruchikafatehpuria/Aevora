import { requireUser } from "@/lib/auth/session";
import { profileCompleteness, timezoneOptions } from "@/lib/profile";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileForm } from "@/components/account/profile-form";
import { Avatar } from "@/components/shell/user-menu";
import { Card } from "@/components/ui/card";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const { percent } = profileCompleteness(user.profile);
  const timezones = timezoneOptions();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Profile" description="Tell Syncly about yourself so every module can work for you." />
      <Card className="mb-6 flex items-center gap-4 p-5">
        <Avatar name={user.name} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold text-ink">{user.name}</p>
          <p className="truncate text-sm text-ink-2">{user.profile?.headline ?? user.email}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold text-primary">{percent}%</p>
          <p className="text-xs text-ink-3">complete</p>
        </div>
      </Card>
      <ProfileForm name={user.name} email={user.email} profile={user.profile} timezones={timezones} />
    </div>
  );
}
