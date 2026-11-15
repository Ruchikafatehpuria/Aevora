import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/forms";
import { AuthHeading } from "@/components/auth/heading";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; verified?: string }> }) {
  if (await getCurrentUser()) redirect("/overview");
  const { next, verified } = await searchParams;
  return (
    <>
      <AuthHeading
        title="Welcome back"
        subtitle={
          <>
            New to Syncly?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      />
      <LoginForm next={next} notice={verified ? "Email verified. Log in to continue." : undefined} />
    </>
  );
}
