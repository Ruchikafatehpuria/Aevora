import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { navigation } from "@/lib/navigation";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";

export default async function Home() {
  if (await getCurrentUser()) redirect("/overview");
  const modules = navigation.flatMap((g) => g.items).filter((i) => !["/overview", "/profile", "/settings"].includes(i.href));
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>Log in</Link>
          <Link href="/signup" className={buttonClass("primary", "sm")}>Get started</Link>
        </nav>
      </header>
      <section className="relative overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-teal-400/20 via-sky-400/10 to-violet-400/20 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
            Your entire world.
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">One intelligent workspace.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            Syncly brings your schedule, learning, documents, research and career into one place, with an AI assistant that understands your context.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Link href="/signup" className={buttonClass("primary", "lg")}>Create your workspace</Link>
            <Link href="/login" className={buttonClass("secondary", "lg")}>Log in</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(({ title, icon: Icon, description, href, available }) => (
            <div key={href} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <Icon className="h-5 w-5 text-primary" />
                {!available && <span className="text-[11px] font-medium text-ink-3">Coming soon</span>}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
