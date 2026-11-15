import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { LockerNav } from "@/components/locker/locker-nav";

export default async function LockerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const inboxCount = await db.storedFile.count({
    where: { userId: user.id, deletedAt: null, archivedAt: null, OR: [{ organization: { in: ["INBOX", "SUGGESTED"] } }, { status: "DUPLICATE_PENDING" }] },
  });
  return (
    <>
      <PageHeader title="My Files" description="Your digital locker: every file you import, organized in one private place." />
      <LockerNav inboxCount={inboxCount} />
      {children}
    </>
  );
}
