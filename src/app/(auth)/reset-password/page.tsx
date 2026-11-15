import Link from "next/link";
import { peekToken } from "@/lib/auth/tokens";
import { ResetPasswordForm } from "@/components/auth/forms";
import { AuthHeading } from "@/components/auth/heading";
import { Alert } from "@/components/ui/feedback";

export const metadata = { title: "Set new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekToken(token, "PASSWORD_RESET") : false;
  return (
    <>
      <AuthHeading title="Choose a new password" />
      {valid && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="error">
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      )}
    </>
  );
}
