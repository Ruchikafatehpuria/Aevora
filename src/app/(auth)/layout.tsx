import Link from "next/link";
import { CalendarClock, GraduationCap, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12 animate-slide-up">{children}</main>
        <p className="text-xs text-ink-3">© {new Date().getFullYear()} Syncly</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-[#0b1a2e] lg:block" aria-hidden>
        <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-96 w-96 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <p className="font-display text-4xl font-bold leading-tight tracking-tight">
            Your entire world.
            <br />
            <span className="bg-gradient-to-r from-teal-300 to-violet-300 bg-clip-text text-transparent">One intelligent workspace.</span>
          </p>
          <p className="mt-4 max-w-md text-slate-300">Plan your days, learn faster, build your career and keep every file in one place, with an AI assistant that knows your context.</p>
          <ul className="mt-10 space-y-3">
            {[
              { Icon: CalendarClock, t: "One scheduler for classes, work and life" },
              { Icon: GraduationCap, t: "AI learning paths and study tools" },
              { Icon: Sparkles, t: "An assistant that plans with you" },
            ].map(({ Icon, t }) => (
              <li key={t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <Icon className="h-4 w-4 text-teal-300" />
                <span className="text-sm text-slate-200">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
