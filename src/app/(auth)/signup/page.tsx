import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SignupForm } from "@/components/auth/forms";
import { AuthHeading } from "@/components/auth/heading";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/overview");
  return (
    <>
      <AuthHeading
        title="Create your workspace"
        subtitle={
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </>
        }
      />
      <SignupForm />
    </>
  );
}
