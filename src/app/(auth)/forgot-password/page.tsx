import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { AuthHeading } from "@/components/auth/heading";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password" subtitle="Enter your account email and we'll send you a link to choose a new password." />
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-ink-2">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
