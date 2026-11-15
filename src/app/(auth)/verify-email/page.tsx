import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { devVerifyNow, logout } from "@/lib/auth/actions";
import { devEmailShortcuts } from "@/lib/email";
import { Button } from "@/components/ui/button";
import { ResendVerificationForm } from "@/components/auth/forms";
import { AuthHeading } from "@/components/auth/heading";
import { Alert } from "@/components/ui/feedback";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/overview");
  const { status } = await searchParams;
  return (
    <>
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft">
        <MailCheck className="h-6 w-6 text-primary" />
      </div>
      <AuthHeading
        title="Check your inbox"
        subtitle={
          <>
            We sent a verification link to <span className="font-medium text-ink">{user.email}</span>. Open it to activate your workspace.
          </>
        }
      />
      {status === "invalid" && (
        <Alert tone="error" className="mb-4">
          That verification link is invalid or has expired. Send a new one below.
        </Alert>
      )}
      {devEmailShortcuts() ? (
        <div className="space-y-3">
          <Alert tone="info">Email sending isn&apos;t set up yet, so the verification email can&apos;t reach your inbox. On this development server you can verify directly.</Alert>
          <form action={devVerifyNow}>
            <Button type="submit" size="lg" className="w-full">Verify my email now</Button>
          </form>
        </div>
      ) : (
        <ResendVerificationForm />
      )}
      <form action={logout} className="mt-6 text-center">
        <button className="text-sm text-ink-2 hover:text-ink">Use a different account</button>
      </form>
    </>
  );
}
